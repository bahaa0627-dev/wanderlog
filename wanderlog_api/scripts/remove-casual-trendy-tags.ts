/**
 * 删除 casual 和 trendy style 标签
 * 
 * 用法：
 *   npx ts-node scripts/remove-casual-trendy-tags.ts [--dry-run]
 */

import prisma from '../src/config/database';
import { aiTagsGeneratorService, StructuredTags } from '../src/services/aiTagsGeneratorService';

// 要删除的标签（不区分大小写）
const TAGS_TO_REMOVE = ['casual', 'trendy'];

function normalizeForComparison(tag: string): string {
  return tag.toLowerCase().trim();
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  
  console.log('🔧 Remove Casual & Trendy Tags Script');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}\n`);

  // 找到所有有 tags 字段的地点
  const places = await prisma.place.findMany({
    where: {
      tags: {
        not: {},
      },
    },
    select: {
      id: true,
      name: true,
      categorySlug: true,
      categoryEn: true,
      tags: true,
      aiTags: true,
    },
  });

  console.log(`📊 Found ${places.length} places with style tags\n`);

  let updated = 0;
  let skipped = 0;

  for (const place of places) {
    const tags = place.tags as Record<string, string[]> | null;
    if (!tags || !tags.style) {
      skipped++;
      continue;
    }

    const originalStyles = tags.style;
    const filteredStyles = originalStyles.filter(
      s => !TAGS_TO_REMOVE.includes(normalizeForComparison(s))
    );

    // 检查是否有变化
    if (filteredStyles.length === originalStyles.length) {
      skipped++;
      continue;
    }

    // 构建新的 tags 对象
    const newTags: StructuredTags = { ...tags };
    if (filteredStyles.length > 0) {
      newTags.style = filteredStyles;
    } else {
      delete newTags.style;
    }

    // 重新生成 aiTags
    let newAiTags: any[] = [];
    if (place.categorySlug && place.categoryEn) {
      try {
        newAiTags = await aiTagsGeneratorService.generateAITags(
          newTags,
          place.categorySlug,
          place.categoryEn
        );
      } catch (e) {
        console.warn(`  ⚠️  Failed to generate aiTags for ${place.name}`);
      }
    }

    console.log(`📍 ${place.name}`);
    console.log(`   style: [${originalStyles.join(', ')}] → [${filteredStyles.join(', ')}]`);
    console.log(`   aiTags: ${JSON.stringify(place.aiTags)} → ${JSON.stringify(newAiTags)}`);

    if (!dryRun) {
      await prisma.place.update({
        where: { id: place.id },
        data: {
          tags: Object.keys(newTags).length > 0 ? newTags : {},
          aiTags: newAiTags,
          updatedAt: new Date(),
        },
      });
    }

    updated++;
  }

  console.log(`\n✅ ${dryRun ? 'Would update' : 'Updated'}: ${updated} places`);
  console.log(`⏭️  Skipped: ${skipped} places`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
