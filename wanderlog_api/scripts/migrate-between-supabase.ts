/**
 * 在两个 Supabase 项目之间迁移数据
 * 从旧项目（印度）迁移到新项目（新加坡）
 * 
 * 使用方法:
 * npx ts-node scripts/migrate-between-supabase.ts
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { randomUUID } from 'crypto';

dotenv.config();

// 旧 Supabase 项目（印度区域）
const OLD_SUPABASE_URL = 'https://bpygtpeawkxlgjhqorzi.supabase.co';
const OLD_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJweWd0cGVhd2t4bGdqaHFvcnppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MTM1NjQsImV4cCI6MjA4MTk4OTU2NH0.6_2dRSlPs54Q25RtKP07eIv-7t0yDFOkibAt05Bp_RQ';
// 如果有 service_role key，可以替换这里以获得更多权限
const OLD_SUPABASE_SERVICE_KEY = process.env.OLD_SUPABASE_SERVICE_KEY || OLD_SUPABASE_ANON_KEY;

// 新 Supabase 项目（新加坡区域）
const NEW_SUPABASE_URL = process.env.SUPABASE_URL!;
const NEW_SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

// 创建客户端
const oldSupabase: SupabaseClient = createClient(OLD_SUPABASE_URL, OLD_SUPABASE_SERVICE_KEY);
const newSupabase: SupabaseClient = createClient(NEW_SUPABASE_URL, NEW_SUPABASE_SERVICE_KEY);

// ID 映射表
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
    const { data: oldPlaces, error: fetchError } = await oldSupabase
      .from('places')
      .select('*')
      .order('created_at');

    if (fetchError) {
      throw new Error(`获取旧数据失败: ${fetchError.message}`);
    }

    if (!oldPlaces || oldPlaces.length === 0) {
      console.log('  ⚠️ 旧数据库中没有地点数据');
      return result;
    }

    result.total = oldPlaces.length;
    console.log(`  找到 ${oldPlaces.length} 个地点`);

    for (const place of oldPlaces) {
      try {
        // 检查是否已存在（通过 google_place_id 或 name+coordinates）
        const { data: existing } = await newSupabase
          .from('places')
          .select('id')
          .or(`google_place_id.eq.${place.google_place_id},and(name.eq.${place.name},latitude.eq.${place.latitude},longitude.eq.${place.longitude})`)
          .limit(1)
          .single();

        if (existing) {
          placeIdMap.set(place.id, existing.id);
          result.skipped++;
          continue;
        }

        // 生成新的 UUID
        const newId = randomUUID();
        placeIdMap.set(place.id, newId);

        // 插入新数据库
        const { error: insertError } = await newSupabase.from('places').insert({
          id: newId,
          name: place.name,
          city: place.city,
          country: place.country,
          latitude: place.latitude,
          longitude: place.longitude,
          address: place.address,
          description: place.description,
          opening_hours: place.opening_hours,
          rating: place.rating,
          rating_count: place.rating_count,
          category: place.category,
          ai_summary: place.ai_summary,
          ai_description: place.ai_description,
          tags: place.tags || [],
          ai_tags: place.ai_tags || [],
          cover_image: place.cover_image,
          images: place.images || [],
          price_level: place.price_level,
          website: place.website,
          phone_number: place.phone_number,
          google_place_id: place.google_place_id,
          source: place.source,
          source_details: place.source_details,
          is_verified: place.is_verified || false,
          custom_fields: place.custom_fields,
          last_synced_at: place.last_synced_at,
          created_at: place.created_at,
          updated_at: place.updated_at,
        });

        if (insertError) {
          throw insertError;
        }

        result.migrated++;
        process.stdout.write(`\r  进度: ${result.migrated + result.skipped}/${result.total} (${result.skipped} 跳过)`);
      } catch (e: any) {
        result.failed++;
        result.errors.push(`Place ${place.id} (${place.name}): ${e.message}`);
      }
    }
  } catch (e: any) {
    console.error('  ❌ 迁移失败:', e.message);
    result.errors.push(e.message);
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
    const { data: oldCollections, error: fetchError } = await oldSupabase
      .from('collections')
      .select('*')
      .order('created_at');

    if (fetchError) {
      throw new Error(`获取旧数据失败: ${fetchError.message}`);
    }

    if (!oldCollections || oldCollections.length === 0) {
      console.log('  ⚠️ 旧数据库中没有合集数据');
      return result;
    }

    result.total = oldCollections.length;
    console.log(`  找到 ${oldCollections.length} 个合集`);

    for (const collection of oldCollections) {
      try {
        // 检查是否已存在
        const { data: existing } = await newSupabase
          .from('collections')
          .select('id')
          .eq('name', collection.name)
          .limit(1)
          .single();

        if (existing) {
          collectionIdMap.set(collection.id, existing.id);
          result.skipped++;
          continue;
        }

        // 生成新的 UUID
        const newId = randomUUID();
        collectionIdMap.set(collection.id, newId);

        // 插入合集
        const { error: insertError } = await newSupabase.from('collections').insert({
          id: newId,
          name: collection.name,
          cover_image: collection.cover_image,
          description: collection.description,
          people: collection.people,
          works: collection.works,
          source: collection.source,
          sort_order: collection.sort_order || 0,
          is_published: collection.is_published || false,
          published_at: collection.published_at,
          created_at: collection.created_at,
          updated_at: collection.updated_at,
        });

        if (insertError) {
          throw insertError;
        }

        result.migrated++;
        process.stdout.write(`\r  进度: ${result.migrated + result.skipped}/${result.total}`);
      } catch (e: any) {
        result.failed++;
        result.errors.push(`Collection ${collection.id} (${collection.name}): ${e.message}`);
      }
    }

    // 迁移合集-地点关联
    console.log('\n  📎 迁移合集-地点关联...');
    const { data: oldSpots } = await oldSupabase
      .from('collection_spots')
      .select('*');

    let spotsMigrated = 0;
    let spotsSkipped = 0;

    if (oldSpots) {
      for (const spot of oldSpots) {
        try {
          const newCollectionId = collectionIdMap.get(spot.collection_id);
          const newPlaceId = placeIdMap.get(spot.place_id);

          if (!newCollectionId || !newPlaceId) {
            spotsSkipped++;
            continue;
          }

          // 检查是否已存在
          const { data: existing } = await newSupabase
            .from('collection_spots')
            .select('id')
            .eq('collection_id', newCollectionId)
            .eq('place_id', newPlaceId)
            .limit(1)
            .single();

          if (existing) {
            spotsSkipped++;
            continue;
          }

          const { error } = await newSupabase.from('collection_spots').insert({
            id: randomUUID(),
            collection_id: newCollectionId,
            place_id: newPlaceId,
            city: spot.city,
            sort_order: spot.sort_order || 0,
            created_at: spot.created_at,
          });

          if (!error) {
            spotsMigrated++;
          }
        } catch {
          // 忽略重复错误
        }
      }
    }
    console.log(`  ✅ 关联: ${spotsMigrated} 新增, ${spotsSkipped} 跳过`);

  } catch (e: any) {
    console.error('  ❌ 迁移失败:', e.message);
    result.errors.push(e.message);
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
    const { data: oldRecommendations, error: fetchError } = await oldSupabase
      .from('collection_recommendations')
      .select('*')
      .order('sort_order');

    if (fetchError) {
      throw new Error(`获取旧数据失败: ${fetchError.message}`);
    }

    if (!oldRecommendations || oldRecommendations.length === 0) {
      console.log('  ⚠️ 旧数据库中没有推荐数据');
      return result;
    }

    result.total = oldRecommendations.length;
    console.log(`  找到 ${oldRecommendations.length} 个推荐分组`);

    for (const rec of oldRecommendations) {
      try {
        // 检查是否已存在
        const { data: existing } = await newSupabase
          .from('collection_recommendations')
          .select('id')
          .eq('name', rec.name)
          .limit(1)
          .single();

        if (existing) {
          recommendationIdMap.set(rec.id, existing.id);
          result.skipped++;
          continue;
        }

        // 生成新的 UUID
        const newId = randomUUID();
        recommendationIdMap.set(rec.id, newId);

        // 插入推荐分组
        const { error: insertError } = await newSupabase.from('collection_recommendations').insert({
          id: newId,
          name: rec.name,
          sort_order: rec.sort_order || 0,
          is_active: rec.is_active !== false,
          created_at: rec.created_at,
          updated_at: rec.updated_at,
        });

        if (insertError) {
          throw insertError;
        }

        result.migrated++;
      } catch (e: any) {
        result.failed++;
        result.errors.push(`Recommendation ${rec.id} (${rec.name}): ${e.message}`);
      }
    }

    // 迁移推荐项
    console.log('\n  📎 迁移推荐项...');
    const { data: oldItems } = await oldSupabase
      .from('collection_recommendation_items')
      .select('*');

    let itemsMigrated = 0;
    let itemsSkipped = 0;

    if (oldItems) {
      for (const item of oldItems) {
        try {
          const newRecId = recommendationIdMap.get(item.recommendation_id);
          const newCollectionId = collectionIdMap.get(item.collection_id);

          if (!newRecId || !newCollectionId) {
            itemsSkipped++;
            continue;
          }

          // 检查是否已存在
          const { data: existing } = await newSupabase
            .from('collection_recommendation_items')
            .select('id')
            .eq('recommendation_id', newRecId)
            .eq('collection_id', newCollectionId)
            .limit(1)
            .single();

          if (existing) {
            itemsSkipped++;
            continue;
          }

          const { error } = await newSupabase.from('collection_recommendation_items').insert({
            id: randomUUID(),
            recommendation_id: newRecId,
            collection_id: newCollectionId,
            sort_order: item.sort_order || 0,
            created_at: item.created_at,
          });

          if (!error) {
            itemsMigrated++;
          }
        } catch {
          // 忽略重复错误
        }
      }
    }
    console.log(`  ✅ 推荐项: ${itemsMigrated} 新增, ${itemsSkipped} 跳过`);

  } catch (e: any) {
    console.error('  ❌ 迁移失败:', e.message);
    result.errors.push(e.message);
  }

  console.log(`  ✅ 完成: ${result.migrated} 新增, ${result.skipped} 跳过, ${result.failed} 失败`);
  return result;
}

// =====================================================
// 主函数
// =====================================================

async function runMigration() {
  console.log('🚀 Supabase 数据迁移开始');
  console.log('='.repeat(50));
  console.log(`📅 开始时间: ${new Date().toISOString()}`);
  console.log(`🔗 旧项目: ${OLD_SUPABASE_URL}`);
  console.log(`🔗 新项目: ${NEW_SUPABASE_URL}`);
  console.log('='.repeat(50));

  // 检查环境变量
  if (!NEW_SUPABASE_URL || !NEW_SUPABASE_SERVICE_KEY) {
    console.error('❌ 缺少新 Supabase 环境变量');
    process.exit(1);
  }

  const results: MigrationResult[] = [];

  try {
    // 测试连接
    console.log('\n🔌 测试连接...');
    
    const { error: oldError } = await oldSupabase.from('places').select('id').limit(1);
    if (oldError) {
      console.error('  ❌ 旧数据库连接失败:', oldError.message);
      console.log('  💡 可能需要配置 OLD_SUPABASE_SERVICE_KEY 环境变量');
    } else {
      console.log('  ✅ 旧数据库连接成功');
    }

    const { error: newError } = await newSupabase.from('places').select('id').limit(1);
    if (newError) {
      console.error('  ❌ 新数据库连接失败:', newError.message);
      process.exit(1);
    }
    console.log('  ✅ 新数据库连接成功');

    // 按顺序迁移
    results.push(await migratePlaces());
    results.push(await migrateCollections());
    results.push(await migrateRecommendations());

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
  }
}

// 运行
runMigration();
