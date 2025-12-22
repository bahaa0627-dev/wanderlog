/**
 * WanderLog 数据迁移脚本
 * 将本地 SQLite 数据迁移到 Supabase
 * 
 * 使用方法:
 * 1. 配置 .env 中的 Supabase 和 R2 环境变量
 * 2. 运行: npx ts-node scripts/migrate-to-supabase.ts
 */

import { PrismaClient } from '@prisma/client';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

dotenv.config();

const prisma = new PrismaClient();

// Supabase 客户端 (使用 service key 绕过 RLS)
const supabase: SupabaseClient = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// R2 配置
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://images.wanderlog.app';
// R2_UPLOAD_SECRET 暂未使用，配置 R2 后启用
// const R2_UPLOAD_SECRET = process.env.R2_UPLOAD_SECRET;

// ID 映射表 (旧 cuid -> 新 uuid)
const placeIdMap = new Map<string, string>();
const collectionIdMap = new Map<string, string>();
const recommendationIdMap = new Map<string, string>();

interface MigrationResult {
  table: string;
  total: number;
  migrated: number;
  failed: number;
  errors: string[];
}

interface MigrationStats {
  startTime: Date;
  endTime?: Date;
  results: MigrationResult[];
}

const stats: MigrationStats = {
  startTime: new Date(),
  results: [],
};

// =====================================================
// 图片上传工具
// =====================================================

async function uploadImageToR2(
  sourceUrl: string,
  _targetPath: string
): Promise<string | null> {
  // 暂时跳过 R2 上传，保留原 URL
  // TODO: 配置 R2 后启用图片迁移
  return sourceUrl;
}

async function uploadImagesToR2(
  sourceUrls: string[],
  basePath: string
): Promise<string[]> {
  const urls: string[] = [];
  for (let i = 0; i < sourceUrls.length; i++) {
    const url = await uploadImageToR2(sourceUrls[i], `${basePath}/${i + 1}.jpg`);
    if (url) urls.push(url);
  }
  return urls;
}

// =====================================================
// 迁移函数
// =====================================================

async function migratePlaces(): Promise<MigrationResult> {
  console.log('\n📍 迁移地点数据...');
  const result: MigrationResult = {
    table: 'places',
    total: 0,
    migrated: 0,
    failed: 0,
    errors: [],
  };

  const places = await prisma.place.findMany();
  result.total = places.length;
  console.log(`  找到 ${places.length} 个地点`);

  for (const place of places) {
    try {
      // 生成新的 UUID
      const newId = randomUUID();
      placeIdMap.set(place.id, newId);

      // 上传图片到 R2
      const coverImageUrl = place.coverImage
        ? await uploadImageToR2(place.coverImage, `places/covers/${newId}.jpg`)
        : null;

      let imagesUrls: string[] = [];
      if (place.images) {
        try {
          const parsed = JSON.parse(place.images);
          if (Array.isArray(parsed)) {
            imagesUrls = await uploadImagesToR2(parsed, `places/gallery/${newId}`);
          }
        } catch {}
      }

      // 解析 JSON 字段
      let tags: any[] = [];
      let aiTags: any[] = [];
      let sourceDetails: any = null;
      let customFields: any = null;

      try { tags = place.tags ? JSON.parse(place.tags) : []; } catch {}
      try { aiTags = place.aiTags ? JSON.parse(place.aiTags) : []; } catch {}
      try { sourceDetails = place.sourceDetails ? JSON.parse(place.sourceDetails) : null; } catch {}
      try { customFields = place.customFields ? JSON.parse(place.customFields) : null; } catch {}

      // 插入 Supabase
      const { error } = await supabase.from('places').upsert({
        id: newId,
        name: place.name,
        city: place.city,
        country: place.country,
        latitude: place.latitude,
        longitude: place.longitude,
        address: place.address,
        description: place.description,
        opening_hours: place.openingHours,
        rating: place.rating,
        rating_count: place.ratingCount,
        category: place.category,
        ai_summary: place.aiSummary,
        ai_description: place.aiDescription,
        ai_tags: aiTags,
        cover_image: coverImageUrl,
        images: imagesUrls,
        tags: tags,
        price_level: place.priceLevel,
        website: place.website,
        phone_number: place.phoneNumber,
        google_place_id: place.googlePlaceId,
        source: place.source,
        source_details: sourceDetails,
        is_verified: place.isVerified,
        custom_fields: customFields,
        last_synced_at: place.lastSyncedAt?.toISOString(),
        created_at: place.createdAt.toISOString(),
        updated_at: place.updatedAt.toISOString(),
      });

      if (error) throw error;
      result.migrated++;
      process.stdout.write(`\r  进度: ${result.migrated}/${result.total}`);
    } catch (e: any) {
      result.failed++;
      result.errors.push(`Place ${place.id} (${place.name}): ${e.message}`);
    }
  }

  console.log(`\n  ✅ 完成: ${result.migrated} 成功, ${result.failed} 失败`);
  return result;
}

async function migrateCollections(): Promise<MigrationResult> {
  console.log('\n📚 迁移合集数据...');
  const result: MigrationResult = {
    table: 'collections',
    total: 0,
    migrated: 0,
    failed: 0,
    errors: [],
  };

  const collections = await prisma.collection.findMany({
    include: { collectionSpots: true },
  });
  result.total = collections.length;
  console.log(`  找到 ${collections.length} 个合集`);

  for (const collection of collections) {
    try {
      // 生成新的 UUID
      const newId = randomUUID();
      collectionIdMap.set(collection.id, newId);

      // 上传封面图
      const coverImageUrl = await uploadImageToR2(
        collection.coverImage,
        `collections/covers/${newId}.jpg`
      );

      // 插入合集
      const { error: collectionError } = await supabase.from('collections').upsert({
        id: newId,
        name: collection.name,
        cover_image: coverImageUrl || collection.coverImage,
        description: collection.description,
        people: collection.people,
        works: collection.works,
        source: collection.source,
        is_published: collection.isPublished,
        published_at: collection.publishedAt?.toISOString(),
        created_at: collection.createdAt.toISOString(),
        updated_at: collection.updatedAt.toISOString(),
      });

      if (collectionError) throw collectionError;

      // 迁移合集-地点关联
      for (const spot of collection.collectionSpots) {
        const newPlaceId = placeIdMap.get(spot.placeId);
        if (!newPlaceId) {
          console.warn(`  ⚠️ 找不到地点映射: ${spot.placeId}`);
          continue;
        }
        const { error: spotError } = await supabase.from('collection_spots').upsert({
          id: randomUUID(),
          collection_id: newId,
          place_id: newPlaceId,
          city: spot.city,
          created_at: spot.createdAt.toISOString(),
        });

        if (spotError) {
          console.warn(`  ⚠️ 合集地点关联失败: ${spotError.message}`);
        }
      }

      result.migrated++;
      process.stdout.write(`\r  进度: ${result.migrated}/${result.total}`);
    } catch (e: any) {
      result.failed++;
      result.errors.push(`Collection ${collection.id} (${collection.name}): ${e.message}`);
    }
  }

  console.log(`\n  ✅ 完成: ${result.migrated} 成功, ${result.failed} 失败`);
  return result;
}

async function migrateRecommendations(): Promise<MigrationResult> {
  console.log('\n🔗 迁移推荐数据...');
  const result: MigrationResult = {
    table: 'recommendations',
    total: 0,
    migrated: 0,
    failed: 0,
    errors: [],
  };

  const recommendations = await prisma.collectionRecommendation.findMany({
    include: { items: true },
  });
  result.total = recommendations.length;
  console.log(`  找到 ${recommendations.length} 个推荐分组`);

  for (const rec of recommendations) {
    try {
      // 生成新的 UUID
      const newId = randomUUID();
      recommendationIdMap.set(rec.id, newId);

      // 插入推荐分组
      const { error: recError } = await supabase.from('collection_recommendations').upsert({
        id: newId,
        name: rec.name,
        sort_order: rec.order,
        is_active: true,
        created_at: rec.createdAt.toISOString(),
        updated_at: rec.updatedAt.toISOString(),
      });

      if (recError) throw recError;

      // 迁移推荐项
      for (const item of rec.items) {
        const newCollectionId = collectionIdMap.get(item.collectionId);
        if (!newCollectionId) {
          console.warn(`  ⚠️ 找不到合集映射: ${item.collectionId}`);
          continue;
        }
        const { error: itemError } = await supabase.from('collection_recommendation_items').upsert({
          id: randomUUID(),
          recommendation_id: newId,
          collection_id: newCollectionId,
          sort_order: item.order,
          created_at: item.createdAt.toISOString(),
        });

        if (itemError) {
          console.warn(`  ⚠️ 推荐项关联失败: ${itemError.message}`);
        }
      }

      result.migrated++;
    } catch (e: any) {
      result.failed++;
      result.errors.push(`Recommendation ${rec.id} (${rec.name}): ${e.message}`);
    }
  }

  console.log(`  ✅ 完成: ${result.migrated} 成功, ${result.failed} 失败`);
  return result;
}

async function migrateUsers(): Promise<MigrationResult> {
  console.log('\n👤 迁移用户数据...');
  const result: MigrationResult = {
    table: 'users',
    total: 0,
    migrated: 0,
    failed: 0,
    errors: [],
  };

  const users = await prisma.user.findMany({
    include: { userCollections: true },
  });
  result.total = users.length;
  console.log(`  找到 ${users.length} 个用户`);

  // 创建 ID 映射 (旧ID -> 新UUID)
  const userIdMap = new Map<string, string>();

  for (const user of users) {
    try {
      // 在 Supabase Auth 创建用户
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: user.email,
        email_confirm: user.isEmailVerified,
        password: user.password || undefined, // 如果有密码则设置
        user_metadata: {
          name: user.name,
          avatar_url: user.avatarUrl,
          legacy_id: user.id, // 保存旧 ID 用于追溯
        },
      });

      if (authError) {
        // 如果用户已存在，尝试获取
        if (authError.message.includes('already been registered')) {
          const { data: existingUsers } = await supabase.auth.admin.listUsers();
          const existing = existingUsers?.users?.find(u => u.email === user.email);
          if (existing) {
            userIdMap.set(user.id, existing.id);
            result.migrated++;
            continue;
          }
        }
        throw authError;
      }

      const newUserId = authData.user.id;
      userIdMap.set(user.id, newUserId);

      // 上传头像
      let avatarUrl = user.avatarUrl;
      if (avatarUrl && !avatarUrl.includes(R2_PUBLIC_URL)) {
        avatarUrl = await uploadImageToR2(avatarUrl, `users/avatars/${newUserId}.jpg`);
      }

      // 更新 profile (触发器已自动创建，这里更新)
      const { error: profileError } = await supabase.from('profiles').update({
        name: user.name,
        avatar_url: avatarUrl,
      }).eq('id', newUserId);

      if (profileError) {
        console.warn(`  ⚠️ Profile 更新失败: ${profileError.message}`);
      }

      // 迁移用户合集收藏
      for (const uc of user.userCollections) {
        const newCollectionId = collectionIdMap.get(uc.collectionId);
        if (!newCollectionId) {
          console.warn(`  ⚠️ 找不到合集映射: ${uc.collectionId}`);
          continue;
        }
        const { error: ucError } = await supabase.from('user_collection_favorites').upsert({
          user_id: newUserId,
          collection_id: newCollectionId,
          created_at: uc.createdAt.toISOString(),
        });

        if (ucError) {
          console.warn(`  ⚠️ 用户合集收藏迁移失败: ${ucError.message}`);
        }
      }

      result.migrated++;
      process.stdout.write(`\r  进度: ${result.migrated}/${result.total}`);
    } catch (e: any) {
      result.failed++;
      result.errors.push(`User ${user.id} (${user.email}): ${e.message}`);
    }
  }

  // 保存 ID 映射供后续使用
  fs.writeFileSync(
    path.join(__dirname, 'user_id_map.json'),
    JSON.stringify(Object.fromEntries(userIdMap), null, 2)
  );

  console.log(`\n  ✅ 完成: ${result.migrated} 成功, ${result.failed} 失败`);
  console.log(`  📄 用户 ID 映射已保存到 scripts/user_id_map.json`);
  return result;
}

// =====================================================
// 主函数
// =====================================================

async function runMigration() {
  console.log('🚀 WanderLog 数据迁移开始');
  console.log('='.repeat(50));
  console.log(`📅 开始时间: ${stats.startTime.toISOString()}`);
  console.log(`🔗 Supabase: ${process.env.SUPABASE_URL}`);
  console.log(`🖼️  R2: ${R2_PUBLIC_URL}`);
  console.log('='.repeat(50));

  // 检查环境变量
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('❌ 缺少 Supabase 环境变量');
    console.log('请在 .env 中配置:');
    console.log('  SUPABASE_URL=https://your-project.supabase.co');
    console.log('  SUPABASE_SERVICE_KEY=your-service-key');
    process.exit(1);
  }

  try {
    // 按顺序迁移 (有外键依赖)
    stats.results.push(await migratePlaces());
    stats.results.push(await migrateCollections());
    stats.results.push(await migrateRecommendations());
    stats.results.push(await migrateUsers());

    stats.endTime = new Date();

    // 输出报告
    console.log('\n');
    console.log('='.repeat(50));
    console.log('📊 迁移报告');
    console.log('='.repeat(50));

    let totalMigrated = 0;
    let totalFailed = 0;

    for (const r of stats.results) {
      const status = r.failed === 0 ? '✅' : '⚠️';
      console.log(`${status} ${r.table}: ${r.migrated}/${r.total} 成功, ${r.failed} 失败`);
      totalMigrated += r.migrated;
      totalFailed += r.failed;

      if (r.errors.length > 0 && r.errors.length <= 5) {
        r.errors.forEach(e => console.log(`   ❌ ${e}`));
      } else if (r.errors.length > 5) {
        r.errors.slice(0, 5).forEach(e => console.log(`   ❌ ${e}`));
        console.log(`   ... 还有 ${r.errors.length - 5} 个错误`);
      }
    }

    console.log('='.repeat(50));
    console.log(`📈 总计: ${totalMigrated} 成功, ${totalFailed} 失败`);
    console.log(`⏱️  耗时: ${((stats.endTime.getTime() - stats.startTime.getTime()) / 1000).toFixed(2)}s`);
    console.log('='.repeat(50));

    // 保存迁移报告
    const reportPath = path.join(__dirname, `migration_report_${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(stats, null, 2));
    console.log(`\n📄 详细报告已保存到: ${reportPath}`);

    if (totalFailed > 0) {
      console.log('\n⚠️  部分数据迁移失败，请检查错误日志');
      process.exit(1);
    } else {
      console.log('\n🎉 迁移完成！');
    }
  } catch (error: any) {
    console.error('\n❌ 迁移过程中发生错误:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行
runMigration();
