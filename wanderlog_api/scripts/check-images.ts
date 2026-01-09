import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function checkImages() {
  // 查找 Alabama State Capitol 的两条记录
  const { data: wikidata } = await supabase
    .from('places')
    .select('id, name, cover_image, images')
    .eq('source', 'wikidata')
    .ilike('name', 'Alabama State Capitol')
    .single();

  const { data: apify } = await supabase
    .from('places')
    .select('id, name, cover_image, images')
    .eq('source', 'apify_google_places')
    .ilike('name', 'Alabama State Capitol')
    .single();

  console.log('📋 Alabama State Capitol 图片数据:\n');
  
  console.log('Wikidata:');
  console.log('  cover_image:', wikidata?.cover_image);
  console.log('  images:', JSON.stringify(wikidata?.images, null, 2));
  
  console.log('\nApify:');
  console.log('  cover_image:', apify?.cover_image);
  console.log('  images:', JSON.stringify(apify?.images, null, 2));

  // 检查是否相同
  if (wikidata?.cover_image && apify?.cover_image) {
    console.log('\n🔍 cover_image 是否相同:', wikidata.cover_image === apify.cover_image);
  }
}

checkImages();
