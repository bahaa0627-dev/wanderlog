/**
 * 修复所有使用失效 img.vago.to URL 的地点图片
 * 
 * 策略：
 * 1. 如果有 google_place_id，从 Google API 重新获取图片
 * 2. 上传到 R2 存储
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const R2_WORKER_URL = process.env.R2_PUBLIC_URL || 'https://wanderlog-images.blcubahaa0627.workers.dev';
const R2_UPLOAD_SECRET = process.env.R2_UPLOAD_SECRET;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 从 Google Places API 获取图片并上传到 R2
async function fetchAndUploadGooglePhoto(placeId: string, googlePlaceId: string): Promise<string | null> {
  try {
    // 获取地点详情
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${googlePlaceId}&fields=photos&key=${GOOGLE_API_KEY}`;
    const detailsRes = await fetch(detailsUrl);
    const detailsData = await detailsRes.json() as any;
    
    if (detailsData.status !== 'OK' || !detailsData.result?.photos?.length) {
      return null;
    }
    
    const photoRef = detailsData.result.photos[0].photo_reference;
    
    // 下载图片
    const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photoRef}&key=${GOOGLE_API_KEY}`;
    const photoRes = await fetch(photoUrl);
    
    if (!photoRes.ok) return null;
    
    const buffer = Buffer.from(await photoRes.arrayBuffer());
    if (buffer.length < 1000) return null; // 图片太小
    
    const contentType = photoRes.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const r2Key = `places/images/${placeId}/${uuidv4()}.${ext}`;
    
    // 上传到 R2
    const uploadRes = await fetch(`${R2_WORKER_URL}/${r2Key}`, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Authorization': `Bearer ${R2_UPLOAD_SECRET}`,
      },
      body: buffer,
    });
    
    if (!uploadRes.ok) return null;
    
    return `${R2_WORKER_URL}/${r2Key}`;
  } catch (e) {
    return null;
  }
}

async function main() {
  const batchSize = parseInt(process.argv[2] || '50', 10);
  const offset = parseInt(process.argv[3] || '0', 10);
  
  console.log(`🔧 修复 img.vago.to 图片 (batch=${batchSize}, offset=${offset})...\n`);

  // 查询使用 img.vago.to 且有 google_place_id 的地点
  const { data: places, error } = await supabase
    .from('places')
    .select('id, name, cover_image, google_place_id')
    .like('cover_image', '%img.vago.to%')
    .not('google_place_id', 'is', null)
    .range(offset, offset + batchSize - 1);

  if (error) {
    console.error('❌ 查询失败:', error.message);
    return;
  }

  console.log(`📊 本批次处理 ${places?.length || 0} 个地点\n`);

  if (!places || places.length === 0) {
    console.log('没有需要修复的数据');
    return;
  }

  let fixedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < places.length; i++) {
    const place = places[i];
    
    console.log(`[${offset + i + 1}] ${place.name}`);
    console.log(`  Google ID: ${place.google_place_id}`);
    
    const newImage = await fetchAndUploadGooglePhoto(place.id, place.google_place_id);
    await delay(200); // 避免 API 限制
    
    if (newImage) {
      const { error: updateError } = await supabase
        .from('places')
        .update({
          cover_image: newImage,
          images: [newImage]
        })
        .eq('id', place.id);
      
      if (!updateError) {
        console.log(`  ✅ 已修复\n`);
        fixedCount++;
      } else {
        console.log(`  ❌ 更新失败: ${updateError.message}\n`);
        failedCount++;
      }
    } else {
      console.log(`  ⚠️ 无法获取图片\n`);
      failedCount++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 本批次完成！');
  console.log('='.repeat(60));
  console.log(`修复成功: ${fixedCount}`);
  console.log(`修复失败: ${failedCount}`);
  console.log(`下一批次: npx ts-node scripts/fix-vago-images.ts ${batchSize} ${offset + batchSize}`);
  console.log('='.repeat(60));
}

main().catch(console.error);
