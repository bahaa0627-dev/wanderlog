import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function checkMovie5448() {
  console.log('🔍 Checking places from movie 5448...\n');

  // 查询包含电影5448信息的地点
  const { data, error } = await supabase
    .from('places')
    .select('id, name, city, country, source, custom_fields, tags')
    .eq('source', 'mocation')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  if (!data || data.length === 0) {
    console.log('⚠️  No places found from mocation');
    return;
  }

  console.log(`✅ Found ${data.length} places from mocation\n`);

  // 筛选出电影5448的地点
  const movie5448Places = data.filter(place => {
    const customFields = place.custom_fields as any;
    const movies = customFields?.movies || [];
    return movies.some((movie: any) => movie.movieId === '5448');
  });

  console.log(`🎬 Movie 5448 places: ${movie5448Places.length}\n`);

  movie5448Places.forEach((place, index) => {
    const customFields = place.custom_fields as any;
    const movies = customFields?.movies || [];
    const movieInfo = movies.find((m: any) => m.movieId === '5448');
    
    console.log(`${index + 1}. ${place.name}`);
    console.log(`   City: ${place.city}`);
    console.log(`   Scene: ${movieInfo?.sceneDescription}`);
    console.log(`   Tags: ${JSON.stringify(place.tags)}`);
    console.log('');
  });

  // 统计信息
  const cities = new Set(movie5448Places.map(p => p.city));
  console.log(`\n📊 Statistics:`);
  console.log(`   Total places: ${movie5448Places.length}`);
  console.log(`   Cities: ${cities.size}`);
  console.log(`   City list: ${Array.from(cities).join(', ')}`);
}

checkMovie5448().catch(console.error);
