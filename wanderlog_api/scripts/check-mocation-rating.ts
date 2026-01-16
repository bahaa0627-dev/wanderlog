/**
 * 检查 mocation 地点的 rating_count
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkMocationRating() {
  console.log('🔍 检查 mocation 地点的 rating_count...\n');

  const { data: places, error } = await supabase
    .from('places')
    .select('id, name, city, rating, rating_count, cover_image, source')
    .eq('source', 'mocation')
    .limit(10);

  if (error) {
    console.error('❌ 查询失败:', error);
    return;
  }

  console.log(`📍 找到 ${places?.length || 0} 个 mocation 地点:\n`);

  for (const place of places || []) {
    console.log(`  - ${place.name} (${place.city})`);
    console.log(`    rating: ${place.rating}, rating_count: ${place.rating_count}`);
    console.log(`    cover_image: ${place.cover_image ? '有' : '无'}`);
    console.log('');
  }

  // 检查 Tokyo 的 Top 20 地点
  console.log('\n📍 Tokyo 的 Top 20 地点（按 rating_count 排序）:\n');
  
  const { data: tokyoPlaces, error: tokyoError } = await supabase
    .from('places')
    .select('id, name, rating, rating_count, source, custom_fields')
    .eq('city', 'Tokyo')
    .order('rating_count', { ascending: false, nullsFirst: false })
    .limit(20);

  if (tokyoError) {
    console.error('❌ 查询 Tokyo 失败:', tokyoError);
    return;
  }

  for (const place of tokyoPlaces || []) {
    const hasStills = place.custom_fields?.stills?.length > 0;
    console.log(`  ${place.rating_count || 0} - ${place.name} (${place.source}) ${hasStills ? '🎬' : ''}`);
  }
}

checkMocationRating().catch(console.error);
