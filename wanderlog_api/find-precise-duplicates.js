const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 计算两点之间的距离（米）- Haversine 公式
function calculateDistance(lat1, lon1, lat2, lon2) {
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

// 渠道优先级（数字越小优先级越高）
const SOURCE_PRIORITY = {
  'google_maps_link': 1,
  'google_maps': 2,
  'apify_google_places': 3,
  'mocation': 4,
  'wikidata': 5,
  'ai_search_web': 6,
  'ai_search': 7,
  'mock_data': 8,
  'user_import': 9,
};

function getSourcePriority(source) {
  return SOURCE_PRIORITY[source] || 99;
}

// 标准化名称用于比较
function normalizeName(name) {
  return (name || '').toLowerCase().trim()
    .replace(/[''`]/g, "'")
    .replace(/\s+/g, ' ');
}

async function findPreciseDuplicates() {
  console.log('🔍 正在精准查找重复地点（考虑经纬度距离）...\n');
  
  // 分批获取所有地点
  let allPlaces = [];
  let offset = 0;
  const limit = 1000;
  
  while (true) {
    const { data: batch, error } = await supabase
      .from('places')
      .select(`
        id, name, city, country, latitude, longitude, 
        rating, rating_count, source, cover_image, description, 
        address, opening_hours, phone_number, website,
        category, category_slug, tags, ai_tags,
        images, google_place_id, created_at
      `)
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: true });
      
    if (error) {
      console.error('错误:', error);
      return;
    }
    
    if (!batch || batch.length === 0) break;
    
    allPlaces = allPlaces.concat(batch);
    offset += limit;
    
    if (batch.length < limit) break;
  }
  
  console.log('📊 总地点数:', allPlaces.length);
  
  // 按 名称+城市+国家 初步分组
  const groupMap = new Map();
  for (const place of allPlaces) {
    const key = normalizeName(place.name) + '|' + 
                (place.city || '').toLowerCase().trim() + '|' + 
                (place.country || '').toLowerCase().trim();
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key).push(place);
  }
  
  const duplicates = [];
  const DISTANCE_THRESHOLD = 100; // 100米以内才算同一地点
  
  // 对每个初步分组进行精确距离校验
  for (const [key, places] of groupMap.entries()) {
    if (places.length < 2) continue;
    
    // 按经纬度再细分
    const subGroups = [];
    const assigned = new Set();
    
    for (let i = 0; i < places.length; i++) {
      if (assigned.has(i)) continue;
      
      const group = [places[i]];
      assigned.add(i);
      
      for (let j = i + 1; j < places.length; j++) {
        if (assigned.has(j)) continue;
        
        const p1 = places[i];
        const p2 = places[j];
        
        // 检查是否有有效坐标
        if (!p1.latitude || !p1.longitude || !p2.latitude || !p2.longitude) {
          // 如果没有坐标，检查地址是否相似
          if (p1.address && p2.address && 
              p1.address.toLowerCase().trim() === p2.address.toLowerCase().trim()) {
            group.push(p2);
            assigned.add(j);
          }
          continue;
        }
        
        const distance = calculateDistance(
          p1.latitude, p1.longitude,
          p2.latitude, p2.longitude
        );
        
        if (distance <= DISTANCE_THRESHOLD) {
          group.push(p2);
          assigned.add(j);
        }
      }
      
      if (group.length > 1) {
        subGroups.push(group);
      }
    }
    
    // 添加到重复列表
    for (const group of subGroups) {
      duplicates.push({
        key,
        places: group,
        avgDistance: calculateAvgDistance(group)
      });
    }
  }
  
  console.log('\n⚠️  发现 ' + duplicates.length + ' 组真正的重复地点（经纬度校验后）\n');
  
  // 按重复数量排序
  duplicates.sort((a, b) => b.places.length - a.places.length);
  
  // 显示详细信息
  const showCount = Math.min(duplicates.length, 30);
  duplicates.slice(0, showCount).forEach((dup, i) => {
    console.log('────────────────────────────────────────');
    const [name, city, country] = dup.key.split('|');
    console.log(`组 ${i+1}: ${name} (${city}, ${country}) - ${dup.places.length}个重复`);
    console.log(`       平均距离: ${dup.avgDistance.toFixed(1)}米`);
    
    // 按渠道优先级排序显示
    const sorted = [...dup.places].sort((a, b) => 
      getSourcePriority(a.source) - getSourcePriority(b.source)
    );
    
    sorted.forEach((p, j) => {
      const hasRating = p.rating !== null && p.rating !== undefined;
      const hasImage = !!p.cover_image;
      const hasImages = p.images && Array.isArray(p.images) && p.images.length > 0;
      const hasDesc = !!p.description;
      const priority = getSourcePriority(p.source);
      
      console.log(`  [${j+1}] ${priority === Math.min(...sorted.map(s => getSourcePriority(s.source))) ? '✓' : ' '} ID: ${p.id.substring(0,8)}...`);
      console.log(`      来源: ${p.source || '未知'} (优先级: ${priority})`);
      console.log(`      坐标: ${p.latitude?.toFixed(5)}, ${p.longitude?.toFixed(5)}`);
      console.log(`      评分: ${hasRating ? p.rating + ' (' + p.rating_count + ')' : '无'}`);
      console.log(`      封面: ${hasImage ? '有' : '无'} | 图片集: ${hasImages ? p.images.length + '张' : '无'} | 描述: ${hasDesc ? '有' : '无'}`);
      if (p.address) console.log(`      地址: ${p.address.substring(0, 50)}...`);
    });
  });
  
  if (duplicates.length > showCount) {
    console.log('\n... 还有 ' + (duplicates.length - showCount) + ' 组未显示');
  }
  
  // 生成汇总统计
  let totalDupPlaces = 0;
  let groupsWith2 = 0, groupsWith3 = 0, groupsWith4plus = 0;
  duplicates.forEach(d => {
    totalDupPlaces += d.places.length;
    if (d.places.length === 2) groupsWith2++;
    else if (d.places.length === 3) groupsWith3++;
    else groupsWith4plus++;
  });
  
  console.log('\n========================================');
  console.log('📊 精准汇总（100米距离阈值）');
  console.log('========================================');
  console.log('总地点数: ' + allPlaces.length);
  console.log('真正重复组数: ' + duplicates.length);
  console.log('  - 2个重复: ' + groupsWith2 + ' 组');
  console.log('  - 3个重复: ' + groupsWith3 + ' 组');
  console.log('  - 4个及以上: ' + groupsWith4plus + ' 组');
  console.log('涉及重复的地点数: ' + totalDupPlaces);
  console.log('可删除的重复项: ' + (totalDupPlaces - duplicates.length));
  
  // 分析合并后的字段补全情况
  console.log('\n========================================');
  console.log('📋 合并预览（字段并集 + 渠道优先级）');
  console.log('========================================');
  
  let canFillRating = 0, canFillImage = 0, canFillDesc = 0, canFillImages = 0;
  
  for (const dup of duplicates) {
    const merged = simulateMerge(dup.places);
    const best = dup.places.reduce((a, b) => 
      getSourcePriority(a.source) < getSourcePriority(b.source) ? a : b
    );
    
    if (!best.rating && merged.rating) canFillRating++;
    if (!best.cover_image && merged.cover_image) canFillImage++;
    if (!best.description && merged.description) canFillDesc++;
    if ((!best.images || best.images.length === 0) && merged.images && merged.images.length > 0) canFillImages++;
  }
  
  console.log('合并后可补全的字段:');
  console.log('  - 可补全评分: ' + canFillRating + ' 个');
  console.log('  - 可补全封面图: ' + canFillImage + ' 个');
  console.log('  - 可补全描述: ' + canFillDesc + ' 个');
  console.log('  - 可补全图片集/剧照: ' + canFillImages + ' 个');
  
  // 显示 TOP 10 重复最多的
  console.log('\n========================================');
  console.log('🔝 重复最多的 TOP 10');
  console.log('========================================');
  duplicates.slice(0, 10).forEach((d, i) => {
    const [name, city] = d.key.split('|');
    console.log(`  ${i+1}. ${name} (${city}): ${d.places.length}个 - 距离${d.avgDistance.toFixed(0)}米`);
  });
  
  return duplicates;
}

function calculateAvgDistance(places) {
  if (places.length < 2) return 0;
  
  let totalDist = 0;
  let count = 0;
  
  for (let i = 0; i < places.length; i++) {
    for (let j = i + 1; j < places.length; j++) {
      if (places[i].latitude && places[j].latitude) {
        totalDist += calculateDistance(
          places[i].latitude, places[i].longitude,
          places[j].latitude, places[j].longitude
        );
        count++;
      }
    }
  }
  
  return count > 0 ? totalDist / count : 0;
}

// 模拟合并结果
function simulateMerge(places) {
  // 按渠道优先级排序
  const sorted = [...places].sort((a, b) => 
    getSourcePriority(a.source) - getSourcePriority(b.source)
  );
  
  const merged = { ...sorted[0] };
  
  // 并集处理
  for (const p of places) {
    // 评分：取最高的
    if (p.rating !== null && p.rating !== undefined) {
      if (merged.rating === null || merged.rating === undefined || p.rating > merged.rating) {
        merged.rating = p.rating;
        merged.rating_count = p.rating_count;
      } else if (p.rating === merged.rating && p.rating_count > (merged.rating_count || 0)) {
        merged.rating_count = p.rating_count;
      }
    }
    
    // 封面图：取有的
    if (!merged.cover_image && p.cover_image) {
      merged.cover_image = p.cover_image;
    }
    
    // 描述：取有的
    if (!merged.description && p.description) {
      merged.description = p.description;
    }
    
    // 图片集：合并（去重）
    if (p.images && Array.isArray(p.images) && p.images.length > 0) {
      if (!merged.images || !Array.isArray(merged.images)) {
        merged.images = [];
      }
      const existingUrls = new Set(merged.images);
      for (const img of p.images) {
        if (!existingUrls.has(img)) {
          merged.images.push(img);
          existingUrls.add(img);
        }
      }
    }
    
    // 地址、电话、网站等：取有的（按优先级已排序，所以优先级高的在前）
    if (!merged.address && p.address) merged.address = p.address;
    if (!merged.phone_number && p.phone_number) merged.phone_number = p.phone_number;
    if (!merged.website && p.website) merged.website = p.website;
    if (!merged.opening_hours && p.opening_hours) merged.opening_hours = p.opening_hours;
    if (!merged.google_place_id && p.google_place_id) merged.google_place_id = p.google_place_id;
  }
  
  return merged;
}

findPreciseDuplicates().catch(console.error);
