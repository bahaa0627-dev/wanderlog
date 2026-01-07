/**
 * Fix Tags Structure Script
 * 将 tags.style = ["Architecture"] 改为 tags.type = ["Architecture"]
 * style 字段放真正的建筑风格（如果有的话）
 *
 * 使用方法：
 *   npx ts-node scripts/fix-tags-structure.ts [options]
 *
 * 选项：
 *   --limit <n>     限制处理数量
 *   --dry-run       只预览，不写入数据库
 */

import prisma from '../src/config/database';

function parseArgs(): { limit?: number; dryRun: boolean } {
  const args = process.argv.slice(2);
  let limit: number | undefined;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }

  return { limit, dryRun };
}

async function main() {
  console.log('='.repeat(60));
  console.log('Fix Tags Structure Script');
  console.log('将 style: ["Architecture"] 改为 type: ["Architecture"]');
  console.log('='.repeat(60));

  const { limit, dryRun } = parseArgs();

  console.log('\n配置:');
  console.log(`  - 处理限制: ${limit || '全部'}`);
  console.log(`  - 模式: ${dryRun ? '预览 (dry-run)' : '实际写入'}`);

  // 查询所有 wikidata 来源的建筑
  const places = await prisma.place.findMany({
    where: {
      source: 'wikidata',
      sourceDetail: { not: null },
    },
    select: {
      id: true,
      name: true,
      tags: true,
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
  });

  console.log(`\n找到 ${places.length} 个建筑需要处理`);

  let updatedCount = 0;
  let alreadyFixedCount = 0;

  for (let i = 0; i < places.length; i++) {
    const place = places[i];
    const tags = (place.tags as any) || {};
    const progress = `[${i + 1}/${places.length}]`;

    // 检查当前状态
    const currentStyle = tags.style || [];
    const currentType = tags.type || [];

    // 如果已经有 type 字段，跳过
    if (currentType.length > 0) {
      console.log(`${progress} ${place.name}: 已有 type 字段，跳过`);
      alreadyFixedCount++;
      continue;
    }
    
    // 检查 style 是否有真正的风格（非 Architecture）
    const realStyles = currentStyle.filter((s: string) => s !== 'Architecture');

    // 构建新的 tags
    const newTags = {
      ...tags,
      type: ['Architecture'], // 所有建筑都是 Architecture 类型
      style: realStyles,      // 只保留真正的风格，没有则为空数组
    };

    if (!dryRun) {
      await prisma.place.update({
        where: { id: place.id },
        data: {
          tags: newTags,
          updatedAt: new Date(),
        },
      });
    }

    if (realStyles.length > 0) {
      console.log(`${progress} ${place.name}: type=Architecture, style=${realStyles.join(', ')}`);
    } else {
      console.log(`${progress} ${place.name}: type=Architecture, style=[]`);
    }
    updatedCount++;
  }

  console.log('\n' + '='.repeat(60));
  console.log('处理完成');
  console.log('='.repeat(60));
  console.log(`\n统计:`);
  console.log(`  - 总数: ${places.length}`);
  console.log(`  - 已更新: ${updatedCount}`);
  console.log(`  - 已有 type 字段: ${alreadyFixedCount}`);

  if (dryRun) {
    console.log('\n⚠️ 这是预览模式，数据库未被修改');
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('脚本执行失败:', error);
  prisma.$disconnect();
  process.exit(1);
});
