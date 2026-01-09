/**
 * 恢复 Apify 图片
 * 
 * 从 custom_fields.r2Key 恢复已上传的 Apify 图片
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const R2_WORKER_URL = 'https://wanderlog-images.blcubahaa0627.workers.dev';

async function fixPlace(placeName: string) {
  console.log(`\n修复: ${placeName}`);
  
  const { data: place, error } = await supabase
    .from('places')
    .select('id, name, cover_image, images, custom_fields')
    .ilike('name', `%${placeName}%`)
    .single();
  
  if (error || !place) {
    console.log(`  ❌ 找不到记录`);
    return;
  }
  
  // 从 custom_fields.r2Key 获取 Apify 图片 URL
  const r2Key = place.custom_fields?.r2Key;
  if (!r2Key) {
    console.log(`  ⚠️ 没有 r2Key，跳过`);
    return;
  }
  
  const apifyR2Url = `${R2_WORKER_URL}/${r2Key}`;
  console.log(`  Apify R2 URL: ${apifyR2Url}`);
  
  // 当前图片列表
  const currentImages = place.images || [];
  console.log(`  当前图片: ${currentImages.length} 张`);
  
  // 检查是否已经包含这张图片
  if (currentImages.includes(apifyR2Url)) {
    console.log(`  ✅ 已包含 Apify 图片`);
    return;
  }
  
  // 添加 Apify 图片到列表开头
  const newImages = [apifyR2Url, ...currentImages];
  console.log(`  新图片列表: ${newImages.length} 张`);
  
  // 更新数据库
  const { error: updateError } = await supabase
    .from('places')
    .update({
      images: newImages,
      cover_image: apifyR2Url  // Apify 图片作为封面
    })
    .eq('id', place.id);
  
  if (updateError) {
    console.log(`  ❌ 更新失败: ${updateError.message}`);
  } else {
    console.log(`  ✅ 更新成功！`);
  }
}

async function main() {
  await fixPlace('Alabama State Capitol');
  await fixPlace('10 Downing St');
  console.log('\n完成！');
}

main().catch(console.error);
