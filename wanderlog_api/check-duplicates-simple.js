const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function findDuplicates() {
  console.log('🔍 正在查找重复地点...\n');
  
  // 查询按名称+城市+国家分组的重复项
  const { data: places, error } = await supabase
    .from('places')
    .select('id, name, city, country, latitude, longitude, rating, rating_count, source, cover_image, description, created_at')
    .order('created_at', { ascending: true });
    
  if (error) {
    console.error('错误:', error);
    return;
  }
  
  console.log('📊 总地点数:', places.length);
  
  // 找出相同名称+城市的重复项
  const groupMap = new Map();
  for (const place of places) {
    const key = (place.name || '').toLowerCase().trim() + '|' + (place.city || '').toLowerCase().trim() + '|' + (place.country || '').toLowerCase().trim();
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key).push(place);
  }
  
  const duplicates = [];
  for (const [key, group] of groupMap.entries()) {
    if (group.length > 1) {
      duplicates.push({ key, places: group });
    }
  }
  
  console.log('\n⚠️  发现 ' + duplicates.length + ' 组重复地点\n');
  
  duplicates.forEach((dup, i) => {
    console.log('────────────────────────────────────────');
    console.log('组 ' + (i+1) + ': ' + dup.key);
    dup.places.forEach((p, j) => {
      const hasRating = p.rating !== null;
      const hasImage = !!p.cover_image;
      const hasDesc = !!p.description;
      console.log('  [' + (j+1) + '] ID: ' + p.id);
      console.log('      名称: ' + p.name);
      console.log('      评分: ' + (hasRating ? p.rating + ' (' + p.rating_count + ')' : '无'));
      console.log('      图片: ' + (hasImage ? '有' : '无'));
      console.log('      描述: ' + (hasDesc ? '有' : '无'));
      console.log('      来源: ' + (p.source || '未知'));
      console.log('      创建时间: ' + p.created_at);
    });
    console.log('');
  });
  
  // 生成汇总
  let totalDupPlaces = 0;
  duplicates.forEach(d => totalDupPlaces += d.places.length);
  
  console.log('\n========================================');
  console.log('📊 汇总');
  console.log('========================================');
  console.log('总地点数: ' + places.length);
  console.log('重复组数: ' + duplicates.length);
  console.log('涉及重复的地点数: ' + totalDupPlaces);
  console.log('可删除的重复项: ' + (totalDupPlaces - duplicates.length));
}

findDuplicates().catch(console.error);
