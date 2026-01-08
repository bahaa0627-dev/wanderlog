/**
 * Test Tag Extraction
 * 
 * Tests the tag extraction utility with sample data
 */

import prisma from '../src/config/database';
import { formatTagsForDisplay } from '../src/utils/tagExtractor';

async function testTagExtraction() {
  console.log('🧪 Testing Tag Extraction\n');

  // Get a few sample places
  const places = await prisma.place.findMany({
    where: {
      source: 'wikidata',
    },
    select: {
      id: true,
      name: true,
      categorySlug: true,
      categoryEn: true,
      categoryZh: true,
      category: true,
      tags: true,
      aiTags: true,
    },
    take: 10,
  });

  console.log(`Found ${places.length} places with tags\n`);

  for (const place of places) {
    console.log('─'.repeat(60));
    console.log(`📍 ${place.name}`);
    console.log(`   Category: ${place.categoryEn || place.category} (${place.categorySlug || place.category})`);
    
    if (place.tags) {
      console.log(`   Tags (raw): ${JSON.stringify(place.tags)}`);
    }
    
    if (place.aiTags) {
      console.log(`   AI Tags (raw): ${JSON.stringify(place.aiTags)}`);
    }

    const tagInfo = formatTagsForDisplay(place.tags, place.aiTags, 'en');
    
    console.log(`   Extracted tags: ${tagInfo.tags.join(', ')}`);
    console.log(`   Extracted AI tags: ${tagInfo.aiTags.join(', ')}`);
    console.log(`   All tags: ${tagInfo.allTags.join(', ')}`);
    console.log(`   Display string: ${tagInfo.displayString}`);
    console.log();
  }

  await prisma.$disconnect();
}

testTagExtraction()
  .then(() => {
    console.log('✅ Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
