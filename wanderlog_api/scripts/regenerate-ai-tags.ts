/**
 * AI Tags Regeneration Script
 * 基于新的结构化 tags 重新生成 ai_tags
 * 
 * 使用方法:
 *   npx ts-node scripts/regenerate-ai-tags.ts [--dry-run] [--limit N]
 * 
 * Requirements: 7.2, 7.4
 */

import { PrismaClient } from '@prisma/client';
import { aiTagsGeneratorService, StructuredTags, AITagElement } from '../src/services/aiTagsGeneratorService';

const prisma = new PrismaClient();

// ============================================
// 类型定义
// ============================================

interface RegenerationResult {
  placeId: string;
  placeName: string;
  categorySlug: string;
  categoryEn: string;
  oldAiTags: unknown;
  newAiTags: AITagElement[];
  status: 'regenerated' | 'skipped' | 'error';
  error?: string;
}

interface RegenerationReport {
  total: number;
  regenerated: number;
  skipped: number;
  errors: number;
  aiTagStats: Record<string, number>;
  results: RegenerationResult[];
}


// ============================================
// 重新生成逻辑
// ============================================

/**
 * 重新生成单条记录的 ai_tags
 */
async function regeneratePlace(place: {
  id: string;
  name: string;
  categorySlug: string | null;
  categoryEn: string | null;
  tags: unknown;
  aiTags: unknown;
}): Promise<RegenerationResult> {
  const result: RegenerationResult = {
    placeId: place.id,
    placeName: place.name,
    categorySlug: place.categorySlug || 'shop',
    categoryEn: place.categoryEn || 'Shop',
    oldAiTags: place.aiTags,
    newAiTags: [],
    status: 'regenerated',
  };

  try {
    // 如果没有 categorySlug，跳过
    if (!place.categorySlug || !place.categoryEn) {
      result.status = 'skipped';
      return result;
    }
    
    // 解析 tags
    let structuredTags: StructuredTags | null = null;
    
    if (place.tags && typeof place.tags === 'object' && !Array.isArray(place.tags)) {
      structuredTags = place.tags as StructuredTags;
    } else if (Array.isArray(place.tags) && place.tags.length > 0) {
      // 如果还是旧格式且非空，跳过（应该先运行 migrate-tags-to-structured.ts）
      result.status = 'skipped';
      result.error = 'Tags not in structured format. Run migrate-tags-to-structured.ts first.';
      return result;
    } else {
      // 空数组或 null，使用空对象
      structuredTags = {};
    }
    
    // 如果 tags 为空对象，仍然尝试生成（可能基于其他信号）
    // 但如果没有任何标签数据，跳过
    if (!structuredTags || Object.keys(structuredTags).length === 0) {
      result.status = 'skipped';
      return result;
    }
    
    // 生成新的 ai_tags
    result.newAiTags = await aiTagsGeneratorService.generateAITags(
      structuredTags,
      place.categorySlug,
      place.categoryEn
    );
    
    return result;
  } catch (error: any) {
    result.status = 'error';
    result.error = error.message;
    return result;
  }
}

// ============================================
// 批量重新生成
// ============================================

interface PlaceRow {
  id: string;
  name: string;
  category_slug: string | null;
  category_en: string | null;
  tags: unknown;
  ai_tags: unknown;
}

/**
 * 执行批量重新生成
 */
async function runRegeneration(options: {
  dryRun: boolean;
  limit?: number;
  batchSize?: number;
}): Promise<RegenerationReport> {
  const { dryRun, limit, batchSize = 100 } = options;
  
  const report: RegenerationReport = {
    total: 0,
    regenerated: 0,
    skipped: 0,
    errors: 0,
    aiTagStats: {},
    results: [],
  };

  console.log(`\n🚀 Starting AI Tags regeneration...`);
  console.log(`   Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
  if (limit) console.log(`   Limit: ${limit} records`);
  console.log('');

  // 获取有 category_slug 的记录总数
  const countResult = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM places WHERE category_slug IS NOT NULL
  `;
  const totalCount = Number(countResult[0].count);
  const recordsToProcess = limit ? Math.min(limit, totalCount) : totalCount;
  
  console.log(`📊 Found ${totalCount} places with category_slug`);
  console.log(`   Will process: ${recordsToProcess} records\n`);

  let processed = 0;
  let offset = 0;

  while (processed < recordsToProcess) {
    const take = Math.min(batchSize, recordsToProcess - processed);
    
    // 使用原生 SQL 查询
    const places = await prisma.$queryRaw<PlaceRow[]>`
      SELECT id, name, category_slug, category_en, tags, ai_tags
      FROM places
      WHERE category_slug IS NOT NULL
      ORDER BY id ASC
      LIMIT ${take} OFFSET ${offset}
    `;

    if (places.length === 0) break;

    for (const place of places) {
      const placeData = {
        id: place.id,
        name: place.name,
        categorySlug: place.category_slug,
        categoryEn: place.category_en,
        tags: place.tags,
        aiTags: place.ai_tags,
      };
      
      const result = await regeneratePlace(placeData);
      report.results.push(result);
      report.total++;

      if (result.status === 'regenerated') {
        report.regenerated++;
        
        // 统计 ai_tags
        for (const tag of result.newAiTags) {
          const tagKey = `${tag.kind}:${tag.id}`;
          report.aiTagStats[tagKey] = (report.aiTagStats[tagKey] || 0) + 1;
        }

        // 执行数据库更新（非 dry-run 模式）
        if (!dryRun) {
          const aiTagsJson = JSON.stringify(result.newAiTags);
          await prisma.$executeRaw`
            UPDATE places 
            SET ai_tags = ${aiTagsJson}::jsonb
            WHERE id = ${place.id}::uuid
          `;
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

    offset += places.length;
  }

  console.log('\n');
  return report;
}


/**
 * 打印重新生成报告
 */
function printReport(report: RegenerationReport): void {
  console.log('═══════════════════════════════════════════════════════');
  console.log('         AI TAGS REGENERATION REPORT                    ');
  console.log('═══════════════════════════════════════════════════════\n');
  
  console.log(`📊 Summary:`);
  console.log(`   Total processed:  ${report.total}`);
  console.log(`   ✅ Regenerated:   ${report.regenerated}`);
  console.log(`   ⏭️  Skipped:       ${report.skipped}`);
  console.log(`   ❌ Errors:        ${report.errors}`);
  console.log('');

  // 显示 ai_tags 统计
  if (Object.keys(report.aiTagStats).length > 0) {
    console.log(`🏷️  AI Tags statistics (top 20):`);
    const sorted = Object.entries(report.aiTagStats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);
    
    for (const [tag, count] of sorted) {
      console.log(`   ${tag}: ${count} places`);
    }
    if (Object.keys(report.aiTagStats).length > 20) {
      console.log(`   ... and ${Object.keys(report.aiTagStats).length - 20} more`);
    }
    console.log('');
  }

  // 显示重新生成示例
  const regeneratedExamples = report.results.filter(r => r.status === 'regenerated').slice(0, 5);
  if (regeneratedExamples.length > 0) {
    console.log(`📝 Regeneration examples:`);
    for (const r of regeneratedExamples) {
      console.log(`   "${r.placeName}" (${r.categoryEn})`);
      console.log(`      Old: ${JSON.stringify(r.oldAiTags)}`);
      console.log(`      New: ${JSON.stringify(r.newAiTags.map(t => ({ kind: t.kind, id: t.id, en: t.en })))}`);
    }
    console.log('');
  }

  // 显示跳过原因示例
  const skippedWithReason = report.results.filter(r => r.status === 'skipped' && r.error).slice(0, 5);
  if (skippedWithReason.length > 0) {
    console.log(`⏭️  Skipped examples (with reason):`);
    for (const r of skippedWithReason) {
      console.log(`   "${r.placeName}": ${r.error}`);
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

/**
 * 保存报告到文件
 */
async function saveReport(report: RegenerationReport, dryRun: boolean): Promise<string> {
  const timestamp = Date.now();
  const filename = `migration_report_${timestamp}.json`;
  const filepath = `scripts/${filename}`;
  
  const reportData = {
    timestamp: new Date().toISOString(),
    mode: dryRun ? 'dry-run' : 'live',
    summary: {
      total: report.total,
      regenerated: report.regenerated,
      skipped: report.skipped,
      errors: report.errors,
    },
    aiTagStats: report.aiTagStats,
    // 只保存前 100 条结果
    sampleResults: report.results.slice(0, 100).map(r => ({
      placeId: r.placeId,
      placeName: r.placeName,
      categorySlug: r.categorySlug,
      status: r.status,
      newAiTagsCount: r.newAiTags.length,
      error: r.error,
    })),
  };
  
  const fs = await import('fs').then(m => m.promises);
  await fs.writeFile(filepath, JSON.stringify(reportData, null, 2));
  
  return filepath;
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
    const report = await runRegeneration({ dryRun, limit });
    printReport(report);
    
    // 保存报告
    const reportPath = await saveReport(report, dryRun);
    console.log(`📄 Report saved to: ${reportPath}\n`);
    
    if (dryRun) {
      console.log('💡 This was a dry run. No changes were made.');
      console.log('   Run without --dry-run to apply changes.\n');
    } else {
      console.log('✅ AI Tags regeneration completed successfully!\n');
    }
  } catch (error) {
    console.error('❌ Regeneration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
