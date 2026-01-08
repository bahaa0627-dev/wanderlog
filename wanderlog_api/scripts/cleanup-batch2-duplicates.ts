/**
 * Cleanup Batch 2 Duplicates
 * 
 * This script removes duplicate places that were incorrectly inserted during batch 2 import.
 * It identifies duplicates by finding places with the same coordinates and keeps the older one.
 */

import prisma from '../src/config/database';

async function main() {
  console.log('🧹 Cleaning up batch 2 duplicates...\n');

  // Find all places, grouped by coordinates
  const allPlaces = await prisma.place.findMany({
    select: {
      id: true,
      name: true,
      latitude: true,
      longitude: true,
      country: true,
      source: true,
      googlePlaceId: true,
      createdAt: true,
      coverImage: true,
    },
    orderBy: {
      createdAt: 'asc', // Older first
    },
  });

  console.log(`Total places in database: ${allPlaces.length}\n`);

  // Group by coordinates (rounded to 6 decimal places for ~0.1m precision)
  const coordinateMap = new Map<string, typeof allPlaces>();
  
  for (const place of allPlaces) {
    const lat = place.latitude.toFixed(6);
    const lng = place.longitude.toFixed(6);
    const key = `${lat},${lng},${place.country}`;
    
    if (!coordinateMap.has(key)) {
      coordinateMap.set(key, []);
    }
    coordinateMap.get(key)!.push(place);
  }

  // Find duplicates
  const duplicateGroups: Array<typeof allPlaces> = [];
  
  for (const [key, places] of coordinateMap) {
    if (places.length > 1) {
      duplicateGroups.push(places);
    }
  }

  console.log(`Found ${duplicateGroups.length} groups with duplicates\n`);

  if (duplicateGroups.length === 0) {
    console.log('✅ No duplicates found!');
    return;
  }

  // Analyze duplicates
  let toDelete: string[] = [];
  
  for (const group of duplicateGroups) {
    console.log(`\n📍 Duplicate group at ${group[0].latitude}, ${group[0].longitude}:`);
    
    // Sort by creation date (oldest first)
    group.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    
    // Keep the first one (oldest), delete the rest
    const [keep, ...remove] = group;
    
    console.log(`   ✅ KEEP: ${keep.name} (${keep.source}, created: ${keep.createdAt.toISOString()})`);
    
    for (const place of remove) {
      console.log(`   ❌ DELETE: ${place.name} (${place.source}, created: ${place.createdAt.toISOString()})`);
      toDelete.push(place.id);
    }
  }

  console.log(`\n\n📊 Summary:`);
  console.log(`   Total duplicate groups: ${duplicateGroups.length}`);
  console.log(`   Places to delete: ${toDelete.length}`);
  console.log(`   Places to keep: ${duplicateGroups.length}`);

  // Ask for confirmation
  console.log(`\n⚠️  This will DELETE ${toDelete.length} places from the database!`);
  console.log(`   Run with --confirm to proceed\n`);

  if (process.argv.includes('--confirm')) {
    console.log('🗑️  Deleting duplicates...\n');
    
    const result = await prisma.place.deleteMany({
      where: {
        id: {
          in: toDelete,
        },
      },
    });

    console.log(`✅ Deleted ${result.count} duplicate places`);
  } else {
    console.log('ℹ️  Dry run complete. Add --confirm to actually delete.');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
