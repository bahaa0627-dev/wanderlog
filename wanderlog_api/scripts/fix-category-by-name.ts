/**
 * 根据名称关键词修复 category_slug
 * 
 * 针对 ai_search 等来源的数据，没有旧 category 字段，
 * 需要根据名称中的关键词来推断正确的分类
 */

import { PrismaClient } from '@prisma/client';
import { CATEGORY_DISPLAY_NAMES, CATEGORY_ZH_NAMES } from '../src/constants/categories';
import { aiTagsGeneratorService, StructuredTags } from '../src/services/aiTagsGeneratorService';

const prisma = new PrismaClient();

// 名称关键词到分类的映射（按优先级排序）
const NAME_KEYWORD_MAPPINGS: Array<{
  patterns: RegExp[];
  slug: string;
  priority: number;
}> = [
  // Cafe/Coffee - 高优先级
  { patterns: [/cafe/i, /coffee/i, /espresso/i, /roaster/i, /kaffee/i, /カフェ/i, /koffee/i, /caféothèque/i], slug: 'cafe', priority: 10 },
  
  // Bakery
  { patterns: [/bakery/i, /bageri/i, /boulangerie/i, /patisserie/i, /pastry/i, /bread/i, /パン/], slug: 'bakery', priority: 11 },
  
  // Restaurant/Ramen/Food
  { patterns: [/ramen/i, /ラーメン/i, /restaurant/i, /bistro/i, /trattoria/i, /osteria/i, /brasserie/i, /dining/i, /ichiran/i, /kamukura/i], slug: 'restaurant', priority: 20 },
  
  // Bar
  { patterns: [/\bbar\b/i, /pub\b/i, /cocktail/i, /wine bar/i, /taproom/i], slug: 'bar', priority: 21 },
  
  // Museum
  { patterns: [/museum/i, /musée/i, /museo/i, /博物館/], slug: 'museum', priority: 30 },
  
  // Gallery
  { patterns: [/gallery/i, /galerie/i, /galleria/i, /美術館/], slug: 'art_gallery', priority: 31 },
  
  // Church
  { patterns: [/church/i, /cathedral/i, /basilica/i, /chapel/i, /kirche/i, /église/i, /教会/], slug: 'church', priority: 40 },
  
  // Temple
  { patterns: [/temple/i, /shrine/i, /jinja/i, /寺/i, /神社/i, /神宮/], slug: 'temple', priority: 41 },
  
  // Castle
  { patterns: [/castle/i, /palace/i, /schloss/i, /château/i, /城/], slug: 'castle', priority: 42 },
  
  // Park/Garden/Beach
  { patterns: [/\bpark\b/i, /garden/i, /botanical/i, /公園/i, /beach/i, /reserve\b/i], slug: 'park', priority: 50 },
  
  // Cemetery
  { patterns: [/cemetery/i, /graveyard/i, /墓地/], slug: 'cemetery', priority: 51 },
  
  // Library
  { patterns: [/library/i, /bibliothek/i, /bibliothèque/i, /図書館/], slug: 'library', priority: 52 },
  
  // Bookstore
  { patterns: [/bookstore/i, /bookshop/i, /書店/], slug: 'bookstore', priority: 53 },
  
  // Hotel
  { patterns: [/hotel/i, /hostel/i, /inn\b/i, /ryokan/i, /旅館/], slug: 'hotel', priority: 60 },
  
  // University
  { patterns: [/university/i, /college/i, /大学/], slug: 'university', priority: 61 },
  
  // Zoo
  { patterns: [/\bzoo\b/i, /aquarium/i, /動物園/i, /水族館/], slug: 'zoo', priority: 62 },
  
  // Market
  { patterns: [/market/i, /marché/i, /markt/i, /市場/], slug: 'market', priority: 70 },
  
  // Shopping Mall
  { patterns: [/mall\b/i, /shopping center/i, /department store/i], slug: 'shopping_mall', priority: 71 },
];

interface MigrationStats {
  total: number;
  updated: number;
  skipped: number;
  byCategory: Map<string, number>;
  errors: string[];
}

function inferCategoryFromName(name: string): { slug: string; priority: number } | null {
  for (const mapping of NAME_KEYWORD_MAPPINGS) {
    for (const pattern of mapping.patterns) {
      if (pattern.test(name)) {
        return { slug: mapping.slug, priority: mapping.priority };
      }
    }
  }
  return null;
}

async function fixCategories(dryRun: boolean = true): Promise<MigrationStats> {
  const stats: MigrationStats = {
    total: 0,
    updated: 0,
    skipped: 0,
    byCategory: new Map(),
    errors: [],
  };

  console.log(`\n🚀 开始根据名称修复 category_slug (dry-run: ${dryRun})\n`);

  // 查询所有 category_slug 为 shop 的记录
  const places = await prisma.place.findMany({
    where: {
      categorySlug: 'shop',
    },
    select: {
      id: true,
      name: true,
      category: true,
      categorySlug: true,
      tags: true,
      aiTags: true,
      source: true,
    },
  });

  stats.total = places.length;
  console.log(`📊 找到 ${places.length} 条 category_slug='shop' 的记录\n`);

  for (const place of places) {
    try {
      // 如果有旧 category 字段，跳过（已经被其他脚本处理）
      if (place.category && place.category !== 'shop' && place.category !== 'Shop') {
        stats.skipped++;
        continue;
      }

      // 根据名称推断分类
      const inferred = inferCategoryFromName(place.name);
      
      if (!inferred || inferred.slug === 'shop') {
        stats.skipped++;
        continue;
      }

      const newSlug = inferred.slug;
      const newEn = CATEGORY_DISPLAY_NAMES[newSlug] || newSlug;
      const newZh = CATEGORY_ZH_NAMES[newSlug] || newSlug;

      // 重新生成 ai_tags
      const currentTags = place.tags as StructuredTags | null;
      const aiTags = await aiTagsGeneratorService.generateAITags(currentTags, newSlug, newEn);

      if (!dryRun) {
        await prisma.place.update({
          where: { id: place.id },
          data: {
            categorySlug: newSlug,
            categoryEn: newEn,
            categoryZh: newZh,
            aiTags: aiTags as any,
          },
        });
      }

      console.log(`  ✅ ${place.name} → ${newSlug}`);
      stats.updated++;
      
      // 统计各分类数量
      const count = stats.byCategory.get(newSlug) || 0;
      stats.byCategory.set(newSlug, count + 1);

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
    
    if (stats.byCategory.size > 0) {
      console.log('\n  按分类统计:');
      const sorted = Array.from(stats.byCategory.entries())
        .sort((a, b) => b[1] - a[1]);
      for (const [cat, count] of sorted) {
        console.log(`    - ${cat}: ${count} 条`);
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
