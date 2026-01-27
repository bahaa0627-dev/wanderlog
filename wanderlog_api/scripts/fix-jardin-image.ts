/**
 * Fix Jardin du Luxembourg image URL
 * 从 Google Places API 重新获取正确的图片
 */

import prisma from '../src/config/database';
import { GooglePlacesEnterpriseService } from '../src/services/googlePlacesEnterpriseService';

async function fixJardinImage() {
  try {
    // 1. 查找地点
    const place = await prisma.place.findFirst({
      where: { name: 'Jardin du Luxembourg' }
    });

    if (!place) {
      console.log('❌ Jardin du Luxembourg not found');
      return;
    }

    console.log('✅ Found place:', place.name);
    console.log('📍 Current coverImage:', place.coverImage);
    console.log('📍 Google Place ID:', place.googlePlaceId);

    if (!place.googlePlaceId) {
      console.log('❌ No Google Place ID');
      return;
    }

    // 2. 使用 Google Places API 获取新的图片
    const googleService = new GooglePlacesEnterpriseService();
    
    console.log('\n🔄 Fetching fresh data from Google...');
    const placeDetails = await googleService.getPlaceById(place.googlePlaceId);

    if (!placeDetails) {
      console.log('❌ Could not fetch place details');
      return;
    }

    console.log('✅ Fetched place details');
    console.log('📸 Photo reference:', placeDetails.photoReference?.substring(0, 50) + '...');

    // 3. 下载并上传图片
    if (placeDetails.photoReference) {
      console.log('\n🔄 Downloading and uploading cover image...');
      const newCoverUrl = await googleService.downloadAndUploadCoverImage(
        place.id,
        placeDetails.photoReference
      );

      console.log('✅ New cover image URL:', newCoverUrl);

      // 4. 更新数据库
      await prisma.place.update({
        where: { id: place.id },
        data: {
          coverImage: newCoverUrl,
          photoReference: placeDetails.photoReference,
        }
      });

      console.log('✅ Database updated');
    } else {
      console.log('❌ No photo reference available');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixJardinImage();
