/**
 * Category Zh & Tags Migration Script
 * 回填 category_zh 并迁移旧分类到 tags
 * 
 * 使用方法:
 *   npx ts-node scripts/migrate-category-zh-and-tags.ts [--dry-run]
 */

import { PrismaClient } from '@prisma/client';
import { CATEGORY_ZH_NAMES } from '../src/constants/categories';

const prisma = new PrismaClient();

// 旧分类到标签的映射（这些分类应该变成 tags 而不是主分类）
const CATEGORY_TO_TAGS_MAP: Record<string, string[]> = {
  'brunch': ['meal:brunch'],
  'Brunch': ['meal:brunch'],
  'vintage': ['style:vintage'],
  'Vintage': ['style:vintage'],
  'architecture': ['domain:architecture'],
  'Architecture': ['domain:architecture'],
  'architecture_work': ['domain:architecture'],
  'feminist': ['theme:feminism'],
  'Feminist': ['theme:feminism'],
  'feminism': ['theme:feminism'],
  'secondhand': ['shop:secondhand'],
  'Secondhand': ['shop:secondhand'],
};

interface MigrationResult {
  placeId: string;
  placeName: string;
  categoryZhAdded: boolean;
  tagsAdded: string[];
  status: 'updated' | 'skipped' | 'error';
  error?: string;
}

async function runMigration(dryRun: boolean) {
  console.log(`\n🚀 Starting category_zh & tags migration...`);
  console.log(`   Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE'}\n`);

  const results: MigrationResult[] = [];
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  // 获取所有有 categorySlug 但没有 categoryZh 的记录
  const places = await prisma.place.findMany({
    where: {
      categorySlug: { not: null },
    },
    select: {
      id: true,
      name: true,
      category: true,
      categorySlug: true,
      categoryZh: true,
      tags: true,
      customFields: true,
    },
  });

  console.log(`📊 Found ${places.length} places to process\n`);

  for (const place of places) {
    const result: MigrationResult = {
      placeId: place.id,
      placeName: place.name,
      categoryZhAdded: false,
      tagsAdded: [],
      status: 'skipped',
    };

    try {
      const updates: any = {};
      let needsUpdate = false;

      // 1. 回填 category_zh
      if (!place.categoryZh && place.categorySlug) {
        const zhName = CATEGORY_ZH_NAMES[place.categorySlug];
        if (zhName) {
          updates.categoryZh = zhName;
          result.categoryZhAdded = true;
          needsUpdate = true;
        }
      }

      // 2. 检查原始分类是否需要迁移到 tags
      const customFields = (place.customFields as any) || {};
      const originalCategory = customFields.originalCategory || place.category;
      
      if (originalCategory && CATEGORY_TO_TAGS_MAP[originalCategory]) {
        const tagsToAdd = CATEGORY_TO_TAGS_MAP[originalCategory];
        const existingTags: string[] = Array.isArray(place.tags) ? (place.tags as string[]) : [];
        
        // 添加新标签（去重）
        const newTags = [...existingTags];
        for (const tag of tagsToAdd) {
          if (!newTags.includes(tag)) {
            newTags.push(tag);
            result.tagsAdded.push(tag);
          }
        }
        
        if (result.tagsAdded.length > 0) {
          updates.tags = newTags;
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        if (!dryRun) {
          await prisma.place.update({
            where: { id: place.id },
            data: updates,
          });
        }
        result.status = 'updated';
        updated++;
      } else {
        result.status = 'skipped';
        skipped++;
      }

      results.push(result);

      // 进度显示
      const processed = updated + skipped + errors;
      if (processed % 50 === 0 || processed === places.length) {
        process.stdout.write(`\r   Progress: ${processed}/${places.length}`);
      }
    } catch (error: any) {
      result.status = 'error';
      result.error = error.message;
      errors++;
      results.push(result);
    }
  }

  console.log('\n\n');

  // 打印报告
  console.log('═══════════════════════════════════════════════════════');
  console.log('              MIGRATION REPORT                          ');
  console.log('═══════════════════════════════════════════════════════\n');
  
  console.log(`📊 Summary:`);
  console.log(`   Total processed: ${places.length}`);
  console.log(`   ✅ Updated:      ${updated}`);
  console.log(`   ⏭️  Skipped:      ${skipped}`);
  console.log(`   ❌ Errors:       ${errors}`);
  console.log('');

  // 显示更新示例
  const updatedExamples = results.filter(r => r.status === 'updated').slice(0, 10);
  if (updatedExamples.length > 0) {
    console.log(`📝 Update examples:`);
    for (const r of updatedExamples) {
      console.log(`   "${r.placeName}"`);
      if (r.categoryZhAdded) console.log(`      + category_zh added`);
      if (r.tagsAdded.length > 0) console.log(`      + tags: ${r.tagsAdded.join(', ')}`);
    }
    console.log('');
  }

  // 统计标签迁移
  const tagStats: Record<string, number> = {};
  for (const r of results) {
    for (const tag of r.tagsAdded) {
      tagStats[tag] = (tagStats[tag] || 0) + 1;
    }
  }
  
  if (Object.keys(tagStats).length > 0) {
    console.log(`🏷️  Tags migration stats:`);
    for (const [tag, count] of Object.entries(tagStats).sort((a, b) => b[1] - a[1])) {
      console.log(`   ${tag}: ${count} places`);
    }
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════\n');

  if (dryRun) {
    console.log('💡 This was a dry run. No changes were made.');
    console.log('   Run without --dry-run to apply changes.\n');
  } else {
    console.log('✅ Migration completed successfully!\n');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  try {
    await runMigration(dryRun);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
