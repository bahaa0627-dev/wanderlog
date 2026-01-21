/**
 * 迁移外部图片到自托管存储
 * 
 * 遍历数据库中所有地点，找出封面图片不是来自 img.vago.to 或 wanderlog-images 的记录，
 * 下载这些图片并上传到 R2，然后更新数据库。
 * 
 * 使用方法:
 *   npx tsx scripts/migrate-external-images.ts [--dry-run] [--limit=100] [--wiki-only]
 * 
 * 参数:
 *   --dry-run    只检查，不实际迁移
 *   --limit=N    限制处理的数量（默认无限制）
 *   --wiki-only  只处理 Wikimedia 图片（更可靠）
 *   --delay=N    每个图片之间的延迟毫秒数（默认 5000）
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import { R2ImageService } from '../src/services/r2ImageService';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

const prisma = new PrismaClient();
const r2Service = new R2ImageService();

// 解析命令行参数
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const wikiOnly = args.includes('--wiki-only');
const limitArg = args.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined;
const delayArg = args.find(arg => arg.startsWith('--delay='));
const delay = delayArg ? parseInt(delayArg.split('=')[1], 10) : 5000;

// 自托管图片域名
const HOSTED_DOMAINS = ['img.vago.to', 'wanderlog-images'];

// Wikimedia 域名
const WIKI_DOMAINS = ['wikimedia.org', 'wikipedia.org'];

/**
 * 下载图片，带重试和 429 处理
 */
async function downloadImageWithRetry(imageUrl: string, maxRetries = 5): Promise<Buffer | null> {
  for (let retry = 0; retry < maxRetries; retry++) {
    try {
      const buffer = await downloadImage(imageUrl);
      if (buffer) return buffer;
    } catch (e: any) {
      if (e.message?.includes('429')) {
        // 被限流，等待更长时间再重试
        const waitTime = Math.pow(2, retry + 1) * 5000; // 10s, 20s, 40s, 80s, 160s
        console.log(`\n   ⏳ 被限流，等待 ${waitTime / 1000}s 后重试 (${retry + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      throw e;
    }
  }
  return null;
}

/**
 * 下载图片
 */
function downloadImage(imageUrl: string): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const makeRequest = (url: string, redirectCount = 0) => {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'));
        return;
      }

      try {
        const parsedUrl = new URL(url);
        const isHttps = parsedUrl.protocol === 'https:';
        const httpModule = isHttps ? https : http;

        const options = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (isHttps ? 443 : 80),
          path: parsedUrl.pathname + parsedUrl.search,
          method: 'GET',
          headers: {
            'User-Agent': 'VagoBot/1.0 (https://vago.to; contact@vago.to)',
            'Accept': 'image/*,*/*',
          },
          timeout: 30000,
        };

        const req = httpModule.request(options, (res) => {
          // 处理重定向
          if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 || res.statusCode === 307) {
            const redirectUrl = res.headers.location;
            if (redirectUrl) {
              const absoluteUrl = redirectUrl.startsWith('http')
                ? redirectUrl
                : `${parsedUrl.protocol}//${parsedUrl.host}${redirectUrl}`;
              makeRequest(absoluteUrl, redirectCount + 1);
              return;
            }
          }

          if (res.statusCode === 429) {
            reject(new Error('HTTP 429 - Rate limited'));
            return;
          }

          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }

          const chunks: Buffer[] = [];
          res.on('data', chunk => chunks.push(chunk));
          res.on('end', () => {
            const buffer = Buffer.concat(chunks);
            if (buffer.length < 1000) {
              reject(new Error('Image too small'));
              return;
            }
            resolve(buffer);
          });
        });

        req.on('error', e => reject(e));
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Timeout'));
        });
        req.end();
      } catch (e) {
        reject(e);
      }
    };

    makeRequest(imageUrl);
  });
}

/**
 * 迁移单个地点的图片
 */
async function migrateImage(place: { id: string; name: string; coverImage: string | null }): Promise<{
  success: boolean;
  oldUrl: string | null;
  newUrl?: string;
  error?: string;
}> {
  if (!place.coverImage) {
    return { success: false, oldUrl: null, error: 'No cover image' };
  }

  const oldUrl = place.coverImage;

  try {
    // 使用自定义下载函数（带 429 重试）
    const buffer = await downloadImageWithRetry(oldUrl);
    if (!buffer) {
      return { success: false, oldUrl, error: 'Download failed after retries' };
    }

    // 处理图片
    const processResult = await r2Service.processImage(buffer);
    if (!processResult.success || !processResult.buffer) {
      return { success: false, oldUrl, error: processResult.error || 'Processing failed' };
    }

    // 生成 R2 key 并上传
    const r2Key = r2Service.generateR2Key();
    const uploadResult = await r2Service.uploadToR2(processResult.buffer, r2Key);
    
    if (!uploadResult.success || !uploadResult.publicUrl) {
      return { success: false, oldUrl, error: uploadResult.error || 'Upload failed' };
    }

    // 更新数据库
    await prisma.place.update({
      where: { id: place.id },
      data: { coverImage: uploadResult.publicUrl },
    });

    return { success: true, oldUrl, newUrl: uploadResult.publicUrl };
  } catch (e: any) {
    return { success: false, oldUrl, error: e.message };
  }
}

async function main() {
  console.log('🔍 查找需要迁移图片的地点...\n');
  
  if (isDryRun) {
    console.log('📋 DRY RUN 模式 - 只检查，不实际迁移\n');
  }
  if (wikiOnly) {
    console.log('🌐 只处理 Wikimedia 图片\n');
  }
  console.log(`⏱️  延迟: ${delay}ms\n`);

  // 构建查询条件
  const whereConditions: any[] = [
    { coverImage: { not: null } },
    { NOT: { coverImage: '' } },
    // 排除已经是自托管的图片
    {
      NOT: {
        OR: HOSTED_DOMAINS.map(domain => ({
          coverImage: { contains: domain }
        }))
      }
    }
  ];

  // 如果只处理 Wiki 图片
  if (wikiOnly) {
    whereConditions.push({
      OR: WIKI_DOMAINS.map(domain => ({
        coverImage: { contains: domain }
      }))
    });
  }

  // 查找所有 coverImage 不是自托管的地点
  const places = await prisma.place.findMany({
    where: { AND: whereConditions },
    select: {
      id: true,
      name: true,
      coverImage: true,
      city: true,
      country: true,
    },
    take: limit,
    orderBy: { ratingCount: 'desc' },
  });

  console.log(`📊 找到 ${places.length} 个需要迁移图片的地点\n`);

  if (places.length === 0) {
    console.log('✅ 所有图片都已迁移！');
    return;
  }

  // 显示前几个示例
  console.log('📝 示例地点:');
  places.slice(0, 5).forEach((p, i) => {
    console.log(`   ${i + 1}. ${p.name} (${p.city}, ${p.country})`);
    console.log(`      URL: ${p.coverImage?.substring(0, 80)}...`);
  });
  console.log('');

  if (isDryRun) {
    console.log('📋 DRY RUN 完成');
    console.log(`   总计: ${places.length} 个地点需要迁移`);
    return;
  }

  // 开始迁移
  console.log('🚀 开始迁移图片...\n');
  
  let successCount = 0;
  let failCount = 0;
  const errors: { name: string; error: string }[] = [];

  for (let i = 0; i < places.length; i++) {
    const place = places[i];
    const progress = `[${i + 1}/${places.length}]`;
    
    process.stdout.write(`${progress} ${place.name.substring(0, 40).padEnd(40)} `);
    
    const result = await migrateImage(place);
    
    if (result.success) {
      console.log('✅');
      successCount++;
    } else {
      console.log(`❌ ${result.error}`);
      failCount++;
      errors.push({ name: place.name, error: result.error || 'Unknown error' });
    }

    // 添加延迟，避免限流
    if (i < places.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // 输出总结
  console.log('\n' + '='.repeat(60));
  console.log('📊 迁移完成统计:');
  console.log(`   ✅ 成功: ${successCount}`);
  console.log(`   ❌ 失败: ${failCount}`);
  console.log('='.repeat(60));

  if (errors.length > 0 && errors.length <= 20) {
    console.log('\n❌ 失败详情:');
    errors.forEach((e, i) => {
      console.log(`   ${i + 1}. ${e.name}: ${e.error}`);
    });
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
