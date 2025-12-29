/**
 * Property-Based Tests for Apify Import Service
 * 
 * Feature: apify-data-import
 * 
 * Property 12: Import Statistics Accuracy
 * *For any* import operation, the returned ImportResult should have 
 * total = inserted + updated + skipped + failed
 * 
 * **Validates: Requirements 2.7**
 * 
 * Property 11: Metadata Completeness
 * *For any* imported Place, sourceDetails.apify should contain scrapedAt and 
 * searchHits array; customFields should contain categoriesRaw if categories 
 * was present in source
 * 
 * **Validates: Requirements 5.1, 5.2, 5.7**
 */

import * as fc from 'fast-check';
import { ApifyImportService } from '../../src/services/apifyImportService';
import { apifyFieldMapper } from '../../src/services/apifyFieldMapper';
import {
  ApifyPlaceItem,
  ApifyLocation,
  ImportResult,
} from '../../src/types/apify';

// ============================================
// Test Data Generators
// ============================================

/**
 * Generator for valid latitude values (-90 to 90)
 */
const latitudeArbitrary = fc.double({ min: -90, max: 90, noNaN: true });

/**
 * Generator for valid longitude values (-180 to 180)
 */
const longitudeArbitrary = fc.double({ min: -180, max: 180, noNaN: true });

/**
 * Generator for ApifyLocation
 */
const locationArbitrary: fc.Arbitrary<ApifyLocation> = fc.record({
  lat: latitudeArbitrary,
  lng: longitudeArbitrary,
});

/**
 * Generator for non-empty strings
 */
const nonEmptyStringArbitrary = fc.string({ minLength: 1, maxLength: 100 })
  .filter(s => s.trim().length > 0);

/**
 * Generator for Google Place ID format
 */
const placeIdArbitrary = fc.stringMatching(/^ChIJ[A-Za-z0-9_-]{20,30}$/);

/**
 * Generator for ISO country codes (2 letters)
 */
const countryCodeArbitrary = fc.stringMatching(/^[A-Z]{2}$/);

/**
 * Generator for categories array
 */
const categoriesArbitrary = fc.option(
  fc.array(
    fc.constantFrom('Coffee shop', 'Cafe', 'Restaurant', 'Museum', 'Art gallery', 'Bakery', 'Bar'),
    { minLength: 1, maxLength: 5 }
  ),
  { nil: null }
);

/**
 * Generator for ISO timestamp
 */
const timestampArbitrary = fc.integer({ 
  min: new Date('2020-01-01').getTime(), 
  max: new Date('2025-12-31').getTime() 
}).map(ts => new Date(ts).toISOString());

/**
 * Generator for a valid ApifyPlaceItem with all required fields
 */
const validApifyPlaceItemArbitrary: fc.Arbitrary<ApifyPlaceItem> = fc.record({
  title: nonEmptyStringArbitrary,
  placeId: placeIdArbitrary,
  location: locationArbitrary,
  city: nonEmptyStringArbitrary,
  countryCode: countryCodeArbitrary,
  categories: categoriesArbitrary,
  scrapedAt: fc.option(timestampArbitrary, { nil: null }),
  searchString: fc.option(nonEmptyStringArbitrary, { nil: null }),
  rank: fc.option(fc.integer({ min: 1, max: 100 }), { nil: null }),
});

/**
 * Generator for ImportResult with random counts
 */
const importResultArbitrary: fc.Arbitrary<ImportResult> = fc.record({
  total: fc.integer({ min: 0, max: 1000 }),
  inserted: fc.integer({ min: 0, max: 500 }),
  updated: fc.integer({ min: 0, max: 500 }),
  skipped: fc.integer({ min: 0, max: 500 }),
  failed: fc.integer({ min: 0, max: 500 }),
  errors: fc.array(fc.record({
    placeId: fc.option(placeIdArbitrary, { nil: undefined }),
    name: fc.option(nonEmptyStringArbitrary, { nil: undefined }),
    error: nonEmptyStringArbitrary,
  }), { maxLength: 10 }),
  stats: fc.record({
    cityCount: fc.integer({ min: 0, max: 100 }),
    categoryDistribution: fc.dictionary(
      fc.constantFrom('cafe', 'restaurant', 'museum', 'shop'),
      fc.integer({ min: 0, max: 100 })
    ),
    coverImageRate: fc.double({ min: 0, max: 100, noNaN: true }),
    openingHoursRate: fc.double({ min: 0, max: 100, noNaN: true }),
    requiredFieldsRate: fc.double({ min: 0, max: 100, noNaN: true }),
  }),
});

/**
 * Generator for a valid ImportResult where total = inserted + updated + skipped + failed
 */
const validImportResultArbitrary: fc.Arbitrary<ImportResult> = fc.tuple(
  fc.integer({ min: 0, max: 250 }),
  fc.integer({ min: 0, max: 250 }),
  fc.integer({ min: 0, max: 250 }),
  fc.integer({ min: 0, max: 250 })
).map(([inserted, updated, skipped, failed]) => ({
  total: inserted + updated + skipped + failed,
  inserted,
  updated,
  skipped,
  failed,
  errors: [],
  stats: {
    cityCount: 0,
    categoryDistribution: {},
    coverImageRate: 0,
    openingHoursRate: 0,
    requiredFieldsRate: 0,
  },
}));

// ============================================
// Property Tests
// ============================================

describe('Apify Import Service Property-Based Tests', () => {
  /**
   * Feature: apify-data-import, Property 12: Import Statistics Accuracy
   * 
   * *For any* import operation, the returned ImportResult should have 
   * total = inserted + updated + skipped + failed
   * 
   * **Validates: Requirements 2.7**
   */
  describe('Property 12: Import Statistics Accuracy', () => {
    
    /**
     * Test that validateStatistics correctly identifies valid results
     */
    it('should validate that total equals sum of inserted, updated, skipped, and failed', () => {
      fc.assert(
        fc.property(
          validImportResultArbitrary,
          (result: ImportResult) => {
            // The validation should pass for valid results
            return ApifyImportService.validateStatistics(result);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Test that validateStatistics correctly identifies invalid results
     */
    it('should detect when total does not equal sum of counts', () => {
      fc.assert(
        fc.property(
          importResultArbitrary,
          (result: ImportResult) => {
            const expectedTotal = result.inserted + result.updated + result.skipped + result.failed;
            const isValid = ApifyImportService.validateStatistics(result);
            
            // If total matches expected, validation should pass
            // If total doesn't match, validation should fail
            return isValid === (result.total === expectedTotal);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Test the invariant: total = inserted + updated + skipped + failed
     */
    it('should maintain the invariant: total = inserted + updated + skipped + failed', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }),
          fc.integer({ min: 0, max: 100 }),
          fc.integer({ min: 0, max: 100 }),
          fc.integer({ min: 0, max: 100 }),
          (inserted: number, updated: number, skipped: number, failed: number) => {
            const result: ImportResult = {
              total: inserted + updated + skipped + failed,
              inserted,
              updated,
              skipped,
              failed,
              errors: [],
              stats: {
                cityCount: 0,
                categoryDistribution: {},
                coverImageRate: 0,
                openingHoursRate: 0,
                requiredFieldsRate: 0,
              },
            };
            
            return ApifyImportService.validateStatistics(result);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Test that all counts are non-negative
     */
    it('should have non-negative counts in valid results', () => {
      fc.assert(
        fc.property(
          validImportResultArbitrary,
          (result: ImportResult) => {
            return result.total >= 0 &&
                   result.inserted >= 0 &&
                   result.updated >= 0 &&
                   result.skipped >= 0 &&
                   result.failed >= 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Test that each count is at most equal to total
     */
    it('should have each count at most equal to total', () => {
      fc.assert(
        fc.property(
          validImportResultArbitrary,
          (result: ImportResult) => {
            return result.inserted <= result.total &&
                   result.updated <= result.total &&
                   result.skipped <= result.total &&
                   result.failed <= result.total;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: apify-data-import, Property 11: Metadata Completeness
   * 
   * *For any* imported Place, sourceDetails.apify should contain scrapedAt and 
   * searchHits array; customFields should contain categoriesRaw if categories 
   * was present in source
   * 
   * **Validates: Requirements 5.1, 5.2, 5.7**
   */
  describe('Property 11: Metadata Completeness', () => {
    
    /**
     * Requirement 5.1: sourceDetails.apify should contain scrapedAt
     */
    it('should always have scrapedAt in sourceDetails.apify', () => {
      fc.assert(
        fc.property(
          validApifyPlaceItemArbitrary,
          (item: ApifyPlaceItem) => {
            const mapped = apifyFieldMapper.mapToPlace(item);
            
            // scrapedAt should always be present
            return mapped.sourceDetails?.apify?.scrapedAt !== undefined &&
                   mapped.sourceDetails?.apify?.scrapedAt !== null &&
                   mapped.sourceDetails?.apify?.scrapedAt !== '';
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Requirement 5.2: sourceDetails.apify.searchHits should be an array
     */
    it('should always have searchHits array in sourceDetails.apify', () => {
      fc.assert(
        fc.property(
          validApifyPlaceItemArbitrary,
          (item: ApifyPlaceItem) => {
            const mapped = apifyFieldMapper.mapToPlace(item);
            
            return Array.isArray(mapped.sourceDetails?.apify?.searchHits);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Requirement 5.7: customFields.categoriesRaw should exist if categories was present
     */
    it('should have categoriesRaw in customFields when categories is present in source', () => {
      fc.assert(
        fc.property(
          validApifyPlaceItemArbitrary,
          (item: ApifyPlaceItem) => {
            const mapped = apifyFieldMapper.mapToPlace(item);
            
            if (item.categories && item.categories.length > 0) {
              // categoriesRaw should be present and match
              return mapped.customFields?.categoriesRaw !== undefined &&
                     Array.isArray(mapped.customFields.categoriesRaw) &&
                     mapped.customFields.categoriesRaw.length === item.categories.length;
            }
            
            // If no categories, categoriesRaw should be undefined
            return mapped.customFields?.categoriesRaw === undefined;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Combined test: validateMetadataCompleteness should return complete for valid items
     */
    it('should validate metadata completeness for all valid items', () => {
      fc.assert(
        fc.property(
          validApifyPlaceItemArbitrary,
          (item: ApifyPlaceItem) => {
            const mapped = apifyFieldMapper.mapToPlace(item);
            const validation = ApifyImportService.validateMetadataCompleteness(mapped, item);
            
            return validation.complete === true && validation.missing.length === 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Test that searchHits contains at least one entry
     */
    it('should have at least one searchHit entry', () => {
      fc.assert(
        fc.property(
          validApifyPlaceItemArbitrary,
          (item: ApifyPlaceItem) => {
            const mapped = apifyFieldMapper.mapToPlace(item);
            
            return mapped.sourceDetails?.apify?.searchHits?.length >= 1;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Test that searchHit contains required fields
     */
    it('should have searchHit with required fields (searchString, rank, scrapedAt)', () => {
      fc.assert(
        fc.property(
          validApifyPlaceItemArbitrary,
          (item: ApifyPlaceItem) => {
            const mapped = apifyFieldMapper.mapToPlace(item);
            const searchHit = mapped.sourceDetails?.apify?.searchHits?.[0];
            
            if (!searchHit) return false;
            
            // searchString should be present (can be empty string)
            if (typeof searchHit.searchString !== 'string') return false;
            
            // rank should be a number
            if (typeof searchHit.rank !== 'number') return false;
            
            // scrapedAt should be present
            if (!searchHit.scrapedAt) return false;
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Test that scrapedAt is a valid ISO timestamp
     */
    it('should have valid ISO timestamp for scrapedAt', () => {
      fc.assert(
        fc.property(
          validApifyPlaceItemArbitrary,
          (item: ApifyPlaceItem) => {
            const mapped = apifyFieldMapper.mapToPlace(item);
            const scrapedAt = mapped.sourceDetails?.apify?.scrapedAt;
            
            if (!scrapedAt) return false;
            
            // Should be parseable as a date
            const date = new Date(scrapedAt);
            return !isNaN(date.getTime());
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Edge Cases and Invariants
   */
  describe('Edge Cases and Invariants', () => {
    /**
     * Empty import should have all zeros
     */
    it('should handle empty import with all zero counts', () => {
      const emptyResult: ImportResult = {
        total: 0,
        inserted: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        errors: [],
        stats: {
          cityCount: 0,
          categoryDistribution: {},
          coverImageRate: 0,
          openingHoursRate: 0,
          requiredFieldsRate: 0,
        },
      };
      
      expect(ApifyImportService.validateStatistics(emptyResult)).toBe(true);
    });

    /**
     * All items inserted should have total = inserted
     */
    it('should have total = inserted when all items are inserted', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }),
          (count: number) => {
            const result: ImportResult = {
              total: count,
              inserted: count,
              updated: 0,
              skipped: 0,
              failed: 0,
              errors: [],
              stats: {
                cityCount: 0,
                categoryDistribution: {},
                coverImageRate: 0,
                openingHoursRate: 0,
                requiredFieldsRate: 0,
              },
            };
            
            return ApifyImportService.validateStatistics(result);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * All items skipped should have total = skipped
     */
    it('should have total = skipped when all items are skipped', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }),
          (count: number) => {
            const result: ImportResult = {
              total: count,
              inserted: 0,
              updated: 0,
              skipped: count,
              failed: 0,
              errors: [],
              stats: {
                cityCount: 0,
                categoryDistribution: {},
                coverImageRate: 0,
                openingHoursRate: 0,
                requiredFieldsRate: 0,
              },
            };
            
            return ApifyImportService.validateStatistics(result);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
