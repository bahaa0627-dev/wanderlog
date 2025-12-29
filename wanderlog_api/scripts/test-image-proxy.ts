/**
 * Test Image Proxy Download
 */

import { r2ImageService } from '../src/services/r2ImageService';

async function test() {
  const testUrl = 'https://lh3.googleusercontent.com/gps-cs-s/AG0ilSwUdK4Hd8ufK9QaOHJQfq0Cya1dz9um3ixKTpWgws4-xHtDd5KZdz9agcc0QLn8gRfrZ00CBl0dqdFUTTuKbJA4DfNTBgXl53BLgnj7Qv5Br2_B9my4p4xG5I_RgU8ZTJwQWmAK=w408-h725-k-no';
  
  console.log('Testing image download via Cloudflare Worker proxy...');
  console.log('Original URL:', testUrl.substring(0, 80) + '...');
  
  const result = await r2ImageService.downloadImage(testUrl);
  
  if (result.success) {
    console.log('✅ SUCCESS');
    console.log('   Image size:', result.buffer?.length, 'bytes');
    console.log('   Content-Type:', result.contentType);
  } else {
    console.log('❌ FAILED');
    console.log('   Error:', result.error);
  }
  
  process.exit(0);
}

test().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
