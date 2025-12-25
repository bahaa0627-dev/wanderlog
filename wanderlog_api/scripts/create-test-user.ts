/**
 * 在 Supabase Auth 中创建测试用户
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

async function createTestUser() {
  console.log('🔧 创建测试用户...\n');

  const email = 'blcubahaa0627@gmail.com';
  const password = 'Wanderlog123!';

  try {
    // 先检查用户是否已存在
    const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      console.error('❌ 无法列出用户:', listError.message);
      return;
    }

    const existingUser = existingUsers.users.find(u => u.email === email);
    
    if (existingUser) {
      console.log(`📧 用户 ${email} 已存在`);
      console.log(`   ID: ${existingUser.id}`);
      console.log(`   邮箱确认: ${existingUser.email_confirmed_at ? '✅ 已确认' : '❌ 未确认'}`);
      
      // 如果邮箱未确认，确认它
      if (!existingUser.email_confirmed_at) {
        console.log('\n🔧 确认邮箱...');
        const { error: updateError } = await supabase.auth.admin.updateUserById(
          existingUser.id,
          { email_confirm: true }
        );
        
        if (updateError) {
          console.error('❌ 确认邮箱失败:', updateError.message);
        } else {
          console.log('✅ 邮箱已确认');
        }
      }
      
      // 更新密码
      console.log('\n🔧 更新密码...');
      const { error: pwError } = await supabase.auth.admin.updateUserById(
        existingUser.id,
        { password: password }
      );
      
      if (pwError) {
        console.error('❌ 更新密码失败:', pwError.message);
      } else {
        console.log('✅ 密码已更新');
      }
      
    } else {
      // 创建新用户
      console.log(`📧 创建用户 ${email}...`);
      
      const { data, error } = await supabase.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true, // 自动确认邮箱
      });

      if (error) {
        console.error('❌ 创建用户失败:', error.message);
        return;
      }

      console.log('✅ 用户创建成功');
      console.log(`   ID: ${data.user.id}`);
      console.log(`   Email: ${data.user.email}`);
    }

    // 测试登录
    console.log('\n🔐 测试登录...');
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (signInError) {
      console.error('❌ 登录失败:', signInError.message);
    } else {
      console.log('✅ 登录成功');
      console.log(`   User ID: ${signInData.user?.id}`);
      console.log(`   Access Token: ${signInData.session?.access_token?.substring(0, 50)}...`);
    }

    console.log('\n🎉 完成！');
    console.log(`\n📱 iOS App 登录信息:`);
    console.log(`   邮箱: ${email}`);
    console.log(`   密码: ${password}`);

  } catch (error: any) {
    console.error('❌ 错误:', error.message);
  }
}

createTestUser();
