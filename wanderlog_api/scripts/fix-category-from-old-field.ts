/**
 * 修复 category_slug 从旧的 category 字段
 * 
 * 问题：很多记录的 category_slug 是 'shop'（fallback），
 * 但旧的 category 字段有正确的分类信息（如 Temple, Monument, Cathedral 等）
 */

import { PrismaClient } from '@prisma/client';
import { CATEGORY_MIGRATION_MAP, CATEGORY_DISPLAY_NAMES, CATEGORY_ZH_NAMES } from '../src/constants/categories';
import { aiTagsGeneratorService, StructuredTags } from '../src/services/aiTagsGeneratorService';

const prisma = new PrismaClient();

interface MigrationStats {
  total: number;
  updated: number;
  skipped: number;
  unmapped: Map<string, number>;
  errors: string[];
}

async function fixCategories(dryRun: boolean = true): Promise<MigrationStats> {
  const stats: MigrationStats = {
    total: 0,
    updated: 0,
    skipped: 0,
    unmapped: new Map(),
    errors: [],
  };

  console.log(`\n🚀 开始修复 category_slug (dry-run: ${dryRun})\n`);

  // 查询所有 category_slug 为 shop 但有旧 category 字段的记录
  const places = await prisma.place.findMany({
    where: {
      categorySlug: 'shop',
      category: {
        not: null,
      },
    },
    select: {
      id: true,
      name: true,
      category: true,
      categorySlug: true,
      tags: true,
      aiTags: true,
    },
  });

  stats.total = places.length;
  console.log(`📊 找到 ${places.length} 条 category_slug='shop' 且有旧 category 的记录\n`);

  for (const place of places) {
    try {
      const oldCategory = place.category;
      if (!oldCategory) {
        stats.skipped++;
        continue;
      }

      // 查找映射
      const mapping = CATEGORY_MIGRATION_MAP[oldCategory] || CATEGORY_MIGRATION_MAP[oldCategory.toLowerCase()];
      
      if (!mapping) {
        // 记录未映射的分类
        const count = stats.unmapped.get(oldCategory) || 0;
        stats.unmapped.set(oldCategory, count + 1);
        stats.skipped++;
        continue;
      }

      // 如果映射到的还是 shop，跳过
      if (mapping.slug === 'shop') {
        stats.skipped++;
        continue;
      }

      const newSlug = mapping.slug;
      const newEn = CATEGORY_DISPLAY_NAMES[newSlug] || newSlug;
      const newZh = CATEGORY_ZH_NAMES[newSlug] || newSlug;

      // 更新 tags（如果映射有额外的 tags）
      let newTags = place.tags as StructuredTags | null;
      if (mapping.tags && mapping.tags.length > 0) {
        newTags = newTags || {};
        for (const tag of mapping.tags) {
          const colonIndex = tag.indexOf(':');
          if (colonIndex > 0) {
            const key = tag.substring(0, colonIndex) as keyof StructuredTags;
            const value = tag.substring(colonIndex + 1);
            if (!newTags[key]) {
              newTags[key] = [];
            }
            if (!newTags[key]!.includes(value)) {
              newTags[key]!.push(value);
            }
          }
        }
      }

      // 重新生成 ai_tags
      const aiTags = await aiTagsGeneratorService.generateAITags(newTags, newSlug, newEn);

      if (!dryRun) {
        await prisma.place.update({
          where: { id: place.id },
          data: {
            categorySlug: newSlug,
            categoryEn: newEn,
            categoryZh: newZh,
            tags: newTags as any,
            aiTags: aiTags as any,
          },
        });
      }

      console.log(`  ✅ ${place.name}: ${oldCategory} → ${newSlug}`);
      stats.updated++;

    } catch (error: any) {
      stats.errors.push(`${place.name}: ${error.message}`);
      console.error(`  ❌ ${place.name}: ${error.message}`);
    }
  }

  return stats;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');

  if (dryRun) {
    console.log('⚠️  DRY-RUN 模式：不会实际修改数据');
    console.log('   使用 --execute 参数来执行实际修复\n');
  }

  try {
    const stats = await fixCategories(dryRun);

    console.log('\n' + '='.repeat(50));
    console.log('📊 修复统计');
    console.log('='.repeat(50));
    console.log(`  总记录数: ${stats.total}`);
    console.log(`  已更新: ${stats.updated}`);
    console.log(`  已跳过: ${stats.skipped}`);
    
    if (stats.unmapped.size > 0) {
      console.log('\n  未映射的旧分类:');
      const sortedUnmapped = Array.from(stats.unmapped.entries())
        .sort((a, b) => b[1] - a[1]);
      for (const [cat, count] of sortedUnmapped) {
        console.log(`    - "${cat}": ${count} 条`);
      }
    }
    
    if (stats.errors.length > 0) {
      console.log(`\n  错误: ${stats.errors.length}`);
      for (const err of stats.errors.slice(0, 10)) {
        console.log(`    - ${err}`);
      }
    }
    console.log('='.repeat(50));

    if (dryRun && stats.updated > 0) {
      console.log('\n✅ 预览完成。使用 --execute 参数执行实际修复。');
    }

  } catch (error) {
    console.error('修复失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
