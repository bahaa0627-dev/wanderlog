const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verify() {
  const count = await prisma.place.count({
    where: { source: 'manual_import' }
  });
  
  const places = await prisma.place.findMany({
    where: { source: 'manual_import' },
    select: { name: true, city: true },
    orderBy: { createdAt: 'desc' },
    take: 20
  });
  
  console.log('Found', count, 'manual_import places:');
  places.forEach(p => console.log('-', p.name, '|', p.city));
}

verify().finally(() => prisma.$disconnect());
