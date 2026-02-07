const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkNaples() {
  // 查找 Naples 或 Piazza del Plebiscito 相关的地点
  const { data: places, error } = await supabase
    .from('places')
    .select('id, name, city, country, latitude, longitude, rating, rating_count, source, cover_image, description')
    .or('city.ilike.%naples%,name.ilike.%piazza del plebiscito%');
    
  if (error) {
    console.error('错误:', error);
    return;
  }
  
  console.log('📊 找到 Naples/Piazza del Plebiscito 相关地点:', places.length);
  places.forEach((p, i) => {
    console.log('');
    console.log('['+ (i+1) +'] ' + p.name);
    console.log('    ID: ' + p.id);
    console.log('    城市: ' + p.city + ', 国家: ' + p.country);
    console.log('    坐标: ' + p.latitude + ', ' + p.longitude);
    console.log('    评分: ' + (p.rating || '无') + (p.rating_count ? ' (' + p.rating_count + ')' : ''));
    console.log('    封面: ' + (p.cover_image ? '有' : '无'));
    console.log('    描述: ' + (p.description ? p.description.substring(0, 50) + '...' : '无'));
  });
}

checkNaples().catch(console.error);
