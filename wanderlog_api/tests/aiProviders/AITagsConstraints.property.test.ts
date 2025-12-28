/**
 * Property-Based Tests for AI Tags Database Constraints
 * 
 * Feature: ai-tags-optimization
 * 
 * Property 2: AI Tags Format and Constraints
 * *For any* place with non-null ai_tags:
 * - ai_tags must be an array of at most 2 elements
 * - Each element must have kind, id, en, zh, priority fields
 * - kind must be one of 'facet', 'person', 'architect'
 * - No element's en value should equal category_en (case-insensitive)
 * 
 * Property 6: Trigger Validation
 * *For any* INSERT or UPDATE on places with ai_tags:
 * - Elements without required fields (kind, id, en, zh) are removed
 * - Elements with invalid kind are removed
 * - Elements duplicating category_en are removed
 * - Duplicate elements (same kind+id) are deduplicated
 * - Result is truncated to at most 2 elements
 * 
 * **Validates: Requirements 2.2, 2.3, 2.5, 6.2-6.6**
 */

import * as fc from 'fast-check';

// ============================================
// Type Definitions
// ============================================

/**
 * Valid AI Tag element structure
 */
interface AITagElement {
  kind: 'facet' | 'person' | 'architect';
  id: string;
  en: string;
  zh: string;
  priority: number;
}

/**
 * Partial AI Tag element (may be missing fields)
 */
interface PartialAITagElement {
  kind?: string;
  id?: string;
  en?: string;
  zh?: string;
  priority?: number;
  [key: string]: unknown;
}

// ============================================
// Validation Functions (mirrors trigger logic)
// ============================================

const VALID_KINDS = ['facet', 'person', 'architect'] as const;

/**
 * Check if a value is a valid AI Tag element
 */
function isValidAITagElement(element: unknown): element is AITagElement {
  if (typeof element !== 'object' || element === null) return false;
  const e = element as Record<string, unknown>;
  return (
    typeof e.kind === 'string' &&
    VALID_KINDS.includes(e.kind as typeof VALID_KINDS[number]) &&
    typeof e.id === 'string' &&
    e.id !== '' &&
    typeof e.en === 'string' &&
    e.en !== '' &&
    typeof e.zh === 'string' &&
    e.zh !== '' &&
    typeof e.priority === 'number'
  );
}

/**
 * Check if an AI tag duplicates the category (case-insensitive)
 */
function duplicatesCategory(tag: AITagElement, categoryEn: string | null): boolean {
  if (!categoryEn) return false;
  return tag.en.toLowerCase() === categoryEn.toLowerCase();
}

/**
 * Normalize AI tags array (mirrors database trigger logic)
 * Requirements: 6.2, 6.3, 6.4, 6.5, 6.6
 */
function normalizeAITags(
  aiTags: unknown[] | null,
  categoryEn: string | null
): AITagElement[] {
  if (!aiTags || !Array.isArray(aiTags)) return [];

  const cleaned: AITagElement[] = [];
  const seenKeys = new Set<string>();

  for (const element of aiTags) {
    // 6.2: Only accept objects
    if (typeof element !== 'object' || element === null) continue;

    const e = element as PartialAITagElement;
    const kind = e.kind || '';
    const id = e.id || '';
    const en = e.en || '';
    const zh = e.zh || '';
    const priority = typeof e.priority === 'number' ? e.priority : 0;

    // 6.2: Required fields validation
    if (kind === '' || id === '' || en === '' || zh === '') continue;

    // 6.3: Kind enum validation
    if (!VALID_KINDS.includes(kind as typeof VALID_KINDS[number])) continue;

    // 6.4: Category duplication check
    if (categoryEn && en.toLowerCase() === categoryEn.toLowerCase()) continue;

    // 6.5: Deduplication by kind+id
    const key = `${kind}:${id}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    cleaned.push({
      kind: kind as AITagElement['kind'],
      id,
      en,
      zh,
      priority,
    });
  }

  // 6.6: Truncate to max 2 elements
  return cleaned.slice(0, 2);
}

// ============================================
// Test Data Generators
// ============================================

/**
 * Generate a valid kind value
 */
const validKindArbitrary = fc.constantFrom('facet', 'person', 'architect');

/**
 * Generate an invalid kind value
 */
const invalidKindArbitrary = fc.constantFrom(
  'invalid',
  'FACET',
  'Person',
  '',
  'tag',
  'category',
  'style'
);

/**
 * Generate a non-empty string (for id, en, zh)
 */
const nonEmptyStringArbitrary = fc.string({ minLength: 1, maxLength: 50 })
  .filter(s => s.trim().length > 0);

/**
 * Generate a valid AI Tag element
 */
const validAITagArbitrary: fc.Arbitrary<AITagElement> = fc.record({
  kind: validKindArbitrary as fc.Arbitrary<'facet' | 'person' | 'architect'>,
  id: nonEmptyStringArbitrary,
  en: nonEmptyStringArbitrary,
  zh: nonEmptyStringArbitrary,
  priority: fc.integer({ min: 0, max: 100 }),
});

/**
 * Generate an invalid AI Tag element (missing or invalid fields)
 */
const invalidAITagArbitrary: fc.Arbitrary<PartialAITagElement> = fc.oneof(
  // Missing kind
  fc.record({
    id: nonEmptyStringArbitrary,
    en: nonEmptyStringArbitrary,
    zh: nonEmptyStringArbitrary,
    priority: fc.integer(),
  }),
  // Missing id
  fc.record({
    kind: validKindArbitrary,
    en: nonEmptyStringArbitrary,
    zh: nonEmptyStringArbitrary,
    priority: fc.integer(),
  }),
  // Missing en
  fc.record({
    kind: validKindArbitrary,
    id: nonEmptyStringArbitrary,
    zh: nonEmptyStringArbitrary,
    priority: fc.integer(),
  }),
  // Missing zh
  fc.record({
    kind: validKindArbitrary,
    id: nonEmptyStringArbitrary,
    en: nonEmptyStringArbitrary,
    priority: fc.integer(),
  }),
  // Invalid kind
  fc.record({
    kind: invalidKindArbitrary,
    id: nonEmptyStringArbitrary,
    en: nonEmptyStringArbitrary,
    zh: nonEmptyStringArbitrary,
    priority: fc.integer(),
  }),
  // Empty id
  fc.record({
    kind: validKindArbitrary,
    id: fc.constant(''),
    en: nonEmptyStringArbitrary,
    zh: nonEmptyStringArbitrary,
    priority: fc.integer(),
  }),
  // Empty en
  fc.record({
    kind: validKindArbitrary,
    id: nonEmptyStringArbitrary,
    en: fc.constant(''),
    zh: nonEmptyStringArbitrary,
    priority: fc.integer(),
  })
);

/**
 * Generate a category name
 */
const categoryArbitrary = fc.constantFrom(
  'Cafe',
  'Museum',
  'Restaurant',
  'Gallery',
  'Bakery',
  'Bar',
  'Hotel',
  null
);

// ============================================
// Property Tests
// ============================================

describe('AI Tags Constraints Property-Based Tests', () => {
  /**
   * Feature: ai-tags-optimization, Property 2: AI Tags Format and Constraints
   * 
   * *For any* place with non-null ai_tags:
   * - ai_tags must be an array of at most 2 elements
   * - Each element must have kind, id, en, zh, priority fields
   * - kind must be one of 'facet', 'person', 'architect'
   * - No element's en value should equal category_en (case-insensitive)
   * 
   * **Validates: Requirements 2.2, 2.3, 2.5**
   */
  describe('Property 2: AI Tags Format and Constraints', () => {
    /**
     * Property: Valid AI tags pass validation
     * 
     * For any valid AI tag element, isValidAITagElement should return true.
     */
    it('should accept valid AI tag elements', () => {
      fc.assert(
        fc.property(validAITagArbitrary, (tag: AITagElement) => {
          return isValidAITagElement(tag) === true;
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Invalid AI tags fail validation
     * 
     * For any invalid AI tag element (missing required fields or invalid kind),
     * isValidAITagElement should return false.
     */
    it('should reject invalid AI tag elements', () => {
      fc.assert(
        fc.property(invalidAITagArbitrary, (tag: PartialAITagElement) => {
          return isValidAITagElement(tag) === false;
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Kind must be one of the valid values
     * 
     * For any AI tag with an invalid kind, validation should fail.
     */
    it('should only accept valid kind values (facet, person, architect)', () => {
      fc.assert(
        fc.property(
          invalidKindArbitrary,
          nonEmptyStringArbitrary,
          nonEmptyStringArbitrary,
          nonEmptyStringArbitrary,
          fc.integer(),
          (kind: string, id: string, en: string, zh: string, priority: number) => {
            const tag = { kind, id, en, zh, priority };
            return isValidAITagElement(tag) === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: AI tags array is limited to 2 elements after normalization
     * 
     * For any array of valid AI tags (regardless of length), after normalization
     * the result should have at most 2 elements.
     */
    it('should limit ai_tags to at most 2 elements', () => {
      fc.assert(
        fc.property(
          fc.array(validAITagArbitrary, { minLength: 0, maxLength: 10 }),
          categoryArbitrary,
          (tags: AITagElement[], category: string | null) => {
            const normalized = normalizeAITags(tags, category);
            return normalized.length <= 2;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Category duplication is detected correctly
     * 
     * For any AI tag where en equals category_en (case-insensitive),
     * duplicatesCategory should return true.
     */
    it('should detect category duplication (case-insensitive)', () => {
      fc.assert(
        fc.property(
          validAITagArbitrary,
          (tag: AITagElement) => {
            // Test with same case
            const sameCase = duplicatesCategory(tag, tag.en);
            // Test with different case
            const upperCase = duplicatesCategory(tag, tag.en.toUpperCase());
            const lowerCase = duplicatesCategory(tag, tag.en.toLowerCase());
            
            return sameCase === true && upperCase === true && lowerCase === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Non-matching category is not flagged as duplicate
     * 
     * For any AI tag where en does not equal category_en,
     * duplicatesCategory should return false.
     */
    it('should not flag non-matching category as duplicate', () => {
      fc.assert(
        fc.property(
          validAITagArbitrary,
          nonEmptyStringArbitrary,
          (tag: AITagElement, category: string) => {
            // Ensure category is different from tag.en
            if (tag.en.toLowerCase() === category.toLowerCase()) {
              return true; // Skip this case
            }
            return duplicatesCategory(tag, category) === false;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: ai-tags-optimization, Property 6: Trigger Validation
   * 
   * *For any* INSERT or UPDATE on places with ai_tags:
   * - Elements without required fields (kind, id, en, zh) are removed
   * - Elements with invalid kind are removed
   * - Elements duplicating category_en are removed
   * - Duplicate elements (same kind+id) are deduplicated
   * - Result is truncated to at most 2 elements
   * 
   * **Validates: Requirements 6.2, 6.3, 6.4, 6.5, 6.6**
   */
  describe('Property 6: Trigger Validation', () => {
    /**
     * Property 6.2: Elements without required fields are removed
     * 
     * For any array containing invalid elements (missing required fields),
     * normalization should remove those elements.
     */
    it('should remove elements without required fields (kind, id, en, zh)', () => {
      fc.assert(
        fc.property(
          fc.array(invalidAITagArbitrary, { minLength: 1, maxLength: 5 }),
          categoryArbitrary,
          (invalidTags: PartialAITagElement[], category: string | null) => {
            const normalized = normalizeAITags(invalidTags, category);
            // All invalid elements should be removed
            return normalized.length === 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 6.3: Elements with invalid kind are removed
     * 
     * For any array containing elements with invalid kind values,
     * normalization should remove those elements.
     */
    it('should remove elements with invalid kind values', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              kind: invalidKindArbitrary,
              id: nonEmptyStringArbitrary,
              en: nonEmptyStringArbitrary,
              zh: nonEmptyStringArbitrary,
              priority: fc.integer(),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          categoryArbitrary,
          (tags: PartialAITagElement[], category: string | null) => {
            const normalized = normalizeAITags(tags, category);
            return normalized.length === 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 6.4: Elements duplicating category_en are removed
     * 
     * For any array containing elements where en equals category_en,
     * normalization should remove those elements.
     */
    it('should remove elements duplicating category_en (case-insensitive)', () => {
      fc.assert(
        fc.property(
          validAITagArbitrary,
          (tag: AITagElement) => {
            // Create array with tag that matches category
            const tags = [tag];
            const category = tag.en; // Same as tag.en
            
            const normalized = normalizeAITags(tags, category);
            
            // The tag should be removed because it duplicates category
            return normalized.length === 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 6.4 (case variation): Case-insensitive category matching
     */
    it('should remove elements matching category_en regardless of case', () => {
      fc.assert(
        fc.property(
          validAITagArbitrary,
          fc.boolean(),
          (tag: AITagElement, useUpperCase: boolean) => {
            const tags = [tag];
            // Use different case for category
            const category = useUpperCase ? tag.en.toUpperCase() : tag.en.toLowerCase();
            
            const normalized = normalizeAITags(tags, category);
            
            return normalized.length === 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 6.5: Duplicate elements (same kind+id) are deduplicated
     * 
     * For any array containing duplicate elements (same kind and id),
     * normalization should keep only the first occurrence.
     */
    it('should deduplicate elements with same kind+id', () => {
      fc.assert(
        fc.property(
          validAITagArbitrary,
          fc.integer({ min: 2, max: 5 }),
          (tag: AITagElement, duplicateCount: number) => {
            // Create array with duplicates
            const tags = Array(duplicateCount).fill(tag);
            
            const normalized = normalizeAITags(tags, null);
            
            // Should have at most 1 element (the first occurrence)
            // But also limited to 2 by truncation
            return normalized.length === 1;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 6.5 (variation): Different en/zh but same kind+id should deduplicate
     */
    it('should deduplicate by kind+id even if en/zh differ', () => {
      fc.assert(
        fc.property(
          validKindArbitrary,
          nonEmptyStringArbitrary,
          nonEmptyStringArbitrary,
          nonEmptyStringArbitrary,
          nonEmptyStringArbitrary,
          nonEmptyStringArbitrary,
          (
            kind: 'facet' | 'person' | 'architect',
            id: string,
            en1: string,
            zh1: string,
            en2: string,
            zh2: string
          ) => {
            const tag1: AITagElement = { kind, id, en: en1, zh: zh1, priority: 90 };
            const tag2: AITagElement = { kind, id, en: en2, zh: zh2, priority: 80 };
            
            const normalized = normalizeAITags([tag1, tag2], null);
            
            // Should keep only the first one
            return (
              normalized.length === 1 &&
              normalized[0].en === en1 &&
              normalized[0].zh === zh1
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 6.6: Result is truncated to at most 2 elements
     * 
     * For any array of valid, unique AI tags, normalization should
     * return at most 2 elements.
     */
    it('should truncate to at most 2 elements', () => {
      fc.assert(
        fc.property(
          fc.array(validAITagArbitrary, { minLength: 3, maxLength: 10 })
            .map(tags => {
              // Make each tag unique by modifying id
              return tags.map((tag, i) => ({
                ...tag,
                id: `${tag.id}_${i}`,
                en: `${tag.en}_${i}`, // Also make en unique to avoid category collision
              }));
            }),
          (tags: AITagElement[]) => {
            const normalized = normalizeAITags(tags, null);
            return normalized.length === 2;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Normalization preserves order (first 2 valid elements)
     * 
     * For any array of valid AI tags, normalization should preserve
     * the order and keep the first 2 valid elements.
     */
    it('should preserve order and keep first 2 valid elements', () => {
      fc.assert(
        fc.property(
          fc.array(validAITagArbitrary, { minLength: 3, maxLength: 10 })
            .map(tags => {
              // Make each tag unique
              return tags.map((tag, i) => ({
                ...tag,
                id: `unique_${i}`,
                en: `Tag_${i}`,
              }));
            }),
          (tags: AITagElement[]) => {
            const normalized = normalizeAITags(tags, null);
            
            // First 2 elements should match
            return (
              normalized.length === 2 &&
              normalized[0].id === tags[0].id &&
              normalized[1].id === tags[1].id
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Mixed valid and invalid elements
     * 
     * For any array containing both valid and invalid elements,
     * normalization should keep only valid elements (up to 2).
     */
    it('should filter out invalid elements and keep valid ones', () => {
      fc.assert(
        fc.property(
          fc.array(validAITagArbitrary, { minLength: 1, maxLength: 3 })
            .map(tags => tags.map((tag, i) => ({
              ...tag,
              id: `valid_${i}`,
              en: `ValidTag_${i}`,
            }))),
          fc.array(invalidAITagArbitrary, { minLength: 1, maxLength: 3 }),
          (validTags: AITagElement[], invalidTags: PartialAITagElement[]) => {
            // Interleave valid and invalid tags
            const mixed: unknown[] = [];
            const maxLen = Math.max(validTags.length, invalidTags.length);
            for (let i = 0; i < maxLen; i++) {
              if (i < invalidTags.length) mixed.push(invalidTags[i]);
              if (i < validTags.length) mixed.push(validTags[i]);
            }
            
            const normalized = normalizeAITags(mixed, null);
            
            // All normalized elements should be valid
            const allValid = normalized.every(isValidAITagElement);
            // Should have at most 2 elements
            const withinLimit = normalized.length <= 2;
            // Should have at most the number of valid input tags
            const correctCount = normalized.length <= Math.min(validTags.length, 2);
            
            return allValid && withinLimit && correctCount;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Null input returns empty array
     */
    it('should return empty array for null input', () => {
      fc.assert(
        fc.property(categoryArbitrary, (category: string | null) => {
          const normalized = normalizeAITags(null, category);
          return normalized.length === 0;
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Empty array input returns empty array
     */
    it('should return empty array for empty input', () => {
      fc.assert(
        fc.property(categoryArbitrary, (category: string | null) => {
          const normalized = normalizeAITags([], category);
          return normalized.length === 0;
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Non-object elements are filtered out
     */
    it('should filter out non-object elements', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.oneof(
              fc.string(),
              fc.integer(),
              fc.boolean(),
              fc.constant(null),
              fc.constant(undefined)
            ),
            { minLength: 1, maxLength: 5 }
          ),
          categoryArbitrary,
          (nonObjects: unknown[], category: string | null) => {
            const normalized = normalizeAITags(nonObjects, category);
            return normalized.length === 0;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
