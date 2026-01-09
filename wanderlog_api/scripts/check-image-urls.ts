/**
 * 检查图片 URL 的实际内容
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  // 查找 Alabama State Capitol
  const { data: place1 } = await supabase
    .from('places')
    .select('id, name, cover_image, images')
    .ilike('name', 'Alabama State Capitol')
    .single();
  
  console.log('\n=== Alabama State Capitol ===');
  console.log('cover_image:', place1?.cover_image);
  console.log('images:', JSON.stringify(place1?.images, null, 2));
  
  // 查找 10 Downing St
  const { data: place2 } = await supabase
    .from('places')
    .select('id, name, cover_image, images')
    .ilike('name', '10 Downing St%')
    .single();
  
  console.log('\n=== 10 Downing St ===');
  console.log('cover_image:', place2?.cover_image);
  console.log('images:', JSON.stringify(place2?.images, null, 2));
}

main().catch(console.error);
