/**
 * 从图片识别信息添加地点到数据库
 * 
 * 用法：
 * 1. 命令行传参：
 *    npx ts-node scripts/add-place-from-image.ts --name "Place Name" --city "City" --country "Country" ...
 * 
 * 2. 使用 JSON 文件：
 *    npx ts-node scripts/add-place-from-image.ts --config place-data.json
 * 
 * 3. 在代码中调用：
 *    import { addPlaceFromImage } from './scripts/add-place-from-image';
 *    await addPlaceFromImage({ name: "...", ... });
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const prisma = new PrismaClient();

export interface PlaceFromImageData {
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  city: string;
  country: string;
  rating?: number;
  ratingCount?: number;
  categorySlug?: string;  // 必须是有效的 category_slug，默认为 'landmark'
  description?: string;
  tags?: {
    google?: string[];
    others?: string[];
  };
  website?: string;
  phoneNumber?: string;
  openingHours?: any;
  imageUrl?: string;
  note?: string;
}

/**
 * 添加从图片识别的地点
 */
export async function addPlaceFromImage(data: PlaceFromImageData): Promise<any> {
  try {
    console.log(`📍 Adding ${data.name} to database...\n`);

    // 验证必填字段
    if (!data.name || !data.city || !data.country || data.latitude === undefined || data.longitude === undefined) {
      throw new Error('Missing required fields: name, city, country, latitude, longitude');
    }

    // 有效的分类列表
    const validCategories = [
      'landmark', 'museum', 'art_gallery', 'shopping_mall', 'cafe', 'bakery',
      'restaurant', 'bar', 'hotel', 'church', 'library', 'bookstore',
      'cemetery', 'park', 'castle', 'market', 'shop', 'yarn_store',
      'thrift_store', 'university', 'temple', 'zoo'
    ];

    // 验证或设置默认分类
    const categorySlug = data.categorySlug && validCategories.includes(data.categorySlug)
      ? data.categorySlug
      : 'landmark';

    // 分类中英文映射
    const categoryNames: Record<string, { en: string; zh: string }> = {
      landmark: { en: 'Landmark', zh: '地标' },
      museum: { en: 'Museum', zh: '博物馆' },
      art_gallery: { en: 'Gallery', zh: '美术馆' },
      shopping_mall: { en: 'Shopping', zh: '商场' },
      cafe: { en: 'Cafe', zh: '咖啡店' },
      bakery: { en: 'Bakery', zh: '面包店' },
      restaurant: { en: 'Restaurant', zh: '餐馆' },
      bar: { en: 'Bar', zh: '酒吧' },
      hotel: { en: 'Hotel', zh: '酒店' },
      church: { en: 'Church', zh: '教堂' },
      library: { en: 'Library', zh: '图书馆' },
      bookstore: { en: 'Bookstore', zh: '书店' },
      cemetery: { en: 'Cemetery', zh: '墓园' },
      park: { en: 'Park', zh: '公园' },
      castle: { en: 'Castle', zh: '城堡' },
      market: { en: 'Market', zh: '市集' },
      shop: { en: 'Shop', zh: '商店' },
      yarn_store: { en: 'Yarn', zh: '毛线店' },
      thrift_store: { en: 'Thrift', zh: '二手店' },
      university: { en: 'University', zh: '大学' },
      temple: { en: 'Temple', zh: '寺庙' },
      zoo: { en: 'Zoo', zh: '动物园' },
    };

    const category = categoryNames[categorySlug] || categoryNames['landmark'];

    // 检查是否已存在
    const existing = await prisma.place.findFirst({
      where: {
        name: data.name,
        city: data.city
      }
    });

    if (existing) {
      console.log('⚠️  Place already exists:', existing.name);
      console.log('   ID:', existing.id);
      console.log('\n💡 Tip: If you want to update it, use the update script instead.');
      return existing;
    }

    // 准备数据
    const placeData = {
      googlePlaceId: `manual_${data.name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`,
      name: data.name,
      latitude: data.latitude,
      longitude: data.longitude,
      address: data.address || null,
      city: data.city,
      country: data.country,
      rating: data.rating || null,
      ratingCount: data.ratingCount || null,
      categorySlug,
      categoryEn: category.en,
      categoryZh: category.zh,
      description: data.description || null,
      tags: data.tags || { google: [], others: [] },
      website: data.website || null,
      phoneNumber: data.phoneNumber || null,
      openingHours: data.openingHours || null,
      source: 'manual' as const,
      sourceDetails: {
        method: 'image_recognition',
        timestamp: new Date().toISOString(),
        imageUrl: data.imageUrl,
        note: data.note || '从图片识别添加'
      }
    };

    // 创建地点
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
        openingHours: placeData.openingHours ? JSON.stringify(placeData.openingHours) : null,
        source: placeData.source,
        sourceDetails: placeData.sourceDetails as any,
      }
    });

    console.log('✅ Successfully added place!\n');
    console.log('📋 Place Details:');
    console.log('   ID:', place.id);
    console.log('   Name:', place.name);
    console.log('   City:', place.city);
    console.log('   Country:', place.country);
    console.log('   Category:', place.categoryEn, `(${place.categorySlug})`);
    console.log('   Coordinates:', `${place.latitude}, ${place.longitude}`);
    if (place.address) console.log('   Address:', place.address);
    if (place.website) console.log('   Website:', place.website);
    if (place.phoneNumber) console.log('   Phone:', place.phoneNumber);
    if (place.rating) console.log('   Rating:', place.rating, '⭐');
    console.log('\n🔗 Database ID:', place.id);

    return place;
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// CLI 模式
if (require.main === module) {
  const args = process.argv.slice(2);

  // 检查是否使用配置文件
  const configIndex = args.indexOf('--config');
  if (configIndex !== -1 && args[configIndex + 1]) {
    const configPath = path.resolve(args[configIndex + 1]);
    if (!fs.existsSync(configPath)) {
      console.error('❌ Config file not found:', configPath);
      process.exit(1);
    }
    const configData = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    addPlaceFromImage(configData)
      .then(() => {
        console.log('\n✨ Done!');
        process.exit(0);
      })
      .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
      });
  } else {
    // 解析命令行参数
    const getArg = (flag: string): string | undefined => {
      const index = args.indexOf(flag);
      return index !== -1 && args[index + 1] ? args[index + 1] : undefined;
    };

    const getNumArg = (flag: string): number | undefined => {
      const val = getArg(flag);
      return val ? parseFloat(val) : undefined;
    };

    const data: PlaceFromImageData = {
      name: getArg('--name') || getArg('-n') || '',
      latitude: getNumArg('--lat') || 0,
      longitude: getNumArg('--lng') || getNumArg('--lon') || 0,
      address: getArg('--address'),
      city: getArg('--city') || '',
      country: getArg('--country') || '',
      rating: getNumArg('--rating'),
      ratingCount: getNumArg('--rating-count'),
      categorySlug: getArg('--category'),
      description: getArg('--description') || getArg('--desc'),
      website: getArg('--website'),
      phoneNumber: getArg('--phone'),
      imageUrl: getArg('--image-url'),
      note: getArg('--note'),
    };

    if (!data.name || !data.city || !data.country || !data.latitude || !data.longitude) {
      console.error(`
❌ Missing required arguments!

Usage:
  npx ts-node scripts/add-place-from-image.ts \\
    --name "Place Name" \\
    --city "City" \\
    --country "Country" \\
    --lat 51.5642044 \\
    --lng -0.7004869 \\
    [--address "Full Address"] \\
    [--category "landmark"] \\
    [--rating 4.8] \\
    [--rating-count 853] \\
    [--description "Description"] \\
    [--website "website.com"] \\
    [--phone "+44 1628 819050"] \\
    [--note "From image"]

Or use a config file:
  npx ts-node scripts/add-place-from-image.ts --config place-data.json

Config file example (place-data.json):
{
  "name": "Hedsor House",
  "city": "Maidenhead",
  "country": "United Kingdom",
  "latitude": 51.5642044,
  "longitude": -0.7004869,
  "address": "Taplow, Hedsor, Maidenhead SL6 0HX, United Kingdom",
  "rating": 4.8,
  "ratingCount": 853,
  "categorySlug": "landmark",
  "description": "Grand Victorian country house...",
  "website": "hedsor.com",
  "phoneNumber": "+44 1628 819050",
  "note": "From Google Maps image"
}
      `);
      process.exit(1);
    }

    addPlaceFromImage(data)
      .then(() => {
        console.log('\n✨ Done!');
        process.exit(0);
      })
      .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
      });
  }
}
