/**
 * 检查已合并记录的完整数据
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function checkImageUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

async function checkPlace(name: string) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📍 ${name}`);
  console.log('='.repeat(80));
  
  const { data: place, error } = await supabase
    .from('places')
    .select('*')
    .ilike('name', `%${name}%`)
    .single();
  
  if (error || !place) {
    console.log(`❌ 找不到记录`);
    return;
  }
  
  console.log(`ID: ${place.id}`);
  console.log(`Source: ${place.source}`);
  console.log(`Google Place ID: ${place.google_place_id || 'null'}`);
  console.log(`Rating: ${place.rating || 'null'}`);
  console.log(`\n📷 Cover Image:`);
  if (place.cover_image) {
    const isValid = await checkImageUrl(place.cover_image);
    console.log(`   ${isValid ? '✅' : '❌'} ${place.cover_image}`);
  } else {
    console.log(`   (无)`);
  }
  
  console.log(`\n🖼️ Images:`);
  if (place.images && Array.isArray(place.images)) {
    for (let i = 0; i < place.images.length; i++) {
      const img = place.images[i];
      const url = typeof img === 'string' ? img : img?.url;
      if (url) {
        const isValid = await checkImageUrl(url);
        console.log(`   [${i + 1}] ${isValid ? '✅' : '❌'} ${url.substring(0, 70)}...`);
      }
    }
  } else {
    console.log(`   (无)`);
  }
  
  console.log(`\n🏷️ Tags:`);
  console.log(`   ${JSON.stringify(place.tags, null, 2)}`);
  
  console.log(`\n📋 Custom Fields:`);
  console.log(`   ${JSON.stringify(place.custom_fields, null, 2)}`);
  
  console.log(`\n📝 Source Detail: ${place.source_detail || 'null'}`);
}

async function main() {
  await checkPlace('Alabama State Capitol');
  await checkPlace('10 Downing St');
}

main().catch(console.error);
