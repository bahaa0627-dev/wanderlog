import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// List of Pritzker Prize laureates
const pritzkerArchitects = [
  "Aldo Rossi", "Alejandro Alavena", "Arata Isozaki", "Balkrishna Doshi",
  "Christian de Portzamparc", "David Chipperfield", "Diébédo Francis Kéré",
  "Eduardo Souto de Moura", "Frank Gehry", "Frei Otto", "Fumihiko Maki",
  "Gordon Bunshaft", "Gottfried Böhm", "Hans Hollein", "Herzog & de Meuron",
  "I. M. Pei", "Jacques Herzog", "James Stirling", "Jean Nouvel",
  "Jean-Philippe Vassal", "Jørn Utzon", "Kazuyo Sejima", "Kenzō Tange",
  "Kevin Roche", "Luis Barragán", "Norman Foster", "Oscar Niemeyer",
  "Paulo Mendes da Rocha", "Peter Zumthor", "Philip Johnson",
  "Pierre de Meuron", "RCR Arquitectes", "Rafael Moneo", "Rem Koolhaas",
  "Renzo Piano", "Richard Meier", "Richard Rogers", "Riken Yamamoto",
  "Robert Venturi", "Ryue Nishizawa", "SANAA", "Shelley McNamara",
  "Shigeru Ban", "Sverre Fehn", "Tadao Ando", "Thom Mayne", "Toyo Ito",
  "Wang Shu", "Yvonne Farrell", "Zaha Hadid", "Álvaro Siza Vieira"
];

async function checkImportedPritzker() {
  console.log('🔍 Checking imported Pritzker Prize architect works...\n');

  // Check all places from wikidata source
  const wikidataPlaces = await prisma.place.findMany({
    where: {
      source: 'wikidata'
    },
    select: {
      id: true,
      name: true,
      tags: true,
      customFields: true,
      source: true,
    }
  });

  console.log(`📊 Total places from wikidata source: ${wikidataPlaces.length}`);

  // Filter for Pritzker architects
  const pritzkerPlaces = wikidataPlaces.filter(place => {
    if (!place.customFields || typeof place.customFields !== 'object') {
      return false;
    }
    
    const customFields = place.customFields as any;
    const architect = customFields.architect;
    
    return architect && pritzkerArchitects.includes(architect);
  });

  console.log(`📊 Places by Pritzker laureates: ${pritzkerPlaces.length}\n`);

  // Count by architect
  const countByArchitect: Record<string, number> = {};
  pritzkerPlaces.forEach(place => {
    const customFields = place.customFields as any;
    const architect = customFields.architect;
    if (architect) {
      countByArchitect[architect] = (countByArchitect[architect] || 0) + 1;
    }
  });

  console.log('Imported works by architect:');
  Object.entries(countByArchitect)
    .sort((a, b) => b[1] - a[1])
    .forEach(([architect, count]) => {
      console.log(`  ${architect}: ${count}`);
    });

  // Check tag structure
  console.log('\n📋 Sample tag structures:');
  pritzkerPlaces.slice(0, 3).forEach(place => {
    console.log(`\n  ${place.name}:`);
    console.log(`    Tags: ${JSON.stringify(place.tags)}`);
    console.log(`    CustomFields: ${JSON.stringify(place.customFields)}`);
  });

  // Check if tags have Pritzker award
  const withPritzkerAward = pritzkerPlaces.filter(place => {
    if (!place.tags || typeof place.tags !== 'object') {
      return false;
    }
    const tags = place.tags as any;
    return tags.award && Array.isArray(tags.award) && tags.award.includes('Pritzker');
  });

  console.log(`\n📊 Places with Pritzker award tag: ${withPritzkerAward.length}`);

  console.log('\n✅ Check complete');
}

checkImportedPritzker()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
