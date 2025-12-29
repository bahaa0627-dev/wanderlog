/**
 * 补充下载缺失的 Google Places 图片
 * 同时更新 categorySlug, categoryEn, categoryZh 字段
 * 
 * 对于有 photoReference 但没有 coverImage 的地点，下载图片并上传到 R2
 * 成本: $0.007/张
 */

import prisma from '../src/config/database';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import 'dotenv/config';

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
const R2_WORKER_URL = process.env.R2_PUBLIC_URL || 'https://wanderlog-images.blcubahaa0627.workers.dev';
const R2_UPLOAD_SECRET = process.env.R2_UPLOAD_SECRET || '';

// 配置代理
const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;
const axiosConfig: any = { timeout: 30000 };

if (proxyUrl) {
  console.log(`🌐 Using proxy: ${proxyUrl}`);
  axiosConfig.httpsAgent = new HttpsProxyAgent(proxyUrl);
  axiosConfig.proxy = false;
}

const axiosInstance = axios.create(axiosConfig);

// Category 映射
const CATEGORY_MAP: Record<string, { slug: string; en: string; zh: string }> = {
  'museum': { slug: 'museum', en: 'Museum', zh: '博物馆' },
  'art_gallery': { slug: 'art_gallery', en: 'Gallery', zh: '美术馆' },
  'cafe': { slug: 'cafe', en: 'Cafe', zh: '咖啡店' },
  'coffee': { slug: 'cafe', en: 'Cafe', zh: '咖啡店' },
  'restaurant': { slug: 'restaurant', en: 'Restaurant', zh: '餐馆' },
  'bar': { slug: 'bar', en: 'Bar', zh: '酒吧' },
  'church': { slug: 'church', en: 'Church', zh: '教堂' },
  'park': { slug: 'park', en: 'Park', zh: '公园' },
  'shopping_mall': { slug: 'shopping_mall', en: 'Shopping', zh: '商场' },
  'bakery': { slug: 'bakery', en: 'Bakery', zh: '面包店' },
  'library': { slug: 'library', en: 'Library', zh: '图书馆' },
  'bookstore': { slug: 'bookstore', en: 'Bookstore', zh: '书店' },
  'book_store': { slug: 'bookstore', en: 'Bookstore', zh: '书店' },
  'hotel': { slug: 'hotel', en: 'Hotel', zh: '酒店' },
  'lodging': { slug: 'hotel', en: 'Hotel', zh: '酒店' },
  'market': { slug: 'market', en: 'Market', zh: '市集' },
  'cemetery': { slug: 'cemetery', en: 'Cemetery', zh: '墓园' },
  'castle': { slug: 'castle', en: 'Castle', zh: '城堡' },
  'shop': { slug: 'shop', en: 'Shop', zh: '商店' },
  'store': { slug: 'shop', en: 'Shop', zh: '商店' },
  'tourist_attraction': { slug: 'landmark', en: 'Landmark', zh: '地标' },
  'landmark': { slug: 'landmark', en: 'Landmark', zh: '地标' },
  'point_of_interest': { slug: 'landmark', en: 'Landmark', zh: '地标' },
  'university': { slug: 'university', en: 'University', zh: '大学' },
  'temple': { slug: 'temple', en: 'Temple', zh: '寺庙' },
  'zoo': { slug: 'zoo', en: 'Zoo', zh: '动物园' },
};

function getCategoryInfo(oldCategory: string | null): { slug: string; en: string; zh: string } {
  if (!oldCategory) return { slug: 'landmark', en: 'Landmark', zh: '地标' };
  const mapped = CATEGORY_MAP[oldCategory.toLowerCase()];
  return mapped || { slug: 'landmark', en: 'Landmark', zh: '地标' };
}

async function downloadAndUploadPhoto(photoReference: string, placeId: string): Promise<string | null> {
  try {
    // Download from Google
    const photoUrl = `https://places.googleapis.com/v1/${photoReference}/media?maxWidthPx=800&key=${GOOGLE_API_KEY}`;
    
    const response = await axiosInstance.get(photoUrl, {
      responseType: 'arraybuffer',
      maxRedirects: 5,
    });
    
    const imageBuffer = Buffer.from(response.data);
    
    if (imageBuffer.length === 0) {
      console.log(`⚠️ Empty image for ${placeId}`);
      return null;
    }
    
    // Upload to R2
    const r2Path = `places/${placeId}/cover.jpg`;
    const r2Url = `${R2_WORKER_URL}/${r2Path}`;
    
    await axiosInstance.put(r2Url, imageBuffer, {
      headers: {
        'Authorization': `Bearer ${R2_UPLOAD_SECRET}`,
        'Content-Type': 'image/jpeg',
      },
    });
    
    return r2Url;
  } catch (error: any) {
    console.error(`❌ Error for ${placeId}: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('🔍 Finding places with photoReference but no coverImage...');
  
  // 查找有 photoReference 但没有 coverImage 的地点
  const places = await prisma.place.findMany({
    where: {
      photoReference: { not: null },
      OR: [
        { coverImage: null },
        { coverImage: '' },
      ],
    },
    select: {
      id: true,
      googlePlaceId: true,
      name: true,
      photoReference: true,
      category: true,
      categorySlug: true,
    },
  });
  
  console.log(`📍 Found ${places.length} places to fix`);
  console.log(`💰 Estimated cost: $${(places.length * 0.007).toFixed(3)}\n`);
  
  let fixed = 0;
  let failed = 0;
  
  for (let i = 0; i < places.length; i++) {
    const place = places[i];
    const placeId = place.googlePlaceId || place.id;
    console.log(`[${i + 1}/${places.length}] 📷 ${place.name}`);
    
    const coverImage = await downloadAndUploadPhoto(place.photoReference!, placeId);
    
    // 获取 category 信息
    const catInfo = getCategoryInfo(place.category);
    
    if (coverImage) {
      await prisma.place.update({
        where: { id: place.id },
        data: { 
          coverImage,
          // 同时更新 category 字段
          categorySlug: catInfo.slug,
          categoryEn: catInfo.en,
          categoryZh: catInfo.zh,
        },
      });
      console.log(`  ✅ Done: ${coverImage}`);
      fixed++;
    } else {
      // 即使图片失败，也更新 category
      if (!place.categorySlug) {
        await prisma.place.update({
          where: { id: place.id },
          data: { 
            categorySlug: catInfo.slug,
            categoryEn: catInfo.en,
            categoryZh: catInfo.zh,
          },
        });
      }
      console.log(`  ❌ Failed (category updated)`);
      failed++;
    }
    
    // 避免请求过快
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  console.log(`\n📊 Summary: Fixed ${fixed}, Failed ${failed}`);
  console.log(`💰 Actual cost: $${(fixed * 0.007).toFixed(3)}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
