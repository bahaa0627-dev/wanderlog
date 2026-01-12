/**
 * 批量迁移图片到 R2
 * 
 * 将数据库中非 R2 的图片下载并上传到 R2，然后更新数据库
 */

import { PrismaClient } from '@prisma/client';
import { R2ImageService } from '../src/services/r2ImageService';
import * as fs from 'fs';

const prisma = new PrismaClient();
const r2Service = new R2ImageService();

const R2_DOMAIN = 'wanderlog-images.blcubahaa0627.workers.dev';
const BATCH_SIZE = 20; // 每批处理数量
const CONCURRENCY = 5; // 并发数
const DELAY_BETWEEN_BATCHES = 1000; // 批次间延迟 (ms)
const FAILED_LOG_FILE = 'failed-images.csv';

interface MigrationStats {
  total: number;
  success: number;
  failed: number;
  skipped: number;
}

interface FailedRecord {
  id: string;
  name: string;
  coverImage: string;
  error: string;
}

const stats: MigrationStats = {
  total: 0,
  success: 0,
  failed: 0,
  skipped: 0,
};

const failedRecords: FailedRecord[] = [];

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function migrateImage(place: { id: string; name: string; coverImage: string | null }): Promise<boolean> {
  if (!place.coverImage) {
    stats.skipped++;
    return false;
  }

  // 跳过已经是 R2 的图片
  if (place.coverImage.includes(R2_DOMAIN)) {
    stats.skipped++;
    return false;
  }

  // 跳过无效 URL
  if (place.coverImage === 'example.com' || !place.coverImage.startsWith('http')) {
    console.log(`   ⚠️ 跳过无效 URL: ${place.name}`);
    stats.skipped++;
    return false;
  }

  try {
    console.log(`   📥 下载: ${place.name}`);
    const result = await r2Service.processAndUpload(place.coverImage);

    if (result.success && result.publicUrl) {
      // 更新数据库
      await prisma.place.update({
        where: { id: place.id },
        data: { 
          coverImage: result.publicUrl,
          // 同时更新 images 数组中的第一张图片
          images: { set: [result.publicUrl] }
        },
      });
      console.log(`   ✅ 成功: ${place.name}`);
      stats.success++;
      return true;
    } else {
      const errorMsg = result.error || 'Unknown error';
      console.log(`   ❌ 失败: ${place.name} - ${errorMsg}`);
      failedRecords.push({
        id: place.id,
        name: place.name,
        coverImage: place.coverImage,
        error: errorMsg,
      });
      stats.failed++;
      return false;
    }
  } catch (error: any) {
    const errorMsg = error.message || 'Unknown error';
    console.log(`   ❌ 错误: ${place.name} - ${errorMsg}`);
    failedRecords.push({
      id: place.id,
      name: place.name,
      coverImage: place.coverImage,
      error: errorMsg,
    });
    stats.failed++;
    return false;
  }
}

async function main() {
  console.log('🚀 开始迁移图片到 R2...\n');

  // 获取需要迁移的图片总数
  const totalCount = await prisma.place.count({
    where: {
      coverImage: { not: null },
      NOT: [
        { coverImage: { contains: R2_DOMAIN } },
        { coverImage: 'example.com' },
      ]
    }
  });

  console.log(`📊 需要迁移的图片总数: ${totalCount}\n`);
  stats.total = totalCount;

  let processed = 0;
  let cursor: string | undefined;

  while (processed < totalCount) {
    // 获取一批需要迁移的图片
    const places = await prisma.place.findMany({
      where: {
        coverImage: { not: null },
        NOT: [
          { coverImage: { contains: R2_DOMAIN } },
          { coverImage: 'example.com' },
        ]
      },
      select: {
        id: true,
        name: true,
        coverImage: true,
      },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
    });

    if (places.length === 0) break;

    console.log(`\n📦 处理批次 ${Math.floor(processed / BATCH_SIZE) + 1} (${places.length} 张图片)`);

    // 并行处理这一批
    await Promise.all(places.map(migrateImage));

    processed += places.length;
    cursor = places[places.length - 1].id;

    // 显示进度
    const progress = ((processed / totalCount) * 100).toFixed(1);
    console.log(`\n📈 进度: ${processed}/${totalCount} (${progress}%)`);
    console.log(`   成功: ${stats.success}, 失败: ${stats.failed}, 跳过: ${stats.skipped}`);

    // 批次间延迟
    if (processed < totalCount) {
      await sleep(DELAY_BETWEEN_BATCHES);
    }
  }

  console.log('\n========================================');
  console.log('✅ 迁移完成!');
  console.log(`   总数: ${stats.total}`);
  console.log(`   成功: ${stats.success}`);
  console.log(`   失败: ${stats.failed}`);
  console.log(`   跳过: ${stats.skipped}`);
  console.log('========================================\n');

  // 保存失败记录到 CSV
  if (failedRecords.length > 0) {
    const csvHeader = 'id,name,coverImage,error\n';
    const csvRows = failedRecords.map(r => 
      `"${r.id}","${r.name.replace(/"/g, '""')}","${r.coverImage}","${r.error.replace(/"/g, '""')}"`
    ).join('\n');
    
    fs.writeFileSync(FAILED_LOG_FILE, csvHeader + csvRows);
    console.log(`📝 失败记录已保存到: ${FAILED_LOG_FILE}`);
    console.log(`   共 ${failedRecords.length} 条失败记录\n`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
