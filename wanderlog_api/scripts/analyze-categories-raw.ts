import prisma from '../src/config/database';

async function main() {
  const places = await prisma.place.findMany({
    select: {
      name: true,
      customFields: true,
      sourceDetails: true,
      aiTags: true,
    },
    take: 500
  });
  
  const categoriesRaw: Record<string, number> = {};
  const samples: any[] = [];
  let withCategoriesRaw = 0;
  let withoutAiTags = 0;
  
  for (const p of places) {
    const cf = p.customFields as any || {};
    const sd = p.sourceDetails as any || {};
    
    // 检查 customFields.categoriesRaw
    const cats1 = cf.categoriesRaw || [];
    // 检查 sourceDetails.categoriesRaw
    const cats2 = sd.categoriesRaw || [];
    
    const allCats = [...cats1, ...cats2];
    
    if (allCats.length > 0) {
      withCategoriesRaw++;
      for (const cat of allCats) {
        categoriesRaw[cat] = (categoriesRaw[cat] || 0) + 1;
      }
      
      // 检查是否没有 aiTags
      const aiTags = p.aiTags as any[] || [];
      if (aiTags.length === 0) {
        withoutAiTags++;
      }
      
      if (samples.length < 10) {
        samples.push({ name: p.name, categoriesRaw: allCats, aiTags: aiTags.map((t: any) => t.en) });
      }
    }
  }
  
  console.log('=== 统计 ===');
  console.log(`总记录数: ${places.length}`);
  console.log(`有 categoriesRaw 的: ${withCategoriesRaw}`);
  console.log(`有 categoriesRaw 但没有 aiTags 的: ${withoutAiTags}`);
  
  console.log('\n=== categoriesRaw 样本 ===');
  for (const s of samples) {
    console.log(`${s.name}:`);
    console.log(`  categoriesRaw: ${JSON.stringify(s.categoriesRaw)}`);
    console.log(`  aiTags: ${JSON.stringify(s.aiTags)}`);
  }
  
  console.log('\n=== categoriesRaw 统计 (Top 50) ===');
  const sorted = Object.entries(categoriesRaw).sort((a, b) => b[1] - a[1]).slice(0, 50);
  for (const [cat, count] of sorted) {
    console.log(`  ${cat}: ${count}`);
  }
  
  await prisma.$disconnect();
}

main();
