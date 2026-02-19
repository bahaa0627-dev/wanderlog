/**
 * 检查并修复 Bankside 和 Lincoln's Inn Fields 的剧照字段完整性
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const targets = ['Bankside', "Lincoln's Inn Fields"];

async function fixStills() {
  for (const name of targets) {
    const { data: places, error } = await supabase
      .from('places')
      .select('id, name, city, custom_fields')
      .ilike('name', '%' + name + '%')
      .limit(5);

    if (error || !places || places.length === 0) { console.log('未找到:', name); continue; }

    for (const place of places) {
      const cf = place.custom_fields as any;
      if (!cf || !cf.stills || cf.stills.length === 0) { console.log(place.name, '- 无剧照'); continue; }

      console.log(`\n📍 ${place.name}`);
      const stills = cf.stills;

      // 打印每张剧照的完整结构
      stills.forEach((s: any, i: number) => {
        console.log(`  [${i+1}] keys: ${Object.keys(s).join(', ')}`);
        console.log(`       canCompare=${s.canCompare} (${typeof s.canCompare}), isHidden=${s.isHidden} (${typeof s.isHidden}), movieId=${s.movieId}`);
      });

      // 检查是否缺少 canCompare 或 isHidden 字段
      const needsFix = stills.some((s: any) => s.canCompare === undefined || s.isHidden === undefined);
      
      if (!needsFix) {
        console.log('  ✅ 字段完整，无需修复');
        continue;
      }

      // 补全缺失字段
      const fixedStills = stills.map((s: any) => ({
        movieId: s.movieId || '_unknown_',
        movieNameCn: s.movieNameCn || '',
        movieNameEn: s.movieNameEn || '',
        year: s.year || '',
        url: s.url || s.imageUrl || s.image || '',
        canCompare: s.canCompare ?? false,
        isHidden: s.isHidden ?? false
      })).filter((s: any) => s.url);

      const { error: updateError } = await supabase
        .from('places')
        .update({ custom_fields: { ...cf, stills: fixedStills } })
        .eq('id', place.id);

      if (updateError) {
        console.log(`  ❌ 修复失败: ${updateError.message}`);
      } else {
        console.log(`  ✅ 已修复 ${fixedStills.length} 张剧照的缺失字段`);
      }
    }
  }
  console.log('\n完成');
}

fixStills().catch(console.error);
