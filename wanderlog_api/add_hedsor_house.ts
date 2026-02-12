/**
 * 直接添加 Hedsor House 到数据库
 * 从图片识别的信息手动创建记录，不调用 Google API
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function addHedsorHouse() {
  try {
    console.log('📍 Adding Hedsor House to database...\n');

    // 从图片识别的信息
    const placeData = {
      googlePlaceId: 'manual_hedsor_house_' + Date.now(), // 生成临时ID
      name: 'Hedsor House',
      latitude: 51.5642044,
      longitude: -0.7004869,
      address: 'Taplow, Hedsor, Maidenhead SL6 0HX, United Kingdom',
      city: 'Maidenhead',
      country: 'United Kingdom',
      rating: 4.8,
      ratingCount: 853,
      categorySlug: 'landmark', // 婚礼场地归类为地标
      categoryEn: 'Landmark',
      categoryZh: '地标',
      description: 'Grand Victorian country house in a parkland setting, hosting weddings, conferences and film shoots.',
      tags: {
        google: ['wedding_venue', 'event_space'],
        others: ['historic', 'countryside', 'exclusive']
      },
      website: 'hedsor.com',
      phoneNumber: '+44 1628 819050',
      source: 'manual',
      sourceDetails: {
        method: 'image_recognition',
        timestamp: new Date().toISOString(),
        note: '从Google Maps截图识别'
      }
    };

    // 检查是否已存在
    const existing = await prisma.place.findFirst({
      where: {
        name: placeData.name,
        city: placeData.city
      }
    });

    if (existing) {
      console.log('⚠️  Place already exists:', existing.name);
      console.log('   ID:', existing.id);
      return;
    }

    // 创建新地点
    const place = await prisma.place.create({
      data: {
        googlePlaceId: placeData.googlePlaceId,
        name: placeData.name,
        latitude: placeData.latitude,
        longitude: placeData.longitude,
        address: placeData.address,
        city: placeData.city,
        country: placeData.country,
        rating: placeData.rating,
        ratingCount: placeData.ratingCount,
        categorySlug: placeData.categorySlug,
        categoryEn: placeData.categoryEn,
        categoryZh: placeData.categoryZh,
        description: placeData.description,
        tags: placeData.tags as any,
        website: placeData.website,
        phoneNumber: placeData.phoneNumber,
        source: placeData.source as any,
        sourceDetails: placeData.sourceDetails as any,
      }
    });

    console.log('✅ Successfully added Hedsor House!');
    console.log('\n📋 Place Details:');
    console.log('   ID:', place.id);
    console.log('   Name:', place.name);
    console.log('   City:', place.city);
    console.log('   Country:', place.country);
    console.log('   Rating:', place.rating);
    console.log('   Category:', place.categoryEn);
    console.log('   Coordinates:', `${place.latitude}, ${place.longitude}`);
    console.log('\n🔗 Database ID:', place.id);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 执行
addHedsorHouse()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
