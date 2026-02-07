const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkPiazza() {
  // 查找所有包含 "Piazza del Plebiscito" 的地点
  const { data: places, error } = await supabase
    .from('places')
    .select('id, name, city, country, latitude, longitude, rating, rating_count, source, cover_image, description, google_place_id, created_at')
    .ilike('name', '%piazza%plebiscito%');
    
  if (error) {
    console.error('错误:', error);
    return;
  }
  
  console.log('📊 找到 Piazza del Plebiscito 相关地点:', places.length);
  console.log('');
  places.forEach((p, i) => {
    console.log('['+ (i+1) +'] ' + p.name);
    console.log('    ID: ' + p.id);
    console.log('    城市: ' + p.city + ', 国家: ' + p.country);
    console.log('    坐标: ' + p.latitude + ', ' + p.longitude);
    console.log('    评分: ' + (p.rating || '无') + (p.rating_count ? ' (' + p.rating_count + ')' : ''));
    console.log('    封面: ' + (p.cover_image ? '有' : '无'));
    console.log('    描述: ' + (p.description ? p.description.substring(0, 80) + '...' : '无'));
    console.log('    来源: ' + (p.source || '未知'));
    console.log('    Google Place ID: ' + (p.google_place_id || '无'));
    console.log('    创建时间: ' + p.created_at);
    console.log('');
  });
  
  // 也查找一下相同坐标附近的地点
  if (places.length > 0) {
    const mainPlace = places[0];
    const lat = mainPlace.latitude;
    const lon = mainPlace.longitude;
    
    console.log('-------------------------------------------');
    console.log('查找坐标附近 (±0.001) 的地点...');
    
    const { data: nearbyPlaces, error: nearbyError } = await supabase
      .from('places')
      .select('id, name, city, country, latitude, longitude, rating, rating_count, google_place_id')
      .gte('latitude', lat - 0.001)
      .lte('latitude', lat + 0.001)
      .gte('longitude', lon - 0.001)
      .lte('longitude', lon + 0.001);
      
    if (!nearbyError && nearbyPlaces) {
      console.log('找到', nearbyPlaces.length, '个附近地点:');
      nearbyPlaces.forEach(p => {
        console.log('  - ' + p.name + ' (ID: ' + p.id.substring(0,8) + '..., ' + p.latitude.toFixed(5) + ', ' + p.longitude.toFixed(5) + ')');
      });
    }
  }
}

checkPiazza().catch(console.error);
