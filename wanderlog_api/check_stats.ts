import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkStats() {
  const total = await prisma.publicPlace.count();
  
  const byCountry = await prisma.publicPlace.groupBy({
    by: ['country'],
    _count: true,
    orderBy: {
      _count: {
        country: 'desc'
      }
    }
  });

  const bySource = await prisma.publicPlace.groupBy({
    by: ['source'],
    _count: true
  });

  console.log('📊 数据库统计:');
  console.log('总地点数:', total);
  console.log('\n按国家:');
  byCountry.forEach(c => console.log(`  ${c.country}: ${c._count}`));
  console.log('\n按来源:');
  bySource.forEach(s => console.log(`  ${s.source}: ${s._count}`));

  await prisma.$disconnect();
}

checkStats();
