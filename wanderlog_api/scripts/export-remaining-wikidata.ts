/**
 * Export remaining Wikidata places that haven't been processed by Apify
 * 
 * Criteria for "not processed":
 * - source = 'wikidata'
 * - google_place_id IS NULL (not enriched by Apify)
 * 
 * Usage:
 *   npx tsx scripts/export-remaining-wikidata.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Escape CSV field
 */
function escapeCsvField(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }
  
  const str = String(value);
  
  // If contains comma, quote, or newline, wrap in quotes and escape quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  
  return str;
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║              EXPORT REMAINING WIKIDATA PLACES                                 ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  // First, get total count of wikidata places
  const { count: totalCount, error: countError } = await supabase
    .from('places')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'wikidata');

  if (countError) {
    console.error('❌ Error counting total:', countError.message);
    return;
  }

  console.log(`📊 Wikidata 总数: ${totalCount}`);

  // Count places with google_place_id (processed by Apify)
  const { count: processedCount, error: processedError } = await supabase
    .from('places')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'wikidata')
    .not('google_place_id', 'is', null);

  if (processedError) {
    console.error('❌ Error counting processed:', processedError.message);
    return;
  }

  console.log(`✅ 已处理（有 Google Place ID）: ${processedCount}`);

  // Count remaining (no google_place_id)
  const { count: remainingCount, error: remainingError } = await supabase
    .from('places')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'wikidata')
    .is('google_place_id', null);

  if (remainingError) {
    console.error('❌ Error counting remaining:', remainingError.message);
    return;
  }

  console.log(`⏳ 未处理（无 Google Place ID）: ${remainingCount}`);
  console.log(`📈 处理进度: ${((processedCount! / totalCount!) * 100).toFixed(1)}%\n`);

  if (remainingCount === 0) {
    console.log('🎉 所有 Wikidata 地点都已处理完成！');
    return;
  }

  // Fetch remaining places
  console.log('🔍 正在获取未处理的地点...');
  
  // Supabase has a limit of 1000 per query, so we need to paginate
  const allPlaces: any[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('places')
      .select('id, name, latitude, longitude, city, country, address, source_detail, description')
      .eq('source', 'wikidata')
      .is('google_place_id', null)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .order('name', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error('❌ Error fetching places:', error.message);
      return;
    }

    if (!data || data.length === 0) {
      break;
    }

    allPlaces.push(...data);
    console.log(`   已获取 ${allPlaces.length} 条...`);
    
    if (data.length < pageSize) {
      break;
    }
    
    offset += pageSize;
  }

  console.log(`✅ 共获取 ${allPlaces.length} 条未处理的地点\n`);

  // Generate CSV for Google My Maps
  // Google My Maps needs: name, latitude, longitude, description
  const headers = ['name', 'latitude', 'longitude', 'description', 'city', 'country', 'address'];
  const rows: string[] = [headers.join(',')];

  for (const place of allPlaces) {
    // Build description
    const descParts: string[] = [];
    if (place.description) {
      descParts.push(place.description.substring(0, 200));
    }
    if (place.source_detail) {
      descParts.push(`Wikidata: ${place.source_detail}`);
    }

    const row = [
      escapeCsvField(place.name),
      escapeCsvField(place.latitude),
      escapeCsvField(place.longitude),
      escapeCsvField(descParts.join(' | ')),
      escapeCsvField(place.city),
      escapeCsvField(place.country),
      escapeCsvField(place.address),
    ];
    
    rows.push(row.join(','));
  }

  const csv = rows.join('\n');
  
  // Save to file
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const outputPath = `./remaining-wikidata-${timestamp}.csv`;
  
  fs.writeFileSync(outputPath, csv);
  console.log(`✅ CSV 已保存到: ${outputPath}`);
  console.log(`   共 ${allPlaces.length} 条记录\n`);

  // Show sample
  console.log('📋 示例数据（前5条）:');
  allPlaces.slice(0, 5).forEach((p, i) => {
    console.log(`   ${i + 1}. ${p.name}`);
    console.log(`      ${p.city || 'N/A'}, ${p.country || 'N/A'}`);
    console.log(`      ${p.latitude}, ${p.longitude}`);
  });
  console.log('');

  // Show country distribution
  const countryStats: Record<string, number> = {};
  for (const place of allPlaces) {
    const country = place.country || 'Unknown';
    countryStats[country] = (countryStats[country] || 0) + 1;
  }
  
  const sortedCountries = Object.entries(countryStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  console.log('🌍 国家分布（前10）:');
  for (const [country, count] of sortedCountries) {
    console.log(`   ${country}: ${count}`);
  }
  console.log('');

  console.log('💡 下一步:');
  console.log('   1. 打开 https://www.google.com/mymaps');
  console.log('   2. 创建新地图或打开现有地图');
  console.log('   3. 点击左侧面板的 "导入"');
  console.log(`   4. 上传文件: ${outputPath}`);
  console.log('   5. 选择列映射:');
  console.log('      - 位置列: latitude, longitude');
  console.log('      - 标记标题: name');
  console.log('   6. 点击 "完成"');
  console.log('');
}

main().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
