const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();

async function importData() {
  console.log('🔄 开始批量导入数据...');
  
  const data = JSON.parse(fs.readFileSync('backup_data.json', 'utf8'));
  
  try {
    // 1. Profile - 批量插入
    if (data.profiles.length > 0) {
      console.log('📦 导入 Profile...');
      await prisma.profile.createMany({ data: data.profiles, skipDuplicates: true });
      console.log('   ✅', data.profiles.length);
    }
    
    // 2. Place - 批量插入
    if (data.places.length > 0) {
      console.log('📦 导入 Place...');
      await prisma.place.createMany({ data: data.places, skipDuplicates: true });
      console.log('   ✅', data.places.length);
    }
    
    // 3. Collection - 批量插入
    if (data.collections.length > 0) {
      console.log('📦 导入 Collection...');
      await prisma.collection.createMany({ data: data.collections, skipDuplicates: true });
      console.log('   ✅', data.collections.length);
    }
    
    // 4. CollectionSpot - 批量插入
    if (data.collectionSpots.length > 0) {
      console.log('📦 导入 CollectionSpot...');
      await prisma.collectionSpot.createMany({ data: data.collectionSpots, skipDuplicates: true });
      console.log('   ✅', data.collectionSpots.length);
    }
    
    // 5. CollectionRecommendation - 批量插入
    if (data.collectionRecommendations.length > 0) {
      console.log('📦 导入 CollectionRecommendation...');
      await prisma.collectionRecommendation.createMany({ data: data.collectionRecommendations, skipDuplicates: true });
      console.log('   ✅', data.collectionRecommendations.length);
    }
    
    // 6. CollectionRecommendationItem - 批量插入
    if (data.collectionRecommendationItems.length > 0) {
      console.log('📦 导入 CollectionRecommendationItem...');
      await prisma.collectionRecommendationItem.createMany({ data: data.collectionRecommendationItems, skipDuplicates: true });
      console.log('   ✅', data.collectionRecommendationItems.length);
    }
    
    // 7. UserCollectionFavorite - 批量插入
    if (data.userCollectionFavorites.length > 0) {
      console.log('📦 导入 UserCollectionFavorite...');
      await prisma.userCollectionFavorite.createMany({ data: data.userCollectionFavorites, skipDuplicates: true });
      console.log('   ✅', data.userCollectionFavorites.length);
    }
    
    console.log('\n✅ 数据导入完成!');
    
    // 验证
    const counts = {
      places: await prisma.place.count(),
      collections: await prisma.collection.count(),
      recommendations: await prisma.collectionRecommendation.count(),
    };
    console.log('\n📊 验证数据:');
    console.log('   Places:', counts.places);
    console.log('   Collections:', counts.collections);
    console.log('   Recommendations:', counts.recommendations);
    
  } catch (e) {
    console.error('❌ 导入失败:', e.message);
  }
  
  await prisma.$disconnect();
}

importData();
