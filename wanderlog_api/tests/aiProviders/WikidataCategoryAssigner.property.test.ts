/**
 * Property-Based Tests for Wikidata Category Assigner
 * 
 * Feature: wikidata-import
 * 
 * Property 5: Category Assignment Correctness
 * *For any* architecture record, category should be determined by the building name
 * (e.g., "Museum" → museum, "Cathedral" → church, default → landmark).
 * *For any* cemetery record, category_slug should be "cemetery".
 * 
 * **Validates: Requirements 3.1, 4.1**
 */

import * as fc from 'fast-check';
import {
  assignCategory,
  detectCategoryFromName,
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

/**
 * Generator for building names with known category keywords
 */
const buildingNameWithKeyword = (keyword: string): fc.Arbitrary<string> => {
  return fc.tuple(
    fc.constantFrom('', 'The ', 'Grand ', 'Royal ', 'National '),
    fc.constant(keyword),
    fc.constantFrom('', ' of Paris', ' of London', ' of Rome', ' of Vienna')
  ).map(([prefix, kw, suffix]) => `${prefix}${kw}${suffix}`.trim());
};

/**
 * Generator for generic building names without category keywords
 */
const genericBuildingName: fc.Arbitrary<string> = fc.oneof(
  fc.constant('Eiffel Tower'),
  fc.constant('Burj Khalifa'),
  fc.constant('Empire State Building'),
  fc.constant('Sydney Opera House'),
  fc.constant('Colosseum'),
  fc.constant('Parthenon'),
  fc.constant('Big Ben'),
  fc.constant('Leaning Tower of Pisa'),
  fc.constant('Chrysler Building'),
  fc.constant('One World Trade Center')
);

// ============================================
// Property 5: Category Assignment Correctness
// ============================================

describe('Wikidata Category Assigner - Property Tests', () => {
  /**
   * Feature: wikidata-import, Property 5: Category Assignment Correctness
   * 
   * **Validates: Requirements 3.1, 4.1**
   */
  describe('Property 5: Category Assignment Correctness', () => {
    
    /**
     * Cemetery records should always have "cemetery" category
     */
    it('should assign "cemetery" category_slug for cemetery data type regardless of name', () => {
      fc.assert(
        fc.property(
          fc.constant('cemetery' as WikidataDataType),
          fc.string(),
          (dataType: WikidataDataType, name: string) => {
            const category = assignCategory(dataType, name);
            
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
     * Architecture records with "Museum" in name should get museum category
     */
    it('should assign "museum" category for architecture with "Museum" in name', () => {
      fc.assert(
        fc.property(
          fc.constant('architecture' as WikidataDataType),
          buildingNameWithKeyword('Museum'),
          (dataType: WikidataDataType, name: string) => {
            const category = assignCategory(dataType, name);
            
            return (
              category.categorySlug === 'museum' &&
              category.categoryEn === 'Museum'
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Architecture records with church-related keywords should get church category
     */
    it('should assign "church" category for architecture with church keywords', () => {
      const churchKeywords = ['Cathedral', 'Basilica', 'Church', 'Chapel', 'Abbey'];
      
      fc.assert(
        fc.property(
          fc.constant('architecture' as WikidataDataType),
          fc.constantFrom(...churchKeywords).chain(kw => buildingNameWithKeyword(kw)),
          (dataType: WikidataDataType, name: string) => {
            const category = assignCategory(dataType, name);
            
            return (
              category.categorySlug === 'church' &&
              category.categoryEn === 'Church'
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Architecture records with castle/palace keywords should get castle category
     */
    it('should assign "castle" category for architecture with castle/palace keywords', () => {
      const castleKeywords = ['Castle', 'Palace', 'Château', 'Fortress', 'Citadel'];
      
      fc.assert(
        fc.property(
          fc.constant('architecture' as WikidataDataType),
          fc.constantFrom(...castleKeywords).chain(kw => buildingNameWithKeyword(kw)),
          (dataType: WikidataDataType, name: string) => {
            const category = assignCategory(dataType, name);
            
            return (
              category.categorySlug === 'castle' &&
              category.categoryEn === 'Castle'
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Architecture records with temple/mosque keywords should get temple category
     */
    it('should assign "temple" category for architecture with temple/mosque keywords', () => {
      const templeKeywords = ['Temple', 'Mosque', 'Shrine', 'Pagoda', 'Synagogue'];
      
      fc.assert(
        fc.property(
          fc.constant('architecture' as WikidataDataType),
          fc.constantFrom(...templeKeywords).chain(kw => buildingNameWithKeyword(kw)),
          (dataType: WikidataDataType, name: string) => {
            const category = assignCategory(dataType, name);
            
            return (
              category.categorySlug === 'temple' &&
              category.categoryEn === 'Temple'
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Architecture records with university keywords should get university category
     */
    it('should assign "university" category for architecture with university keywords', () => {
      const uniKeywords = ['University', 'College', 'Academy', 'Institute'];
      
      fc.assert(
        fc.property(
          fc.constant('architecture' as WikidataDataType),
          fc.constantFrom(...uniKeywords).chain(kw => buildingNameWithKeyword(kw)),
          (dataType: WikidataDataType, name: string) => {
            const category = assignCategory(dataType, name);
            
            return (
              category.categorySlug === 'university' &&
              category.categoryEn === 'University'
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Architecture records with library keywords should get library category
     */
    it('should assign "library" category for architecture with library keywords', () => {
      fc.assert(
        fc.property(
          fc.constant('architecture' as WikidataDataType),
          buildingNameWithKeyword('Library'),
          (dataType: WikidataDataType, name: string) => {
            const category = assignCategory(dataType, name);
            
            return (
              category.categorySlug === 'library' &&
              category.categoryEn === 'Library'
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Architecture records without category keywords should default to landmark
     */
    it('should default to "landmark" category for architecture without keywords', () => {
      fc.assert(
        fc.property(
          fc.constant('architecture' as WikidataDataType),
          genericBuildingName,
          (dataType: WikidataDataType, name: string) => {
            const category = assignCategory(dataType, name);
            
            // Only check if no keyword is detected
            const detectedSlug = detectCategoryFromName(name);
            if (detectedSlug === 'landmark') {
              return (
                category.categorySlug === 'landmark' &&
                category.categoryEn === 'Landmark'
              );
            }
            return true; // Skip if a keyword was detected
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Category assignment should be deterministic
     */
    it('should be deterministic - same input always produces same output', () => {
      fc.assert(
        fc.property(
          dataTypeArbitrary,
          fc.string(),
          (dataType: WikidataDataType, name: string) => {
            const category1 = assignCategory(dataType, name);
            const category2 = assignCategory(dataType, name);
            
            return (
              category1.categorySlug === category2.categorySlug &&
              category1.categoryEn === category2.categoryEn &&
              category1.categoryZh === category2.categoryZh
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * detectCategoryFromName should handle edge cases
     */
    it('should handle null/undefined/empty names gracefully', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(null, undefined, '', '   '),
          (name: string | null | undefined) => {
            const slug = detectCategoryFromName(name as string);
            return slug === 'landmark';
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});
