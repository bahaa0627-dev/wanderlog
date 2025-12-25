/**
 * 检查 trips 表中的 user_id 和当前用户
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkTripsUser() {
  console.log('🔍 检查 trips 数据...\n');

  // 获取所有 trips
  const { data: trips, error: tripsError } = await supabase
    .from('trips')
    .select('id, name, user_id, created_at');

  if (tripsError) {
    console.error('❌ 获取 trips 失败:', tripsError.message);
    return;
  }

  console.log(`📋 trips 表中有 ${trips?.length || 0} 条记录:\n`);
  
  if (trips) {
    for (const trip of trips) {
      console.log(`  - ${trip.name}`);
      console.log(`    user_id: ${trip.user_id}`);
      console.log(`    created_at: ${trip.created_at}`);
      console.log('');
    }
  }

  // 获取所有用户
  console.log('\n👥 Supabase Auth 用户:\n');
  const { data: users, error: usersError } = await supabase.auth.admin.listUsers();
  
  if (usersError) {
    console.error('❌ 获取用户失败:', usersError.message);
    return;
  }

  if (users?.users) {
    for (const user of users.users) {
      console.log(`  - ${user.email}`);
      console.log(`    id: ${user.id}`);
      console.log(`    created_at: ${user.created_at}`);
      console.log('');
    }
  }

  // 检查 user_id 是否匹配
  console.log('\n🔗 匹配检查:\n');
  const userIds = new Set(users?.users.map(u => u.id) || []);
  
  if (trips) {
    for (const trip of trips) {
      const matched = userIds.has(trip.user_id);
      console.log(`  ${matched ? '✅' : '❌'} Trip "${trip.name}" - user_id ${matched ? '匹配' : '不匹配'}`);
    }
  }
}

checkTripsUser();
