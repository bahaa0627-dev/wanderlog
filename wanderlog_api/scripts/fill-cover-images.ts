/**
 * 填充空的 coverImage 字段
 * 
 * 逻辑：如果 coverImage 为空但 images 数组有图片，
 * 则将 images[0] 设置为 coverImage
 * 
 * 运行方式：
 * cd wanderlog_api && npx ts-node scripts/fill-cover-images.ts
 */

import dotenv from 'dotenv';
import path from 'path';
import { PrismaClient } from '@prisma/client';

// Load .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// 使用 DIRECT_URL 直连数据库（绕过连接池）
const directUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!directUrl) {
  console.error('❌ DIRECT_URL 或 DATABASE_URL 未配置');
  process.exit(1);
}

const prisma = new PrismaClient({
  datasources: {
    db: { url: directUrl },
  },
});

async function fillCoverImages() {
  console.log('🔍 查找 coverImage 为空但 images 有数据的地点...\n');

  // 查找所有 coverImage 为空或 null 的地点
  const placesWithoutCover = await prisma.place.findMany({
    where: {
      OR: [
        { coverImage: null },
        { coverImage: '' },
      ],
    },
    select: {
      id: true,
      name: true,
      city: true,
      coverImage: true,
      images: true,
    },
  });

  console.log(`📊 找到 ${placesWithoutCover.length} 个没有封面图的地点\n`);

  let updatedCount = 0;
  let skippedCount = 0;
  const errors: string[] = [];

  for (const place of placesWithoutCover) {
    try {
      // 解析 images 字段
      let images: string[] = [];
      
      if (place.images) {
        if (Array.isArray(place.images)) {
          images = place.images.filter((img): img is string => 
            typeof img === 'string' && img.length > 0 && img.startsWith('http')
          );
        } else if (typeof place.images === 'string') {
          try {
            const parsed = JSON.parse(place.images);
            if (Array.isArray(parsed)) {
              images = parsed.filter((img): img is string => 
                typeof img === 'string' && img.length > 0 && img.startsWith('http')
              );
            }
          } catch {
            // 忽略解析错误
          }
        }
      }

      // 如果有有效图片，更新 coverImage
      if (images.length > 0) {
        const newCoverImage = images[0];
        
        await prisma.place.update({
          where: { id: place.id },
          data: { coverImage: newCoverImage },
        });

        updatedCount++;
        console.log(`✅ [${updatedCount}] ${place.name} (${place.city || 'N/A'})`);
        console.log(`   → ${newCoverImage.substring(0, 60)}...`);
      } else {
        skippedCount++;
        // 只在 verbose 模式下打印跳过的
        // console.log(`⏭️  跳过: ${place.name} - images 为空`);
      }
    } catch (error) {
      const errMsg = `❌ 错误: ${place.name} (${place.id}) - ${error}`;
      errors.push(errMsg);
      console.error(errMsg);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 执行结果汇总:');
  console.log(`   ✅ 已更新: ${updatedCount} 个地点`);
  console.log(`   ⏭️  跳过 (无图片): ${skippedCount} 个地点`);
  if (errors.length > 0) {
    console.log(`   ❌ 错误: ${errors.length} 个`);
  }
  console.log('='.repeat(50));
}

// 主函数
async function main() {
  console.log('🚀 开始填充 coverImage...\n');
  
  try {
    await fillCoverImages();
    console.log('\n✨ 完成!');
  } catch (error) {
    console.error('💥 脚本执行失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
