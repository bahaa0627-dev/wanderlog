/**
 * Property-Based Tests for Apify Field Mapper Service
 * 
 * Feature: apify-data-import
 * 
 * Property 1: Field Mapping Correctness
 * *For any* valid Apify place item, mapping to Place should preserve all non-null 
 * source values in their corresponding target fields (title→name, location.lat→latitude, 
 * location.lng→longitude, etc.)
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 1.13**
 */

import * as fc from 'fast-check';
import { ApifyFieldMapper, APIFY_SOURCE, convertCountryCode } from '../../src/services/apifyFieldMapper';
import {
  ApifyPlaceItem,
  ApifyLocation,
  ApifyOpeningHoursEntry,
  ApifyReviewTag,
  ApifyReviewsDistribution,
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
 * Generator for non-empty strings (for required fields like title)
 */
const nonEmptyStringArbitrary = fc.string({ minLength: 1, maxLength: 100 })
  .filter(s => s.trim().length > 0);

/**
 * Generator for optional strings
 */
const optionalStringArbitrary = fc.option(
  fc.string({ minLength: 1, maxLength: 200 }),
  { nil: null }
);

/**
 * Generator for Google Place ID format
 */
const placeIdArbitrary = fc.stringMatching(/^ChIJ[A-Za-z0-9_-]{20,30}$/);

/**
 * Generator for ISO country codes (2 letters)
 */
const countryCodeArbitrary = fc.stringMatching(/^[A-Z]{2}$/);

/**
 * Generator for rating (0-5)
 */
const ratingArbitrary = fc.option(
  fc.double({ min: 0, max: 5, noNaN: true }),
  { nil: null }
);

/**
 * Generator for review count
 */
const reviewCountArbitrary = fc.option(
  fc.integer({ min: 0, max: 100000 }),
  { nil: null }
);

/**
 * Generator for phone numbers
 */
const phoneArbitrary = fc.option(
  fc.stringMatching(/^\+?[0-9\s\-()]{7,20}$/),
  { nil: null }
);

/**
 * Generator for opening hours entry
 */
const openingHoursEntryArbitrary: fc.Arbitrary<ApifyOpeningHoursEntry> = fc.record({
  day: fc.constantFrom('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'),
  hours: fc.stringMatching(/^[0-9]{1,2}:[0-9]{2}\s*[-–]\s*[0-9]{1,2}:[0-9]{2}$/),
});

/**
 * Generator for opening hours array
 */
const openingHoursArbitrary = fc.option(
  fc.array(openingHoursEntryArbitrary, { minLength: 1, maxLength: 7 }),
  { nil: null }
);

/**
 * Generator for price text
 */
const priceArbitrary = fc.option(
  fc.constantFrom('€1–10', '€10–20', '€20–40', '€40+', '$', '$$', '$$$', '$$$$'),
  { nil: null }
);

/**
 * Generator for review tags
 */
const reviewTagArbitrary: fc.Arbitrary<ApifyReviewTag> = fc.record({
  title: nonEmptyStringArbitrary,
  count: fc.integer({ min: 1, max: 1000 }),
});

/**
 * Generator for reviews distribution
 */
const reviewsDistributionArbitrary: fc.Arbitrary<ApifyReviewsDistribution> = fc.record({
  oneStar: fc.integer({ min: 0, max: 10000 }),
  twoStar: fc.integer({ min: 0, max: 10000 }),
  threeStar: fc.integer({ min: 0, max: 10000 }),
  fourStar: fc.integer({ min: 0, max: 10000 }),
  fiveStar: fc.integer({ min: 0, max: 10000 }),
});

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
 * Using integer-based approach to avoid invalid date issues
 */
const timestampArbitrary = fc.integer({ 
  min: new Date('2020-01-01').getTime(), 
  max: new Date('2025-12-31').getTime() 
}).map(ts => new Date(ts).toISOString());

/**
 * Generator for URL
 */
const urlArbitrary = fc.option(
  fc.webUrl(),
  { nil: null }
);

/**
 * Generator for fid (hex format)
 */
const fidArbitrary = fc.option(
  fc.stringMatching(/^0x[0-9a-f]{16}:0x[0-9a-f]{16}$/),
  { nil: null }
);

/**
 * Generator for cid (numeric string)
 */
const cidArbitrary = fc.option(
  fc.stringMatching(/^[0-9]{15,20}$/),
  { nil: null }
);

/**
 * Generator for rank
 */
const rankArbitrary = fc.option(
  fc.integer({ min: 1, max: 100 }),
  { nil: null }
);

/**
 * Generator for a minimal valid ApifyPlaceItem (required fields only)
 */
const minimalApifyPlaceItemArbitrary: fc.Arbitrary<ApifyPlaceItem> = fc.record({
  title: nonEmptyStringArbitrary,
  placeId: placeIdArbitrary,
  location: locationArbitrary,
});

/**
 * Generator for a complete ApifyPlaceItem with all optional fields
 */
const completeApifyPlaceItemArbitrary: fc.Arbitrary<ApifyPlaceItem> = fc.record({
  // Required fields
  title: nonEmptyStringArbitrary,
  placeId: placeIdArbitrary,
  location: locationArbitrary,
  
  // Optional basic fields
  subTitle: optionalStringArbitrary,
  price: priceArbitrary,
  categoryName: optionalStringArbitrary,
  description: optionalStringArbitrary,
  
  // Address fields
  address: optionalStringArbitrary,
  neighborhood: optionalStringArbitrary,
  street: optionalStringArbitrary,
  city: optionalStringArbitrary,
  postalCode: optionalStringArbitrary,
  state: optionalStringArbitrary,
  countryCode: fc.option(countryCodeArbitrary, { nil: null }),
  
  // Contact
  website: urlArbitrary,
  phone: phoneArbitrary,
  phoneUnformatted: phoneArbitrary,
  
  // Ratings
  totalScore: ratingArbitrary,
  reviewsCount: reviewCountArbitrary,
  reviewsDistribution: fc.option(reviewsDistributionArbitrary, { nil: null }),
  
  // Categories
  categories: categoriesArbitrary,
  
  // Google IDs
  fid: fidArbitrary,
  cid: cidArbitrary,
  kgmid: optionalStringArbitrary,
  
  // Opening hours
  openingHours: openingHoursArbitrary,
  
  // Review tags
  reviewsTags: fc.option(fc.array(reviewTagArbitrary, { minLength: 1, maxLength: 10 }), { nil: null }),
  
  // Scraping metadata
  scrapedAt: fc.option(timestampArbitrary, { nil: null }),
  url: urlArbitrary,
  searchPageUrl: urlArbitrary,
  searchString: optionalStringArbitrary,
  rank: rankArbitrary,
  
  // Image
  imageUrl: urlArbitrary,
});

// ============================================
// Helper Functions
// ============================================

const mapper = new ApifyFieldMapper();

// ============================================
// Property Tests
// ============================================

describe('Apify Field Mapper Property-Based Tests', () => {
  /**
   * Feature: apify-data-import, Property 1: Field Mapping Correctness
   * 
   * *For any* valid Apify place item, mapping to Place should preserve all non-null 
   * source values in their corresponding target fields.
   * 
   * **Validates: Requirements 1.1-1.13**
   */
  describe('Property 1: Field Mapping Correctness', () => {
    
    /**
     * Requirement 1.1: title → name
     */
    it('should map title to name for all valid inputs', () => {
      fc.assert(
        fc.property(
          completeApifyPlaceItemArbitrary,
          (item: ApifyPlaceItem) => {
            const mapped = mapper.mapToPlace(item);
            return mapped.name === item.title;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Requirement 1.2: location.lat/lng → latitude/longitude
     */
    it('should map location.lat to latitude and location.lng to longitude', () => {
      fc.assert(
        fc.property(
          completeApifyPlaceItemArbitrary,
          (item: ApifyPlaceItem) => {
            const mapped = mapper.mapToPlace(item);
            return mapped.latitude === item.location.lat && 
                   mapped.longitude === item.location.lng;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Requirement 1.3: address → address
     */
    it('should map address to address (preserving null as undefined)', () => {
      fc.assert(
        fc.property(
          completeApifyPlaceItemArbitrary,
          (item: ApifyPlaceItem) => {
            const mapped = mapper.mapToPlace(item);
            if (item.address === null || item.address === undefined) {
              return mapped.address === undefined;
            }
            return mapped.address === item.address;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Requirement 1.4: city → city
     */
    it('should map city to city (preserving null as undefined)', () => {
      fc.assert(
        fc.property(
          completeApifyPlaceItemArbitrary,
          (item: ApifyPlaceItem) => {
            const mapped = mapper.mapToPlace(item);
            if (item.city === null || item.city === undefined) {
              return mapped.city === undefined;
            }
            return mapped.city === item.city;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Requirement 1.5: countryCode → country (converted to full name)
     */
    it('should map countryCode to country (converting ISO2 to full name)', () => {
      fc.assert(
        fc.property(
          completeApifyPlaceItemArbitrary,
          (item: ApifyPlaceItem) => {
            const mapped = mapper.mapToPlace(item);
            if (item.countryCode === null || item.countryCode === undefined) {
              return mapped.country === undefined;
            }
            // Country code is converted to full name (e.g., FR → France)
            const expectedCountry = convertCountryCode(item.countryCode);
            return mapped.country === expectedCountry;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Requirement 1.6: totalScore → rating
     */
    it('should map totalScore to rating (preserving null as undefined)', () => {
      fc.assert(
        fc.property(
          completeApifyPlaceItemArbitrary,
          (item: ApifyPlaceItem) => {
            const mapped = mapper.mapToPlace(item);
            if (item.totalScore === null || item.totalScore === undefined) {
              return mapped.rating === undefined;
            }
            return mapped.rating === item.totalScore;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Requirement 1.7: reviewsCount → ratingCount
     */
    it('should map reviewsCount to ratingCount (preserving null as undefined)', () => {
      fc.assert(
        fc.property(
          completeApifyPlaceItemArbitrary,
          (item: ApifyPlaceItem) => {
            const mapped = mapper.mapToPlace(item);
            if (item.reviewsCount === null || item.reviewsCount === undefined) {
              return mapped.ratingCount === undefined;
            }
            return mapped.ratingCount === item.reviewsCount;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Requirement 1.8: placeId → googlePlaceId
     */
    it('should map placeId to googlePlaceId', () => {
      fc.assert(
        fc.property(
          completeApifyPlaceItemArbitrary,
          (item: ApifyPlaceItem) => {
            const mapped = mapper.mapToPlace(item);
            return mapped.googlePlaceId === item.placeId;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Requirement 1.9: website → website
     */
    it('should map website to website (preserving null as undefined)', () => {
      fc.assert(
        fc.property(
          completeApifyPlaceItemArbitrary,
          (item: ApifyPlaceItem) => {
            const mapped = mapper.mapToPlace(item);
            if (item.website === null || item.website === undefined) {
              return mapped.website === undefined;
            }
            return mapped.website === item.website;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Requirement 1.10: phoneUnformatted/phone → phoneNumber (prefer phoneUnformatted)
     */
    it('should prefer phoneUnformatted over phone for phoneNumber', () => {
      fc.assert(
        fc.property(
          completeApifyPlaceItemArbitrary,
          (item: ApifyPlaceItem) => {
            const mapped = mapper.mapToPlace(item);
            
            // If phoneUnformatted exists, it should be used
            if (item.phoneUnformatted) {
              return mapped.phoneNumber === item.phoneUnformatted;
            }
            // Otherwise, phone should be used
            if (item.phone) {
              return mapped.phoneNumber === item.phone;
            }
            // If neither exists, phoneNumber should be undefined
            return mapped.phoneNumber === undefined;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Requirement 1.11: openingHours → openingHours (JSON string)
     */
    it('should map openingHours array to JSON string', () => {
      fc.assert(
        fc.property(
          completeApifyPlaceItemArbitrary,
          (item: ApifyPlaceItem) => {
            const mapped = mapper.mapToPlace(item);
            
            if (!item.openingHours || item.openingHours.length === 0) {
              return mapped.openingHours === undefined;
            }
            
            // Should be a valid JSON string
            try {
              const parsed = JSON.parse(mapped.openingHours!);
              return Array.isArray(parsed) && parsed.length === item.openingHours.length;
            } catch {
              return false;
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Requirement 1.12: price → customFields.priceText (not converted to 0-4)
     */
    it('should store price in customFields.priceText without conversion', () => {
      fc.assert(
        fc.property(
          completeApifyPlaceItemArbitrary,
          (item: ApifyPlaceItem) => {
            const mapped = mapper.mapToPlace(item);
            
            if (item.price) {
              return mapped.customFields.priceText === item.price;
            }
            return mapped.customFields.priceText === undefined;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Requirement 1.13: description → description
     */
    it('should map description to description (preserving null as undefined)', () => {
      fc.assert(
        fc.property(
          completeApifyPlaceItemArbitrary,
          (item: ApifyPlaceItem) => {
            const mapped = mapper.mapToPlace(item);
            if (item.description === null || item.description === undefined) {
              return mapped.description === undefined;
            }
            return mapped.description === item.description;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Requirement 1.14: source = 'apify_google_places'
     */
    it('should always set source to apify_google_places', () => {
      fc.assert(
        fc.property(
          completeApifyPlaceItemArbitrary,
          (item: ApifyPlaceItem) => {
            const mapped = mapper.mapToPlace(item);
            return mapped.source === APIFY_SOURCE;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Combined test: All field mappings preserve values correctly
     */
    it('should preserve all non-null source values in corresponding target fields', () => {
      fc.assert(
        fc.property(
          completeApifyPlaceItemArbitrary,
          (item: ApifyPlaceItem) => {
            const mapped = mapper.mapToPlace(item);
            
            // Check all required mappings
            const checks = [
              mapped.name === item.title,
              mapped.latitude === item.location.lat,
              mapped.longitude === item.location.lng,
              mapped.googlePlaceId === item.placeId,
              mapped.source === APIFY_SOURCE,
            ];
            
            // Check optional mappings (null → undefined)
            if (item.address) checks.push(mapped.address === item.address);
            if (item.city) checks.push(mapped.city === item.city);
            if (item.countryCode) {
              // Country code is converted to full name (e.g., FR → France)
              const expectedCountry = convertCountryCode(item.countryCode);
              checks.push(mapped.country === expectedCountry);
            }
            if (item.totalScore !== null && item.totalScore !== undefined) {
              checks.push(mapped.rating === item.totalScore);
            }
            if (item.reviewsCount !== null && item.reviewsCount !== undefined) {
              checks.push(mapped.ratingCount === item.reviewsCount);
            }
            if (item.website) checks.push(mapped.website === item.website);
            if (item.description) checks.push(mapped.description === item.description);
            
            return checks.every(c => c === true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Source Details Extraction Tests
   * Validates Requirements 5.1, 5.2
   */
  describe('Source Details Extraction', () => {
    /**
     * Requirement 5.1: Store scrapedAt, searchString, rank, fid, cid, kgmid
     */
    it('should extract all Apify metadata to sourceDetails.apify', () => {
      fc.assert(
        fc.property(
          completeApifyPlaceItemArbitrary,
          (item: ApifyPlaceItem) => {
            const mapped = mapper.mapToPlace(item);
            const apify = mapped.sourceDetails.apify;
            
            // scrapedAt should always be present (defaults to now if not provided)
            if (!apify.scrapedAt) return false;
            
            // Other fields should match if present
            if (item.searchString && apify.searchString !== item.searchString) return false;
            if (item.rank !== null && item.rank !== undefined && apify.rank !== item.rank) return false;
            if (item.fid && apify.fid !== item.fid) return false;
            if (item.cid && apify.cid !== item.cid) return false;
            if (item.kgmid && apify.kgmid !== item.kgmid) return false;
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Requirement 5.2: Store searchHits array
     */
    it('should create searchHits array with search metadata', () => {
      fc.assert(
        fc.property(
          completeApifyPlaceItemArbitrary,
          (item: ApifyPlaceItem) => {
            const mapped = mapper.mapToPlace(item);
            const searchHits = mapped.sourceDetails.apify.searchHits;
            
            // Should have at least one search hit
            if (!Array.isArray(searchHits) || searchHits.length === 0) return false;
            
            const hit = searchHits[0];
            
            // searchString should match (or be empty string if not provided)
            if (item.searchString && hit.searchString !== item.searchString) return false;
            
            // rank should match (or be 0 if not provided)
            if (item.rank !== null && item.rank !== undefined && hit.rank !== item.rank) return false;
            
            // scrapedAt should be present
            if (!hit.scrapedAt) return false;
            
            // searchPageUrl should match if present
            if (item.searchPageUrl && hit.searchPageUrl !== item.searchPageUrl) return false;
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Custom Fields Extraction Tests
   * Validates Requirements 5.3-5.7
   */
  describe('Custom Fields Extraction', () => {
    /**
     * Requirement 5.7: categories → customFields.categoriesRaw
     */
    it('should store categories array in customFields.categoriesRaw', () => {
      fc.assert(
        fc.property(
          completeApifyPlaceItemArbitrary,
          (item: ApifyPlaceItem) => {
            const mapped = mapper.mapToPlace(item);
            
            if (item.categories && item.categories.length > 0) {
              return JSON.stringify(mapped.customFields.categoriesRaw) === 
                     JSON.stringify(item.categories);
            }
            return mapped.customFields.categoriesRaw === undefined;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Requirement 5.4: reviewsTags → customFields.reviewsTags
     */
    it('should store reviewsTags in customFields.reviewsTags', () => {
      fc.assert(
        fc.property(
          completeApifyPlaceItemArbitrary,
          (item: ApifyPlaceItem) => {
            const mapped = mapper.mapToPlace(item);
            
            if (item.reviewsTags && item.reviewsTags.length > 0) {
              return JSON.stringify(mapped.customFields.reviewsTags) === 
                     JSON.stringify(item.reviewsTags);
            }
            return mapped.customFields.reviewsTags === undefined;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Requirement 5.6: reviewsDistribution → customFields.reviewsDistribution
     */
    it('should store reviewsDistribution in customFields.reviewsDistribution', () => {
      fc.assert(
        fc.property(
          completeApifyPlaceItemArbitrary,
          (item: ApifyPlaceItem) => {
            const mapped = mapper.mapToPlace(item);
            
            if (item.reviewsDistribution) {
              return JSON.stringify(mapped.customFields.reviewsDistribution) === 
                     JSON.stringify(item.reviewsDistribution);
            }
            return mapped.customFields.reviewsDistribution === undefined;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Store Google IDs in customFields
     */
    it('should store fid and cid in customFields.googleIds', () => {
      fc.assert(
        fc.property(
          completeApifyPlaceItemArbitrary,
          (item: ApifyPlaceItem) => {
            const mapped = mapper.mapToPlace(item);
            
            if (item.fid || item.cid) {
              const googleIds = mapped.customFields.googleIds;
              if (!googleIds) return false;
              if (item.fid && googleIds.fid !== item.fid) return false;
              if (item.cid && googleIds.cid !== item.cid) return false;
              return true;
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Store original image URL
     */
    it('should store imageUrl in customFields.imageSourceUrl', () => {
      fc.assert(
        fc.property(
          completeApifyPlaceItemArbitrary,
          (item: ApifyPlaceItem) => {
            const mapped = mapper.mapToPlace(item);
            
            if (item.imageUrl) {
              return mapped.customFields.imageSourceUrl === item.imageUrl;
            }
            return mapped.customFields.imageSourceUrl === undefined;
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
     * Minimal valid input should produce valid output
     */
    it('should handle minimal valid input (only required fields)', () => {
      fc.assert(
        fc.property(
          minimalApifyPlaceItemArbitrary,
          (item: ApifyPlaceItem) => {
            const mapped = mapper.mapToPlace(item);
            
            // Required fields should be present
            return mapped.name === item.title &&
                   mapped.latitude === item.location.lat &&
                   mapped.longitude === item.location.lng &&
                   mapped.googlePlaceId === item.placeId &&
                   mapped.source === APIFY_SOURCE;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Output should always have required structure
     */
    it('should always produce output with required structure', () => {
      fc.assert(
        fc.property(
          completeApifyPlaceItemArbitrary,
          (item: ApifyPlaceItem) => {
            const mapped = mapper.mapToPlace(item);
            
            // Check required structure
            return typeof mapped.name === 'string' &&
                   typeof mapped.latitude === 'number' &&
                   typeof mapped.longitude === 'number' &&
                   typeof mapped.source === 'string' &&
                   typeof mapped.sourceDetails === 'object' &&
                   typeof mapped.sourceDetails.apify === 'object' &&
                   Array.isArray(mapped.sourceDetails.apify.searchHits) &&
                   typeof mapped.customFields === 'object';
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Idempotency: mapping the same input should produce the same output
     */
    it('should be idempotent (same input produces same output)', () => {
      fc.assert(
        fc.property(
          completeApifyPlaceItemArbitrary,
          (item: ApifyPlaceItem) => {
            const mapped1 = mapper.mapToPlace(item);
            const mapped2 = mapper.mapToPlace(item);
            
            // Compare key fields (excluding timestamps which may differ)
            return mapped1.name === mapped2.name &&
                   mapped1.latitude === mapped2.latitude &&
                   mapped1.longitude === mapped2.longitude &&
                   mapped1.googlePlaceId === mapped2.googlePlaceId &&
                   mapped1.source === mapped2.source;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
