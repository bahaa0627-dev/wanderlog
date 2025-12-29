/**
 * 将 customFields.categoriesRaw 转换为 aiTags
 * 
 * 规则：
 * 1. aiTags 不能跟 category 重复或高度相似
 * 2. 只提取有差异化价值的标签（如菜系、风格、特色）
 * 3. Coffee/Cafe/Bakery 这类跟 category 重合的不添加
 */
import prisma from '../src/config/database';

// 与 category 重合的词，不应该作为 aiTag
const CATEGORY_OVERLAP = new Set([
  'cafe', 'coffee', 'bakery', 'restaurant', 'bar', 'shop', 'store',
  'museum', 'gallery', 'park', 'landmark', 'market', 'hotel',
  'church', 'library', 'zoo', 'theater', 'cinema', 'gym',
]);

// categoriesRaw -> aiTag 映射表（只保留有差异化价值的）
const CATEGORY_TO_AITAG: Record<string, { en: string; zh: string; priority: number } | null> = {
  // 餐饮风格/菜系 - 这些是有价值的差异化标签
  'Brunch restaurant': { en: 'Brunch', zh: '早午餐', priority: 80 },
  'Breakfast restaurant': { en: 'Brunch', zh: '早午餐', priority: 80 },
  'French restaurant': { en: 'French', zh: '法餐', priority: 75 },
  'Italian restaurant': { en: 'Italian', zh: '意餐', priority: 75 },
  'Japanese restaurant': { en: 'Japanese', zh: '日料', priority: 75 },
  'Spanish restaurant': { en: 'Spanish', zh: '西班牙菜', priority: 75 },
  'Mediterranean restaurant': { en: 'Mediterranean', zh: '地中海菜', priority: 75 },
  'Seafood restaurant': { en: 'Seafood', zh: '海鲜', priority: 75 },
  'Peruvian restaurant': { en: 'Peruvian', zh: '秘鲁菜', priority: 70 },
  'Mexican restaurant': { en: 'Mexican', zh: '墨西哥菜', priority: 70 },
  'Korean restaurant': { en: 'Korean', zh: '韩餐', priority: 70 },
  'Chinese restaurant': { en: 'Chinese', zh: '中餐', priority: 70 },
  'Thai restaurant': { en: 'Thai', zh: '泰餐', priority: 70 },
  'Vietnamese restaurant': { en: 'Vietnamese', zh: '越南菜', priority: 70 },
  'Indian restaurant': { en: 'Indian', zh: '印度菜', priority: 70 },
  'Greek restaurant': { en: 'Greek', zh: '希腊菜', priority: 70 },
  'American restaurant': { en: 'American', zh: '美式', priority: 65 },
  'Tapas bar': { en: 'Tapas', zh: '小食', priority: 70 },
  'Tapas restaurant': { en: 'Tapas', zh: '小食', priority: 70 },
  'Bistro': { en: 'Bistro', zh: '小酒馆', priority: 70 },
  'Vegan restaurant': { en: 'Vegan', zh: '纯素', priority: 75 },
  'Vegetarian restaurant': { en: 'Vegetarian', zh: '素食', priority: 75 },
  
  // 酒类特色
  'Cocktail bar': { en: 'Cocktail', zh: '鸡尾酒', priority: 75 },
  'Wine bar': { en: 'Wine', zh: '葡萄酒', priority: 75 },
  'Winery': { en: 'Wine', zh: '葡萄酒', priority: 75 },
  'Whisky bar': { en: 'Whisky', zh: '威士忌', priority: 75 },
  'Craft beer bar': { en: 'Craft Beer', zh: '精酿啤酒', priority: 75 },
  
  // 历史/文化特色
  'Historical landmark': { en: 'Historical', zh: '历史', priority: 50 },
  'Historical place': { en: 'Historical', zh: '历史', priority: 50 },
  'Heritage building': { en: 'Historical', zh: '历史', priority: 50 },
  
  // 购物风格
  'Vintage clothing store': { en: 'Vintage', zh: '复古', priority: 65 },
  'Second hand store': { en: 'Vintage', zh: '复古', priority: 65 },
  'Thrift store': { en: 'Vintage', zh: '复古', priority: 65 },
  'Antique store': { en: 'Vintage', zh: '复古', priority: 65 },
  'Record store': { en: 'Vintage', zh: '复古', priority: 65 },
  'Yarn store': { en: 'Craft', zh: '手工艺', priority: 60 },
  'Craft store': { en: 'Craft', zh: '手工艺', priority: 60 },
  'Boutique': { en: 'Curated', zh: '精选', priority: 55 },
  'Designer clothing store': { en: 'Designer', zh: '设计师', priority: 65 },
  
  // 艺术风格
  'Contemporary art gallery': { en: 'Contemporary', zh: '当代', priority: 60 },
  'Modern art museum': { en: 'Modern', zh: '现代', priority: 60 },
  
  // 自然/户外
  'Botanical garden': { en: 'Nature', zh: '自然', priority: 50 },
  'Scenic spot': { en: 'Scenic', zh: '风景', priority: 55 },
  
  // 以下是跟 category 重合的，设为 null 不添加
  'Coffee shop': null,
  'Espresso bar': null,
  'Cafe': null,
  'Bakery': null,
  'Pastry shop': null,
  'Restaurant': null,
  'Bar': null,
  'Museum': null,
  'Art gallery': null,
  'Art museum': null,
  'Park': null,
  'Garden': null,
  'Tourist attraction': null,
  'Clothing store': null,
  'Book store': null,
  'Gift shop': null,
  'Supermarket': null,
  'Grocery store': null,
};

async function main() {
  // 先回滚之前错误添加的 Coffee 标签
  console.log('🔄 回滚之前错误添加的标签...');
  
  const placesToFix = await prisma.place.findMany({
    where: {
      aiTags: {
        path: [],
        array_contains: [{ en: 'Coffee' }]
      }
    },
    select: { id: true, name: true, aiTags: true, categoryEn: true }
  });
  
  let rollbackCount = 0;
  for (const place of placesToFix) {
    const aiTags = place.aiTags as any[] || [];
    // 移除 Coffee 标签（如果 category 是 Cafe）
    if (place.categoryEn?.toLowerCase() === 'cafe') {
      const filtered = aiTags.filter((t: any) => t.en !== 'Coffee');
      if (filtered.length !== aiTags.length) {
        await prisma.place.update({
          where: { id: place.id },
          data: { aiTags: filtered }
        });
        rollbackCount++;
      }
    }
  }
  console.log(`✅ 回滚了 ${rollbackCount} 条记录的 Coffee 标签`);
  
  // 重新处理
  console.log('\n🔍 查找有 categoriesRaw 的记录...');
  
  const places = await prisma.place.findMany({
    select: {
      id: true,
      name: true,
      categoryEn: true,
      customFields: true,
      sourceDetails: true,
      aiTags: true,
    },
  });
  
  let updated = 0;
  let skipped = 0;
  const newTagsAdded: Record<string, number> = {};
  
  for (const place of places) {
    const cf = place.customFields as any || {};
    const sd = place.sourceDetails as any || {};
    
    // 获取 categoriesRaw
    const categoriesRaw = [...(cf.categoriesRaw || []), ...(sd.categoriesRaw || [])];
    if (categoriesRaw.length === 0) {
      continue;
    }
    
    // 现有的 aiTags
    const existingAiTags = (place.aiTags as any[] || []);
    const existingTagIds = new Set(existingAiTags.map((t: any) => t.id || t.en));
    
    // 当前 category（用于检查重复）
    const categoryLower = (place.categoryEn || '').toLowerCase();
    
    // 从 categoriesRaw 生成新的 aiTags
    const newTags: any[] = [];
    for (const cat of categoriesRaw) {
      const mapping = CATEGORY_TO_AITAG[cat];
      
      // 跳过 null（与 category 重合的）
      if (mapping === null) continue;
      if (!mapping) continue;
      
      // 检查是否与 category 重复
      const tagLower = mapping.en.toLowerCase();
      if (CATEGORY_OVERLAP.has(tagLower)) continue;
      if (categoryLower.includes(tagLower) || tagLower.includes(categoryLower)) continue;
      
      // 检查是否已存在
      if (existingTagIds.has(mapping.en)) continue;
      
      newTags.push({
        kind: 'facet',
        id: mapping.en,
        en: mapping.en,
        zh: mapping.zh,
        priority: mapping.priority,
      });
      existingTagIds.add(mapping.en);
      newTagsAdded[mapping.en] = (newTagsAdded[mapping.en] || 0) + 1;
    }
    
    if (newTags.length === 0) {
      skipped++;
      continue;
    }
    
    // 合并 aiTags
    const mergedAiTags = [...existingAiTags, ...newTags];
    
    // 更新数据库
    await prisma.place.update({
      where: { id: place.id },
      data: { aiTags: mergedAiTags },
    });
    
    updated++;
    if (updated <= 15) {
      console.log(`✅ ${place.name} (${place.categoryEn}): 添加 ${newTags.map(t => t.en).join(', ')}`);
    }
  }
  
  console.log('\n=== 结果 ===');
  console.log(`更新: ${updated}`);
  console.log(`跳过 (无新标签): ${skipped}`);
  
  if (Object.keys(newTagsAdded).length > 0) {
    console.log('\n=== 新增标签统计 ===');
    const sorted = Object.entries(newTagsAdded).sort((a, b) => b[1] - a[1]);
    for (const [tag, count] of sorted) {
      console.log(`  ${tag}: ${count}`);
    }
  }
  
  await prisma.$disconnect();
}

main().catch(console.error);
