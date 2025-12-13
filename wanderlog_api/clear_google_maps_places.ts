/**
 * 清空从 Google Maps 链接导入的地点
 * 保留手动添加的测试地点
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearGoogleMapsPlaces() {
  try {
    console.log('🗑️  清空从 Google Maps 链接导入的地点...\n');

    // 获取统计信息
    const beforeCount = await prisma.publicPlace.groupBy({
      by: ['source'],
      _count: true,
    });

    console.log('📊 清空前统计:');
    beforeCount.forEach(item => {
      console.log(`  ${item.source}: ${item._count} 个地点`);
    });
    console.log();

    // 删除所有来自 google_maps_link 的地点
    const result = await prisma.publicPlace.deleteMany({
      where: {
        source: 'google_maps_link'
      }
    });

    console.log(`✅ 已删除 ${result.count} 个从 Google Maps 链接导入的地点\n`);

    // 获取清空后的统计信息
    const afterCount = await prisma.publicPlace.groupBy({
      by: ['source'],
      _count: true,
    });

    console.log('📊 清空后统计:');
    if (afterCount.length === 0) {
      console.log('  (数据库为空)');
    } else {
      afterCount.forEach(item => {
        console.log(`  ${item.source}: ${item._count} 个地点`);
      });
    }

    console.log('\n✨ 清空完成！可以重新导入了。');

  } catch (error: any) {
    console.error('❌ 错误:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

clearGoogleMapsPlaces();
