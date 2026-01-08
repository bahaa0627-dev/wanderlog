/**
 * 修复数据库中的国家名称
 * 将缩写和不规范的名称统一为英文全称
 */

import prisma from '../src/config/database';

// 国家名称映射表
const COUNTRY_NAME_MAP: Record<string, string | null> = {
  // ISO 代码 -> 全称
  'GE': 'Georgia',
  'GI': 'Gibraltar',
  'KG': 'Kyrgyzstan',
  'KP': 'North Korea',
  'KZ': 'Kazakhstan',
  'LS': 'Lesotho',
  'MD': 'Moldova',
  'NA': 'Namibia',
  'NC': 'New Caledonia',
  'PS': 'Palestine',
  'UZ': 'Uzbekistan',
  'VA': 'Vatican City',
  
  // 缩写 -> 全称
  'USA': 'United States',
  'UK': 'United Kingdom',
  
  // 不同写法统一
  'People\'s Republic of China': 'China',
  'Luxemburg': 'Luxembourg',
  'Vatican': 'Vatican City',
  
  // 历史名称 -> 现代名称
  'Empire of Japan': 'Japan',
  'Russian Empire': 'Russia',
  'Second Polish Republic': 'Poland',
  
  // 错误数据
  'Nesvizh Radziwiłł Castle': 'Belarus',  // 这是白俄罗斯的一个城堡
  'Oceania': null,  // 不是国家，需要手动检查
  'Tatarstan': 'Russia',  // 俄罗斯的一个共和国
  
  // 德语 -> 英语
  'Deutschland': 'Germany',
  'Belgien': 'Belgium',
  'Finnland': 'Finland',
  'Niederlande': 'Netherlands',
  'Österreich': 'Austria',
  'Russland': 'Russia',
  'Schweiz': 'Switzerland',
  'Vereinigtes Königreich': 'United Kingdom',
  
  // 中文 -> 英语
  '丹麦': 'Denmark',
};

async function fixCountryNames() {
  console.log('🔧 开始修复国家名称...\n');
  
  let totalFixed = 0;
  
  for (const [oldName, newName] of Object.entries(COUNTRY_NAME_MAP)) {
    if (newName === null) {
      console.log(`⚠️  跳过 "${oldName}" - 需要手动检查`);
      continue;
    }
    
    // 查找需要修复的记录数
    const count = await prisma.place.count({
      where: { country: oldName }
    });
    
    if (count === 0) {
      continue;
    }
    
    console.log(`📝 "${oldName}" -> "${newName}" (${count} 条记录)`);
    
    // 更新记录
    const result = await prisma.place.updateMany({
      where: { country: oldName },
      data: { country: newName }
    });
    
    totalFixed += result.count;
  }
  
  console.log(`\n✅ 修复完成，共更新 ${totalFixed} 条记录`);
  
  // 显示修复后的国家列表
  console.log('\n📊 修复后的国家列表:');
  const countries = await prisma.place.groupBy({
    by: ['country'],
    _count: { country: true },
    orderBy: { country: 'asc' }
  });
  
  for (const c of countries) {
    if (c.country) {
      console.log(`  ${c.country}: ${c._count.country}`);
    }
  }
}

fixCountryNames()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
