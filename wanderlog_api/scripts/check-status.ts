import prisma from '../src/config/database';

async function checkStatus() {
  // 检查总数
  const total = await prisma.place.count();
  
  // 检查有 categorySlug 的数量
  const withCategorySlug = await prisma.place.count({ where: { categorySlug: { not: null } } });
  
  // 检查有 coverImage 的数量
  const withCoverImage = await prisma.place.count({ where: { coverImage: { not: null } } });
  
  // 检查使用新 CDN URL 的数量
  const withNewCdnUrl = await prisma.place.count({ 
    where: { coverImage: { startsWith: 'https://img.vago.to' } } 
  });
  
  // 检查有 priceLevel 的数量
  const withPriceLevel = await prisma.place.count({ where: { priceLevel: { not: null } } });
  
  // 检查 isVerified 的数量
  const verified = await prisma.place.count({ where: { isVerified: true } });
  
  // 检查有 googlePlaceId 的数量
  const withGooglePlaceId = await prisma.place.count({ where: { googlePlaceId: { not: null } } });
  
  // 检查巴黎数据
  const parisPlaces = await prisma.place.count({ where: { city: 'Paris' } });
  
  console.log('📊 数据库状态:');
  console.log('总地点数:', total);
  console.log('有 categorySlug:', withCategorySlug);
  console.log('有 coverImage:', withCoverImage);
  console.log('使用新 CDN URL:', withNewCdnUrl);
  console.log('有 priceLevel:', withPriceLevel);
  console.log('isVerified=true:', verified);
  console.log('有 googlePlaceId:', withGooglePlaceId);
  console.log('巴黎地点:', parisPlaces);
  
  await prisma.$disconnect();
}

checkStatus();
