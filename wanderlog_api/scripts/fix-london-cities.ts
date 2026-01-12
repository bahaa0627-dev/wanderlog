/**
 * 将所有 "London Borough of xxx" 的 city 改为 "London"
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  console.log('修复 London Borough 城市名...\n');

  // 查找所有 city 以 'London Borough' 开头的记录
  const { data, error } = await supabase
    .from('places')
    .select('id, name, city')
    .ilike('city', 'London Borough%');

  if (error) {
    console.log('查询失败:', error.message);
    return;
  }

  console.log(`找到 ${data?.length || 0} 条记录\n`);
  
  // 显示将要修改的记录
  const cityGroups: Record<string, number> = {};
  for (const place of data || []) {
    cityGroups[place.city] = (cityGroups[place.city] || 0) + 1;
  }
  
  console.log('城市分布:');
  for (const [city, count] of Object.entries(cityGroups).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${city}: ${count}`);
  }

  if (data && data.length > 0) {
    // 批量更新为 London
    const { error: updateError } = await supabase
      .from('places')
      .update({ city: 'London' })
      .ilike('city', 'London Borough%');

    if (updateError) {
      console.log('\n更新失败:', updateError.message);
    } else {
      console.log(`\n✓ 已将 ${data.length} 条记录的 city 更新为 London`);
    }
  }
}

main().catch(console.error);
