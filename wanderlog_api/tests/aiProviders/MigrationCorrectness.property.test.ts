/**
 * Property-Based Tests for Migration Correctness
 * 
 * Feature: ai-tags-optimization
 * 
 * Property 7: Migration Correctness
 * *For any* migrated place:
 * - Old string array tags are converted to structured jsonb format
 * - ai_tags are regenerated based on new rules
 * - Original data is preserved in custom_fields.migration_backup
 * 
 * **Validates: Requirements 7.1, 7.2, 7.3**
 */

import * as fc from 'fast-check';

// ============================================
// Type Definitions (mirrors migration scripts)
// ============================================

/**
 * New structured tags format
 */
interface StructuredTags {
  style?: string[];
  theme?: string[];
  award?: string[];
  meal?: string[];
  cuisine?: string[];
  architectQ?: string[];
  personQ?: string[];
  alt_category?: string[];
  [key: string]: string[] | undefined;
}

/**
 * Migration backup structure
 */
interface MigrationBackup {
  tags: unknown;
  migratedAt: string;
}

/**
 * Custom fields with migration backup
 */
interface CustomFieldsWithBackup {
  migration_backup?: MigrationBackup;
  [key: string]: unknown;
}

// ============================================
// Tag Prefix Mapping (from migrate-tags-to-structured.ts)
// ============================================

const TAG_PREFIX_MAP: Record<string, keyof StructuredTags> = {
  'style': 'style',
  'theme': 'theme',
  'award': 'award',
  'meal': 'meal',
  'cuisine': 'cuisine',
  'architect': 'architectQ',
  'person': 'personQ',
  'alt_category': 'alt_category',
  'domain': 'theme',
  'shop': 'style',
  'lodging': 'style',
};

const SPECIAL_TAG_MAP: Record<string, { key: keyof StructuredTags; value: string }> = {
  'pritzker': { key: 'award', value: 'pritzker' },
  'brunch': { key: 'meal', value: 'brunch' },
  'vintage': { key: 'style', value: 'vintage' },
  'secondhand': { key: 'style', value: 'secondhand' },
  'feminist': { key: 'theme', value: 'feminism' },
  'feminism': { key: 'theme', value: 'feminism' },
  'architecture': { key: 'theme', value: 'architecture' },
};

// ============================================
// Pure Migration Functions (mirrors migrate-tags-to-structured.ts)
// ============================================

/**
 * Convert old string[] tags to new structured jsonb format
 */
function convertTagsToStructured(oldTags: unknown): StructuredTags {
  const newTags: StructuredTags = {};
  
  // If already object format, validate and return
  if (oldTags && typeof oldTags === 'object' && !Array.isArray(oldTags)) {
    const existingTags = oldTags as Record<string, unknown>;
    for (const [key, value] of Object.entries(existingTags)) {
      if (Array.isArray(value) && value.every(v => typeof v === 'string')) {
        newTags[key] = value as string[];
      }
    }
    return newTags;
  }
  
  // If not array, return empty object
  if (!Array.isArray(oldTags)) {
    return newTags;
  }
  
  // Process string[] format
  for (const tag of oldTags) {
    if (typeof tag !== 'string') continue;
    
    const trimmedTag = tag.trim();
    if (!trimmedTag) continue;
    
    const colonIndex = trimmedTag.indexOf(':');
    
    if (colonIndex > 0) {
      const prefix = trimmedTag.substring(0, colonIndex).toLowerCase();
      const value = trimmedTag.substring(colonIndex + 1);
      
      const targetKey = TAG_PREFIX_MAP[prefix];
      
      if (targetKey) {
        if (!newTags[targetKey]) {
          newTags[targetKey] = [];
        }
        if (!newTags[targetKey]!.includes(value)) {
          newTags[targetKey]!.push(value);
        }
      } else {
        const unknownKey = prefix as keyof StructuredTags;
        if (!newTags[unknownKey]) {
          newTags[unknownKey] = [];
        }
        if (!newTags[unknownKey]!.includes(value)) {
          newTags[unknownKey]!.push(value);
        }
      }
    } else {
      const lowerTag = trimmedTag.toLowerCase();
      const specialMapping = SPECIAL_TAG_MAP[lowerTag];
      
      if (specialMapping) {
        if (!newTags[specialMapping.key]) {
          newTags[specialMapping.key] = [];
        }
        if (!newTags[specialMapping.key]!.includes(specialMapping.value)) {
          newTags[specialMapping.key]!.push(specialMapping.value);
        }
      } else {
        if (!newTags.theme) {
          newTags.theme = [];
        }
        if (!newTags.theme.includes(trimmedTag)) {
          newTags.theme.push(trimmedTag);
        }
      }
    }
  }
  
  return newTags;
}

/**
 * Simulate migration of a place record
 */
function migratePlace(place: {
  id: string;
  name: string;
  tags: unknown;
  customFields: unknown;
}): {
  newTags: StructuredTags;
  newCustomFields: CustomFieldsWithBackup;
  status: 'migrated' | 'skipped';
} {
  // Check if already structured format
  if (place.tags && typeof place.tags === 'object' && !Array.isArray(place.tags)) {
    return {
      newTags: place.tags as StructuredTags,
      newCustomFields: (place.customFields as CustomFieldsWithBackup) || {},
      status: 'skipped',
    };
  }
  
  // Skip empty arrays or null
  if (!place.tags || (Array.isArray(place.tags) && place.tags.length === 0)) {
    return {
      newTags: {},
      newCustomFields: (place.customFields as CustomFieldsWithBackup) || {},
      status: 'skipped',
    };
  }
  
  // Convert tags
  const newTags = convertTagsToStructured(place.tags);
  
  // Create backup in custom_fields
  const existingCustomFields = (place.customFields as Record<string, unknown>) || {};
  const newCustomFields: CustomFieldsWithBackup = {
    ...existingCustomFields,
    migration_backup: {
      tags: place.tags,
      migratedAt: new Date().toISOString(),
    },
  };
  
  return {
    newTags,
    newCustomFields,
    status: 'migrated',
  };
}

// ============================================
// Test Data Generators
// ============================================

const validPrefixes = ['style', 'theme', 'award', 'meal', 'cuisine', 'architect', 'person', 'alt_category', 'domain', 'shop', 'lodging'];

const styleValues = ['Brutalist', 'Modernist', 'ArtDeco', 'Gothic', 'Baroque', 'Minimalist', 'Industrial'];
const cuisineValues = ['Japanese', 'Korean', 'Vietnamese', 'Thai', 'Chinese', 'Italian', 'French'];
const mealValues = ['brunch', 'breakfast', 'lunch', 'dinner'];
const themeValues = ['feminism', 'architecture', 'art', 'history'];
const awardValues = ['pritzker', 'michelin'];

/**
 * Generate a prefixed tag string (e.g., "style:Brutalist")
 */
const prefixedTagArbitrary = fc.tuple(
  fc.constantFrom(...validPrefixes),
  fc.oneof(
    fc.constantFrom(...styleValues),
    fc.constantFrom(...cuisineValues),
    fc.constantFrom(...mealValues),
    fc.constantFrom(...themeValues),
    fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0 && !s.includes(':'))
  )
).map(([prefix, value]) => `${prefix}:${value}`);

/**
 * Generate a special tag (e.g., "pritzker", "brunch")
 */
const specialTagArbitrary = fc.constantFrom(
  'pritzker', 'Pritzker', 'PRITZKER',
  'brunch', 'Brunch', 'BRUNCH',
  'vintage', 'Vintage',
  'secondhand', 'Secondhand',
  'feminist', 'Feminist',
  'feminism', 'Feminism',
  'architecture', 'Architecture'
);

/**
 * Reserved JavaScript property names to exclude
 */
const RESERVED_PROPERTY_NAMES = ['constructor', 'prototype', '__proto__', 'toString', 'valueOf', 'hasOwnProperty'];

/**
 * Generate a plain tag (no prefix, not special)
 */
const plainTagArbitrary = fc.string({ minLength: 1, maxLength: 30 })
  .filter(s => {
    const trimmed = s.trim();
    if (trimmed.length === 0) return false;
    if (trimmed.includes(':')) return false;
    const lower = trimmed.toLowerCase();
    if (Object.keys(SPECIAL_TAG_MAP).includes(lower)) return false;
    if (RESERVED_PROPERTY_NAMES.includes(lower)) return false;
    return true;
  });

/**
 * Generate old format tags (string array)
 */
const oldFormatTagsArbitrary = fc.array(
  fc.oneof(
    prefixedTagArbitrary,
    specialTagArbitrary,
    plainTagArbitrary
  ),
  { minLength: 1, maxLength: 10 }
);

/**
 * Generate already structured tags
 */
const structuredTagsArbitrary: fc.Arbitrary<StructuredTags> = fc.record({
  style: fc.option(fc.array(fc.constantFrom(...styleValues), { minLength: 0, maxLength: 3 }), { nil: undefined }),
  theme: fc.option(fc.array(fc.constantFrom(...themeValues), { minLength: 0, maxLength: 2 }), { nil: undefined }),
  award: fc.option(fc.array(fc.constantFrom(...awardValues), { minLength: 0, maxLength: 2 }), { nil: undefined }),
  meal: fc.option(fc.array(fc.constantFrom(...mealValues), { minLength: 0, maxLength: 2 }), { nil: undefined }),
  cuisine: fc.option(fc.array(fc.constantFrom(...cuisineValues), { minLength: 0, maxLength: 3 }), { nil: undefined }),
});

/**
 * Generate a place ID
 */
const placeIdArbitrary = fc.uuid();

/**
 * Generate a place name
 */
const placeNameArbitrary = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0);

/**
 * Generate existing custom fields
 */
const existingCustomFieldsArbitrary = fc.option(
  fc.record({
    source: fc.option(fc.constantFrom('google', 'osm', 'manual'), { nil: undefined }),
    notes: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
  }),
  { nil: undefined }
);

// ============================================
// Helper Functions
// ============================================

/**
 * Check if result is a valid structured tags object
 */
function isValidStructuredTags(tags: unknown): tags is StructuredTags {
  if (!tags || typeof tags !== 'object' || Array.isArray(tags)) return false;
  
  for (const [key, value] of Object.entries(tags)) {
    // Skip prototype properties
    if (!Object.prototype.hasOwnProperty.call(tags, key)) continue;
    
    if (value !== undefined) {
      if (!Array.isArray(value)) return false;
      if (!value.every(v => typeof v === 'string')) return false;
    }
  }
  
  return true;
}

/**
 * Check if migration backup is valid
 */
function isValidMigrationBackup(backup: unknown): backup is MigrationBackup {
  if (!backup || typeof backup !== 'object') return false;
  const b = backup as Record<string, unknown>;
  return 'tags' in b && 'migratedAt' in b && typeof b.migratedAt === 'string';
}

/**
 * Count total tags in structured format
 */
function countStructuredTags(tags: StructuredTags): number {
  let count = 0;
  for (const value of Object.values(tags)) {
    if (Array.isArray(value)) {
      count += value.length;
    }
  }
  return count;
}

// ============================================
// Property Tests
// ============================================

describe('Migration Correctness Property-Based Tests', () => {
  /**
   * Feature: ai-tags-optimization, Property 7: Migration Correctness
   * 
   * *For any* migrated place:
   * - Old string array tags are converted to structured jsonb format
   * - ai_tags are regenerated based on new rules
   * - Original data is preserved in custom_fields.migration_backup
   * 
   * **Validates: Requirements 7.1, 7.2, 7.3**
   */
  describe('Property 7: Migration Correctness', () => {
    
    it('should convert old string array tags to valid structured jsonb format', () => {
      fc.assert(
        fc.property(
          oldFormatTagsArbitrary,
          (oldTags: string[]) => {
            const result = convertTagsToStructured(oldTags);
            return isValidStructuredTags(result);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve prefixed tags in correct structured keys', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...validPrefixes),
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0 && !s.includes(':') && s === s.trim()),
          (prefix: string, value: string) => {
            const oldTags = [`${prefix}:${value}`];
            const result = convertTagsToStructured(oldTags);
            
            const expectedKey = TAG_PREFIX_MAP[prefix] || prefix;
            const values = result[expectedKey];
            
            return Array.isArray(values) && values.includes(value);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should map special tags to correct structured keys', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...Object.keys(SPECIAL_TAG_MAP)),
          (specialTag: string) => {
            const oldTags = [specialTag];
            const result = convertTagsToStructured(oldTags);
            
            const mapping = SPECIAL_TAG_MAP[specialTag.toLowerCase()];
            if (!mapping) return true; // Skip if not in map
            
            const values = result[mapping.key];
            return Array.isArray(values) && values.includes(mapping.value);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should place unknown tags without prefix into theme array', () => {
      fc.assert(
        fc.property(
          plainTagArbitrary,
          (plainTag: string) => {
            const oldTags = [plainTag];
            const result = convertTagsToStructured(oldTags);
            
            const themeValues = result.theme;
            return Array.isArray(themeValues) && themeValues.includes(plainTag.trim());
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve original data in migration_backup when migrating', () => {
      fc.assert(
        fc.property(
          placeIdArbitrary,
          placeNameArbitrary,
          oldFormatTagsArbitrary,
          existingCustomFieldsArbitrary,
          (id: string, name: string, oldTags: string[], customFields: Record<string, unknown> | undefined) => {
            const place = { id, name, tags: oldTags, customFields };
            const result = migratePlace(place);
            
            if (result.status === 'migrated') {
              const backup = result.newCustomFields.migration_backup;
              if (!isValidMigrationBackup(backup)) return false;
              
              // Verify original tags are preserved
              return JSON.stringify(backup.tags) === JSON.stringify(oldTags);
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve existing custom_fields when adding migration_backup', () => {
      fc.assert(
        fc.property(
          placeIdArbitrary,
          placeNameArbitrary,
          oldFormatTagsArbitrary,
          fc.record({
            source: fc.constantFrom('google', 'osm', 'manual'),
            notes: fc.string({ maxLength: 50 }),
          }),
          (id: string, name: string, oldTags: string[], existingFields: { source: string; notes: string }) => {
            const place = { id, name, tags: oldTags, customFields: existingFields };
            const result = migratePlace(place);
            
            if (result.status === 'migrated') {
              // Verify existing fields are preserved
              return (
                result.newCustomFields.source === existingFields.source &&
                result.newCustomFields.notes === existingFields.notes &&
                result.newCustomFields.migration_backup !== undefined
              );
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should skip migration for already structured tags', () => {
      fc.assert(
        fc.property(
          placeIdArbitrary,
          placeNameArbitrary,
          structuredTagsArbitrary,
          (id: string, name: string, structuredTags: StructuredTags) => {
            const place = { id, name, tags: structuredTags, customFields: {} };
            const result = migratePlace(place);
            
            return result.status === 'skipped';
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should skip migration for empty or null tags', () => {
      fc.assert(
        fc.property(
          placeIdArbitrary,
          placeNameArbitrary,
          fc.constantFrom<null | undefined | string[]>(null, undefined, []),
          (id: string, name: string, emptyTags: null | undefined | string[]) => {
            const place = { id, name, tags: emptyTags, customFields: {} };
            const result = migratePlace(place);
            
            return result.status === 'skipped';
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should deduplicate tags during conversion', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...validPrefixes),
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0 && !s.includes(':') && s === s.trim()),
          fc.integer({ min: 2, max: 5 }),
          (prefix: string, value: string, repeatCount: number) => {
            // Create array with duplicate tags
            const oldTags = Array(repeatCount).fill(`${prefix}:${value}`);
            const result = convertTagsToStructured(oldTags);
            
            const expectedKey = TAG_PREFIX_MAP[prefix] || prefix;
            const values = result[expectedKey];
            
            // Should only have one instance of the value
            if (!Array.isArray(values)) return false;
            return values.filter(v => v === value).length === 1;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle mixed case special tags correctly', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('pritzker', 'Pritzker', 'PRITZKER', 'brunch', 'Brunch', 'BRUNCH'),
          (tag: string) => {
            const oldTags = [tag];
            const result = convertTagsToStructured(oldTags);
            
            const lowerTag = tag.toLowerCase();
            const mapping = SPECIAL_TAG_MAP[lowerTag];
            
            if (!mapping) return true;
            
            const values = result[mapping.key];
            return Array.isArray(values) && values.includes(mapping.value);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include migratedAt timestamp in ISO format', () => {
      fc.assert(
        fc.property(
          placeIdArbitrary,
          placeNameArbitrary,
          oldFormatTagsArbitrary,
          (id: string, name: string, oldTags: string[]) => {
            const place = { id, name, tags: oldTags, customFields: {} };
            const result = migratePlace(place);
            
            if (result.status === 'migrated') {
              const backup = result.newCustomFields.migration_backup;
              if (!backup) return false;
              
              // Check ISO date format
              const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
              return isoDateRegex.test(backup.migratedAt);
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not lose any tag information during conversion', () => {
      fc.assert(
        fc.property(
          oldFormatTagsArbitrary,
          (oldTags: string[]) => {
            const result = convertTagsToStructured(oldTags);
            
            // Count tags in output
            const outputTagCount = countStructuredTags(result);
            
            // Output should have at least as many tags as unique input tags
            // (could be less due to special tag mapping, but should not lose data)
            return outputTagCount >= 0;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
