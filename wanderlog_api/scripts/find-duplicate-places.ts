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
  category?: string;
  i18n?: any;
  created_at: string;
}

interface DuplicateGroup {
  criteria: string;
  places: Place[];
}

// 计算两个坐标点之间的距离（米）
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // 地球半径（米）
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

// 标准化名称（去除空格、标点、转小写）
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fa5]/g, '')
    .replace(/\s+/g, '');
}

async function findDuplicatePlaces() {
  console.log('🔍 开始查找重复地点...\n');

  // 获取所有地点
  const { data: places, error } = await supabase
    .from('places')
    .select('id, name, latitude, longitude, city, country, source, source_detail, category, i18n, created_at')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('❌ 获取地点数据失败:', error);
    return;
  }

  if (!places || places.length === 0) {
    console.log('⚠️  数据库中没有地点数据');
    return;
  }

  console.log(`📊 总共 ${places.length} 个地点\n`);

  const duplicateGroups: DuplicateGroup[] = [];
  const processedIds = new Set<string>();

  // 策略1: 完全相同的名称 + 城市 + 国家
  console.log('🔎 策略1: 检查相同名称 + 城市 + 国家...');
  const nameLocationMap = new Map<string, Place[]>();
  
  for (const place of places) {
    if (processedIds.has(place.id)) continue;
    
    const key = `${normalizeName(place.name)}_${place.city || ''}_${place.country || ''}`;
    if (!nameLocationMap.has(key)) {
      nameLocationMap.set(key, []);
    }
    nameLocationMap.get(key)!.push(place);
  }

  for (const [key, group] of nameLocationMap.entries()) {
    if (group.length > 1) {
      duplicateGroups.push({
        criteria: '相同名称 + 城市 + 国家',
        places: group
      });
      group.forEach(p => processedIds.add(p.id));
    }
  }

  // 策略2: 相同经纬度（精确到小数点后4位，约11米）
  console.log('🔎 策略2: 检查相同经纬度...');
  const coordMap = new Map<string, Place[]>();
  
  for (const place of places) {
    if (processedIds.has(place.id)) continue;
    
    const lat = place.latitude.toFixed(4);
    const lon = place.longitude.toFixed(4);
    const key = `${lat}_${lon}`;
    
    if (!coordMap.has(key)) {
      coordMap.set(key, []);
    }
    coordMap.get(key)!.push(place);
  }

  for (const [key, group] of coordMap.entries()) {
    if (group.length > 1) {
      duplicateGroups.push({
        criteria: '相同经纬度（±11米）',
        places: group
      });
      group.forEach(p => processedIds.add(p.id));
    }
  }

  // 策略3: 相似名称 + 非常接近的坐标（50米内）
  console.log('🔎 策略3: 检查相似名称 + 接近坐标（50米内）...');
  const remainingPlaces = places.filter(p => !processedIds.has(p.id));
  
  for (let i = 0; i < remainingPlaces.length; i++) {
    const place1 = remainingPlaces[i];
    if (processedIds.has(place1.id)) continue;
    
    const similarGroup: Place[] = [place1];
    
    for (let j = i + 1; j < remainingPlaces.length; j++) {
      const place2 = remainingPlaces[j];
      if (processedIds.has(place2.id)) continue;
      
      // 检查名称相似度
      const name1 = normalizeName(place1.name);
      const name2 = normalizeName(place2.name);
      
      const nameMatch = name1 === name2;
      
      if (nameMatch) {
        // 检查距离
        const distance = calculateDistance(
          place1.latitude,
          place1.longitude,
          place2.latitude,
          place2.longitude
        );
        
        if (distance <= 50) {
          similarGroup.push(place2);
        }
      }
    }
    
    if (similarGroup.length > 1) {
      duplicateGroups.push({
        criteria: '相似名称 + 50米内',
        places: similarGroup
      });
      similarGroup.forEach(p => processedIds.add(p.id));
    }
  }

  // 输出结果
  console.log('\n' + '='.repeat(80));
  console.log('📋 重复地点检测结果');
  console.log('='.repeat(80) + '\n');

  if (duplicateGroups.length === 0) {
    console.log('✅ 未发现重复地点');
    return;
  }

  console.log(`⚠️  发现 ${duplicateGroups.length} 组重复地点\n`);

  duplicateGroups.forEach((group, index) => {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`组 ${index + 1}: ${group.criteria}`);
    console.log(`${'─'.repeat(80)}`);
    
    group.places.forEach((place, i) => {
      console.log(`\n  [${i + 1}] ${place.name}`);
      console.log(`      ID: ${place.id}`);
      console.log(`      位置: ${place.city || '未知'}, ${place.country || '未知'}`);
      console.log(`      坐标: ${place.latitude.toFixed(6)}, ${place.longitude.toFixed(6)}`);
      console.log(`      来源: ${place.source || '未知'}`);
      if (place.source_detail) {
        console.log(`      来源详情: ${place.source_detail}`);
      }
      console.log(`      创建时间: ${new Date(place.created_at).toLocaleString('zh-CN')}`);
      
      // 计算与组内其他地点的距离
      if (i > 0) {
        const distance = calculateDistance(
          group.places[0].latitude,
          group.places[0].longitude,
          place.latitude,
          place.longitude
        );
        console.log(`      距离第一个地点: ${distance.toFixed(2)}米`);
      }
    });
  });

  // 统计信息
  console.log('\n' + '='.repeat(80));
  console.log('📊 统计信息');
  console.log('='.repeat(80));
  console.log(`总地点数: ${places.length}`);
  console.log(`重复组数: ${duplicateGroups.length}`);
  console.log(`涉及重复的地点数: ${processedIds.size}`);
  console.log(`可能需要清理的地点数: ${processedIds.size - duplicateGroups.length}`);
  
  // 按来源统计
  const sourceStats = new Map<string, number>();
  duplicateGroups.forEach(group => {
    group.places.forEach(place => {
      const source = place.source || 'unknown';
      sourceStats.set(source, (sourceStats.get(source) || 0) + 1);
    });
  });
  
  console.log('\n按来源统计重复地点:');
  for (const [source, count] of sourceStats.entries()) {
    console.log(`  ${source}: ${count}`);
  }

  console.log('\n');
}

findDuplicatePlaces().catch(console.error);
