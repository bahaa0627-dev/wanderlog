/**
 * 迁移 DataURL (base64) 图片到 R2
 * 
 * 将数据库中所有 DataURL 格式的图片转换为 R2 URL
 * 
 * 处理的字段：
 * - Place.coverImage
 * - Place.images (JSON 数组)
 * - Collection.coverImage
 * - Collection.people (JSON 中的 avatarUrl)
 * - Collection.works (JSON 中的 coverImage)
 * - Profile.avatarUrl
 * - Trip.coverImage
 * - TripSpot.userPhotos (JSON 数组)
 */

import { PrismaClient } from '@prisma/client';
import { R2ImageService } from '../src/services/r2ImageService';
import * as fs from 'fs';

const prisma = new PrismaClient();
const r2Service = new R2ImageService();

const BATCH_SIZE = 10; // 每批处理数量（DataURL 较大，减少批次大小）
const DELAY_BETWEEN_BATCHES = 500; // 批次间延迟 (ms)
const FAILED_LOG_FILE = 'failed-daturl-migration.csv';

interface MigrationStats {
  places: { total: number; success: number; failed: number; skipped: number };
  collections: { total: number; success: number; failed: number; skipped: number };
  profiles: { total: number; success: number; failed: number; skipped: number };
  trips: { total: number; success: number; failed: number; skipped: number };
  tripSpots: { total: number; success: number; failed: number; skipped: number };
}

const stats: MigrationStats = {
  places: { total: 0, success: 0, failed: 0, skipped: 0 },
  collections: { total: 0, success: 0, failed: 0, skipped: 0 },
  profiles: { total: 0, success: 0, failed: 0, skipped: 0 },
  trips: { total: 0, success: 0, failed: 0, skipped: 0 },
  tripSpots: { total: 0, success: 0, failed: 0, skipped: 0 },
};

interface FailedRecord {
  table: string;
  id: string;
  field: string;
  error: string;
}

const failedRecords: FailedRecord[] = [];

function isDataUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  return url.startsWith('data:image/');
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  // data:image/jpeg;base64,/9j/4AAQSkZJRg...
  const base64Data = dataUrl.split(',')[1];
  if (!base64Data) {
    throw new Error('Invalid DataURL format');
  }
  return Buffer.from(base64Data, 'base64');
}

async function uploadDataUrlToR2(dataUrl: string, keyPrefix: string = 'migrated'): Promise<string> {
  try {
    // 转换为 Buffer
    const buffer = dataUrlToBuffer(dataUrl);
    
    // 处理图片（压缩、转换格式）
    // 注意：DataURL 可能已经是压缩过的，但为了统一格式和质量，还是处理一下
    const processResult = await r2Service.processImage(buffer);
    if (!processResult.success || !processResult.buffer) {
      throw new Error(processResult.error || 'Image processing failed');
    }

    // 生成 R2 key
    const r2Key = r2Service.generateR2Key();
    
    // 上传到 R2
    const uploadResult = await r2Service.uploadToR2(processResult.buffer, r2Key);
    if (!uploadResult.success || !uploadResult.publicUrl) {
      throw new Error(uploadResult.error || 'R2 upload failed');
    }

    return uploadResult.publicUrl;
  } catch (error: any) {
    throw new Error(`Upload failed: ${error.message}`);
  }
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============ 迁移 Place 表 ============
async function migratePlaces() {
  console.log('\n📦 开始迁移 Place 表...\n');

  // 统计需要迁移的记录
  const places = await prisma.place.findMany({
    where: {
      OR: [
        { coverImage: { startsWith: 'data:image/' } },
        { images: { not: null } },
      ],
    },
    select: {
      id: true,
      name: true,
      coverImage: true,
      images: true,
    },
  });

  stats.places.total = places.length;
  console.log(`📊 找到 ${places.length} 个需要迁移的地点\n`);

  for (const place of places) {
    try {
      let updated = false;
      const updates: any = {};

      // 迁移 coverImage
      if (isDataUrl(place.coverImage)) {
        console.log(`   📷 迁移封面: ${place.name}`);
        const r2Url = await uploadDataUrlToR2(place.coverImage as string);
        updates.coverImage = r2Url;
        updated = true;
        console.log(`   ✅ 封面已上传: ${r2Url.substring(0, 60)}...`);
      }

      // 迁移 images 数组
      if (place.images && Array.isArray(place.images)) {
        const imageArray = place.images as string[];
        const newImages: string[] = [];
        let imagesUpdated = false;

        for (let i = 0; i < imageArray.length; i++) {
          const img = imageArray[i];
          if (isDataUrl(img)) {
            console.log(`   🖼️  迁移图片 ${i + 1}/${imageArray.length}: ${place.name}`);
            const r2Url = await uploadDataUrlToR2(img);
            newImages.push(r2Url);
            imagesUpdated = true;
            console.log(`   ✅ 图片已上传: ${r2Url.substring(0, 60)}...`);
          } else {
            newImages.push(img); // 保留非 DataURL 的图片
          }
        }

        if (imagesUpdated) {
          updates.images = newImages;
          updated = true;
        }
      }

      // 更新数据库
      if (updated) {
        await prisma.place.update({
          where: { id: place.id },
          data: updates,
        });
        stats.places.success++;
        console.log(`   ✅ 完成: ${place.name}\n`);
      } else {
        stats.places.skipped++;
      }
    } catch (error: any) {
      console.error(`   ❌ 失败: ${place.name} - ${error.message}`);
      failedRecords.push({
        table: 'places',
        id: place.id,
        field: 'coverImage/images',
        error: error.message,
      });
      stats.places.failed++;
    }
  }
}

// ============ 迁移 Collection 表 ============
async function migrateCollections() {
  console.log('\n📦 开始迁移 Collection 表...\n');

  const collections = await prisma.collection.findMany({
    where: {
      OR: [
        { coverImage: { startsWith: 'data:image/' } },
        { people: { not: null } },
        { works: { not: null } },
      ],
    },
    select: {
      id: true,
      name: true,
      coverImage: true,
      people: true,
      works: true,
    },
  });

  stats.collections.total = collections.length;
  console.log(`📊 找到 ${collections.length} 个需要迁移的集合\n`);

  for (const collection of collections) {
    try {
      let updated = false;
      const updates: any = {};

      // 迁移 coverImage
      if (isDataUrl(collection.coverImage)) {
        console.log(`   📷 迁移封面: ${collection.name}`);
        const r2Url = await uploadDataUrlToR2(collection.coverImage as string);
        updates.coverImage = r2Url;
        updated = true;
        console.log(`   ✅ 封面已上传: ${r2Url.substring(0, 60)}...`);
      }

      // 迁移 people 中的 avatarUrl
      if (collection.people && Array.isArray(collection.people)) {
        const people = collection.people as any[];
        const newPeople = people.map((person, idx) => {
          if (person.avatarUrl && isDataUrl(person.avatarUrl)) {
            console.log(`   👤 迁移人物头像 ${idx + 1}: ${collection.name}`);
            return uploadDataUrlToR2(person.avatarUrl).then(url => {
              console.log(`   ✅ 头像已上传: ${url.substring(0, 60)}...`);
              return { ...person, avatarUrl: url };
            });
          }
          return Promise.resolve(person);
        });
        const updatedPeople = await Promise.all(newPeople);
        if (JSON.stringify(updatedPeople) !== JSON.stringify(people)) {
          updates.people = updatedPeople;
          updated = true;
        }
      }

      // 迁移 works 中的 coverImage
      if (collection.works && Array.isArray(collection.works)) {
        const works = collection.works as any[];
        const newWorks = works.map((work, idx) => {
          if (work.coverImage && isDataUrl(work.coverImage)) {
            console.log(`   🎬 迁移作品封面 ${idx + 1}: ${collection.name}`);
            return uploadDataUrlToR2(work.coverImage).then(url => {
              console.log(`   ✅ 封面已上传: ${url.substring(0, 60)}...`);
              return { ...work, coverImage: url };
            });
          }
          return Promise.resolve(work);
        });
        const updatedWorks = await Promise.all(newWorks);
        if (JSON.stringify(updatedWorks) !== JSON.stringify(works)) {
          updates.works = updatedWorks;
          updated = true;
        }
      }

      // 更新数据库
      if (updated) {
        await prisma.collection.update({
          where: { id: collection.id },
          data: updates,
        });
        stats.collections.success++;
        console.log(`   ✅ 完成: ${collection.name}\n`);
      } else {
        stats.collections.skipped++;
      }
    } catch (error: any) {
      console.error(`   ❌ 失败: ${collection.name} - ${error.message}`);
      failedRecords.push({
        table: 'collections',
        id: collection.id,
        field: 'coverImage/people/works',
        error: error.message,
      });
      stats.collections.failed++;
    }
  }
}

// ============ 迁移 Profile 表 ============
async function migrateProfiles() {
  console.log('\n📦 开始迁移 Profile 表...\n');

  const profiles = await prisma.profile.findMany({
    where: {
      avatarUrl: { startsWith: 'data:image/' },
    },
    select: {
      id: true,
      name: true,
      avatarUrl: true,
    },
  });

  stats.profiles.total = profiles.length;
  console.log(`📊 找到 ${profiles.length} 个需要迁移的用户头像\n`);

  for (const profile of profiles) {
    try {
      if (isDataUrl(profile.avatarUrl)) {
        console.log(`   👤 迁移头像: ${profile.name || profile.id}`);
        const r2Url = await uploadDataUrlToR2(profile.avatarUrl as string);
        await prisma.profile.update({
          where: { id: profile.id },
          data: { avatarUrl: r2Url },
        });
        stats.profiles.success++;
        console.log(`   ✅ 完成: ${profile.name || profile.id}\n`);
      } else {
        stats.profiles.skipped++;
      }
    } catch (error: any) {
      console.error(`   ❌ 失败: ${profile.name || profile.id} - ${error.message}`);
      failedRecords.push({
        table: 'profiles',
        id: profile.id,
        field: 'avatarUrl',
        error: error.message,
      });
      stats.profiles.failed++;
    }
  }
}

// ============ 迁移 Trip 表 ============
async function migrateTrips() {
  console.log('\n📦 开始迁移 Trip 表...\n');

  const trips = await prisma.trip.findMany({
    where: {
      coverImage: { startsWith: 'data:image/' },
    },
    select: {
      id: true,
      name: true,
      coverImage: true,
    },
  });

  stats.trips.total = trips.length;
  console.log(`📊 找到 ${trips.length} 个需要迁移的行程封面\n`);

  for (const trip of trips) {
    try {
      if (isDataUrl(trip.coverImage)) {
        console.log(`   📷 迁移封面: ${trip.name}`);
        const r2Url = await uploadDataUrlToR2(trip.coverImage as string);
        await prisma.trip.update({
          where: { id: trip.id },
          data: { coverImage: r2Url },
        });
        stats.trips.success++;
        console.log(`   ✅ 完成: ${trip.name}\n`);
      } else {
        stats.trips.skipped++;
      }
    } catch (error: any) {
      console.error(`   ❌ 失败: ${trip.name} - ${error.message}`);
      failedRecords.push({
        table: 'trips',
        id: trip.id,
        field: 'coverImage',
        error: error.message,
      });
      stats.trips.failed++;
    }
  }
}

// ============ 迁移 TripSpot 表 ============
async function migrateTripSpots() {
  console.log('\n📦 开始迁移 TripSpot 表...\n');

  const tripSpots = await prisma.tripSpot.findMany({
    where: {
      userPhotos: { not: null },
    },
    select: {
      id: true,
      userPhotos: true,
    },
  });

  // 过滤出包含 DataURL 的记录
  const spotsToMigrate = tripSpots.filter(spot => {
    if (!spot.userPhotos || !Array.isArray(spot.userPhotos)) return false;
    return (spot.userPhotos as string[]).some((photo: any) => {
      const url = typeof photo === 'string' ? photo : photo.url || photo.photoUrl;
      return isDataUrl(url);
    });
  });

  stats.tripSpots.total = spotsToMigrate.length;
  console.log(`📊 找到 ${spotsToMigrate.length} 个需要迁移的用户照片\n`);

  for (const spot of spotsToMigrate) {
    try {
      if (!spot.userPhotos || !Array.isArray(spot.userPhotos)) {
        stats.tripSpots.skipped++;
        continue;
      }

      const photos = spot.userPhotos as any[];
      const newPhotos = await Promise.all(
        photos.map(async (photo, idx) => {
          const url = typeof photo === 'string' ? photo : photo.url || photo.photoUrl;
          if (isDataUrl(url)) {
            console.log(`   📸 迁移照片 ${idx + 1}/${photos.length}: ${spot.id}`);
            const r2Url = await uploadDataUrlToR2(url);
            console.log(`   ✅ 照片已上传: ${r2Url.substring(0, 60)}...`);
            
            if (typeof photo === 'string') {
              return r2Url;
            } else {
              return { ...photo, url: r2Url, photoUrl: r2Url };
            }
          }
          return photo;
        })
      );

      if (JSON.stringify(newPhotos) !== JSON.stringify(photos)) {
        await prisma.tripSpot.update({
          where: { id: spot.id },
          data: { userPhotos: newPhotos },
        });
        stats.tripSpots.success++;
        console.log(`   ✅ 完成: ${spot.id}\n`);
      } else {
        stats.tripSpots.skipped++;
      }
    } catch (error: any) {
      console.error(`   ❌ 失败: ${spot.id} - ${error.message}`);
      failedRecords.push({
        table: 'trip_spots',
        id: spot.id,
        field: 'userPhotos',
        error: error.message,
      });
      stats.tripSpots.failed++;
    }
  }
}

// ============ 主函数 ============
async function main() {
  console.log('🚀 开始迁移 DataURL 图片到 R2...\n');
  console.log('⚠️  注意：此脚本会处理所有 DataURL 格式的图片\n');

  try {
    // 依次迁移各个表
    await migratePlaces();
    await sleep(DELAY_BETWEEN_BATCHES);
    
    await migrateCollections();
    await sleep(DELAY_BETWEEN_BATCHES);
    
    await migrateProfiles();
    await sleep(DELAY_BETWEEN_BATCHES);
    
    await migrateTrips();
    await sleep(DELAY_BETWEEN_BATCHES);
    
    await migrateTripSpots();

    // 打印统计信息
    console.log('\n========================================');
    console.log('✅ 迁移完成!');
    console.log('\n📊 统计信息:');
    console.log(`\nPlace 表:`);
    console.log(`   总数: ${stats.places.total}, 成功: ${stats.places.success}, 失败: ${stats.places.failed}, 跳过: ${stats.places.skipped}`);
    console.log(`\nCollection 表:`);
    console.log(`   总数: ${stats.collections.total}, 成功: ${stats.collections.success}, 失败: ${stats.collections.failed}, 跳过: ${stats.collections.skipped}`);
    console.log(`\nProfile 表:`);
    console.log(`   总数: ${stats.profiles.total}, 成功: ${stats.profiles.success}, 失败: ${stats.profiles.failed}, 跳过: ${stats.profiles.skipped}`);
    console.log(`\nTrip 表:`);
    console.log(`   总数: ${stats.trips.total}, 成功: ${stats.trips.success}, 失败: ${stats.trips.failed}, 跳过: ${stats.trips.skipped}`);
    console.log(`\nTripSpot 表:`);
    console.log(`   总数: ${stats.tripSpots.total}, 成功: ${stats.tripSpots.success}, 失败: ${stats.tripSpots.failed}, 跳过: ${stats.tripSpots.skipped}`);
    console.log('========================================\n');

    // 保存失败记录
    if (failedRecords.length > 0) {
      const csvHeader = 'table,id,field,error\n';
      const csvRows = failedRecords.map(r => 
        `"${r.table}","${r.id}","${r.field}","${r.error.replace(/"/g, '""')}"`
      ).join('\n');
      
      fs.writeFileSync(FAILED_LOG_FILE, csvHeader + csvRows);
      console.log(`📝 失败记录已保存到: ${FAILED_LOG_FILE}`);
      console.log(`   共 ${failedRecords.length} 条失败记录\n`);
    }
  } catch (error) {
    console.error('❌ 迁移过程中发生错误:', error);
    throw error;
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
