/**
 * 检查所有记录中的 wikimedia URL
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  // 查找所有包含 wikimedia URL 的记录
  const { data: places, error } = await supabase
    .from('places')
    .select('id, name, images, cover_image, source');

  if (error) {
    console.log('查询失败:', error.message);
    return;
  }

  let totalWithWikimedia = 0;
  let inImages = 0;
  let inCover = 0;
  
  const bySource: Record<string, number> = {};

  for (const place of places || []) {
    const images: any[] = place.images || [];
    const coverImage = place.cover_image;
    
    let hasWikimediaInImages = false;
    let hasWikimediaInCover = false;
    
    for (const img of images) {
      const url = typeof img === 'string' ? img : img?.url;
      if (url && (url.includes('wikimedia') || url.includes('wikipedia'))) {
        hasWikimediaInImages = true;
        break;
      }
    }
    
    if (coverImage && (coverImage.includes('wikimedia') || coverImage.includes('wikipedia'))) {
      hasWikimediaInCover = true;
    }
    
    if (hasWikimediaInImages || hasWikimediaInCover) {
      totalWithWikimedia++;
      if (hasWikimediaInImages) inImages++;
      if (hasWikimediaInCover) inCover++;
      
      const source = place.source || 'unknown';
      bySource[source] = (bySource[source] || 0) + 1;
    }
  }

  console.log('总记录数:', places?.length);
  console.log('包含 wikimedia URL 的记录:', totalWithWikimedia);
  console.log('  - 在 images 数组中:', inImages);
  console.log('  - 在 cover_image 中:', inCover);
  console.log('\n按来源分布:');
  for (const [source, count] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${source}: ${count}`);
  }
}

main().catch(console.error);
