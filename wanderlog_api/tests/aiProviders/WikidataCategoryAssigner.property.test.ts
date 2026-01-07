/**
 * Property-Based Tests for Wikidata Category Assigner
 * 
 * Feature: wikidata-import
 * 
 * Property 5: Category Assignment Correctness
 * *For any* architecture record, category_slug should be "architecture" and 
 * category_en should be "Architecture". *For any* cemetery record, category_slug 
 * should be "cemetery" and category_en should be "Cemetery".
 * 
 * **Validates: Requirements 3.1, 4.1**
 */

import * as fc from 'fast-check';
import {
  assignCategory,
  WikidataDataType,
} from '../../src/services/wikidataImportUtils';

// ============================================
// Test Data Generators
// ============================================

/**
 * Generator for data types
 */
const dataTypeArbitrary: fc.Arbitrary<WikidataDataType> = fc.constantFrom(
  'architecture',
  'cemetery'
);

// ============================================
// Property 5: Category Assignment Correctness
// ============================================

describe('Wikidata Category Assigner - Property Tests', () => {
  /**
   * Feature: wikidata-import, Property 5: Category Assignment Correctness
   * 
   * *For any* architecture record, category_slug should be "architecture" and 
   * category_en should be "Architecture". *For any* cemetery record, category_slug 
   * should be "cemetery" and category_en should be "Cemetery".
   * 
   * **Validates: Requirements 3.1, 4.1**
   */
  describe('Property 5: Category Assignment Correctness', () => {
    
    /**
     * Architecture records should have correct category
     */
    it('should assign "architecture" category_slug and "Architecture" category_en for architecture data type', () => {
      fc.assert(
        fc.property(
          fc.constant('architecture' as WikidataDataType),
          (dataType: WikidataDataType) => {
            const category = assignCategory(dataType);
            
            return (
              category.categorySlug === 'architecture' &&
              category.categoryEn === 'Architecture'
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Cemetery records should have correct category
     */
    it('should assign "cemetery" category_slug and "Cemetery" category_en for cemetery data type', () => {
      fc.assert(
        fc.property(
          fc.constant('cemetery' as WikidataDataType),
          (dataType: WikidataDataType) => {
            const category = assignCategory(dataType);
            
            return (
              category.categorySlug === 'cemetery' &&
              category.categoryEn === 'Cemetery'
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * For any valid data type, category assignment should be deterministic
     */
    it('should be deterministic - same input always produces same output', () => {
      fc.assert(
        fc.property(
          dataTypeArbitrary,
          (dataType: WikidataDataType) => {
            const category1 = assignCategory(dataType);
            const category2 = assignCategory(dataType);
            
            return (
              category1.categorySlug === category2.categorySlug &&
              category1.categoryEn === category2.categoryEn
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Category slug should match the data type
     */
    it('should have category_slug equal to data type', () => {
      fc.assert(
        fc.property(
          dataTypeArbitrary,
          (dataType: WikidataDataType) => {
            const category = assignCategory(dataType);
            return category.categorySlug === dataType;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Category English name should be capitalized version of data type
     */
    it('should have category_en as capitalized version of data type', () => {
      fc.assert(
        fc.property(
          dataTypeArbitrary,
          (dataType: WikidataDataType) => {
            const category = assignCategory(dataType);
            const expectedEn = dataType.charAt(0).toUpperCase() + dataType.slice(1);
            return category.categoryEn === expectedEn;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
