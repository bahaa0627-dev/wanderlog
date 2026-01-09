import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function analyze() {
  console.log('🔍 分析 Apify 数据中的"额外"数据...\n');

  // 获取所有 wikidata 数据（按名字排序）
  const allWikidata: any[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data } = await supabase
      .from('places')
      .select('id, name, latitude, longitude, source_detail')
      .eq('source', 'wikidata')
      .order('name', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (!data || data.length === 0) break;
    allWikidata.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  // 获取前 4100 条 wikidata（之前导出的）
  const exportedWikidata = allWikidata.slice(0, 4100);
  console.log(`📊 之前导出的 Wikidata 数据: ${exportedWikidata.length} 条`);

  // 获取所有 apify 数据
  const allApify: any[] = [];
  offset = 0;

  while (true) {
    const { data } = await supabase
      .from('places')
      .select('id, name, latitude, longitude, rating, google_place_id, created_at')
      .eq('source', 'apify_google_places')
      .range(offset, offset + pageSize - 1);

    if (!data || data.length === 0) break;
    allApify.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  console.log(`📊 Apify 总数据: ${allApify.length} 条\n`);

  // 查找匹配：只在导出的 4100 条中查找
  const threshold = 0.001; // 约 100 米
  const matchedApify = new Set<string>();
  const matchedWikidata = new Set<string>();

  for (const wiki of exportedWikidata) {
    for (const apify of allApify) {
      const latDiff = Math.abs((wiki.latitude || 0) - (apify.latitude || 0));
      const lonDiff = Math.abs((wiki.longitude || 0) - (apify.longitude || 0));
      
      if (latDiff < threshold && lonDiff < threshold) {
        matchedApify.add(apify.id);
        matchedWikidata.add(wiki.id);
        break;
      }
    }
  }

  const unmatchedApify = allApify.filter(a => !matchedApify.has(a.id));

  console.log('📊 匹配分析:');
  console.log(`   导出的 Wikidata 中有匹配的: ${matchedWikidata.size} / ${exportedWikidata.length}`);
  console.log(`   Apify 中有匹配的: ${matchedApify.size} / ${allApify.length}`);
  console.log(`   Apify 中无匹配的（额外数据）: ${unmatchedApify.length}`);

  // 分析无匹配的 Apify 数据
  console.log('\n📋 无匹配的 Apify 数据样本（前20条）:');
  for (const a of unmatchedApify.slice(0, 20)) {
    console.log(`   ${a.name} | rating: ${a.rating} | created: ${a.created_at?.substring(0, 10)}`);
  }

  // 按创建日期分组无匹配数据
  const dateStats: Record<string, number> = {};
  for (const a of unmatchedApify) {
    const date = a.created_at?.substring(0, 10) || 'unknown';
    dateStats[date] = (dateStats[date] || 0) + 1;
  }

  console.log('\n📅 无匹配数据按日期分布:');
  for (const [date, count] of Object.entries(dateStats).sort()) {
    console.log(`   ${date}: ${count} 条`);
  }

  // 结论
  console.log('\n💡 结论:');
  console.log(`   你导出了 4100 条 Wikidata 数据`);
  console.log(`   Apify 抓取后产生了 ${allApify.length} 条数据`);
  console.log(`   其中只有 ${matchedApify.size} 条与原始 Wikidata 匹配`);
  console.log(`   多出来的 ${unmatchedApify.length} 条是 Google Places 搜索返回的"附近地点"`);
  console.log(`   这些额外数据可能是 Apify 爬虫在搜索时自动发现的相关地点`);
}

analyze();
