/**
 * Migration Script: Fix Architecture Categories
 * 
 * This script updates existing Wikidata architecture records to have
 * proper categories based on their building names instead of the
 * generic "architecture" category.
 * 
 * Changes:
 * - Detects category from building name (e.g., "Museum" → museum, "Cathedral" → church)
 * - Adds type: ["Architecture"] to tags for all architecture records
 * - Updates categorySlug, categoryEn, categoryZh accordingly
 * 
 * Usage:
 *   npx ts-node scripts/fix-architecture-categories.ts [--dry-run]
 * 
 * Options:
 *   --dry-run    Preview changes without updating the database
 */

import prisma from '../src/config/database';
import { detectCategoryFromName } from '../src/services/wikidataImportUtils';

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
};

interface PlaceRecord {
  id: string;
  name: string;
  categorySlug: string | null;
  tags: Record<string, unknown> | null;
  customFields: Record<string, unknown> | null;
}

async function fixArchitectureCategories(dryRun: boolean = false): Promise<void> {
  console.log('🔧 Fix Architecture Categories Migration');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  console.log('');

  // Find all Wikidata architecture records
  const architectureRecords = await prisma.place.findMany({
    where: {
      source: 'wikidata',
      customFields: {
        path: ['dataType'],
        equals: 'architecture',
      },
    },
    select: {
      id: true,
      name: true,
      categorySlug: true,
      tags: true,
      customFields: true,
    },
  }) as PlaceRecord[];

  console.log(`📊 Found ${architectureRecords.length} architecture records to process`);
  console.log('');

  // Statistics
  const stats = {
    total: architectureRecords.length,
    categoryChanged: 0,
    tagsUpdated: 0,
    byCategory: {} as Record<string, number>,
  };

  // Process each record
  for (const record of architectureRecords) {
    const newCategorySlug = detectCategoryFromName(record.name);
    const categoryNames = CATEGORY_NAMES[newCategorySlug] || { en: 'Landmark', zh: '地标' };

    // Track category distribution
    stats.byCategory[newCategorySlug] = (stats.byCategory[newCategorySlug] || 0) + 1;

    // Check if category needs to change
    const categoryChanged = record.categorySlug !== newCategorySlug;
    if (categoryChanged) {
      stats.categoryChanged++;
    }

    // Check if tags need to be updated (add type: ["Architecture"])
    const currentTags = (record.tags || {}) as Record<string, unknown>;
    const currentType = currentTags.type as string[] | undefined;
    const needsTypeTag = !currentType || !currentType.includes('Architecture');
    if (needsTypeTag) {
      stats.tagsUpdated++;
    }

    // Build new tags with type: ["Architecture"]
    const newTags = {
      ...currentTags,
      type: ['Architecture'],
    };

    // Log changes for dry run
    if (dryRun && (categoryChanged || needsTypeTag)) {
      console.log(`📝 ${record.name}`);
      if (categoryChanged) {
        console.log(`   Category: ${record.categorySlug} → ${newCategorySlug} (${categoryNames.en})`);
      }
      if (needsTypeTag) {
        console.log(`   Tags: Adding type: ["Architecture"]`);
      }
    }

    // Update the record if not dry run
    if (!dryRun && (categoryChanged || needsTypeTag)) {
      await prisma.place.update({
        where: { id: record.id },
        data: {
          categorySlug: newCategorySlug,
          categoryEn: categoryNames.en,
          categoryZh: categoryNames.zh,
          tags: newTags,
        },
      });
    }
  }

  // Print summary
  console.log('');
  console.log('📊 Summary');
  console.log('==========');
  console.log(`Total records: ${stats.total}`);
  console.log(`Categories changed: ${stats.categoryChanged}`);
  console.log(`Tags updated: ${stats.tagsUpdated}`);
  console.log('');
  console.log('Category distribution:');
  
  // Sort by count descending
  const sortedCategories = Object.entries(stats.byCategory)
    .sort((a, b) => b[1] - a[1]);
  
  for (const [category, count] of sortedCategories) {
    const names = CATEGORY_NAMES[category] || { en: category };
    console.log(`  ${names.en}: ${count}`);
  }

  if (dryRun) {
    console.log('');
    console.log('⚠️  This was a dry run. No changes were made.');
    console.log('   Run without --dry-run to apply changes.');
  } else {
    console.log('');
    console.log('✅ Migration complete!');
  }
}

// Main execution
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

fixArchitectureCategories(dryRun)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });
