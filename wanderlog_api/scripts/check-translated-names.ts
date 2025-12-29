import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Check how many places have translated prefixes
  const translatedPrefixes = ['Restaurant', 'Museum', 'Square', 'Church', 'Garden', 'Viewpoint', 'Bakery', 'Castle'];
  
  console.log('Checking translated place names...\n');
  
  for (const prefix of translatedPrefixes) {
    const count = await prisma.place.count({
      where: {
        name: { startsWith: `${prefix} ` }
      }
    });
    if (count > 0) {
      console.log(`${prefix}: ${count} places`);
      
      // Show some examples
      const examples = await prisma.place.findMany({
        where: { name: { startsWith: `${prefix} ` } },
        select: { name: true, city: true },
        take: 3
      });
      for (const ex of examples) {
        console.log(`  - ${ex.name} (${ex.city})`);
      }
    }
  }
  
  // Check if we have original names stored somewhere
  console.log('\n\nChecking customFields for original names...');
  const withOriginalName = await prisma.place.count({
    where: {
      customFields: { path: ['originalName'], not: null }
    }
  });
  console.log(`Places with originalName in customFields: ${withOriginalName}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
