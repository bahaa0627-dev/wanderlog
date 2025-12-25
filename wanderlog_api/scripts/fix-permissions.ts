/**
 * 修复 Supabase 权限问题
 * 使用 Prisma 直接执行 SQL
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function fixPermissions() {
  console.log('🔧 修复 Supabase 权限...\n');

  try {
    // 1. 授予 schema 使用权限
    console.log('1. 授予 schema 使用权限...');
    await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO anon`);
    await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO authenticated`);
    await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO service_role`);
    console.log('   ✅ 完成');

    // 2. 授予表权限
    console.log('2. 授予表权限...');
    await prisma.$executeRawUnsafe(`GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role`);
    await prisma.$executeRawUnsafe(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon`);
    await prisma.$executeRawUnsafe(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated`);
    console.log('   ✅ 完成');

    // 3. 授予序列权限
    console.log('3. 授予序列权限...');
    await prisma.$executeRawUnsafe(`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role`);
    console.log('   ✅ 完成');

    // 4. 设置默认权限
    console.log('4. 设置默认权限...');
    await prisma.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role`);
    await prisma.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon`);
    await prisma.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO authenticated`);
    console.log('   ✅ 完成');

    // 5. 禁用 RLS 或创建允许 service_role 的策略
    console.log('5. 配置 RLS 策略...');
    
    const tables = [
      'places',
      'collections', 
      'collection_spots',
      'collection_recommendations',
      'collection_recommendation_items',
      'user_collection_favorites',
      'trips',
      'trip_spots',
      'ai_chat_sessions',
      'ai_chat_messages'
    ];

    for (const table of tables) {
      try {
        // 先检查表是否存在
        const exists = await prisma.$queryRawUnsafe(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = '${table}'
          )
        `);
        
        if ((exists as any)[0]?.exists) {
          // 启用 RLS
          await prisma.$executeRawUnsafe(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
          
          // 删除旧策略
          await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "Enable all for service_role" ON public.${table}`);
          await prisma.$executeRawUnsafe(`DROP POLICY IF EXISTS "Enable read for all" ON public.${table}`);
          
          // 创建 service_role 完全访问策略
          await prisma.$executeRawUnsafe(`
            CREATE POLICY "Enable all for service_role" ON public.${table}
            FOR ALL TO service_role USING (true) WITH CHECK (true)
          `);
          
          // 创建公开读取策略
          await prisma.$executeRawUnsafe(`
            CREATE POLICY "Enable read for all" ON public.${table}
            FOR SELECT TO anon, authenticated USING (true)
          `);
          
          console.log(`   ✅ ${table}`);
        }
      } catch (e: any) {
        console.log(`   ⚠️ ${table}: ${e.message}`);
      }
    }

    console.log('\n🎉 权限修复完成！');
    
  } catch (error: any) {
    console.error('❌ 错误:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

fixPermissions();
