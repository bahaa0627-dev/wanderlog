import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function check() {
  const { data } = await supabase
    .from('places')
    .select('id, name, rating_count, source, custom_fields, cover_image')
    .ilike('name', '%Yoyogi%')
    .limit(10);

  console.log('Yoyogi places:');
  for (const p of data || []) {
    const stillsCount = (p.custom_fields as any)?.stills?.length || 0;
    console.log(`- ${p.name}`);
    console.log(`  rating_count: ${p.rating_count}, stills: ${stillsCount}, cover: ${p.cover_image ? 'yes' : 'no'}`);
  }
}

check();
