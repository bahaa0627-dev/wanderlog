/**
 * Update "new york city" to "New York" in places table
 */

import prisma from '../src/config/database';

async function main() {
  console.log('🔧 Updating New York City names...\n');

  // Find all records with "new york city" (case-insensitive)
  const places = await prisma.place.findMany({
    where: {
      city: {
        equals: 'new york city',
        mode: 'insensitive',
      },
    },
    select: {
      id: true,
      name: true,
      city: true,
    },
  });

  console.log(`📊 Found ${places.length} places with "new york city"`);

  if (places.length === 0) {
    console.log('✅ No places to update');
    await prisma.$disconnect();
    return;
  }

  // Show sample places
  console.log('\nSample places to update:');
  places.slice(0, 5).forEach((place, i) => {
    console.log(`  ${i + 1}. ${place.name} - ${place.city}`);
  });

  if (places.length > 5) {
    console.log(`  ... and ${places.length - 5} more\n`);
  } else {
    console.log('');
  }

  // Update all places
  console.log('Updating...');
  const result = await prisma.place.updateMany({
    where: {
      city: {
        equals: 'new york city',
        mode: 'insensitive',
      },
    },
    data: {
      city: 'New York',
    },
  });

  console.log(`\n✅ Updated ${result.count} places`);
  console.log('   "new york city" → "New York"');

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
