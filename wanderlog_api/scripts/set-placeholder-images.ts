/**
 * 为没有图片的地点设置占位图
 * 使用 Unsplash 的免费图片
 * 
 * 使用方法:
 * cd wanderlog_api && npx ts-node scripts/set-placeholder-images.ts
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase: SupabaseClient = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// 按类别的占位图 (Unsplash 免费图片)
const PLACEHOLDER_IMAGES: Record<string, string[]> = {
  restaurant: [
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800',
    'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=800',
    'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800',
  ],
  cafe: [
    'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800',
    'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800',
    'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800',
  ],
  museum: [
    'https://images.unsplash.com/photo-1554907984-15263bfd63bd?w=800',
    'https://images.unsplash.com/photo-1566127444979-b3d2b654e3d7?w=800',
  ],
  park: [
    'https://images.unsplash.com/photo-1519331379826-f10be5486c6f?w=800',
    'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=800',
  ],
  temple: [
    'https://images.unsplash.com/photo-1528181304800-259b08848526?w=800',
    'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=800',
  ],
  default: [
    'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800',
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
    'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800',
    'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800',
  ],
};

function getPlaceholderImage(category: string | null): string {
  const cat = (category || 'default').toLowerCase();
  const images = PLACEHOLDER_IMAGES[cat] || PLACEHOLDER_IMAGES.default;
  return images[Math.floor(Math.random() * images.length)];
}

async function setPlaceholderImages() {
  console.log('🖼️  设置占位图片...\n');

  // 获取没有有效图片的地点
  const { data: places, error } = await supabase
    .from('places')
    .select('id, name, category, cover_image')
    .order('name');

  if (error) {
    console.error('❌ 获取地点失败:', error.message);
    return;
  }

  // 过滤出需要设置图片的地点
  const needsImage = places?.filter(p => {
    if (!p.cover_image) return true;
    // Google API URL 可能已失效
    if (p.cover_image.includes('photo_reference=')) return true;
    return false;
  }) || [];

  console.log(`📍 找到 ${needsImage.length} 个需要图片的地点\n`);

  let updated = 0;

  for (const place of needsImage) {
    const placeholder = getPlaceholderImage(place.category);
    
    const { error: updateError } = await supabase
      .from('places')
      .update({
        cover_image: placeholder,
        images: [placeholder],
      })
      .eq('id', place.id);

    if (updateError) {
      console.log(`❌ ${place.name}: ${updateError.message}`);
    } else {
      console.log(`✅ ${place.name}`);
      updated++;
    }
  }

  console.log(`\n🎉 完成！更新了 ${updated} 个地点`);
}

setPlaceholderImages();
