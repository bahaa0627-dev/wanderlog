import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function fixTripsCity() {
  console.log('🔧 修复 trips 的 city 字段...\n');

  // 获取所有 trips
  const { data: trips, error } = await supabase.from('trips').select('id, name, city');
  
  if (error) {
    console.error('❌ 获取 trips 失败:', error.message);
    return;
  }

  console.log('当前 trips:');
  for (const t of trips || []) {
    console.log(`  - ${t.name} | city: ${t.city || '(空)'}`);
  }

  // 更新 city 为 name（如果 city 为空）
  let updated = 0;
  for (const t of trips || []) {
    if (!t.city) {
      const { error: updateError } = await supabase
        .from('trips')
        .update({ city: t.name })
        .eq('id', t.id);
      
      if (!updateError) {
        console.log(`✅ 更新 ${t.name} 的 city 为 ${t.name}`);
        updated++;
      }
    }
  }

  console.log(`\n🎉 完成！更新了 ${updated} 条记录`);
}

fixTripsCity();
