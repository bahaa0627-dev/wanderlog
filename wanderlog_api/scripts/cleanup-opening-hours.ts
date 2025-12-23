/**
 * 清理 opening_hours 字段，只保留 weekday_text 数组
 * 移除 open_now, periods 等冗余数据
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function cleanupOpeningHours() {
  console.log('🔧 开始清理 opening_hours 字段...\n');

  // 获取所有有 opening_hours 的地点
  const { data: places, error } = await supabase
    .from('places')
    .select('id, name, opening_hours')
    .not('opening_hours', 'is', null);

  if (error) {
    console.error('❌ 获取数据失败:', error.message);
    return;
  }

  console.log(`📊 找到 ${places.length} 个有营业时间的地点\n`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const place of places) {
    try {
      let hours = place.opening_hours;
      
      // 如果是字符串，先解析
      if (typeof hours === 'string') {
        hours = JSON.parse(hours);
      }

      // 如果已经是数组格式，跳过
      if (Array.isArray(hours)) {
        skipped++;
        continue;
      }

      // 如果是对象格式，提取 weekday_text
      if (hours && typeof hours === 'object') {
        let weekdayText: string[] | null = null;

        if (hours.weekday_text && Array.isArray(hours.weekday_text)) {
          weekdayText = hours.weekday_text;
        }

        if (weekdayText && weekdayText.length > 0) {
          // 更新为简化格式
          const { error: updateError } = await supabase
            .from('places')
            .update({ opening_hours: weekdayText })
            .eq('id', place.id);

          if (updateError) {
            console.error(`❌ 更新 ${place.name} 失败:`, updateError.message);
            errors++;
          } else {
            console.log(`✅ ${place.name}: 已简化营业时间`);
            updated++;
          }
        } else {
          // 没有 weekday_text，清空字段
          const { error: updateError } = await supabase
            .from('places')
            .update({ opening_hours: null })
            .eq('id', place.id);

          if (updateError) {
            console.error(`❌ 清空 ${place.name} 失败:`, updateError.message);
            errors++;
          } else {
            console.log(`🗑️ ${place.name}: 无有效营业时间，已清空`);
            updated++;
          }
        }
      }
    } catch (e) {
      console.error(`❌ 处理 ${place.name} 出错:`, e);
      errors++;
    }
  }

  console.log('\n📊 清理完成:');
  console.log(`   ✅ 已更新: ${updated}`);
  console.log(`   ⏭️ 已跳过: ${skipped}`);
  console.log(`   ❌ 错误: ${errors}`);
}

cleanupOpeningHours().catch(console.error);
