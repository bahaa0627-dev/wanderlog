import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkJardinImages() {
  try {
    const place = await prisma.place.findFirst({
      where: {
        name: 'Jardin du Luxembourg'
      },
      select: {
        id: true,
        name: true,
        coverImage: true,
        images: true,
        latitude: true,
        longitude: true,
      }
    });

    if (place) {
      console.log('✅ Found in Database:');
      console.log('  Name:', place.name);
      console.log('  ID:', place.id);
      console.log('  coverImage:', place.coverImage);
      console.log('  images:', JSON.stringify(place.images, null, 2));
      console.log('  latitude:', place.latitude);
      console.log('  longitude:', place.longitude);
      console.log('');
      console.log('Checks:');
      console.log('  coverImage is empty?', !place.coverImage || place.coverImage === '');
      console.log('  images is empty?', !place.images || (place.images as any[]).length === 0);
      console.log('  lat/lng is NaN?', isNaN(place.latitude) || isNaN(place.longitude));
    } else {
      console.log('❌ Not found in database');
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkJardinImages();
