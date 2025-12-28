/**
 * Tags Migration Script
 * 将旧的 string[] tags 迁移到新的结构化 jsonb 格式
 * 
 * 使用方法:
 *   npx ts-node scripts/migrate-tags-to-structured.ts [--dry-run] [--limit N]
 * 
 * Requirements: 7.1, 7.3
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ============================================
// 类型定义
// ============================================

/**
 * 新的结构化 tags 格式
 */
interface StructuredTags {
  style?: string[];        // ["Brutalist", "ArtDeco"]
  theme?: string[];        // ["feminism"]
  award?: string[];        // ["pritzker"]
  meal?: string[];         // ["brunch"]
  cuisine?: string[];      // ["Japanese", "Korean"]
  architectQ?: string[];   // ["Q82840"] - Wikidata QID
  personQ?: string[];      // ["Q254"] - Wikidata QID
  alt_category?: string[]; // ["museum"]
  [key: string]: string[] | undefined;
}

interface MigrationResult {
  placeId: string;
  placeName: string;
  oldTags: unknown;
  newTags: StructuredTags;
  status: 'migrated' | 'skipped' | 'error';
  error?: string;
}

interface MigrationReport {
  total: number;
  migrated: number;
  skipped: number;
  errors: number;
  tagStats: Record<string, number>;
  results: MigrationResult[];
}

// ============================================
// 标签前缀到结构化键的映射
// ============================================

const TAG_PREFIX_MAP: Record<string, keyof StructuredTags> = {
  'style': 'style',
  'theme': 'theme',
  'award': 'award',
  'meal': 'meal',
  'cuisine': 'cuisine',
  'architect': 'architectQ',
  'person': 'personQ',
  'alt_category': 'alt_category',
  'domain': 'theme',        // domain:architecture -> theme:architecture
  'shop': 'style',          // shop:secondhand -> style:secondhand
  'lodging': 'style',       // lodging:hostel -> style:hostel
};

// 特殊标签映射（无前缀的标签）
const SPECIAL_TAG_MAP: Record<string, { key: keyof StructuredTags; value: string }> = {
  'pritzker': { key: 'award', value: 'pritzker' },
  'brunch': { key: 'meal', value: 'brunch' },
  'vintage': { key: 'style', value: 'vintage' },
  'secondhand': { key: 'style', value: 'secondhand' },
  'feminist': { key: 'theme', value: 'feminism' },
  'feminism': { key: 'theme', value: 'feminism' },
  'architecture': { key: 'theme', value: 'architecture' },
};


// ============================================
// 迁移逻辑
// ============================================

/**
 * 将旧的 string[] tags 转换为新的结构化 jsonb 格式
 */
function convertTagsToStructured(oldTags: unknown): StructuredTags {
  const newTags: StructuredTags = {};
  
  // 如果已经是对象格式，检查是否需要转换
  if (oldTags && typeof oldTags === 'object' && !Array.isArray(oldTags)) {
    // 已经是结构化格式，直接返回（可能需要清理）
    const existingTags = oldTags as Record<string, unknown>;
    for (const [key, value] of Object.entries(existingTags)) {
      if (Array.isArray(value) && value.every(v => typeof v === 'string')) {
        newTags[key] = value as string[];
      }
    }
    return newTags;
  }
  
  // 如果不是数组，返回空对象
  if (!Array.isArray(oldTags)) {
    return newTags;
  }
  
  // 处理 string[] 格式
  for (const tag of oldTags) {
    if (typeof tag !== 'string') continue;
    
    const trimmedTag = tag.trim();
    if (!trimmedTag) continue;
    
    // 检查是否有前缀 (prefix:value 格式)
    const colonIndex = trimmedTag.indexOf(':');
    
    if (colonIndex > 0) {
      const prefix = trimmedTag.substring(0, colonIndex).toLowerCase();
      const value = trimmedTag.substring(colonIndex + 1);
      
      // 查找映射的键
      const targetKey = TAG_PREFIX_MAP[prefix];
      
      if (targetKey) {
        if (!newTags[targetKey]) {
          newTags[targetKey] = [];
        }
        // 避免重复
        if (!newTags[targetKey]!.includes(value)) {
          newTags[targetKey]!.push(value);
        }
      } else {
        // 未知前缀，保留原样到对应的键
        const unknownKey = prefix as keyof StructuredTags;
        if (!newTags[unknownKey]) {
          newTags[unknownKey] = [];
        }
        if (!newTags[unknownKey]!.includes(value)) {
          newTags[unknownKey]!.push(value);
        }
      }
    } else {
      // 无前缀的标签，检查特殊映射
      const lowerTag = trimmedTag.toLowerCase();
      const specialMapping = SPECIAL_TAG_MAP[lowerTag];
      
      if (specialMapping) {
        if (!newTags[specialMapping.key]) {
          newTags[specialMapping.key] = [];
        }
        if (!newTags[specialMapping.key]!.includes(specialMapping.value)) {
          newTags[specialMapping.key]!.push(specialMapping.value);
        }
      } else {
        // 未知标签，放入 theme 数组
        if (!newTags.theme) {
          newTags.theme = [];
        }
        if (!newTags.theme.includes(trimmedTag)) {
          newTags.theme.push(trimmedTag);
        }
      }
    }
  }
  
  return newTags;
}

/**
 * 迁移单条记录
 */
function migratePlace(place: {
  id: string;
  name: string;
  tags: unknown;
  customFields: unknown;
}, forceConvertEmptyArrays: boolean = false): MigrationResult {
  const result: MigrationResult = {
    placeId: place.id,
    placeName: place.name,
    oldTags: place.tags,
    newTags: {},
    status: 'migrated',
  };

  try {
    // 检查是否已经是结构化格式（非数组对象）
    if (place.tags && typeof place.tags === 'object' && !Array.isArray(place.tags)) {
      // 已经是对象格式，跳过
      result.status = 'skipped';
      result.newTags = place.tags as StructuredTags;
      return result;
    }
    
    // 如果是空数组
    if (Array.isArray(place.tags) && place.tags.length === 0) {
      if (forceConvertEmptyArrays) {
        // 强制转换空数组为空对象
        result.newTags = {};
        result.status = 'migrated';
        return result;
      } else {
        result.status = 'skipped';
        result.newTags = {};
        return result;
      }
    }
    
    // 如果 tags 为 null 或 undefined
    if (!place.tags) {
      result.status = 'skipped';
      result.newTags = {};
      return result;
    }
    
    // 转换非空数组标签
    result.newTags = convertTagsToStructured(place.tags);
    
    return result;
  } catch (error: any) {
    result.status = 'error';
    result.error = error.message;
    return result;
  }
}


// ============================================
// 批量迁移
// ============================================

/**
 * 执行批量迁移
 */
async function runMigration(options: {
  dryRun: boolean;
  limit?: number;
  batchSize?: number;
  forceConvertEmptyArrays?: boolean;
}): Promise<MigrationReport> {
  const { dryRun, limit, batchSize = 100, forceConvertEmptyArrays = false } = options;
  
  const report: MigrationReport = {
    total: 0,
    migrated: 0,
    skipped: 0,
    errors: 0,
    tagStats: {},
    results: [],
  };

  console.log(`\n🚀 Starting tags migration to structured format...`);
  console.log(`   Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
  if (forceConvertEmptyArrays) console.log(`   Force convert empty arrays: YES`);
  if (limit) console.log(`   Limit: ${limit} records`);
  console.log('');

  // 获取总记录数
  const totalCount = await prisma.place.count();
  const recordsToProcess = limit ? Math.min(limit, totalCount) : totalCount;
  
  console.log(`📊 Found ${totalCount} places total`);
  console.log(`   Will process: ${recordsToProcess} records\n`);

  let processed = 0;
  let cursor: string | undefined;

  while (processed < recordsToProcess) {
    const take = Math.min(batchSize, recordsToProcess - processed);
    
    const places = await prisma.place.findMany({
      take,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        name: true,
        tags: true,
        customFields: true,
      },
    });

    if (places.length === 0) break;

    for (const place of places) {
      const result = migratePlace(place, forceConvertEmptyArrays);
      report.results.push(result);
      report.total++;

      if (result.status === 'migrated') {
        report.migrated++;
        
        // 统计标签
        for (const [key, values] of Object.entries(result.newTags)) {
          if (Array.isArray(values)) {
            for (const value of values) {
              const tagKey = `${key}:${value}`;
              report.tagStats[tagKey] = (report.tagStats[tagKey] || 0) + 1;
            }
          }
        }

        // 执行数据库更新（非 dry-run 模式）
        if (!dryRun) {
          // 保存原始数据到 custom_fields.migration_backup
          const existingCustomFields = (place.customFields as Record<string, any>) || {};
          const newCustomFields = {
            ...existingCustomFields,
            migration_backup: {
              tags: place.tags,
              migratedAt: new Date().toISOString(),
            },
          };

          await prisma.place.update({
            where: { id: place.id },
            data: {
              tags: result.newTags,
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
  console.log('           TAGS MIGRATION REPORT                        ');
  console.log('═══════════════════════════════════════════════════════\n');
  
  console.log(`📊 Summary:`);
  console.log(`   Total processed: ${report.total}`);
  console.log(`   ✅ Migrated:     ${report.migrated}`);
  console.log(`   ⏭️  Skipped:      ${report.skipped}`);
  console.log(`   ❌ Errors:       ${report.errors}`);
  console.log('');

  // 显示标签统计
  if (Object.keys(report.tagStats).length > 0) {
    console.log(`🏷️  Tag statistics (top 20):`);
    const sorted = Object.entries(report.tagStats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);
    
    for (const [tag, count] of sorted) {
      console.log(`   ${tag}: ${count} places`);
    }
    if (Object.keys(report.tagStats).length > 20) {
      console.log(`   ... and ${Object.keys(report.tagStats).length - 20} more`);
    }
    console.log('');
  }

  // 显示迁移示例
  const migratedExamples = report.results.filter(r => r.status === 'migrated').slice(0, 5);
  if (migratedExamples.length > 0) {
    console.log(`📝 Migration examples:`);
    for (const r of migratedExamples) {
      console.log(`   "${r.placeName}"`);
      console.log(`      Old: ${JSON.stringify(r.oldTags)}`);
      console.log(`      New: ${JSON.stringify(r.newTags)}`);
    }
    console.log('');
  }

  // 显示错误示例
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
  const forceEmpty = args.includes('--force-empty');
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : undefined;

  try {
    const report = await runMigration({ dryRun, limit, forceConvertEmptyArrays: forceEmpty });
    printReport(report);
    
    if (dryRun) {
      console.log('💡 This was a dry run. No changes were made.');
      console.log('   Run without --dry-run to apply changes.\n');
    } else {
      console.log('✅ Tags migration completed successfully!\n');
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
