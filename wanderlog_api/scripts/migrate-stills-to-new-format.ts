/**
 * 迁移剧照数据到新格式
 * 
 * 将旧格式（纯字符串 URL 数组）转换为新格式（对象数组，支持 canCompare、isHidden 等属性）
 * 
 * 运行方式:
 *   cd wanderlog_api
 *   npx ts-node scripts/migrate-stills-to-new-format.ts
 *   
 * 或者指定 --dry-run 仅检查不修改:
 *   npx ts-node scripts/migrate-stills-to-new-format.ts --dry-run
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

interface OldStillFormat {
  url?: string;
  imageUrl?: string;
  image?: string;
  movieId?: string;
  movieNameCn?: string;
  movieNameEn?: string;
  year?: string;
  canCompare?: boolean;
  isHidden?: boolean;
}

interface NewStillFormat {
  movieId: string;
  movieNameCn: string;
  movieNameEn: string;
  year: string;
  url: string;
  canCompare: boolean;
  isHidden: boolean;
}

function convertStillToNewFormat(still: string | OldStillFormat): NewStillFormat | null {
  if (typeof still === 'string') {
    // 纯 URL 字符串 -> 新格式对象
    return {
      movieId: '_unknown_',
      movieNameCn: '',
      movieNameEn: '',
      year: '',
      url: still,
      canCompare: false,
      isHidden: false
    };
  } else if (typeof still === 'object' && still !== null) {
    // 已有对象格式，检查是否需要补充字段
    const url = still.url || still.imageUrl || still.image || '';
    if (!url) return null;
    
    return {
      movieId: still.movieId || '_unknown_',
      movieNameCn: still.movieNameCn || '',
      movieNameEn: still.movieNameEn || '',
      year: still.year || '',
      url: url,
      canCompare: still.canCompare ?? false,
      isHidden: still.isHidden ?? false
    };
  }
  return null;
}

function needsMigration(stills: any[]): boolean {
  if (!stills || stills.length === 0) return false;
  
  for (const still of stills) {
    // 如果有纯字符串格式的剧照，需要迁移
    if (typeof still === 'string') {
      return true;
    }
    // 如果对象格式但缺少新字段（canCompare 或 isHidden），也需要迁移
    if (typeof still === 'object' && still !== null) {
      if (still.canCompare === undefined || still.isHidden === undefined) {
        return true;
      }
    }
  }
  return false;
}

async function migrateStillsToNewFormat(dryRun: boolean = false) {
  console.log(`🚀 开始${dryRun ? '检查' : '迁移'}剧照数据到新格式...\n`);
  console.log(`模式: ${dryRun ? '🔍 仅检查（dry-run）' : '✏️ 写入更新'}\n`);

  // 获取所有有 custom_fields 的地点
  let page = 0;
  const pageSize = 100;
  let totalChecked = 0;
  let totalNeedsMigration = 0;
  let totalMigrated = 0;
  let totalFailed = 0;
  let totalStillsConverted = 0;

  while (true) {
    const { data: places, error } = await supabase
      .from('places')
      .select('id, name, city, custom_fields')
      .not('custom_fields', 'is', null)
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('❌ 查询地点失败:', error);
      return;
    }

    if (!places || places.length === 0) {
      break;
    }

    for (const place of places) {
      totalChecked++;
      
      const customFields = place.custom_fields as any;
      if (!customFields || !customFields.stills || !Array.isArray(customFields.stills)) {
        continue;
      }

      const stills = customFields.stills;
      
      if (!needsMigration(stills)) {
        continue;
      }

      totalNeedsMigration++;
      
      // 转换所有剧照到新格式
      const newStills: NewStillFormat[] = [];
      let stillsConverted = 0;
      
      for (const still of stills) {
        const converted = convertStillToNewFormat(still);
        if (converted) {
          newStills.push(converted);
          
          // 检查是否是字符串类型（需要转换的）
          if (typeof still === 'string') {
            stillsConverted++;
          } else if (typeof still === 'object' && (still.canCompare === undefined || still.isHidden === undefined)) {
            stillsConverted++;
          }
        }
      }
      
      if (newStills.length === 0) {
        continue;
      }

      console.log(`📍 ${place.name} (${place.city || '未知城市'})`);
      console.log(`   ID: ${place.id}`);
      console.log(`   原有剧照: ${stills.length}, 需转换: ${stillsConverted}`);
      
      if (dryRun) {
        console.log(`   [dry-run] 将转换为新格式\n`);
        totalStillsConverted += stillsConverted;
        continue;
      }

      // 更新 custom_fields
      const updatedCustomFields = {
        ...customFields,
        stills: newStills
      };

      const { error: updateError } = await supabase
        .from('places')
        .update({ custom_fields: updatedCustomFields })
        .eq('id', place.id);

      if (updateError) {
        console.error(`   ❌ 更新失败: ${updateError.message}\n`);
        totalFailed++;
      } else {
        console.log(`   ✅ 已更新\n`);
        totalMigrated++;
        totalStillsConverted += stillsConverted;
      }
    }

    page++;
    
    // 进度信息
    if (page % 10 === 0) {
      console.log(`... 已检查 ${totalChecked} 个地点 ...`);
    }
  }

  console.log('\n========================================');
  console.log('📊 迁移统计:');
  console.log(`   检查地点数: ${totalChecked}`);
  console.log(`   需要迁移: ${totalNeedsMigration}`);
  if (dryRun) {
    console.log(`   将转换剧照数: ${totalStillsConverted}`);
    console.log('\n💡 运行不带 --dry-run 参数以执行实际迁移');
  } else {
    console.log(`   成功迁移: ${totalMigrated}`);
    console.log(`   失败: ${totalFailed}`);
    console.log(`   已转换剧照数: ${totalStillsConverted}`);
  }
  console.log('========================================\n');
}

// 检查命令行参数
const dryRun = process.argv.includes('--dry-run');

migrateStillsToNewFormat(dryRun).catch(console.error);
