/**
 * 迁移 Mocation 地点的 Pilgrimage 标签
 * 
 * 将 source='mocation' 的地点中的 Pilgrimage 标签从 ai_tags 移动到 tags.others
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || 'https://dhyfttcikicrsfqamgfk.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';

if (!supabaseKey) {
  console.error('❌ SUPABASE_KEY not found in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface AiTag {
  en: string;
  id: string;
  zh: string;
  kind: string;
  priority: number;
}

interface Place {
  id: string;
  name: string;
  source: string;
  ai_tags: AiTag[] | null;
  tags: Record<string, any> | null;
}

async function migratePilgrimageTags() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║           迁移 Mocation Pilgrimage 标签: aiTags → tags.others                ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  // 1. 查询所有 source='mocation' 且 ai_tags 包含 Pilgrimage 的地点
  console.log('🔍 查询需要迁移的地点...\n');
  
  const { data: places, error } = await supabase
    .from('places')
    .select('id, name, source, ai_tags, tags')
    .eq('source', 'mocation')
    .not('ai_tags', 'is', null);

  if (error) {
    console.error('❌ 查询失败:', error);
    return;
  }

  if (!places || places.length === 0) {
    console.log('✅ 没有找到需要迁移的地点');
    return;
  }

  console.log(`📊 找到 ${places.length} 个 mocation 来源的地点\n`);

  // 2. 筛选出包含 Pilgrimage 标签的地点
  const placesWithPilgrimage = places.filter((place: Place) => {
    if (!place.ai_tags || !Array.isArray(place.ai_tags)) return false;
    return place.ai_tags.some((tag: AiTag) => 
      tag.id === 'Pilgrimage' || tag.en === 'Pilgrimage'
    );
  });

  console.log(`🎯 其中 ${placesWithPilgrimage.length} 个地点包含 Pilgrimage 标签\n`);

  if (placesWithPilgrimage.length === 0) {
    console.log('✅ 没有需要迁移的地点');
    return;
  }

  // 3. 显示前5个示例
  console.log('📋 示例地点:');
  placesWithPilgrimage.slice(0, 5).forEach((place: Place, index: number) => {
    console.log(`  ${index + 1}. ${place.name} (${place.id})`);
    console.log(`     当前 ai_tags: ${JSON.stringify(place.ai_tags)}`);
    console.log(`     当前 tags: ${JSON.stringify(place.tags)}`);
  });
  console.log('');

  // 4. 批量更新
  console.log('🔄 开始批量更新...\n');
  
  let successCount = 0;
  let errorCount = 0;
  const errors: Array<{ id: string; name: string; error: any }> = [];

  for (const place of placesWithPilgrimage) {
    try {
      // 移除 ai_tags 中的 Pilgrimage
      const newAiTags = (place.ai_tags || []).filter((tag: AiTag) => 
        tag.id !== 'Pilgrimage' && tag.en !== 'Pilgrimage'
      );

      // 构建新的 tags 对象
      const currentTags = place.tags || {};
      const newTags = {
        ...currentTags,
        others: ['Pilgrimage'] // 添加到 others 数组
      };

      // 更新数据库
      const { error: updateError } = await supabase
        .from('places')
        .update({
          ai_tags: newAiTags.length > 0 ? newAiTags : null,
          tags: newTags
        })
        .eq('id', place.id);

      if (updateError) {
        errorCount++;
        errors.push({ id: place.id, name: place.name, error: updateError });
        console.log(`  ❌ ${place.name}: ${updateError.message}`);
      } else {
        successCount++;
        console.log(`  ✅ ${place.name}`);
      }
    } catch (err) {
      errorCount++;
      errors.push({ id: place.id, name: place.name, error: err });
      console.log(`  ❌ ${place.name}: ${err}`);
    }
  }

  // 5. 显示结果
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                              迁移完成                                         ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
  console.log(`✅ 成功: ${successCount} 个地点`);
  console.log(`❌ 失败: ${errorCount} 个地点\n`);

  if (errors.length > 0) {
    console.log('❌ 错误详情:');
    errors.forEach(({ id, name, error }) => {
      console.log(`  - ${name} (${id}): ${error.message || error}`);
    });
  }

  // 6. 验证结果
  console.log('\n🔍 验证迁移结果...\n');
  
  const { data: verifyData, error: verifyError } = await supabase
    .from('places')
    .select('id, name, ai_tags, tags')
    .eq('source', 'mocation')
    .limit(3);

  if (!verifyError && verifyData) {
    console.log('📋 迁移后的示例数据:');
    verifyData.forEach((place: Place, index: number) => {
      console.log(`  ${index + 1}. ${place.name}`);
      console.log(`     ai_tags: ${JSON.stringify(place.ai_tags)}`);
      console.log(`     tags: ${JSON.stringify(place.tags)}`);
    });
  }

  console.log('\n✅ 迁移完成！\n');
}

// 运行迁移
migratePilgrimageTags().catch(console.error);
