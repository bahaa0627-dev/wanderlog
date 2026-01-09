import { createClient } from '@supabase/supabase-js';
import * as https from 'https';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function checkUrl(url: string): Promise<{status: number, ok: boolean}> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ status: 0, ok: false });
    }, 10000);

    try {
      https.get(url, (res) => {
        clearTimeout(timeout);
        resolve({ status: res.statusCode || 0, ok: res.statusCode === 200 });
      }).on('error', () => {
        clearTimeout(timeout);
        resolve({ status: 0, ok: false });
      });
    } catch {
      clearTimeout(timeout);
      resolve({ status: 0, ok: false });
    }
  });
}

async function check() {
  // 检查 Alabama State Capitol
  const { data: alabama } = await supabase
    .from('places')
    .select('id, name, cover_image, images')
    .ilike('name', 'Alabama State Capitol')
    .eq('source', 'apify_google_places')
    .single();

  console.log('📋 Alabama State Capitol:');
  console.log('  cover_image:', alabama?.cover_image);
  
  if (alabama?.cover_image) {
    const coverCheck = await checkUrl(alabama.cover_image);
    console.log('  cover_image 可访问:', coverCheck.ok ? '✅' : '❌', `(HTTP ${coverCheck.status})`);
  }

  console.log('  images:', JSON.stringify(alabama?.images, null, 2));
  
  if (alabama?.images) {
    for (let i = 0; i < alabama.images.length; i++) {
      const img = alabama.images[i];
      const url = typeof img === 'string' ? img : img?.url;
      if (url) {
        const imgCheck = await checkUrl(url);
        console.log(`  images[${i}] 可访问:`, imgCheck.ok ? '✅' : '❌', `(HTTP ${imgCheck.status})`);
      }
    }
  }

  // 检查 10 Downing Street
  const { data: downing } = await supabase
    .from('places')
    .select('id, name, cover_image, images')
    .ilike('name', '%Downing%')
    .single();

  console.log('\n📋 10 Downing Street:');
  console.log('  cover_image:', downing?.cover_image);
  
  if (downing?.cover_image) {
    const coverCheck = await checkUrl(downing.cover_image);
    console.log('  cover_image 可访问:', coverCheck.ok ? '✅' : '❌', `(HTTP ${coverCheck.status})`);
  }

  console.log('  images:', JSON.stringify(downing?.images, null, 2));
  
  if (downing?.images) {
    for (let i = 0; i < downing.images.length; i++) {
      const img = downing.images[i];
      const url = typeof img === 'string' ? img : img?.url;
      if (url) {
        const imgCheck = await checkUrl(url);
        console.log(`  images[${i}] 可访问:`, imgCheck.ok ? '✅' : '❌', `(HTTP ${imgCheck.status})`);
      }
    }
  }
}

check();
