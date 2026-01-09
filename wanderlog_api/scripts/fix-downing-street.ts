import { createClient } from '@supabase/supabase-js';
import { R2ImageService } from '../src/services/r2ImageService';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const r2ImageService = new R2ImageService({
  r2UploadSecret: process.env.R2_UPLOAD_SECRET,
  r2PublicUrl: process.env.R2_PUBLIC_URL,
});

async function fix() {
  console.log('🔧 修复 10 Downing Street...\n');

  const { data: place } = await supabase
    .from('places')
    .select('*')
    .ilike('name', '%Downing%')
    .single();

  if (!place) {
    console.log('❌ 找不到 10 Downing Street');
    return;
  }

  console.log('当前数据:');
  console.log('  cover_image:', place.cover_image);
  console.log('  images:', JSON.stringify(place.images, null, 2));

  // 找到 Wikidata 的图片
  const wikidataImage = place.images?.find((img: any) => img.source === 'wikidata');
  
  if (!wikidataImage) {
    console.log('❌ 找不到 Wikidata 图片');
    // 清空 images（因为 images[0] 是 cover_image 的重复）
    await supabase.from('places').update({ images: [] }).eq('id', place.id);
    console.log('✅ 已清空 images 数组');
    return;
  }

  console.log('\n📥 下载并上传 Wikidata 图片到 R2...');
  console.log('  原始 URL:', wikidataImage.url);

  try {
    const result = await r2ImageService.processAndUpload(wikidataImage.url);
    
    if (!result.success) {
      console.log('❌ 上传失败:', result.error);
      // 清空 images
      await supabase.from('places').update({ images: [] }).eq('id', place.id);
      console.log('✅ 已清空 images 数组（Wikidata 图片无法上传）');
      return;
    }

    console.log('  R2 URL:', result.publicUrl);

    // 更新 images 数组：只保留 Wikidata 图片（已上传到 R2）
    const newImages = [
      { url: result.publicUrl, source: 'wikidata', r2Key: result.r2Key }
    ];

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
    // 清空 images
    await supabase.from('places').update({ images: [] }).eq('id', place.id);
    console.log('✅ 已清空 images 数组');
  }
}

fix();
