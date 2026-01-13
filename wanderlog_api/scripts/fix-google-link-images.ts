/**
 * 修复 "Google链接" (google_maps_link) 渠道的图片问题
 * 
 * 问题：第一张图片失效，第二张图片有效
 * 解决：检查第一张图片是否有效，如果无效则用第二张替换
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 延迟函数
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 检查图片URL是否有效
async function isImageValid(url: string): Promise<boolean> {
  if (!url) return false;
  
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    
    // 检查状态码和content-type
    if (!response.ok) return false;
    
    const contentType = response.headers.get('content-type');
    return contentType?.startsWith('image/') ?? false;
  } catch (e) {
    return false;
  }
}

async function main() {
  console.log('🔧 修复 Google链接 渠道的图片问题...\n');

  // 查询所有 google_maps_link 来源的地点
  const { data: places, error } = await supabase
    .from('places')
    .select('id, name, cover_image, images')
    .eq('source', 'google_maps_link');

  if (error) {
    console.error('❌ 查询失败:', error.message);
    return;
  }

  console.log(`📊 找到 ${places?.length || 0} 个 Google链接 渠道的地点\n`);

  if (!places || places.length === 0) {
    console.log('没有需要修复的数据');
    return;
  }

  let checkedCount = 0;
  let fixedCount = 0;
  let alreadyOkCount = 0;
  let noSecondImageCount = 0;
  let bothInvalidCount = 0;

  for (let i = 0; i < places.length; i++) {
    const place = places[i];
    const images: string[] = place.images || [];
    const coverImage = place.cover_image;
    
    console.log(`[${i + 1}/${places.length}] ${place.name}`);
    console.log(`  封面: ${coverImage?.substring(0, 60) || '无'}...`);
    console.log(`  图片数量: ${images.length}`);
    
    checkedCount++;

    // 如果没有图片数组或少于2张，跳过
    if (images.length < 2) {
      console.log(`  ⏭️  图片少于2张，跳过\n`);
      noSecondImageCount++;
      continue;
    }

    const firstImage = images[0];
    const secondImage = images[1];

    // 检查第一张图片是否有效
    console.log(`  检查第一张图片...`);
    const firstValid = await isImageValid(firstImage);
    await delay(100);

    if (firstValid) {
      console.log(`  ✅ 第一张图片有效，无需修复\n`);
      alreadyOkCount++;
      continue;
    }

    console.log(`  ❌ 第一张图片无效，检查第二张...`);
    
    // 检查第二张图片是否有效
    const secondValid = await isImageValid(secondImage);
    await delay(100);

    if (!secondValid) {
      console.log(`  ❌ 第二张图片也无效，跳过\n`);
      bothInvalidCount++;
      continue;
    }

    console.log(`  ✅ 第二张图片有效，开始修复...`);

    // 用第二张图片替换第一张，并更新封面
    const newImages = [secondImage, ...images.slice(2)]; // 移除第一张失效图片
    const newCoverImage = secondImage;

    const { error: updateError } = await supabase
      .from('places')
      .update({
        cover_image: newCoverImage,
        images: newImages
      })
      .eq('id', place.id);

    if (updateError) {
      console.log(`  ❌ 更新失败: ${updateError.message}\n`);
    } else {
      console.log(`  ✅ 已修复: 封面更新为第二张图片\n`);
      fixedCount++;
    }

    // 避免请求过快
    await delay(200);
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 修复完成！');
  console.log('='.repeat(60));
  console.log(`检查总数: ${checkedCount}`);
  console.log(`已修复: ${fixedCount}`);
  console.log(`无需修复 (第一张有效): ${alreadyOkCount}`);
  console.log(`跳过 (图片少于2张): ${noSecondImageCount}`);
  console.log(`跳过 (两张都无效): ${bothInvalidCount}`);
  console.log('='.repeat(60));
}

main().catch(console.error);
