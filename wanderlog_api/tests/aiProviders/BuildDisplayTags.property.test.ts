/**
 * Property-Based Tests for buildDisplayTags Function
 * 
 * Feature: ai-search-bugfixes
 * 
 * Property 2: Language-Aware Tag Selection
 * *For any* AI tag object with `en` and `zh` fields, when `buildDisplayTags` is called with language parameter:
 * - If language='en', the output SHALL contain the `en` field value
 * - If language='zh', the output SHALL contain the `zh` field value
 * - If the requested language field is missing, the output SHALL fall back to `en`, then `id`
 * - If the tag is a string (legacy format), it SHALL be used as-is regardless of language
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.5**
 */

import * as fc from 'fast-check';

// ============================================
// Types
// ============================================

interface AITagElement {
  kind: 'facet' | 'person' | 'architect';
  id: string;
  en: string;
  zh: string;
  priority?: number;
}

type Language = 'en' | 'zh';

// ============================================
// Function Under Test (replicated from searchV2Controller.ts)
// ============================================

/**
 * Build display tags: category_en + ai_tags union, returns string array
 * @param categoryEn Category English name
 * @param aiTags AI tags array (AITagElement[] or string array)
 * @param language Language parameter, determines whether to use 'en' or 'zh' field
 * @returns Merged tags array
 */
function buildDisplayTags(
  categoryEn: string | null | undefined, 
  aiTags: any,
  language: Language = 'en'
): string[] {
  const tags: string[] = [];
  
  // 1. Add category_en as first tag
  if (categoryEn && categoryEn.trim()) {
    tags.push(categoryEn.trim());
  }
  
  // 2. Add ai_tags (extract corresponding field based on language parameter)
  if (aiTags && Array.isArray(aiTags)) {
    for (const tag of aiTags) {
      let tagStr: string | null = null;
      if (typeof tag === 'string') {
        // Legacy format: use string as-is
        tagStr = tag;
      } else if (typeof tag === 'object' && tag !== null) {
        // Object format: use tag[language] with fallback to tag.en then tag.id
        tagStr = tag[language] || tag.en || tag.id || null;
      }
      if (tagStr && tagStr.trim() && !tags.includes(tagStr.trim())) {
        tags.push(tagStr.trim());
      }
    }
  }
  
  return tags;
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
 * Generate a valid AI Tag element with both en and zh fields
 */
const validAITagArbitrary: fc.Arbitrary<AITagElement> = fc.record({
  kind: validKindArbitrary,
  id: nonEmptyStringArbitrary,
  en: nonEmptyStringArbitrary,
  zh: nonEmptyStringArbitrary,
  priority: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
});

/**
 * Generate an AI Tag element with only en field (missing zh)
 */
const aiTagMissingZhArbitrary = fc.record({
  kind: validKindArbitrary,
  id: nonEmptyStringArbitrary,
  en: nonEmptyStringArbitrary,
  priority: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
}).map(tag => ({ ...tag, zh: undefined as unknown as string }));

/**
 * Generate an AI Tag element with only id field (missing en and zh)
 */
const aiTagOnlyIdArbitrary = fc.record({
  kind: validKindArbitrary,
  id: nonEmptyStringArbitrary,
  priority: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
}).map(tag => ({ ...tag, en: undefined as unknown as string, zh: undefined as unknown as string }));

/**
 * Generate a legacy string tag
 */
const legacyStringTagArbitrary = nonEmptyStringArbitrary;

/**
 * Generate language option
 */
const languageArbitrary: fc.Arbitrary<Language> = fc.constantFrom('en', 'zh');

/**
 * Generate category names
 */
const categoryArbitrary = fc.constantFrom(
  'Cafe', 'Museum', 'Restaurant', 'Gallery', 'Bakery', 'Bar', 'Hotel', 'Shop', 'Park', 'Landmark'
);

// ============================================
// Property Tests
// ============================================

describe('buildDisplayTags Property-Based Tests', () => {
  /**
   * Feature: ai-search-bugfixes, Property 2: Language-Aware Tag Selection
   * 
   * *For any* AI tag object with `en` and `zh` fields, when `buildDisplayTags` is called with language parameter:
   * - If language='en', the output SHALL contain the `en` field value
   * - If language='zh', the output SHALL contain the `zh` field value
   * - If the requested language field is missing, the output SHALL fall back to `en`, then `id`
   * - If the tag is a string (legacy format), it SHALL be used as-is regardless of language
   * 
   * **Validates: Requirements 3.1, 3.2, 3.3, 3.5**
   */
  describe('Property 2: Language-Aware Tag Selection', () => {
    /**
     * Property 2.1: English language uses en field
     * 
     * WHEN the user's language preference is English, 
     * THE Search_V2_Controller SHALL return tags using the `en` field from AI_Tags
     * 
     * **Validates: Requirements 3.1**
     */
    it('should use en field when language is en', () => {
      fc.assert(
        fc.property(
          categoryArbitrary,
          fc.array(validAITagArbitrary, { minLength: 1, maxLength: 3 }),
          (category: string, aiTags: AITagElement[]) => {
            const result = buildDisplayTags(category, aiTags, 'en');
            
            // First element should be category
            if (result[0] !== category) return false;
            
            // Remaining elements should be from ai_tags[].en
            for (let i = 1; i < result.length; i++) {
              const matchingTag = aiTags.find(t => t.en.trim() === result[i]);
              if (!matchingTag) return false;
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 2.2: Chinese language uses zh field
     * 
     * WHEN the user's language preference is Chinese, 
     * THE Search_V2_Controller SHALL return tags using the `zh` field from AI_Tags
     * 
     * **Validates: Requirements 3.2**
     */
    it('should use zh field when language is zh', () => {
      fc.assert(
        fc.property(
          categoryArbitrary,
          fc.array(validAITagArbitrary, { minLength: 1, maxLength: 3 }),
          (category: string, aiTags: AITagElement[]) => {
            const result = buildDisplayTags(category, aiTags, 'zh');
            
            // First element should be category (still uses categoryEn)
            if (result[0] !== category) return false;
            
            // Remaining elements should be from ai_tags[].zh
            for (let i = 1; i < result.length; i++) {
              const matchingTag = aiTags.find(t => t.zh.trim() === result[i]);
              if (!matchingTag) return false;
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 2.3: Fallback to en when zh is missing
     * 
     * WHEN an AI_Tag object has no `zh` field, 
     * THE Search_V2_Controller SHALL fall back to the `en` field
     * 
     * **Validates: Requirements 3.3**
     */
    it('should fall back to en field when zh is missing', () => {
      fc.assert(
        fc.property(
          categoryArbitrary,
          fc.array(aiTagMissingZhArbitrary, { minLength: 1, maxLength: 3 }),
          (category: string, aiTags: any[]) => {
            const result = buildDisplayTags(category, aiTags, 'zh');
            
            // First element should be category
            if (result[0] !== category) return false;
            
            // Remaining elements should fall back to ai_tags[].en
            for (let i = 1; i < result.length; i++) {
              const matchingTag = aiTags.find((t: any) => t.en.trim() === result[i]);
              if (!matchingTag) return false;
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 2.4: Fallback to id when both en and zh are missing
     * 
     * WHEN an AI_Tag object has no `en` field, 
     * THE Search_V2_Controller SHALL fall back to the `id` field
     * 
     * **Validates: Requirements 3.3**
     */
    it('should fall back to id field when en and zh are missing', () => {
      fc.assert(
        fc.property(
          categoryArbitrary,
          fc.array(aiTagOnlyIdArbitrary, { minLength: 1, maxLength: 3 }),
          (category: string, aiTags: any[]) => {
            const result = buildDisplayTags(category, aiTags, 'en');
            
            // First element should be category
            if (result[0] !== category) return false;
            
            // Remaining elements should fall back to ai_tags[].id
            for (let i = 1; i < result.length; i++) {
              const matchingTag = aiTags.find((t: any) => t.id.trim() === result[i]);
              if (!matchingTag) return false;
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 2.5: Legacy string tags used as-is
     * 
     * WHEN tags are string type (legacy format), 
     * THE Search_V2_Controller SHALL use them as-is regardless of language
     * 
     * **Validates: Requirements 3.5**
     */
    it('should use legacy string tags as-is regardless of language', () => {
      fc.assert(
        fc.property(
          categoryArbitrary,
          fc.array(legacyStringTagArbitrary, { minLength: 1, maxLength: 3 }),
          languageArbitrary,
          (category: string, stringTags: string[], language: Language) => {
            const result = buildDisplayTags(category, stringTags, language);
            
            // First element should be category
            if (result[0] !== category) return false;
            
            // Remaining elements should be the string tags (trimmed, deduplicated)
            const expectedTags = [category];
            for (const tag of stringTags) {
              const trimmed = tag.trim();
              if (trimmed && !expectedTags.includes(trimmed)) {
                expectedTags.push(trimmed);
              }
            }
            
            // Result should match expected
            return JSON.stringify(result) === JSON.stringify(expectedTags);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 2.6: Mixed tags (objects and strings) handled correctly
     * 
     * For any mix of object tags and string tags, the function should
     * handle each type appropriately based on its format.
     */
    it('should handle mixed object and string tags correctly', () => {
      fc.assert(
        fc.property(
          categoryArbitrary,
          validAITagArbitrary,
          legacyStringTagArbitrary,
          languageArbitrary,
          (category: string, objectTag: AITagElement, stringTag: string, language: Language) => {
            const mixedTags = [objectTag, stringTag];
            const result = buildDisplayTags(category, mixedTags, language);
            
            // First element should be category
            if (result[0] !== category) return false;
            
            // Should contain the object tag's language-specific value
            const expectedObjectValue = language === 'en' ? objectTag.en : objectTag.zh;
            const hasObjectTag = result.includes(expectedObjectValue.trim());
            
            // Should contain the string tag (if not duplicate)
            const trimmedStringTag = stringTag.trim();
            const stringTagIsDuplicate = 
              trimmedStringTag === category || 
              trimmedStringTag === expectedObjectValue.trim();
            const hasStringTag = stringTagIsDuplicate || result.includes(trimmedStringTag);
            
            return hasObjectTag && hasStringTag;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 2.7: Empty/null aiTags returns only category
     */
    it('should return only category when aiTags is empty or null', () => {
      fc.assert(
        fc.property(
          categoryArbitrary,
          languageArbitrary,
          (category: string, language: Language) => {
            const resultEmpty = buildDisplayTags(category, [], language);
            const resultNull = buildDisplayTags(category, null, language);
            const resultUndefined = buildDisplayTags(category, undefined, language);
            
            return (
              resultEmpty.length === 1 && resultEmpty[0] === category &&
              resultNull.length === 1 && resultNull[0] === category &&
              resultUndefined.length === 1 && resultUndefined[0] === category
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 2.8: Null/empty category with aiTags returns only aiTags
     */
    it('should return only aiTags when category is null or empty', () => {
      fc.assert(
        fc.property(
          fc.array(validAITagArbitrary, { minLength: 1, maxLength: 3 }),
          languageArbitrary,
          (aiTags: AITagElement[], language: Language) => {
            const resultNull = buildDisplayTags(null, aiTags, language);
            const resultEmpty = buildDisplayTags('', aiTags, language);
            const resultWhitespace = buildDisplayTags('   ', aiTags, language);
            
            // First element should be from aiTags, not category
            const expectedFirst = language === 'en' ? aiTags[0].en.trim() : aiTags[0].zh.trim();
            
            return (
              resultNull[0] === expectedFirst &&
              resultEmpty[0] === expectedFirst &&
              resultWhitespace[0] === expectedFirst
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 2.9: Duplicate tags are removed
     */
    it('should remove duplicate tags', () => {
      fc.assert(
        fc.property(
          categoryArbitrary,
          languageArbitrary,
          (category: string, language: Language) => {
            // Create tags with duplicate of category
            const aiTags: AITagElement[] = [
              {
                kind: 'facet',
                id: 'dup',
                en: category, // Same as category
                zh: category, // Same as category
                priority: 90,
              },
              {
                kind: 'facet',
                id: 'unique',
                en: 'UniqueTag',
                zh: '独特标签',
                priority: 80,
              },
            ];
            
            const result = buildDisplayTags(category, aiTags, language);
            
            // Should not have duplicates
            const uniqueResult = [...new Set(result)];
            return result.length === uniqueResult.length;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 2.10: Default language is 'en'
     */
    it('should default to en when language is not specified', () => {
      fc.assert(
        fc.property(
          categoryArbitrary,
          fc.array(validAITagArbitrary, { minLength: 1, maxLength: 3 }),
          (category: string, aiTags: AITagElement[]) => {
            // Call without language parameter (should default to 'en')
            const resultDefault = buildDisplayTags(category, aiTags);
            const resultExplicitEn = buildDisplayTags(category, aiTags, 'en');
            
            // Results should be identical
            return JSON.stringify(resultDefault) === JSON.stringify(resultExplicitEn);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
