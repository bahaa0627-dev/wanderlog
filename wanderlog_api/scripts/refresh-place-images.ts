/**
 * 刷新地点图片
 * 使用 Google Places API 重新获取图片 URL
 * 
 * 使用方法:
 * cd wanderlog_api && npx ts-node scripts/refresh-place-images.ts
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase: SupabaseClient = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY || 'AIzaSyAFrsDUcA9JqNDT52646JKwGPBu5BdvyW0';

interface PlaceDetails {
  result?: {
    photos?: Array<{
      photo_reference: string;
      height: number;
      width: number;
    }>;
  };
}

async function searchPlace(name: string, city: string): Promise<string | null> {
  const query = encodeURIComponent(`${name} ${city}`);
  const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${query}&inputtype=textquery&fields=place_id&key=${GOOGLE_API_KEY}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data.candidates?.[0]?.place_id || null;
  } catch (e) {
    console.error(`  搜索失败: ${name}`, e);
    return null;
  }
}

async function getPlacePhotos(placeId: string): Promise<string[]> {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos&key=${GOOGLE_API_KEY}`;
  
  try {
    const response = await fetch(url);
    const data: PlaceDetails = await response.json();
    
    if (!data.result?.photos) return [];
    
    // 生成图片 URL
    return data.result.photos.slice(0, 5).map(photo => 
      `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photo.photo_reference}&key=${GOOGLE_API_KEY}`
    );
  } catch (e) {
    console.error(`  获取图片失败: ${placeId}`, e);
    return [];
  }
}

async function refreshPlaceImages() {
  console.log('🔄 开始刷新地点图片...\n');

  // 获取所有地点
  const { data: places, error } = await supabase
    .from('places')
    .select('id, name, city, cover_image, google_place_id')
    .order('name');

  if (error) {
    console.error('❌ 获取地点失败:', error.message);
    return;
  }

  console.log(`📍 找到 ${places?.length || 0} 个地点\n`);

  let updated = 0;
  let failed = 0;

  for (const place of places || []) {
    process.stdout.write(`处理: ${place.name}... `);

    // 如果已有有效图片，跳过
    if (place.cover_image && !place.cover_image.includes('photo_reference=AZLas')) {
      console.log('已有图片，跳过');
      continue;
    }

    // 搜索 Place ID
    let placeId = place.google_place_id;
    if (!placeId) {
      placeId = await searchPlace(place.name, place.city || '');
      if (!placeId) {
        console.log('❌ 找不到 Place ID');
        failed++;
        continue;
      }
    }

    // 获取图片
    const photos = await getPlacePhotos(placeId);
    if (photos.length === 0) {
      console.log('❌ 没有图片');
      failed++;
      continue;
    }

    // 更新数据库
    const { error: updateError } = await supabase
      .from('places')
      .update({
        cover_image: photos[0],
        images: photos,
        google_place_id: placeId,
      })
      .eq('id', place.id);

    if (updateError) {
      console.log(`❌ 更新失败: ${updateError.message}`);
      failed++;
    } else {
      console.log(`✅ 更新了 ${photos.length} 张图片`);
      updated++;
    }

    // 避免 API 限制
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n🎉 完成！更新了 ${updated} 个地点，${failed} 个失败`);
}

refreshPlaceImages();
