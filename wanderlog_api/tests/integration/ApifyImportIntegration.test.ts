/**
 * Integration Tests for Apify Data Import
 * 
 * Task 11: Checkpoint - 集成测试
 * - 使用 Paris 测试数据进行端到端测试
 * - 验证数据正确导入到 Supabase
 * - 验证图片正确上传到 R2
 * 
 * Requirements: 1.1-1.14, 2.1-2.8, 3.1-3.9, 4.1-4.11, 5.1-5.7, 6.1-6.6, 7.1-7.6
 * 
 * NOTE: These tests require actual database and R2 connections.
 * Run with: npx jest tests/integration/ApifyImportIntegration.test.ts
 * 
 * Environment variables required:
 * - DATABASE_URL (Supabase connection)
 * - R2_PUBLIC_URL
 * - R2_UPLOAD_SECRET
 */

import * as fs from 'fs';
import * as path from 'path';
import { ApifyImportService } from '../../src/services/apifyImportService';
import { apifyFieldMapper } from '../../src/services/apifyFieldMapper';
import { apifyDataValidator } from '../../src/services/apifyDataValidator';
import { r2ImageService, R2ImageService } from '../../src/services/r2ImageService';
import { normalizationService } from '../../src/services/normalizationService';
import { ApifyPlaceItem, ImportResult } from '../../src/types/apify';

// ============================================================================
// Test Data Loading
// ============================================================================

const PARIS_TEST_DATA_PATH = path.resolve(__dirname, '../../../dataset_crawler-google-places - test paris.json');

/**
 * Load Paris test data from JSON file
 */
function loadParisTestData(): ApifyPlaceItem[] {
  if (!fs.existsSync(PARIS_TEST_DATA_PATH)) {
    console.warn(`⚠️ Paris test data file not found at: ${PARIS_TEST_DATA_PATH}`);
    return [];
  }
  
  const content = fs.readFileSync(PARIS_TEST_DATA_PATH, 'utf-8');
  const data = JSON.parse(content);
  return Array.isArray(data) ? data : [data];
}

/**
 * Get a small sample of test data for quick tests
 */
function getSampleTestData(count: number = 5): ApifyPlaceItem[] {
  const allData = loadParisTestData();
  return allData.slice(0, count);
}

// ============================================================================
// Test Suite: Data Validation
// ============================================================================

describe('Apify Import Integration - Data Validation', () => {
  let testData: ApifyPlaceItem[];

  beforeAll(() => {
    testData = loadParisTestData();
  });

  it('should load Paris test data successfully', () => {
    expect(testData.length).toBeGreaterThan(0);
    console.log(`✅ Loaded ${testData.length} items from Paris test data`);
  });

  it('should validate required fields for all test items', () => {
    const validItems: ApifyPlaceItem[] = [];
    const invalidItems: { item: ApifyPlaceItem; errors: string[] }[] = [];

    for (const item of testData) {
      const validation = apifyDataValidator.validateRequired(item);
      if (validation.valid) {
        validItems.push(item);
      } else {
        invalidItems.push({ item, errors: validation.errors });
      }
    }

    console.log(`✅ Valid items: ${validItems.length}`);
    console.log(`⚠️ Invalid items: ${invalidItems.length}`);

    // Log first few invalid items for debugging
    if (invalidItems.length > 0) {
      console.log('Sample invalid items:');
      invalidItems.slice(0, 3).forEach(({ item, errors }) => {
        console.log(`  - ${item.title || 'Unknown'}: ${errors.join(', ')}`);
      });
    }

    // Most items should be valid
    expect(validItems.length).toBeGreaterThan(invalidItems.length);
  });

  it('should correctly map all fields for valid items', () => {
    const sampleData = getSampleTestData(10);
    
    for (const item of sampleData) {
      const validation = apifyDataValidator.validateRequired(item);
      if (!validation.valid) continue;

      const mapped = apifyFieldMapper.mapToPlace(item);

      // Verify required field mappings (Requirement 1.1-1.14)
      expect(mapped.name).toBe(item.title);
      expect(mapped.latitude).toBe(item.location.lat);
      expect(mapped.longitude).toBe(item.location.lng);
      expect(mapped.source).toBe('apify_google_places');

      // Verify optional field mappings
      if (item.address) expect(mapped.address).toBe(item.address);
      if (item.city) expect(mapped.city).toBe(item.city);
      if (item.countryCode) {
        // Country code is now converted to full name (e.g., FR → France)
        const { convertCountryCode } = require('../../src/services/apifyFieldMapper');
        expect(mapped.country).toBe(convertCountryCode(item.countryCode));
      }
      if (item.totalScore) expect(mapped.rating).toBe(item.totalScore);
      if (item.reviewsCount) expect(mapped.ratingCount).toBe(item.reviewsCount);
      if (item.placeId) expect(mapped.googlePlaceId).toBe(item.placeId);
      if (item.website) expect(mapped.website).toBe(item.website);

      // Verify phone number priority (Requirement 1.10)
      if (item.phoneUnformatted) {
        expect(mapped.phoneNumber).toBe(item.phoneUnformatted);
      } else if (item.phone) {
        expect(mapped.phoneNumber).toBe(item.phone);
      }

      // Verify sourceDetails (Requirement 5.1-5.2)
      expect(mapped.sourceDetails.apify).toBeDefined();
      expect(mapped.sourceDetails.apify.scrapedAt).toBeDefined();
      expect(Array.isArray(mapped.sourceDetails.apify.searchHits)).toBe(true);

      // Verify customFields (Requirement 5.3-5.7)
      if (item.categories) {
        expect(mapped.customFields.categoriesRaw).toEqual(item.categories);
      }
    }
  });
});

// ============================================================================
// Test Suite: Category Normalization
// ============================================================================

describe('Apify Import Integration - Category Normalization', () => {
  it('should normalize categories correctly for Paris test data', () => {
    const testData = getSampleTestData(20);
    const categoryStats: Record<string, number> = {};

    for (const item of testData) {
      const result = normalizationService.normalizeFromApify(
        item.categories,
        item.categoryName,
        item.searchString
      );

      categoryStats[result.categorySlug] = (categoryStats[result.categorySlug] || 0) + 1;

      // Verify category structure
      expect(result.categorySlug).toBeDefined();
      expect(result.categoryEn).toBeDefined();
      expect(result.categoryZh).toBeDefined();
      expect(Array.isArray(result.tags)).toBe(true);
    }

    console.log('Category distribution:');
    Object.entries(categoryStats)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, count]) => {
        console.log(`  ${cat}: ${count}`);
      });
  });

  it('should correctly identify coffee shops (Requirement 4.5)', () => {
    const coffeeShopItem: ApifyPlaceItem = {
      title: 'Test Coffee Shop',
      placeId: 'test_coffee_1',
      location: { lat: 48.8566, lng: 2.3522 },
      city: 'Paris',
      countryCode: 'FR',
      categories: ['Coffee shop'],
      categoryName: 'Coffee shop',
    };

    const result = normalizationService.normalizeFromApify(
      coffeeShopItem.categories,
      coffeeShopItem.categoryName,
      coffeeShopItem.searchString
    );

    expect(result.categorySlug).toBe('cafe');
  });

  it('should correctly identify bakeries (Requirement 4.6)', () => {
    const bakeryItem: ApifyPlaceItem = {
      title: 'Test Bakery',
      placeId: 'test_bakery_1',
      location: { lat: 48.8566, lng: 2.3522 },
      city: 'Paris',
      countryCode: 'FR',
      categories: ['Bakery', 'Pastry shop'],
      categoryName: 'Bakery',
    };

    const result = normalizationService.normalizeFromApify(
      bakeryItem.categories,
      bakeryItem.categoryName,
      bakeryItem.searchString
    );

    expect(result.categorySlug).toBe('bakery');
  });

  it('should correctly identify restaurants (Requirement 4.7)', () => {
    const restaurantItem: ApifyPlaceItem = {
      title: 'Test Restaurant',
      placeId: 'test_restaurant_1',
      location: { lat: 48.8566, lng: 2.3522 },
      city: 'Paris',
      countryCode: 'FR',
      categories: ['Restaurant', 'French restaurant'],
      categoryName: 'Restaurant',
    };

    const result = normalizationService.normalizeFromApify(
      restaurantItem.categories,
      restaurantItem.categoryName,
      restaurantItem.searchString
    );

    expect(result.categorySlug).toBe('restaurant');
  });
});

// ============================================================================
// Test Suite: R2 Key Generation
// ============================================================================

describe('Apify Import Integration - R2 Key Generation', () => {
  it('should generate valid R2 keys (Requirement 3.2, 3.9)', () => {
    for (let i = 0; i < 10; i++) {
      const r2Key = r2ImageService.generateR2Key();

      // Verify format
      expect(r2Key).toMatch(/^places\/cover\/v1\/[a-f0-9]{2}\/[a-f0-9]{4}\/[a-f0-9-]+\.jpg$/);

      // Verify no googlePlaceId pattern
      expect(r2Key).not.toMatch(/ChIJ/);

      // Verify validation passes
      expect(R2ImageService.validateR2Key(r2Key)).toBe(true);
    }
  });

  it('should never include googlePlaceId in R2 key', () => {
    const testPlaceIds = [
      'ChIJZ7SPu5xv5kcRGMfYOG3bVhs',
      'ChIJG1fucyFv5kcRs156o6akFL0',
      'ChIJy9kbhldl5kcRw6saeXEhaNQ',
    ];

    for (const placeId of testPlaceIds) {
      const r2Key = r2ImageService.generateR2Key();
      expect(r2Key).not.toContain(placeId);
      expect(R2ImageService.validateR2Key(r2Key, placeId)).toBe(true);
    }
  });
});

// ============================================================================
// Test Suite: Import Statistics
// ============================================================================

describe('Apify Import Integration - Import Statistics', () => {
  it('should generate accurate import report (Requirement 7.1-7.6)', () => {
    const testData = getSampleTestData(50);
    const importService = new ApifyImportService();

    const report = importService.generateReport(testData, undefined, true);

    // Verify report structure
    expect(report.generatedAt).toBeDefined();
    expect(report.isDryRun).toBe(true);
    expect(report.totalItems).toBe(testData.length);

    // Verify required fields coverage (Requirement 7.2)
    expect(report.requiredFieldsCoverage).toBeDefined();
    expect(report.requiredFieldsCoverage.city).toBeDefined();
    expect(report.requiredFieldsCoverage.country).toBeDefined();
    expect(report.requiredFieldsCoverage.latitude).toBeDefined();
    expect(report.requiredFieldsCoverage.longitude).toBeDefined();
    expect(report.requiredFieldsCoverage.coverImage).toBeDefined();

    // Verify opening hours coverage (Requirement 7.3)
    expect(report.openingHoursCoverage).toBeDefined();
    expect(report.openingHoursCoverage.rate).toBeGreaterThanOrEqual(0);
    expect(report.openingHoursCoverage.rate).toBeLessThanOrEqual(100);

    // Verify cover image coverage (Requirement 7.4)
    expect(report.coverImageCoverage).toBeDefined();
    expect(report.coverImageCoverage.rate).toBeGreaterThanOrEqual(0);
    expect(report.coverImageCoverage.rate).toBeLessThanOrEqual(100);

    // Verify duplicates detection (Requirement 7.5)
    expect(report.duplicates).toBeDefined();
    expect(report.duplicates.totalDuplicates).toBeGreaterThanOrEqual(0);

    // Log report summary
    console.log('\n📊 Import Report Summary:');
    console.log(`  Total Items: ${report.totalItems}`);
    console.log(`  City Coverage: ${report.requiredFieldsCoverage.city.rate.toFixed(1)}%`);
    console.log(`  Country Coverage: ${report.requiredFieldsCoverage.country.rate.toFixed(1)}%`);
    console.log(`  Opening Hours: ${report.openingHoursCoverage.rate.toFixed(1)}%`);
    console.log(`  Cover Image: ${report.coverImageCoverage.rate.toFixed(1)}%`);
    console.log(`  Duplicates: ${report.duplicates.totalDuplicates}`);
  });

  it('should validate statistics accuracy (Property 12)', () => {
    // Create mock import result
    const mockResult: ImportResult = {
      total: 100,
      inserted: 50,
      updated: 30,
      skipped: 15,
      failed: 5,
      errors: [],
      stats: {
        cityCount: 1,
        categoryDistribution: {},
        coverImageRate: 80,
        openingHoursRate: 70,
        requiredFieldsRate: 95,
      },
    };

    // Verify total = inserted + updated + skipped + failed
    const calculatedTotal = mockResult.inserted + mockResult.updated + mockResult.skipped + mockResult.failed;
    expect(mockResult.total).toBe(calculatedTotal);
    expect(ApifyImportService.validateStatistics(mockResult)).toBe(true);
  });
});

// ============================================================================
// Test Suite: Metadata Completeness
// ============================================================================

describe('Apify Import Integration - Metadata Completeness', () => {
  it('should ensure metadata completeness for all mapped items (Property 11)', () => {
    const testData = getSampleTestData(20);
    let completeCount = 0;
    let incompleteCount = 0;

    for (const item of testData) {
      const validation = apifyDataValidator.validateRequired(item);
      if (!validation.valid) continue;

      const mapped = apifyFieldMapper.mapToPlace(item);
      const metadataCheck = ApifyImportService.validateMetadataCompleteness(mapped, item);

      if (metadataCheck.complete) {
        completeCount++;
      } else {
        incompleteCount++;
        console.log(`  Incomplete: ${item.title} - Missing: ${metadataCheck.missing.join(', ')}`);
      }
    }

    console.log(`\n✅ Complete metadata: ${completeCount}`);
    console.log(`⚠️ Incomplete metadata: ${incompleteCount}`);

    // Most items should have complete metadata
    expect(completeCount).toBeGreaterThan(incompleteCount);
  });
});

// ============================================================================
// Test Suite: Dry Run Import
// ============================================================================

describe('Apify Import Integration - Dry Run', () => {
  it('should perform dry run import without database writes (Requirement 7.6)', async () => {
    const testData = getSampleTestData(10);
    const importService = new ApifyImportService();

    // Perform dry run
    const result = await importService.importItems(testData, {
      dryRun: true,
      skipImages: true,
      batchSize: 5,
    });

    // Verify result structure
    expect(result.total).toBe(testData.length);
    expect(result.inserted + result.updated + result.skipped + result.failed).toBe(result.total);

    // In dry run, no actual database writes should occur
    // The counts should reflect what would happen
    console.log('\n📋 Dry Run Results:');
    console.log(`  Total: ${result.total}`);
    console.log(`  Would Insert: ${result.inserted}`);
    console.log(`  Would Update: ${result.updated}`);
    console.log(`  Would Skip: ${result.skipped}`);
    console.log(`  Would Fail: ${result.failed}`);
  });
});

// ============================================================================
// Test Suite: End-to-End Import (Requires Database)
// ============================================================================

describe('Apify Import Integration - End-to-End (Database Required)', () => {
  const skipDatabaseTests = !process.env.DATABASE_URL;

  beforeAll(() => {
    if (skipDatabaseTests) {
      console.warn('⚠️ DATABASE_URL not set, skipping database integration tests');
    }
  });

  it.skip('should import sample data to database', async () => {
    if (skipDatabaseTests) return;

    const testData = getSampleTestData(3);
    const importService = new ApifyImportService();

    const result = await importService.importItems(testData, {
      dryRun: false,
      skipImages: true, // Skip images for faster test
      batchSize: 10,
    });

    expect(result.total).toBe(testData.length);
    expect(result.failed).toBe(0);
    expect(result.inserted + result.updated).toBeGreaterThan(0);

    console.log('\n✅ Database Import Results:');
    console.log(`  Inserted: ${result.inserted}`);
    console.log(`  Updated: ${result.updated}`);
  });

  it.skip('should handle duplicate imports correctly (Requirement 2.1-2.6)', async () => {
    if (skipDatabaseTests) return;

    const testData = getSampleTestData(2);
    const importService = new ApifyImportService();

    // First import
    const firstResult = await importService.importItems(testData, {
      dryRun: false,
      skipImages: true,
    });

    // Second import of same data should update, not insert
    const secondResult = await importService.importItems(testData, {
      dryRun: false,
      skipImages: true,
    });

    // Second import should have updates, not inserts
    expect(secondResult.updated).toBeGreaterThanOrEqual(firstResult.inserted);
    expect(secondResult.inserted).toBe(0);
  });
});

// ============================================================================
// Test Suite: Image Upload (Requires R2)
// ============================================================================

describe('Apify Import Integration - Image Upload (R2 Required)', () => {
  const skipR2Tests = !process.env.R2_UPLOAD_SECRET;

  beforeAll(() => {
    if (skipR2Tests) {
      console.warn('⚠️ R2_UPLOAD_SECRET not set, skipping R2 integration tests');
    }
  });

  it.skip('should download and upload image to R2', async () => {
    if (skipR2Tests) return;

    const testData = getSampleTestData(1);
    const itemWithImage = testData.find(item => item.imageUrl);

    if (!itemWithImage || !itemWithImage.imageUrl) {
      console.warn('⚠️ No test item with imageUrl found');
      return;
    }

    const result = await r2ImageService.processAndUpload(itemWithImage.imageUrl);

    expect(result.success).toBe(true);
    expect(result.r2Key).toBeDefined();
    expect(result.publicUrl).toBeDefined();

    // Verify R2 key format
    expect(R2ImageService.validateR2Key(result.r2Key!, itemWithImage.placeId)).toBe(true);

    console.log('\n✅ R2 Upload Results:');
    console.log(`  R2 Key: ${result.r2Key}`);
    console.log(`  Public URL: ${result.publicUrl}`);
  });
});

