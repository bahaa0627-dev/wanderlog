/**
 * Migration Script: Fix Duplicate Images
 * 
 * This script removes duplicate images from the images array in place records.
 * 
 * Usage:
 *   npx ts-node scripts/fix-duplicate-images.ts [--dry-run]
 */

import prisma from '../src/config/database';

interface PlaceRecord {
  id: string;
  name: string;
  images: string[];
  coverImage: string | null;
}

async function fixDuplicateImages(dryRun: boolean = false): Promise<void> {
  console.log('🔧 Fix Duplicate Images Migration');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  console.log('');

  // Find all records with images
  const records = await prisma.place.findMany({
    where: {
      NOT: {
        images: { equals: [] },
      },
    },
    select: {
      id: true,
      name: true,
      images: true,
      coverImage: true,
    },
  }) as PlaceRecord[];

  console.log(`📊 Found ${records.length} records with images`);
  console.log('');

  let duplicateCount = 0;
  let totalDuplicateImages = 0;

  for (const r of records) {
    const images = r.images;
    const uniqueImages = [...new Set(images)];
    
    // Also remove coverImage from images array if it exists there
    const coverImage = r.coverImage;
    const filteredImages = coverImage 
      ? uniqueImages.filter(img => img !== coverImage)
      : uniqueImages;
    
    const removedCount = images.length - filteredImages.length;
    
    if (removedCount > 0) {
      duplicateCount++;
      totalDuplicateImages += removedCount;
      
      if (dryRun && duplicateCount <= 10) {
        console.log(`📝 ${r.name}`);
        console.log(`   Original: ${images.length} images → Unique: ${filteredImages.length} images`);
      }
      
      if (!dryRun) {
        await prisma.place.update({
          where: { id: r.id },
          data: { images: filteredImages },
        });
      }
    }
  }

  console.log('');
  console.log('📊 Summary');
  console.log('==========');
  console.log(`Total records with images: ${records.length}`);
  console.log(`Records with duplicates: ${duplicateCount}`);
  console.log(`Total duplicate images removed: ${totalDuplicateImages}`);

  if (dryRun) {
    console.log('');
    console.log('⚠️  This was a dry run. No changes were made.');
  } else {
    console.log('');
    console.log('✅ Migration complete!');
  }
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

fixDuplicateImages(dryRun)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });
