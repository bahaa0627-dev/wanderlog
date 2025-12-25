/**
 * 迁移剩余的表数据
 * app_configs, trips, trip_spots
 */

import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import { randomUUID } from 'crypto';

dotenv.config();

// 旧 Supabase 项目（印度区域）
const OLD_SUPABASE_URL = 'https://bpygtpeawkxlgjhqorzi.supabase.co';
const OLD_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJweWd0cGVhd2t4bGdqaHFvcnppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MTM1NjQsImV4cCI6MjA4MTk4OTU2NH0.6_2dRSlPs54Q25RtKP07eIv-7t0yDFOkibAt05Bp_RQ';

// 新 Supabase 项目（新加坡区域）
const NEW_SUPABASE_URL = process.env.SUPABASE_URL!;
const NEW_SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

const oldSupabase = createClient(OLD_SUPABASE_URL, OLD_SUPABASE_ANON_KEY);
const newSupabase = createClient(NEW_SUPABASE_URL, NEW_SUPABASE_SERVICE_KEY);
const prisma = new PrismaClient();

// ID 映射
const tripIdMap = new Map<string, string>();

async function ensureAppConfigsTable() {
  console.log('\n📋 检查 app_configs 表...');
  
  try {
    // 使用 Prisma 创建表（如果不存在）
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS public.app_configs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        key TEXT UNIQUE NOT NULL,
        value JSONB NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    // 授予权限
    await prisma.$executeRawUnsafe(`GRANT SELECT ON public.app_configs TO anon`);
    await prisma.$executeRawUnsafe(`GRANT SELECT ON public.app_configs TO authenticated`);
    await prisma.$executeRawUnsafe(`GRANT ALL ON public.app_configs TO service_role`);
    
    // 启用 RLS
    await prisma.$executeRawUnsafe(`ALTER TABLE public.app_configs ENABLE ROW LEVEL SECURITY`);
    await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "Enable read for all" ON public.app_configs`);
    await prisma.$executeRawUnsafe(`
      CREATE POLICY "Enable read for all" ON public.app_configs
      FOR SELECT TO anon, authenticated USING (true)
    `);
    await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "Enable all for service_role" ON public.app_configs`);
    await prisma.$executeRawUnsafe(`
      CREATE POLICY "Enable all for service_role" ON public.app_configs
      FOR ALL TO service_role USING (true) WITH CHECK (true)
    `);
    
    console.log('   ✅ app_configs 表已准备好');
  } catch (e: any) {
    console.log(`   ⚠️ ${e.message}`);
  }
}

async function migrateAppConfigs() {
  console.log('\n📋 迁移 app_configs...');
  
  try {
    const { data: oldConfigs, error } = await oldSupabase
      .from('app_configs')
      .select('*');
    
    if (error) {
      console.log(`   ❌ 获取旧数据失败: ${error.message}`);
      return;
    }
    
    if (!oldConfigs || oldConfigs.length === 0) {
      console.log('   ⚠️ 没有数据');
      return;
    }
    
    console.log(`   找到 ${oldConfigs.length} 条配置`);
    
    let migrated = 0;
    let skipped = 0;
    
    for (const config of oldConfigs) {
      try {
        // 检查是否已存在
        const { data: existing } = await newSupabase
          .from('app_configs')
          .select('id')
          .eq('key', config.key)
          .single();
        
        if (existing) {
          skipped++;
          continue;
        }
        
        const { error: insertError } = await newSupabase.from('app_configs').insert({
          id: config.id || randomUUID(),
          key: config.key,
          value: config.value,
          description: config.description,
          created_at: config.created_at,
          updated_at: config.updated_at,
        });
        
        if (insertError) {
          console.log(`   ❌ ${config.key}: ${insertError.message}`);
        } else {
          migrated++;
          console.log(`   ✅ ${config.key}`);
        }
      } catch (e: any) {
        console.log(`   ❌ ${config.key}: ${e.message}`);
      }
    }
    
    console.log(`   完成: ${migrated} 新增, ${skipped} 跳过`);
  } catch (e: any) {
    console.log(`   ❌ 错误: ${e.message}`);
  }
}

async function migrateTrips() {
  console.log('\n🗺️ 迁移 trips...');
  
  try {
    const { data: oldTrips, error } = await oldSupabase
      .from('trips')
      .select('*')
      .order('created_at');
    
    if (error) {
      console.log(`   ❌ 获取旧数据失败: ${error.message}`);
      return;
    }
    
    if (!oldTrips || oldTrips.length === 0) {
      console.log('   ⚠️ 没有数据');
      return;
    }
    
    console.log(`   找到 ${oldTrips.length} 条行程`);
    
    let migrated = 0;
    let skipped = 0;
    
    for (const trip of oldTrips) {
      try {
        // 检查是否已存在（通过 user_id + name）
        const { data: existing } = await newSupabase
          .from('trips')
          .select('id')
          .eq('user_id', trip.user_id)
          .eq('name', trip.name)
          .single();
        
        if (existing) {
          tripIdMap.set(trip.id, existing.id);
          skipped++;
          continue;
        }
        
        const newId = randomUUID();
        tripIdMap.set(trip.id, newId);
        
        const { error: insertError } = await newSupabase.from('trips').insert({
          id: newId,
          user_id: trip.user_id,
          name: trip.name,
          description: trip.description,
          cover_image: trip.cover_image,
          start_date: trip.start_date,
          end_date: trip.end_date,
          is_public: trip.is_public || false,
          created_at: trip.created_at,
          updated_at: trip.updated_at,
        });
        
        if (insertError) {
          console.log(`   ❌ ${trip.name}: ${insertError.message}`);
        } else {
          migrated++;
        }
      } catch (e: any) {
        console.log(`   ❌ ${trip.name}: ${e.message}`);
      }
    }
    
    console.log(`   完成: ${migrated} 新增, ${skipped} 跳过`);
  } catch (e: any) {
    console.log(`   ❌ 错误: ${e.message}`);
  }
}

async function migrateTripSpots() {
  console.log('\n📍 迁移 trip_spots...');
  
  try {
    const { data: oldSpots, error } = await oldSupabase
      .from('trip_spots')
      .select('*')
      .order('created_at');
    
    if (error) {
      console.log(`   ❌ 获取旧数据失败: ${error.message}`);
      return;
    }
    
    if (!oldSpots || oldSpots.length === 0) {
      console.log('   ⚠️ 没有数据');
      return;
    }
    
    console.log(`   找到 ${oldSpots.length} 条行程地点`);
    
    // 先获取新数据库中的 places 映射
    const { data: newPlaces } = await newSupabase
      .from('places')
      .select('id, google_place_id, name');
    
    const placeMap = new Map<string, string>();
    if (newPlaces) {
      for (const p of newPlaces) {
        if (p.google_place_id) {
          placeMap.set(p.google_place_id, p.id);
        }
      }
    }
    
    // 获取旧数据库的 places 来建立映射
    const { data: oldPlaces } = await oldSupabase
      .from('places')
      .select('id, google_place_id');
    
    const oldToNewPlaceMap = new Map<string, string>();
    if (oldPlaces && newPlaces) {
      for (const oldPlace of oldPlaces) {
        if (oldPlace.google_place_id && placeMap.has(oldPlace.google_place_id)) {
          oldToNewPlaceMap.set(oldPlace.id, placeMap.get(oldPlace.google_place_id)!);
        }
      }
    }
    
    let migrated = 0;
    let skipped = 0;
    let failed = 0;
    
    for (const spot of oldSpots) {
      try {
        const newTripId = tripIdMap.get(spot.trip_id);
        const newPlaceId = oldToNewPlaceMap.get(spot.place_id) || spot.place_id;
        
        if (!newTripId) {
          // 尝试直接使用原 trip_id
          const { data: tripExists } = await newSupabase
            .from('trips')
            .select('id')
            .eq('id', spot.trip_id)
            .single();
          
          if (!tripExists) {
            failed++;
            continue;
          }
        }
        
        const finalTripId = newTripId || spot.trip_id;
        
        // 检查是否已存在
        const { data: existing } = await newSupabase
          .from('trip_spots')
          .select('id')
          .eq('trip_id', finalTripId)
          .eq('place_id', newPlaceId)
          .single();
        
        if (existing) {
          skipped++;
          continue;
        }
        
        const { error: insertError } = await newSupabase.from('trip_spots').insert({
          id: randomUUID(),
          trip_id: finalTripId,
          place_id: newPlaceId,
          day_number: spot.day_number,
          sort_order: spot.sort_order || 0,
          notes: spot.notes,
          visit_date: spot.visit_date,
          status: spot.status || 'planned',
          created_at: spot.created_at,
          updated_at: spot.updated_at,
        });
        
        if (insertError) {
          console.log(`   ❌ spot ${spot.id}: ${insertError.message}`);
          failed++;
        } else {
          migrated++;
        }
      } catch (e: any) {
        failed++;
      }
    }
    
    console.log(`   完成: ${migrated} 新增, ${skipped} 跳过, ${failed} 失败`);
  } catch (e: any) {
    console.log(`   ❌ 错误: ${e.message}`);
  }
}

async function main() {
  console.log('🚀 迁移剩余表数据\n');
  console.log('='.repeat(50));
  
  try {
    // 确保 app_configs 表存在
    await ensureAppConfigsTable();
    
    // 迁移数据
    await migrateAppConfigs();
    await migrateTrips();
    await migrateTripSpots();
    
    console.log('\n' + '='.repeat(50));
    console.log('🎉 迁移完成！');
  } catch (e: any) {
    console.error('❌ 错误:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
