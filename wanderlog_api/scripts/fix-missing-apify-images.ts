/**
 * 修复缺失的 Apify 图片
 * 
 * 问题：合并时只保留了 Wikidata 图片，丢失了 Apify 原来的 Google Places 图片
 * 解决：从 custom_fields.imageSourceUrl 恢复 Apify 图片
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const R2_WORKER_URL = 'https://wanderlog-images.blcubahaa0627.workers.dev';
const R2_AUTH_KEY = process.env.R2_AUTH_KEY;

async function downloadAndUploadToR2(imageUrl: string, placeId: string): Promise<string | null> {
  try {
    console.log(`   📥 下载: ${imageUrl.substring(0, 60)}...`);
    
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WanderlogBot/1.0)'
      }
    });
    
    if (!response.ok) {
      console.log(`   ❌ 下载失败: ${response.status}`);
      return null;
    }
    
    const buffer = await response.buffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    
    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const r2Key = `places/images/${placeId}/${uuidv4()}.${ext}`;
    
    console.log(`   📤 上传到 R2: ${r2Key}`);
    
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
    console.log(`   ✅ 成功: ${r2Url}`);
    return r2Url;
    
  } catch (error: any) {
    console.log(`   ❌ 错误: ${error.message}`);
    return null;
  }
}

async function fixPlace(placeName: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔧 修复: ${placeName}`);
  console.log('='.repeat(60));
  
  const { data: place, error } = await supabase
    .from('places')
    .select('id, name, cover_image, images, custom_fields')
    .ilike('name', `%${placeName}%`)
    .single();
  
  if (error || !place) {
    console.log(`❌ 找不到记录`);
    return;
  }
  
  console.log(`ID: ${place.id}`);
  
  // 获取 Apify 原来的图片 URL
  const apifyImageUrl = place.custom_fields?.imageSourceUrl;
  if (!apifyImageUrl) {
    console.log(`⚠️ 没有 imageSourceUrl，跳过`);
    return;
  }
  
  console.log(`\nApify 原图: ${apifyImageUrl.substring(0, 60)}...`);
  
  // 下载并上传到 R2
  const apifyR2Url = await downloadAndUploadToR2(apifyImageUrl, place.id);
  if (!apifyR2Url) {
    console.log(`❌ 无法处理 Apify 图片`);
    return;
  }
  
  // 合并图片列表
  const currentImages = place.images || [];
  const newImages = [apifyR2Url, ...currentImages];
  
  console.log(`\n📊 图片列表:`);
  console.log(`   之前: ${currentImages.length} 张`);
  console.log(`   之后: ${newImages.length} 张`);
  
  // 更新数据库
  const { error: updateError } = await supabase
    .from('places')
    .update({
      images: newImages,
      cover_image: apifyR2Url  // 用 Apify 图片作为封面
    })
    .eq('id', place.id);
  
  if (updateError) {
    console.log(`❌ 更新失败: ${updateError.message}`);
  } else {
    console.log(`✅ 更新成功！`);
  }
}

async function main() {
  console.log('修复缺失的 Apify 图片...\n');
  
  await fixPlace('Alabama State Capitol');
  await fixPlace('10 Downing St');
  
  console.log('\n完成！');
}

main().catch(console.error);
