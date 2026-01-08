import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface Place {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  city?: string;
  country?: string;
  source?: string;
  source_detail?: string;
  google_place_id?: string;
  category?: string;
  website?: string;
  created_at: string;
}

// 计算两个坐标点之间的距离（米）
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// 标准化名称
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fa5]/g, '')
    .replace(/\s+/g, '');
}

// 判断是否应该保留（优先级评分）
function calculatePriority(place: Place): number {
  let score = 0;
  
  // google_place_id 是最重要的
  if (place.google_place_id) score += 100;
  
  // 来源优先级
  if (place.source === 'google_maps') score += 50;
  if (place.source === 'apify_google_places') score += 45;
  if (place.source === 'google_maps_link') score += 40;
  
  // 有网址加分
  if (place.website) score += 20;
  
  // 有分类加分
  if (place.category) score += 10;
  
  // 有详细来源信息加分
  if (place.source_detail) score += 5;
  
  // 创建时间越早越好（轻微加分）
  const daysOld = (Date.now() - new Date(place.created_at).getTime()) / (1000 * 60 * 60 * 24);
  score += Math.min(daysOld * 0.1, 10);
  
  return score;
}

async function cleanupDuplicates() {
  console.log('🧹 开始清理重复地点...\n');

  // 获取所有地点（分页获取以避免 Supabase 1000 条限制）
  console.log('📥 正在获取所有地点数据...');
  let allPlaces: Place[] = [];
  let page = 0;
  const pageSize = 1000;
  
  while (true) {
    const { data: places, error } = await supabase
      .from('places')
      .select('id, name, latitude, longitude, city, country, source, source_detail, google_place_id, category, website, created_at')
      .order('created_at', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('❌ 获取地点数据失败:', error);
      return;
    }

    if (!places || places.length === 0) {
      break;
    }

    allPlaces = allPlaces.concat(places);
    console.log(`   已获取 ${allPlaces.length} 个地点...`);
    
    if (places.length < pageSize) {
      break;
    }
    
    page++;
  }

  const places = allPlaces;

  if (places.length === 0) {
    console.log('⚠️  数据库中没有地点数据');
    return;
  }

  console.log(`📊 总共 ${places.length} 个地点\n`);

  const toDelete: string[] = [];
  const processedIds = new Set<string>();

  // 规则1: 清理完全相同的地点（相同名称+城市+国家+坐标在10米内）
  console.log('🔍 规则1: 检查完全相同的地点（相同名称+位置+坐标10米内）...');
  const exactDuplicateMap = new Map<string, Place[]>();
  
  for (const place of places) {
    if (processedIds.has(place.id)) continue;
    
    const key = `${normalizeName(place.name)}_${place.city || ''}_${place.country || ''}`;
    if (!exactDuplicateMap.has(key)) {
      exactDuplicateMap.set(key, []);
    }
    exactDuplicateMap.get(key)!.push(place);
  }

  for (const [_key, group] of exactDuplicateMap.entries()) {
    if (group.length <= 1) continue;
    
    // 检查是否都在10米内
    let allClose = true;
    for (let i = 1; i < group.length; i++) {
      const distance = calculateDistance(
        group[0].latitude,
        group[0].longitude,
        group[i].latitude,
        group[i].longitude
      );
      if (distance > 10) {
        allClose = false;
        break;
      }
    }
    
    if (!allClose) continue;
    
    // 按优先级排序，保留最高优先级的
    group.sort((a, b) => calculatePriority(b) - calculatePriority(a));
    
    const toKeep = group[0];
    const toRemove = group.slice(1);
    
    console.log(`\n  ✓ 发现完全重复组: ${toKeep.name} (${group.length}个)`);
    console.log(`    保留: ${toKeep.id} (优先级: ${calculatePriority(toKeep).toFixed(1)}, 来源: ${toKeep.source}, google_place_id: ${toKeep.google_place_id || '无'})`);
    
    for (const place of toRemove) {
      console.log(`    删除: ${place.id} (优先级: ${calculatePriority(place).toFixed(1)}, 来源: ${place.source}, google_place_id: ${place.google_place_id || '无'})`);
      toDelete.push(place.id);
      processedIds.add(place.id);
    }
    processedIds.add(toKeep.id);
  }

  // 规则2: 坐标为 (0,0) 的数据 - 不删除（保留名称和位置信息，后续用 Apify 补充坐标）
  console.log('\n🔍 规则2: 检查坐标为 (0,0) 的数据...');
  const invalidCoords = places.filter(p => 
    !processedIds.has(p.id) && 
    p.latitude === 0 && 
    p.longitude === 0
  );
  
  if (invalidCoords.length > 0) {
    console.log(`  ℹ️  保留 ${invalidCoords.length} 个坐标为 (0,0) 的地点（有名称和位置信息，后续可用 Apify 补充坐标）`);
    for (const place of invalidCoords.slice(0, 3)) {
      console.log(`      - ${place.name} (${place.city}, ${place.country})`);
    }
    if (invalidCoords.length > 3) {
      console.log(`      ... 还有 ${invalidCoords.length - 3} 个`);
    }
  }

  // 规则3: 同名但距离较远的地点 - 不删除（可能是连锁店）
  console.log('\n🔍 规则3: 检查同名但距离较远的地点...');
  const sameName = new Map<string, Place[]>();
  
  for (const place of places) {
    if (processedIds.has(place.id)) continue;
    const key = `${normalizeName(place.name)}_${place.city || ''}_${place.country || ''}`;
    if (!sameName.has(key)) {
      sameName.set(key, []);
    }
    sameName.get(key)!.push(place);
  }

  let chainStoreCount = 0;
  for (const [_key, group] of sameName.entries()) {
    if (group.length > 1) {
      // 检查是否有距离较远的
      let hasFarDistance = false;
      for (let i = 1; i < group.length; i++) {
        const distance = calculateDistance(
          group[0].latitude,
          group[0].longitude,
          group[i].latitude,
          group[i].longitude
        );
        if (distance > 50) {
          hasFarDistance = true;
          break;
        }
      }
      
      if (hasFarDistance) {
        chainStoreCount++;
        console.log(`  ℹ️  保留连锁店/多分店: ${group[0].name} (${group.length}个位置)`);
      }
    }
  }
  console.log(`  总计保留 ${chainStoreCount} 组连锁店/多分店数据`);

  // 规则4: 非常接近但不同名的地点 - 不删除（可能是不同类型的地点）
  console.log('\n🔍 规则4: 检查非常接近但不同名的地点...');
  const remainingPlaces = places.filter(p => !processedIds.has(p.id));
  let nearbyDifferentCount = 0;
  
  for (let i = 0; i < remainingPlaces.length; i++) {
    const place1 = remainingPlaces[i];
    for (let j = i + 1; j < remainingPlaces.length; j++) {
      const place2 = remainingPlaces[j];
      
      const distance = calculateDistance(
        place1.latitude,
        place1.longitude,
        place2.latitude,
        place2.longitude
      );
      
      if (distance <= 10 && normalizeName(place1.name) !== normalizeName(place2.name)) {
        nearbyDifferentCount++;
        if (nearbyDifferentCount <= 3) { // 只显示前3个例子
          console.log(`  ℹ️  保留邻近不同地点: ${place1.name} 和 ${place2.name} (距离 ${distance.toFixed(2)}米)`);
        }
      }
    }
  }
  if (nearbyDifferentCount > 3) {
    console.log(`  ... 还有 ${nearbyDifferentCount - 3} 组类似情况`);
  }

  // 执行删除
  console.log('\n' + '='.repeat(80));
  console.log('📋 清理汇总');
  console.log('='.repeat(80));
  console.log(`总地点数: ${places.length}`);
  console.log(`需要删除: ${toDelete.length}`);
  console.log(`保留地点: ${places.length - toDelete.length}`);

  if (toDelete.length === 0) {
    console.log('\n✅ 没有需要清理的重复地点');
    return;
  }

  console.log('\n⚠️  准备删除以下地点:');
  console.log(`   共 ${toDelete.length} 个地点`);
  
  // 批量删除
  console.log('\n🗑️  开始批量删除...');
  const batchSize = 100;
  let deletedCount = 0;
  
  for (let i = 0; i < toDelete.length; i += batchSize) {
    const batch = toDelete.slice(i, i + batchSize);
    const { error: deleteError } = await supabase
      .from('places')
      .delete()
      .in('id', batch);
    
    if (deleteError) {
      console.error(`❌ 删除批次 ${i / batchSize + 1} 失败:`, deleteError);
    } else {
      deletedCount += batch.length;
      console.log(`  ✓ 已删除 ${deletedCount}/${toDelete.length} 个地点`);
    }
  }

  console.log('\n✅ 清理完成!');
  console.log(`   成功删除: ${deletedCount} 个重复地点`);
  console.log(`   剩余地点: ${places.length - deletedCount} 个`);
}

cleanupDuplicates().catch(console.error);
