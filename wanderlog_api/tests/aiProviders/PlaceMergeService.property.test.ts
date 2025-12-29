/**
 * Property-Based Tests for Place Merge Service
 * 
 * Feature: apify-data-import
 * 
 * Property 2: Deduplication by PlaceId
 * *For any* set of Apify items containing duplicates (same placeId), importing them 
 * should result in exactly one Place record per unique placeId
 * 
 * **Validates: Requirements 2.1, 2.2**
 * 
 * Property 3: Non-Null Overwrite
 * *For any* conflict where existing record has a non-null value and incoming has null, 
 * the existing value should be preserved; if incoming is non-null, it should overwrite
 * 
 * **Validates: Requirements 2.3**
 * 
 * Property 4: Take Greater
 * *For any* conflict on ratingCount, the merged result should have the greater value; 
 * rating should come from the side with greater ratingCount
 * 
 * **Validates: Requirements 2.4**
 * 
 * Property 5: Take Newer
 * *For any* conflict on openingHours, the merged result should have the value from 
 * the record with more recent scrapedAt
 * 
 * **Validates: Requirements 2.5**
 * 
 * Property 6: SearchHits Append
 * *For any* conflict, sourceDetails.apify.searchHits should be the union of existing 
 * and incoming hits (no duplicates, no overwrites)
 * 
 * **Validates: Requirements 2.6**
 */

import * as fc from 'fast-check';
import { PlaceMergeService } from '../../src/services/placeMergeService';
import {
  MappedPlace,
  SearchHit,
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
 * Generator for non-empty strings
 */
const nonEmptyStringArbitrary = fc.string({ minLength: 1, maxLength: 100 })
  .filter(s => s.trim().length > 0);

/**
 * Generator for optional strings
 */
const optionalStringArbitrary = fc.option(
  fc.string({ minLength: 1, maxLength: 200 }),
  { nil: undefined }
);

/**
 * Generator for Google Place ID format
 */
const placeIdArbitrary = fc.stringMatching(/^ChIJ[A-Za-z0-9_-]{20,30}$/);

/**
 * Generator for ISO timestamp
 */
const timestampArbitrary = fc.integer({ 
  min: new Date('2020-01-01').getTime(), 
  max: new Date('2025-12-31').getTime() 
}).map(ts => new Date(ts).toISOString());

/**
 * Generator for SearchHit
 */
const searchHitArbitrary: fc.Arbitrary<SearchHit> = fc.record({
  searchString: nonEmptyStringArbitrary,
  rank: fc.integer({ min: 1, max: 100 }),
  scrapedAt: timestampArbitrary,
  searchPageUrl: optionalStringArbitrary,
});

/**
 * Helper to create a mock Place object for testing
 * We use 'any' to bypass Prisma's strict JsonValue typing
 */
function createMockPlace(overrides: Record<string, unknown> = {}): any {
  const basePlace = {
    id: 'test-uuid-' + Math.random().toString(36).substr(2, 9),
    name: 'Test Place',
    latitude: 48.8566,
    longitude: 2.3522,
    address: null,
    city: null,
    country: null,
    rating: null,
    ratingCount: null,
    googlePlaceId: null,
    website: null,
    phoneNumber: null,
    openingHours: null,
    description: null,
    source: 'apify_google_places',
    sourceDetails: {
      apify: {
        scrapedAt: new Date().toISOString(),
        searchHits: [],
      },
    },
    customFields: {},
    category: null,
    categorySlug: null,
    categoryEn: null,
    categoryZh: null,
    coverImage: null,
    photoReference: null,
    images: [],
    priceLevel: null,
    aiSummary: null,
    aiDescription: null,
    tags: {},
    aiTags: [],
    i18n: null,
    sourceDetail: null,
    isVerified: false,
    lastSyncedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  return basePlace;
}

/**
 * Generator for existing Place record (simulating database record)
 */
const existingPlaceArbitrary = fc.record({
  id: fc.uuid(),
  name: nonEmptyStringArbitrary,
  latitude: latitudeArbitrary,
  longitude: longitudeArbitrary,
  address: fc.option(nonEmptyStringArbitrary, { nil: null }),
  city: fc.option(nonEmptyStringArbitrary, { nil: null }),
  country: fc.option(nonEmptyStringArbitrary, { nil: null }),
  rating: fc.option(fc.double({ min: 0, max: 5, noNaN: true }), { nil: null }),
  ratingCount: fc.option(fc.integer({ min: 0, max: 100000 }), { nil: null }),
  googlePlaceId: fc.option(placeIdArbitrary, { nil: null }),
  website: fc.option(nonEmptyStringArbitrary, { nil: null }),
  phoneNumber: fc.option(nonEmptyStringArbitrary, { nil: null }),
  openingHours: fc.option(nonEmptyStringArbitrary, { nil: null }),
  description: fc.option(nonEmptyStringArbitrary, { nil: null }),
  sourceDetails: fc.record({
    apify: fc.record({
      scrapedAt: timestampArbitrary,
      searchHits: fc.array(searchHitArbitrary, { minLength: 0, maxLength: 3 }),
    }),
  }),
}).map(data => createMockPlace(data));

// ============================================
// Helper Functions
// ============================================

const mergeService = new PlaceMergeService();

// ============================================
// Property Tests
// ============================================

describe('Place Merge Service Property-Based Tests', () => {
  
  /**
   * Feature: apify-data-import, Property 2: Deduplication by PlaceId
   * 
   * *For any* set of Apify items containing duplicates (same placeId), importing them 
   * should result in exactly one Place record per unique placeId
   * 
   * **Validates: Requirements 2.1, 2.2**
   * 
   * Note: This property is tested at the merge level - the merge function should
   * produce a single merged result when given an existing record and incoming data.
   */
  describe('Property 2: Deduplication by PlaceId', () => {
    
    it('should produce exactly one merged result when merging existing and incoming with same placeId', () => {
      fc.assert(
        fc.property(
          existingPlaceArbitrary,
          nonEmptyStringArbitrary,
          (existing, incomingName) => {
            // Ensure both have the same googlePlaceId
            const placeId = existing.googlePlaceId || 'ChIJtest123456789012345678';
            const existingWithId = { ...existing, googlePlaceId: placeId };
            
            const incoming: MappedPlace = {
              name: incomingName,
              latitude: 0,
              longitude: 0,
              googlePlaceId: placeId,
              source: 'apify_google_places',
              sourceDetails: {
                apify: {
                  scrapedAt: new Date().toISOString(),
                  searchHits: [],
                },
              },
              customFields: {},
            };
            
            const merged = mergeService.merge(existingWithId, incoming);
            
            // Should produce exactly one result
            return merged !== null && 
                   merged !== undefined &&
                   merged.googlePlaceId === placeId;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve the existing record id when merging', () => {
      fc.assert(
        fc.property(
          existingPlaceArbitrary,
          nonEmptyStringArbitrary,
          (existing, incomingName) => {
            const incoming: MappedPlace = {
              name: incomingName,
              latitude: 0,
              longitude: 0,
              source: 'apify_google_places',
              sourceDetails: {
                apify: {
                  scrapedAt: new Date().toISOString(),
                  searchHits: [],
                },
              },
              customFields: {},
            };
            
            const merged = mergeService.merge(existing, incoming);
            
            // The merged result should have the existing record's id
            return merged.id === existing.id;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


  /**
   * Feature: apify-data-import, Property 3: Non-Null Overwrite
   * 
   * *For any* conflict where existing record has a non-null value and incoming has null, 
   * the existing value should be preserved; if incoming is non-null, it should overwrite
   * 
   * **Validates: Requirements 2.3**
   */
  describe('Property 3: Non-Null Overwrite', () => {
    
    it('should preserve existing non-null values when incoming is null/undefined', () => {
      fc.assert(
        fc.property(
          existingPlaceArbitrary,
          (existing) => {
            // Create incoming with all null/undefined optional fields
            const incoming: MappedPlace = {
              name: 'Test Name',
              latitude: 0,
              longitude: 0,
              address: undefined,
              city: undefined,
              country: undefined,
              rating: undefined,
              ratingCount: undefined,
              googlePlaceId: existing.googlePlaceId ?? undefined,
              website: undefined,
              phoneNumber: undefined,
              openingHours: undefined,
              description: undefined,
              source: 'apify_google_places',
              sourceDetails: {
                apify: {
                  scrapedAt: new Date().toISOString(),
                  searchHits: [],
                },
              },
              customFields: {},
            };
            
            const merged = mergeService.merge(existing, incoming);
            
            // Existing non-null values should be preserved
            if (existing.address !== null) {
              if (merged.address !== existing.address) return false;
            }
            if (existing.website !== null) {
              if (merged.website !== existing.website) return false;
            }
            if (existing.phoneNumber !== null) {
              if (merged.phoneNumber !== existing.phoneNumber) return false;
            }
            if (existing.description !== null) {
              if (merged.description !== existing.description) return false;
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should overwrite existing values when incoming has non-null values', () => {
      fc.assert(
        fc.property(
          existingPlaceArbitrary,
          nonEmptyStringArbitrary,
          nonEmptyStringArbitrary,
          nonEmptyStringArbitrary,
          nonEmptyStringArbitrary,
          (existing, newAddress, newWebsite, newPhone, newDesc) => {
            const incoming: MappedPlace = {
              name: 'New Name',
              latitude: 0,
              longitude: 0,
              address: newAddress,
              city: undefined,
              country: undefined,
              rating: undefined,
              ratingCount: undefined,
              googlePlaceId: existing.googlePlaceId ?? undefined,
              website: newWebsite,
              phoneNumber: newPhone,
              openingHours: undefined,
              description: newDesc,
              source: 'apify_google_places',
              sourceDetails: {
                apify: {
                  scrapedAt: new Date().toISOString(),
                  searchHits: [],
                },
              },
              customFields: {},
            };
            
            const merged = mergeService.merge(existing, incoming);
            
            // Incoming non-null values should overwrite
            return merged.name === 'New Name' &&
                   merged.address === newAddress &&
                   merged.website === newWebsite &&
                   merged.phoneNumber === newPhone &&
                   merged.description === newDesc;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: apify-data-import, Property 4: Take Greater
   * 
   * *For any* conflict on ratingCount, the merged result should have the greater value; 
   * rating should come from the side with greater ratingCount
   * 
   * **Validates: Requirements 2.4**
   */
  describe('Property 4: Take Greater', () => {
    
    it('should take the greater ratingCount value', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100000 }),
          fc.integer({ min: 0, max: 100000 }),
          fc.double({ min: 0, max: 5, noNaN: true }),
          fc.double({ min: 0, max: 5, noNaN: true }),
          (existingCount, incomingCount, existingRating, incomingRating) => {
            const existing = createMockPlace({ 
              ratingCount: existingCount,
              rating: existingRating,
            });
            
            const incoming: MappedPlace = {
              name: 'Test',
              latitude: 0,
              longitude: 0,
              source: 'apify_google_places',
              ratingCount: incomingCount,
              rating: incomingRating,
              sourceDetails: {
                apify: {
                  scrapedAt: new Date().toISOString(),
                  searchHits: [],
                },
              },
              customFields: {},
            };
            
            const merged = mergeService.merge(existing, incoming);
            
            // The greater ratingCount should be used
            const expectedCount = Math.max(existingCount, incomingCount);
            if (merged.ratingCount !== expectedCount) return false;
            
            // Rating should come from the side with greater ratingCount
            if (incomingCount > existingCount) {
              return merged.rating === incomingRating;
            } else if (existingCount > incomingCount) {
              return merged.rating === existingRating;
            } else {
              // If equal, incoming rating is preferred if available
              return merged.rating === incomingRating || merged.rating === existingRating;
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: apify-data-import, Property 5: Take Newer
   * 
   * *For any* conflict on openingHours, the merged result should have the value from 
   * the record with more recent scrapedAt
   * 
   * **Validates: Requirements 2.5**
   */
  describe('Property 5: Take Newer', () => {
    
    it('should take openingHours from the record with more recent scrapedAt', () => {
      fc.assert(
        fc.property(
          nonEmptyStringArbitrary,
          nonEmptyStringArbitrary,
          fc.integer({ min: new Date('2020-01-01').getTime(), max: new Date('2023-01-01').getTime() }),
          fc.integer({ min: new Date('2023-01-02').getTime(), max: new Date('2025-12-31').getTime() }),
          (existingHours, incomingHours, olderTs, newerTs) => {
            const olderDate = new Date(olderTs).toISOString();
            const newerDate = new Date(newerTs).toISOString();
            
            // Test case 1: incoming is newer
            const existingOlder = createMockPlace({
              openingHours: existingHours,
              sourceDetails: {
                apify: {
                  scrapedAt: olderDate,
                  searchHits: [],
                },
              },
            });
            
            const incomingNewer: MappedPlace = {
              name: 'Test',
              latitude: 0,
              longitude: 0,
              source: 'apify_google_places',
              openingHours: incomingHours,
              sourceDetails: {
                apify: {
                  scrapedAt: newerDate,
                  searchHits: [],
                },
              },
              customFields: {},
            };
            
            const merged1 = mergeService.merge(existingOlder, incomingNewer);
            if (merged1.openingHours !== incomingHours) return false;
            
            // Test case 2: existing is newer
            const existingNewer = createMockPlace({
              openingHours: existingHours,
              sourceDetails: {
                apify: {
                  scrapedAt: newerDate,
                  searchHits: [],
                },
              },
            });
            
            const incomingOlder: MappedPlace = {
              name: 'Test',
              latitude: 0,
              longitude: 0,
              source: 'apify_google_places',
              openingHours: incomingHours,
              sourceDetails: {
                apify: {
                  scrapedAt: olderDate,
                  searchHits: [],
                },
              },
              customFields: {},
            };
            
            const merged2 = mergeService.merge(existingNewer, incomingOlder);
            // Existing hours should be preserved when existing is newer
            return merged2.openingHours === existingHours;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: apify-data-import, Property 6: SearchHits Append
   * 
   * *For any* conflict, sourceDetails.apify.searchHits should be the union of existing 
   * and incoming hits (no duplicates, no overwrites)
   * 
   * **Validates: Requirements 2.6**
   */
  describe('Property 6: SearchHits Append', () => {
    
    it('should append searchHits without duplicates', () => {
      fc.assert(
        fc.property(
          fc.array(searchHitArbitrary, { minLength: 1, maxLength: 3 }),
          fc.array(searchHitArbitrary, { minLength: 1, maxLength: 3 }),
          (existingHits, incomingHits) => {
            const existing = createMockPlace({
              sourceDetails: {
                apify: {
                  scrapedAt: new Date().toISOString(),
                  searchHits: existingHits,
                },
              },
            });
            
            const incoming: MappedPlace = {
              name: 'Test',
              latitude: 0,
              longitude: 0,
              source: 'apify_google_places',
              sourceDetails: {
                apify: {
                  scrapedAt: new Date().toISOString(),
                  searchHits: incomingHits,
                },
              },
              customFields: {},
            };
            
            const merged = mergeService.merge(existing, incoming);
            const mergedHits = merged.sourceDetails.apify.searchHits;
            
            // All existing hits should be present
            for (const hit of existingHits) {
              const found = mergedHits.some(
                (h: SearchHit) => h.searchString === hit.searchString && h.scrapedAt === hit.scrapedAt
              );
              if (!found) return false;
            }
            
            // All incoming hits should be present (unless duplicate)
            for (const hit of incomingHits) {
              const isDuplicate = existingHits.some(
                h => h.searchString === hit.searchString && h.scrapedAt === hit.scrapedAt
              );
              if (!isDuplicate) {
                const found = mergedHits.some(
                  (h: SearchHit) => h.searchString === hit.searchString && h.scrapedAt === hit.scrapedAt
                );
                if (!found) return false;
              }
            }
            
            // No duplicates in merged result
            const hitKeys = mergedHits.map((h: SearchHit) => `${h.searchString}|${h.scrapedAt}`);
            const uniqueKeys = new Set(hitKeys);
            if (hitKeys.length !== uniqueKeys.size) return false;
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve all existing searchHits', () => {
      fc.assert(
        fc.property(
          fc.array(searchHitArbitrary, { minLength: 1, maxLength: 5 }),
          (existingHits) => {
            const existing = createMockPlace({
              sourceDetails: {
                apify: {
                  scrapedAt: new Date().toISOString(),
                  searchHits: existingHits,
                },
              },
            });
            
            const incoming: MappedPlace = {
              name: 'Test',
              latitude: 0,
              longitude: 0,
              source: 'apify_google_places',
              sourceDetails: {
                apify: {
                  scrapedAt: new Date().toISOString(),
                  searchHits: [], // Empty incoming hits
                },
              },
              customFields: {},
            };
            
            const merged = mergeService.merge(existing, incoming);
            const mergedHits = merged.sourceDetails.apify.searchHits;
            
            // All existing hits should be preserved
            return existingHits.every(hit =>
              mergedHits.some(
                (h: SearchHit) => h.searchString === hit.searchString && h.scrapedAt === hit.scrapedAt
              )
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });
