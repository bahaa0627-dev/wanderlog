import prisma from './src/config/database';

async function checkRemaining() {
  const total = await prisma.place.count({
    where: { source: 'wikidata' }
  });
  
  const offset = 2100;
  const remaining = total - offset;
  
  console.log(`📊 数据库统计：`);
  console.log(`   Wikidata 总地点数: ${total}`);
  console.log(`   已处理（offset 0-2099）: ${offset}`);
  console.log(`   剩余（从 offset ${offset} 开始）: ${remaining}`);
  console.log('');
  
  if (remaining >= 2000) {
    console.log(`✅ 可以导出 2000 个地点`);
  } else {
    console.log(`⚠️  只能导出 ${remaining} 个地点（不足 2000）`);
  }
  
  await prisma.$disconnect();
}

checkRemaining().catch(console.error);
