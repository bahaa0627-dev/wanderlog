/**
 * Category Fields Migration Script
 * 
 * Migrates old 'category' field to new category_slug, category_en, category_zh fields
 * 
 * Usage:
 *   npx ts-node scripts/migrate-category-fields.ts [options]
 * 
 * Options:
 *   --dry-run       Preview changes without updating database
 *   --limit N       Process only N records (for testing)
 */

import prisma from '../src/config/database';

// Category mapping: old category value → new category fields
const CATEGORY_MAPPING: Record<string, { slug: string; en: string; zh: string }> = {
  // Common categories
  'cafe': { slug: 'cafe', en: 'Cafe', zh: '咖啡馆' },
  'restaurant': { slug: 'restaurant', en: 'Restaurant', zh: '餐厅' },
  'museum': { slug: 'museum', en: 'Museum', zh: '博物馆' },
  'park': { slug: 'park', en: 'Park', zh: '公园' },
  'landmark': { slug: 'landmark', en: 'Landmark', zh: '地标' },
  'church': { slug: 'church', en: 'Church', zh: '教堂' },
  'temple': { slug: 'temple', en: 'Temple', zh: '寺庙' },
  'castle': { slug: 'castle', en: 'Castle', zh: '城堡' },
  'hotel': { slug: 'hotel', en: 'Hotel', zh: '酒店' },
  'library': { slug: 'library', en: 'Library', zh: '图书馆' },
  'university': { slug: 'university', en: 'University', zh: '大学' },
  'cemetery': { slug: 'cemetery', en: 'Cemetery', zh: '墓园' },
  'zoo': { slug: 'zoo', en: 'Zoo', zh: '动物园' },
  'art_gallery': { slug: 'art_gallery', en: 'Gallery', zh: '美术馆' },
  'theater': { slug: 'theater', en: 'Theater', zh: '剧院' },
  'stadium': { slug: 'stadium', en: 'Stadium', zh: '体育场' },
  'bar': { slug: 'bar', en: 'Bar', zh: '酒吧' },
  'architecture': { slug: 'architecture', en: 'Architecture', zh: '建筑' },
  
  // German categories
  'Wissenschaft': { slug: 'university', en: 'University', zh: '大学' },
  
  // Variations and aliases
  'Cafe': { slug: 'cafe', en: 'Cafe', zh: '咖啡馆' },
  'Restaurant': { slug: 'restaurant', en: 'Restaurant', zh: '餐厅' },
  'Museum': { slug: 'museum', en: 'Museum', zh: '博物馆' },
  'Park': { slug: 'park', en: 'Park', zh: '公园' },
  'Landmark': { slug: 'landmark', en: 'Landmark', zh: '地标' },
  'Church': { slug: 'church', en: 'Church', zh: '教堂' },
  'Temple': { slug: 'temple', en: 'Temple', zh: '寺庙' },
  'Castle': { slug: 'castle', en: 'Castle', zh: '城堡' },
  'Hotel': { slug: 'hotel', en: 'Hotel', zh: '酒店' },
  'Cemetery': { slug: 'cemetery', en: 'Cemetery', zh: '墓园' },
  'Gallery': { slug: 'art_gallery', en: 'Gallery', zh: '美术馆' },
  'Theater': { slug: 'theater', en: 'Theater', zh: '剧院' },
  'Stadium': { slug: 'stadium', en: 'Stadium', zh: '体育场' },
  'Bar': { slug: 'bar', en: 'Bar', zh: '酒吧' },
  'Architecture': { slug: 'architecture', en: 'Architecture', zh: '建筑' },
};

interface MigrationReport {
  totalScanned: number;
  migrated: number;
  alreadyMigrated: number;
  unmapped: number;
  errors: number;
  details: {
    migrations: Array<{ id: string; oldCategory: string; newSlug: string }>;
    unmappedCategories: Array<{ category: string; count: number }>;
    errorList: Array<{ id: string; error: string }>;
  };
}

interface CliOptions {
  dryRun: boolean;
  limit: number | null;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    dryRun: false,
    limit: null,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') {
      options.dryRun = true;
    } else if (args[i] === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return options;
}

/**
 * Migrate category fields for places
 */
async function migrateCategories(options: CliOptions): Promise<MigrationReport> {
  console.log('\n📝 Scanning for places with old category field...');

  const report: MigrationReport = {
    totalScanned: 0,
    migrated: 0,
    alreadyMigrated: 0,
    unmapped: 0,
    errors: 0,
    details: {
      migrations: [],
      unmappedCategories: [],
      errorList: [],
    },
  };

  // Find places that need migration
  const places = await prisma.place.findMany({
    where: {
      OR: [
        // Has old category but missing new fields
        {
          category: { not: null },
          categorySlug: null,
        },
        // Has old category but categoryEn is null
        {
          category: { not: null },
          categoryEn: null,
        },
      ],
    },
    select: {
      id: true,
      category: true,
      categorySlug: true,
      categoryEn: true,
      categoryZh: true,
    },
    take: options.limit || undefined,
  });

  console.log(`Found ${places.length} places to check`);
  report.totalScanned = places.length;

  const unmappedCategoriesMap = new Map<string, number>();
  const BATCH_SIZE = 50;
  let batch: Array<{ id: string; categorySlug: string; categoryEn: string; categoryZh: string }> = [];

  for (const place of places) {
    try {
      // Skip if already has all new fields
      if (place.categorySlug && place.categoryEn) {
        report.alreadyMigrated++;
        continue;
      }

      const oldCategory = place.category;
      if (!oldCategory) {
        continue;
      }

      // Look up mapping
      const mapping = CATEGORY_MAPPING[oldCategory];
      
      if (!mapping) {
        // Track unmapped categories
        const count = unmappedCategoriesMap.get(oldCategory) || 0;
        unmappedCategoriesMap.set(oldCategory, count + 1);
        report.unmapped++;
        continue;
      }

      // Add to migration list
      report.details.migrations.push({
        id: place.id,
        oldCategory,
        newSlug: mapping.slug,
      });

      // Add to batch
      batch.push({
        id: place.id,
        categorySlug: mapping.slug,
        categoryEn: mapping.en,
        categoryZh: mapping.zh,
      });

      report.migrated++;

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

  // Convert unmapped categories map to array
  report.details.unmappedCategories = Array.from(unmappedCategoriesMap.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  return report;
}

/**
 * Execute batch update for places
 */
async function executeBatchUpdate(
  batch: Array<{ id: string; categorySlug: string; categoryEn: string; categoryZh: string }>
): Promise<void> {
  const updates = batch.map(item =>
    prisma.place.update({
      where: { id: item.id },
      data: {
        categorySlug: item.categorySlug,
        categoryEn: item.categoryEn,
        categoryZh: item.categoryZh,
      },
    })
  );

  await prisma.$transaction(updates);
}

/**
 * Print migration report
 */
function printReport(report: MigrationReport, dryRun: boolean): void {
  console.log('\n' + '='.repeat(50));
  console.log('📊 Migration Report');
  console.log('='.repeat(50));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes made)' : 'LIVE'}`);
  console.log(`Total scanned: ${report.totalScanned}`);
  console.log(`Migrated: ${report.migrated}`);
  console.log(`Already migrated: ${report.alreadyMigrated}`);
  console.log(`Unmapped categories: ${report.unmapped}`);
  console.log(`Errors: ${report.errors}`);

  if (report.details.migrations.length > 0) {
    console.log('\n📝 Migrations (sample):');
    for (const migration of report.details.migrations.slice(0, 10)) {
      console.log(`  ${migration.oldCategory} → ${migration.newSlug}`);
    }
    if (report.details.migrations.length > 10) {
      console.log(`  ... and ${report.details.migrations.length - 10} more`);
    }
  }

  if (report.details.unmappedCategories.length > 0) {
    console.log('\n⚠️ Unmapped Categories:');
    for (const item of report.details.unmappedCategories) {
      console.log(`  ${item.category}: ${item.count} places`);
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
    console.log('\n✅ Migration completed successfully!');
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const options = parseArgs();

  console.log('🔧 Category Fields Migration Script');
  console.log(`Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`);
  if (options.limit) {
    console.log(`Limit: ${options.limit} records`);
  }

  try {
    const report = await migrateCategories(options);
    printReport(report, options.dryRun);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
