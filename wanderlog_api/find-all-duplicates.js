const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function findAllDuplicates() {
  console.log('🔍 正在查找所有重复地点...\n');
  
  // 分批获取所有地点
  let allPlaces = [];
  let offset = 0;
  const limit = 1000;
  
  while (true) {
    const { data: batch, error } = await supabase
      .from('places')
      .select('id, name, city, country, latitude, longitude, rating, rating_count, source, cover_image, description, created_at')
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
  
  // 找出相同名称+城市+国家的重复项
  const groupMap = new Map();
  for (const place of allPlaces) {
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
  
  // 只显示前 50 组
  const showCount = Math.min(duplicates.length, 50);
  duplicates.slice(0, showCount).forEach((dup, i) => {
    console.log('────────────────────────────────────────');
    console.log('组 ' + (i+1) + ': ' + dup.key + ' (' + dup.places.length + '个)');
    dup.places.forEach((p, j) => {
      const hasRating = p.rating !== null && p.rating !== undefined;
      const hasImage = !!p.cover_image;
      const hasDesc = !!p.description;
      console.log('  [' + (j+1) + '] ID: ' + p.id.substring(0,8) + '...');
      console.log('      评分: ' + (hasRating ? p.rating + ' (' + p.rating_count + ')' : '无') + 
                  ' | 图片: ' + (hasImage ? '有' : '无') + 
                  ' | 描述: ' + (hasDesc ? '有' : '无') + 
                  ' | 来源: ' + (p.source || '未知'));
    });
  });
  
  if (duplicates.length > showCount) {
    console.log('\n... 还有 ' + (duplicates.length - showCount) + ' 组未显示');
  }
  
  // 生成汇总
  let totalDupPlaces = 0;
  let groupsWith2 = 0, groupsWith3plus = 0;
  duplicates.forEach(d => {
    totalDupPlaces += d.places.length;
    if (d.places.length === 2) groupsWith2++;
    else groupsWith3plus++;
  });
  
  console.log('\n========================================');
  console.log('📊 汇总');
  console.log('========================================');
  console.log('总地点数: ' + allPlaces.length);
  console.log('重复组数: ' + duplicates.length);
  console.log('  - 2个重复的组: ' + groupsWith2);
  console.log('  - 3个及以上重复的组: ' + groupsWith3plus);
  console.log('涉及重复的地点数: ' + totalDupPlaces);
  console.log('可删除的重复项: ' + (totalDupPlaces - duplicates.length));
  console.log('');
  console.log('按重复数量排序的组:');
  
  const sortedByCount = [...duplicates].sort((a, b) => b.places.length - a.places.length);
  sortedByCount.slice(0, 10).forEach((d, i) => {
    console.log('  ' + (i+1) + '. ' + d.key.split('|')[0] + ' (' + d.key.split('|')[1] + '): ' + d.places.length + '个');
  });
}

findAllDuplicates().catch(console.error);
