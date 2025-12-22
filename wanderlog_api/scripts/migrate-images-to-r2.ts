/**
 * 迁移图片到 Cloudflare R2
 * 下载 Google Places 图片并上传到 R2，更新数据库 URL
 * 
 * 使用方法:
 * cd wanderlog_api && npx ts-node scripts/migrate-images-to-r2.ts
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as https from 'https';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase: SupabaseClient = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const R2_WORKER_URL = process.env.R2_PUBLIC_URL || 'https://wanderlog-images.blcubahaa0627.workers.dev';
const R2_UPLOAD_SECRET = process.env.R2_UPLOAD_SECRET!;
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY || 'AIzaSyAFrsDUcA9JqNDT52646JKwGPBu5BdvyW0';

// 使用 https 模块发请求
function httpsGet(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Request timeout'));
    }, 20000);

    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        clearTimeout(timeout);
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON'));
        }
      });
    }).on('error', (e) => {
      clearTimeout(timeout);
      reject(e);
    });
  });
}

// 下载图片为 Buffer
function downloadImage(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Download timeout'));
    }, 30000);

    const request = (targetUrl: string) => {
      https.get(targetUrl, (res) => {
        // 处理重定向
        if (res.statusCode === 302 || res.statusCode === 301) {
          const redirectUrl = res.headers.location;
          if (redirectUrl) {
            request(redirectUrl);
            return;
          }
        }

        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          clearTimeout(timeout);
          resolve(Buffer.concat(chunks));
        });
      }).on('error', (e) => {
        clearTimeout(timeout);
        reject(e);
      });
    };

    request(url);
  });
}

async function searchPlace(name: string): Promise<string | null> {
  const query = encodeURIComponent(name);
  const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${query}&inputtype=textquery&fields=place_id&key=${GOOGLE_API_KEY}`;
  
  try {
    const data = await httpsGet(url);
    
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.log(` API错误: ${data.status}`);
    }
    
    return data.candidates?.[0]?.place_id || null;
  } catch (e: any) {
    console.log(` 搜索失败: ${e.message}`);
    return null;
  }
}

async function getPlacePhotoRefs(placeId: string): Promise<string[]> {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos&key=${GOOGLE_API_KEY}`;
  
  try {
    const data = await httpsGet(url);
    return data.result?.photos?.slice(0, 5).map((p: any) => p.photo_reference) || [];
  } catch (e) {
    return [];
  }
}

async function uploadToR2(imageBuffer: Buffer, path: string): Promise<string | null> {
  return new Promise((resolve) => {
    const url = new URL(`${R2_WORKER_URL}/${path}`);
    
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${R2_UPLOAD_SECRET}`,
        'Content-Type': 'image/jpeg',
        'Content-Length': imageBuffer.length,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(`${R2_WORKER_URL}/${path}`);
        } else {
          console.log(` R2上传失败: ${res.statusCode}`);
          resolve(null);
        }
      });
    });

    req.on('error', (e) => {
      console.log(` R2错误: ${e.message}`);
      resolve(null);
    });

    req.write(imageBuffer);
    req.end();
  });
}

async function migrateImages() {
  console.log('🚀 开始迁移图片到 R2...\n');
  console.log(`📦 R2: ${R2_WORKER_URL}`);
  console.log(`🔑 Secret: ${R2_UPLOAD_SECRET ? '已配置' : '❌ 未配置'}\n`);

  if (!R2_UPLOAD_SECRET) {
    console.error('❌ 请在 .env 中配置 R2_UPLOAD_SECRET');
    return;
  }

  // 获取所有地点
  const { data: places, error } = await supabase
    .from('places')
    .select('id, name, city, cover_image, google_place_id')
    .order('name');

  if (error) {
    console.error('❌ 获取地点失败:', error.message);
    return;
  }

  console.log(`📍 共 ${places?.length || 0} 个地点\n`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const place of places || []) {
    const idx = migrated + skipped + failed + 1;
    process.stdout.write(`[${idx}/${places?.length}] ${place.name.substring(0, 20)}... `);

    // 已迁移到 R2，跳过
    if (place.cover_image?.includes(R2_WORKER_URL)) {
      console.log('跳过');
      skipped++;
      continue;
    }

    // 搜索 Place ID
    let placeId = place.google_place_id;
    if (!placeId) {
      placeId = await searchPlace(place.name);
      if (!placeId) {
        console.log('❌ 无Place ID');
        failed++;
        continue;
      }
    }

    // 获取图片引用
    const photoRefs = await getPlacePhotoRefs(placeId);
    if (photoRefs.length === 0) {
      console.log('❌ 无图片');
      failed++;
      continue;
    }

    // 下载并上传第一张图片
    const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photoRefs[0]}&key=${GOOGLE_API_KEY}`;
    
    try {
      const imageBuffer = await downloadImage(photoUrl);
      const r2Url = await uploadToR2(imageBuffer, `places/${place.id}/cover.jpg`);
      
      if (!r2Url) {
        console.log('❌ 上传失败');
        failed++;
        continue;
      }

      // 更新数据库
      const { error: updateError } = await supabase
        .from('places')
        .update({
          cover_image: r2Url,
          images: [r2Url],
          google_place_id: placeId,
        })
        .eq('id', place.id);

      if (updateError) {
        console.log(`❌ DB错误`);
        failed++;
      } else {
        console.log(`✅`);
        migrated++;
      }
    } catch (e: any) {
      console.log(`❌ ${e.message}`);
      failed++;
    }

    // 避免 API 限制
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n${'='.repeat(40)}`);
  console.log(`✅ 成功: ${migrated}`);
  console.log(`⏭️  跳过: ${skipped}`);
  console.log(`❌ 失败: ${failed}`);
}

migrateImages();
