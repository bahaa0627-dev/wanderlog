/**
 * 迁移 Bankside 和 Lincoln's Inn Fields 的剧照到新格式
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const targets = ['Bankside', "Lincoln's Inn Fields"];

async function migrate() {
  for (const name of targets) {
    const { data: places, error } = await supabase
      .from('places')
      .select('id, name, city, custom_fields')
      .ilike('name', '%' + name + '%')
      .limit(5);

    if (error) { console.log('❌ 查询失败:', name, error.message); continue; }
    if (!places || places.length === 0) { console.log('⚠️ 未找到:', name); continue; }

    for (const place of places) {
      const cf = place.custom_fields as any;
      console.log(`\n📍 ${place.name} (${place.city})`);
      console.log(`   ID: ${place.id}`);

      if (!cf || !cf.stills || cf.stills.length === 0) {
        console.log('   无剧照，跳过');
        continue;
      }

      const stills = cf.stills;
      console.log(`   剧照数: ${stills.length}`);
      console.log(`   第一张格式: ${typeof stills[0]} => ${JSON.stringify(stills[0]).substring(0, 100)}`);

      const needsMigration = stills.some((s: any) =>
        typeof s === 'string' ||
        (typeof s === 'object' && (s.canCompare === undefined || s.isHidden === undefined))
      );

      if (!needsMigration) {
        console.log('   ✅ 已是新格式，无需迁移');
        continue;
      }

      const newStills = stills.map((still: any) => {
        if (typeof still === 'string') {
          return { movieId: '_unknown_', movieNameCn: '', movieNameEn: '', year: '', url: still, canCompare: false, isHidden: false };
        }
        const url = still.url || still.imageUrl || still.image || '';
        return {
          movieId: still.movieId || '_unknown_',
          movieNameCn: still.movieNameCn || '',
          movieNameEn: still.movieNameEn || '',
          year: still.year || '',
          url,
          canCompare: still.canCompare ?? false,
          isHidden: still.isHidden ?? false
        };
      }).filter((s: any) => s.url);

      const { error: updateError } = await supabase
        .from('places')
        .update({ custom_fields: { ...cf, stills: newStills } })
        .eq('id', place.id);

      if (updateError) {
        console.log(`   ❌ 更新失败: ${updateError.message}`);
      } else {
        console.log(`   ✅ 已迁移 ${newStills.length} 张剧照`);
      }
    }
  }
  console.log('\n完成');
}

migrate().catch(console.error);
