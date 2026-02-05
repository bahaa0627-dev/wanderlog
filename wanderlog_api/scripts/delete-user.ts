import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function deleteUser(email: string) {
  console.log(`🔍 查找用户: ${email}`);
  
  // 1. 查找用户
  const { data: users, error: findError } = await supabase
    .from('users')
    .select('id, email')
    .eq('email', email);
  
  if (findError) {
    console.error('查找用户失败:', findError);
    return;
  }
  
  if (!users || users.length === 0) {
    console.log('未找到该用户');
    return;
  }
  
  const userId = users[0].id;
  console.log('找到用户:', userId);
  
  // 2. 删除用户相关数据
  const tables = ['trip_spots', 'trips', 'user_collections', 'collection_favorites'];
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId);
    if (error) {
      console.log(`${table} 删除失败:`, error.message);
    } else {
      console.log(`${table} 已清理`);
    }
  }
  
  // 3. 删除 users 表记录
  const { error: delUserError } = await supabase.from('users').delete().eq('id', userId);
  if (delUserError) {
    console.error('删除 users 失败:', delUserError);
  } else {
    console.log('users 表记录已删除');
  }
  
  // 4. 删除 auth.users
  const { error: authError } = await supabase.auth.admin.deleteUser(userId);
  if (authError) {
    console.error('删除 auth 用户失败:', authError);
  } else {
    console.log('auth 用户已删除');
  }
  
  console.log(`✅ 账号 ${email} 已注销`);
}

const email = process.argv[2] || '728300834@qq.com';
deleteUser(email);
