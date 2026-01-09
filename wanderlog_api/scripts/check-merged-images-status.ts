/**
 * 检查已合并记录的图片状态
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  // 查找所有已合并的记录
  const { data: places, error } = await supabase
    .from('places')
    .select('id, name, images, custom_fields')
    .eq('source', 'apify_google_places')
    .not('source_detail', 'is', null);

  if (error) {
    console.log('查询失败:', error.message);
    return;
  }

  console.log('已合并记录总数:', places?.length);

  let hasApifyOnly = 0;
  let hasWikiOnly = 0;
  let hasBoth = 0;
  let hasNone = 0;
  let hasWikimediaUrl = 0;

  const needsFix: string[] = [];

  for (const place of places || []) {
    const images: any[] = place.images || [];
    const r2Key = place.custom_fields?.r2Key;
    
    let hasApify = false;
    let hasWiki = false;
    let hasWikimedia = false;

    for (const img of images) {
      const url = typeof img === 'string' ? img : img?.url;
      if (!url) continue;
      
      if (url.includes('wikimedia') || url.includes('wikipedia')) {
        hasWikimedia = true;
        hasWiki = true;
      } else if (url.includes('wanderlog-images')) {
        // 检查是否是 Apify 的 r2Key
        if (r2Key && url.includes(r2Key.split('/').pop())) {
          hasApify = true;
        } else {
          hasWiki = true; // 其他 R2 图片认为是 wiki 的
        }
      }
    }

    // 如果有 r2Key 但 images 里没有对应的 URL
    if (r2Key && !hasApify) {
      const apifyUrl = `https://wanderlog-images.blcubahaa0627.workers.dev/${r2Key}`;
      if (!images.includes(apifyUrl)) {
        hasApify = false;
      }
    }

    if (hasWikimedia) hasWikimediaUrl++;
    
    if (hasApify && hasWiki) hasBoth++;
    else if (hasApify) hasApifyOnly++;
    else if (hasWiki) hasWikiOnly++;
    else hasNone++;

    // 需要修复的：有 wikimedia URL 或者缺少图片
    if (hasWikimedia || images.length === 0) {
      needsFix.push(place.name);
    }
  }

  console.log('\n图片状态统计:');
  console.log('  有 Apify + Wiki 图片:', hasBoth);
  console.log('  只有 Apify 图片:', hasApifyOnly);
  console.log('  只有 Wiki 图片:', hasWikiOnly);
  console.log('  没有图片:', hasNone);
  console.log('  包含 wikimedia URL (需修复):', hasWikimediaUrl);

  if (needsFix.length > 0 && needsFix.length <= 20) {
    console.log('\n需要修复的地点:');
    needsFix.forEach(n => console.log('  - ' + n));
  } else if (needsFix.length > 20) {
    console.log('\n需要修复的地点 (前20个):');
    needsFix.slice(0, 20).forEach(n => console.log('  - ' + n));
    console.log('  ... 还有 ' + (needsFix.length - 20) + ' 个');
  }
}

main().catch(console.error);
