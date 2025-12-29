/**
 * Fix France Data Script
 * 
 * 修复已导入的法国数据：
 * 1. 将 country code (FR) 转换为完整国家名 (France)
 * 2. 重新生成 tags 和 ai_tags
 * 3. 上传图片到 R2（如果尚未上传）
 * 
 * Usage:
 *   npx ts-node scripts/fix-france-data.ts [--dry-run] [--skip-images]
 */

import prisma from '../src/config/database';
import { r2ImageService } from '../src/services/r2ImageService';
import { aiTagsGeneratorService, StructuredTags } from '../src/services/aiTagsGeneratorService';
import { ISO2_TO_COUNTRY_NAME } from '../src/services/apifyFieldMapper';

// ============================================================================
// Configuration
// ============================================================================

const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_IMAGES = process.argv.includes('--skip-images');
const BATCH_SIZE = 50;

// ============================================================================
// Main Fix Function
// ============================================================================

async function fixFranceData() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                     FIX FRANCE DATA                                           ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
  
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Skip Images: ${SKIP_IMAGES ? 'Yes' : 'No'}\n`);

  // Find all places with country = 'FR' or city containing 'Paris'
  const places = await prisma.place.findMany({
    where: {
      OR: [
        { country: 'FR' },
        { city: { contains: 'Paris', mode: 'insensitive' } },
      ],
    },
  });

  console.log(`Found ${places.length} places to fix\n`);

  let fixedCountry = 0;
  let fixedTags = 0;
  let fixedImages = 0;
  let errors = 0;

  for (let i = 0; i < places.length; i += BATCH_SIZE) {
    const batch = places.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(places.length / BATCH_SIZE);
    
    console.log(`\n📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} places)`);

    for (const place of batch) {
      try {
        const updates: Record<string, any> = {};
        const customFields = (place.customFields as Record<string, any>) || {};

        // 1. Fix country code
        if (place.country === 'FR' || (place.country && place.country.length === 2)) {
          const fullCountryName = ISO2_TO_COUNTRY_NAME[place.country.toUpperCase()] || place.country;
          if (fullCountryName !== place.country) {
            updates.country = fullCountryName;
            fixedCountry++;
            console.log(`   🌍 ${place.name}: ${place.country} → ${fullCountryName}`);
          }
        }

        // 2. Generate/fix tags from customFields
        const structuredTags: StructuredTags = {};
        
        // Extract from additionalInfo
        const additionalInfo = customFields.additionalInfo as Record<string, any[]> | undefined;
        if (additionalInfo) {
          // Detect brunch
          const diningOptions = additionalInfo['Dining options'];
          if (diningOptions && Array.isArray(diningOptions)) {
            const hasBrunch = diningOptions.some((opt: Record<string, boolean>) => opt['Brunch'] === true);
            if (hasBrunch) {
              if (!structuredTags.meal) structuredTags.meal = [];
              if (!structuredTags.meal.includes('brunch')) {
                structuredTags.meal.push('brunch');
              }
            }
          }
          
          // Detect atmosphere/style
          const atmosphere = additionalInfo['Atmosphere'];
          if (atmosphere && Array.isArray(atmosphere)) {
            const styleMap: Record<string, string> = {
              'Trendy': 'trendy',
              'Cozy': 'cozy',
              'Casual': 'casual',
              'Romantic': 'romantic',
              'Upscale': 'upscale',
            };
            for (const atm of atmosphere) {
              for (const [key, value] of Object.entries(atm)) {
                if (value === true && styleMap[key]) {
                  if (!structuredTags.style) structuredTags.style = [];
                  if (!structuredTags.style.includes(styleMap[key])) {
                    structuredTags.style.push(styleMap[key]);
                  }
                }
              }
            }
          }
          
          // Detect highlights
          const highlights = additionalInfo['Highlights'];
          if (highlights && Array.isArray(highlights)) {
            for (const highlight of highlights) {
              if (highlight['Great coffee'] === true) {
                if (!structuredTags.style) structuredTags.style = [];
                if (!structuredTags.style.includes('specialty_coffee')) {
                  structuredTags.style.push('specialty_coffee');
                }
              }
            }
          }
        }
        
        // Extract cuisine from categoriesRaw
        const categoriesRaw = customFields.categoriesRaw as string[] | undefined;
        if (categoriesRaw && ['restaurant', 'cafe'].includes(place.categorySlug || '')) {
          const cuisinePatterns: Record<string, string[]> = {
            'Japanese': ['japanese', 'sushi', 'ramen', 'izakaya'],
            'Korean': ['korean', 'bbq'],
            'Vietnamese': ['vietnamese', 'pho'],
            'Thai': ['thai'],
            'Chinese': ['chinese', 'dim sum', 'cantonese'],
            'Italian': ['italian', 'pizza', 'pasta'],
            'French': ['french', 'bistro', 'brasserie'],
            'Spanish': ['spanish', 'tapas'],
            'Indian': ['indian', 'curry'],
            'Mexican': ['mexican', 'taco'],
            'MiddleEastern': ['middle eastern', 'mediterranean', 'lebanese'],
            'Seafood': ['seafood'],
          };
          
          for (const cat of categoriesRaw) {
            const catLower = cat.toLowerCase();
            for (const [cuisine, patterns] of Object.entries(cuisinePatterns)) {
              if (patterns.some(p => catLower.includes(p))) {
                if (!structuredTags.cuisine) structuredTags.cuisine = [];
                if (!structuredTags.cuisine.includes(cuisine)) {
                  structuredTags.cuisine.push(cuisine);
                }
                break;
              }
            }
          }
        }
        
        // Extract from reviewsTags
        const reviewsTags = customFields.reviewsTags as Array<{ title: string; count: number }> | undefined;
        if (reviewsTags && reviewsTags.length > 0) {
          const reviewTagPatterns: Record<string, { key: keyof StructuredTags; value: string }> = {
            'brunch': { key: 'meal', value: 'brunch' },
            'breakfast': { key: 'meal', value: 'breakfast' },
            'specialty coffee': { key: 'style', value: 'specialty_coffee' },
            'vintage': { key: 'style', value: 'vintage' },
            'cozy': { key: 'style', value: 'cozy' },
            'trendy': { key: 'style', value: 'trendy' },
          };
          
          for (const reviewTag of reviewsTags) {
            const tagLower = reviewTag.title.toLowerCase();
            for (const [pattern, mapping] of Object.entries(reviewTagPatterns)) {
              if (tagLower.includes(pattern)) {
                if (!structuredTags[mapping.key]) structuredTags[mapping.key] = [];
                if (!structuredTags[mapping.key]!.includes(mapping.value)) {
                  structuredTags[mapping.key]!.push(mapping.value);
                }
              }
            }
          }
        }
        
        // Update tags if we found any
        if (Object.keys(structuredTags).length > 0) {
          // Merge with existing tags
          const existingTags = (place.tags as StructuredTags) || {};
          const mergedTags: StructuredTags = { ...existingTags };
          
          for (const [key, values] of Object.entries(structuredTags)) {
            if (!mergedTags[key]) {
              mergedTags[key] = [];
            }
            for (const value of values || []) {
              if (!mergedTags[key]!.includes(value)) {
                mergedTags[key]!.push(value);
              }
            }
          }
          
          updates.tags = mergedTags;
          fixedTags++;
          console.log(`   🏷️  ${place.name}: tags = ${JSON.stringify(mergedTags)}`);
          
          // 3. Generate AI tags
          const aiTags = await aiTagsGeneratorService.generateAITags(
            mergedTags,
            place.categorySlug || 'shop',
            place.categoryEn || 'Shop'
          );
          
          if (aiTags.length > 0) {
            updates.aiTags = aiTags;
            console.log(`   🤖 ${place.name}: aiTags = ${JSON.stringify(aiTags.map(t => t.en))}`);
          }
        }

        // 4. Upload image to R2 if needed
        const needsImage = !place.coverImage && customFields.imageSourceUrl;
        if (!SKIP_IMAGES && needsImage) {
          console.log(`   📷 ${place.name}: Uploading image...`);
          
          if (!DRY_RUN) {
            const imageResult = await r2ImageService.processAndUpload(customFields.imageSourceUrl);
            if (imageResult.success && imageResult.publicUrl) {
              updates.coverImage = imageResult.publicUrl;
              updates.customFields = {
                ...customFields,
                r2Key: imageResult.r2Key,
                imageMigratedAt: new Date().toISOString(),
              };
              fixedImages++;
              console.log(`   ✅ ${place.name}: Image uploaded`);
            } else {
              console.log(`   ⚠️  ${place.name}: Image upload failed: ${imageResult.error}`);
            }
          } else {
            fixedImages++;
            console.log(`   📷 ${place.name}: Would upload image (dry-run)`);
          }
        }

        // Apply updates
        if (Object.keys(updates).length > 0 && !DRY_RUN) {
          await prisma.place.update({
            where: { id: place.id },
            data: updates,
          });
        }

      } catch (error: any) {
        console.error(`   ❌ Error fixing ${place.name}: ${error.message}`);
        errors++;
      }
    }
  }

  // Summary
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                           SUMMARY                                             ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
  
  console.log(`Total places processed: ${places.length}`);
  console.log(`Country codes fixed: ${fixedCountry}`);
  console.log(`Tags generated: ${fixedTags}`);
  console.log(`Images uploaded: ${fixedImages}`);
  console.log(`Errors: ${errors}`);
  
  if (DRY_RUN) {
    console.log('\n💡 This was a DRY RUN. No changes were made.');
    console.log('   Run without --dry-run to apply changes.\n');
  }

  await prisma.$disconnect();
}

// Run
fixFranceData().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
