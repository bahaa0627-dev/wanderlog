/**
 * Data Quality Fix Script
 * 
 * Fixes data quality issues in Wikidata imported places:
 * 1. QID names - Places with name like "Q12345" get real names from Wikidata
 * 2. Categories - Reclassify landmarks based on name keywords
 * 3. Translations - Convert non-English names to English
 * 
 * Usage:
 *   npx ts-node scripts/fix-data-quality.ts [options]
 * 
 * Options:
 *   --dry-run       Preview changes without updating database
 *   --limit N       Process only N records (for testing)
 *   --fix-type TYPE Type of fix: qid-names, categories, translations, all (default: all)
 * 
 * Requirements: wikidata-data-quality spec
 */

import prisma from '../src/config/database';
import {
  isQIDName,
  hasNonAsciiCharacters,
  detectCategoryFromName,
  WikidataLabelFetcher,
  preserveOriginalData,
  PlaceRecordForFix,
} from '../src/services/wikidataImportUtils';

// Category slug to display name mapping
const CATEGORY_NAMES: Record<string, { en: string; zh: string }> = {
  'landmark': { en: 'Landmark', zh: '地标' },
  'museum': { en: 'Museum', zh: '博物馆' },
  'art_gallery': { en: 'Gallery', zh: '美术馆' },
  'church': { en: 'Church', zh: '教堂' },
  'castle': { en: 'Castle', zh: '城堡' },
  'library': { en: 'Library', zh: '图书馆' },
  'university': { en: 'University', zh: '大学' },
  'temple': { en: 'Temple', zh: '寺庙' },
  'hotel': { en: 'Hotel', zh: '酒店' },
  'cemetery': { en: 'Cemetery', zh: '墓园' },
  'park': { en: 'Park', zh: '公园' },
  'zoo': { en: 'Zoo', zh: '动物园' },
  'cafe': { en: 'Cafe', zh: '咖啡馆' },
  'restaurant': { en: 'Restaurant', zh: '餐厅' },
  'bar': { en: 'Bar', zh: '酒吧' },
  'theater': { en: 'Theater', zh: '剧院' },
  'stadium': { en: 'Stadium', zh: '体育场' },
};

interface FixReport {
  totalScanned: number;
  qidNamesFixed: number;
  categoriesChanged: number;
  namesTranslated: number;
  errors: number;
  details: {
    qidFixes: Array<{ id: string; oldName: string; newName: string }>;
    categoryFixes: Array<{ id: string; name: string; oldCategory: string; newCategory: string }>;
    translationFixes: Array<{ id: string; oldName: string; newName: string }>;
    errorList: Array<{ id: string; error: string }>;
  };
}

interface CliOptions {
  dryRun: boolean;
  limit: number | null;
  fixType: 'qid-names' | 'categories' | 'translations' | 'all';
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    dryRun: false,
    limit: null,
    fixType: 'all',
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') {
      options.dryRun = true;
    } else if (args[i] === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--fix-type' && args[i + 1]) {
      options.fixType = args[i + 1] as CliOptions['fixType'];
      i++;
    }
  }

  return options;
}


/**
 * Fix QID names - Replace Q12345 format names with real names from Wikidata
 */
async function fixQIDNames(
  options: CliOptions,
  labelFetcher: WikidataLabelFetcher,
  report: FixReport
): Promise<void> {
  console.log('\n📝 Scanning for QID names...');

  // Find places with QID as name
  const places = await prisma.place.findMany({
    where: {
      source: 'wikidata',
      name: { startsWith: 'Q' },
    },
    select: {
      id: true,
      name: true,
      categorySlug: true,
      categoryEn: true,
      categoryZh: true,
      sourceDetail: true,
      customFields: true,
    },
    take: options.limit || undefined,
  });

  // Filter to actual QID names
  const qidPlaces = places.filter(p => isQIDName(p.name));
  console.log(`Found ${qidPlaces.length} places with QID names`);

  let processed = 0;
  const BATCH_SIZE = 50;
  let batch: Array<{ id: string; name: string; customFields: any }> = [];

  for (const place of qidPlaces) {
    processed++;
    if (processed % 100 === 0) {
      console.log(`  Progress: ${processed}/${qidPlaces.length}`);
    }

    try {
      // Get QID from sourceDetail or name
      const qid = place.sourceDetail || place.name;
      
      // Fetch label from Wikidata
      const newName = await labelFetcher.fetchBestLabel(qid);
      
      if (!newName) {
        console.log(`  ⚠️ No label found for ${qid}`);
        continue;
      }

      // Preserve original data
      const customFields = preserveOriginalData(
        place as PlaceRecordForFix,
        'qid_name',
        place.customFields as Record<string, unknown> | null
      );

      report.details.qidFixes.push({
        id: place.id,
        oldName: place.name,
        newName,
      });

      // Add to batch
      batch.push({
        id: place.id,
        name: newName,
        customFields,
      });

      report.qidNamesFixed++;

      // Execute batch update when batch is full
      if (batch.length >= BATCH_SIZE && !options.dryRun) {
        await executeBatchUpdate(batch);
        batch = [];
      }
    } catch (error) {
      report.errors++;
      report.details.errorList.push({
        id: place.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Execute remaining batch
  if (batch.length > 0 && !options.dryRun) {
    await executeBatchUpdate(batch);
  }

  report.totalScanned += qidPlaces.length;
}

/**
 * Execute batch update for places
 */
async function executeBatchUpdate(
  batch: Array<{ id: string; name?: string; customFields: any; categorySlug?: string; categoryEn?: string; categoryZh?: string }>
): Promise<void> {
  const updates = batch.map(item =>
    prisma.place.update({
      where: { id: item.id },
      data: {
        ...(item.name && { name: item.name }),
        ...(item.categorySlug && { categorySlug: item.categorySlug }),
        ...(item.categoryEn && { categoryEn: item.categoryEn }),
        ...(item.categoryZh && { categoryZh: item.categoryZh }),
        customFields: item.customFields,
      },
    })
  );

  await prisma.$transaction(updates);
}

/**
 * Fix categories - Reclassify landmarks based on name keywords
 */
async function fixCategories(
  options: CliOptions,
  report: FixReport
): Promise<void> {
  console.log('\n🏷️ Scanning for category mismatches...');

  // Find places with landmark or architecture category
  const places = await prisma.place.findMany({
    where: {
      source: 'wikidata',
      categorySlug: { in: ['landmark', 'architecture'] },
    },
    select: {
      id: true,
      name: true,
      categorySlug: true,
      categoryEn: true,
      categoryZh: true,
      sourceDetail: true,
      customFields: true,
    },
    take: options.limit || undefined,
  });

  console.log(`Found ${places.length} places to check`);

  let processed = 0;
  let changed = 0;
  const BATCH_SIZE = 50;
  let batch: Array<{ id: string; categorySlug: string; categoryEn: string; categoryZh: string; customFields: any }> = [];

  for (const place of places) {
    processed++;
    if (processed % 100 === 0) {
      console.log(`  Progress: ${processed}/${places.length}`);
    }

    try {
      const newCategorySlug = detectCategoryFromName(place.name);
      
      // Skip if category doesn't change
      if (newCategorySlug === place.categorySlug || newCategorySlug === 'landmark') {
        continue;
      }

      const categoryNames = CATEGORY_NAMES[newCategorySlug] || { en: 'Landmark', zh: '地标' };

      // Preserve original data
      const customFields = preserveOriginalData(
        place as PlaceRecordForFix,
        'category',
        place.customFields as Record<string, unknown> | null
      );

      report.details.categoryFixes.push({
        id: place.id,
        name: place.name,
        oldCategory: place.categorySlug || 'unknown',
        newCategory: newCategorySlug,
      });

      // Add to batch
      batch.push({
        id: place.id,
        categorySlug: newCategorySlug,
        categoryEn: categoryNames.en,
        categoryZh: categoryNames.zh,
        customFields,
      });

      changed++;
      report.categoriesChanged++;

      // Execute batch update when batch is full
      if (batch.length >= BATCH_SIZE && !options.dryRun) {
        await executeBatchUpdate(batch);
        batch = [];
      }
    } catch (error) {
      report.errors++;
      report.details.errorList.push({
        id: place.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Execute remaining batch
  if (batch.length > 0 && !options.dryRun) {
    await executeBatchUpdate(batch);
  }

  report.totalScanned += places.length;
  console.log(`  Categories changed: ${changed}`);
}

/**
 * Fix translations - Convert non-English names to English
 */
async function fixTranslations(
  options: CliOptions,
  labelFetcher: WikidataLabelFetcher,
  report: FixReport
): Promise<void> {
  console.log('\n🌐 Scanning for non-English names...');

  // Find places with non-ASCII names
  const places = await prisma.place.findMany({
    where: {
      source: 'wikidata',
      sourceDetail: { not: null },
    },
    select: {
      id: true,
      name: true,
      categorySlug: true,
      categoryEn: true,
      categoryZh: true,
      sourceDetail: true,
      customFields: true,
    },
    take: options.limit || undefined,
  });

  // Filter to non-ASCII names
  const nonEnglishPlaces = places.filter(p => hasNonAsciiCharacters(p.name));
  console.log(`Found ${nonEnglishPlaces.length} places with non-English names`);

  let processed = 0;
  const BATCH_SIZE = 50;
  let batch: Array<{ id: string; name: string; customFields: any }> = [];

  for (const place of nonEnglishPlaces) {
    processed++;
    if (processed % 100 === 0) {
      console.log(`  Progress: ${processed}/${nonEnglishPlaces.length}`);
    }

    try {
      const qid = place.sourceDetail;
      if (!qid) continue;

      // Fetch English label from Wikidata
      const labels = await labelFetcher.fetchLabels(qid);
      const englishName = labels.en;

      // Skip if no English label or same as current
      if (!englishName || englishName === place.name) {
        continue;
      }

      // Preserve original data
      const customFields = preserveOriginalData(
        place as PlaceRecordForFix,
        'translation',
        place.customFields as Record<string, unknown> | null
      );

      report.details.translationFixes.push({
        id: place.id,
        oldName: place.name,
        newName: englishName,
      });

      // Add to batch
      batch.push({
        id: place.id,
        name: englishName,
        customFields,
      });

      report.namesTranslated++;

      // Execute batch update when batch is full
      if (batch.length >= BATCH_SIZE && !options.dryRun) {
        await executeBatchUpdate(batch);
        batch = [];
      }
    } catch (error) {
      report.errors++;
      report.details.errorList.push({
        id: place.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Execute remaining batch
  if (batch.length > 0 && !options.dryRun) {
    await executeBatchUpdate(batch);
  }

  report.totalScanned += nonEnglishPlaces.length;
}


/**
 * Print report summary
 */
function printReport(report: FixReport, dryRun: boolean): void {
  console.log('\n' + '='.repeat(50));
  console.log('📊 Summary Report');
  console.log('='.repeat(50));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes made)' : 'LIVE'}`);
  console.log(`Total scanned: ${report.totalScanned}`);
  console.log(`QID names fixed: ${report.qidNamesFixed}`);
  console.log(`Categories changed: ${report.categoriesChanged}`);
  console.log(`Names translated: ${report.namesTranslated}`);
  console.log(`Errors: ${report.errors}`);

  if (report.details.qidFixes.length > 0) {
    console.log('\n📝 QID Name Fixes (sample):');
    for (const fix of report.details.qidFixes.slice(0, 10)) {
      console.log(`  ${fix.oldName} → ${fix.newName}`);
    }
    if (report.details.qidFixes.length > 10) {
      console.log(`  ... and ${report.details.qidFixes.length - 10} more`);
    }
  }

  if (report.details.categoryFixes.length > 0) {
    console.log('\n🏷️ Category Fixes (sample):');
    for (const fix of report.details.categoryFixes.slice(0, 10)) {
      console.log(`  ${fix.name}: ${fix.oldCategory} → ${fix.newCategory}`);
    }
    if (report.details.categoryFixes.length > 10) {
      console.log(`  ... and ${report.details.categoryFixes.length - 10} more`);
    }
  }

  if (report.details.translationFixes.length > 0) {
    console.log('\n🌐 Translation Fixes (sample):');
    for (const fix of report.details.translationFixes.slice(0, 10)) {
      console.log(`  ${fix.oldName} → ${fix.newName}`);
    }
    if (report.details.translationFixes.length > 10) {
      console.log(`  ... and ${report.details.translationFixes.length - 10} more`);
    }
  }

  if (report.details.errorList.length > 0) {
    console.log('\n❌ Errors (sample):');
    for (const err of report.details.errorList.slice(0, 5)) {
      console.log(`  ${err.id}: ${err.error}`);
    }
  }

  if (dryRun) {
    console.log('\n⚠️ This was a dry run. Run without --dry-run to apply changes.');
  } else {
    console.log('\n✅ Fixes applied successfully!');
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const options = parseArgs();

  console.log('🔧 Data Quality Fix Script');
  console.log(`Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Fix type: ${options.fixType}`);
  if (options.limit) {
    console.log(`Limit: ${options.limit} records`);
  }

  const report: FixReport = {
    totalScanned: 0,
    qidNamesFixed: 0,
    categoriesChanged: 0,
    namesTranslated: 0,
    errors: 0,
    details: {
      qidFixes: [],
      categoryFixes: [],
      translationFixes: [],
      errorList: [],
    },
  };

  const labelFetcher = new WikidataLabelFetcher(10); // 10 req/s

  try {
    if (options.fixType === 'all' || options.fixType === 'qid-names') {
      await fixQIDNames(options, labelFetcher, report);
    }

    if (options.fixType === 'all' || options.fixType === 'categories') {
      await fixCategories(options, report);
    }

    if (options.fixType === 'all' || options.fixType === 'translations') {
      await fixTranslations(options, labelFetcher, report);
    }

    printReport(report, options.dryRun);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
