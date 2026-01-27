#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();

async function main() {
  const places = await prisma.place.findMany({
    where: { coverImage: { not: null } },
    select: { id: true, name: true, city: true, coverImage: true }
  });

  const oldFormat = places.filter(p => 
    p.coverImage?.match(/\/places\/[a-f0-9-]{36}\/cover\.jpg/)
  );

  console.log(`Total places with images: ${places.length}`);
  console.log(`Old format count: ${oldFormat.length}`);
  
  if (oldFormat.length > 0) {
    console.log('\nPlaces with old format:');
    oldFormat.forEach((p, i) => {
      console.log(`${i + 1}. ${p.name} (${p.city || 'No city'})`);
      console.log(`   ${p.coverImage}`);
    });
  }

  fs.writeFileSync('old_format_places.txt', 
    oldFormat.map(p => `${p.name}\t${p.city || ''}\t${p.coverImage}`).join('\n')
  );
  
  await prisma.$disconnect();
}

main().catch(console.error);
