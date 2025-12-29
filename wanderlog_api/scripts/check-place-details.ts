import prisma from '../src/config/database';

async function main() {
  const place = await prisma.place.findFirst({
    where: { name: { contains: 'Park Güell', mode: 'insensitive' } },
    select: { 
      name: true, 
      address: true, 
      phoneNumber: true, 
      website: true, 
      openingHours: true, 
      coverImage: true,
      city: true,
      country: true,
    }
  });
  console.log('Park Güell details:');
  console.log(JSON.stringify(place, null, 2));
  
  // Also check Sagrada Familia
  const sagrada = await prisma.place.findFirst({
    where: { name: { contains: 'Sagrada', mode: 'insensitive' } },
    select: { 
      name: true, 
      address: true, 
      phoneNumber: true, 
      website: true, 
      openingHours: true, 
      coverImage: true,
    }
  });
  console.log('\nSagrada Familia details:');
  console.log(JSON.stringify(sagrada, null, 2));
  
  await prisma.$disconnect();
}
main();
