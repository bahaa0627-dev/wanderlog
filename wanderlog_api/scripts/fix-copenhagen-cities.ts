/**
 * 将所有 Copenhagen 相关的城市名统一改为 "Copenhagen"
 * 例如: "Copenhagen Municipality", "Frederiksberg Municipality" 等
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// 需要统一为 Copenhagen 的城市名模式
const COPENHAGEN_PATTERNS = [
  'Copenhagen Municipality',
  'Frederiksberg Municipality',
  'Gentofte Municipality',
  'Gladsaxe Municipality',
  'Hvidovre Municipality',
  'Rødovre Municipality',
  'Tårnby Municipality',
  'Dragør Municipality',
  'Vallensbæk Municipality',
  'Brøndby Municipality',
  'Albertslund Municipality',
  'Ballerup Municipality',
  'Herlev Municipality',
  'Ishøj Municipality',
  'Høje-Taastrup Municipality',
  'Lyngby-Taarbæk Municipality',
  'Rudersdal Municipality',
];

async function main() {
  console.log('修复 Copenhagen 相关城市名...\n');

  // 查找所有需要修改的记录
  const { data, error } = await supabase
    .from('places')
    .select('id, name, city')
    .or(COPENHAGEN_PATTERNS.map(p => `city.eq.${p}`).join(','));

  if (error) {
    console.log('查询失败:', error.message);
    return;
  }

  console.log(`找到 ${data?.length || 0} 条记录\n`);
  
  if (!data || data.length === 0) {
    console.log('没有需要修改的记录');
    return;
  }

  // 显示将要修改的记录
  const cityGroups: Record<string, number> = {};
  for (const place of data) {
    cityGroups[place.city] = (cityGroups[place.city] || 0) + 1;
  }
  
  console.log('城市分布:');
  for (const [city, count] of Object.entries(cityGroups).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${city}: ${count}`);
  }

  // 批量更新为 Copenhagen
  for (const pattern of COPENHAGEN_PATTERNS) {
    const { error: updateError } = await supabase
      .from('places')
      .update({ city: 'Copenhagen' })
      .eq('city', pattern);

    if (updateError) {
      console.log(`\n更新 "${pattern}" 失败:`, updateError.message);
    }
  }

  console.log(`\n✓ 已将 ${data.length} 条记录的 city 更新为 Copenhagen`);
}

main().catch(console.error);
