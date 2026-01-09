/**
 * 批量恢复 Apify 图片
 * 
 * 查找所有已合并的记录（有 source_detail 的 apify 记录），
 * 从 custom_fields.r2Key 恢复 Apify 原来的图片到 images 字段
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const R2_WORKER_URL = 'https://wanderlog-images.blcubahaa0627.workers.dev';

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                     批量恢复 Apify 图片                                        ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  // 查找所有已合并的记录（apify 来源 + 有 source_detail 说明合并了 wikidata 数据）
  const { data: mergedPlaces, error } = await supabase
    .from('places')
    .select('id, name, cover_image, images, custom_fields, source_detail')
    .eq('source', 'apify_google_places')
    .not('source_detail', 'is', null);

  if (error) {
    console.log('❌ 查询失败:', error.message);
    return;
  }

  console.log(`📊 找到 ${mergedPlaces?.length || 0} 条已合并的记录\n`);

  let fixedCount = 0;
  let skippedCount = 0;
  let noR2KeyCount = 0;

  for (let i = 0; i < (mergedPlaces?.length || 0); i++) {
    const place = mergedPlaces![i];
    const progress = `[${i + 1}/${mergedPlaces!.length}]`;
    
    // 获取 r2Key
    const r2Key = place.custom_fields?.r2Key;
    if (!r2Key) {
      noR2KeyCount++;
      continue;
    }

    const apifyR2Url = `${R2_WORKER_URL}/${r2Key}`;
    const currentImages: string[] = place.images || [];

    // 检查是否已经包含这张图片
    if (currentImages.includes(apifyR2Url)) {
      skippedCount++;
      continue;
    }

    // 添加 Apify 图片到列表开头
    const newImages = [apifyR2Url, ...currentImages];

    // 更新数据库
    const { error: updateError } = await supabase
      .from('places')
      .update({
        images: newImages,
        cover_image: apifyR2Url  // Apify 图片作为封面
      })
      .eq('id', place.id);

    if (updateError) {
      console.log(`${progress} ❌ ${place.name}: ${updateError.message}`);
    } else {
      fixedCount++;
      process.stdout.write(`\r${progress} 已修复 ${fixedCount} 条...`);
    }
  }

  console.log('\n\n' + '='.repeat(60));
  console.log('📊 完成！');
  console.log('='.repeat(60));
  console.log(`   ✅ 已修复: ${fixedCount} 条`);
  console.log(`   ⏭️ 已跳过: ${skippedCount} 条 (已包含 Apify 图片)`);
  console.log(`   ⚠️ 无 r2Key: ${noR2KeyCount} 条`);
}

main().catch(console.error);
