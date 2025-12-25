/**
 * 从旧数据库迁移数据到 Supabase
 * 
 * 使用方法:
 * 1. 在 .env 中配置 OLD_DATABASE_URL（旧印度数据库连接）
 * 2. 确保 DATABASE_URL 指向新的 Supabase 数据库
 * 3. 运行: npx ts-node scripts/migrate-from-old-db.ts
 */

import { PrismaClient } from '@prisma/client';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { randomUUID } from 'crypto';

dotenv.config();

// 旧数据库连接（印度）
const OLD_DATABASE_URL = process.env.OLD_DATABASE_URL || 'postgresql://postgres:password@old-db-host:5432/wanderlog';

// 创建两个 Prisma 客户端
const oldPrisma = new PrismaClient({
  datasources: {
    db: {
      url: OLD_DATABASE_URL,
    },
  },
});

const newPrisma = new PrismaClient();

// Supabase 客户端 (使用 service key 绕过 RLS)
const supabase: SupabaseClient = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// ID 映射表 (旧 ID -> 新 UUID)
const placeIdMap = new Map<string, string>();
const collectionIdMap = new Map<string, string>();
const recommendationIdMap = new Map<string, string>();

interface MigrationResult {
  table: string;
  total: number;
  migrated: number;
  skipped: number;
  failed: number;
  errors: string[];
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
    skipped: 0,
    failed: 0,
    errors: [],
  };

  try {
    // 从旧数据库获取所有地点
    const oldPlaces = await oldPrisma.$queryRaw<any[]>`
      SELECT * FROM places ORDER BY created_at
    `;
    result.total = oldPlaces.length;
    console.log(`  找到 ${oldPlaces.length} 个地点`);

    for (const place of oldPlaces) {
      try {
        // 检查是否已存在（通过 google_place_id 或 name+city）
        const existing = await newPrisma.place.findFirst({
          where: {
            OR: [
              { googlePlaceId: place.google_place_id },
              { 
                AND: [
                  { name: place.name },
                  { city: place.city },
                  { latitude: place.latitude },
                  { longitude: place.longitude },
                ]
              }
            ]
          }
        });

        if (existing) {
          placeIdMap.set(place.id, existing.id);
          result.skipped++;
          continue;
        }

        // 生成新的 UUID
        const newId = randomUUID();
        placeIdMap.set(place.id, newId);

        // 解析 JSON 字段
        let tags: any[] = [];
        let aiTags: any[] = [];
        let images: any[] = [];
        let sourceDetails: any = null;
        let customFields: any = null;

        try { tags = place.tags ? (typeof place.tags === 'string' ? JSON.parse(place.tags) : place.tags) : []; } catch {}
        try { aiTags = place.ai_tags ? (typeof place.ai_tags === 'string' ? JSON.parse(place.ai_tags) : place.ai_tags) : []; } catch {}
        try { images = place.images ? (typeof place.images === 'string' ? JSON.parse(place.images) : place.images) : []; } catch {}
        try { sourceDetails = place.source_details ? (typeof place.source_details === 'string' ? JSON.parse(place.source_details) : place.source_details) : null; } catch {}
        try { customFields = place.custom_fields ? (typeof place.custom_fields === 'string' ? JSON.parse(place.custom_fields) : place.custom_fields) : null; } catch {}

        // 插入新数据库
        await newPrisma.place.create({
          data: {
            id: newId,
            name: place.name,
            city: place.city,
            country: place.country,
            latitude: place.latitude,
            longitude: place.longitude,
            address: place.address,
            description: place.description,
            openingHours: place.opening_hours,
            rating: place.rating,
            ratingCount: place.rating_count,
            category: place.category,
            aiSummary: place.ai_summary,
            aiDescription: place.ai_description,
            tags: tags,
            aiTags: aiTags,
            coverImage: place.cover_image,
            images: images,
            priceLevel: place.price_level,
            website: place.website,
            phoneNumber: place.phone_number,
            googlePlaceId: place.google_place_id,
            source: place.source,
            sourceDetails: sourceDetails,
            isVerified: place.is_verified || false,
            customFields: customFields,
            lastSyncedAt: place.last_synced_at,
            createdAt: place.created_at || new Date(),
            updatedAt: place.updated_at || new Date(),
          },
        });

        result.migrated++;
        process.stdout.write(`\r  进度: ${result.migrated + result.skipped}/${result.total} (${result.skipped} 跳过)`);
      } catch (e: any) {
        result.failed++;
        result.errors.push(`Place ${place.id} (${place.name}): ${e.message}`);
      }
    }
  } catch (e: any) {
    console.error('  ❌ 查询旧数据库失败:', e.message);
    result.errors.push(`Query failed: ${e.message}`);
  }

  console.log(`\n  ✅ 完成: ${result.migrated} 新增, ${result.skipped} 跳过, ${result.failed} 失败`);
  return result;
}

async function migrateCollections(): Promise<MigrationResult> {
  console.log('\n📚 迁移合集数据...');
  const result: MigrationResult = {
    table: 'collections',
    total: 0,
    migrated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  try {
    // 从旧数据库获取所有合集
    const oldCollections = await oldPrisma.$queryRaw<any[]>`
      SELECT * FROM collections ORDER BY created_at
    `;
    result.total = oldCollections.length;
    console.log(`  找到 ${oldCollections.length} 个合集`);

    for (const collection of oldCollections) {
      try {
        // 检查是否已存在
        const existing = await newPrisma.collection.findFirst({
          where: { name: collection.name }
        });

        if (existing) {
          collectionIdMap.set(collection.id, existing.id);
          result.skipped++;
          continue;
        }

        // 生成新的 UUID
        const newId = randomUUID();
        collectionIdMap.set(collection.id, newId);

        // 解析 JSON 字段
        let people: any = null;
        let works: any = null;
        try { people = collection.people ? (typeof collection.people === 'string' ? JSON.parse(collection.people) : collection.people) : null; } catch {}
        try { works = collection.works ? (typeof collection.works === 'string' ? JSON.parse(collection.works) : collection.works) : null; } catch {}

        // 插入合集
        await newPrisma.collection.create({
          data: {
            id: newId,
            name: collection.name,
            coverImage: collection.cover_image,
            description: collection.description,
            people: people,
            works: works,
            source: collection.source,
            sortOrder: collection.sort_order || 0,
            isPublished: collection.is_published || false,
            publishedAt: collection.published_at,
            createdAt: collection.created_at || new Date(),
            updatedAt: collection.updated_at || new Date(),
          },
        });

        result.migrated++;
        process.stdout.write(`\r  进度: ${result.migrated + result.skipped}/${result.total}`);
      } catch (e: any) {
        result.failed++;
        result.errors.push(`Collection ${collection.id} (${collection.name}): ${e.message}`);
      }
    }

    // 迁移合集-地点关联
    console.log('\n  📎 迁移合集-地点关联...');
    const oldSpots = await oldPrisma.$queryRaw<any[]>`
      SELECT * FROM collection_spots
    `;
    
    let spotsMigrated = 0;
    let spotsSkipped = 0;
    
    for (const spot of oldSpots) {
      try {
        const newCollectionId = collectionIdMap.get(spot.collection_id);
        const newPlaceId = placeIdMap.get(spot.place_id);
        
        if (!newCollectionId || !newPlaceId) {
          spotsSkipped++;
          continue;
        }

        // 检查是否已存在
        const existing = await newPrisma.collectionSpot.findFirst({
          where: {
            collectionId: newCollectionId,
            placeId: newPlaceId,
          }
        });

        if (existing) {
          spotsSkipped++;
          continue;
        }

        await newPrisma.collectionSpot.create({
          data: {
            id: randomUUID(),
            collectionId: newCollectionId,
            placeId: newPlaceId,
            city: spot.city,
            sortOrder: spot.sort_order || 0,
            createdAt: spot.created_at || new Date(),
          },
        });
        spotsMigrated++;
      } catch (e: any) {
        // 忽略重复错误
        if (!e.message.includes('Unique constraint')) {
          console.warn(`  ⚠️ 关联失败: ${e.message}`);
        }
      }
    }
    console.log(`  ✅ 关联: ${spotsMigrated} 新增, ${spotsSkipped} 跳过`);

  } catch (e: any) {
    console.error('  ❌ 查询旧数据库失败:', e.message);
    result.errors.push(`Query failed: ${e.message}`);
  }

  console.log(`  ✅ 完成: ${result.migrated} 新增, ${result.skipped} 跳过, ${result.failed} 失败`);
  return result;
}

async function migrateRecommendations(): Promise<MigrationResult> {
  console.log('\n🔗 迁移推荐数据...');
  const result: MigrationResult = {
    table: 'recommendations',
    total: 0,
    migrated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  try {
    // 从旧数据库获取所有推荐
    const oldRecommendations = await oldPrisma.$queryRaw<any[]>`
      SELECT * FROM collection_recommendations ORDER BY sort_order
    `;
    result.total = oldRecommendations.length;
    console.log(`  找到 ${oldRecommendations.length} 个推荐分组`);

    for (const rec of oldRecommendations) {
      try {
        // 检查是否已存在
        const existing = await newPrisma.collectionRecommendation.findFirst({
          where: { name: rec.name }
        });

        if (existing) {
          recommendationIdMap.set(rec.id, existing.id);
          result.skipped++;
          continue;
        }

        // 生成新的 UUID
        const newId = randomUUID();
        recommendationIdMap.set(rec.id, newId);

        // 插入推荐分组
        await newPrisma.collectionRecommendation.create({
          data: {
            id: newId,
            name: rec.name,
            sortOrder: rec.sort_order || rec.order || 0,
            isActive: rec.is_active !== false,
            createdAt: rec.created_at || new Date(),
            updatedAt: rec.updated_at || new Date(),
          },
        });

        result.migrated++;
      } catch (e: any) {
        result.failed++;
        result.errors.push(`Recommendation ${rec.id} (${rec.name}): ${e.message}`);
      }
    }

    // 迁移推荐项
    console.log('\n  📎 迁移推荐项...');
    const oldItems = await oldPrisma.$queryRaw<any[]>`
      SELECT * FROM collection_recommendation_items
    `;
    
    let itemsMigrated = 0;
    let itemsSkipped = 0;
    
    for (const item of oldItems) {
      try {
        const newRecId = recommendationIdMap.get(item.recommendation_id);
        const newCollectionId = collectionIdMap.get(item.collection_id);
        
        if (!newRecId || !newCollectionId) {
          itemsSkipped++;
          continue;
        }

        // 检查是否已存在
        const existing = await newPrisma.collectionRecommendationItem.findFirst({
          where: {
            recommendationId: newRecId,
            collectionId: newCollectionId,
          }
        });

        if (existing) {
          itemsSkipped++;
          continue;
        }

        await newPrisma.collectionRecommendationItem.create({
          data: {
            id: randomUUID(),
            recommendationId: newRecId,
            collectionId: newCollectionId,
            sortOrder: item.sort_order || item.order || 0,
            createdAt: item.created_at || new Date(),
          },
        });
        itemsMigrated++;
      } catch (e: any) {
        if (!e.message.includes('Unique constraint')) {
          console.warn(`  ⚠️ 推荐项失败: ${e.message}`);
        }
      }
    }
    console.log(`  ✅ 推荐项: ${itemsMigrated} 新增, ${itemsSkipped} 跳过`);

  } catch (e: any) {
    console.error('  ❌ 查询旧数据库失败:', e.message);
    result.errors.push(`Query failed: ${e.message}`);
  }

  console.log(`  ✅ 完成: ${result.migrated} 新增, ${result.skipped} 跳过, ${result.failed} 失败`);
  return result;
}

async function migrateUsers(): Promise<MigrationResult> {
  console.log('\n👤 迁移用户数据...');
  const result: MigrationResult = {
    table: 'users',
    total: 0,
    migrated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  try {
    // 从旧数据库获取所有用户
    const oldUsers = await oldPrisma.$queryRaw<any[]>`
      SELECT * FROM users ORDER BY created_at
    `;
    result.total = oldUsers.length;
    console.log(`  找到 ${oldUsers.length} 个用户`);

    for (const user of oldUsers) {
      try {
        // 检查用户是否已存在于 Supabase Auth
        const { data: existingUsers } = await supabase.auth.admin.listUsers();
        const existing = existingUsers?.users?.find(u => u.email === user.email);

        if (existing) {
          result.skipped++;
          continue;
        }

        // 在 Supabase Auth 创建用户
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email: user.email,
          email_confirm: true, // 自动确认邮箱
          password: user.password || 'TempPassword123!', // 临时密码
          user_metadata: {
            name: user.name,
            avatar_url: user.avatar_url,
            legacy_id: user.id,
          },
        });

        if (authError) {
          throw authError;
        }

        // 更新 profile
        if (authData?.user) {
          await supabase.from('profiles').upsert({
            id: authData.user.id,
            name: user.name,
            avatar_url: user.avatar_url,
          });
        }

        result.migrated++;
        process.stdout.write(`\r  进度: ${result.migrated + result.skipped}/${result.total}`);
      } catch (e: any) {
        result.failed++;
        result.errors.push(`User ${user.id} (${user.email}): ${e.message}`);
      }
    }
  } catch (e: any) {
    console.error('  ❌ 查询旧数据库失败:', e.message);
    result.errors.push(`Query failed: ${e.message}`);
  }

  console.log(`\n  ✅ 完成: ${result.migrated} 新增, ${result.skipped} 跳过, ${result.failed} 失败`);
  return result;
}

// =====================================================
// 主函数
// =====================================================

async function runMigration() {
  console.log('🚀 数据迁移开始');
  console.log('='.repeat(50));
  console.log(`📅 开始时间: ${new Date().toISOString()}`);
  console.log(`🔗 旧数据库: ${OLD_DATABASE_URL.replace(/:[^:@]+@/, ':***@')}`);
  console.log(`🔗 新数据库: Supabase (${process.env.SUPABASE_URL})`);
  console.log('='.repeat(50));

  // 检查环境变量
  if (!process.env.OLD_DATABASE_URL) {
    console.error('❌ 缺少 OLD_DATABASE_URL 环境变量');
    console.log('请在 .env 中配置旧数据库连接:');
    console.log('  OLD_DATABASE_URL=postgresql://user:password@host:5432/database');
    process.exit(1);
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('❌ 缺少 Supabase 环境变量');
    process.exit(1);
  }

  const results: MigrationResult[] = [];

  try {
    // 测试连接
    console.log('\n🔌 测试数据库连接...');
    await oldPrisma.$queryRaw`SELECT 1`;
    console.log('  ✅ 旧数据库连接成功');
    await newPrisma.$queryRaw`SELECT 1`;
    console.log('  ✅ 新数据库连接成功');

    // 按顺序迁移 (有外键依赖)
    results.push(await migratePlaces());
    results.push(await migrateCollections());
    results.push(await migrateRecommendations());
    results.push(await migrateUsers());

    // 输出报告
    console.log('\n');
    console.log('='.repeat(50));
    console.log('📊 迁移报告');
    console.log('='.repeat(50));

    let totalMigrated = 0;
    let totalSkipped = 0;
    let totalFailed = 0;

    for (const r of results) {
      const status = r.failed === 0 ? '✅' : '⚠️';
      console.log(`${status} ${r.table}: ${r.migrated} 新增, ${r.skipped} 跳过, ${r.failed} 失败`);
      totalMigrated += r.migrated;
      totalSkipped += r.skipped;
      totalFailed += r.failed;

      if (r.errors.length > 0 && r.errors.length <= 3) {
        r.errors.forEach(e => console.log(`   ❌ ${e}`));
      } else if (r.errors.length > 3) {
        r.errors.slice(0, 3).forEach(e => console.log(`   ❌ ${e}`));
        console.log(`   ... 还有 ${r.errors.length - 3} 个错误`);
      }
    }

    console.log('='.repeat(50));
    console.log(`📈 总计: ${totalMigrated} 新增, ${totalSkipped} 跳过, ${totalFailed} 失败`);
    console.log('='.repeat(50));

    if (totalFailed > 0) {
      console.log('\n⚠️  部分数据迁移失败，请检查错误日志');
    } else {
      console.log('\n🎉 迁移完成！');
    }
  } catch (error: any) {
    console.error('\n❌ 迁移过程中发生错误:', error.message);
    process.exit(1);
  } finally {
    await oldPrisma.$disconnect();
    await newPrisma.$disconnect();
  }
}

// 运行
runMigration();
