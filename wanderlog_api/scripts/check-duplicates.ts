import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function check() {
  // 统计各个 source 的数量
  const { data: sourceCounts } = await supabase
    .from('places')
    .select('source')
    .limit(10000);

  const sourceStats: Record<string, number> = {};
  for (const p of sourceCounts || []) {
    const src = p.source || 'null';
    sourceStats[src] = (sourceStats[src] || 0) + 1;
  }

  console.log('📊 数据源分布:');
  for (const [source, count] of Object.entries(sourceStats).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${source}: ${count}`);
  }

  // 总数
  const { count: totalCount } = await supabase
    .from('places')
    .select('*', { count: 'exact', head: true });
  console.log(`\n📊 总地点数: ${totalCount}`);

  // 检查是否有重复的名字+坐标
  console.log('\n🔍 检查可能的重复数据...');
  
  // 获取一些 apify 数据看看
  const { data: apifySamples } = await supabase
    .from('places')
    .select('id, name, latitude, longitude, source, rating, google_place_id')
    .eq('source', 'apify')
    .limit(10);

  console.log('\n📋 Apify 数据样本:');
  for (const s of apifySamples || []) {
    console.log(`   ${s.name} | ${s.latitude?.toFixed(4)}, ${s.longitude?.toFixed(4)} | rating: ${s.rating} | gpid: ${s.google_place_id?.substring(0, 20)}...`);
  }

  // 检查这些 apify 数据是否在 wikidata 中有对应
  if (apifySamples && apifySamples.length > 0) {
    console.log('\n🔍 检查 Apify 数据是否与 Wikidata 重复:');
    for (const apify of apifySamples.slice(0, 5)) {
      // 用名字模糊匹配
      const { data: wikidataMatches } = await supabase
        .from('places')
        .select('id, name, latitude, longitude, source')
        .eq('source', 'wikidata')
        .ilike('name', `%${apify.name.substring(0, 20)}%`)
        .limit(3);

      if (wikidataMatches && wikidataMatches.length > 0) {
        console.log(`\n   Apify: "${apify.name}" (${apify.latitude?.toFixed(4)}, ${apify.longitude?.toFixed(4)})`);
        for (const w of wikidataMatches) {
          const dist = Math.sqrt(
            Math.pow((apify.latitude || 0) - (w.latitude || 0), 2) +
            Math.pow((apify.longitude || 0) - (w.longitude || 0), 2)
          );
          console.log(`   -> Wikidata: "${w.name}" (${w.latitude?.toFixed(4)}, ${w.longitude?.toFixed(4)}) dist: ${dist.toFixed(4)}`);
        }
      }
    }
  }
}

check();
