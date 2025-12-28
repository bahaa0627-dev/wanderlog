/**
 * Property-Based Tests for API Response Format
 * 
 * Feature: ai-tags-optimization
 * 
 * Property 8: API Response Format
 * *For any* API response for a place:
 * - category_en and category_zh fields are present
 * - ai_tags is an array of objects with required fields
 * - display_tags_en and display_tags_zh are computed correctly
 * - Internal tags field is NOT present in response
 * 
 * **Validates: Requirements 8.1, 8.2, 8.3, 8.4**
 */

import * as fc from 'fast-check';
import { AITagElement } from '../../src/services/aiTagsGeneratorService';
import displayTagsService from '../../src/services/displayTagsService';

// ============================================
// Constants
// ============================================

const MAX_AI_TAGS = 2;
const MAX_DISPLAY_TAGS = 3;

// ============================================
// Helper Functions (Extracted from publicPlaceController.ts)
// ============================================

/**
 * Parse JSON field to ensure array return
 */
function parseJsonField(value: any): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Validate and parse ai_tags array
 * Ensures valid AITagElement[] format
 * 
 * Requirements: 8.2, 8.5
 */
function parseAiTags(value: any): AITagElement[] {
  if (!value) return [];
  
  const rawArray = parseJsonField(value);
  
  return rawArray.filter((element): element is AITagElement => {
    if (typeof element !== 'object' || element === null) {
      return false;
    }
    
    const e = element as Record<string, unknown>;
    
    return (
      typeof e.kind === 'string' &&
      ['facet', 'person', 'architect'].includes(e.kind) &&
      typeof e.id === 'string' &&
      typeof e.en === 'string' &&
      typeof e.zh === 'string' &&
      (typeof e.priority === 'number' || e.priority === undefined)
    );
  });
}

/**
 * Transform place object to API response format
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */
function transformPlace(place: any): any {
  if (!place) return place;
  
  const images = parseJsonField(place.images);
  const coverImage = place.coverImage || (images.length > 0 ? images[0] : null);
  
  const categorySlug = place.categorySlug || null;
  const categoryEn = place.categoryEn || null;
  const categoryZh = place.categoryZh || null;
  const category = place.category || categoryEn || null;
  
  // Parse ai_tags (Requirements: 8.2, 8.5)
  const aiTags = parseAiTags(place.aiTags);
  
  // Compute display_tags (Requirements: 8.3)
  const { display_tags_en, display_tags_zh } = displayTagsService.computeDisplayTagsBilingual(
    categoryEn,
    categoryZh,
    aiTags
  );
  
  // Build response, removing internal tags field (Requirements: 8.4)
  const { tags: _internalTags, ...placeWithoutTags } = place;
  
  return {
    ...placeWithoutTags,
    placeId: place.placeId || place.googlePlaceId || place.id,
    images,
    coverImage,
    category,
    categorySlug,
    categoryEn,
    categoryZh,
    aiTags,
    display_tags_en,
    display_tags_zh,
  };
}

// ============================================
// Test Data Generators
// ============================================

/**
 * Generate a valid kind value
 */
const validKindArbitrary = fc.constantFrom('facet', 'person', 'architect') as fc.Arbitrary<'facet' | 'person' | 'architect'>;

/**
 * Generate a non-empty string
 */
const nonEmptyStringArbitrary = fc.string({ minLength: 1, maxLength: 30 })
  .filter(s => s.trim().length > 0);

/**
 * Generate a valid AI Tag element
 */
const validAITagArbitrary: fc.Arbitrary<AITagElement> = fc.record({
  kind: validKindArbitrary,
  id: nonEmptyStringArbitrary,
  en: nonEmptyStringArbitrary,
  zh: nonEmptyStringArbitrary,
  priority: fc.integer({ min: 0, max: 100 }),
});

/**
 * Generate an array of valid AI Tags (0-2 elements)
 */
const aiTagsArrayArbitrary: fc.Arbitrary<AITagElement[]> = fc.array(validAITagArbitrary, { minLength: 0, maxLength: MAX_AI_TAGS })
  .map(tags => tags.map((tag, i) => ({
    ...tag,
    id: `${tag.id}_${i}`,
    en: `${tag.en}_${i}`,
    zh: `${tag.zh}_${i}`,
  })));

/**
 * Generate category names
 */
const categoryEnArbitrary = fc.constantFrom(
  'Cafe', 'Museum', 'Restaurant', 'Gallery', 'Bakery', 'Bar', 'Hotel', 'Shop', 'Park', 'Landmark'
);

const categoryZhArbitrary = fc.constantFrom(
  '咖啡店', '博物馆', '餐厅', '美术馆', '面包店', '酒吧', '酒店', '商店', '公园', '地标'
);

const categorySlugArbitrary = fc.constantFrom(
  'cafe', 'museum', 'restaurant', 'gallery', 'bakery', 'bar', 'hotel', 'shop', 'park', 'landmark'
);

/**
 * Generate internal tags (should NOT appear in response)
 */
const internalTagsArbitrary = fc.record({
  style: fc.array(fc.constantFrom('Brutalist', 'Modernist', 'ArtDeco'), { minLength: 0, maxLength: 2 }),
  theme: fc.array(fc.constantFrom('feminism', 'art'), { minLength: 0, maxLength: 2 }),
  award: fc.array(fc.constantFrom('pritzker', 'michelin'), { minLength: 0, maxLength: 2 }),
  meal: fc.array(fc.constantFrom('brunch', 'dinner'), { minLength: 0, maxLength: 2 }),
  cuisine: fc.array(fc.constantFrom('Japanese', 'Korean', 'Italian'), { minLength: 0, maxLength: 2 }),
});

/**
 * Generate a mock place object
 */
const placeArbitrary = fc.record({
  id: fc.uuid(),
  placeId: fc.option(fc.string({ minLength: 10, maxLength: 30 }), { nil: undefined }),
  googlePlaceId: fc.option(fc.string({ minLength: 10, maxLength: 30 }), { nil: undefined }),
  name: nonEmptyStringArbitrary,
  categorySlug: fc.option(categorySlugArbitrary, { nil: undefined }),
  categoryEn: fc.option(categoryEnArbitrary, { nil: undefined }),
  categoryZh: fc.option(categoryZhArbitrary, { nil: undefined }),
  category: fc.option(categoryEnArbitrary, { nil: undefined }),
  aiTags: fc.option(aiTagsArrayArbitrary, { nil: undefined }),
  tags: fc.option(internalTagsArbitrary, { nil: undefined }),
  images: fc.option(fc.array(fc.webUrl(), { minLength: 0, maxLength: 3 }), { nil: undefined }),
  coverImage: fc.option(fc.webUrl(), { nil: undefined }),
  latitude: fc.double({ min: -90, max: 90 }),
  longitude: fc.double({ min: -180, max: 180 }),
  city: fc.option(nonEmptyStringArbitrary, { nil: undefined }),
  country: fc.option(nonEmptyStringArbitrary, { nil: undefined }),
});

// ============================================
// Property Tests
// ============================================

describe('API Response Format Property-Based Tests', () => {
  /**
   * Feature: ai-tags-optimization, Property 8: API Response Format
   * 
   * *For any* API response for a place:
   * - category_en and category_zh fields are present
   * - ai_tags is an array of objects with required fields
   * - display_tags_en and display_tags_zh are computed correctly
   * - Internal tags field is NOT present in response
   * 
   * **Validates: Requirements 8.1, 8.2, 8.3, 8.4**
   */
  describe('Property 8: API Response Format', () => {
    /**
     * Property 8.1: API returns category_en and category_zh fields
     * 
     * For any place with category information, the API response
     * should include categoryEn and categoryZh fields.
     */
    it('should include categoryEn and categoryZh fields in response', () => {
      fc.assert(
        fc.property(
          placeArbitrary,
          (place) => {
            const response = transformPlace(place);
            
            // Response should have categoryEn and categoryZh properties
            return 'categoryEn' in response && 'categoryZh' in response;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 8.1: Category values are preserved correctly
     */
    it('should preserve category values correctly', () => {
      fc.assert(
        fc.property(
          categoryEnArbitrary,
          categoryZhArbitrary,
          categorySlugArbitrary,
          (categoryEn, categoryZh, categorySlug) => {
            const place = {
              id: 'test-id',
              name: 'Test Place',
              categoryEn,
              categoryZh,
              categorySlug,
            };
            
            const response = transformPlace(place);
            
            return (
              response.categoryEn === categoryEn &&
              response.categoryZh === categoryZh &&
              response.categorySlug === categorySlug
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 8.2: ai_tags is an array of objects with required fields
     * 
     * For any place, the ai_tags in the response should be an array
     * where each element has kind, id, en, zh fields.
     */
    it('should return ai_tags as array of objects with required fields', () => {
      fc.assert(
        fc.property(
          placeArbitrary,
          (place) => {
            const response = transformPlace(place);
            
            // ai_tags should be an array
            if (!Array.isArray(response.aiTags)) return false;
            
            // Each element should have required fields
            for (const tag of response.aiTags) {
              if (typeof tag !== 'object' || tag === null) return false;
              if (typeof tag.kind !== 'string') return false;
              if (!['facet', 'person', 'architect'].includes(tag.kind)) return false;
              if (typeof tag.id !== 'string') return false;
              if (typeof tag.en !== 'string') return false;
              if (typeof tag.zh !== 'string') return false;
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 8.2: ai_tags contains at most 2 elements
     */
    it('should return ai_tags with at most 2 elements', () => {
      fc.assert(
        fc.property(
          placeArbitrary,
          (place) => {
            const response = transformPlace(place);
            return Array.isArray(response.aiTags) && response.aiTags.length <= MAX_AI_TAGS;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 8.3: display_tags_en and display_tags_zh are computed correctly
     * 
     * For any place, the display_tags should be computed as category + ai_tags,
     * with at most 3 items total.
     */
    it('should compute display_tags_en and display_tags_zh correctly', () => {
      fc.assert(
        fc.property(
          categoryEnArbitrary,
          categoryZhArbitrary,
          aiTagsArrayArbitrary,
          (categoryEn, categoryZh, aiTags) => {
            const place = {
              id: 'test-id',
              name: 'Test Place',
              categoryEn,
              categoryZh,
              aiTags,
            };
            
            const response = transformPlace(place);
            
            // Compute expected display tags
            const expected = displayTagsService.computeDisplayTagsBilingual(categoryEn, categoryZh, aiTags);
            
            return (
              JSON.stringify(response.display_tags_en) === JSON.stringify(expected.display_tags_en) &&
              JSON.stringify(response.display_tags_zh) === JSON.stringify(expected.display_tags_zh)
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 8.3: display_tags contain at most 3 items
     */
    it('should return display_tags with at most 3 items', () => {
      fc.assert(
        fc.property(
          placeArbitrary,
          (place) => {
            const response = transformPlace(place);
            
            const enValid = Array.isArray(response.display_tags_en) && 
                           response.display_tags_en.length <= MAX_DISPLAY_TAGS;
            const zhValid = Array.isArray(response.display_tags_zh) && 
                           response.display_tags_zh.length <= MAX_DISPLAY_TAGS;
            
            return enValid && zhValid;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 8.3: display_tags start with category when present
     */
    it('should start display_tags with category when present', () => {
      fc.assert(
        fc.property(
          categoryEnArbitrary,
          categoryZhArbitrary,
          aiTagsArrayArbitrary,
          (categoryEn, categoryZh, aiTags) => {
            const place = {
              id: 'test-id',
              name: 'Test Place',
              categoryEn,
              categoryZh,
              aiTags,
            };
            
            const response = transformPlace(place);
            
            // First element should be category
            const enStartsWithCategory = response.display_tags_en.length > 0 && 
                                         response.display_tags_en[0] === categoryEn;
            const zhStartsWithCategory = response.display_tags_zh.length > 0 && 
                                         response.display_tags_zh[0] === categoryZh;
            
            return enStartsWithCategory && zhStartsWithCategory;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 8.4: Internal tags field is NOT present in response
     * 
     * For any place with internal tags, the API response should NOT
     * include the tags field.
     */
    it('should NOT include internal tags field in response', () => {
      fc.assert(
        fc.property(
          placeArbitrary,
          (place) => {
            const response = transformPlace(place);
            
            // tags field should NOT be in response
            return !('tags' in response);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 8.4: Internal tags are removed even when present in input
     */
    it('should remove internal tags even when present in input', () => {
      fc.assert(
        fc.property(
          internalTagsArbitrary,
          categoryEnArbitrary,
          categoryZhArbitrary,
          (tags, categoryEn, categoryZh) => {
            const place = {
              id: 'test-id',
              name: 'Test Place',
              categoryEn,
              categoryZh,
              tags, // Internal tags present
              aiTags: [],
            };
            
            const response = transformPlace(place);
            
            // tags should be removed from response
            return !('tags' in response);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 8.5: Empty ai_tags returns empty array
     */
    it('should return empty array when ai_tags is null or empty', () => {
      fc.assert(
        fc.property(
          categoryEnArbitrary,
          categoryZhArbitrary,
          fc.constantFrom(null, undefined, []),
          (categoryEn, categoryZh, aiTags) => {
            const place = {
              id: 'test-id',
              name: 'Test Place',
              categoryEn,
              categoryZh,
              aiTags,
            };
            
            const response = transformPlace(place);
            
            return Array.isArray(response.aiTags) && response.aiTags.length === 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Invalid ai_tags elements are filtered out
     */
    it('should filter out invalid ai_tags elements', () => {
      fc.assert(
        fc.property(
          categoryEnArbitrary,
          categoryZhArbitrary,
          (categoryEn, categoryZh) => {
            // Create place with mix of valid and invalid ai_tags
            const place = {
              id: 'test-id',
              name: 'Test Place',
              categoryEn,
              categoryZh,
              aiTags: [
                { kind: 'facet', id: 'valid', en: 'Valid', zh: '有效', priority: 90 },
                { kind: 'invalid_kind', id: 'bad', en: 'Bad', zh: '坏' }, // Invalid kind
                { kind: 'facet' }, // Missing required fields
                null, // Null element
                'string', // Wrong type
                { kind: 'person', id: 'person1', en: 'Person', zh: '人物', priority: 80 },
              ],
            };
            
            const response = transformPlace(place);
            
            // Should only have valid elements
            return (
              Array.isArray(response.aiTags) &&
              response.aiTags.length === 2 &&
              response.aiTags[0].id === 'valid' &&
              response.aiTags[1].id === 'person1'
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Response preserves other place fields
     */
    it('should preserve other place fields in response', () => {
      fc.assert(
        fc.property(
          placeArbitrary,
          (place) => {
            const response = transformPlace(place);
            
            // Helper to compare values including NaN
            const isEqual = (a: number, b: number) => {
              if (Number.isNaN(a) && Number.isNaN(b)) return true;
              return a === b;
            };
            
            // Core fields should be preserved
            return (
              response.name === place.name &&
              isEqual(response.latitude, place.latitude) &&
              isEqual(response.longitude, place.longitude)
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: placeId is always present (fallback chain)
     */
    it('should always have placeId using fallback chain', () => {
      fc.assert(
        fc.property(
          placeArbitrary,
          (place) => {
            const response = transformPlace(place);
            
            // placeId should be present
            if (!response.placeId) return false;
            
            // Should follow fallback chain: placeId > googlePlaceId > id
            const expectedPlaceId = place.placeId || place.googlePlaceId || place.id;
            return response.placeId === expectedPlaceId;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: images is always an array
     */
    it('should always return images as array', () => {
      fc.assert(
        fc.property(
          placeArbitrary,
          (place) => {
            const response = transformPlace(place);
            return Array.isArray(response.images);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: JSON string ai_tags are parsed correctly
     */
    it('should parse JSON string ai_tags correctly', () => {
      fc.assert(
        fc.property(
          aiTagsArrayArbitrary,
          categoryEnArbitrary,
          categoryZhArbitrary,
          (aiTags, categoryEn, categoryZh) => {
            // Create place with ai_tags as JSON string
            const place = {
              id: 'test-id',
              name: 'Test Place',
              categoryEn,
              categoryZh,
              aiTags: JSON.stringify(aiTags), // JSON string format
            };
            
            const response = transformPlace(place);
            
            // Should parse and return same structure
            return (
              Array.isArray(response.aiTags) &&
              response.aiTags.length === aiTags.length
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
