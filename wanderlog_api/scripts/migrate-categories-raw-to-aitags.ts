/**
 * 将 customFields.categoriesRaw 转换为 aiTags
 * 
 * categoriesRaw 是 Google Places 的原始分类，可以映射到我们的 facet 标签
 */
import prisma from '../src/config/database';

// categoriesRaw -> aiTag 映射表
const CATEGORY_TO_AITAG: Record<string, { en: string; zh: string; priority: number }> = {
  // 餐饮类型
  'Brunch restaurant': { en: 'Brunch', zh: '早午餐', priority: 80 },
  'Breakfast restaurant': { en: 'Brunch', zh: '早午餐', priority: 80 },
  'French restaurant': { en: 'French', zh: '法餐', priority: 75 },
  'Italian restaurant': { en: 'Italian', zh: '意餐', priority: 75 },
  'Japanese restaurant': { en: 'Japanese', zh: '日料', priority: 75 },
  'Spanish restaurant': { en: 'Spanish', zh: '西班牙菜', priority: 75 },
  'Mediterranean restaurant': { en: 'Mediterranean', zh: '地中海菜', priority: 75 },
  'Seafood restaurant': { en: 'Seafood', zh: '海鲜', priority: 75 },
  'Pizza restaurant': { en: 'Pizza', zh: '披萨', priority: 70 },
  'Tapas bar': { en: 'Tapas', zh: '小食', priority: 70 },
  'Tapas restaurant': { en: 'Tapas', zh: '小食', priority: 70 },
  'Peruvian restaurant': { en: 'Peruvian', zh: '秘鲁菜', priority: 70 },
  'Bistro': { en: 'Bistro', zh: '小酒馆', priority: 70 },
  'Bar & grill': { en: 'Grill', zh: '烧烤', priority: 70 },
  'Deli': { en: 'Deli', zh: '熟食店', priority: 65 },
  
  // 咖啡/烘焙
  'Coffee shop': { en: 'Coffee', zh: '咖啡', priority: 80 },
  'Espresso bar': { en: 'Coffee', zh: '咖啡', priority: 80 },
  'Bakery': { en: 'Bakery', zh: '烘焙', priority: 75 },
  'Pastry shop': { en: 'Pastry', zh: '糕点', priority: 75 },
  'Cake shop': { en: 'Pastry', zh: '糕点', priority: 75 },
  
  // 酒吧
  'Cocktail bar': { en: 'Cocktail', zh: '鸡尾酒', priority: 75 },
  'Wine bar': { en: 'Wine', zh: '葡萄酒', priority: 75 },
  'Winery': { en: 'Wine', zh: '葡萄酒', priority: 75 },
  
  // 历史/文化
  'Historical landmark': { en: 'Historical', zh: '历史', priority: 50 },
  'Catholic church': { en: 'Religious', zh: '宗教', priority: 55 },
  'Church': { en: 'Religious', zh: '宗教', priority: 55 },
  'Cemetery': { en: 'Historical', zh: '历史', priority: 50 },
  'Sculpture': { en: 'Art', zh: '艺术', priority: 60 },
  
  // 艺术/博物馆
  'Art gallery': { en: 'Art', zh: '艺术', priority: 60 },
  'Art museum': { en: 'Art', zh: '艺术', priority: 60 },
  'Museum': { en: 'Culture', zh: '文化', priority: 55 },
  
  // 自然
  'Park': { en: 'Nature', zh: '自然', priority: 50 },
  'Garden': { en: 'Nature', zh: '自然', priority: 50 },
  'Scenic spot': { en: 'Scenic', zh: '风景', priority: 55 },
  
  // 购物
  'Vintage clothing store': { en: 'Vintage', zh: '复古', priority: 65 },
  'Second hand store': { en: 'Vintage', zh: '复古', priority: 65 },
  'Thrift store': { en: 'Vintage', zh: '复古', priority: 65 },
  'Book store': { en: 'Curated', zh: '精选', priority: 55 },
  'Boutique': { en: 'Curated', zh: '精选', priority: 55 },
  'Gift shop': { en: 'Curated', zh: '精选', priority: 55 },
  'Yarn store': { en: 'Craft', zh: '手工艺', priority: 60 },
  'Record store': { en: 'Vintage', zh: '复古', priority: 65 },
  
  // 建筑
  'Architect': { en: 'Architecture', zh: '建筑', priority: 60 },
};

async function main() {
  console.log('🔍 查找有 categoriesRaw 的记录...');
  
  const places = await prisma.place.findMany({
    select: {
      id: true,
      name: true,
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
    
    // 从 categoriesRaw 生成新的 aiTags
    const newTags: any[] = [];
    for (const cat of categoriesRaw) {
      const mapping = CATEGORY_TO_AITAG[cat];
      if (mapping && !existingTagIds.has(mapping.en)) {
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
    if (updated <= 10) {
      console.log(`✅ ${place.name}: 添加 ${newTags.map(t => t.en).join(', ')}`);
    }
  }
  
  console.log('\n=== 结果 ===');
  console.log(`更新: ${updated}`);
  console.log(`跳过 (无新标签): ${skipped}`);
  
  console.log('\n=== 新增标签统计 ===');
  const sorted = Object.entries(newTagsAdded).sort((a, b) => b[1] - a[1]);
  for (const [tag, count] of sorted) {
    console.log(`  ${tag}: ${count}`);
  }
  
  await prisma.$disconnect();
}

main().catch(console.error);
