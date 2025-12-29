/**
 * 迁移脚本：从 customFields.priceText 迁移到 price 字段
 * 
 * 检查历史数据中 customFields 里是否有 priceText 数据，
 * 如果 price 字段为空，则将 priceText 迁移到 price 字段
 */

import prisma from '../src/config/database';

async function main() {
  console.log('🔍 检查历史数据中的 price 信息...\n');

  // 1. 统计总体情况
  const totalPlaces = await prisma.place.count();
  
  // 查询所有地点的 customFields 和 price
  const allPlaces = await prisma.place.findMany({
    select: {
      id: true,
      name: true,
      price: true,
      priceLevel: true,
      customFields: true,
    }
  });

  let withPrice = 0;
  let withPriceText = 0;
  let withPriceLevel = 0;
  let needMigration = 0;
  const toMigrate: { id: string; name: string; priceText: string }[] = [];

  for (const place of allPlaces) {
    if (place.price) withPrice++;
    if (place.priceLevel !== null) withPriceLevel++;
    
    const cf = place.customFields as Record<string, unknown> | null;
    if (cf && typeof cf === 'object') {
      const priceText = cf.priceText as string | undefined;
      if (priceText) {
        withPriceText++;
        // 如果 price 字段为空，需要迁移
        if (!place.price) {
          needMigration++;
          toMigrate.push({
            id: place.id,
            name: place.name,
            priceText: priceText
          });
        }
      }
    }
  }

  console.log('📊 统计结果:');
  console.log(`   总地点数: ${totalPlaces}`);
  console.log(`   有 price 字段: ${withPrice}`);
  console.log(`   有 priceLevel 字段: ${withPriceLevel}`);
  console.log(`   有 customFields.priceText: ${withPriceText}`);
  console.log(`   需要迁移 (priceText → price): ${needMigration}`);
  console.log('');

  if (toMigrate.length === 0) {
    console.log('✅ 无需迁移，所有 priceText 数据已在 price 字段中');
    return;
  }

  // 显示前 10 条需要迁移的数据
  console.log('📋 需要迁移的数据示例 (前10条):');
  for (const item of toMigrate.slice(0, 10)) {
    console.log(`   - ${item.name}: "${item.priceText}"`);
  }
  if (toMigrate.length > 10) {
    console.log(`   ... 还有 ${toMigrate.length - 10} 条`);
  }
  console.log('');

  // 执行迁移
  console.log('🔄 开始迁移...');
  let migrated = 0;
  let failed = 0;

  for (const item of toMigrate) {
    try {
      await prisma.place.update({
        where: { id: item.id },
        data: { price: item.priceText }
      });
      migrated++;
    } catch (e) {
      console.error(`   ❌ 迁移失败: ${item.name} - ${(e as Error).message}`);
      failed++;
    }
  }

  console.log('');
  console.log('✅ 迁移完成!');
  console.log(`   成功: ${migrated}`);
  console.log(`   失败: ${failed}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
