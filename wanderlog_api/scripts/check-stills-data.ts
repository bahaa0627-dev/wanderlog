/**
 * 检查数据库中是否有剧照数据
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkStillsData() {
  console.log('🔍 检查数据库中的剧照数据...\n');

  // 查找 source = 'mocation' 的地点
  const { data: mocationPlaces, error: mocationError } = await supabase
    .from('places')
    .select('id, name, city, source, custom_fields')
    .eq('source', 'mocation')
    .limit(10);

  if (mocationError) {
    console.error('❌ 查询 mocation 地点失败:', mocationError);
    return;
  }

  console.log(`📍 找到 ${mocationPlaces?.length || 0} 个 mocation 地点:\n`);

  if (mocationPlaces && mocationPlaces.length > 0) {
    for (const place of mocationPlaces) {
      console.log(`  - ${place.name} (${place.city})`);
      console.log(`    ID: ${place.id}`);
      
      const customFields = place.custom_fields as any;
      if (customFields) {
        const stills = customFields.stills || [];
        const movies = customFields.movies || [];
        console.log(`    Movies: ${movies.length}`);
        console.log(`    Stills: ${stills.length}`);
        
        if (stills.length > 0) {
          console.log(`    First still: ${JSON.stringify(stills[0])}`);
        }
      } else {
        console.log(`    custom_fields: null`);
      }
      console.log('');
    }
  }

  // 查找任何有 custom_fields.stills 的地点
  const { data: stillsPlaces, error: stillsError } = await supabase
    .from('places')
    .select('id, name, city, source, custom_fields')
    .not('custom_fields', 'is', null)
    .limit(20);

  if (stillsError) {
    console.error('❌ 查询 custom_fields 失败:', stillsError);
    return;
  }

  const placesWithStills = stillsPlaces?.filter(p => {
    const cf = p.custom_fields as any;
    return cf && cf.stills && cf.stills.length > 0;
  }) || [];

  console.log(`\n📸 找到 ${placesWithStills.length} 个有剧照数据的地点:\n`);

  for (const place of placesWithStills.slice(0, 5)) {
    console.log(`  - ${place.name} (${place.city})`);
    console.log(`    ID: ${place.id}`);
    console.log(`    Source: ${place.source}`);
    
    const customFields = place.custom_fields as any;
    const stills = customFields.stills || [];
    console.log(`    Stills count: ${stills.length}`);
    console.log('');
  }
}

checkStillsData().catch(console.error);
