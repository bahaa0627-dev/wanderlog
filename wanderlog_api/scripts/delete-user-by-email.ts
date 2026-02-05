/**
 * 删除指定邮箱的用户及其所有数据
 * 用法: npx ts-node scripts/delete-user-by-email.ts
 */

import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const prisma = new PrismaClient();

// 要删除的邮箱
const EMAIL_TO_DELETE = 'blcubahaa0627@gmail.com';

async function deleteUserByEmail() {
  console.log(`🗑️  删除用户: ${EMAIL_TO_DELETE}\n`);

  try {
    // 1. 查找 Supabase Auth 用户
    console.log('📋 Step 1: 查找 Supabase Auth 用户...');
    const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      console.error('❌ 无法列出用户:', listError.message);
      return;
    }

    const authUser = authUsers.users.find(u => u.email === EMAIL_TO_DELETE);
    
    if (authUser) {
      console.log(`   找到 Auth 用户: ${authUser.id}`);
      
      // 删除 Auth 用户
      const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(authUser.id);
      if (deleteAuthError) {
        console.error(`   ❌ 删除 Auth 用户失败:`, deleteAuthError.message);
      } else {
        console.log('   ✅ Auth 用户已删除');
      }

      // 2. 删除 profiles 表中的数据
      console.log('\n📋 Step 2: 删除 profiles 表数据...');
      const { error: deleteProfileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', authUser.id);

      if (deleteProfileError) {
        console.error('   ❌ 删除 profile 失败:', deleteProfileError.message);
      } else {
        console.log('   ✅ profile 已删除');
      }

      // 3. 删除 trips 表数据 (trip_spots 会级联删除)
      console.log('\n📋 Step 3: 删除 trips 表数据...');
      const { data: deletedTrips, error: deleteTripsError } = await supabase
        .from('trips')
        .delete()
        .eq('user_id', authUser.id)
        .select();

      if (deleteTripsError) {
        console.error('   ❌ 删除 trips 失败:', deleteTripsError.message);
      } else {
        console.log(`   ✅ 已删除 ${deletedTrips?.length || 0} 个行程`);
      }

      // 4. 删除 user_collection_favorites 表数据
      console.log('\n📋 Step 4: 删除 user_collection_favorites 表数据...');
      const { data: deletedFavorites, error: deleteFavoritesError } = await supabase
        .from('user_collection_favorites')
        .delete()
        .eq('user_id', authUser.id)
        .select();

      if (deleteFavoritesError) {
        console.error('   ❌ 删除收藏失败:', deleteFavoritesError.message);
      } else {
        console.log(`   ✅ 已删除 ${deletedFavorites?.length || 0} 个收藏`);
      }

    } else {
      console.log('   ⚠️  未找到 Auth 用户');
    }

    // 5. 删除 users 表数据 (verification_tokens 会级联删除)
    console.log('\n📋 Step 5: 删除 users 表数据 (旧系统)...');
    try {
      const oldUser = await prisma.user.findUnique({
        where: { email: EMAIL_TO_DELETE }
      });

      if (oldUser) {
        await prisma.user.delete({
          where: { email: EMAIL_TO_DELETE }
        });
        console.log('   ✅ users 表数据已删除 (verification_tokens 已级联删除)');
      } else {
        console.log('   ⚠️  users 表中未找到该用户');
      }
    } catch (error: any) {
      if (error.code === 'P2025') {
        console.log('   ⚠️  users 表中未找到该用户');
      } else {
        console.error('   ❌ 删除 users 表数据失败:', error.message);
      }
    }

    // 6. 验证清理结果
    console.log('\n📊 验证清理结果...');
    
    // 检查 Auth
    const { data: checkAuth } = await supabase.auth.admin.listUsers();
    const stillExists = checkAuth?.users.find(u => u.email === EMAIL_TO_DELETE);
    console.log(`   Auth 用户: ${stillExists ? '❌ 仍存在' : '✅ 已删除'}`);
    
    // 检查 profiles
    const { data: checkProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', authUser?.id || '')
      .single();
    console.log(`   Profile: ${checkProfile ? '❌ 仍存在' : '✅ 已删除'}`);
    
    // 检查 users 表
    const checkUser = await prisma.user.findUnique({
      where: { email: EMAIL_TO_DELETE }
    });
    console.log(`   Users 表: ${checkUser ? '❌ 仍存在' : '✅ 已删除'}`);

    console.log('\n🎉 清理完成！');
    console.log('\n💡 现在你可以在 App 中重新注册这个账号了');

  } catch (error: any) {
    console.error('❌ 错误:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

deleteUserByEmail();
