import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function check() {
  // 获取一些样本数据看看 source_details 的结构
  const { data: samples } = await supabase
    .from('places')
    .select('id, name, source, source_detail, source_details, rating, google_place_id, custom_fields')
    .eq('source', 'wikidata')
    .limit(5);

  console.log('📋 样本数据:');
  for (const s of samples || []) {
    console.log('\n---');
    console.log('Name:', s.name);
    console.log('source_detail:', s.source_detail);
    console.log('source_details:', JSON.stringify(s.source_details, null, 2));
    console.log('google_place_id:', s.google_place_id);
    console.log('rating:', s.rating);
    console.log('custom_fields:', JSON.stringify(s.custom_fields, null, 2));
  }

  // 检查 source_details 中是否有 apify_enriched 标记
  const { data: enrichedSamples } = await supabase
    .from('places')
    .select('id, name, source_details')
    .eq('source', 'wikidata')
    .not('source_details', 'is', null)
    .limit(10);

  console.log('\n\n📋 有 source_details 的样本:');
  for (const s of enrichedSamples || []) {
    console.log('Name:', s.name, '| source_details:', JSON.stringify(s.source_details));
  }
}

check();
