import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function check() {
  // 检查有剧照的地点的 ai_tags
  const { data } = await supabase
    .from('places')
    .select('name, ai_tags, source')
    .eq('source', 'mocation')
    .limit(5);

  console.log('Mocation places ai_tags:');
  for (const p of data || []) {
    console.log(p.name);
    console.log('  ai_tags:', JSON.stringify(p.ai_tags));
    console.log('');
  }

  // 检查 Tokyo 的 Pilgrimage 标签地点数量
  const { data: pilgrimageData, count } = await supabase
    .from('places')
    .select('name', { count: 'exact' })
    .eq('city', 'Tokyo')
    .contains('ai_tags', [{ en: 'Pilgrimage' }])
    .limit(10);

  console.log('Tokyo Pilgrimage places count:', count);
  console.log('Sample:');
  for (const p of pilgrimageData || []) {
    console.log('  -', p.name);
  }
}

check();
