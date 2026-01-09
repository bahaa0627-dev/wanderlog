import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function check() {
  // 检查 Alabama State Capitol
  const { data: alabama } = await supabase
    .from('places')
    .select('id, name, cover_image, images, source')
    .ilike('name', '%Alabama State Capitol%');
  
  console.log('Alabama State Capitol:');
  console.log(JSON.stringify(alabama, null, 2));

  // 检查 10 Downing Street
  const { data: downing } = await supabase
    .from('places')
    .select('id, name, source')
    .ilike('name', '%Downing%');
  
  console.log('\n10 Downing Street 相关:');
  console.log(JSON.stringify(downing, null, 2));
}

check();
