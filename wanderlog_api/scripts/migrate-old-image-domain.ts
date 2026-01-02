/**
 * Migrate old image domain to new domain
 * 
 * Old: https://wanderlog-images.blcubahaa0627.workers.dev/places/{googlePlaceId}/cover.jpg
 * New: https://img.vago.to/places/{googlePlaceId}/cover.jpg
 * 
 * The path structure is the same, only the domain changes.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const OLD_DOMAIN = 'wanderlog-images.blcubahaa0627.workers.dev';
const NEW_DOMAIN = 'img.vago.to';

async function migrate() {
  console.log('=== Migrating old image domain to new domain ===\n');
  
  // Find all places with old domain
  const placesWithOldDomain = await prisma.place.findMany({
    where: {
      coverImage: { contains: OLD_DOMAIN }
    },
    select: {
      id: true,
      name: true,
      coverImage: true,
      city: true
    }
  });
  
  console.log(`Found ${placesWithOldDomain.length} places with old domain\n`);
  
  if (placesWithOldDomain.length === 0) {
    console.log('No places to migrate.');
    await prisma.$disconnect();
    return;
  }
  
  // Show sample before migration
  console.log('Sample URLs before migration:');
  for (const p of placesWithOldDomain.slice(0, 3)) {
    console.log(`  ${p.name}: ${p.coverImage}`);
  }
  console.log('');
  
  // Migrate each place
  let successCount = 0;
  let errorCount = 0;
  
  for (const place of placesWithOldDomain) {
    try {
      const newUrl = place.coverImage!.replace(OLD_DOMAIN, NEW_DOMAIN);
      
      await prisma.place.update({
        where: { id: place.id },
        data: { coverImage: newUrl }
      });
      
      successCount++;
      
      if (successCount % 50 === 0) {
        console.log(`Progress: ${successCount}/${placesWithOldDomain.length}`);
      }
    } catch (error) {
      console.error(`Error migrating ${place.name}: ${error}`);
      errorCount++;
    }
  }
  
  console.log(`\n=== Migration Complete ===`);
  console.log(`Success: ${successCount}`);
  console.log(`Errors: ${errorCount}`);
  
  // Verify migration
  const remainingOld = await prisma.place.count({
    where: { coverImage: { contains: OLD_DOMAIN } }
  });
  
  console.log(`\nRemaining places with old domain: ${remainingOld}`);
  
  // Show sample after migration
  const migratedSamples = await prisma.place.findMany({
    where: {
      id: { in: placesWithOldDomain.slice(0, 3).map(p => p.id) }
    },
    select: { name: true, coverImage: true }
  });
  
  console.log('\nSample URLs after migration:');
  for (const p of migratedSamples) {
    console.log(`  ${p.name}: ${p.coverImage}`);
  }
  
  await prisma.$disconnect();
}

migrate().catch(console.error);
