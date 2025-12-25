/**
 * 对比新旧数据库的表结构和数据量
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

// 旧 Supabase 项目（印度区域）
const OLD_SUPABASE_URL = 'https://bpygtpeawkxlgjhqorzi.supabase.co';
const OLD_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJweWd0cGVhd2t4bGdqaHFvcnppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MTM1NjQsImV4cCI6MjA4MTk4OTU2NH0.6_2dRSlPs54Q25RtKP07eIv-7t0yDFOkibAt05Bp_RQ';

// 新 Supabase 项目（新加坡区域）
const NEW_SUPABASE_URL = process.env.SUPABASE_URL!;
const NEW_SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

const oldSupabase = createClient(OLD_SUPABASE_URL, OLD_SUPABASE_ANON_KEY);
const newSupabase = createClient(NEW_SUPABASE_URL, NEW_SUPABASE_SERVICE_KEY);

// 要检查的表列表
const tablesToCheck = [
  'app_configs',
  'places',
  'collections',
  'collection_spots',
  'collection_recommendations',
  'collection_recommendation_items',
  'profiles',
  'trips',
  'trip_spots',
  'user_checkins',
  'user_collection_favorites',
  'user_favorites',
  'ai_chat_sessions',
  'ai_chat_messages',
];

async function getTableCount(supabase: any, tableName: string): Promise<number | string> {
  try {
    const { count, error } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      return `错误: ${error.message}`;
    }
    return count || 0;
  } catch (e: any) {
    return `错误: ${e.message}`;
  }
}

async function getTableSample(supabase: any, tableName: string, limit: number = 2): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .limit(limit);
    
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

async function compareDatabases() {
  console.log('📊 对比新旧数据库\n');
  console.log('='.repeat(70));
  console.log(`${'表名'.padEnd(35)} ${'旧数据库'.padEnd(15)} ${'新数据库'.padEnd(15)}`);
  console.log('='.repeat(70));

  const missingInNew: string[] = [];
  const needsMigration: { table: string; oldCount: number; newCount: number }[] = [];

  for (const table of tablesToCheck) {
    const oldCount = await getTableCount(oldSupabase, table);
    const newCount = await getTableCount(newSupabase, table);
    
    const oldStr = typeof oldCount === 'number' ? oldCount.toString() : oldCount;
    const newStr = typeof newCount === 'number' ? newCount.toString() : newCount;
    
    let status = '';
    if (typeof newCount === 'string' && newCount.includes('错误')) {
      status = ' ❌ 新库缺少此表';
      missingInNew.push(table);
    } else if (typeof oldCount === 'number' && typeof newCount === 'number') {
      if (oldCount > newCount) {
        status = ' ⚠️ 需要迁移';
        needsMigration.push({ table, oldCount, newCount });
      } else if (oldCount === newCount && oldCount > 0) {
        status = ' ✅';
      }
    }
    
    console.log(`${table.padEnd(35)} ${oldStr.padEnd(15)} ${newStr.padEnd(15)}${status}`);
  }

  console.log('='.repeat(70));

  // 显示缺少的表
  if (missingInNew.length > 0) {
    console.log('\n❌ 新数据库缺少的表:');
    for (const table of missingInNew) {
      console.log(`   - ${table}`);
      
      // 获取旧表的样本数据来了解结构
      const sample = await getTableSample(oldSupabase, table);
      if (sample.length > 0) {
        console.log(`     字段: ${Object.keys(sample[0]).join(', ')}`);
      }
    }
  }

  // 显示需要迁移的表
  if (needsMigration.length > 0) {
    console.log('\n⚠️ 需要迁移更多数据的表:');
    for (const { table, oldCount, newCount } of needsMigration) {
      console.log(`   - ${table}: 旧库 ${oldCount} 条, 新库 ${newCount} 条, 差 ${oldCount - newCount} 条`);
    }
  }

  // 特别查看 app_configs 表的内容
  console.log('\n📋 app_configs 表内容 (旧库):');
  const appConfigs = await getTableSample(oldSupabase, 'app_configs', 10);
  if (appConfigs.length > 0) {
    for (const config of appConfigs) {
      console.log(`   - ${config.key}: ${JSON.stringify(config.value).substring(0, 100)}...`);
    }
  }

  // 查看 user_checkins 表结构
  console.log('\n📋 user_checkins 表样本 (旧库):');
  const checkins = await getTableSample(oldSupabase, 'user_checkins', 2);
  if (checkins.length > 0) {
    console.log(`   字段: ${Object.keys(checkins[0]).join(', ')}`);
    console.log(`   样本: ${JSON.stringify(checkins[0], null, 2).substring(0, 500)}`);
  }

  // 查看 user_favorites 表结构
  console.log('\n📋 user_favorites 表样本 (旧库):');
  const favorites = await getTableSample(oldSupabase, 'user_favorites', 2);
  if (favorites.length > 0) {
    console.log(`   字段: ${Object.keys(favorites[0]).join(', ')}`);
  }
}

compareDatabases();
