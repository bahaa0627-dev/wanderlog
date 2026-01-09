/**
 * Export remaining Wikidata places (batch 6)
 * 
 * Previous batches:
 * - a-100: 100 places (offset 0-99)
 * - batch-2: 500 places (offset 100-599)
 * - batch-3: 500 places (offset 600-1099)
 * - batch-4: 1000 places (offset 1100-2099)
 * - batch-5: 2000 places (offset 2100-4099)
 * - batch-6: remaining ~1091 places (offset 4100+)
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

function escapeCsvField(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║              EXPORT WIKIDATA BATCH 6 (REMAINING)                              ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  const OFFSET = 4100;  // Skip first 4100 (already exported in previous batches)

  // Get total count
  const { count: totalCount } = await supabase
    .from('places')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'wikidata');

  console.log(`📊 Wikidata 总数: ${totalCount}`);
  console.log(`📊 已导出 (batch 1-5): ${OFFSET}`);
  console.log(`📊 剩余待导出: ${(totalCount || 0) - OFFSET}\n`);

  // Fetch remaining places
  console.log('🔍 正在获取剩余地点...');
  
  const allPlaces: any[] = [];
  let offset = OFFSET;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('places')
      .select('id, name, latitude, longitude, city, country, address, source_detail, description')
      .eq('source', 'wikidata')
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
    console.log(`   已获取 ${allPlaces.length} 条 (offset ${offset})...`);
    
    if (data.length < pageSize) {
      break;
    }
    
    offset += pageSize;
  }

  console.log(`✅ 共获取 ${allPlaces.length} 条地点\n`);

  if (allPlaces.length === 0) {
    console.log('⚠️ 没有剩余数据需要导出');
    return;
  }

  // Generate CSV
  const headers = ['name', 'latitude', 'longitude', 'description', 'city', 'country', 'address'];
  const rows: string[] = [headers.join(',')];

  for (const place of allPlaces) {
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
  const outputPath = './wikidata-batch-6.csv';
  
  fs.writeFileSync(outputPath, csv);
  console.log(`✅ CSV 已保存到: ${outputPath}`);
  console.log(`   共 ${allPlaces.length} 条记录\n`);

  // Show sample
  console.log('📋 示例数据（前5条）:');
  allPlaces.slice(0, 5).forEach((p, i) => {
    console.log(`   ${i + 1}. ${p.name}`);
    console.log(`      ${p.city || 'N/A'}, ${p.country || 'N/A'}`);
  });
  console.log('');

  // Country distribution
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
  console.log('   1. 上传到 Google My Maps');
  console.log('   2. 然后用 Apify 抓取详细信息');
}

main().catch(console.error);
