/**
 * 修复合并后的数据问题：
 * 1. images 数组不应该包含 cover_image
 * 2. Wikidata 图片需要上传到 R2
 */

import { createClient } from '@supabase/supabase-js';
import { R2ImageService } from '../src/services/r2ImageService';
import * as dotenv from 'dotenv';

// 确保加载 .env
const result = dotenv.config();
console.log('dotenv loaded:', result.error ? 'ERROR: ' + result.error.message : 'OK');
console.log('R2_UPLOAD_SECRET:', process.env.R2_UPLOAD_SECRET ? 'SET' : 'NOT SET');

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// 创建新的 R2ImageService 实例，确保使用环境变量
const r2ImageService = new R2ImageService({
  r2UploadSecret: process.env.R2_UPLOAD_SECRET,
  r2PublicUrl: process.env.R2_PUBLIC_URL,
});

async function fixAlabamaStateCapitol() {
  console.log('🔧 修复 Alabama State Capitol...\n');

  const { data: place } = await supabase
    .from('places')
    .select('*')
    .ilike('name', 'Alabama State Capitol')
    .eq('source', 'apify_google_places')
    .single();

  if (!place) {
    console.log('❌ 找不到 Alabama State Capitol');
    return;
  }

  console.log('当前数据:');
  console.log('  cover_image:', place.cover_image);
  console.log('  images:', JSON.stringify(place.images, null, 2));

  // 找到 Wikidata 的图片
  const wikidataImage = place.images?.find((img: any) => img.source === 'wikidata');
  
  if (!wikidataImage) {
    console.log('❌ 找不到 Wikidata 图片');
    return;
  }

  console.log('\n📥 下载并上传 Wikidata 图片到 R2...');
  console.log('  原始 URL:', wikidataImage.url);

  try {
    // 使用 processAndUpload 方法上传到 R2
    const result = await r2ImageService.processAndUpload(wikidataImage.url);
    
    if (!result.success) {
      console.log('❌ 上传失败:', result.error);
      return;
    }

    console.log('  R2 URL:', result.publicUrl);

    // 更新 images 数组：只保留 Wikidata 图片（已上传到 R2）
    const newImages = [
      { url: result.publicUrl, source: 'wikidata', r2Key: result.r2Key }
    ];

    // 更新数据库
    const { error } = await supabase
      .from('places')
      .update({ images: newImages })
      .eq('id', place.id);

    if (error) {
      console.log('❌ 更新失败:', error.message);
      return;
    }

    console.log('\n✅ 修复完成！');
    console.log('  新 images:', JSON.stringify(newImages, null, 2));

  } catch (err: any) {
    console.log('❌ 上传失败:', err.message);
  }
}

async function check10DowningStreet() {
  console.log('\n🔍 检查 10 Downing Street...\n');

  const { data: place } = await supabase
    .from('places')
    .select('id, name, source, source_detail, tags, custom_fields')
    .ilike('name', '%Downing%')
    .single();

  if (!place) {
    console.log('❌ 找不到 10 Downing Street');
    return;
  }

  console.log('数据存在:');
  console.log('  id:', place.id);
  console.log('  name:', place.name);
  console.log('  source:', place.source);
  console.log('  source_detail:', place.source_detail);
  console.log('  tags:', JSON.stringify(place.tags));
  console.log('  custom_fields:', JSON.stringify(place.custom_fields));
}

async function main() {
  await fixAlabamaStateCapitol();
  await check10DowningStreet();
}

main().catch(console.error);
