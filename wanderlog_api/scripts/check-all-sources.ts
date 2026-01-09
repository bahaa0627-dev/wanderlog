import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function check() {
  // 获取所有不同的 source 值
  const { count: total } = await supabase
    .from('places')
    .select('*', { count: 'exact', head: true });

  console.log(`📊 总地点数: ${total}\n`);

  // 分页获取所有数据统计 source
  const sourceStats: Record<string, number> = {};
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('places')
      .select('source')
      .range(offset, offset + pageSize - 1);

    if (error || !data || data.length === 0) break;

    for (const p of data) {
      const src = p.source || 'null';
      sourceStats[src] = (sourceStats[src] || 0) + 1;
    }

    if (data.length < pageSize) break;
    offset += pageSize;
  }

  console.log('📊 数据源分布:');
  for (const [source, count] of Object.entries(sourceStats).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${source}: ${count}`);
  }

  // 检查有多少有 google_place_id
  const { count: withGpid } = await supabase
    .from('places')
    .select('*', { count: 'exact', head: true })
    .not('google_place_id', 'is', null);

  console.log(`\n📊 有 Google Place ID: ${withGpid}`);

  // 检查有多少有 rating
  const { count: withRating } = await supabase
    .from('places')
    .select('*', { count: 'exact', head: true })
    .not('rating', 'is', null);

  console.log(`📊 有 Rating: ${withRating}`);

  // 看看 wikidata 的样本
  const { data: wikiSamples } = await supabase
    .from('places')
    .select('id, name, source, source_detail, rating, google_place_id')
    .eq('source', 'wikidata')
    .limit(5);

  console.log('\n📋 Wikidata 样本:');
  for (const s of wikiSamples || []) {
    console.log(`   ${s.name} | source_detail: ${s.source_detail} | rating: ${s.rating} | gpid: ${s.google_place_id}`);
  }

  // 看看 apify_google_places 的样本
  const { data: apifySamples } = await supabase
    .from('places')
    .select('id, name, source, source_detail, rating, google_place_id')
    .eq('source', 'apify_google_places')
    .limit(5);

  console.log('\n📋 Apify Google Places 样本:');
  for (const s of apifySamples || []) {
    console.log(`   ${s.name} | source_detail: ${s.source_detail} | rating: ${s.rating} | gpid: ${s.google_place_id?.substring(0, 30)}...`);
  }
}

check();
