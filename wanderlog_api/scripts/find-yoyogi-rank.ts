import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function check() {
  const { data } = await supabase
    .from('places')
    .select('id, name, rating_count')
    .eq('city', 'Tokyo')
    .order('rating_count', { ascending: false, nullsFirst: false })
    .limit(200);

  console.log('Finding Yoyogi Hachimangu Shrine rank:');
  let rank = 0;
  for (const p of data || []) {
    rank++;
    if (p.name.includes('Yoyogi Hachimangu')) {
      console.log(`Found at #${rank}: ${p.name} (rating_count: ${p.rating_count})`);
    }
  }
  
  // 也检查 rating_count 在 2500-3000 范围内的地点
  console.log('\nPlaces with rating_count 2500-3500:');
  rank = 0;
  for (const p of data || []) {
    rank++;
    if (p.rating_count && p.rating_count >= 2500 && p.rating_count <= 3500) {
      console.log(`#${rank}: ${p.name} (${p.rating_count})`);
    }
  }
}

check();
