/**
 * Check for places that lost their original images during enrichment
 * 
 * This script checks if any Wikidata places that were enriched with Google data
 * lost their original coverImage without it being moved to the images array.
 */

import prisma from '../src/config/database';

async function main() {
  console.log('🔍 Checking for missing original images...\n');

  // Find all Wikidata places that have been enriched (have googlePlaceId)
  const enrichedPlaces = await prisma.place.findMany({
    where: {
      source: 'wikidata',
      googlePlaceId: {
        not: null,
      },
    },
    select: {
      id: true,
      name: true,
      coverImage: true,
      customFields: true,
      googlePlaceId: true,
    },
  });

  console.log(`Found ${enrichedPlaces.length} enriched Wikidata places\n`);

  let withImages = 0;
  let withoutImages = 0;
  let withImagesArray = 0;

  for (const place of enrichedPlaces) {
    const customFields = place.customFields as Record<string, unknown>;
    const images = customFields.images as Array<{ url: string; source?: string }> | undefined;

    const hasCoverImage = !!place.coverImage;
    const hasImagesArray = images && images.length > 0;

    if (hasCoverImage) withImages++;
    else withoutImages++;

    if (hasImagesArray) withImagesArray++;

    // Log places that might have lost images
    if (!hasImagesArray && hasCoverImage) {
      console.log(`⚠️  ${place.name}`);
      console.log(`   - Has coverImage: ${hasCoverImage}`);
      console.log(`   - Has images array: ${hasImagesArray}`);
      console.log(`   - Images count: ${images?.length || 0}`);
      console.log('');
    }
  }

  console.log('\n📊 Summary:');
  console.log(`   Total enriched: ${enrichedPlaces.length}`);
  console.log(`   With coverImage: ${withImages}`);
  console.log(`   Without coverImage: ${withoutImages}`);
  console.log(`   With images array: ${withImagesArray}`);
  console.log(`   Without images array: ${enrichedPlaces.length - withImagesArray}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
