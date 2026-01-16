import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function check() {
  const { data } = await supabase
    .from('places')
    .select('id, name, rating_count, source, custom_fields, cover_image')
    .eq('city', 'Tokyo')
    .order('rating_count', { ascending: false, nullsFirst: false })
    .limit(50);

  console.log('Tokyo Top 50:');
  let rank = 0;
  for (const p of data || []) {
    rank++;
    const stillsCount = (p.custom_fields as any)?.stills?.length || 0;
    const marker = stillsCount > 0 ? ` 🎬 ${stillsCount} stills` : '';
    console.log(`#${rank} - ${p.name} (${p.rating_count})${marker}`);
  }
}

check();
