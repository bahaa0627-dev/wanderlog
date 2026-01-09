/**
 * 修复 cover_image URL
 * 
 * 问题：cover_image 使用了 img.vago.to 域名（需要授权）
 * 解决：使用 images 中的第一张图片作为 cover_image
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function fixPlace(name: string) {
  console.log(`\n修复: ${name}`);
  
  const { data: place, error } = await supabase
    .from('places')
    .select('id, name, cover_image, images')
    .ilike('name', `%${name}%`)
    .single();
  
  if (error || !place) {
    console.log(`  ❌ 找不到记录`);
    return;
  }
  
  console.log(`  ID: ${place.id}`);
  console.log(`  旧 cover_image: ${place.cover_image}`);
  
  // 获取 images 中的第一张
  const images = place.images || [];
  if (images.length === 0) {
    console.log(`  ⚠️ 没有 images，跳过`);
    return;
  }
  
  const firstImage = typeof images[0] === 'string' ? images[0] : images[0]?.url;
  console.log(`  新 cover_image: ${firstImage}`);
  
  // 更新
  const { error: updateError } = await supabase
    .from('places')
    .update({ cover_image: firstImage })
    .eq('id', place.id);
  
  if (updateError) {
    console.log(`  ❌ 更新失败: ${updateError.message}`);
  } else {
    console.log(`  ✅ 更新成功`);
  }
}

async function main() {
  console.log('修复 cover_image URL...\n');
  
  await fixPlace('Alabama State Capitol');
  await fixPlace('10 Downing St');
  
  console.log('\n完成！');
}

main().catch(console.error);
