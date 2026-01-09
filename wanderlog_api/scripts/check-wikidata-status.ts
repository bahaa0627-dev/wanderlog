import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function check() {
  // 检查有 rating 的 wikidata 地点（说明被 Apify 处理过）
  const { count: withRating } = await supabase
    .from('places')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'wikidata')
    .not('rating', 'is', null);
  
  // 检查 is_verified 的
  const { count: verified } = await supabase
    .from('places')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'wikidata')
    .eq('is_verified', true);

  // 检查有 cover_image 的
  const { count: withImage } = await supabase
    .from('places')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'wikidata')
    .not('cover_image', 'is', null);

  // 检查没有 rating 的（未被 Apify 处理）
  const { count: withoutRating } = await supabase
    .from('places')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'wikidata')
    .is('rating', null);

  console.log('📊 Wikidata 数据状态:');
  console.log('   有 rating (已处理):', withRating);
  console.log('   无 rating (未处理):', withoutRating);
  console.log('   is_verified:', verified);
  console.log('   有 cover_image:', withImage);
}

check();
