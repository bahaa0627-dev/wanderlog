/**
 * 检查数据库中 tags 和 ai_tags 字段的数据情况
 */

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('📊 检查 tags 和 ai_tags 数据情况\n');

  // 1. 统计总数
  const total = await prisma.place.count();
  console.log(`总地点数: ${total}`);

  // 2. 统计有 tags 的数量 (非空对象)
  const withTags = await prisma.place.count({
    where: {
      NOT: {
        tags: { equals: Prisma.JsonNull },
      },
    },
  });
  console.log(`有 tags 的地点: ${withTags} (${((withTags / total) * 100).toFixed(1)}%)`);

  // 3. 统计有 ai_tags 的数量 (非空数组)
  const withAiTags = await prisma.place.count({
    where: {
      NOT: {
        aiTags: { equals: Prisma.JsonNull },
      },
    },
  });
  console.log(`有 ai_tags 的地点: ${withAiTags} (${((withAiTags / total) * 100).toFixed(1)}%)`);

  // 4. 统计有 categoryEn 的数量
  const withCategoryEn = await prisma.place.count({
    where: {
      categoryEn: {
        not: null,
      },
    },
  });
  console.log(`有 categoryEn 的地点: ${withCategoryEn} (${((withCategoryEn / total) * 100).toFixed(1)}%)`);

  // 5. 查看一些示例数据
  console.log('\n📋 示例数据 (前 5 条有 ai_tags 的记录):');
  const samples = await prisma.place.findMany({
    where: {
      NOT: {
        aiTags: { equals: [] },
      },
    },
    select: {
      name: true,
      city: true,
      categoryEn: true,
      categoryZh: true,
      tags: true,
      aiTags: true,
    },
    take: 5,
  });

  for (const sample of samples) {
    console.log(`\n  名称: ${sample.name}`);
    console.log(`  城市: ${sample.city}`);
    console.log(`  分类: ${sample.categoryEn} / ${sample.categoryZh}`);
    console.log(`  tags: ${JSON.stringify(sample.tags)}`);
    console.log(`  ai_tags: ${JSON.stringify(sample.aiTags)}`);
  }

  // 6. 查看没有 ai_tags 的示例
  console.log('\n📋 示例数据 (前 5 条 ai_tags 为空的记录):');
  const samplesNoAiTags = await prisma.place.findMany({
    where: {
      aiTags: { equals: [] },
    },
    select: {
      name: true,
      city: true,
      categoryEn: true,
      categoryZh: true,
      tags: true,
      aiTags: true,
      customFields: true,
    },
    take: 5,
  });

  for (const sample of samplesNoAiTags) {
    console.log(`\n  名称: ${sample.name}`);
    console.log(`  城市: ${sample.city}`);
    console.log(`  分类: ${sample.categoryEn} / ${sample.categoryZh}`);
    console.log(`  tags: ${JSON.stringify(sample.tags)}`);
    console.log(`  ai_tags: ${JSON.stringify(sample.aiTags)}`);
    
    // 检查 customFields 中是否有 reviewsTags
    const customFields = sample.customFields as Record<string, unknown> | null;
    if (customFields?.reviewsTags) {
      console.log(`  customFields.reviewsTags: ${JSON.stringify(customFields.reviewsTags)}`);
    }
  }

  // 7. 统计 ai_tags 为空数组的数量
  const emptyAiTags = await prisma.place.count({
    where: {
      aiTags: {
        equals: [],
      },
    },
  });
  console.log(`\nai_tags 为空数组的地点: ${emptyAiTags}`);

  // 8. 统计 tags 为空对象的数量
  const emptyTags = await prisma.place.count({
    where: {
      tags: {
        equals: {},
      },
    },
  });
  console.log(`tags 为空对象的地点: ${emptyTags}`);

  // 9. 检查 source 分布
  console.log('\n📊 数据来源分布:');
  const sources = await prisma.$queryRaw<{ source: string; count: bigint }[]>`
    SELECT source, COUNT(*) as count 
    FROM places 
    GROUP BY source 
    ORDER BY count DESC
  `;
  for (const s of sources) {
    console.log(`  ${s.source || 'null'}: ${s.count}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
