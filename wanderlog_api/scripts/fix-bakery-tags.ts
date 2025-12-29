/**
 * 修复 Bakery 标签：
 * - 如果 category 是 Bakery，移除 Bakery 标签
 * - 如果 category 是 Cafe，保留 Bakery 标签
 */
import prisma from '../src/config/database';

async function main() {
  console.log('🔍 查找 category=Bakery 且有 Bakery 标签的记录...');
  
  const places = await prisma.place.findMany({
    where: { categoryEn: 'Bakery' },
    select: { id: true, name: true, aiTags: true }
  });
  
  let fixed = 0;
  
  for (const place of places) {
    const aiTags = place.aiTags as any[] || [];
    const hasBakeryTag = aiTags.some((t: any) => t.en === 'Bakery');
    
    if (hasBakeryTag) {
      const filtered = aiTags.filter((t: any) => t.en !== 'Bakery');
      await prisma.place.update({
        where: { id: place.id },
        data: { aiTags: filtered }
      });
      fixed++;
      console.log(`✅ ${place.name}: 移除 Bakery 标签`);
    }
  }
  
  console.log(`\n总共修复: ${fixed} 条记录`);
  
  // 同样处理 Pastry 标签
  console.log('\n🔍 查找 category=Bakery 且有 Pastry 标签的记录...');
  
  const places2 = await prisma.place.findMany({
    where: { categoryEn: 'Bakery' },
    select: { id: true, name: true, aiTags: true }
  });
  
  let fixed2 = 0;
  
  for (const place of places2) {
    const aiTags = place.aiTags as any[] || [];
    const hasPastryTag = aiTags.some((t: any) => t.en === 'Pastry');
    
    if (hasPastryTag) {
      const filtered = aiTags.filter((t: any) => t.en !== 'Pastry');
      await prisma.place.update({
        where: { id: place.id },
        data: { aiTags: filtered }
      });
      fixed2++;
      console.log(`✅ ${place.name}: 移除 Pastry 标签`);
    }
  }
  
  console.log(`\n总共修复 Pastry: ${fixed2} 条记录`);
  
  await prisma.$disconnect();
}

main().catch(console.error);
