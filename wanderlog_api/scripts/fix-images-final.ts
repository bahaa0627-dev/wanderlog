/**
 * 修复图片 - 确保同时包含 Apify 和 Wikidata 的图片
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function fixImages(searchName: string) {
  console.log(`\n修复: ${searchName}`);
  
  const { data, error } = await supabase
    .from('places')
    .select('id, name, cover_image, images, custom_fields')
    .ilike('name', searchName)
    .single();
  
  if (error || !data) {
    console.log(`  找不到记录`);
    return;
  }
  
  const cf = data.custom_fields || {};
  const currentImages = data.images || [];
  
  // Apify 原来的 cover_image (从 r2Key 构建)
  const apifyR2Key = cf.r2Key;
  const apifyCoverUrl = apifyR2Key 
    ? `https://wanderlog-images.blcubahaa0627.workers.dev/${apifyR2Key}` 
    : null;
  
  // Wikidata 的 images (从 custom_fields.images 获取)
  const wikiImages: any[] = cf.images || [];
  
  console.log(`  Apify cover URL: ${apifyCoverUrl?.substring(0, 60)}...`);
  console.log(`  Wikidata images: ${wikiImages.length}`);
  console.log(`  Current images: ${currentImages.length}`);
  
  // 合并图片，去重
  const newImages: string[] = [];
  const seen = new Set<string>();
  
  // 先加 Apify 的 cover
  if (apifyCoverUrl && !seen.has(apifyCoverUrl)) {
    newImages.push(apifyCoverUrl);
    seen.add(apifyCoverUrl);
    console.log(`  + Apify cover`);
  }
  
  // 再加当前的 images
  for (const img of currentImages) {
    const url = typeof img === 'string' ? img : img?.url;
    if (url && !seen.has(url)) {
      newImages.push(url);
      seen.add(url);
      console.log(`  + Current image`);
    }
  }
  
  // 再加 Wikidata 的 images (需要转换 URL)
  for (const img of wikiImages) {
    let url = typeof img === 'string' ? img : img?.url;
    // 如果是 img.vago.to，转换为 workers.dev
    if (url && url.includes('img.vago.to')) {
      const r2Key = img.r2Key;
      if (r2Key) {
        url = `https://wanderlog-images.blcubahaa0627.workers.dev/${r2Key}`;
      }
    }
    if (url && !seen.has(url)) {
      newImages.push(url);
      seen.add(url);
      console.log(`  + Wikidata image`);
    }
  }
  
  console.log(`  新 images: ${newImages.length}`);
  
  // 更新
  const { error: updateError } = await supabase
    .from('places')
    .update({ 
      cover_image: newImages[0] || null,
      images: newImages 
    })
    .eq('id', data.id);
  
  if (updateError) {
    console.log(`  ❌ 错误: ${updateError.message}`);
  } else {
    console.log(`  ✅ 更新成功`);
    console.log(`  封面: ${newImages[0]?.substring(0, 60)}...`);
  }
}

async function main() {
  await fixImages('Alabama State Capitol');
  await fixImages('10 Downing St%');
}

main().catch(console.error);
