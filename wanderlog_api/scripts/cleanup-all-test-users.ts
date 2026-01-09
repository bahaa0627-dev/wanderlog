/**
 * 清理所有测试用户数据
 * 1. 删除 Supabase Auth 中的所有用户
 * 2. 删除 profiles 表中的所有数据
 * 3. 重新创建测试用户
 */

import { createClient } from '@supabase/supabase-js';
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

async function cleanupAllTestUsers() {
  console.log('🧹 开始清理所有测试用户数据...\n');

  try {
    // 1. 列出所有 Auth 用户
    console.log('📋 获取所有 Auth 用户...');
    const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      console.error('❌ 无法列出用户:', listError.message);
      return;
    }

    console.log(`   找到 ${authUsers.users.length} 个 Auth 用户`);

    // 2. 删除所有 Auth 用户
    if (authUsers.users.length > 0) {
      console.log('\n🗑️  删除所有 Auth 用户...');
      for (const user of authUsers.users) {
        const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
        if (deleteError) {
          console.error(`   ❌ 删除用户 ${user.email} 失败:`, deleteError.message);
        } else {
          console.log(`   ✅ 已删除: ${user.email} (${user.id})`);
        }
      }
    }

    // 3. 清空 profiles 表
    console.log('\n🗑️  清空 profiles 表...');
    const { error: deleteProfilesError } = await supabase
      .from('profiles')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // 删除所有记录

    if (deleteProfilesError) {
      console.error('   ❌ 清空 profiles 表失败:', deleteProfilesError.message);
    } else {
      console.log('   ✅ profiles 表已清空');
    }

    // 4. 验证清理结果
    console.log('\n📊 验证清理结果...');
    
    const { data: remainingUsers } = await supabase.auth.admin.listUsers();
    console.log(`   Auth 用户数: ${remainingUsers?.users.length || 0}`);
    
    const { data: remainingProfiles, count } = await supabase
      .from('profiles')
      .select('*', { count: 'exact' });
    console.log(`   Profiles 记录数: ${count || remainingProfiles?.length || 0}`);

    console.log('\n🎉 清理完成！');
    console.log('\n💡 现在你可以在 App 中重新注册测试账号了');

  } catch (error: any) {
    console.error('❌ 错误:', error.message);
  }
}

cleanupAllTestUsers();
