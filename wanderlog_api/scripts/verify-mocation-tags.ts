/**
 * 验证 Mocation 地点的标签迁移结果
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || 'https://dhyfttcikicrsfqamgfk.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyTags() {
  console.log('\n🔍 验证 Mocation 地点标签...\n');

  const { data, error } = await supabase
    .from('places')
    .select('id, name, source, ai_tags, tags')
    .eq('source', 'mocation')
    .limit(5);

  if (error) {
    console.error('❌ 查询失败:', error);
    return;
  }

  if (!data || data.length === 0) {
    console.log('❌ 没有找到 mocation 来源的地点');
    return;
  }

  console.log(`找到 ${data.length} 个地点:\n`);

  data.forEach((place: any, index: number) => {
    console.log(`${index + 1}. ${place.name}`);
    console.log(`   ID: ${place.id}`);
    console.log(`   Source: ${place.source}`);
    console.log(`   ai_tags: ${JSON.stringify(place.ai_tags, null, 2)}`);
    console.log(`   tags: ${JSON.stringify(place.tags, null, 2)}`);
    console.log('');
  });
}

verifyTags().catch(console.error);
