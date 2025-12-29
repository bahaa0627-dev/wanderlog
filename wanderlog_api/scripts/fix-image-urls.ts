/**
 * 修复所有图片 URL 为新的 CDN 格式
 * 
 * 新格式: https://img.vago.to/places/cover/v1/{p1}/{p2}/{uuid}.jpg
 * p1 = UUID 前2位, p2 = UUID 第3-4位
 */

import prisma from '../src/config/database';
import { v4 as uuidv4 } from 'uuid';

const IMAGE_CDN_URL = process.env.IMAGE_CDN_URL || 'https://img.vago.to';
const DRY_RUN = process.argv.includes('--dry-run');

function extractUuidFromUrl(url: string): string | null {
  // 尝试从各种格式中提取 UUID
  // 格式1: /places/cover/v1/xx/xx/uuid.jpg
  const v1Match = url.match(/places\/cover\/v1\/[a-f0-9]{2}\/[a-f0-9]{2}\/([a-f0-9-]{36})\.jpg/);
  if (v1Match) return v1Match[1];
  
  // 格式2: /places/uuid/cover.jpg 或 /places/uuid/xxx.jpg
  const oldMatch = url.match(/places\/([a-f0-9-]{36})\/[^\/]+\.jpg/);
  if (oldMatch) return oldMatch[1];
  
  return null;
}

function isGooglePlaceIdFormat(url: string): boolean {
  // 检查是否是 /places/ChIJ.../cover.jpg 格式
  return /places\/ChIJ[^\/]+\/cover\.jpg/.test(url);
}

async function fixImageUrls() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                     FIX IMAGE URLs                                            ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
  
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

  const places = await prisma.place.findMany({
    where: { coverImage: { not: null } }
  });
  
  console.log(`Found ${places.length} places with coverImage\n`);

  let fixed = 0;
  let alreadyCorrect = 0;
  let needsReupload = 0;
  let errors = 0;

  for (const place of places) {
    try {
      const oldUrl = place.coverImage!;
      const customFields = (place.customFields as Record<string, any>) || {};
      
      // 检查是否已经是新格式
      if (oldUrl.startsWith(IMAGE_CDN_URL) && oldUrl.includes('/places/cover/v1/')) {
        alreadyCorrect++;
        continue;
      }
      
      let newUrl: string | null = null;
      let newR2Key: string | null = null;
      
      // 情况1: Worker URL 包含 /places/cover/v1/ (已经是新格式，只需换域名)
      if (oldUrl.includes('workers.dev') && oldUrl.includes('/places/cover/v1/')) {
        const pathMatch = oldUrl.match(/\/places\/cover\/v1\/.+$/);
        if (pathMatch) {
          newR2Key = pathMatch[0].substring(1); // 去掉开头的 /
          newUrl = `${IMAGE_CDN_URL}/${newR2Key}`;
        }
      }
      // 情况2: Worker URL 旧格式 /places/uuid/cover.jpg (UUID 格式)
      else if (oldUrl.includes('workers.dev') && oldUrl.includes('/places/') && !isGooglePlaceIdFormat(oldUrl)) {
        const uuid = extractUuidFromUrl(oldUrl);
        if (uuid) {
          const p1 = uuid.substring(0, 2);
          const p2 = uuid.substring(2, 4);
          newR2Key = `places/cover/v1/${p1}/${p2}/${uuid}.jpg`;
          newUrl = `${IMAGE_CDN_URL}/${newR2Key}`;
        }
      }
      // 情况2.5: Worker URL 旧格式 /places/ChIJ.../cover.jpg (Google Place ID 格式)
      // 这些图片已经在 R2 中，只需要换域名，保持路径不变
      else if (oldUrl.includes('workers.dev') && isGooglePlaceIdFormat(oldUrl)) {
        const pathMatch = oldUrl.match(/\/places\/[^\/]+\/cover\.jpg$/);
        if (pathMatch) {
          newR2Key = pathMatch[0].substring(1); // 去掉开头的 /
          newUrl = `${IMAGE_CDN_URL}/${newR2Key}`;
        }
      }
      // 情况3: 有 r2Key 在 customFields 中
      else if (customFields.r2Key) {
        const r2Key = customFields.r2Key;
        if (r2Key.includes('/places/cover/v1/')) {
          newUrl = `${IMAGE_CDN_URL}/${r2Key}`;
          newR2Key = r2Key;
        } else {
          // 旧格式 r2Key，需要转换
          const uuid = extractUuidFromUrl(r2Key) || uuidv4();
          const p1 = uuid.substring(0, 2);
          const p2 = uuid.substring(2, 4);
          newR2Key = `places/cover/v1/${p1}/${p2}/${uuid}.jpg`;
          newUrl = `${IMAGE_CDN_URL}/${newR2Key}`;
        }
      }
      // 情况4: Google URL 或其他 - 需要重新上传
      else if (oldUrl.includes('googleusercontent.com') || !oldUrl.includes('workers.dev')) {
        // 这些需要重新上传图片，暂时跳过
        needsReupload++;
        console.log(`⏭️  ${place.name}: 需要重新上传 (${oldUrl.substring(0, 60)}...)`);
        continue;
      }
      
      if (newUrl && newUrl !== oldUrl) {
        console.log(`🖼️  ${place.name}:`);
        console.log(`    旧: ${oldUrl.substring(0, 70)}...`);
        console.log(`    新: ${newUrl}`);
        
        if (!DRY_RUN) {
          await prisma.place.update({
            where: { id: place.id },
            data: {
              coverImage: newUrl,
              customFields: {
                ...customFields,
                r2Key: newR2Key
              }
            }
          });
        }
        fixed++;
      }
      
    } catch (error: any) {
      console.error(`❌ Error fixing ${place.name}: ${error.message}`);
      errors++;
    }
  }

  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                           SUMMARY                                             ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
  
  console.log(`已是正确格式: ${alreadyCorrect}`);
  console.log(`已修复: ${fixed}`);
  console.log(`需要重新上传: ${needsReupload}`);
  console.log(`错误: ${errors}`);
  
  if (DRY_RUN) {
    console.log('\n💡 这是 DRY RUN，没有实际修改。');
    console.log('   运行不带 --dry-run 来应用更改。\n');
  }

  await prisma.$disconnect();
}

fixImageUrls().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
