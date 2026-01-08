import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function diagnosePritzkerImport() {
  console.log('🔍 Diagnosing Pritzker import issue...\n');

  // Check places with wikidataWorkURL in customFields
  const placesWithWikidataURL = await prisma.place.findMany({
    where: {
      source: 'wikidata',
      customFields: {
        path: ['wikidataWorkURL'],
        not: null
      }
    },
    select: {
      id: true,
      name: true,
      tags: true,
      customFields: true,
      source: true,
    },
    take: 10
  });

  console.log(`📊 Places with wikidataWorkURL: ${placesWithWikidataURL.length}`);
  
  if (placesWithWikidataURL.length > 0) {
    console.log('\nSample places:');
    placesWithWikidataURL.forEach(place => {
      console.log(`\n  ${place.name}:`);
      console.log(`    Tags: ${JSON.stringify(place.tags)}`);
      console.log(`    CustomFields: ${JSON.stringify(place.customFields)}`);
    });
  }

  // Check total wikidata places
  const totalWikidata = await prisma.place.count({
    where: {
      source: 'wikidata'
    }
  });

  console.log(`\n📊 Total wikidata places: ${totalWikidata}`);

  // Check places with architect in customFields
  const placesWithArchitect = await prisma.place.findMany({
    where: {
      source: 'wikidata',
      customFields: {
        path: ['architect'],
        not: null
      }
    },
    select: {
      id: true,
      name: true,
      customFields: true,
    },
    take: 20
  });

  console.log(`\n📊 Places with architect in customFields: ${placesWithArchitect.length}`);
  
  if (placesWithArchitect.length > 0) {
    console.log('\nArchitects found:');
    const architects = new Set<string>();
    placesWithArchitect.forEach(place => {
      const customFields = place.customFields as any;
      if (customFields.architect) {
        architects.add(customFields.architect);
      }
    });
    architects.forEach(arch => console.log(`  - ${arch}`));
  }

  console.log('\n✅ Diagnosis complete');
}

diagnosePritzkerImport()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
