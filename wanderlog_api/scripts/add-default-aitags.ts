/**
 * 为没有 aiTags 的记录添加基于分类的默认标签
 */

import prisma from '../src/config/database';
import { aiFacetDictionaryService } from '../src/services/aiFacetDictionaryService';

// 分类到默认 facet 的映射
const CATEGORY_DEFAULT_FACETS: Record<string, string[]> = {
  'landmark': ['Historical'],
  'museum': ['Culture'],
  'park': ['Nature'],
  'church': ['Historical'],
  'castle': ['Historical'],
  'zoo': ['Nature'],
  'temple': ['Historical'],
  'art_gallery': ['Culture'],
  'library': ['Culture'],
  'bookstore': ['Curated'],
  'thrift_store': ['Vintage'],
  'cemetery': ['Historical'],
  'university': ['Culture'],
};

async function main() {
  console.log('🔧 添加默认 aiTags...\n');

  const placesNeedAiTags = await prisma.place.findMany({
    where: {
      categorySlug: { not: null },
      aiTags: { equals: [] }
    },
    select: { 
      id: true, 
      name: true, 
      categorySlug: true
    }
  });

  console.log(`需要处理: ${placesNeedAiTags.length} 条\n`);
  
  let generated = 0;

  for (const p of placesNeedAiTags) {
    const categorySlug = p.categorySlug!;
    const defaultFacets = CATEGORY_DEFAULT_FACETS[categorySlug];
    
    if (!defaultFacets || defaultFacets.length === 0) {
      continue;
    }
    
    const aiTags: any[] = [];
    
    for (const facetId of defaultFacets) {
      const facet = await aiFacetDictionaryService.getFacetDefinition(facetId);
      if (facet && aiTags.length < 2) {
        aiTags.push({ 
          kind: 'facet', 
          id: facet.id, 
          en: facet.en, 
          zh: facet.zh, 
          priority: facet.priority 
        });
      }
    }
    
    if (aiTags.length > 0) {
      await prisma.place.update({
        where: { id: p.id },
        data: { aiTags }
      });
      generated++;
    }
  }
  
  console.log(`生成 aiTags: ${generated} 条`);

  // 最终统计
  console.log('\n=== 最终统计 ===');
  const total = await prisma.place.count();
  const withAiTags = await prisma.place.count({ where: { NOT: { aiTags: { equals: [] } } } });
  
  console.log(`总数: ${total}`);
  console.log(`有 aiTags: ${withAiTags} (${(withAiTags/total*100).toFixed(1)}%)`);
  
  // 按分类统计
  const noAiTags = await prisma.place.findMany({
    where: { aiTags: { equals: [] } },
    select: { categorySlug: true }
  });
  
  const distribution: Record<string, number> = {};
  for (const p of noAiTags) {
    const cat = p.categorySlug || 'null';
    distribution[cat] = (distribution[cat] || 0) + 1;
  }
  
  console.log('\n仍然没有 aiTags 的分类:');
  const sorted = Object.entries(distribution).sort((a, b) => b[1] - a[1]);
  for (const [cat, count] of sorted) {
    console.log(`  ${cat}: ${count}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
