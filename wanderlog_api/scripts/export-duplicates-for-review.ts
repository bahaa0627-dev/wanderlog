import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function exportDuplicates() {
  console.log('🔍 查找并导出重复数据...\n');

  // 获取所有 wikidata 数据
  const allWikidata: any[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data } = await supabase
      .from('places')
      .select('id, name, latitude, longitude, source_detail, city, country, cover_image')
      .eq('source', 'wikidata')
      .order('name', { ascending: true })
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
      .select('id, name, latitude, longitude, rating, google_place_id, city, country, cover_image, description')
      .eq('source', 'apify_google_places')
      .range(offset, offset + pageSize - 1);

    if (!data || data.length === 0) break;
    allApify.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  console.log(`📊 Apify 数据: ${allApify.length} 条`);

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

  console.log(`\n🔴 发现 ${duplicates.length} 条重复数据\n`);

  // 导出为 CSV
  const headers = [
    'wikidata_id', 'wikidata_name', 'wikidata_qid', 'wikidata_city', 'wikidata_country',
    'apify_id', 'apify_name', 'apify_rating', 'apify_city', 'apify_country', 'apify_gpid',
    'distance_meters'
  ];

  const rows = [headers.join(',')];

  for (const dup of duplicates) {
    const row = [
      dup.wikidata.id,
      `"${(dup.wikidata.name || '').replace(/"/g, '""')}"`,
      dup.wikidata.source_detail || '',
      `"${(dup.wikidata.city || '').replace(/"/g, '""')}"`,
      `"${(dup.wikidata.country || '').replace(/"/g, '""')}"`,
      dup.apify.id,
      `"${(dup.apify.name || '').replace(/"/g, '""')}"`,
      dup.apify.rating || '',
      `"${(dup.apify.city || '').replace(/"/g, '""')}"`,
      `"${(dup.apify.country || '').replace(/"/g, '""')}"`,
      dup.apify.google_place_id || '',
      Math.round(dup.distance * 111000)
    ];
    rows.push(row.join(','));
  }

  fs.writeFileSync('./duplicates-for-review.csv', rows.join('\n'));
  console.log('✅ 已导出到 duplicates-for-review.csv');

  // 显示前 20 条
  console.log('\n📋 重复数据预览（前20条）:\n');
  console.log('| Wikidata 名称 | Apify 名称 | Rating | 距离 |');
  console.log('|--------------|-----------|--------|------|');
  
  for (const dup of duplicates.slice(0, 20)) {
    const wName = dup.wikidata.name?.substring(0, 30) || '';
    const aName = dup.apify.name?.substring(0, 30) || '';
    const dist = Math.round(dup.distance * 111000);
    console.log(`| ${wName.padEnd(30)} | ${aName.padEnd(30)} | ${(dup.apify.rating || '-').toString().padEnd(4)} | ${dist}m |`);
  }
}

exportDuplicates();
