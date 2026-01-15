import prisma from '../src/config/database';

async function dedupePlaces() {
  const prismaAny = prisma as any;
  
  console.log('🔍 Finding duplicate places...\n');
  
  // 1. Find duplicates by google_place_id
  const googleIdDupes = await prismaAny.$queryRaw`
    SELECT google_place_id, 
           array_agg(id ORDER BY created_at ASC) as place_ids,
           array_agg(name ORDER BY created_at ASC) as names,
           COUNT(*) as cnt
    FROM places 
    WHERE google_place_id IS NOT NULL AND google_place_id != ''
    GROUP BY google_place_id 
    HAVING COUNT(*) > 1
  `;
  
  console.log(`Found ${googleIdDupes.length} groups of duplicates by google_place_id`);
  
  let totalMerged = 0;
  let totalDeleted = 0;
  
  for (const dupe of googleIdDupes as any[]) {
    const placeIds = dupe.place_ids;
    const keepId = placeIds[0]; // Keep the oldest one
    const deleteIds = placeIds.slice(1);
    
    console.log(`\n📍 Merging "${dupe.names[0]}" (google_place_id: ${dupe.google_place_id})`);
    console.log(`   Keep: ${keepId}`);
    console.log(`   Delete: ${deleteIds.join(', ')}`);
    
    // Update trip_spots to point to the kept place
    for (const deleteId of deleteIds) {
      const updated = await prismaAny.$executeRaw`
        UPDATE trip_spots 
        SET place_id = ${keepId}::uuid
        WHERE place_id = ${deleteId}::uuid
          AND NOT EXISTS (
            SELECT 1 FROM trip_spots ts2 
            WHERE ts2.trip_id = trip_spots.trip_id 
              AND ts2.place_id = ${keepId}::uuid
          )
      `;
      
      // Delete any remaining trip_spots that would be duplicates
      const deleted = await prismaAny.$executeRaw`
        DELETE FROM trip_spots WHERE place_id = ${deleteId}::uuid
      `;
      
      console.log(`   Updated ${updated} trip_spots, deleted ${deleted} duplicate trip_spots`);
      totalMerged += Number(updated);
    }
    
    // Delete the duplicate places
    for (const deleteId of deleteIds) {
      await prismaAny.$executeRaw`
        DELETE FROM places WHERE id = ${deleteId}::uuid
      `;
      totalDeleted++;
    }
  }
  
  // 2. Find duplicates by name + coordinates (within ~100m)
  const locationDupes = await prismaAny.$queryRaw`
    SELECT name, 
           ROUND(latitude::numeric, 3) as lat, 
           ROUND(longitude::numeric, 3) as lng,
           array_agg(id ORDER BY created_at ASC) as place_ids,
           COUNT(*) as cnt
    FROM places 
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL
    GROUP BY name, ROUND(latitude::numeric, 3), ROUND(longitude::numeric, 3)
    HAVING COUNT(*) > 1
  `;
  
  console.log(`\nFound ${locationDupes.length} groups of duplicates by name + location`);
  
  for (const dupe of locationDupes as any[]) {
    const placeIds = dupe.place_ids;
    const keepId = placeIds[0];
    const deleteIds = placeIds.slice(1);
    
    console.log(`\n📍 Merging "${dupe.name}" at (${dupe.lat}, ${dupe.lng})`);
    console.log(`   Keep: ${keepId}`);
    console.log(`   Delete: ${deleteIds.join(', ')}`);
    
    for (const deleteId of deleteIds) {
      const updated = await prismaAny.$executeRaw`
        UPDATE trip_spots 
        SET place_id = ${keepId}::uuid
        WHERE place_id = ${deleteId}::uuid
          AND NOT EXISTS (
            SELECT 1 FROM trip_spots ts2 
            WHERE ts2.trip_id = trip_spots.trip_id 
              AND ts2.place_id = ${keepId}::uuid
          )
      `;
      
      const deleted = await prismaAny.$executeRaw`
        DELETE FROM trip_spots WHERE place_id = ${deleteId}::uuid
      `;
      
      console.log(`   Updated ${updated} trip_spots, deleted ${deleted} duplicate trip_spots`);
      totalMerged += Number(updated);
    }
    
    for (const deleteId of deleteIds) {
      await prismaAny.$executeRaw`
        DELETE FROM places WHERE id = ${deleteId}::uuid
      `;
      totalDeleted++;
    }
  }
  
  console.log(`\n✅ Done! Merged ${totalMerged} trip_spots, deleted ${totalDeleted} duplicate places`);
}

dedupePlaces()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
