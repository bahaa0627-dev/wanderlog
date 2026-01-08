import prisma from './src/config/database';

async function findBreakfast() {
  console.log('直接查询数据库中包含 breakfast 的地点...\n');
  
  // 使用原始 SQL 查询
  const result: any[] = await prisma.$queryRaw`
    SELECT id, name, "aiTags", tags 
    FROM "Place" 
    WHERE "aiTags"::text LIKE '%breakfast%' 
       OR tags::text LIKE '%breakfast%'
    LIMIT 10
  `;
  
  console.log(`找到 ${result.length} 个地点:\n`);
  
  for (const place of result) {
    console.log(`${place.name}`);
    console.log(`  aiTags: ${JSON.stringify(place.aiTags)}`);
    console.log(`  tags: ${JSON.stringify(place.tags)}\n`);
  }
  
  await prisma.$disconnect();
}

findBreakfast().catch(console.error);
