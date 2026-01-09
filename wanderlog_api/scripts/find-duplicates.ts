import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function findDuplicates() {
  console.log('🔍 查找 Wikidata 和 Apify 之间的重复数据...\n');

  // 获取所有 wikidata 数据
  const allWikidata: any[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data } = await supabase
      .from('places')
      .select('id, name, latitude, longitude, source_detail')
      .eq('source', 'wikidata')
      .range(offset, offset + pageSize - 1);

    if (!data || data.length === 0) break;
    allWikidata.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  console.log(`📊 Wikidata 数据: ${allWikidata.length} 条`);

  // 获取所有 apify 数据
  const allApify: any[] = [];
  offset = 0;

  while (true) {
    const { data } = await supabase
      .from('places')
      .select('id, name, latitude, longitude, rating, google_place_id')
      .eq('source', 'apify_google_places')
      .range(offset, offset + pageSize - 1);

    if (!data || data.length === 0) break;
    allApify.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  console.log(`📊 Apify 数据: ${allApify.length} 条`);

  // 查找重复：坐标距离 < 0.001 度（约 100 米）
  const duplicates: Array<{wikidata: any, apify: any, distance: number}> = [];
  const threshold = 0.001; // 约 100 米

  for (const wiki of allWikidata) {
    for (const apify of allApify) {
      const latDiff = Math.abs((wiki.latitude || 0) - (apify.latitude || 0));
      const lonDiff = Math.abs((wiki.longitude || 0) - (apify.longitude || 0));
      
      if (latDiff < threshold && lonDiff < threshold) {
        const distance = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff);
        duplicates.push({ wikidata: wiki, apify: apify, distance });
        break; // 找到一个匹配就跳出
      }
    }
  }

  console.log(`\n🔴 发现 ${duplicates.length} 条可能重复的数据（坐标距离 < ${threshold} 度）\n`);

  // 显示一些例子
  console.log('📋 重复数据示例（前10条）:');
  for (const dup of duplicates.slice(0, 10)) {
    console.log(`\n   Wikidata: "${dup.wikidata.name}" (${dup.wikidata.source_detail})`);
    console.log(`   Apify:    "${dup.apify.name}" (rating: ${dup.apify.rating})`);
    console.log(`   距离: ${(dup.distance * 111000).toFixed(0)} 米`);
  }

  // 统计
  const wikidataWithDup = duplicates.length;
  const wikidataWithoutDup = allWikidata.length - wikidataWithDup;

  console.log('\n📊 统计:');
  console.log(`   Wikidata 有对应 Apify 数据: ${wikidataWithDup} 条`);
  console.log(`   Wikidata 无对应 Apify 数据: ${wikidataWithoutDup} 条`);
  console.log(`   Apify 独立数据: ${allApify.length - wikidataWithDup} 条`);

  // 建议
  console.log('\n💡 建议:');
  console.log('   1. 删除重复的 Wikidata 数据（保留 Apify 数据，因为有更多信息）');
  console.log('   2. 或者合并数据：用 Apify 的 rating/google_place_id 更新 Wikidata 记录');
}

findDuplicates();
