const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== Galeries Lafayette entries ===');
  const galeries = await prisma.place.findMany({
    where: { name: { contains: 'Galeries Lafayette', mode: 'insensitive' } },
    select: { id: true, name: true, city: true, country: true, coverImage: true, latitude: true, longitude: true }
  });
  console.log(JSON.stringify(galeries, null, 2));

  console.log('\n=== Sainte Chapelle entries ===');
  const chapelle = await prisma.place.findMany({
    where: { name: { contains: 'Chapelle', mode: 'insensitive' } },
    select: { id: true, name: true, city: true, country: true, coverImage: true, latitude: true, longitude: true }
  });
  console.log(JSON.stringify(chapelle, null, 2));

  await prisma.$disconnect();
}

main().catch(console.error);
