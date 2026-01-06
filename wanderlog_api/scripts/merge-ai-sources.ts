/**
 * 合并 AI 相关的来源字段为 ai_search
 * 
 * 将以下来源统一为 ai_search:
 * - ai_generated
 * - ai_chat
 * - google_maps_ai
 * - ai
 * 
 * 运行方式：
 * cd wanderlog_api && npx ts-node scripts/merge-ai-sources.ts
 */

import dotenv from 'dotenv';
import path from 'path';
import { PrismaClient } from '@prisma/client';

// Load .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// 使用 DIRECT_URL 直连数据库
const directUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!directUrl) {
  console.error('❌ DIRECT_URL 或 DATABASE_URL 未配置');
  process.exit(1);
}

const prisma = new PrismaClient({
  datasources: {
    db: { url: directUrl },
  },
});

const AI_SOURCES_TO_MERGE = ['ai_generated', 'ai_chat', 'google_maps_ai', 'ai'];
const TARGET_SOURCE = 'ai_search';

async function mergeAiSources() {
  console.log('🔍 查找需要合并的 AI 来源...\n');

  // 先统计各来源的数量
  for (const source of AI_SOURCES_TO_MERGE) {
    const count = await prisma.place.count({
      where: { source },
    });
    console.log(`   ${source}: ${count} 个地点`);
  }

  // 执行批量更新
  console.log(`\n🔄 正在将以上来源合并为 "${TARGET_SOURCE}"...\n`);

  const result = await prisma.place.updateMany({
    where: {
      source: { in: AI_SOURCES_TO_MERGE },
    },
    data: {
      source: TARGET_SOURCE,
    },
  });

  console.log(`✅ 已更新 ${result.count} 个地点的来源为 "${TARGET_SOURCE}"`);

  // 验证结果
  console.log('\n📊 更新后的来源统计:');
  const sources = await prisma.$queryRaw<{ source: string; count: bigint }[]>`
    SELECT source, COUNT(*) as count 
    FROM places 
    WHERE source IS NOT NULL 
    GROUP BY source 
    ORDER BY count DESC
  `;

  for (const s of sources) {
    console.log(`   ${s.source}: ${s.count}`);
  }
}

async function main() {
  console.log('🚀 开始合并 AI 来源...\n');

  try {
    await mergeAiSources();
    console.log('\n✨ 完成!');
  } catch (error) {
    console.error('💥 脚本执行失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
