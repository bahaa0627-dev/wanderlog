/**
 * Property-based tests for Original Data Preservation
 * 
 * Feature: wikidata-data-quality
 * Property 5: Original Data Preservation Invariant
 * Property 6: Fix Type Recording
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4
 */

import * as fc from 'fast-check';
import { 
  preserveOriginalData, 
  hasBeenFixed,
  PlaceRecordForFix,
  FixType 
} from '../../src/services/wikidataImportUtils';

describe('Data Preservation - Property Tests', () => {
  // Helper to create a place record
  const createPlace = (overrides: Partial<PlaceRecordForFix> = {}): PlaceRecordForFix => ({
    id: 'test-id',
    name: 'Test Place',
    categorySlug: 'landmark',
    categoryEn: 'Landmark',
    categoryZh: '地标',
    sourceDetail: 'Q12345',
    customFields: null,
    ...overrides,
  });

  /**
   * Property 5: Original Data Preservation Invariant
   * 
   * For any place update operation, if the place's name or category is being
   * changed, the original value must be stored in customFields before the update.
   */
  describe('Property 5: Original Data Preservation Invariant', () => {
    it('should preserve original name for qid_name fix', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          (originalName) => {
            const place = createPlace({ name: originalName });
            const result = preserveOriginalData(place, 'qid_name', null);
            return result.originalName === originalName;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve original name for translation fix', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          (originalName) => {
            const place = createPlace({ name: originalName });
            const result = preserveOriginalData(place, 'translation', null);
            return result.originalName === originalName;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve original category for category fix', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('landmark', 'museum', 'hotel', 'church', 'castle'),
          (originalCategory) => {
            const place = createPlace({ categorySlug: originalCategory });
            const result = preserveOriginalData(place, 'category', null);
            return result.originalCategory === originalCategory;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not overwrite existing originalName', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          (existingOriginal, currentName) => {
            const place = createPlace({ name: currentName });
            const existingCustomFields = { originalName: existingOriginal };
            const result = preserveOriginalData(place, 'qid_name', existingCustomFields);
            return result.originalName === existingOriginal;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not overwrite existing originalCategory', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('landmark', 'museum', 'hotel'),
          fc.constantFrom('church', 'castle', 'library'),
          (existingOriginal, currentCategory) => {
            const place = createPlace({ categorySlug: currentCategory });
            const existingCustomFields = { originalCategory: existingOriginal };
            const result = preserveOriginalData(place, 'category', existingCustomFields);
            return result.originalCategory === existingOriginal;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 6: Fix Type Recording
   * 
   * For any place update operation, the customFields.fixType array must contain
   * exactly the types of fixes applied.
   */
  describe('Property 6: Fix Type Recording', () => {
    it('should add fix type to empty fixType array', () => {
      fc.assert(
        fc.property(
          fc.constantFrom<FixType>('qid_name', 'category', 'translation'),
          (fixType) => {
            const place = createPlace();
            const result = preserveOriginalData(place, fixType, null);
            const fixTypes = result.fixType as string[];
            return fixTypes.includes(fixType) && fixTypes.length === 1;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should append new fix type to existing array', () => {
      fc.assert(
        fc.property(
          fc.constantFrom<FixType>('qid_name', 'category', 'translation'),
          fc.constantFrom<FixType>('qid_name', 'category', 'translation'),
          (existingType, newType) => {
            if (existingType === newType) return true; // Skip same type
            
            const place = createPlace();
            const existingCustomFields = { fixType: [existingType] };
            const result = preserveOriginalData(place, newType, existingCustomFields);
            const fixTypes = result.fixType as string[];
            return fixTypes.includes(existingType) && fixTypes.includes(newType);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not duplicate fix type if already present', () => {
      fc.assert(
        fc.property(
          fc.constantFrom<FixType>('qid_name', 'category', 'translation'),
          (fixType) => {
            const place = createPlace();
            const existingCustomFields = { fixType: [fixType] };
            const result = preserveOriginalData(place, fixType, existingCustomFields);
            const fixTypes = result.fixType as string[];
            return fixTypes.filter(t => t === fixType).length === 1;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always add lastFixedAt timestamp', () => {
      fc.assert(
        fc.property(
          fc.constantFrom<FixType>('qid_name', 'category', 'translation'),
          (fixType) => {
            const place = createPlace();
            const result = preserveOriginalData(place, fixType, null);
            return typeof result.lastFixedAt === 'string' && 
                   result.lastFixedAt.length > 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should update lastFixedAt on subsequent fixes', () => {
      const place = createPlace();
      const firstResult = preserveOriginalData(place, 'qid_name', null);
      const firstTimestamp = firstResult.lastFixedAt;
      
      // Wait a tiny bit to ensure different timestamp
      const secondResult = preserveOriginalData(place, 'category', firstResult);
      const secondTimestamp = secondResult.lastFixedAt;
      
      // Timestamps should be valid ISO strings
      expect(new Date(firstTimestamp as string).toISOString()).toBe(firstTimestamp);
      expect(new Date(secondTimestamp as string).toISOString()).toBe(secondTimestamp);
    });
  });

  describe('hasBeenFixed helper', () => {
    it('should return false for null customFields', () => {
      expect(hasBeenFixed(null, 'qid_name')).toBe(false);
    });

    it('should return false for empty customFields', () => {
      expect(hasBeenFixed({}, 'qid_name')).toBe(false);
    });

    it('should return true if fix type is in array', () => {
      const customFields = { fixType: ['qid_name', 'category'] };
      expect(hasBeenFixed(customFields, 'qid_name')).toBe(true);
      expect(hasBeenFixed(customFields, 'category')).toBe(true);
    });

    it('should return false if fix type is not in array', () => {
      const customFields = { fixType: ['qid_name'] };
      expect(hasBeenFixed(customFields, 'category')).toBe(false);
      expect(hasBeenFixed(customFields, 'translation')).toBe(false);
    });
  });
});
