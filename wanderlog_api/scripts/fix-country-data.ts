/**
 * 修复国家数据
 * 将错误存储为国家的城市名修正为正确的国家
 */

import prisma from '../src/config/database';

// 城市到国家的映射
const CITY_TO_COUNTRY: Record<string, string> = {
  'Aarhus': 'Denmark',
  'Asahikawa': 'Japan',
  'Billund': 'Denmark',
  'Borre': 'Denmark',
  'Chiang Mai': 'Thailand',
  'Copenhagen': 'Denmark',
  'Otaru': 'Japan',
  'Paris': 'France',
  'Sapporo': 'Japan',
  'Tokyo': 'Japan',
  'Osaka': 'Japan',
  'Kyoto': 'Japan',
  'Seoul': 'South Korea',
  'Bangkok': 'Thailand',
  'Sydney': 'Australia',
  'Melbourne': 'Australia',
  'Ubud': 'Indonesia',
  'Yamanashi': 'Japan',
  'USA': 'United States',
};

async function fixCountryData() {
  console.log('开始修复国家数据...\n');

  let fixed = 0;

  for (const [city, country] of Object.entries(CITY_TO_COUNTRY)) {
    const result = await prisma.place.updateMany({
      where: { country: city },
      data: { country: country }
    });
    
    if (result.count > 0) {
      console.log(`✅ 修复 ${result.count} 条: "${city}" → "${country}"`);
      fixed += result.count;
    }
  }

  console.log(`\n总共修复 ${fixed} 条记录`);
  await prisma.$disconnect();
}

fixCountryData().catch(console.error);
