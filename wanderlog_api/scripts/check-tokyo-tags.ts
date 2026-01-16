import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function check() {
  // 获取 Tokyo 所有地点的 ai_tags
  const { data } = await supabase
    .from('places')
    .select('ai_tags')
    .eq('city', 'Tokyo');

  // 统计标签
  const tagCounts: Record<string, number> = {};
  for (const p of data || []) {
    const aiTags = p.ai_tags as any[];
    if (aiTags) {
      for (const tag of aiTags) {
        const en = tag.en || tag;
        if (en) {
          tagCounts[en] = (tagCounts[en] || 0) + 1;
        }
      }
    }
  }

  // 排序并显示
  const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
  console.log('Tokyo tag stats (top 20):');
  for (const [tag, count] of sorted.slice(0, 20)) {
    console.log(`  ${tag}: ${count}`);
  }

  // 检查 Pilgrimage
  console.log('\nPilgrimage count:', tagCounts['Pilgrimage'] || 0);
}

check();
