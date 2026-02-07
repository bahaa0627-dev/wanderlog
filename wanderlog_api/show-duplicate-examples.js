const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 计算两点之间的距离（米）
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeName(name) {
  return (name || '').toLowerCase().trim().replace(/[''`]/g, "'").replace(/\s+/g, ' ');
}

async function showDetailedExamples() {
  console.log('🔍 获取重复地点详细示例...\n');
  
  let allPlaces = [];
  let offset = 0;
  const limit = 1000;
  
  while (true) {
    const { data: batch } = await supabase
      .from('places')
      .select('id, name, city, country, latitude, longitude, rating, rating_count, source, cover_image, description, address, images, google_place_id, created_at')
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: true });
    if (!batch || batch.length === 0) break;
    allPlaces = allPlaces.concat(batch);
    offset += limit;
    if (batch.length < limit) break;
  }
  
  // 分组
  const groupMap = new Map();
  for (const place of allPlaces) {
    const key = normalizeName(place.name) + '|' + (place.city || '').toLowerCase().trim() + '|' + (place.country || '').toLowerCase().trim();
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key).push(place);
  }
  
  const DISTANCE_THRESHOLD = 100;
  const duplicates = [];
  
  for (const [key, places] of groupMap.entries()) {
    if (places.length < 2) continue;
    const subGroups = [];
    const assigned = new Set();
    
    for (let i = 0; i < places.length; i++) {
      if (assigned.has(i)) continue;
      const group = [places[i]];
      assigned.add(i);
      
      for (let j = i + 1; j < places.length; j++) {
        if (assigned.has(j)) continue;
        const p1 = places[i], p2 = places[j];
        if (!p1.latitude || !p2.latitude) continue;
        const distance = calculateDistance(p1.latitude, p1.longitude, p2.latitude, p2.longitude);
        if (distance <= DISTANCE_THRESHOLD) {
          group.push(p2);
          assigned.add(j);
        }
      }
      if (group.length > 1) subGroups.push(group);
    }
    for (const group of subGroups) {
      duplicates.push({ key, places: group });
    }
  }
  
  // 随机挑选 10 个不同类型的示例
  const examples = [];
  
  // 1. 找一个有3个重复的
  const threedup = duplicates.find(d => d.places.length >= 3);
  if (threedup) examples.push({ type: '3个重复', dup: threedup });
  
  // 2. 找几个不同城市的
  const cities = ['tokyo', 'paris', 'barcelona', 'sydney', 'copenhagen', 'florence'];
  for (const city of cities) {
    const found = duplicates.find(d => d.key.includes(city) && !examples.some(e => e.dup === d));
    if (found) examples.push({ type: `${city}城市`, dup: found });
    if (examples.length >= 10) break;
  }
  
  // 补充到10个
  for (const dup of duplicates) {
    if (examples.length >= 10) break;
    if (!examples.some(e => e.dup === dup)) {
      examples.push({ type: '其他', dup });
    }
  }
  
  // 显示详细信息
  console.log('=' .repeat(80));
  console.log('📋 重复地点详细示例（供校验）');
  console.log('='.repeat(80));
  
  examples.forEach((ex, idx) => {
    const dup = ex.dup;
    const [name, city, country] = dup.key.split('|');
    
    console.log('\n' + '─'.repeat(80));
    console.log(`【示例 ${idx + 1}】 ${name.toUpperCase()}`);
    console.log(`  城市: ${city}, 国家: ${country}`);
    console.log(`  重复数量: ${dup.places.length} 个`);
    console.log('─'.repeat(80));
    
    dup.places.forEach((p, j) => {
      const dist = j > 0 ? calculateDistance(
        dup.places[0].latitude, dup.places[0].longitude,
        p.latitude, p.longitude
      ).toFixed(1) : '0';
      
      console.log(`\n  📍 记录 ${j + 1}:`);
      console.log(`     ID: ${p.id}`);
      console.log(`     名称: ${p.name}`);
      console.log(`     来源: ${p.source}`);
      console.log(`     坐标: ${p.latitude}, ${p.longitude}`);
      console.log(`     地址: ${p.address || '(无)'}`);
      console.log(`     评分: ${p.rating !== null ? p.rating + ' (' + p.rating_count + '评价)' : '(无)'}`);
      console.log(`     封面图: ${p.cover_image ? '有' : '无'}`);
      console.log(`     图片集: ${p.images && p.images.length ? p.images.length + '张' : '无'}`);
      console.log(`     描述: ${p.description ? p.description.substring(0, 60) + '...' : '(无)'}`);
      console.log(`     Google Place ID: ${p.google_place_id || '(无)'}`);
      console.log(`     创建时间: ${p.created_at}`);
      if (j > 0) console.log(`     📏 与第1条距离: ${dist}米`);
    });
  });
  
  // 额外：显示几个被正确识别为"非重复"的连锁店
  console.log('\n\n' + '='.repeat(80));
  console.log('📋 连锁店识别验证（这些不应该被合并）');
  console.log('='.repeat(80));
  
  const chainStores = ['hart', 'brunch & cake', 'santagloria', 'united states post office'];
  
  for (const chain of chainStores) {
    const matches = allPlaces.filter(p => normalizeName(p.name).includes(chain));
    if (matches.length > 1) {
      console.log(`\n【${chain.toUpperCase()}】 共 ${matches.length} 个地点:`);
      matches.slice(0, 5).forEach((p, i) => {
        console.log(`  ${i+1}. ${p.name}`);
        console.log(`     地址: ${p.address || '(无)'}`);
        console.log(`     坐标: ${p.latitude?.toFixed(5)}, ${p.longitude?.toFixed(5)}`);
      });
      if (matches.length > 5) console.log(`  ... 还有 ${matches.length - 5} 个`);
    }
  }
}

showDetailedExamples().catch(console.error);
