/**
 * 修复已合并记录的图片
 * 
 * 问题：Wikidata 图片是 wikimedia URL，需要下载并上传到 R2
 * 
 * 步骤：
 * 1. 查找已合并的记录
 * 2. 检查 images 中的 wikidata 来源图片
 * 3. 下载并上传到 R2
 * 4. 更新数据库中的 URL
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// R2 配置
const R2_WORKER_URL = process.env.R2_WORKER_URL || 'https://wanderlog-images.blcubahaa0627.workers.dev';
const R2_AUTH_KEY = process.env.R2_AUTH_KEY;

interface ImageInfo {
  url: string;
  source?: string;
  r2Key?: string;
}

async function uploadToR2(imageUrl: string, placeId: string): Promise<string | null> {
  try {
    console.log(`   📥 下载图片: ${imageUrl.substring(0, 80)}...`);
    
    // 下载图片
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'WanderlogBot/1.0 (https://wanderlog.app; contact@wanderlog.app)'
      }
    });
    
    if (!response.ok) {
      console.log(`   ❌ 下载失败: ${response.status}`);
      return null;
    }
    
    const buffer = await response.buffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    
    // 生成 R2 key
    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const r2Key = `places/images/${placeId}/${uuidv4()}.${ext}`;
    
    console.log(`   📤 上传到 R2: ${r2Key}`);
    
    // 上传到 R2
    const uploadResponse = await fetch(`${R2_WORKER_URL}/${r2Key}`, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'X-Custom-Auth-Key': R2_AUTH_KEY || '',
      },
      body: buffer,
    });
    
    if (!uploadResponse.ok) {
      console.log(`   ❌ 上传失败: ${uploadResponse.status}`);
      return null;
    }
    
    const r2Url = `${R2_WORKER_URL}/${r2Key}`;
    console.log(`   ✅ 上传成功: ${r2Url}`);
    return r2Url;
    
  } catch (error: any) {
    console.log(`   ❌ 错误: ${error.message}`);
    return null;
  }
}

async function fixPlaceImages(placeName: string) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔧 修复图片: ${placeName}`);
  console.log('='.repeat(80));
  
  // 查找记录
  const { data: place, error } = await supabase
    .from('places')
    .select('id, name, cover_image, images, source')
    .ilike('name', `%${placeName}%`)
    .single();
  
  if (error || !place) {
    console.log(`❌ 找不到记录: ${placeName}`);
    return;
  }
  
  console.log(`📍 找到: ${place.name} (ID: ${place.id}, Source: ${place.source})`);
  console.log(`   Cover: ${place.cover_image?.substring(0, 60) || 'null'}...`);
  
  // 解析 images
  let images: ImageInfo[] = [];
  if (place.images) {
    images = Array.isArray(place.images) ? place.images : JSON.parse(place.images);
  }
  
  console.log(`   Images: ${images.length} 张`);
  
  // 处理每张图片
  const processedImages: string[] = [];
  const seenUrls = new Set<string>();
  
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const imgUrl = typeof img === 'string' ? img : img.url;
    const source = typeof img === 'string' ? 'unknown' : (img.source || 'unknown');
    
    console.log(`\n   [${i + 1}/${images.length}] Source: ${source}`);
    console.log(`       URL: ${imgUrl?.substring(0, 80)}...`);
    
    if (!imgUrl) continue;
    
    // 检查是否已经是 R2 URL
    if (imgUrl.includes('wanderlog-images') || imgUrl.includes('workers.dev')) {
      console.log(`       ✅ 已是 R2 URL，跳过`);
      if (!seenUrls.has(imgUrl)) {
        processedImages.push(imgUrl);
        seenUrls.add(imgUrl);
      }
      continue;
    }
    
    // 检查是否是 wikimedia URL，需要上传到 R2
    if (imgUrl.includes('wikimedia') || imgUrl.includes('wikipedia') || source === 'wikidata') {
      const r2Url = await uploadToR2(imgUrl, place.id);
      if (r2Url && !seenUrls.has(r2Url)) {
        processedImages.push(r2Url);
        seenUrls.add(r2Url);
      }
      continue;
    }
    
    // 其他 URL 直接保留
    if (!seenUrls.has(imgUrl)) {
      processedImages.push(imgUrl);
      seenUrls.add(imgUrl);
    }
  }
  
  console.log(`\n   📊 处理结果: ${images.length} -> ${processedImages.length} 张 (去重后)`);
  
  // 更新数据库 - 存储为字符串数组格式
  const { error: updateError } = await supabase
    .from('places')
    .update({ 
      images: processedImages,
      // 如果没有 cover_image，设置第一张为封面
      cover_image: place.cover_image || processedImages[0] || null
    })
    .eq('id', place.id);
  
  if (updateError) {
    console.log(`   ❌ 更新失败: ${updateError.message}`);
  } else {
    console.log(`   ✅ 数据库已更新`);
  }
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                     修复已合并记录的图片                                      ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
  
  // 检查 R2 配置
  if (!R2_AUTH_KEY) {
    console.log('⚠️  警告: R2_AUTH_KEY 未配置，图片上传可能失败');
  }
  
  // 修复两个测试记录
  await fixPlaceImages('Alabama State Capitol');
  await fixPlaceImages('10 Downing St');
}

main().catch(console.error);
