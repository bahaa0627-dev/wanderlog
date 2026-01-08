import prisma from './src/config/database';

async function checkCafe() {
  const place = await prisma.place.findFirst({
    where: { name: 'Café Harcourt' },
    select: {
      id: true,
      name: true,
      createdAt: true,
      tags: true,
    }
  });
  
  if (place) {
    console.log('找到 Café Harcourt:');
    console.log(`  创建时间: ${place.createdAt}`);
    console.log(`  tags: ${JSON.stringify(place.tags)}`);
  } else {
    console.log('未找到 Café Harcourt');
  }
  
  // 检查总共有多少地点
  const total = await prisma.place.count();
  console.log(`\n数据库中总共有 ${total} 个地点`);
  
  // 检查最新的10个地点
  const latest = await prisma.place.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    select: { name: true, createdAt: true }
  });
  
  console.log('\n最新的10个地点:');
  latest.forEach((p, i) => {
    console.log(`  ${i+1}. ${p.name} (${p.createdAt})`);
  });
  
  await prisma.$disconnect();
}

checkCafe().catch(console.error);
