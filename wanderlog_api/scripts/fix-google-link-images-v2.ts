/**
 * 修复 "Google链接" (google_maps_link) 渠道的图片问题 v2
 * 
 * 策略：
 * 1. 检查 cover_image 是否是失效的 img.vago.to URL
 * 2. 如果 images 数组中有有效的 R2 URL，用它替换封面
 * 3. 如果没有有效图片但有 google_place_id，从 Google API 重新获取
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

// 从 Google Places API 获取图片
async function getGooglePlacePhoto(placeId: string): Promise<string | null> {
  try {
    // 先获取地点详情
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos&key=${GOOGLE_API_KEY}`;
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
    const contentType = photoRes.headers.get('content-type') || 'image/jpeg';
    
    // 上传到 R2
    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const r2Key = `places/images/${placeId}/${uuidv4()}.${ext}`;
    
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
  console.log('🔧 修复 Google链接 渠道的图片问题 v2...\n');

  const { data: places, error } = await supabase
    .from('places')
    .select('id, name, cover_image, images, google_place_id')
    .eq('source', 'google_maps_link');

  if (error) {
    console.error('❌ 查询失败:', error.message);
    return;
  }

  console.log(`📊 找到 ${places?.length || 0} 个 Google链接 渠道的地点\n`);

  if (!places || places.length === 0) return;

  let fixedFromImages = 0;
  let fixedFromGoogle = 0;
  let alreadyOk = 0;
  let failed = 0;

  for (let i = 0; i < places.length; i++) {
    const place = places[i];
    const coverImage = place.cover_image;
    // images 可能是数组或其他格式
    let images: string[] = [];
    if (Array.isArray(place.images)) {
      images = place.images;
    } else if (place.images && typeof place.images === 'object') {
      // 可能是对象格式，尝试提取值
      images = Object.values(place.images).filter((v): v is string => typeof v === 'string');
    }
    
    console.log(`[${i + 1}/${places.length}] ${place.name}`);
    
    // 检查封面是否是失效的 img.vago.to URL
    const isVagoUrl = coverImage?.includes('img.vago.to');
    
    if (!isVagoUrl && coverImage) {
      console.log(`  ✅ 封面已是有效URL，跳过\n`);
      alreadyOk++;
      continue;
    }
    
    // 策略1: 从 images 数组找有效的 R2 URL
    const r2Image = images.find((img: string) => 
      img.includes('wanderlog-images') || img.includes('r2.dev')
    );
    
    if (r2Image) {
      // 用 R2 图片替换封面，并清理 images 数组中的失效 URL
      const validImages = images.filter((img: string) => !img.includes('img.vago.to'));
      
      const { error: updateError } = await supabase
        .from('places')
        .update({
          cover_image: r2Image,
          images: validImages
        })
        .eq('id', place.id);
      
      if (!updateError) {
        console.log(`  ✅ 已用 R2 图片替换封面\n`);
        fixedFromImages++;
      } else {
        console.log(`  ❌ 更新失败: ${updateError.message}\n`);
        failed++;
      }
      continue;
    }
    
    // 策略2: 从 Google API 重新获取
    if (place.google_place_id) {
      console.log(`  🔄 从 Google API 获取图片...`);
      const newImage = await getGooglePlacePhoto(place.google_place_id);
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
          console.log(`  ✅ 已从 Google 获取新图片\n`);
          fixedFromGoogle++;
        } else {
          console.log(`  ❌ 更新失败: ${updateError.message}\n`);
          failed++;
        }
        continue;
      }
    }
    
    // 无法修复
    console.log(`  ⚠️ 无法修复（无有效图片源）\n`);
    failed++;
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 修复完成！');
  console.log('='.repeat(60));
  console.log(`总数: ${places.length}`);
  console.log(`已是有效URL: ${alreadyOk}`);
  console.log(`从 images 修复: ${fixedFromImages}`);
  console.log(`从 Google API 修复: ${fixedFromGoogle}`);
  console.log(`无法修复: ${failed}`);
  console.log('='.repeat(60));
}

main().catch(console.error);
