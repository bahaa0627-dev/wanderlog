/**
 * Fix All Data Issues Script
 * 
 * 修复以下问题：
 * 1. 合并 category 和 categorySlug，确保所有数据都有 category_slug/category_en/category_zh
 * 2. 更新所有图片 URL 为新格式 (https://img.vago.to/places/cover/v1/...)
 * 3. 从 JSON 数据提取 price_level 写入数据库
 * 4. 有 google_place_id 的地点 is_verified 设为 true
 * 5. 检测 feminism 标签并写入 tags 和 ai_tags
 * 
 * Usage:
 *   npx ts-node scripts/fix-all-data-issues.ts [--dry-run]
 */

import prisma from '../src/config/database';
import { CATEGORY_DISPLAY_NAMES, CATEGORY_ZH_NAMES } from '../src/constants/categories';
import { aiTagsGeneratorService, StructuredTags } from '../src/services/aiTagsGeneratorService';

const DRY_RUN = process.argv.includes('--dry-run');
const IMAGE_CDN_URL = process.env.IMAGE_CDN_URL || 'https://img.vago.to';

// 旧 category 到 categorySlug 的映射
const CATEGORY_TO_SLUG: Record<string, string> = {
  'Museum': 'museum',
  'Art Gallery': 'art_gallery',
  'Cafe': 'cafe',
  'Coffee Shop': 'cafe',
  'Restaurant': 'restaurant',
  'Bakery': 'bakery',
  'Bar': 'bar',
  'Hotel': 'hotel',
  'Bookstore': 'bookstore',
  'Library': 'library',
  'Church': 'church',
  'Park': 'park',
  'Landmark': 'landmark',
  'Shop': 'shop',
  'Thrift Store': 'thrift_store',
  'Yarn Store': 'yarn_store',
  'Market': 'market',
  'Cemetery': 'cemetery',
  'Castle': 'castle',
  'Theater': 'theater',
  'Cinema': 'cinema',
  'Concert Hall': 'concert_hall',
  'Stadium': 'stadium',
  'Zoo': 'zoo',
  'Aquarium': 'aquarium',
  'Amusement Park': 'amusement_park',
  'Shopping Mall': 'shopping_mall',
};

async function fixAllDataIssues() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                     FIX ALL DATA ISSUES                                       ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
  
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

  const places = await prisma.place.findMany();
  console.log(`Found ${places.length} places to process\n`);

  let fixedCategory = 0;
  let fixedImages = 0;
  let fixedPriceLevel = 0;
  let fixedVerified = 0;
  let fixedFeminism = 0;
  let errors = 0;

  for (const place of places) {
    try {
      const updates: Record<string, any> = {};
      const customFields = (place.customFields as Record<string, any>) || {};
      let currentTags = (place.tags as StructuredTags) || {};
      let tagsUpdated = false;

      // ========================================
      // 1. 合并 category 和 categorySlug
      // ========================================
      if (!place.categorySlug && place.category) {
        const slug = CATEGORY_TO_SLUG[place.category] || place.category.toLowerCase().replace(/\s+/g, '_');
        updates.categorySlug = slug;
        updates.categoryEn = CATEGORY_DISPLAY_NAMES[slug] || place.category;
        updates.categoryZh = CATEGORY_ZH_NAMES[slug] || place.category;
        fixedCategory++;
        console.log(`📂 ${place.name}: category "${place.category}" → slug "${slug}"`);
      } else if (place.categorySlug && (!place.categoryEn || !place.categoryZh)) {
        // 有 slug 但缺少展示名
        updates.categoryEn = CATEGORY_DISPLAY_NAMES[place.categorySlug] || place.categorySlug;
        updates.categoryZh = CATEGORY_ZH_NAMES[place.categorySlug] || place.categorySlug;
        fixedCategory++;
        console.log(`📂 ${place.name}: 补充 categoryEn/categoryZh`);
      }

      // ========================================
      // 2. 更新图片 URL 格式
      // ========================================
      if (place.coverImage) {
        const oldUrl = place.coverImage;
        let newUrl = oldUrl;
        
        // 检查是否是旧格式 (包含 ChIJ 或不是新格式)
        if (oldUrl.includes('/places/ChIJ') || 
            (oldUrl.includes('workers.dev') && !oldUrl.includes('/places/cover/v1/'))) {
          // 提取 r2Key 或生成新的
          const r2Key = customFields.r2Key;
          if (r2Key && r2Key.includes('/places/cover/v1/')) {
            newUrl = `${IMAGE_CDN_URL}/${r2Key}`;
          }
        } else if (oldUrl.startsWith('https://wanderlog-images.') && oldUrl.includes('/places/cover/v1/')) {
          // 替换 Worker URL 为 CDN URL
          newUrl = oldUrl.replace(/https:\/\/wanderlog-images\.[^\/]+/, IMAGE_CDN_URL);
        }
        
        if (newUrl !== oldUrl) {
          updates.coverImage = newUrl;
          fixedImages++;
          console.log(`🖼️  ${place.name}: 更新图片 URL`);
        }
      }

      // ========================================
      // 3. 提取 price_level
      // ========================================
      if (place.priceLevel === null) {
        // 从 customFields.priceText 解析
        const priceText = customFields.priceText as string | undefined;
        if (priceText) {
          // 根据价格范围判断 price_level (1-4)
          // €1–10 = 1, €10–20 = 2, €20–30 = 3, €30+ = 4
          let priceLevel = 1;
          if (priceText.includes('30') || priceText.includes('40') || priceText.includes('50')) {
            priceLevel = 4;
          } else if (priceText.includes('20')) {
            priceLevel = 3;
          } else if (priceText.includes('10') && !priceText.startsWith('€1–')) {
            priceLevel = 2;
          }
          
          updates.priceLevel = priceLevel;
          fixedPriceLevel++;
          console.log(`💰 ${place.name}: priceText "${priceText}" → priceLevel ${priceLevel}`);
        }
      }

      // ========================================
      // 4. 设置 is_verified
      // ========================================
      if (place.googlePlaceId && !place.isVerified) {
        updates.isVerified = true;
        fixedVerified++;
        console.log(`✅ ${place.name}: 设置 isVerified = true`);
      }

      // ========================================
      // 5. 检测 feminism 标签
      // ========================================
      const searchString = customFields.searchString as string | undefined;
      const sourceDetails = place.sourceDetails as Record<string, any> | undefined;
      const apifySearchString = sourceDetails?.apify?.searchString as string | undefined;
      
      const hasFeminismSignal = 
        (searchString && /feminist|feminism|women/i.test(searchString)) ||
        (apifySearchString && /feminist|feminism|women/i.test(apifySearchString)) ||
        (place.name && /feminist|women/i.test(place.name));
      
      if (hasFeminismSignal) {
        // 检查是否已有 feminism 标签
        const hasThemeFeminism = currentTags.theme?.includes('feminism');
        
        if (!hasThemeFeminism) {
          if (!currentTags.theme) currentTags.theme = [];
          currentTags.theme.push('feminism');
          tagsUpdated = true;
          fixedFeminism++;
          console.log(`🏳️ ${place.name}: 添加 theme:feminism 标签`);
        }
      }

      // 如果 tags 更新了，重新生成 ai_tags
      if (tagsUpdated) {
        updates.tags = currentTags;
        
        const categorySlug = updates.categorySlug || place.categorySlug || 'shop';
        const categoryEn = updates.categoryEn || place.categoryEn || 'Shop';
        
        const aiTags = await aiTagsGeneratorService.generateAITags(
          currentTags,
          categorySlug,
          categoryEn
        );
        
        if (aiTags.length > 0) {
          updates.aiTags = aiTags;
          console.log(`🤖 ${place.name}: 更新 aiTags = ${JSON.stringify(aiTags.map(t => t.en))}`);
        }
      }

      // 应用更新
      if (Object.keys(updates).length > 0 && !DRY_RUN) {
        await prisma.place.update({
          where: { id: place.id },
          data: updates,
        });
      }

    } catch (error: any) {
      console.error(`❌ Error fixing ${place.name}: ${error.message}`);
      errors++;
    }
  }

  // Summary
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                           SUMMARY                                             ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
  
  console.log(`Total places processed: ${places.length}`);
  console.log(`Category fixed: ${fixedCategory}`);
  console.log(`Images URL fixed: ${fixedImages}`);
  console.log(`Price level fixed: ${fixedPriceLevel}`);
  console.log(`Verified fixed: ${fixedVerified}`);
  console.log(`Feminism tags fixed: ${fixedFeminism}`);
  console.log(`Errors: ${errors}`);
  
  if (DRY_RUN) {
    console.log('\n💡 This was a DRY RUN. No changes were made.');
    console.log('   Run without --dry-run to apply changes.\n');
  }

  await prisma.$disconnect();
}

// Run
fixAllDataIssues().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
