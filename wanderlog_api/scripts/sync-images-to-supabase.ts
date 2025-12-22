/**
 * 同步图片 URL 到 Supabase
 * 从旧数据库读取图片 URL，更新到 Supabase
 * 
 * 使用方法:
 * cd wanderlog_api && npx ts-node scripts/sync-images-to-supabase.ts
 */

import { PrismaClient } from '@prisma/client';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

const supabase: SupabaseClient = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function syncPlaceImages() {
  console.log('\n📍 同步地点图片...');
  
  // 获取旧数据库的所有地点
  const oldPlaces = await prisma.place.findMany();
  console.log(`  找到 ${oldPlaces.length} 个旧地点`);

  // 获取 Supabase 的所有地点
  const { data: newPlaces, error } = await supabase.from('places').select('id, name');
  if (error) {
    console.error('❌ 获取 Supabase 地点失败:', error.message);
    return;
  }
  console.log(`  Supabase 有 ${newPlaces?.length || 0} 个地点`);

  // 按名称匹配并更新图片
  let updated = 0;
  let skipped = 0;

  for (const oldPlace of oldPlaces) {
    // 按名称查找对应的新地点
    const newPlace = newPlaces?.find(p => p.name === oldPlace.name);
    if (!newPlace) {
      skipped++;
      continue;
    }

    // 解析图片数组
    let images: string[] = [];
    if (oldPlace.images) {
      try {
        const parsed = JSON.parse(oldPlace.images);
        if (Array.isArray(parsed)) {
          images = parsed.filter(url => url && typeof url === 'string');
        }
      } catch {}
    }

    // 更新 Supabase
    const { error: updateError } = await supabase
      .from('places')
      .update({
        cover_image: oldPlace.coverImage || (images.length > 0 ? images[0] : null),
        images: images,
      })
      .eq('id', newPlace.id);

    if (updateError) {
      console.warn(`  ⚠️ 更新失败 ${oldPlace.name}: ${updateError.message}`);
    } else {
      updated++;
    }
  }

  console.log(`  ✅ 更新了 ${updated} 个地点, 跳过 ${skipped} 个`);
}

async function syncCollectionImages() {
  console.log('\n📚 同步合集封面...');
  
  const oldCollections = await prisma.collection.findMany();
  console.log(`  找到 ${oldCollections.length} 个旧合集`);

  const { data: newCollections, error } = await supabase.from('collections').select('id, name');
  if (error) {
    console.error('❌ 获取 Supabase 合集失败:', error.message);
    return;
  }

  let updated = 0;
  for (const oldCol of oldCollections) {
    const newCol = newCollections?.find(c => c.name === oldCol.name);
    if (!newCol || !oldCol.coverImage) continue;

    const { error: updateError } = await supabase
      .from('collections')
      .update({ cover_image: oldCol.coverImage })
      .eq('id', newCol.id);

    if (!updateError) updated++;
  }

  console.log(`  ✅ 更新了 ${updated} 个合集封面`);
}

async function main() {
  console.log('🚀 开始同步图片数据到 Supabase');
  console.log(`🔗 Supabase: ${process.env.SUPABASE_URL}`);

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('❌ 缺少 SUPABASE_URL 或 SUPABASE_SERVICE_KEY');
    process.exit(1);
  }

  try {
    await syncPlaceImages();
    await syncCollectionImages();
    console.log('\n🎉 同步完成！');
  } catch (e: any) {
    console.error('❌ 错误:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
