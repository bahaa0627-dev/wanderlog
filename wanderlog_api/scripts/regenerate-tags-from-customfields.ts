/**
 * 从 customFields 中的 reviewsTags 重新生成 tags 和 ai_tags
 * 
 * 问题：大量地点的 ai_tags 为空，但 customFields.reviewsTags 中有丰富的数据
 */

import { PrismaClient } from '@prisma/client';
import { aiTagsGeneratorService, StructuredTags, AITagElement } from '../src/services/aiTagsGeneratorService';
import { aiFacetDictionaryService } from '../src/services/aiFacetDictionaryService';

const prisma = new PrismaClient();

// reviewsTags 到 structured tags 的映射
const REVIEW_TAG_MAPPINGS: Record<string, { key: keyof StructuredTags; value: string }> = {
  // Meal
  'brunch': { key: 'meal', value: 'brunch' },
  'breakfast': { key: 'meal', value: 'breakfast' },
  'lunch': { key: 'meal', value: 'lunch' },
  'dinner': { key: 'meal', value: 'dinner' },
  
  // Style
  'vintage': { key: 'style', value: 'vintage' },
  'cozy': { key: 'style', value: 'cozy' },
  'trendy': { key: 'style', value: 'trendy' },
  'romantic': { key: 'style', value: 'romantic' },
  'casual': { key: 'style', value: 'casual' },
  'upscale': { key: 'style', value: 'upscale' },
  'modern': { key: 'style', value: 'modern' },
  'minimalist': { key: 'style', value: 'minimalist' },
  'industrial': { key: 'style', value: 'industrial' },
  'retro': { key: 'style', value: 'retro' },
  '80s': { key: 'style', value: 'vintage' },
  '70s': { key: 'style', value: 'vintage' },
  'secondhand': { key: 'style', value: 'secondhand' },
  'thrift': { key: 'style', value: 'secondhand' },
  
  // Coffee related
  'specialty coffee': { key: 'style', value: 'specialty_coffee' },
  'espresso': { key: 'style', value: 'specialty_coffee' },
  'latte': { key: 'style', value: 'specialty_coffee' },
  'flat white': { key: 'style', value: 'specialty_coffee' },
  'cappuccino': { key: 'style', value: 'specialty_coffee' },
  'barista': { key: 'style', value: 'specialty_coffee' },
  
  // Cuisine
  'japanese': { key: 'cuisine', value: 'Japanese' },
  'korean': { key: 'cuisine', value: 'Korean' },
  'vietnamese': { key: 'cuisine', value: 'Vietnamese' },
  'thai': { key: 'cuisine', value: 'Thai' },
  'chinese': { key: 'cuisine', value: 'Chinese' },
  'italian': { key: 'cuisine', value: 'Italian' },
  'french': { key: 'cuisine', value: 'French' },
  'spanish': { key: 'cuisine', value: 'Spanish' },
  'indian': { key: 'cuisine', value: 'Indian' },
  'mexican': { key: 'cuisine', value: 'Mexican' },
  'sushi': { key: 'cuisine', value: 'Japanese' },
  'ramen': { key: 'cuisine', value: 'Japanese' },
  'pho': { key: 'cuisine', value: 'Vietnamese' },
  'pasta': { key: 'cuisine', value: 'Italian' },
  'pizza': { key: 'cuisine', value: 'Italian' },
  'tapas': { key: 'cuisine', value: 'Spanish' },
  'curry': { key: 'cuisine', value: 'Indian' },
  'taco': { key: 'cuisine', value: 'Mexican' },
  'seafood': { key: 'cuisine', value: 'Seafood' },
  'bbq': { key: 'cuisine', value: 'BBQ' },
  
  // Theme
  'feminist': { key: 'theme', value: 'feminism' },
  'feminism': { key: 'theme', value: 'feminism' },
  'lgbtq': { key: 'theme', value: 'lgbtq' },
  'queer': { key: 'theme', value: 'lgbtq' },
};

interface ReviewTag {
  title: string;
  count: number;
}

async function extractTagsFromReviewsTags(
  reviewsTags: ReviewTag[],
  categorySlug: string
): Promise<StructuredTags> {
  const tags: StructuredTags = {};
  
  for (const reviewTag of reviewsTags) {
    const titleLower = reviewTag.title.toLowerCase();
    
    // 检查直接映射
    for (const [pattern, mapping] of Object.entries(REVIEW_TAG_MAPPINGS)) {
      if (titleLower.includes(pattern)) {
        const key = mapping.key;
        if (!tags[key]) {
          tags[key] = [];
        }
        if (!tags[key]!.includes(mapping.value)) {
          tags[key]!.push(mapping.value);
        }
        break;
      }
    }
  }
  
  return tags;
}

async function main() {
  console.log('🔄 开始从 customFields.reviewsTags 重新生成 tags 和 ai_tags\n');
  
  // 初始化 facet dictionary
  await aiFacetDictionaryService.loadFromDatabase();
  
  // 获取所有 ai_tags 为空的地点
  const places = await prisma.place.findMany({
    where: {
      aiTags: { equals: [] },
    },
    select: {
      id: true,
      name: true,
      city: true,
      categorySlug: true,
      categoryEn: true,
      tags: true,
      customFields: true,
    },
  });
  
  console.log(`找到 ${places.length} 个 ai_tags 为空的地点\n`);
  
  let updated = 0;
  let skipped = 0;
  
  for (const place of places) {
    const customFields = place.customFields as Record<string, unknown> | null;
    const reviewsTags = customFields?.reviewsTags as ReviewTag[] | undefined;
    
    if (!reviewsTags || reviewsTags.length === 0) {
      skipped++;
      continue;
    }
    
    // 从 reviewsTags 提取结构化标签
    const extractedTags = await extractTagsFromReviewsTags(
      reviewsTags,
      place.categorySlug || 'poi'
    );
    
    // 合并现有 tags
    const existingTags = (place.tags as StructuredTags) || {};
    const mergedTags: StructuredTags = { ...existingTags };
    
    for (const [key, values] of Object.entries(extractedTags)) {
      if (!mergedTags[key]) {
        mergedTags[key] = [];
      }
      for (const value of values || []) {
        if (!mergedTags[key]!.includes(value)) {
          mergedTags[key]!.push(value);
        }
      }
    }
    
    // 生成 ai_tags
    const aiTags = await aiTagsGeneratorService.generateAITags(
      mergedTags,
      place.categorySlug || 'poi',
      place.categoryEn || 'Place'
    );
    
    // 只有当有新数据时才更新
    const hasNewTags = Object.keys(mergedTags).length > Object.keys(existingTags).length;
    const hasAiTags = aiTags.length > 0;
    
    if (hasNewTags || hasAiTags) {
      await prisma.place.update({
        where: { id: place.id },
        data: {
          tags: Object.keys(mergedTags).length > 0 ? mergedTags : undefined,
          aiTags: aiTags.length > 0 ? aiTags : undefined,
          updatedAt: new Date(),
        },
      });
      
      updated++;
      console.log(`✅ ${place.name} (${place.city})`);
      console.log(`   tags: ${JSON.stringify(mergedTags)}`);
      console.log(`   ai_tags: ${JSON.stringify(aiTags)}`);
    } else {
      skipped++;
    }
  }
  
  console.log(`\n📊 完成！`);
  console.log(`   更新: ${updated}`);
  console.log(`   跳过: ${skipped}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
