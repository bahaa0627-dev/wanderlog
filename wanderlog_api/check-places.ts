import prisma from './src/config/database';

async function checkPlaces() {
  const placeIds = [
    'ChIJqV3mPQWmsYkRSE3A-tlp5Qo', // Blandford Church
    'ChIJyTmcRApbwokR-oXJRqpVI8Y', // Brooklyn Museum
    'ChIJr9-LTNSxOG0Ruz5vRCRiyDI'  // Bolton Street Cemetery
  ];

  console.log('检查这三个地点是否已在数据库中：\n');

  for (const placeId of placeIds) {
    const place = await prisma.place.findUnique({
      where: { googlePlaceId: placeId },
      select: {
        id: true,
        name: true,
        googlePlaceId: true,
        city: true,
        country: true,
        rating: true,
        coverImage: true,
        updatedAt: true,
        customFields: true
      }
    });

    if (place) {
      const customFields = place.customFields as any;
      const hasMultipleImages = customFields?.images && Array.isArray(customFields.images) && customFields.images.length > 0;
      
      console.log(`✅ ${place.name}`);
      console.log(`   Google Place ID: ${place.googlePlaceId}`);
      console.log(`   城市: ${place.city}, ${place.country}`);
      console.log(`   评分: ${place.rating || 'N/A'}`);
      console.log(`   封面图: ${place.coverImage ? '有' : '无'}`);
      console.log(`   图片数组: ${hasMultipleImages ? customFields.images.length + ' 张' : '无'}`);
      console.log(`   最后更新: ${place.updatedAt.toISOString()}`);
      console.log('');
    } else {
      console.log(`❌ Place ID ${placeId} 不在数据库中`);
      console.log('');
    }
  }

  await prisma.$disconnect();
}

checkPlaces().catch(console.error);
