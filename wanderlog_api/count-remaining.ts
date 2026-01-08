import prisma from './src/config/database';

async function countRemaining() {
  // 总数
  const total = await prisma.place.count({
    where: {
      source: 'wikidata'
    }
  });

  // 已处理的（有 googlePlaceId 的）
  const processed = await prisma.place.count({
    where: {
      source: 'wikidata',
      googlePlaceId: { not: null }
    }
  });

  // 未处理的
  const remaining = total - processed;

  console.log('📊 Wikidata 地点统计：');
  console.log(`   总数: ${total}`);
  console.log(`   已处理（有 Google Place ID）: ${processed}`);
  console.log(`   未处理: ${remaining}`);
  console.log(`   处理进度: ${((processed / total) * 100).toFixed(1)}%`);

  await prisma.$disconnect();
}

countRemaining().catch(console.error);
