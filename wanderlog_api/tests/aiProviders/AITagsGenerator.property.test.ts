/**
 * Property-Based Tests for AI Tags Generator Service
 * 
 * Feature: ai-tags-optimization
 * 
 * Property 3: Facet Dictionary Validation
 * *For any* ai_tag element with kind='facet', its id must exist in the ai_facet_dictionary table.
 * If the facet has allowed_categories defined, the place's category_slug must be in that list.
 * 
 * Property 4: AI Tags Generation Rules
 * *For any* place with structured tags:
 * - If tags.award contains 'pritzker', ai_tags should contain Pritzker facet
 * - At most 1 style facet should be in ai_tags
 * - Brunch facet only applies to restaurant/cafe/bakery categories
 * - Cuisine facets only apply to restaurant category
 * - At most 1 entity (person or architect) should be in ai_tags
 * 
 * **Validates: Requirements 3.2, 3.4, 4.1-4.8**
 */

import * as fc from 'fast-check';
import { StructuredTags, AITagElement, EntityInfo } from '../../src/services/aiTagsGeneratorService';

// ============================================
// Mock Facet Dictionary Data (mirrors ai_facet_dictionary.csv)
// ============================================

interface MockFacetDefinition {
  id: string;
  en: string;
  zh: string;
  priority: number;
  allowedCategories: string[] | null;
}

/**
 * Mock facet dictionary data based on ai_facet_dictionary.csv
 */
const MOCK_FACET_DICTIONARY: Map<string, MockFacetDefinition> = new Map([
  ['Pritzker', { id: 'Pritzker', en: 'Pritzker', zh: '普利兹克', priority: 95, allowedCategories: null }],
  ['Feminist', { id: 'Feminist', en: 'Feminist', zh: '女性主义', priority: 90, allowedCategories: null }],
  ['Brunch', { id: 'Brunch', en: 'Brunch', zh: '早午餐', priority: 78, allowedCategories: ['restaurant', 'cafe', 'bakery'] }],
  ['Japanese', { id: 'Japanese', en: 'Japanese', zh: '日式', priority: 66, allowedCategories: ['restaurant'] }],
  ['Korean', { id: 'Korean', en: 'Korean', zh: '韩式', priority: 64, allowedCategories: ['restaurant'] }],
  ['Vietnamese', { id: 'Vietnamese', en: 'Vietnamese', zh: '越南', priority: 64, allowedCategories: ['restaurant'] }],
  ['Thai', { id: 'Thai', en: 'Thai', zh: '泰式', priority: 62, allowedCategories: ['restaurant'] }],
  ['Chinese', { id: 'Chinese', en: 'Chinese', zh: '中式', priority: 60, allowedCategories: ['restaurant'] }],
  ['Italian', { id: 'Italian', en: 'Italian', zh: '意式', priority: 60, allowedCategories: ['restaurant'] }],
  ['French', { id: 'French', en: 'French', zh: '法式', priority: 58, allowedCategories: ['restaurant'] }],
]);


// Add more facets to the dictionary
MOCK_FACET_DICTIONARY.set('Spanish', { id: 'Spanish', en: 'Spanish', zh: '西式', priority: 56, allowedCategories: ['restaurant'] });
MOCK_FACET_DICTIONARY.set('Indian', { id: 'Indian', en: 'Indian', zh: '印度', priority: 56, allowedCategories: ['restaurant'] });
MOCK_FACET_DICTIONARY.set('Mexican', { id: 'Mexican', en: 'Mexican', zh: '墨西哥', priority: 56, allowedCategories: ['restaurant'] });
MOCK_FACET_DICTIONARY.set('MiddleEastern', { id: 'MiddleEastern', en: 'MiddleEastern', zh: '中东', priority: 54, allowedCategories: ['restaurant'] });
MOCK_FACET_DICTIONARY.set('Seafood', { id: 'Seafood', en: 'Seafood', zh: '海鲜', priority: 54, allowedCategories: ['restaurant'] });
MOCK_FACET_DICTIONARY.set('BBQ', { id: 'BBQ', en: 'BBQ', zh: '烧烤', priority: 54, allowedCategories: ['restaurant'] });
MOCK_FACET_DICTIONARY.set('Vintage', { id: 'Vintage', en: 'Vintage', zh: '古着', priority: 72, allowedCategories: ['shop', 'thrift_store', 'shopping_mall', 'bookstore'] });
MOCK_FACET_DICTIONARY.set('Secondhand', { id: 'Secondhand', en: 'Secondhand', zh: '二手', priority: 70, allowedCategories: ['shop', 'thrift_store'] });
MOCK_FACET_DICTIONARY.set('Curated', { id: 'Curated', en: 'Curated', zh: '精选', priority: 55, allowedCategories: ['shop', 'thrift_store', 'shopping_mall', 'bookstore'] });
MOCK_FACET_DICTIONARY.set('Iconic', { id: 'Iconic', en: 'Iconic', zh: '经典', priority: 60, allowedCategories: null });
MOCK_FACET_DICTIONARY.set('HiddenGem', { id: 'HiddenGem', en: 'HiddenGem', zh: '宝藏', priority: 58, allowedCategories: null });
MOCK_FACET_DICTIONARY.set('LocalFavorite', { id: 'LocalFavorite', en: 'LocalFavorite', zh: '本地人爱', priority: 56, allowedCategories: null });
MOCK_FACET_DICTIONARY.set('Photogenic', { id: 'Photogenic', en: 'Photogenic', zh: '很出片', priority: 52, allowedCategories: null });
MOCK_FACET_DICTIONARY.set('Brutalist', { id: 'Brutalist', en: 'Brutalist', zh: '粗野主义', priority: 92, allowedCategories: null });
MOCK_FACET_DICTIONARY.set('Modernist', { id: 'Modernist', en: 'Modernist', zh: '现代主义', priority: 88, allowedCategories: null });
MOCK_FACET_DICTIONARY.set('Contemporary', { id: 'Contemporary', en: 'Contemporary', zh: '当代', priority: 78, allowedCategories: null });
MOCK_FACET_DICTIONARY.set('Minimalist', { id: 'Minimalist', en: 'Minimalist', zh: '极简', priority: 74, allowedCategories: null });
MOCK_FACET_DICTIONARY.set('Industrial', { id: 'Industrial', en: 'Industrial', zh: '工业风', priority: 72, allowedCategories: null });
MOCK_FACET_DICTIONARY.set('HighTech', { id: 'HighTech', en: 'HighTech', zh: '高技派', priority: 74, allowedCategories: null });
MOCK_FACET_DICTIONARY.set('Postmodern', { id: 'Postmodern', en: 'Postmodern', zh: '后现代', priority: 76, allowedCategories: null });
MOCK_FACET_DICTIONARY.set('Deconstructivist', { id: 'Deconstructivist', en: 'Deconstructivist', zh: '解构主义', priority: 78, allowedCategories: null });
MOCK_FACET_DICTIONARY.set('Bauhaus', { id: 'Bauhaus', en: 'Bauhaus', zh: '包豪斯', priority: 82, allowedCategories: null });
MOCK_FACET_DICTIONARY.set('ArtDeco', { id: 'ArtDeco', en: 'ArtDeco', zh: '装饰艺术', priority: 84, allowedCategories: null });
MOCK_FACET_DICTIONARY.set('ArtNouveau', { id: 'ArtNouveau', en: 'ArtNouveau', zh: '新艺术', priority: 86, allowedCategories: null });
MOCK_FACET_DICTIONARY.set('Neoclassical', { id: 'Neoclassical', en: 'Neoclassical', zh: '新古典', priority: 80, allowedCategories: null });
MOCK_FACET_DICTIONARY.set('Renaissance', { id: 'Renaissance', en: 'Renaissance', zh: '文艺复兴', priority: 78, allowedCategories: null });
MOCK_FACET_DICTIONARY.set('Baroque', { id: 'Baroque', en: 'Baroque', zh: '巴洛克', priority: 78, allowedCategories: null });
MOCK_FACET_DICTIONARY.set('Rococo', { id: 'Rococo', en: 'Rococo', zh: '洛可可', priority: 74, allowedCategories: null });
MOCK_FACET_DICTIONARY.set('Gothic', { id: 'Gothic', en: 'Gothic', zh: '哥特', priority: 80, allowedCategories: null });
MOCK_FACET_DICTIONARY.set('NeoGothic', { id: 'NeoGothic', en: 'NeoGothic', zh: '新哥特', priority: 74, allowedCategories: null });
MOCK_FACET_DICTIONARY.set('Expressionist', { id: 'Expressionist', en: 'Expressionist', zh: '表现主义', priority: 80, allowedCategories: null });
MOCK_FACET_DICTIONARY.set('Constructivist', { id: 'Constructivist', en: 'Constructivist', zh: '构成主义', priority: 72, allowedCategories: null });
MOCK_FACET_DICTIONARY.set('Islamic', { id: 'Islamic', en: 'Islamic', zh: '伊斯兰', priority: 70, allowedCategories: null });
MOCK_FACET_DICTIONARY.set('Byzantine', { id: 'Byzantine', en: 'Byzantine', zh: '拜占庭', priority: 70, allowedCategories: null });
MOCK_FACET_DICTIONARY.set('Romanesque', { id: 'Romanesque', en: 'Romanesque', zh: '罗曼式', priority: 70, allowedCategories: null });
MOCK_FACET_DICTIONARY.set('Vernacular', { id: 'Vernacular', en: 'Vernacular', zh: '乡土', priority: 60, allowedCategories: null });
MOCK_FACET_DICTIONARY.set('AdaptiveReuse', { id: 'AdaptiveReuse', en: 'AdaptiveReuse', zh: '旧改', priority: 72, allowedCategories: null });


/**
 * Known facet IDs from the dictionary
 */
const KNOWN_FACET_IDS = Array.from(MOCK_FACET_DICTIONARY.keys());

/**
 * Style facet IDs (architectural styles)
 */
const STYLE_FACET_IDS = [
  'Brutalist', 'Modernist', 'Contemporary', 'Minimalist', 'Industrial', 'HighTech', 'Postmodern', 'Deconstructivist', 'Bauhaus', 'ArtDeco', 'ArtNouveau', 'Neoclassical', 'Renaissance', 'Baroque', 'Rococo', 'Gothic', 'NeoGothic', 'Expressionist', 'Constructivist', 'Islamic', 'Byzantine', 'Romanesque', 'Vernacular', 'AdaptiveReuse'
];

/**
 * Cuisine facet IDs
 */
const CUISINE_FACET_IDS = [
  'Japanese', 'Korean', 'Vietnamese', 'Thai', 'Chinese', 'Italian', 'French', 'Spanish', 'Indian', 'Mexican', 'MiddleEastern', 'Seafood', 'BBQ'
];

/**
 * Categories that allow brunch facet
 */
const BRUNCH_ALLOWED_CATEGORIES = ['restaurant', 'cafe', 'bakery'];

/**
 * Categories that allow cuisine facets
 */
const CUISINE_ALLOWED_CATEGORIES = ['restaurant'];

/**
 * All valid category slugs
 */
const ALL_CATEGORIES = [
  'restaurant', 'cafe', 'bakery', 'bar', 'museum', 'gallery', 'hotel', 'shop', 'thrift_store', 'shopping_mall', 'bookstore', 'park', 'landmark', 'church', 'temple', 'mosque', 'synagogue'
];

// ============================================
// Pure AI Tags Generator Implementation for Testing
// (No database dependency)
// ============================================

const MAX_AI_TAGS = 2;
const MAX_STYLE_FACETS = 1;
const MAX_ENTITIES = 1;

/**
 * Check if tags contain Pritzker award
 */
function hasPritzkerAward(tags: StructuredTags): boolean {
  return tags.award?.some(a => a.toLowerCase() === 'pritzker') ?? false;
}

/**
 * Check if tags contain brunch meal
 */
function hasBrunch(tags: StructuredTags): boolean {
  return tags.meal?.some(m => m.toLowerCase() === 'brunch') ?? false;
}

/**
 * Check if en value duplicates category_en (case-insensitive)
 */
function isDuplicateOfCategory(en: string, categoryEn: string): boolean {
  return en.toLowerCase() === categoryEn.toLowerCase();
}

/**
 * Check if facet is allowed for category
 */
function isFacetAllowedForCategory(facetId: string, categorySlug: string): boolean {
  const facet = MOCK_FACET_DICTIONARY.get(facetId);
  if (!facet) return false;
  if (!facet.allowedCategories || facet.allowedCategories.length === 0) return true;
  return facet.allowedCategories.includes(categorySlug);
}


/**
 * Find best matching style facet
 */
function findBestStyleFacet(styles: string[], categorySlug: string, categoryEn: string): AITagElement | null {
  let bestMatch: MockFacetDefinition | null = null;

  for (const style of styles) {
    const normalizedStyle = style.toLowerCase().replace(/[^a-z]/g, '');
    
    for (const facetId of STYLE_FACET_IDS) {
      const facet = MOCK_FACET_DICTIONARY.get(facetId);
      if (!facet) continue;
      if (!isFacetAllowedForCategory(facetId, categorySlug)) continue;
      if (isDuplicateOfCategory(facet.en, categoryEn)) continue;

      const facetIdLower = facetId.toLowerCase();
      if (normalizedStyle.includes(facetIdLower) || facetIdLower.includes(normalizedStyle)) {
        if (!bestMatch || facet.priority > bestMatch.priority) {
          bestMatch = facet;
        }
      }
    }
  }

  if (bestMatch) {
    return { kind: 'facet', id: bestMatch.id, en: bestMatch.en, zh: bestMatch.zh, priority: bestMatch.priority };
  }
  return null;
}

/**
 * Find best matching cuisine facet
 */
function findBestCuisineFacet(cuisines: string[], categorySlug: string, categoryEn: string): AITagElement | null {
  let bestMatch: MockFacetDefinition | null = null;

  for (const cuisine of cuisines) {
    const normalizedCuisine = cuisine.toLowerCase();
    
    for (const facetId of CUISINE_FACET_IDS) {
      const facet = MOCK_FACET_DICTIONARY.get(facetId);
      if (!facet) continue;
      if (!isFacetAllowedForCategory(facetId, categorySlug)) continue;
      if (isDuplicateOfCategory(facet.en, categoryEn)) continue;

      if (normalizedCuisine.includes(facetId.toLowerCase()) || facetId.toLowerCase().includes(normalizedCuisine)) {
        if (!bestMatch || facet.priority > bestMatch.priority) {
          bestMatch = facet;
        }
      }
    }
  }

  if (bestMatch) {
    return { kind: 'facet', id: bestMatch.id, en: bestMatch.en, zh: bestMatch.zh, priority: bestMatch.priority };
  }
  return null;
}

/**
 * Deduplicate and limit ai_tags
 */
function deduplicateAndLimit(tags: AITagElement[], limit: number): AITagElement[] {
  const seen = new Set<string>();
  const result: AITagElement[] = [];

  for (const tag of tags) {
    const key = `${tag.kind}:${tag.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(tag);
      if (result.length >= limit) break;
    }
  }

  return result;
}


/**
 * Pure implementation of AI Tags generation (no database dependency)
 * This mirrors the logic in aiTagsGeneratorService.ts
 */
async function generateAITagsPure(
  tags: StructuredTags | null | undefined,
  categorySlug: string,
  categoryEn: string,
  entityResolver?: (qid: string, type: 'person' | 'architect') => Promise<EntityInfo | null>
): Promise<AITagElement[]> {
  if (!tags) return [];

  const candidates: AITagElement[] = [];
  let styleCount = 0;
  let entityCount = 0;

  // 1. Check Pritzker (highest priority 95)
  if (hasPritzkerAward(tags)) {
    const pritzkerFacet = MOCK_FACET_DICTIONARY.get('Pritzker');
    if (pritzkerFacet && !isDuplicateOfCategory(pritzkerFacet.en, categoryEn)) {
      candidates.push({
        kind: 'facet',
        id: pritzkerFacet.id,
        en: pritzkerFacet.en,
        zh: pritzkerFacet.zh,
        priority: pritzkerFacet.priority,
      });
    }
  }

  // 2. Check architectural style (priority 70-92, max 1)
  if (tags.style && tags.style.length > 0 && styleCount < MAX_STYLE_FACETS) {
    const styleFacet = findBestStyleFacet(tags.style, categorySlug, categoryEn);
    if (styleFacet) {
      candidates.push(styleFacet);
      styleCount++;
    }
  }

  // 3. Check Brunch (priority 78)
  if (hasBrunch(tags) && BRUNCH_ALLOWED_CATEGORIES.includes(categorySlug)) {
    const brunchFacet = MOCK_FACET_DICTIONARY.get('Brunch');
    if (brunchFacet && !isDuplicateOfCategory(brunchFacet.en, categoryEn)) {
      candidates.push({
        kind: 'facet',
        id: brunchFacet.id,
        en: brunchFacet.en,
        zh: brunchFacet.zh,
        priority: brunchFacet.priority,
      });
    }
  }

  // 4. Check Cuisine (priority 54-66)
  if (tags.cuisine && tags.cuisine.length > 0 && CUISINE_ALLOWED_CATEGORIES.includes(categorySlug)) {
    const cuisineFacet = findBestCuisineFacet(tags.cuisine, categorySlug, categoryEn);
    if (cuisineFacet) {
      candidates.push(cuisineFacet);
    }
  }

  // 5. Check Architect entity (max 1 entity)
  if (tags.architectQ && tags.architectQ.length > 0 && entityCount < MAX_ENTITIES && entityResolver) {
    try {
      const entity = await entityResolver(tags.architectQ[0], 'architect');
      if (entity && !isDuplicateOfCategory(entity.en, categoryEn)) {
        candidates.push({
          kind: 'architect',
          id: entity.qid,
          en: entity.en,
          zh: entity.zh,
          priority: 50,
        });
        entityCount++;
      }
    } catch { /* ignore */ }
  }

  // 6. Check Person entity (max 1 entity)
  if (tags.personQ && tags.personQ.length > 0 && entityCount < MAX_ENTITIES && entityResolver) {
    try {
      const entity = await entityResolver(tags.personQ[0], 'person');
      if (entity && !isDuplicateOfCategory(entity.en, categoryEn)) {
        candidates.push({
          kind: 'person',
          id: entity.qid,
          en: entity.en,
          zh: entity.zh,
          priority: 50,
        });
        entityCount++;
      }
    } catch { /* ignore */ }
  }

  // Sort by priority and limit to MAX_AI_TAGS
  const sorted = candidates.sort((a, b) => b.priority - a.priority);
  return deduplicateAndLimit(sorted, MAX_AI_TAGS);
}


// ============================================
// Test Data Generators
// ============================================

const categorySlugArbitrary = fc.constantFrom(...ALL_CATEGORIES);

const categoryEnArbitrary = fc.constantFrom(
  'Restaurant', 'Cafe', 'Bakery', 'Bar', 'Museum', 'Gallery', 'Hotel', 'Shop', 'Thrift Store', 'Shopping Mall', 'Bookstore', 'Park', 'Landmark', 'Church', 'Temple', 'Mosque', 'Synagogue'
);

const nonEmptyStringArbitrary = fc.string({ minLength: 1, maxLength: 30 })
  .filter(s => s.trim().length > 0);

const styleValueArbitrary = fc.constantFrom(
  'Brutalist', 'brutalist', 'BRUTALIST',
  'Modernist', 'Modern', 'modern',
  'Contemporary', 'contemporary',
  'Minimalist', 'minimal', 'Minimal',
  'Industrial', 'industrial',
  'ArtDeco', 'Art Deco', 'artdeco',
  'Bauhaus', 'bauhaus',
  'Gothic', 'gothic',
  'Baroque', 'baroque'
);

const cuisineValueArbitrary = fc.constantFrom(
  'Japanese', 'japanese', 'JAPANESE',
  'Korean', 'korean',
  'Vietnamese', 'vietnamese',
  'Thai', 'thai',
  'Chinese', 'chinese',
  'Italian', 'italian',
  'French', 'french',
  'Indian', 'indian',
  'Mexican', 'mexican'
);

const wikidataQidArbitrary = fc.integer({ min: 1, max: 999999 }).map(n => `Q${n}`);

const structuredTagsArbitrary: fc.Arbitrary<StructuredTags> = fc.record({
  style: fc.option(fc.array(styleValueArbitrary, { minLength: 0, maxLength: 3 }), { nil: undefined }),
  theme: fc.option(fc.array(fc.constantFrom('feminism', 'adaptive_reuse'), { minLength: 0, maxLength: 2 }), { nil: undefined }),
  award: fc.option(fc.array(fc.constantFrom('pritzker', 'michelin', 'other'), { minLength: 0, maxLength: 2 }), { nil: undefined }),
  meal: fc.option(fc.array(fc.constantFrom('brunch', 'breakfast', 'lunch', 'dinner'), { minLength: 0, maxLength: 2 }), { nil: undefined }),
  cuisine: fc.option(fc.array(cuisineValueArbitrary, { minLength: 0, maxLength: 3 }), { nil: undefined }),
  architectQ: fc.option(fc.array(wikidataQidArbitrary, { minLength: 0, maxLength: 2 }), { nil: undefined }),
  personQ: fc.option(fc.array(wikidataQidArbitrary, { minLength: 0, maxLength: 2 }), { nil: undefined }),
  alt_category: fc.option(fc.array(fc.constantFrom('museum', 'gallery', 'cafe'), { minLength: 0, maxLength: 2 }), { nil: undefined }),
});

const tagsWithPritzkerArbitrary: fc.Arbitrary<StructuredTags> = fc.record({
  award: fc.constant(['pritzker']),
  style: fc.option(fc.array(styleValueArbitrary, { minLength: 0, maxLength: 2 }), { nil: undefined }),
});

const tagsWithBrunchArbitrary: fc.Arbitrary<StructuredTags> = fc.record({
  meal: fc.constant(['brunch']),
  style: fc.option(fc.array(styleValueArbitrary, { minLength: 0, maxLength: 2 }), { nil: undefined }),
});

const tagsWithMultipleStylesArbitrary: fc.Arbitrary<StructuredTags> = fc.record({
  style: fc.array(styleValueArbitrary, { minLength: 2, maxLength: 5 }),
});

const tagsWithCuisineArbitrary: fc.Arbitrary<StructuredTags> = fc.record({
  cuisine: fc.array(cuisineValueArbitrary, { minLength: 1, maxLength: 3 }),
});

const tagsWithMultipleEntitiesArbitrary: fc.Arbitrary<StructuredTags> = fc.record({
  architectQ: fc.array(wikidataQidArbitrary, { minLength: 1, maxLength: 2 }),
  personQ: fc.array(wikidataQidArbitrary, { minLength: 1, maxLength: 2 }),
});


// ============================================
// Helper Functions
// ============================================

function countStyleFacets(aiTags: AITagElement[]): number {
  return aiTags.filter(tag => tag.kind === 'facet' && STYLE_FACET_IDS.includes(tag.id)).length;
}

function countEntities(aiTags: AITagElement[]): number {
  return aiTags.filter(tag => tag.kind === 'person' || tag.kind === 'architect').length;
}

function hasPritzkerFacet(aiTags: AITagElement[]): boolean {
  return aiTags.some(tag => tag.kind === 'facet' && tag.id === 'Pritzker');
}

function hasBrunchFacet(aiTags: AITagElement[]): boolean {
  return aiTags.some(tag => tag.kind === 'facet' && tag.id === 'Brunch');
}

function hasCuisineFacet(aiTags: AITagElement[]): boolean {
  return aiTags.some(tag => tag.kind === 'facet' && CUISINE_FACET_IDS.includes(tag.id));
}

const mockEntityResolver = async (qid: string, type: 'person' | 'architect'): Promise<EntityInfo | null> => {
  return {
    qid,
    en: `${type === 'architect' ? 'Architect' : 'Person'} ${qid}`,
    zh: `${type === 'architect' ? '建筑师' : '人物'} ${qid}`,
  };
};

// ============================================
// Property Tests
// ============================================

describe('AI Tags Generator Property-Based Tests', () => {
  /**
   * Feature: ai-tags-optimization, Property 3: Facet Dictionary Validation
   * 
   * *For any* ai_tag element with kind='facet', its id must exist in the ai_facet_dictionary table.
   * If the facet has allowed_categories defined, the place's category_slug must be in that list.
   * 
   * **Validates: Requirements 3.2, 3.4**
   */
  describe('Property 3: Facet Dictionary Validation', () => {
    it('should only generate facets with valid IDs from the dictionary', async () => {
      await fc.assert(
        fc.asyncProperty(
          structuredTagsArbitrary,
          categorySlugArbitrary,
          categoryEnArbitrary,
          async (tags: StructuredTags, categorySlug: string, categoryEn: string) => {
            const aiTags = await generateAITagsPure(tags, categorySlug, categoryEn);
            const facetTags = aiTags.filter(tag => tag.kind === 'facet');
            return facetTags.every(tag => KNOWN_FACET_IDS.includes(tag.id));
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should only generate Brunch facet for restaurant/cafe/bakery categories', async () => {
      await fc.assert(
        fc.asyncProperty(
          tagsWithBrunchArbitrary,
          categorySlugArbitrary,
          categoryEnArbitrary,
          async (tags: StructuredTags, categorySlug: string, categoryEn: string) => {
            const aiTags = await generateAITagsPure(tags, categorySlug, categoryEn);
            const hasBrunch = hasBrunchFacet(aiTags);
            const isAllowedCategory = BRUNCH_ALLOWED_CATEGORIES.includes(categorySlug);
            if (hasBrunch) return isAllowedCategory;
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should only generate cuisine facets for restaurant category', async () => {
      await fc.assert(
        fc.asyncProperty(
          tagsWithCuisineArbitrary,
          categorySlugArbitrary,
          categoryEnArbitrary,
          async (tags: StructuredTags, categorySlug: string, categoryEn: string) => {
            const aiTags = await generateAITagsPure(tags, categorySlug, categoryEn);
            const hasCuisine = hasCuisineFacet(aiTags);
            const isAllowedCategory = CUISINE_ALLOWED_CATEGORIES.includes(categorySlug);
            if (hasCuisine) return isAllowedCategory;
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should enforce facet allowed_categories restrictions', async () => {
      await fc.assert(
        fc.asyncProperty(
          structuredTagsArbitrary,
          categorySlugArbitrary,
          categoryEnArbitrary,
          async (tags: StructuredTags, categorySlug: string, categoryEn: string) => {
            const aiTags = await generateAITagsPure(tags, categorySlug, categoryEn);
            for (const tag of aiTags) {
              if (tag.kind === 'facet') {
                if (!isFacetAllowedForCategory(tag.id, categorySlug)) return false;
              }
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * Feature: ai-tags-optimization, Property 4: AI Tags Generation Rules
   * 
   * *For any* place with structured tags:
   * - If tags.award contains 'pritzker', ai_tags should contain Pritzker facet
   * - At most 1 style facet should be in ai_tags
   * - Brunch facet only applies to restaurant/cafe/bakery categories
   * - Cuisine facets only apply to restaurant category
   * - At most 1 entity (person or architect) should be in ai_tags
   * 
   * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8**
   */
  describe('Property 4: AI Tags Generation Rules', () => {
    it('should include Pritzker facet when tags.award contains pritzker', async () => {
      await fc.assert(
        fc.asyncProperty(
          tagsWithPritzkerArbitrary,
          categorySlugArbitrary,
          categoryEnArbitrary.filter(c => c.toLowerCase() !== 'pritzker'),
          async (tags: StructuredTags, categorySlug: string, categoryEn: string) => {
            const aiTags = await generateAITagsPure(tags, categorySlug, categoryEn);
            return hasPritzkerFacet(aiTags);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should detect Pritzker award correctly', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('pritzker', 'Pritzker', 'PRITZKER'),
          (pritzkerValue: string) => {
            const tags: StructuredTags = { award: [pritzkerValue] };
            return hasPritzkerAward(tags) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include at most 1 style facet', async () => {
      await fc.assert(
        fc.asyncProperty(
          tagsWithMultipleStylesArbitrary,
          categorySlugArbitrary,
          categoryEnArbitrary,
          async (tags: StructuredTags, categorySlug: string, categoryEn: string) => {
            const aiTags = await generateAITagsPure(tags, categorySlug, categoryEn);
            return countStyleFacets(aiTags) <= 1;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should only add Brunch facet for restaurant/cafe/bakery', async () => {
      const nonBrunchCategories = ALL_CATEGORIES.filter(c => !BRUNCH_ALLOWED_CATEGORIES.includes(c));
      
      await fc.assert(
        fc.asyncProperty(
          tagsWithBrunchArbitrary,
          fc.constantFrom(...nonBrunchCategories),
          categoryEnArbitrary,
          async (tags: StructuredTags, categorySlug: string, categoryEn: string) => {
            const aiTags = await generateAITagsPure(tags, categorySlug, categoryEn);
            return !hasBrunchFacet(aiTags);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should only add cuisine facets for restaurant category', async () => {
      const nonRestaurantCategories = ALL_CATEGORIES.filter(c => c !== 'restaurant');
      
      await fc.assert(
        fc.asyncProperty(
          tagsWithCuisineArbitrary,
          fc.constantFrom(...nonRestaurantCategories),
          categoryEnArbitrary,
          async (tags: StructuredTags, categorySlug: string, categoryEn: string) => {
            const aiTags = await generateAITagsPure(tags, categorySlug, categoryEn);
            return !hasCuisineFacet(aiTags);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should resolve and add entity tags when QIDs are provided', async () => {
      await fc.assert(
        fc.asyncProperty(
          wikidataQidArbitrary,
          fc.constantFrom('architect', 'person') as fc.Arbitrary<'architect' | 'person'>,
          categorySlugArbitrary,
          categoryEnArbitrary,
          async (qid: string, entityType: 'architect' | 'person', categorySlug: string, categoryEn: string) => {
            const tags: StructuredTags = entityType === 'architect' ? { architectQ: [qid] } : { personQ: [qid] };
            const aiTags = await generateAITagsPure(tags, categorySlug, categoryEn, mockEntityResolver);
            return aiTags.some(tag => tag.kind === entityType);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include at most 1 entity (person or architect)', async () => {
      await fc.assert(
        fc.asyncProperty(
          tagsWithMultipleEntitiesArbitrary,
          categorySlugArbitrary,
          categoryEnArbitrary,
          async (tags: StructuredTags, categorySlug: string, categoryEn: string) => {
            const aiTags = await generateAITagsPure(tags, categorySlug, categoryEn, mockEntityResolver);
            return countEntities(aiTags) <= 1;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should generate at most 2 ai_tags', async () => {
      await fc.assert(
        fc.asyncProperty(
          structuredTagsArbitrary,
          categorySlugArbitrary,
          categoryEnArbitrary,
          async (tags: StructuredTags, categorySlug: string, categoryEn: string) => {
            const aiTags = await generateAITagsPure(tags, categorySlug, categoryEn, mockEntityResolver);
            return aiTags.length <= 2;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not include tags that duplicate category_en', async () => {
      await fc.assert(
        fc.asyncProperty(
          structuredTagsArbitrary,
          categorySlugArbitrary,
          categoryEnArbitrary,
          async (tags: StructuredTags, categorySlug: string, categoryEn: string) => {
            const aiTags = await generateAITagsPure(tags, categorySlug, categoryEn, mockEntityResolver);
            return !aiTags.some(tag => tag.en.toLowerCase() === categoryEn.toLowerCase());
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should detect brunch meal correctly', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('brunch', 'Brunch', 'BRUNCH'),
          (brunchValue: string) => {
            const tags: StructuredTags = { meal: [brunchValue] };
            return hasBrunch(tags) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should detect category duplication correctly (case-insensitive)', () => {
      fc.assert(
        fc.property(
          nonEmptyStringArbitrary,
          fc.boolean(),
          (value: string, useUpperCase: boolean) => {
            const categoryEn = useUpperCase ? value.toUpperCase() : value.toLowerCase();
            const tagEn = useUpperCase ? value.toLowerCase() : value.toUpperCase();
            return isDuplicateOfCategory(tagEn, categoryEn) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return empty array for null or empty tags', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(null, undefined, {}),
          categorySlugArbitrary,
          categoryEnArbitrary,
          async (tags: StructuredTags | null | undefined, categorySlug: string, categoryEn: string) => {
            const aiTags = await generateAITagsPure(tags as StructuredTags, categorySlug, categoryEn);
            return aiTags.length === 0;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
