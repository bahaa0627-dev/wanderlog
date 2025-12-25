/**
 * 修复 trips 表中的 user_id，将旧用户的数据分配给新用户
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// 旧用户 ID（从旧数据库迁移过来的）
const OLD_USER_ID = '0d028f9d-dee5-460b-9952-da9e2687df2e';
// 新用户 ID（blcubahaa0627@gmail.com）
const NEW_USER_ID = 'dc4d5f8f-8b52-4853-a180-9f7f5e869005';

async function fixTripsUser() {
  console.log('🔧 修复 trips 用户 ID...\n');

  // 更新 trips 表
  const { data: updatedTrips, error: tripsError } = await supabase
    .from('trips')
    .update({ user_id: NEW_USER_ID })
    .eq('user_id', OLD_USER_ID)
    .select('id, name');

  if (tripsError) {
    console.error('❌ 更新 trips 失败:', tripsError.message);
    return;
  }

  console.log(`✅ 更新了 ${updatedTrips?.length || 0} 条 trips 记录:`);
  if (updatedTrips) {
    for (const trip of updatedTrips) {
      console.log(`   - ${trip.name}`);
    }
  }

  // 验证更新
  console.log('\n🔍 验证更新...\n');
  const { data: trips } = await supabase
    .from('trips')
    .select('id, name, user_id')
    .eq('user_id', NEW_USER_ID);

  console.log(`📋 用户 ${NEW_USER_ID} 现在有 ${trips?.length || 0} 条 trips`);

  console.log('\n🎉 完成！');
}

fixTripsUser();
