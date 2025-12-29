/**
 * 修复 isVerified 字段
 * 规则：有 googlePlaceId 的记录，isVerified 应该为 true
 */

import prisma from '../src/config/database';

async function main() {
  console.log('🔍 检查 isVerified 字段...\n');

  // 统计
  const stats = await prisma.place.groupBy({
    by: ['isVerified'],
    _count: true,
  });
  
  console.log('当前状态:');
  for (const s of stats) {
    console.log(`  isVerified=${s.isVerified}: ${s._count} 条`);
  }

  // 查找需要修复的记录：有 googlePlaceId 但 isVerified = false
  const needFix = await prisma.place.count({
    where: {
      googlePlaceId: { not: null },
      isVerified: false,
    }
  });

  console.log(`\n需要修复: ${needFix} 条 (有 googlePlaceId 但 isVerified=false)`);

  if (needFix === 0) {
    console.log('✅ 无需修复');
    return;
  }

  // 执行修复
  console.log('\n🔄 开始修复...');
  const result = await prisma.place.updateMany({
    where: {
      googlePlaceId: { not: null },
      isVerified: false,
    },
    data: {
      isVerified: true,
    }
  });

  console.log(`✅ 修复完成: ${result.count} 条`);

  // 验证
  const afterStats = await prisma.place.groupBy({
    by: ['isVerified'],
    _count: true,
  });
  
  console.log('\n修复后状态:');
  for (const s of afterStats) {
    console.log(`  isVerified=${s.isVerified}: ${s._count} 条`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
