/**
 * 快速清理和修复数据库
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function quickFix() {
  console.log('🔧 快速修复数据...\n');

  // 1. 将所有 Copenhagen 改为对应的泰语城市名或 Chiang Mai
  const updateCopenhagen = await prisma.publicPlace.updateMany({
    where: {
      city: 'Copenhagen',
      country: 'Thailand'
    },
    data: {
      city: 'Chiang Mai'
    }
  });

  console.log(`✅ 已将 ${updateCopenhagen.count} 个地点的城市从 Copenhagen 改为 Chiang Mai`);

  // 2. 翻译所有中文分类
  const chineseCategories = [
    { from: '餐厅', to: 'restaurant' },
    { from: '咖啡馆', to: 'cafe' },
    { from: '商店', to: 'store' },
    { from: '酒吧', to: 'bar' },
    { from: '景点', to: 'tourist_attraction' },
    { from: '博物馆', to: 'museum' },
    { from: '面包店', to: 'bakery' },
    { from: '其他', to: 'other' }
  ];

  for (const cat of chineseCategories) {
    const updated = await prisma.publicPlace.updateMany({
      where: { category: cat.from },
      data: { category: cat.to }
    });
    if (updated.count > 0) {
      console.log(`✅ 已翻译 ${updated.count} 个 "${cat.from}" -> "${cat.to}"`);
    }
  }

  // 3. 显示最终统计
  console.log('\n📊 最终统计:');
  const stats = await prisma.publicPlace.groupBy({
    by: ['city', 'country'],
    where: {
      source: 'google_maps_link'
    },
    _count: true
  });

  stats.forEach(stat => {
    console.log(`  ${stat.city}, ${stat.country}: ${stat._count} 个地点`);
  });

  console.log('\n✅ 修复完成！');

  await prisma.$disconnect();
}

quickFix();
