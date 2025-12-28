/**
 * Category Migration Script
 * 历史数据分类迁移脚本
 * 
 * 将旧的 category 字段迁移到新的 category_slug + category_en 体系
 * 同时将部分旧分类（如 brunch, vintage）迁移到 tags
 * 
 * 使用方法:
 *   npx ts-node scripts/migrate-categories.ts [--dry-run] [--limit N]
 */

import { PrismaClient } from '@prisma/client';
import {
  CATEGORY_DISPLAY_NAMES,
  getMigrationMapping,
  isValidCategorySlug,
} from '../src/constants/categories';

const prisma = new PrismaClient();

// ============================================
// 类型定义
// ============================================

interface MigrationResult {
  placeId: string;
  placeName: string;
  oldCategory: string | null;
  newCategorySlug: string;
  newCategoryEn: string;
  migratedTags: string[];
  status: 'migrated' | 'skipped' | 'error';
  error?: string;
}

interface MigrationReport {
  total: number;
  migrated: number;
  skipped: number;
  errors: number;
  unmappedCategories: Map<string, number>;
  results: MigrationResult[];
}

// ============================================
// 迁移逻辑
// ============================================

/**
 * 迁移单条记录
 */
function migratePlace(place: {
  id: string;
  name: string;
  category: string | null;
  categorySlug: string | null;
  tags: any;
  customFields: any;
}): MigrationResult {
  const result: MigrationResult = {
    placeId: place.id,
    placeName: place.name,
    oldCategory: place.category,
    newCategorySlug: '',
    newCategoryEn: '',
    migratedTags: [],
    status: 'migrated',
  };

  try {
    // 如果已经有 category_slug，跳过
    if (place.categorySlug) {
      result.status = 'skipped';
      result.newCategorySlug = place.categorySlug;
      result.newCategoryEn = CATEGORY_DISPLAY_NAMES[place.categorySlug] || place.categorySlug;
      return result;
    }

    // 如果没有旧分类，使用 fallback
    if (!place.category) {
      result.newCategorySlug = 'shop';
      result.newCategoryEn = 'Shop';
      return result;
    }

    // 查找迁移映射
    const mapping = getMigrationMapping(place.category);
    
    if (mapping) {
      result.newCategorySlug = mapping.slug;
      result.newCategoryEn = CATEGORY_DISPLAY_NAMES[mapping.slug] || mapping.slug;
      
      // 如果有标签迁移
      if (mapping.tags) {
        result.migratedTags = mapping.tags;
      }
    } else {
      // 未映射的分类，尝试直接使用（如果是有效的 slug）
      const normalizedCategory = place.category.toLowerCase().replace(/\s+/g, '_');
      if (isValidCategorySlug(normalizedCategory)) {
        result.newCategorySlug = normalizedCategory;
        result.newCategoryEn = CATEGORY_DISPLAY_NAMES[normalizedCategory] || place.category;
      } else {
        // 无法映射，使用 shop 作为 fallback
        result.newCategorySlug = 'shop';
        result.newCategoryEn = 'Shop';
        result.status = 'migrated'; // 仍然标记为迁移，但记录未映射
      }
    }

    return result;
  } catch (error: any) {
    result.status = 'error';
    result.error = error.message;
    return result;
  }
}

/**
 * 执行批量迁移
 */
async function runMigration(options: {
  dryRun: boolean;
  limit?: number;
  batchSize?: number;
}): Promise<MigrationReport> {
  const { dryRun, limit, batchSize = 100 } = options;
  
  const report: MigrationReport = {
    total: 0,
    migrated: 0,
    skipped: 0,
    errors: 0,
    unmappedCategories: new Map(),
    results: [],
  };

  console.log(`\n🚀 Starting category migration...`);
  console.log(`   Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
  if (limit) console.log(`   Limit: ${limit} records`);
  console.log('');

  // 获取需要迁移的记录
  const whereClause = {
    categorySlug: null, // 只迁移还没有 category_slug 的记录
  };

  const totalCount = await prisma.place.count({ where: whereClause });
  const recordsToProcess = limit ? Math.min(limit, totalCount) : totalCount;
  
  console.log(`📊 Found ${totalCount} places without category_slug`);
  console.log(`   Will process: ${recordsToProcess} records\n`);

  let processed = 0;
  let cursor: string | undefined;

  while (processed < recordsToProcess) {
    const take = Math.min(batchSize, recordsToProcess - processed);
    
    const places = await prisma.place.findMany({
      where: whereClause,
      take,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        name: true,
        category: true,
        categorySlug: true,
        tags: true,
        customFields: true,
      },
    });

    if (places.length === 0) break;

    for (const place of places) {
      const result = migratePlace(place);
      report.results.push(result);
      report.total++;

      if (result.status === 'migrated') {
        report.migrated++;
        
        // 记录未映射的分类
        if (place.category && !getMigrationMapping(place.category)) {
          const count = report.unmappedCategories.get(place.category) || 0;
          report.unmappedCategories.set(place.category, count + 1);
        }

        // 执行数据库更新（非 dry-run 模式）
        if (!dryRun) {
          // 合并标签
          const existingTags = Array.isArray(place.tags) ? place.tags : [];
          const newTags = [...new Set([...existingTags, ...result.migratedTags])];
          
          // 更新 customFields
          const existingCustomFields = (place.customFields as Record<string, any>) || {};
          const newCustomFields = {
            ...existingCustomFields,
            originalCategory: place.category,
          };

          await prisma.place.update({
            where: { id: place.id },
            data: {
              categorySlug: result.newCategorySlug,
              categoryEn: result.newCategoryEn,
              tags: newTags,
              customFields: newCustomFields,
            },
          });
        }
      } else if (result.status === 'skipped') {
        report.skipped++;
      } else {
        report.errors++;
      }

      processed++;
      
      // 进度显示
      if (processed % 50 === 0 || processed === recordsToProcess) {
        const percent = Math.round((processed / recordsToProcess) * 100);
        process.stdout.write(`\r   Progress: ${processed}/${recordsToProcess} (${percent}%)`);
      }
    }

    cursor = places[places.length - 1]?.id;
  }

  console.log('\n');
  return report;
}

/**
 * 打印迁移报告
 */
function printReport(report: MigrationReport): void {
  console.log('═══════════════════════════════════════════════════════');
  console.log('                   MIGRATION REPORT                     ');
  console.log('═══════════════════════════════════════════════════════\n');
  
  console.log(`📊 Summary:`);
  console.log(`   Total processed: ${report.total}`);
  console.log(`   ✅ Migrated:     ${report.migrated}`);
  console.log(`   ⏭️  Skipped:      ${report.skipped}`);
  console.log(`   ❌ Errors:       ${report.errors}`);
  console.log('');

  if (report.unmappedCategories.size > 0) {
    console.log(`⚠️  Unmapped categories (used fallback):`);
    const sorted = [...report.unmappedCategories.entries()].sort((a, b) => b[1] - a[1]);
    for (const [category, count] of sorted.slice(0, 20)) {
      console.log(`   - "${category}": ${count} places`);
    }
    if (sorted.length > 20) {
      console.log(`   ... and ${sorted.length - 20} more`);
    }
    console.log('');
  }

  // 显示部分迁移结果示例
  const migratedExamples = report.results.filter(r => r.status === 'migrated').slice(0, 5);
  if (migratedExamples.length > 0) {
    console.log(`📝 Migration examples:`);
    for (const r of migratedExamples) {
      console.log(`   "${r.placeName}"`);
      console.log(`      ${r.oldCategory || '(null)'} → ${r.newCategorySlug} (${r.newCategoryEn})`);
      if (r.migratedTags.length > 0) {
        console.log(`      + tags: ${r.migratedTags.join(', ')}`);
      }
    }
    console.log('');
  }

  if (report.errors > 0) {
    console.log(`❌ Error examples:`);
    const errorExamples = report.results.filter(r => r.status === 'error').slice(0, 5);
    for (const r of errorExamples) {
      console.log(`   "${r.placeName}": ${r.error}`);
    }
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════\n');
}

// ============================================
// 主函数
// ============================================

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : undefined;

  try {
    const report = await runMigration({ dryRun, limit });
    printReport(report);
    
    if (dryRun) {
      console.log('💡 This was a dry run. No changes were made.');
      console.log('   Run without --dry-run to apply changes.\n');
    } else {
      console.log('✅ Migration completed successfully!\n');
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
