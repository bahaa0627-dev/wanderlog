/**
 * Rollback Batch 2 Import
 * 
 * This script removes places that were incorrectly inserted during batch 2 import
 * (after 2026-01-08 10:00:00 UTC) so we can re-import them correctly.
 */

import prisma from '../src/config/database';

async function main() {
  console.log('🔄 Rolling back batch 2 import...\n');

  // Find places created during batch 2 import (after 2026-01-08 10:00:00)
  const batch2StartTime = new Date('2026-01-08T10:00:00.000Z');
  
  const batch2Places = await prisma.place.findMany({
    where: {
      source: 'apify_google_places',
      createdAt: {
        gte: batch2StartTime,
      },
    },
    select: {
      id: true,
      name: true,
      city: true,
      country: true,
      latitude: true,
      longitude: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  console.log(`Found ${batch2Places.length} places from batch 2\n`);

  if (batch2Places.length === 0) {
    console.log('✅ No batch 2 places found!');
    return;
  }

  // Show first 10
  console.log('First 10 places to delete:');
  for (const place of batch2Places.slice(0, 10)) {
    console.log(`   - ${place.name} (${place.city || 'no city'}, ${place.country || 'no country'})`);
    console.log(`     Created: ${place.createdAt.toISOString()}`);
  }

  if (batch2Places.length > 10) {
    console.log(`   ... and ${batch2Places.length - 10} more`);
  }

  console.log(`\n⚠️  This will DELETE ${batch2Places.length} places from the database!`);
  console.log(`   Run with --confirm to proceed\n`);

  if (process.argv.includes('--confirm')) {
    console.log('🗑️  Deleting batch 2 places...\n');
    
    const result = await prisma.place.deleteMany({
      where: {
        id: {
          in: batch2Places.map(p => p.id),
        },
      },
    });

    console.log(`✅ Deleted ${result.count} places from batch 2`);
    console.log('\n📝 Next steps:');
    console.log('   1. Re-import batch 2 with fixed deduplication logic:');
    console.log('      npx tsx scripts/import-apify-places.ts --file "wikidata-batch-2-full-apify.json"');
  } else {
    console.log('ℹ️  Dry run complete. Add --confirm to actually delete.');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
