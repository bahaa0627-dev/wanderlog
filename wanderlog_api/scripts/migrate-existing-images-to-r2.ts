/**
 * 迁移现有 Google 图片到 Cloudflare R2
 * 
 * 直接使用数据库中已有的 Google Photos URL 下载图片
 * 不需要额外调用 Google API，零成本！
 * 
 * 使用方法:
 * cd wanderlog_api
 * HTTP_PROXY=http://127.0.0.1:7890 npx tsx scripts/migrate-existing-images-to-r2.ts
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as https from 'https';
import * as dotenv from 'dotenv';
import { URL } from 'url';

dotenv.config();

const supabase: SupabaseClient = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const R2_WORKER_URL = process.env.R2_PUBLIC_URL || 'https://wanderlog-images.blcubahaa0627.workers.dev';
const R2_UPLOAD_SECRET = process.env.R2_UPLOAD_SECRET!;

// 下载图片（支持重定向，不使用代理）
function downloadImage(imageUrl: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Download timeout (30s)'));
    }, 30000);

    const makeRequest = (targetUrl: string, redirectCount = 0) => {
      if (redirectCount > 5) {
        clearTimeout(timeout);
        reject(new Error('Too many redirects'));
        return;
      }

      const parsedUrl = new URL(targetUrl);
      
      const requestOptions = {
        hostname: parsedUrl.hostname,
        port: 443,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      };

      const req = https.request(requestOptions, (res) => {
        // 处理重定向
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303) {
          const redirectUrl = res.headers.location;
          if (redirectUrl) {
            makeRequest(redirectUrl, redirectCount + 1);
            return;
          }
        }

        if (res.statusCode !== 200) {
          clearTimeout(timeout);
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          clearTimeout(timeout);
          const buffer = Buffer.concat(chunks);
          if (buffer.length < 1000) {
            reject(new Error('Image too small, might be error'));
          } else {
            resolve(buffer);
          }
        });
      });

      req.on('error', (e) => {
        clearTimeout(timeout);
        reject(e);
      });

      req.end();
    };

    makeRequest(imageUrl);
  });
}

// 上传到 R2
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
          console.log(` R2上传失败: ${res.statusCode} ${data}`);
          resolve(null);
        }
      });
    });

    req.on('error', (e) => {
      console.log(` R2错误: ${e.message}`);
      resolve(null);
    });

    req.setTimeout(15000, () => {
      req.destroy();
      resolve(null);
    });

    req.write(imageBuffer);
    req.end();
  });
}

async function migrateImages() {
  console.log('🚀 开始迁移现有图片到 R2...\n');
  console.log(`📦 R2: ${R2_WORKER_URL}`);
  console.log(`🔑 Secret: ${R2_UPLOAD_SECRET ? '已配置' : '❌ 未配置'}\n`);

  if (!R2_UPLOAD_SECRET) {
    console.error('❌ 请在 .env 中配置 R2_UPLOAD_SECRET');
    return;
  }

  // 获取所有使用 Google URL 的地点
  const { data: places, error } = await supabase
    .from('places')
    .select('id, name, cover_image, images')
    .like('cover_image', '%maps.googleapis.com%')
    .order('name');

  if (error) {
    console.error('❌ 获取地点失败:', error.message);
    return;
  }

  console.log(`📍 需要迁移: ${places?.length || 0} 个地点\n`);
  console.log('⚠️  这个过程不会调用 Google API，只是下载已有的图片\n');

  let migrated = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const place of places || []) {
    const idx = migrated + failed + 1;
    const shortName = place.name.substring(0, 25).padEnd(25);
    process.stdout.write(`[${idx}/${places?.length}] ${shortName} `);

    if (!place.cover_image) {
      console.log('⏭️  无图片');
      continue;
    }

    try {
      // 下载图片
      const imageBuffer = await downloadImage(place.cover_image);
      
      // 上传到 R2
      const r2Url = await uploadToR2(imageBuffer, `places/${place.id}/cover.jpg`);
      
      if (!r2Url) {
        console.log('❌ 上传失败');
        failed++;
        errors.push(`${place.name}: 上传失败`);
        continue;
      }

      // 更新数据库
      const { error: updateError } = await supabase
        .from('places')
        .update({
          cover_image: r2Url,
          images: [r2Url],
        })
        .eq('id', place.id);

      if (updateError) {
        console.log(`❌ DB错误: ${updateError.message}`);
        failed++;
        errors.push(`${place.name}: ${updateError.message}`);
      } else {
        console.log(`✅ ${(imageBuffer.length / 1024).toFixed(0)}KB`);
        migrated++;
      }
    } catch (e: any) {
      console.log(`❌ ${e.message}`);
      failed++;
      errors.push(`${place.name}: ${e.message}`);
    }

    // 避免请求过快
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ 成功迁移: ${migrated}`);
  console.log(`❌ 失败: ${failed}`);
  
  if (errors.length > 0 && errors.length <= 10) {
    console.log('\n失败详情:');
    errors.forEach(e => console.log(`  - ${e}`));
  }

  console.log('\n💡 迁移完成后，图片 URL 将变为:');
  console.log(`   ${R2_WORKER_URL}/places/{place_id}/cover.jpg`);
}

migrateImages();
