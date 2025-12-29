/**
 * 修复缺失的 aiTags - 第二轮
 * 更深入地从 customFields 中提取信息
 */

import prisma from '../src/config/database';
import { aiFacetDictionaryService } from '../src/services/aiFacetDictionaryService';

async function main() {
  console.log('🔧 开始第二轮 aiTags 修复...\n');

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

  console.log(`需要处理: ${placesNeedAiTags.length} 条\n`);
  
  let generated = 0;
  let tagsUpdated = 0;

  for (const p of placesNeedAiTags) {
    const categorySlug = p.categorySlug!;
    const cf = p.customFields as any;
    let structuredTags: Record<string, string[]> = p.tags as Record<string, string[]> || {};
    const aiTags: any[] = [];
    
    // 1. 从 additionalInfo 提取 brunch
    if (cf?.additionalInfo) {
      const diningOptions = cf.additionalInfo['Dining options'];
      if (Array.isArray(diningOptions)) {
        for (const opt of diningOptions) {
          if (opt['Brunch'] === true && ['restaurant', 'cafe', 'bakery'].includes(categorySlug)) {
            if (!structuredTags.meal) structuredTags.meal = [];
            if (!structuredTags.meal.includes('brunch')) {
              structuredTags.meal.push('brunch');
            }
          }
        }
      }
      
      // 提取 atmosphere/style
      const atmosphere = cf.additionalInfo['Atmosphere'];
      if (Array.isArray(atmosphere)) {
        for (const atm of atmosphere) {
          if (atm['Cozy'] === true) {
            if (!structuredTags.style) structuredTags.style = [];
            if (!structuredTags.style.includes('cozy')) structuredTags.style.push('cozy');
          }
          if (atm['Trendy'] === true) {
            if (!structuredTags.style) structuredTags.style = [];
            if (!structuredTags.style.includes('trendy')) structuredTags.style.push('trendy');
          }
        }
      }
    }
    
    // 2. 从 reviewsTags 提取
    if (cf?.reviewsTags && Array.isArray(cf.reviewsTags)) {
      for (const tag of cf.reviewsTags) {
        const title = (tag.title || '').toLowerCase();
        if (title.includes('brunch') && ['restaurant', 'cafe', 'bakery'].includes(categorySlug)) {
          if (!structuredTags.meal) structuredTags.meal = [];
          if (!structuredTags.meal.includes('brunch')) structuredTags.meal.push('brunch');
        }
        if (title.includes('vintage') && ['shop', 'thrift_store', 'bookstore'].includes(categorySlug)) {
          if (!structuredTags.style) structuredTags.style = [];
          if (!structuredTags.style.includes('vintage')) structuredTags.style.push('vintage');
        }
      }
    }
    
    // 3. 从 categoriesRaw 提取 cuisine
    if (cf?.categoriesRaw && Array.isArray(cf.categoriesRaw) && ['restaurant', 'cafe'].includes(categorySlug)) {
      const cuisinePatterns: Record<string, string[]> = {
        'Japanese': ['japanese', 'sushi', 'ramen', 'izakaya', 'udon', 'tempura'],
        'Korean': ['korean', 'bbq', 'kimchi'],
        'Vietnamese': ['vietnamese', 'pho', 'banh mi'],
        'Thai': ['thai', 'pad thai'],
        'Chinese': ['chinese', 'dim sum', 'cantonese', 'szechuan', 'dumpling'],
        'Italian': ['italian', 'pizza', 'pasta', 'trattoria', 'osteria'],
        'French': ['french', 'bistro', 'brasserie', 'patisserie'],
        'Spanish': ['spanish', 'tapas', 'paella'],
        'Indian': ['indian', 'curry', 'tandoori', 'biryani'],
        'Mexican': ['mexican', 'taco', 'burrito', 'quesadilla'],
        'Seafood': ['seafood', 'fish', 'oyster', 'lobster', 'crab'],
        'MiddleEastern': ['middle eastern', 'mediterranean', 'lebanese', 'turkish', 'falafel', 'kebab'],
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
    
    // 生成 aiTags
    // 1. Brunch
    if (structuredTags.meal?.includes('brunch') && ['restaurant', 'cafe', 'bakery'].includes(categorySlug)) {
      const facet = await aiFacetDictionaryService.getFacetDefinition('Brunch');
      if (facet) {
        aiTags.push({ kind: 'facet', id: facet.id, en: facet.en, zh: facet.zh, priority: facet.priority });
      }
    }
    
    // 2. Cuisine (仅 restaurant)
    if (structuredTags.cuisine && structuredTags.cuisine.length > 0 && categorySlug === 'restaurant' && aiTags.length < 2) {
      for (const cuisine of structuredTags.cuisine) {
        const facet = await aiFacetDictionaryService.getFacetDefinition(cuisine);
        if (facet) {
          aiTags.push({ kind: 'facet', id: facet.id, en: facet.en, zh: facet.zh, priority: facet.priority });
          break;
        }
      }
    }
    
    // 3. Vintage (shop, thrift_store, bookstore)
    if (structuredTags.style?.includes('vintage') && ['shop', 'thrift_store', 'bookstore'].includes(categorySlug) && aiTags.length < 2) {
      const facet = await aiFacetDictionaryService.getFacetDefinition('Vintage');
      if (facet) {
        aiTags.push({ kind: 'facet', id: facet.id, en: facet.en, zh: facet.zh, priority: facet.priority });
      }
    }
    
    // 更新数据库
    const hasNewTags = Object.keys(structuredTags).length > 0 && JSON.stringify(structuredTags) !== JSON.stringify(p.tags);
    
    if (aiTags.length > 0 || hasNewTags) {
      await prisma.place.update({
        where: { id: p.id },
        data: { 
          aiTags: aiTags.length > 0 ? aiTags : undefined,
          tags: hasNewTags ? structuredTags : undefined
        }
      });
      if (aiTags.length > 0) generated++;
      if (hasNewTags) tagsUpdated++;
    }
  }
  
  console.log(`生成 aiTags: ${generated} 条`);
  console.log(`更新 tags: ${tagsUpdated} 条`);

  // 最终统计
  console.log('\n=== 最终统计 ===');
  const total = await prisma.place.count();
  const withTags = await prisma.place.count({ where: { NOT: { tags: { equals: {} } } } });
  const withAiTags = await prisma.place.count({ where: { NOT: { aiTags: { equals: [] } } } });
  
  console.log(`总数: ${total}`);
  console.log(`有 tags: ${withTags} (${(withTags/total*100).toFixed(1)}%)`);
  console.log(`有 aiTags: ${withAiTags} (${(withAiTags/total*100).toFixed(1)}%)`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
