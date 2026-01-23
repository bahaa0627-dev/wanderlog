/**
 * 统一 Washington 相关的城市名称
 * 将所有 Washington 变体统一为 "Washington"
 * 
 * 变体包括：
 * - Washington
 * - Washington County
 * - Washington D.C.
 * - Washington, D.C.
 */

import prisma from '../src/config/database';

async function unifyWashingtonCities() {
  console.log('🔧 开始统一 Washington 城市名称...\n');

  // 需要统一的城市名称列表
  const washingtonVariants = [
    'Washington County',
    'Washington D.C.',
    'Washington, D.C.',
    'Washington DC',
    'Washington, DC',
  ];

  let totalUpdated = 0;

  // 统计当前各变体的数量
  console.log('📊 统一前的统计:');
  for (const variant of washingtonVariants) {
    const count = await prisma.place.count({
      where: {
        city: variant,
      },
    });
    if (count > 0) {
      console.log(`  ${variant}: ${count} 个地点`);
    }
  }

  // 检查是否已经有 "Washington" 的记录
  const existingWashington = await prisma.place.count({
    where: {
      city: 'Washington',
    },
  });
  console.log(`  Washington: ${existingWashington} 个地点\n`);

  // 统一每个变体
  for (const variant of washingtonVariants) {
    const result = await prisma.place.updateMany({
      where: {
        city: variant,
      },
      data: {
        city: 'Washington',
      },
    });

    if (result.count > 0) {
      console.log(`✅ 已将 ${result.count} 个 "${variant}" 统一为 "Washington"`);
      totalUpdated += result.count;
    }
  }

  // 最终统计
  console.log('\n📊 统一后的统计:');
  const finalCount = await prisma.place.count({
    where: {
      city: 'Washington',
    },
  });
  console.log(`  Washington: ${finalCount} 个地点`);

  // 检查是否还有未统一的变体
  console.log('\n🔍 检查是否还有未统一的变体:');
  for (const variant of washingtonVariants) {
    const count = await prisma.place.count({
      where: {
        city: variant,
      },
    });
    if (count > 0) {
      console.log(`  ⚠️  仍有 ${count} 个 "${variant}" 未统一`);
    }
  }

  console.log(`\n✅ 统一完成！共更新 ${totalUpdated} 个地点`);
  console.log(`📊 最终 Washington 城市共有 ${finalCount} 个地点`);

  await prisma.$disconnect();
}

unifyWashingtonCities().catch((error) => {
  console.error('❌ 统一失败:', error);
  process.exit(1);
});
