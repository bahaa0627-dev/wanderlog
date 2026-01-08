/**
 * Check if a place exists in database by coordinates
 */

import prisma from '../src/config/database';

async function main() {
  const name = process.argv[2] || 'Anfield';
  const lat = parseFloat(process.argv[3] || '53.4327564');
  const lng = parseFloat(process.argv[4] || '-2.954592');
  
  console.log(`\n🔍 Searching for places near "${name}" (${lat}, ${lng})...\n`);
  
  const threshold = 0.001; // ~111 meters
  
  const places = await prisma.place.findMany({
    where: {
      latitude: {
        gte: lat - threshold,
        lte: lat + threshold,
      },
      longitude: {
        gte: lng - threshold,
        lte: lng + threshold,
      },
    },
    select: {
      name: true,
      city: true,
      country: true,
      latitude: true,
      longitude: true,
      source: true,
    },
  });
  
  console.log(`Found ${places.length} places within ~111m:\n`);
  
  if (places.length === 0) {
    console.log('❌ No places found in database near these coordinates');
    console.log('   This place was likely never imported to the database\n');
  } else {
    for (const place of places) {
      const distance = Math.sqrt(
        Math.pow(place.latitude - lat, 2) + 
        Math.pow(place.longitude - lng, 2)
      ) * 111000;
      console.log(`  📍 ${place.name}`);
      console.log(`     City: ${place.city || 'N/A'}, Country: ${place.country || 'N/A'}`);
      console.log(`     Distance: ${distance.toFixed(0)}m`);
      console.log(`     Source: ${place.source}`);
      console.log();
    }
  }
  
  await prisma.$disconnect();
}

main().catch(console.error);
