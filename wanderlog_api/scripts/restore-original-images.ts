/**
 * 从旧数据库恢复原始图片 URL 到 Supabase
 * 
 * 使用方法:
 * cd wanderlog_api && npx ts-node scripts/restore-original-images.ts
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

async function restoreImages() {
  console.log('🔄 从旧数据库恢复图片 URL...\n');

  // 获取旧数据库的所有地点
  const oldPlaces = await prisma.place.findMany({
    select: {
      name: true,
      coverImage: true,
      images: true,
    },
  });
  console.log(`📍 旧数据库有 ${oldPlaces.length} 个地点\n`);

  let updated = 0;
  let notFound = 0;

  for (const oldPlace of oldPlaces) {
    // 解析 images JSON
    let images: string[] = [];
    if (oldPlace.images) {
      try {
        const parsed = JSON.parse(oldPlace.images);
        if (Array.isArray(parsed)) {
          images = parsed;
        }
      } catch {}
    }

    // 按名称更新 Supabase
    const { data, error } = await supabase
      .from('places')
      .update({
        cover_image: oldPlace.coverImage,
        images: images,
      })
      .eq('name', oldPlace.name)
      .select('id');

    if (error) {
      console.log(`❌ ${oldPlace.name}: ${error.message}`);
    } else if (data && data.length > 0) {
      console.log(`✅ ${oldPlace.name}`);
      updated++;
    } else {
      console.log(`⚠️ ${oldPlace.name}: 未找到`);
      notFound++;
    }
  }

  console.log(`\n🎉 完成！更新了 ${updated} 个，未找到 ${notFound} 个`);

  await prisma.$disconnect();
}

restoreImages();
