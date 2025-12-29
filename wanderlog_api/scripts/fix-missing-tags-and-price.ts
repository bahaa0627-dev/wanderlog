/**
 * 修复缺失的 tags, aiTags, price, priceLevel 字段
 * 
 * 1. 从 customFields.priceText 迁移 price
 * 2. 根据 categorySlug 生成 aiTags
 * 3. 从 customFields 中提取 tags
 */

import prisma from '../src/config/database';
import { aiFacetDictionaryService } from '../src/services/aiFacetDictionaryService';

// 分类到默认 facet 的映射
const CATEGORY_DEFAULT_FACETS: Record<string, string[]> = {
  'restaurant': [],
  'cafe': [],
  'bakery': [],
  'bar': [],
  'landmark': ['Historical'],
  'museum': ['Culture'],
  'park': ['Nature'],
  'church': ['Historical'],
  'castle': ['Historical'],
  'zoo': ['Nature'],
  'market': [],
  'bookstore': ['Curated'],
  'thrift_store': ['Vintage'],
  'shop': [],
};

async function main() {
  console.log('🔧 开始修复缺失字段...\n');

  // 1. 从 customFields.priceText 迁移 price
  console.log('=== 1. 迁移 price ===');
  const placesNeedPrice = await prisma.place.findMany({
    where: { price: null },
    select: { id: true, name: true, customFields: true }
  });

  let priceMigrated = 0;
  for (const p of placesNeedPrice) {
    const cf = p.customFields as any;
    if (cf?.priceText && typeof cf.priceText === 'string' && cf.priceText.trim()) {
      const priceText = cf.priceText.trim();
      if (/^\$+$/.test(priceText)) {
        await prisma.place.update({
          where: { id: p.id },
          data: { priceLevel: priceText.length }
        });
      } else {
        await prisma.place.update({
          where: { id: p.id },
          data: { price: priceText }
        });
      }
      priceMigrated++;
    }
  }
  console.log(`   迁移了 ${priceMigrated} 条 price 数据`);

  // 2. 生成 aiTags
  console.log('\n=== 2. 生成 aiTags ===');
  const placesNeedAiTags = await prisma.place.findMany({
    where: {
      categorySlug: { not: null },
      aiTags: { equals: [] }
    },
    select: { 
      id: true, 
      name: true, 
      categorySlug: true, 
      categoryEn: true,
      tags: true,
      customFields: true
    }
  });

  console.log(`   需要生成 aiTags: ${placesNeedAiTags.length} 条`);
  
  let aiTagsGenerated = 0;
  let batchCount = 0;
  const batchSize = 100;

  for (let i = 0; i < placesNeedAiTags.length; i += batchSize) {
    const batch = placesNeedAiTags.slice(i, i + batchSize);
    batchCount++;
    
    for (const p of batch) {
      try {
        const categorySlug = p.categorySlug!;
        const categoryEn = p.categoryEn || categorySlug;
        
        // 构建 structuredTags
        let structuredTags: Record<string, string[]> = {};
        
        if (p.tags && typeof p.tags === 'object' && Object.keys(p.tags).length > 0) {
          structuredTags = p.tags as Record<string, string[]>;
        }
        
        // 从 customFields 提取信息
        const cf = p.customFields as any;
        
        // 提取 brunch
        if (cf?.additionalInfo?.['Dining options']) {
          const diningOptions = cf.additionalInfo['Dining options'];
          if (Array.isArray(diningOptions)) {
            const hasBrunch = diningOptions.some((opt: any) => opt['Brunch'] === true);
            if (hasBrunch && ['restaurant', 'cafe', 'bakery'].includes(categorySlug)) {
              if (!structuredTags.meal) structuredTags.meal = [];
              if (!structuredTags.meal.includes('brunch')) {
                structuredTags.meal.push('brunch');
              }
            }
          }
        }
        
        // 提取 cuisine
        if (cf?.categoriesRaw && Array.isArray(cf.categoriesRaw) && ['restaurant', 'cafe'].includes(categorySlug)) {
          const cuisinePatterns: Record<string, string[]> = {
            'Japanese': ['japanese', 'sushi', 'ramen'],
            'Korean': ['korean'],
            'Vietnamese': ['vietnamese', 'pho'],
            'Thai': ['thai'],
            'Chinese': ['chinese', 'dim sum'],
            'Italian': ['italian', 'pizza', 'pasta'],
            'French': ['french', 'bistro'],
            'Spanish': ['spanish', 'tapas'],
            'Indian': ['indian', 'curry'],
            'Mexican': ['mexican', 'taco'],
            'Seafood': ['seafood'],
          };
          
          for (const cat of cf.categoriesRaw) {
            const catLower = (cat as string).toLowerCase();
            for (const [cuisine, patterns] of Object.entries(cuisinePatterns)) {
              if (patterns.some(p => catLower.includes(p))) {
                if (!structuredTags.cuisine) structuredTags.cuisine = [];
                if (!structuredTags.cuisine.includes(cuisine)) {
                  structuredTags.cuisine.push(cuisine);
                }
              }
            }
          }
        }
        
        // 提取 reviewsTags 中的 brunch
        if (cf?.reviewsTags && Array.isArray(cf.reviewsTags)) {
          for (const tag of cf.reviewsTags) {
            if (tag.title?.toLowerCase().includes('brunch') && ['restaurant', 'cafe', 'bakery'].includes(categorySlug)) {
              if (!structuredTags.meal) structuredTags.meal = [];
              if (!structuredTags.meal.includes('brunch')) {
                structuredTags.meal.push('brunch');
              }
            }
          }
        }
        
        // 生成 aiTags
        const aiTags: any[] = [];
        
        // 1. 检查 brunch
        if (structuredTags.meal?.includes('brunch') && ['restaurant', 'cafe', 'bakery'].includes(categorySlug)) {
          const brunchFacet = await aiFacetDictionaryService.getFacetDefinition('Brunch');
          if (brunchFacet) {
            aiTags.push({
              kind: 'facet',
              id: brunchFacet.id,
              en: brunchFacet.en,
              zh: brunchFacet.zh,
              priority: brunchFacet.priority,
            });
          }
        }
        
        // 2. 检查 cuisine
        if (structuredTags.cuisine && structuredTags.cuisine.length > 0 && categorySlug === 'restaurant') {
          for (const cuisine of structuredTags.cuisine) {
            const facet = await aiFacetDictionaryService.getFacetDefinition(cuisine);
            if (facet && aiTags.length < 2) {
              aiTags.push({
                kind: 'facet',
                id: facet.id,
                en: facet.en,
                zh: facet.zh,
                priority: facet.priority,
              });
              break;
            }
          }
        }
        
        // 3. 如果还没有 aiTags，使用分类默认 facet
        if (aiTags.length === 0) {
          const defaultFacets = CATEGORY_DEFAULT_FACETS[categorySlug] || [];
          for (const facetId of defaultFacets) {
            const facet = await aiFacetDictionaryService.getFacetDefinition(facetId);
            if (facet && aiTags.length < 2) {
              aiTags.push({
                kind: 'facet',
                id: facet.id,
                en: facet.en,
                zh: facet.zh,
                priority: facet.priority,
              });
            }
          }
        }
        
        // 更新数据库
        if (aiTags.length > 0 || Object.keys(structuredTags).length > 0) {
          await prisma.place.update({
            where: { id: p.id },
            data: { 
              aiTags: aiTags.length > 0 ? aiTags : undefined,
              tags: Object.keys(structuredTags).length > 0 ? structuredTags : undefined
            }
          });
          if (aiTags.length > 0) aiTagsGenerated++;
        }
      } catch (e) {
        // 忽略单条错误
      }
    }
    
    console.log(`   处理批次 ${batchCount}: ${Math.min(i + batchSize, placesNeedAiTags.length)}/${placesNeedAiTags.length}, 已生成 ${aiTagsGenerated}`);
  }
  
  console.log(`   生成了 ${aiTagsGenerated} 条 aiTags`);

  // 3. 最终统计
  console.log('\n=== 最终统计 ===');
  const total = await prisma.place.count();
  const withTags = await prisma.place.count({ where: { NOT: { tags: { equals: {} } } } });
  const withAiTags = await prisma.place.count({ where: { NOT: { aiTags: { equals: [] } } } });
  const withPrice = await prisma.place.count({ where: { price: { not: null } } });
  const withPriceLevel = await prisma.place.count({ where: { priceLevel: { not: null } } });
  
  console.log(`总数: ${total}`);
  console.log(`有 tags: ${withTags} (${(withTags/total*100).toFixed(1)}%)`);
  console.log(`有 aiTags: ${withAiTags} (${(withAiTags/total*100).toFixed(1)}%)`);
  console.log(`有 price: ${withPrice} (${(withPrice/total*100).toFixed(1)}%)`);
  console.log(`有 priceLevel: ${withPriceLevel} (${(withPriceLevel/total*100).toFixed(1)}%)`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
