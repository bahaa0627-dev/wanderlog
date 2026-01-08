import prisma from './src/config/database';

async function checkBatch5() {
  // 获取 offset 2100, limit 1000 的地点
  const places = await prisma.place.findMany({
    where: {
      source: 'wikidata'
    },
    skip: 2100,
    take: 1000,
    select: {
      id: true,
      name: true,
      googlePlaceId: true,
      rating: true,
      ratingCount: true,
      openingHours: true,
      coverImage: true,
      customFields: true
    }
  });

  let withGoogleId = 0;
  let withRating = 0;
  let withOpeningHours = 0;
  let withCoverImage = 0;
  let withMultipleImages = 0;

  for (const place of places) {
    if (place.googlePlaceId) withGoogleId++;
    if (place.rating) withRating++;
    if (place.openingHours) withOpeningHours++;
    if (place.coverImage) withCoverImage++;
    
    const customFields = place.customFields as any;
    if (customFields?.images && Array.isArray(customFields.images) && customFields.images.length > 0) {
      withMultipleImages++;
    }
  }

  console.log('📊 批次 5 地点状态（offset 2100, limit 1000）：');
  console.log(`   总数: ${places.length}`);
  console.log(`   有 Google Place ID: ${withGoogleId} (${((withGoogleId / places.length) * 100).toFixed(1)}%)`);
  console.log(`   有评分: ${withRating} (${((withRating / places.length) * 100).toFixed(1)}%)`);
  console.log(`   有营业时间: ${withOpeningHours} (${((withOpeningHours / places.length) * 100).toFixed(1)}%)`);
  console.log(`   有封面图: ${withCoverImage} (${((withCoverImage / places.length) * 100).toFixed(1)}%)`);
  console.log(`   有多张图片: ${withMultipleImages} (${((withMultipleImages / places.length) * 100).toFixed(1)}%)`);
  console.log('');
  console.log('💡 结论：');
  if (withGoogleId > 900) {
    console.log('   ✅ 大部分地点已经被 Apify 更新过');
    console.log('   ✅ 可以跳过这批，或者重新运行以获取最新数据');
  } else if (withGoogleId > 500) {
    console.log('   ⚠️  约一半地点已更新，一半未更新');
    console.log('   💡 建议：运行这批以补全未更新的地点');
  } else {
    console.log('   ❌ 大部分地点还未被 Apify 更新');
    console.log('   💡 建议：继续运行这批');
  }

  await prisma.$disconnect();
}

checkBatch5().catch(console.error);
