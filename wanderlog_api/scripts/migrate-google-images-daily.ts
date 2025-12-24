/**
 * 每日定时任务：将 Google Maps 图片迁移到 Cloudflare R2
 * 
 * 功能：
 * 1. 查找当天新增的 AI 地点（source = 'google_maps_ai'）
 * 2. 下载 Google Maps 图片
 * 3. 上传到 Cloudflare R2
 * 4. 更新数据库中的图片 URL
 * 
 * 使用方法：
 * npx tsx scripts/migrate-google-images-daily.ts
 * 
 * 定时任务（cron）：
 * 0 0 * * * cd /path/to/wanderlog_api && npx tsx scripts/migrate-google-images-daily.ts
 */

import prisma from '../src/config/database';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

// 配置
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://wanderlog-images.blcubahaa0627.workers.dev';
const R2_UPLOAD_SECRET = process.env.R2_UPLOAD_SECRET || '920627';

interface MigrationResult {
  placeId: string;
  placeName: string;
  success: boolean;
  migratedImages: number;
  error?: string;
}

/**
 * 检查 URL 是否是 Google Maps 图片
 */
function isGoogleMapsImage(url: string): boolean {
  return url.includes('maps.googleapis.com/maps/api/place/photo');
}

/**
 * 下载图片并上传到 R2
 */
async function migrateImageToR2(googleUrl: string, placeId: string, index: number): Promise<string | null> {
  try {
    console.log(`  📥 Downloading image ${index + 1}...`);
    
    // 下载 Google 图片（跟随重定向）
    const response = await axios.get(googleUrl, {
      responseType: 'arraybuffer',
      maxRedirects: 5,
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WanderLog/1.0)',
      },
    });

    const imageBuffer = Buffer.from(response.data);
    const contentType = response.headers['content-type'] || 'image/jpeg';
    
    // 生成唯一文件名
    const extension = contentType.includes('png') ? 'png' : 'jpg';
    const fileName = `places/${placeId}/${uuidv4()}.${extension}`;
    
    console.log(`  📤 Uploading to R2: ${fileName}`);
    
    // 上传到 R2
    const uploadResponse = await axios.put(
      `${R2_PUBLIC_URL}/${fileName}`,
      imageBuffer,
      {
        headers: {
          'Content-Type': contentType,
          'Authorization': `Bearer ${R2_UPLOAD_SECRET}`,
        },
        timeout: 60000,
      }
    );

    if (uploadResponse.data?.success) {
      const newUrl = `${R2_PUBLIC_URL}/${fileName}`;
      console.log(`  ✅ Uploaded: ${newUrl}`);
      return newUrl;
    } else {
      console.error(`  ❌ Upload failed:`, uploadResponse.data);
      return null;
    }
  } catch (error: any) {
    console.error(`  ❌ Migration failed:`, error.message);
    return null;
  }
}

/**
 * 迁移单个地点的所有图片
 */
async function migratePlaceImages(place: any): Promise<MigrationResult> {
  const result: MigrationResult = {
    placeId: place.id,
    placeName: place.name,
    success: false,
    migratedImages: 0,
  };

  try {
    console.log(`\n🏠 Processing: ${place.name} (${place.id})`);
    
    let coverImage = place.coverImage;
    let images: string[] = [];
    
    // 解析 images 字段
    if (place.images) {
      if (typeof place.images === 'string') {
        try {
          images = JSON.parse(place.images);
        } catch {
          images = [];
        }
      } else if (Array.isArray(place.images)) {
        images = place.images;
      }
    }

    // 检查是否有 Google 图片需要迁移
    const hasGoogleCover = coverImage && isGoogleMapsImage(coverImage);
    const googleImages = images.filter(isGoogleMapsImage);
    
    if (!hasGoogleCover && googleImages.length === 0) {
      console.log(`  ⏭️ No Google images to migrate`);
      result.success = true;
      return result;
    }

    console.log(`  📊 Found ${hasGoogleCover ? 1 : 0} cover + ${googleImages.length} images to migrate`);

    // 迁移封面图
    if (hasGoogleCover) {
      const newCoverUrl = await migrateImageToR2(coverImage, place.id, 0);
      if (newCoverUrl) {
        coverImage = newCoverUrl;
        result.migratedImages++;
      }
    }

    // 迁移其他图片
    const newImages: string[] = [];
    for (let i = 0; i < images.length; i++) {
      const imgUrl = images[i];
      if (isGoogleMapsImage(imgUrl)) {
        const newUrl = await migrateImageToR2(imgUrl, place.id, i + 1);
        if (newUrl) {
          newImages.push(newUrl);
          result.migratedImages++;
        } else {
          // 保留原 URL 以防迁移失败
          newImages.push(imgUrl);
        }
      } else {
        // 非 Google 图片保持不变
        newImages.push(imgUrl);
      }
    }

    // 更新数据库
    if (result.migratedImages > 0) {
      await prisma.place.update({
        where: { id: place.id },
        data: {
          coverImage: coverImage,
          images: newImages,
        },
      });
      console.log(`  💾 Database updated`);
    }

    result.success = true;
  } catch (error: any) {
    result.error = error.message;
    console.error(`  ❌ Error:`, error.message);
  }

  return result;
}

/**
 * 主函数：迁移当天新增的 AI 地点图片
 */
async function main() {
  console.log('🚀 Starting daily Google Images migration...');
  console.log(`📅 Date: ${new Date().toISOString()}`);
  console.log(`🔗 R2 URL: ${R2_PUBLIC_URL}`);
  console.log('');

  try {
    // 获取今天 0 点的时间
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // 查找当天新增的 AI 地点，或者任何还有 Google 图片的地点
    const places = await prisma.place.findMany({
      where: {
        OR: [
          // 当天新增的 AI 地点
          {
            source: 'google_maps_ai',
            createdAt: { gte: today },
          },
          // 或者任何还有 Google 图片的地点（用于补漏）
          {
            coverImage: { contains: 'maps.googleapis.com' },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        coverImage: true,
        images: true,
        source: true,
        createdAt: true,
      },
    });

    console.log(`📊 Found ${places.length} places to process`);

    if (places.length === 0) {
      console.log('✅ No places need migration');
      return;
    }

    const results: MigrationResult[] = [];
    
    for (const place of places) {
      const result = await migratePlaceImages(place);
      results.push(result);
      
      // 添加延迟避免请求过快
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 统计结果
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    const totalMigrated = results.reduce((sum, r) => sum + r.migratedImages, 0);

    console.log('\n' + '='.repeat(50));
    console.log('📊 Migration Summary:');
    console.log(`   Total places: ${places.length}`);
    console.log(`   Successful: ${successful.length}`);
    console.log(`   Failed: ${failed.length}`);
    console.log(`   Images migrated: ${totalMigrated}`);
    
    if (failed.length > 0) {
      console.log('\n❌ Failed places:');
      failed.forEach(r => {
        console.log(`   - ${r.placeName}: ${r.error}`);
      });
    }

    console.log('\n✅ Migration completed!');
  } catch (error: any) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
