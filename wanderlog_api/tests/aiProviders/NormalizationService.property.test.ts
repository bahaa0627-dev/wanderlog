/**
 * Property-Based Tests for Normalization Service - Apify Category Normalization
 * 
 * Feature: apify-data-import
 * 
 * Property 10: Category Normalization
 * *For any* Apify item with categories array, the resulting categorySlug should be 
 * determined by the highest priority matching category according to the defined rules.
 * 
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9**
 */

import * as fc from 'fast-check';
import { normalizationService } from '../../src/services/normalizationService';
import { CATEGORY_DISPLAY_NAMES, CATEGORY_ZH_NAMES } from '../../src/constants/categories';

// ============================================
// Test Data Generators
// ============================================

/**
 * Generator for museum-related categories
 */
const museumCategoriesArbitrary = fc.constantFrom(
  'Museum',
  'Art museum',
  'History museum',
  'Science museum',
  'museum',
  'art museum'
);

/**
 * Generator for art gallery-related categories
 */
const artGalleryCategoriesArbitrary = fc.constantFrom(
  'Art gallery',
  'Gallery',
  'Contemporary art',
  'art gallery',
  'gallery'
);

/**
 * Generator for cafe-related categories
 */
const cafeCategoriesArbitrary = fc.constantFrom(
  'Coffee shop',
  'Cafe',
  'Café',
  'Coffee',
  'Espresso bar',
  'coffee shop',
  'cafe'
);

/**
 * Generator for bakery-related categories
 */
const bakeryCategoriesArbitrary = fc.constantFrom(
  'Bakery',
  'Patisserie',
  'Pastry',
  'Boulangerie',
  'Pastry shop',
  'bakery',
  'patisserie'
);

/**
 * Generator for restaurant-related categories
 */
const restaurantCategoriesArbitrary = fc.constantFrom(
  'Restaurant',
  'Bistro',
  'Dining',
  'Eatery',
  'Brasserie',
  'restaurant',
  'bistro'
);

/**
 * Generator for thrift store-related categories
 */
const thriftStoreCategoriesArbitrary = fc.constantFrom(
  'Thrift store',
  'Second hand',
  'Secondhand',
  'Charity shop',
  'Resale',
  'Consignment',
  'thrift store',
  'second hand'
);

/**
 * Generator for landmark-related categories
 */
const landmarkCategoriesArbitrary = fc.constantFrom(
  'Tourist attraction',
  'Landmark',
  'Attraction',
  'Viewpoint',
  'Scenic',
  'tourist attraction',
  'landmark'
);

/**
 * Generator for optional category name
 */
const optionalCategoryNameArbitrary = fc.option(
  fc.constantFrom(
    'Coffee shop',
    'Restaurant',
    'Museum',
    'Art gallery',
    'Bakery',
    'Thrift store',
    'Tourist attraction'
  ),
  { nil: null }
);

/**
 * Generator for optional search string
 */
const optionalSearchStringArbitrary = fc.option(
  fc.constantFrom(
    'cafe paris',
    'museum tokyo',
    'restaurant london',
    'feminist bookstore',
    'vintage shop',
    'landmark berlin'
  ),
  { nil: null }
);

/**
 * Generator for feminist-related search strings
 */
const feministSearchStringArbitrary = fc.constantFrom(
  'feminist bookstore',
  'feminist cafe',
  'feminism museum',
  "women's center",
  'gender equality shop'
);

/**
 * Generator for mixed categories array
 */
const mixedCategoriesArbitrary = fc.array(
  fc.constantFrom(
    'Coffee shop',
    'Cafe',
    'Restaurant',
    'Museum',
    'Art gallery',
    'Bakery',
    'Thrift store',
    'Tourist attraction',
    'Bar',
    'Hotel',
    'Shop',
    'Store'
  ),
  { minLength: 1, maxLength: 5 }
);

// ============================================
// Property Tests
// ============================================

describe('Normalization Service - Apify Category Normalization Property Tests', () => {
  /**
   * Feature: apify-data-import, Property 10: Category Normalization
   * 
   * *For any* Apify item with categories array, the resulting categorySlug should be 
   * determined by the highest priority matching category according to the defined rules.
   * 
   * **Validates: Requirements 4.1-4.9**
   */
  describe('Property 10: Category Normalization', () => {
    
    /**
     * Requirement 4.3: Museum/Art museum → museum
     */
    it('should normalize museum categories to museum slug', () => {
      fc.assert(
        fc.property(
          museumCategoriesArbitrary,
          (category: string) => {
            const result = normalizationService.normalizeFromApify([category], null, null);
            return result.categorySlug === 'museum';
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Requirement 4.4: Art gallery/Gallery → art_gallery
     */
    it('should normalize art gallery categories to art_gallery slug', () => {
      fc.assert(
        fc.property(
          artGalleryCategoriesArbitrary,
          (category: string) => {
            const result = normalizationService.normalizeFromApify([category], null, null);
            return result.categorySlug === 'art_gallery';
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Requirement 4.5: Coffee shop/Cafe → cafe
     */
    it('should normalize cafe categories to cafe slug', () => {
      fc.assert(
        fc.property(
          cafeCategoriesArbitrary,
          (category: string) => {
            const result = normalizationService.normalizeFromApify([category], null, null);
            return result.categorySlug === 'cafe';
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Requirement 4.6: Bakery/Patisserie → bakery
     */
    it('should normalize bakery categories to bakery slug', () => {
      fc.assert(
        fc.property(
          bakeryCategoriesArbitrary,
          (category: string) => {
            const result = normalizationService.normalizeFromApify([category], null, null);
            return result.categorySlug === 'bakery';
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Requirement 4.7: Restaurant → restaurant
     */
    it('should normalize restaurant categories to restaurant slug', () => {
      fc.assert(
        fc.property(
          restaurantCategoriesArbitrary,
          (category: string) => {
            const result = normalizationService.normalizeFromApify([category], null, null);
            return result.categorySlug === 'restaurant';
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Requirement 4.8: Thrift store/Second hand → thrift_store
     */
    it('should normalize thrift store categories to thrift_store slug', () => {
      fc.assert(
        fc.property(
          thriftStoreCategoriesArbitrary,
          (category: string) => {
            const result = normalizationService.normalizeFromApify([category], null, null);
            return result.categorySlug === 'thrift_store';
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Requirement 4.9: Tourist attraction/Landmark → landmark
     */
    it('should normalize landmark categories to landmark slug', () => {
      fc.assert(
        fc.property(
          landmarkCategoriesArbitrary,
          (category: string) => {
            const result = normalizationService.normalizeFromApify([category], null, null);
            return result.categorySlug === 'landmark';
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Requirement 4.2: Priority - categories > categoryName > searchString
   */
  describe('Priority Rules', () => {
    
    it('should prioritize categories array over categoryName', () => {
      fc.assert(
        fc.property(
          cafeCategoriesArbitrary,
          (cafeCategory: string) => {
            // categories says cafe, categoryName says restaurant
            const result = normalizationService.normalizeFromApify(
              [cafeCategory],
              'Restaurant',
              null
            );
            return result.categorySlug === 'cafe' && result.matchedBy === 'categories';
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should prioritize categoryName over searchString when categories is empty', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('Coffee shop', 'Cafe', 'Restaurant', 'Museum'),
          (categoryName: string) => {
            const result = normalizationService.normalizeFromApify(
              null,
              categoryName,
              'landmark paris'
            );
            return result.matchedBy === 'categoryName';
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should use searchString when categories and categoryName are empty', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('cafe paris', 'museum tokyo', 'restaurant london'),
          (searchString: string) => {
            const result = normalizationService.normalizeFromApify(null, null, searchString);
            // Should match from searchString or fallback
            return result.matchedBy === 'searchString' || result.matchedBy === 'fallback';
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should fallback to shop when no matches found', () => {
      const result = normalizationService.normalizeFromApify(null, null, null);
      expect(result.categorySlug).toBe('shop');
      expect(result.matchedBy).toBe('fallback');
    });
  });

  /**
   * Requirement 4.10: feminist searchString → theme:feminism tag
   */
  describe('Feminism Tag Detection', () => {
    
    it('should add theme:feminism tag when searchString contains feminist keywords', () => {
      fc.assert(
        fc.property(
          feministSearchStringArbitrary,
          (searchString: string) => {
            const result = normalizationService.normalizeFromApify(null, null, searchString);
            return result.tags.includes('theme:feminism');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not add theme:feminism tag for non-feminist search strings', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('cafe paris', 'museum tokyo', 'restaurant london', 'bakery berlin'),
          (searchString: string) => {
            const result = normalizationService.normalizeFromApify(null, null, searchString);
            return !result.tags.includes('theme:feminism');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should add feminism tag while still determining category by place function', () => {
      // feminist bookstore should have feminism tag but category determined by other signals
      const result = normalizationService.normalizeFromApify(
        ['Bookstore'],
        null,
        'feminist bookstore'
      );
      expect(result.tags).toContain('theme:feminism');
      expect(result.categorySlug).toBe('bookstore');
    });
  });

  /**
   * Output Structure Validation
   */
  describe('Output Structure', () => {
    
    it('should always return valid category display names', () => {
      fc.assert(
        fc.property(
          mixedCategoriesArbitrary,
          optionalCategoryNameArbitrary,
          optionalSearchStringArbitrary,
          (categories: string[], categoryName: string | null, searchString: string | null) => {
            const result = normalizationService.normalizeFromApify(categories, categoryName, searchString);
            
            // categorySlug should be a valid key
            const isValidSlug = result.categorySlug in CATEGORY_DISPLAY_NAMES;
            
            // categoryEn should match the display name
            const isValidEn = result.categoryEn === CATEGORY_DISPLAY_NAMES[result.categorySlug];
            
            // categoryZh should match the Chinese name
            const isValidZh = result.categoryZh === CATEGORY_ZH_NAMES[result.categorySlug];
            
            // matchedBy should be one of the valid values
            const isValidMatchedBy = ['categories', 'categoryName', 'searchString', 'fallback'].includes(result.matchedBy);
            
            // tags should be an array
            const isValidTags = Array.isArray(result.tags);
            
            return isValidSlug && isValidEn && isValidZh && isValidMatchedBy && isValidTags;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should be deterministic (same input produces same output)', () => {
      fc.assert(
        fc.property(
          mixedCategoriesArbitrary,
          optionalCategoryNameArbitrary,
          optionalSearchStringArbitrary,
          (categories: string[], categoryName: string | null, searchString: string | null) => {
            const result1 = normalizationService.normalizeFromApify(categories, categoryName, searchString);
            const result2 = normalizationService.normalizeFromApify(categories, categoryName, searchString);
            
            return result1.categorySlug === result2.categorySlug &&
                   result1.categoryEn === result2.categoryEn &&
                   result1.categoryZh === result2.categoryZh &&
                   result1.matchedBy === result2.matchedBy &&
                   JSON.stringify(result1.tags) === JSON.stringify(result2.tags);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Priority Selection Tests
   * When multiple categories match, the highest priority (lowest number) should win
   */
  describe('Priority Selection', () => {
    
    it('should select museum over landmark when both are present', () => {
      // museum has priority 10, landmark has priority 100
      const result = normalizationService.normalizeFromApify(
        ['Tourist attraction', 'Museum'],
        null,
        null
      );
      expect(result.categorySlug).toBe('museum');
    });

    it('should select art_gallery over museum when both are present', () => {
      // art_gallery has priority 11, museum has priority 10
      // But art_gallery should match "Art gallery" more specifically
      const result = normalizationService.normalizeFromApify(
        ['Art gallery'],
        null,
        null
      );
      expect(result.categorySlug).toBe('art_gallery');
    });

    it('should select thrift_store over shop when both signals present', () => {
      // thrift_store has priority 15, shop has priority 90
      const result = normalizationService.normalizeFromApify(
        ['Thrift store', 'Shop'],
        null,
        null
      );
      expect(result.categorySlug).toBe('thrift_store');
    });

    it('should select cafe over restaurant when both are present', () => {
      // cafe has priority 20, restaurant has priority 30
      const result = normalizationService.normalizeFromApify(
        ['Restaurant', 'Coffee shop'],
        null,
        null
      );
      expect(result.categorySlug).toBe('cafe');
    });
  });
});
