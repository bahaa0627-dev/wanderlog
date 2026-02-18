/**
 * 迁移指定地点的剧照数据到新格式
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

const placeNames = [
  'Bankside',
  'Croftdown Rd',
  'Smith & Wollensky',
  "Lincoln's Inn Fields",
  "the house of fleabag's father",
  'They hang around',
  "Claire's home",
  'Bold Cafe & Restaurant',
  'St Andrew\'s Church, Kingsbury',
  'the bus stop',
  'Westminster Quaker Meeting House',
  'Kensal Green Cemetery',
  'Tate Modern',
  'Hedsor House'
];

interface StillFormat {
  movieId: string;
  movieNameCn: string;
  movieNameEn: string;
  year: string;
  url: string;
  canCompare: boolean;
  isHidden: boolean;
}

async function migrateSpecificPlaces() {
  console.log('🔍 查找并迁移指定地点的剧照数据...\n');
  
  let migrated = 0;
  let skipped = 0;
  
  for (const name of placeNames) {
    const { data: places, error } = await supabase
      .from('places')
      .select('id, name, city, custom_fields')
      .ilike('name', '%' + name + '%')
      .limit(5);
    
    if (error) {
      console.log('❌ 查询失败:', name, error.message);
      continue;
    }
    
    if (!places || places.length === 0) {
      console.log('⚠️ 未找到:', name);
      continue;
    }
    
    for (const place of places) {
      const cf = place.custom_fields as any;
      if (!cf || !cf.stills || cf.stills.length === 0) {
        console.log('📍', place.name, '- 无剧照');
        skipped++;
        continue;
      }
      
      const stills = cf.stills;
      const needsMigration = stills.some((s: any) => 
        typeof s === 'string' || 
        (typeof s === 'object' && (s.canCompare === undefined || s.isHidden === undefined))
      );
      
      if (!needsMigration) {
        console.log('✅', place.name, '- 已是新格式');
        skipped++;
        continue;
      }
      
      // 转换为新格式
      const newStills: StillFormat[] = stills.map((still: any) => {
        if (typeof still === 'string') {
          return {
            movieId: '_unknown_',
            movieNameCn: '',
            movieNameEn: '',
            year: '',
            url: still,
            canCompare: false,
            isHidden: false
          };
        }
        const url = still.url || still.imageUrl || still.image || '';
        return {
          movieId: still.movieId || '_unknown_',
          movieNameCn: still.movieNameCn || '',
          movieNameEn: still.movieNameEn || '',
          year: still.year || '',
          url: url,
          canCompare: still.canCompare ?? false,
          isHidden: still.isHidden ?? false
        };
      }).filter((s: StillFormat) => s.url);
      
      const updatedCf = { ...cf, stills: newStills };
      const { error: updateError } = await supabase
        .from('places')
        .update({ custom_fields: updatedCf })
        .eq('id', place.id);
      
      if (updateError) {
        console.log('❌', place.name, '- 更新失败:', updateError.message);
      } else {
        console.log('✅', place.name, '- 已迁移', stills.length, '张剧照');
        migrated++;
      }
    }
  }
  
  console.log('\n========================================');
  console.log('📊 迁移统计:');
  console.log(`   已迁移: ${migrated}`);
  console.log(`   跳过: ${skipped}`);
  console.log('========================================\n');
}

migrateSpecificPlaces().catch(console.error);
