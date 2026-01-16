/**
 * 检查 Tokyo mocation 地点的排名
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTokyoMocationRank() {
  console.log('🔍 检查 Tokyo 地点总数和 mocation 排名...\n');

  // 统计 Tokyo 地点总数
  const { count: totalCount } = await supabase
    .from('places')
    .select('*', { count: 'exact', head: true })
    .eq('city', 'Tokyo');

  console.log(`📍 Tokyo 地点总数: ${totalCount}\n`);

  // 获取所有 Tokyo 地点并找出 mocation 的排名
  const { data: allPlaces, error } = await supabase
    .from('places')
    .select('id, name, rating_count, source, custom_fields')
    .eq('city', 'Tokyo')
    .order('rating_count', { ascending: false, nullsFirst: false });

  if (error) {
    console.error('❌ 查询失败:', error);
    return;
  }

  console.log(`📍 获取到 ${allPlaces?.length || 0} 个 Tokyo 地点\n`);

  // 找出 mocation 地点的排名
  console.log('🎬 Mocation 地点排名:\n');
  
  let rank = 0;
  for (const place of allPlaces || []) {
    rank++;
    if (place.source === 'mocation') {
      const hasStills = place.custom_fields?.stills?.length > 0;
      console.log(`  #${rank} - ${place.name} (rating_count: ${place.rating_count || 'null'}) ${hasStills ? '🎬' : ''}`);
    }
  }

  // 检查有剧照的地点
  console.log('\n📸 所有有剧照数据的地点:\n');
  
  const placesWithStills = (allPlaces || []).filter(p => p.custom_fields?.stills?.length > 0);
  for (const place of placesWithStills) {
    const stillsCount = place.custom_fields?.stills?.length || 0;
    console.log(`  - ${place.name} (${stillsCount} stills, rating_count: ${place.rating_count || 'null'})`);
  }
}

checkTokyoMocationRank().catch(console.error);
