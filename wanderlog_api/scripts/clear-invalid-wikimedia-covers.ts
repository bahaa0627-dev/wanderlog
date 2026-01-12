/**
 * 清理无效的 wikimedia cover_image
 * 
 * 将无法访问的 wikimedia URL 设置为 null
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  console.log('清理无效的 Wikimedia 封面图片...\n');

  // 查找所有 cover_image 包含 wikimedia URL 的记录
  const { data: places, error } = await supabase
    .from('places')
    .select('id, name, cover_image, images')
    .or('cover_image.ilike.%wikimedia%,cover_image.ilike.%wikipedia%');

  if (error) {
    console.log('查询失败:', error.message);
    return;
  }

  console.log(`找到 ${places?.length || 0} 条记录需要处理\n`);

  let clearedCount = 0;

  for (const place of places || []) {
    // 尝试用 images 数组中的第一张图片作为封面
    const images: string[] = place.images || [];
    const validImage = images.find(img => 
      img && !img.includes('wikimedia') && !img.includes('wikipedia')
    );

    const newCoverImage = validImage || null;
    
    const { error: updateError } = await supabase
      .from('places')
      .update({ cover_image: newCoverImage })
      .eq('id', place.id);

    if (!updateError) {
      clearedCount++;
      console.log(`✓ ${place.name}`);
      if (newCoverImage) {
        console.log(`  → 使用 images 中的图片作为封面`);
      } else {
        console.log(`  → 清空封面（无可用图片）`);
      }
    } else {
      console.log(`✗ ${place.name}: ${updateError.message}`);
    }
  }

  console.log(`\n完成！清理了 ${clearedCount} 条记录`);
}

main().catch(console.error);
