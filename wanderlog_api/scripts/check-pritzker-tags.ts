import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkPritzkerTags() {
  console.log('🔍 Checking Pritzker Prize tagged places...\n');

  // Check places with Pritzker in tags array
  const placesWithPritzkerTag = await prisma.place.findMany({
    where: {
      tags: {
        array_contains: 'Pritzker'
      }
    },
    select: {
      id: true,
      name: true,
      tags: true,
      customFields: true,
    }
  });

  console.log(`📊 Places with 'Pritzker' tag: ${placesWithPritzkerTag.length}`);
  
  if (placesWithPritzkerTag.length > 0) {
    console.log('\nSample places with Pritzker tag:');
    placesWithPritzkerTag.slice(0, 5).forEach(place => {
      console.log(`  - ${place.name}`);
      console.log(`    Tags: ${JSON.stringify(place.tags)}`);
      console.log(`    CustomFields: ${JSON.stringify(place.customFields)}`);
    });
  }

  // Check places with pritzker in customFields
  const placesWithPritzkerCustomField = await prisma.place.findMany({
    where: {
      OR: [
        {
          customFields: {
            path: ['pritzker'],
            not: null
          }
        },
        {
          customFields: {
            path: ['Pritzker'],
            not: null
          }
        }
      ]
    },
    select: {
      id: true,
      name: true,
      tags: true,
      customFields: true,
    }
  });

  console.log(`\n📊 Places with Pritzker in customFields: ${placesWithPritzkerCustomField.length}`);
  
  if (placesWithPritzkerCustomField.length > 0) {
    console.log('\nSample places with Pritzker in customFields:');
    placesWithPritzkerCustomField.slice(0, 5).forEach(place => {
      console.log(`  - ${place.name}`);
      console.log(`    Tags: ${JSON.stringify(place.tags)}`);
      console.log(`    CustomFields: ${JSON.stringify(place.customFields)}`);
    });
  }

  // Check all places from pritzker import source
  const pritzkerSourcePlaces = await prisma.place.findMany({
    where: {
      source: 'pritzker'
    },
    select: {
      id: true,
      name: true,
      tags: true,
      customFields: true,
      source: true,
    }
  });

  console.log(`\n📊 Places with source='pritzker': ${pritzkerSourcePlaces.length}`);
  
  if (pritzkerSourcePlaces.length > 0) {
    console.log('\nSample places from Pritzker source:');
    pritzkerSourcePlaces.slice(0, 5).forEach(place => {
      console.log(`  - ${place.name}`);
      console.log(`    Tags: ${JSON.stringify(place.tags)}`);
      console.log(`    CustomFields: ${JSON.stringify(place.customFields)}`);
    });
  }

  // Check for any variation of pritzker in tags
  const allPlaces = await prisma.place.findMany({
    select: {
      id: true,
      name: true,
      tags: true,
      customFields: true,
      source: true,
    }
  });

  const pritzkerVariations = allPlaces.filter(place => {
    const tagsStr = JSON.stringify(place.tags || []).toLowerCase();
    const customFieldsStr = JSON.stringify(place.customFields || {}).toLowerCase();
    return tagsStr.includes('pritzker') || customFieldsStr.includes('pritzker');
  });

  console.log(`\n📊 Places with any Pritzker variation: ${pritzkerVariations.length}`);
  
  if (pritzkerVariations.length > 0) {
    console.log('\nAll places with Pritzker variation:');
    pritzkerVariations.forEach(place => {
      console.log(`\n  - ${place.name} (ID: ${place.id})`);
      console.log(`    Source: ${place.source}`);
      console.log(`    Tags: ${JSON.stringify(place.tags)}`);
      console.log(`    CustomFields: ${JSON.stringify(place.customFields)}`);
    });
    
    console.log('\nAll unique tag values containing pritzker:');
    const uniqueTags = new Set<string>();
    pritzkerVariations.forEach(place => {
      if (place.tags && Array.isArray(place.tags)) {
        place.tags.forEach(tag => {
          if (tag.toLowerCase().includes('pritzker')) {
            uniqueTags.add(tag);
          }
        });
      }
    });
    uniqueTags.forEach(tag => console.log(`  - "${tag}"`));
  }

  console.log('\n✅ Check complete');
}

checkPritzkerTags()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
