/**
 * Migration script to set is_verified = true for all places with google_place_id
 * 
 * This script:
 * 1. Adds the is_verified index if it doesn't exist
 * 2. Updates all places with google_place_id to have is_verified = true
 * 
 * Requirements: 14.5, 14.6
 */

import prisma from '../src/config/database';

async function migrateIsVerified() {
  console.log('🚀 Starting is_verified migration...\n');

  try {
    // Step 1: Create index if not exists (using raw SQL for IF NOT EXISTS)
    console.log('📊 Step 1: Creating index on is_verified...');
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_places_is_verified ON places(is_verified)
    `);
    console.log('✅ Index created or already exists\n');

    // Step 2: Count places that need to be updated
    const placesToUpdate = await prisma.place.count({
      where: {
        googlePlaceId: { not: null },
        isVerified: false,
      },
    });
    console.log(`📍 Found ${placesToUpdate} places with google_place_id that need is_verified = true\n`);

    // Step 3: Update places with google_place_id to have is_verified = true
    console.log('📝 Step 2: Updating places with google_place_id...');
    const updateResult = await prisma.$executeRawUnsafe(`
      UPDATE places SET is_verified = true WHERE google_place_id IS NOT NULL
    `);
    console.log(`✅ Updated ${updateResult} places to is_verified = true\n`);

    // Step 4: Verify the migration
    console.log('🔍 Step 3: Verifying migration...');
    const verifiedCount = await prisma.place.count({
      where: { isVerified: true },
    });
    const unverifiedCount = await prisma.place.count({
      where: { isVerified: false },
    });
    const withGoogleIdCount = await prisma.place.count({
      where: { googlePlaceId: { not: null } },
    });
    const withGoogleIdNotVerified = await prisma.place.count({
      where: {
        googlePlaceId: { not: null },
        isVerified: false,
      },
    });

    console.log('📊 Migration Results:');
    console.log(`   - Total verified places: ${verifiedCount}`);
    console.log(`   - Total unverified places: ${unverifiedCount}`);
    console.log(`   - Places with google_place_id: ${withGoogleIdCount}`);
    console.log(`   - Places with google_place_id but NOT verified: ${withGoogleIdNotVerified}`);

    if (withGoogleIdNotVerified === 0) {
      console.log('\n✅ Migration completed successfully!');
      console.log('   All places with google_place_id now have is_verified = true');
    } else {
      console.log('\n⚠️ Warning: Some places with google_place_id are still not verified');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
migrateIsVerified()
  .then(() => {
    console.log('\n🎉 Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Migration failed:', error);
    process.exit(1);
  });
