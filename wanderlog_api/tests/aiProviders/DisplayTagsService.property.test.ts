/**
 * Property-Based Tests for Display Tags Service
 * 
 * Feature: ai-tags-optimization
 * 
 * Property 5: Display Tags Computation
 * *For any* place, the computed display_tags:
 * - Must start with category_en/zh
 * - Must contain at most 3 items total
 * - Must include ai_tags sorted by priority (descending)
 * - Must use correct language field (en or zh)
 * 
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.5, 5.6**
 */

import * as fc from 'fast-check';
import { displayTagsService, DisplayLanguage } from '../../src/services/displayTagsService';
import { AITagElement } from '../../src/services/aiTagsGeneratorService';

// ============================================
// Constants
// ============================================

const MAX_DISPLAY_TAGS = 3;
const MAX_AI_TAGS = 2;

// ============================================
// Test Data Generators
// ============================================

/**
 * Generate a valid kind value
 */
const validKindArbitrary = fc.constantFrom('facet', 'person', 'architect') as fc.Arbitrary<'facet' | 'person' | 'architect'>;

/**
 * Generate a non-empty string (for category, en, zh)
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
  .map(tags => {
    // Make each tag unique by modifying id and en/zh
    return tags.map((tag, i) => ({
      ...tag,
      id: `${tag.id}_${i}`,
      en: `${tag.en}_${i}`,
      zh: `${tag.zh}_${i}`,
    }));
  });

/**
 * Generate category names (en and zh)
 */
const categoryEnArbitrary = fc.constantFrom(
  'Cafe', 'Museum', 'Restaurant', 'Gallery', 'Bakery', 'Bar', 'Hotel', 'Shop', 'Park', 'Landmark'
);

const categoryZhArbitrary = fc.constantFrom(
  '咖啡店', '博物馆', '餐厅', '美术馆', '面包店', '酒吧', '酒店', '商店', '公园', '地标'
);

/**
 * Generate language option
 */
const languageArbitrary: fc.Arbitrary<DisplayLanguage> = fc.constantFrom('en', 'zh');

/**
 * Generate a place with category and ai_tags
 */
const placeDataArbitrary = fc.record({
  categoryEn: categoryEnArbitrary,
  categoryZh: categoryZhArbitrary,
  aiTags: aiTagsArrayArbitrary,
  language: languageArbitrary,
});

// ============================================
// Helper Functions
// ============================================

/**
 * Pure implementation of display tags computation for verification
 */
function computeDisplayTagsPure(
  categoryEn: string | null | undefined,
  categoryZh: string | null | undefined,
  aiTags: AITagElement[] | null | undefined,
  language: DisplayLanguage
): string[] {
  const result: string[] = [];

  // 1. Add category first
  const categoryValue = language === 'en' ? categoryEn : categoryZh;
  if (categoryValue && categoryValue.trim()) {
    result.push(categoryValue.trim());
  }

  // 2. If no ai_tags, return
  if (!aiTags || !Array.isArray(aiTags) || aiTags.length === 0) {
    return result;
  }

  // 3. Sort ai_tags by priority descending
  const sortedTags = [...aiTags].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  // 4. Add ai_tags (max 3 total)
  for (const tag of sortedTags) {
    if (result.length >= MAX_DISPLAY_TAGS) break;

    const tagValue = language === 'en' ? tag.en : tag.zh;
    if (tagValue && tagValue.trim()) {
      const normalizedValue = tagValue.trim().toLowerCase();
      const isDuplicate = result.some(
        existing => existing.toLowerCase() === normalizedValue
      );
      if (!isDuplicate) {
        result.push(tagValue.trim());
      }
    }
  }

  return result;
}

// ============================================
// Property Tests
// ============================================

describe('Display Tags Service Property-Based Tests', () => {
  /**
   * Feature: ai-tags-optimization, Property 5: Display Tags Computation
   * 
   * *For any* place, the computed display_tags:
   * - Must start with category_en/zh
   * - Must contain at most 3 items total
   * - Must include ai_tags sorted by priority (descending)
   * - Must use correct language field (en or zh)
   * 
   * **Validates: Requirements 5.1, 5.2, 5.3, 5.5, 5.6**
   */
  describe('Property 5: Display Tags Computation', () => {
    /**
     * Property 5.1: Display Tags = category + ai_tags union
     * 
     * For any place with category and ai_tags, the display_tags should
     * contain the category followed by ai_tags values.
     */
    it('should include category as first element when present', () => {
      fc.assert(
        fc.property(
          categoryEnArbitrary,
          categoryZhArbitrary,
          aiTagsArrayArbitrary,
          languageArbitrary,
          (categoryEn: string, categoryZh: string, aiTags: AITagElement[], language: DisplayLanguage) => {
            const result = displayTagsService.computeDisplayTags(categoryEn, categoryZh, aiTags, language);
            
            // Category should be first element
            const expectedCategory = language === 'en' ? categoryEn : categoryZh;
            return result.length > 0 && result[0] === expectedCategory;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 5.2: Display Tags contain at most 3 items
     * 
     * For any place, regardless of how many ai_tags it has,
     * the display_tags should never exceed 3 items.
     */
    it('should contain at most 3 items total', () => {
      fc.assert(
        fc.property(
          placeDataArbitrary,
          ({ categoryEn, categoryZh, aiTags, language }) => {
            const result = displayTagsService.computeDisplayTags(categoryEn, categoryZh, aiTags, language);
            return result.length <= MAX_DISPLAY_TAGS;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 5.3: Category always shown first, then ai_tags by priority
     * 
     * For any place, the display_tags should show category first,
     * followed by ai_tags sorted by priority (descending).
     */
    it('should show category first, then ai_tags by priority descending', () => {
      fc.assert(
        fc.property(
          categoryEnArbitrary,
          categoryZhArbitrary,
          fc.array(validAITagArbitrary, { minLength: 2, maxLength: 2 })
            .map(tags => tags.map((tag, i) => ({
              ...tag,
              id: `id_${i}`,
              en: `Tag_EN_${i}`,
              zh: `标签_${i}`,
              priority: (i + 1) * 30, // Different priorities: 30, 60
            }))),
          languageArbitrary,
          (categoryEn: string, categoryZh: string, aiTags: AITagElement[], language: DisplayLanguage) => {
            const result = displayTagsService.computeDisplayTags(categoryEn, categoryZh, aiTags, language);
            
            // First element should be category
            const expectedCategory = language === 'en' ? categoryEn : categoryZh;
            if (result[0] !== expectedCategory) return false;
            
            // Remaining elements should be from ai_tags sorted by priority desc
            const sortedAiTags = [...aiTags].sort((a, b) => b.priority - a.priority);
            
            for (let i = 1; i < result.length; i++) {
              const expectedTag = language === 'en' 
                ? sortedAiTags[i - 1]?.en 
                : sortedAiTags[i - 1]?.zh;
              if (result[i] !== expectedTag) return false;
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 5.5: English language uses category_en + ai_tags[].en
     * 
     * When language is 'en', all display tags should use English values.
     */
    it('should use English values when language is en', () => {
      fc.assert(
        fc.property(
          categoryEnArbitrary,
          categoryZhArbitrary,
          aiTagsArrayArbitrary,
          (categoryEn: string, categoryZh: string, aiTags: AITagElement[]) => {
            const result = displayTagsService.computeDisplayTags(categoryEn, categoryZh, aiTags, 'en');
            
            // First element should be categoryEn
            if (result.length > 0 && result[0] !== categoryEn) return false;
            
            // Remaining elements should be from ai_tags[].en (trimmed)
            const sortedAiTags = [...aiTags].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
            for (let i = 1; i < result.length; i++) {
              // Service trims values, so compare trimmed versions
              const matchingTag = sortedAiTags.find(t => t.en.trim() === result[i]);
              if (!matchingTag) return false;
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 5.6: Chinese language uses category_zh + ai_tags[].zh
     * 
     * When language is 'zh', all display tags should use Chinese values.
     */
    it('should use Chinese values when language is zh', () => {
      fc.assert(
        fc.property(
          categoryEnArbitrary,
          categoryZhArbitrary,
          aiTagsArrayArbitrary,
          (categoryEn: string, categoryZh: string, aiTags: AITagElement[]) => {
            const result = displayTagsService.computeDisplayTags(categoryEn, categoryZh, aiTags, 'zh');
            
            // First element should be categoryZh
            if (result.length > 0 && result[0] !== categoryZh) return false;
            
            // Remaining elements should be from ai_tags[].zh (trimmed)
            const sortedAiTags = [...aiTags].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
            for (let i = 1; i < result.length; i++) {
              // Service trims values, so compare trimmed versions
              const matchingTag = sortedAiTags.find(t => t.zh.trim() === result[i]);
              if (!matchingTag) return false;
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Bilingual computation returns correct values for both languages
     */
    it('should compute bilingual display tags correctly', () => {
      fc.assert(
        fc.property(
          categoryEnArbitrary,
          categoryZhArbitrary,
          aiTagsArrayArbitrary,
          (categoryEn: string, categoryZh: string, aiTags: AITagElement[]) => {
            const bilingual = displayTagsService.computeDisplayTagsBilingual(categoryEn, categoryZh, aiTags);
            const enResult = displayTagsService.computeDisplayTags(categoryEn, categoryZh, aiTags, 'en');
            const zhResult = displayTagsService.computeDisplayTags(categoryEn, categoryZh, aiTags, 'zh');
            
            // Bilingual results should match individual computations
            const enMatch = JSON.stringify(bilingual.display_tags_en) === JSON.stringify(enResult);
            const zhMatch = JSON.stringify(bilingual.display_tags_zh) === JSON.stringify(zhResult);
            
            return enMatch && zhMatch;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Empty ai_tags returns only category
     */
    it('should return only category when ai_tags is empty', () => {
      fc.assert(
        fc.property(
          categoryEnArbitrary,
          categoryZhArbitrary,
          languageArbitrary,
          (categoryEn: string, categoryZh: string, language: DisplayLanguage) => {
            const result = displayTagsService.computeDisplayTags(categoryEn, categoryZh, [], language);
            const expectedCategory = language === 'en' ? categoryEn : categoryZh;
            
            return result.length === 1 && result[0] === expectedCategory;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Null ai_tags returns only category
     */
    it('should return only category when ai_tags is null', () => {
      fc.assert(
        fc.property(
          categoryEnArbitrary,
          categoryZhArbitrary,
          languageArbitrary,
          (categoryEn: string, categoryZh: string, language: DisplayLanguage) => {
            const result = displayTagsService.computeDisplayTags(categoryEn, categoryZh, null, language);
            const expectedCategory = language === 'en' ? categoryEn : categoryZh;
            
            return result.length === 1 && result[0] === expectedCategory;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Null category with ai_tags returns ai_tags only
     */
    it('should return ai_tags when category is null', () => {
      fc.assert(
        fc.property(
          fc.array(validAITagArbitrary, { minLength: 1, maxLength: 2 })
            .map(tags => tags.map((tag, i) => ({
              ...tag,
              id: `id_${i}`,
              en: `Tag_EN_${i}`,
              zh: `标签_${i}`,
            }))),
          languageArbitrary,
          (aiTags: AITagElement[], language: DisplayLanguage) => {
            const result = displayTagsService.computeDisplayTags(null, null, aiTags, language);
            
            // Should contain ai_tags values (no category)
            const sortedAiTags = [...aiTags].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
            const expectedFirst = language === 'en' ? sortedAiTags[0].en : sortedAiTags[0].zh;
            
            return result.length > 0 && result[0] === expectedFirst;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Duplicate tags are removed
     */
    it('should remove duplicate tags (case-insensitive)', () => {
      fc.assert(
        fc.property(
          categoryEnArbitrary,
          categoryZhArbitrary,
          languageArbitrary,
          (categoryEn: string, categoryZh: string, language: DisplayLanguage) => {
            // Create ai_tags with duplicate of category
            const aiTags: AITagElement[] = [
              {
                kind: 'facet',
                id: 'dup',
                en: categoryEn, // Same as category
                zh: categoryZh, // Same as category
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
            
            const result = displayTagsService.computeDisplayTags(categoryEn, categoryZh, aiTags, language);
            
            // Should not have duplicates
            const uniqueResult = [...new Set(result.map(t => t.toLowerCase()))];
            return result.length === uniqueResult.length;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Result matches pure implementation
     */
    it('should match pure implementation', () => {
      fc.assert(
        fc.property(
          placeDataArbitrary,
          ({ categoryEn, categoryZh, aiTags, language }) => {
            const serviceResult = displayTagsService.computeDisplayTags(categoryEn, categoryZh, aiTags, language);
            const pureResult = computeDisplayTagsPure(categoryEn, categoryZh, aiTags, language);
            
            return JSON.stringify(serviceResult) === JSON.stringify(pureResult);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Empty category and empty ai_tags returns empty array
     */
    it('should return empty array when both category and ai_tags are empty/null', () => {
      fc.assert(
        fc.property(
          languageArbitrary,
          (language: DisplayLanguage) => {
            const result1 = displayTagsService.computeDisplayTags(null, null, null, language);
            const result2 = displayTagsService.computeDisplayTags(null, null, [], language);
            const result3 = displayTagsService.computeDisplayTags('', '', [], language);
            
            return result1.length === 0 && result2.length === 0 && result3.length === 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Whitespace-only category is treated as empty
     */
    it('should treat whitespace-only category as empty', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('  ', '\t', '\n', '   \t\n'),
          fc.array(validAITagArbitrary, { minLength: 1, maxLength: 2 })
            .map(tags => tags.map((tag, i) => ({
              ...tag,
              id: `id_${i}`,
              en: `Tag_${i}`,
              zh: `标签_${i}`,
            }))),
          languageArbitrary,
          (whitespace: string, aiTags: AITagElement[], language: DisplayLanguage) => {
            const result = displayTagsService.computeDisplayTags(whitespace, whitespace, aiTags, language);
            
            // First element should be from ai_tags, not whitespace
            const sortedAiTags = [...aiTags].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
            const expectedFirst = language === 'en' ? sortedAiTags[0].en : sortedAiTags[0].zh;
            
            return result.length > 0 && result[0] === expectedFirst;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
