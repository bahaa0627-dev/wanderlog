import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function showExamples() {
  console.log('🔍 获取重复数据详细例子...\n');

  // 获取所有 wikidata 数据
  const allWikidata: any[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data } = await supabase
      .from('places')
      .select('id, name, latitude, longitude, source_detail, city, country, cover_image, description, address')
      .eq('source', 'wikidata')
      .order('name', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (!data || data.length === 0) break;
    allWikidata.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  // 获取所有 apify 数据
  const allApify: any[] = [];
  offset = 0;

  while (true) {
    const { data } = await supabase
      .from('places')
      .select('id, name, latitude, longitude, rating, google_place_id, city, country, cover_image, description, address, opening_hours')
      .eq('source', 'apify_google_places')
      .range(offset, offset + pageSize - 1);

    if (!data || data.length === 0) break;
    allApify.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  // 查找重复
  const duplicates: Array<{wikidata: any, apify: any, distance: number}> = [];
  const threshold = 0.001;

  for (const wiki of allWikidata) {
    for (const apify of allApify) {
      const latDiff = Math.abs((wiki.latitude || 0) - (apify.latitude || 0));
      const lonDiff = Math.abs((wiki.longitude || 0) - (apify.longitude || 0));
      
      if (latDiff < threshold && lonDiff < threshold) {
        const distance = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff);
        duplicates.push({ wikidata: wiki, apify: apify, distance });
        break;
      }
    }
  }

  console.log(`📊 共发现 ${duplicates.length} 条重复数据\n`);

  // 分类显示例子
  // 1. 名字完全相同的
  const exactMatch = duplicates.filter(d => 
    d.wikidata.name.toLowerCase().trim() === d.apify.name.toLowerCase().trim()
  );

  // 2. 名字相似的（包含关系）
  const similarMatch = duplicates.filter(d => {
    const wName = d.wikidata.name.toLowerCase();
    const aName = d.apify.name.toLowerCase();
    return wName !== aName && (wName.includes(aName) || aName.includes(wName));
  });

  // 3. 名字不同但位置相近的
  const locationMatch = duplicates.filter(d => {
    const wName = d.wikidata.name.toLowerCase();
    const aName = d.apify.name.toLowerCase();
    return !wName.includes(aName) && !aName.includes(wName) && wName !== aName;
  });

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📋 类型1: 名字完全相同 (' + exactMatch.length + ' 条)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  for (const d of exactMatch.slice(0, 10)) {
    console.log(`🏛️  "${d.wikidata.name}"`);
    console.log(`   Wikidata: ${d.wikidata.city}, ${d.wikidata.country} | QID: ${d.wikidata.source_detail}`);
    console.log(`   Apify:    ${d.apify.city}, ${d.apify.country} | Rating: ${d.apify.rating} | 有营业时间: ${d.apify.opening_hours ? '是' : '否'}`);
    console.log(`   距离: ${Math.round(d.distance * 111000)}米`);
    console.log('');
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('📋 类型2: 名字相似（包含关系）(' + similarMatch.length + ' 条)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  for (const d of similarMatch.slice(0, 10)) {
    console.log(`🏛️  Wikidata: "${d.wikidata.name}"`);
    console.log(`   Apify:    "${d.apify.name}"`);
    console.log(`   Wikidata: ${d.wikidata.city}, ${d.wikidata.country} | QID: ${d.wikidata.source_detail}`);
    console.log(`   Apify:    ${d.apify.city}, ${d.apify.country} | Rating: ${d.apify.rating}`);
    console.log(`   距离: ${Math.round(d.distance * 111000)}米`);
    console.log('');
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('📋 类型3: 名字不同但位置相近（可能误判）(' + locationMatch.length + ' 条)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  for (const d of locationMatch.slice(0, 15)) {
    console.log(`⚠️  Wikidata: "${d.wikidata.name}"`);
    console.log(`   Apify:    "${d.apify.name}"`);
    console.log(`   Wikidata: ${d.wikidata.city}, ${d.wikidata.country}`);
    console.log(`   Apify:    ${d.apify.city}, ${d.apify.country} | Rating: ${d.apify.rating}`);
    console.log(`   距离: ${Math.round(d.distance * 111000)}米`);
    console.log('');
  }

  // 导出完整列表到 CSV
  const headers = [
    'match_type', 'wikidata_name', 'apify_name', 'wikidata_qid',
    'wikidata_city', 'wikidata_country', 'apify_city', 'apify_country',
    'apify_rating', 'distance_meters', 'wikidata_id', 'apify_id'
  ];

  const rows = [headers.join(',')];

  for (const d of duplicates) {
    const wName = d.wikidata.name.toLowerCase();
    const aName = d.apify.name.toLowerCase();
    let matchType = 'location_only';
    if (wName === aName) matchType = 'exact_name';
    else if (wName.includes(aName) || aName.includes(wName)) matchType = 'similar_name';

    const row = [
      matchType,
      `"${(d.wikidata.name || '').replace(/"/g, '""')}"`,
      `"${(d.apify.name || '').replace(/"/g, '""')}"`,
      d.wikidata.source_detail || '',
      `"${(d.wikidata.city || '').replace(/"/g, '""')}"`,
      `"${(d.wikidata.country || '').replace(/"/g, '""')}"`,
      `"${(d.apify.city || '').replace(/"/g, '""')}"`,
      `"${(d.apify.country || '').replace(/"/g, '""')}"`,
      d.apify.rating || '',
      Math.round(d.distance * 111000),
      d.wikidata.id,
      d.apify.id
    ];
    rows.push(row.join(','));
  }

  fs.writeFileSync('./duplicates-detailed.csv', rows.join('\n'));
  console.log('\n✅ 完整列表已导出到 duplicates-detailed.csv');

  console.log('\n📊 统计:');
  console.log(`   名字完全相同: ${exactMatch.length} 条 (建议删除 Wikidata 版本)`);
  console.log(`   名字相似: ${similarMatch.length} 条 (建议删除 Wikidata 版本)`);
  console.log(`   仅位置相近: ${locationMatch.length} 条 (需要人工判断)`);
}

showExamples();
