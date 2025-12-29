/**
 * 迁移 tags.theme 数据到 tags 和 ai_tags
 * 
 * 处理规则：
 * 1. 以下 theme 值转换为 tags 和 ai_tags:
 *    - Nature → theme:nature
 *    - Culture → theme:culture
 *    - Ryokan → style:ryokan (同时更新 category 为 hotel)
 *    - Fountains → theme:fountain
 *    - Shrine → 更新 category 为 temple
 *    - Historical → theme:historical
 *    - Zoo → 更新 category 为 zoo
 *    - Photography/Photogenic → theme:photogenic
 * 
 * 2. University、Temple 作为 category slug 处理
 */

import { PrismaClient } from '@prisma/client';
import { aiTagsGeneratorService, StructuredTags } from '../src/services/aiTagsGeneratorService';

const prisma = new PrismaClient();

// Theme 到 tags 的映射
const THEME_TO_TAGS: Record<string, { key: keyof StructuredTags; value: string }> = {
  'nature': { key: 'theme', value: 'nature' },
  'Nature': { key: 'theme', value: 'nature' },
  'culture': { key: 'theme', value: 'culture' },
  'Culture': { key: 'theme', value: 'culture' },
  'historical': { key: 'theme', value: 'historical' },
  'Historical': { key: 'theme', value: 'historical' },
  'fountains': { key: 'theme', value: 'fountain' },
  'Fountains': { key: 'theme', value: 'fountain' },
  'photography': { key: 'theme', value: 'photogenic' },
  'Photography': { key: 'theme', value: 'photogenic' },
  'photogenic': { key: 'theme', value: 'photogenic' },
  'Photogenic': { key: 'theme', value: 'photogenic' },
};

// Theme 到 category 的映射
const THEME_TO_CATEGORY: Record<string, { slug: string; en: string; zh: string }> = {
  'zoo': { slug: 'zoo', en: 'Zoo', zh: '动物园' },
  'Zoo': { slug: 'zoo', en: 'Zoo', zh: '动物园' },
  'shrine': { slug: 'temple', en: 'Temple', zh: '寺庙' },
  'Shrine': { slug: 'temple', en: 'Temple', zh: '寺庙' },
  'temple': { slug: 'temple', en: 'Temple', zh: '寺庙' },
  'Temple': { slug: 'temple', en: 'Temple', zh: '寺庙' },
  'university': { slug: 'university', en: 'University', zh: '大学' },
  'University': { slug: 'university', en: 'University', zh: '大学' },
};

// Ryokan 特殊处理：更新 category 为 hotel，添加 style:ryokan
const RYOKAN_THEMES = ['ryokan', 'Ryokan'];

// 跳过的 theme（与 category 重复或相似）
const SKIP_THEMES = [
  'landmark', 'Landmark',
  'shopping', 'Shopping',
  'art', 'Art',
  'architecture', 'Architecture',
  'coffee', 'Coffee',
  'cafe', 'Cafe',
  'museum', 'Museum',
  'gallery', 'Gallery',
  'restaurant', 'Restaurant',
  'bar', 'Bar',
  'hotel', 'Hotel',
  'park', 'Park',
  'church', 'Church',
  'library', 'Library',
  'bookstore', 'Bookstore',
  'market', 'Market',
];

interface MigrationStats {
  total: number;
  updated: number;
  skipped: number;
  categoryUpdated: number;
  tagsAdded: number;
  errors: string[];
}

async function migrateThemeTags(dryRun: boolean = true): Promise<MigrationStats> {
  const stats: MigrationStats = {
    total: 0,
    updated: 0,
    skipped: 0,
    categoryUpdated: 0,
    tagsAdded: 0,
    errors: [],
  };

  console.log(`\n🚀 开始迁移 tags.theme 数据 (dry-run: ${dryRun})\n`);

  // 查询所有有 tags 的记录
  const places = await prisma.place.findMany({
    where: {
      tags: {
        not: { equals: {} },
      },
    },
    select: {
      id: true,
      name: true,
      categorySlug: true,
      categoryEn: true,
      categoryZh: true,
      tags: true,
      aiTags: true,
    },
  });

  stats.total = places.length;
  console.log(`📊 找到 ${places.length} 条有 tags 的记录\n`);

  // 过滤出有 theme 字段的记录
  const placesWithTheme = places.filter(p => {
    const tags = p.tags as Record<string, string[]> | null;
    return tags && tags.theme && tags.theme.length > 0;
  });
  
  console.log(`📊 其中 ${placesWithTheme.length} 条有 tags.theme\n`);

  for (const place of placesWithTheme) {
    try {
      const tags = place.tags as Record<string, string[]> | null;
      if (!tags || !tags.theme) {
        stats.skipped++;
        continue;
      }

      const themeValues = tags.theme;
      let needsUpdate = false;
      let categoryUpdate: { slug: string; en: string; zh: string } | null = null;
      const newTags: StructuredTags = { ...tags };
      const addedTagValues: string[] = [];

      for (const theme of themeValues) {
        // 检查是否需要跳过
        if (SKIP_THEMES.includes(theme)) {
          continue;
        }

        // 检查是否需要更新 category
        if (THEME_TO_CATEGORY[theme]) {
          categoryUpdate = THEME_TO_CATEGORY[theme];
          needsUpdate = true;
          continue;
        }

        // 检查是否是 Ryokan
        if (RYOKAN_THEMES.includes(theme)) {
          categoryUpdate = { slug: 'hotel', en: 'Hotel', zh: '酒店' };
          if (!newTags.style) newTags.style = [];
          if (!newTags.style.includes('ryokan')) {
            newTags.style.push('ryokan');
            addedTagValues.push('style:ryokan');
          }
          needsUpdate = true;
          continue;
        }

        // 检查是否需要添加 tag
        if (THEME_TO_TAGS[theme]) {
          const mapping = THEME_TO_TAGS[theme];
          if (!newTags[mapping.key]) {
            newTags[mapping.key] = [];
          }
          if (!newTags[mapping.key]!.includes(mapping.value)) {
            newTags[mapping.key]!.push(mapping.value);
            addedTagValues.push(`${mapping.key}:${mapping.value}`);
            needsUpdate = true;
          }
        }
      }

      if (!needsUpdate) {
        // 即使没有新的 tags 更新，也重新生成 ai_tags
        const categorySlug = place.categorySlug || 'landmark';
        const categoryEn = place.categoryEn || 'Landmark';
        const currentTags = place.tags as Record<string, string[]> | null;
        
        if (currentTags && currentTags.theme && currentTags.theme.length > 0) {
          const aiTags = await aiTagsGeneratorService.generateAITags(currentTags, categorySlug, categoryEn);
          
          if (!dryRun && aiTags.length > 0) {
            await prisma.place.update({
              where: { id: place.id },
              data: { aiTags: aiTags as any },
            });
            console.log(`  🔄 ${place.name}: regenerated ai_tags (${aiTags.length} tags)`);
            stats.updated++;
            continue;
          }
        }
        
        stats.skipped++;
        continue;
      }

      // 生成新的 ai_tags
      const categorySlug = categoryUpdate?.slug || place.categorySlug || 'landmark';
      const categoryEn = categoryUpdate?.en || place.categoryEn || 'Landmark';
      const aiTags = await aiTagsGeneratorService.generateAITags(newTags, categorySlug, categoryEn);

      if (!dryRun) {
        // 更新数据库
        const updateData: any = {
          tags: newTags,
          aiTags: aiTags,
        };

        if (categoryUpdate) {
          updateData.categorySlug = categoryUpdate.slug;
          updateData.categoryEn = categoryUpdate.en;
          updateData.categoryZh = categoryUpdate.zh;
        }

        await prisma.place.update({
          where: { id: place.id },
          data: updateData,
        });
      }

      stats.updated++;
      if (categoryUpdate) {
        stats.categoryUpdated++;
        console.log(`  📂 ${place.name}: category → ${categoryUpdate.slug}`);
      }
      if (addedTagValues.length > 0) {
        stats.tagsAdded += addedTagValues.length;
        console.log(`  🏷️  ${place.name}: +${addedTagValues.join(', ')}`);
      }

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
    console.log('   使用 --execute 参数来执行实际迁移\n');
  }

  try {
    const stats = await migrateThemeTags(dryRun);

    console.log('\n' + '='.repeat(50));
    console.log('📊 迁移统计');
    console.log('='.repeat(50));
    console.log(`  总记录数: ${stats.total}`);
    console.log(`  已更新: ${stats.updated}`);
    console.log(`  已跳过: ${stats.skipped}`);
    console.log(`  Category 更新: ${stats.categoryUpdated}`);
    console.log(`  Tags 添加: ${stats.tagsAdded}`);
    if (stats.errors.length > 0) {
      console.log(`  错误: ${stats.errors.length}`);
      for (const err of stats.errors.slice(0, 10)) {
        console.log(`    - ${err}`);
      }
    }
    console.log('='.repeat(50));

    if (dryRun && stats.updated > 0) {
      console.log('\n✅ 预览完成。使用 --execute 参数执行实际迁移。');
    }

  } catch (error) {
    console.error('迁移失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
