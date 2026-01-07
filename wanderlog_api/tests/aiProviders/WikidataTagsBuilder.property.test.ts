/**
 * Property-Based Tests for Wikidata Tags Builder
 * 
 * Feature: wikidata-import
 * 
 * Property 6: Style Tag Conditional Assignment
 * *For any* architecture record from a style-named file (not architecture1.json 
 * or architecture2.json), the tags.style array should contain the styleLabel value. 
 * *For any* architecture record from architecture1.json or architecture2.json, 
 * tags.style should not be populated from the file.
 * 
 * Property 7: Cemetery Theme Tag Generation
 * *For any* cemetery record with specific count fields > 0, the corresponding 
 * theme should be present in tags.theme.
 * 
 * **Validates: Requirements 3.2, 3.3, 4.2, 4.3, 4.4, 4.5, 4.6**
 */

import * as fc from 'fast-check';
import {
  TagsBuilder,
  MergedRecord,
} from '../../src/services/wikidataImportUtils';

// ============================================
// Test Data Generators
// ============================================

/**
 * Generator for architect names
 */
const architectNameArbitrary: fc.Arbitrary<string> = fc.constantFrom(
  'Oscar Niemeyer',
  'Frank Lloyd Wright',
  'Zaha Hadid',
  'Le Corbusier',
  'Tadao Ando',
  'Renzo Piano'
);

/**
 * Generator for style names
 */
const styleNameArbitrary = fc.constantFrom(
  'Brutalist',
  'Art Deco',
  'Art Nouveau',
  'Gothic',
  'Modern',
  'Postmodern'
);

/**
 * Generator for top architecture file names (should NOT add style tags)
 */
const topArchitectureFileArbitrary = fc.constantFrom(
  'architecture1.json',
  'architecture2.json',
  'Architecture1.json',
  'Architecture2.json',
  'ARCHITECTURE1.JSON',
  'ARCHITECTURE2.JSON'
);

/**
 * Generator for style-named file names (SHOULD add style tags)
 */
const styleNamedFileArbitrary = fc.constantFrom(
  'Brutalism.json',
  'ArtDeco.json',
  'ArtNouveau.json',
  'Gothic.json',
  'Modern.json',
  'Postmodern.json',
  'Baroque.json',
  'Renaissance.json',
  'Minimalism.json'
);



// ============================================
// Property 6: Style Tag Conditional Assignment
// ============================================

describe('Wikidata Tags Builder - Property Tests', () => {
  const tagsBuilder = new TagsBuilder();

  /**
   * Feature: wikidata-import, Property 6: Style Tag Conditional Assignment
   * 
   * *For any* architecture record from a style-named file (not architecture1.json 
   * or architecture2.json), the tags.style array should contain the styleLabel value. 
   * *For any* architecture record from architecture1.json or architecture2.json, 
   * tags.style should not be populated from the file.
   * 
   * **Validates: Requirements 3.2, 3.3**
   */
  describe('Property 6: Style Tag Conditional Assignment', () => {
    
    /**
     * Style tags should NOT be added for architecture1.json or architecture2.json
     */
    it('should NOT add style tags for records from architecture1.json or architecture2.json', () => {
      fc.assert(
        fc.property(
          topArchitectureFileArbitrary,
          fc.array(styleNameArbitrary, { minLength: 1, maxLength: 3 }),
          (sourceFile: string, styles: string[]) => {
            const record: MergedRecord = {
              qid: 'Q123',
              name: 'Test Building',
              coordinates: { latitude: 48.8, longitude: 2.3 },
              architects: [],
              styles,
              images: [],
              sourceUrls: {},
              dataType: 'architecture',
              sourceFile,
            };
            
            const tags = tagsBuilder.buildArchitectureTags(record);
            
            // Style tags should be undefined or empty for top architecture files
            return tags.style === undefined || tags.style.length === 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Style tags SHOULD be added for style-named files
     */
    it('should add style tags for records from style-named files', () => {
      fc.assert(
        fc.property(
          styleNamedFileArbitrary,
          fc.array(styleNameArbitrary, { minLength: 1, maxLength: 3 }),
          (sourceFile: string, styles: string[]) => {
            const record: MergedRecord = {
              qid: 'Q123',
              name: 'Test Building',
              coordinates: { latitude: 48.8, longitude: 2.3 },
              architects: [],
              styles,
              images: [],
              sourceUrls: {},
              dataType: 'architecture',
              sourceFile,
            };
            
            const tags = tagsBuilder.buildArchitectureTags(record);
            
            // Style tags should be present and contain all styles
            if (!tags.style) return false;
            
            // All input styles should be in the output
            for (const style of styles) {
              if (!tags.style.includes(style)) {
                return false;
              }
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * shouldAddStyleTag should return false for top architecture files
     */
    it('shouldAddStyleTag should return false for architecture1/2 files', () => {
      fc.assert(
        fc.property(
          topArchitectureFileArbitrary,
          (sourceFile: string) => {
            return tagsBuilder.shouldAddStyleTag(sourceFile) === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * shouldAddStyleTag should return true for style-named files
     */
    it('shouldAddStyleTag should return true for style-named files', () => {
      fc.assert(
        fc.property(
          styleNamedFileArbitrary,
          (sourceFile: string) => {
            return tagsBuilder.shouldAddStyleTag(sourceFile) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Architect tags should always be added regardless of source file
     */
    it('should always add architect tags regardless of source file', () => {
      fc.assert(
        fc.property(
          fc.oneof(topArchitectureFileArbitrary, styleNamedFileArbitrary),
          fc.array(architectNameArbitrary, { minLength: 1, maxLength: 3 }),
          (sourceFile: string, architects: string[]) => {
            const record: MergedRecord = {
              qid: 'Q123',
              name: 'Test Building',
              coordinates: { latitude: 48.8, longitude: 2.3 },
              architects,
              styles: [],
              images: [],
              sourceUrls: {},
              dataType: 'architecture',
              sourceFile,
            };
            
            const tags = tagsBuilder.buildArchitectureTags(record);
            
            // Architect tags should be present
            if (!tags.architect) return false;
            
            // All input architects should be in the output
            for (const architect of architects) {
              if (!tags.architect.includes(architect)) {
                return false;
              }
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  // ============================================
  // Property 7: Cemetery Theme Tag Generation
  // ============================================

  /**
   * Feature: wikidata-import, Property 7: Cemetery Theme Tag Generation
   * 
   * *For any* cemetery record with specific count fields > 0, the corresponding 
   * theme should be present in tags.theme. Specifically:
   * - artistCount > 0 → "artist" in theme
   * - scientistCount > 0 → "scientist" in theme  
   * - musicCount > 0 → "musician" in theme
   * - writerCount > 0 → "writer" in theme
   * - celebsCount > 0 with no specific counts → "celebrity" in theme
   * 
   * **Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.6**
   */
  describe('Property 7: Cemetery Theme Tag Generation', () => {
    
    /**
     * artistCount > 0 should add "artist" to theme
     */
    it('should add "artist" to theme when artistCount > 0', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 500 }),
          (artistCount: number) => {
            const record: MergedRecord = {
              qid: 'Q123',
              name: 'Test Cemetery',
              coordinates: { latitude: 48.8, longitude: 2.3 },
              architects: [],
              styles: [],
              images: [],
              celebrityCounts: { artist: artistCount },
              sourceUrls: {},
              dataType: 'cemetery',
              sourceFile: 'cemetery1.json',
            };
            
            const tags = tagsBuilder.buildCemeteryTags(record);
            
            return tags.theme !== undefined && tags.theme.includes('artist');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * scientistCount > 0 should add "scientist" to theme
     */
    it('should add "scientist" to theme when scientistCount > 0', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 500 }),
          (scientistCount: number) => {
            const record: MergedRecord = {
              qid: 'Q123',
              name: 'Test Cemetery',
              coordinates: { latitude: 48.8, longitude: 2.3 },
              architects: [],
              styles: [],
              images: [],
              celebrityCounts: { scientist: scientistCount },
              sourceUrls: {},
              dataType: 'cemetery',
              sourceFile: 'cemetery1.json',
            };
            
            const tags = tagsBuilder.buildCemeteryTags(record);
            
            return tags.theme !== undefined && tags.theme.includes('scientist');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * musicCount > 0 should add "musician" to theme
     */
    it('should add "musician" to theme when musicCount > 0', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 500 }),
          (musicCount: number) => {
            const record: MergedRecord = {
              qid: 'Q123',
              name: 'Test Cemetery',
              coordinates: { latitude: 48.8, longitude: 2.3 },
              architects: [],
              styles: [],
              images: [],
              celebrityCounts: { musician: musicCount },
              sourceUrls: {},
              dataType: 'cemetery',
              sourceFile: 'cemetery1.json',
            };
            
            const tags = tagsBuilder.buildCemeteryTags(record);
            
            return tags.theme !== undefined && tags.theme.includes('musician');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * writerCount > 0 should add "writer" to theme
     */
    it('should add "writer" to theme when writerCount > 0', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 500 }),
          (writerCount: number) => {
            const record: MergedRecord = {
              qid: 'Q123',
              name: 'Test Cemetery',
              coordinates: { latitude: 48.8, longitude: 2.3 },
              architects: [],
              styles: [],
              images: [],
              celebrityCounts: { writer: writerCount },
              sourceUrls: {},
              dataType: 'cemetery',
              sourceFile: 'cemetery1.json',
            };
            
            const tags = tagsBuilder.buildCemeteryTags(record);
            
            return tags.theme !== undefined && tags.theme.includes('writer');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * celebsCount > 0 with no specific counts should add "celebrity" to theme
     */
    it('should add "celebrity" to theme when celebsCount > 0 but no specific counts', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }),
          (totalCount: number) => {
            const record: MergedRecord = {
              qid: 'Q123',
              name: 'Test Cemetery',
              coordinates: { latitude: 48.8, longitude: 2.3 },
              architects: [],
              styles: [],
              images: [],
              celebrityCounts: { total: totalCount },
              sourceUrls: {},
              dataType: 'cemetery',
              sourceFile: 'cemetery1.json',
            };
            
            const tags = tagsBuilder.buildCemeteryTags(record);
            
            return tags.theme !== undefined && tags.theme.includes('celebrity');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * celebsCount > 0 WITH specific counts should NOT add "celebrity" to theme
     */
    it('should NOT add "celebrity" to theme when celebsCount > 0 AND specific counts exist', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }),
          fc.integer({ min: 1, max: 500 }),
          (totalCount: number, artistCount: number) => {
            const record: MergedRecord = {
              qid: 'Q123',
              name: 'Test Cemetery',
              coordinates: { latitude: 48.8, longitude: 2.3 },
              architects: [],
              styles: [],
              images: [],
              celebrityCounts: { total: totalCount, artist: artistCount },
              sourceUrls: {},
              dataType: 'cemetery',
              sourceFile: 'cemetery1.json',
            };
            
            const tags = tagsBuilder.buildCemeteryTags(record);
            
            // Should have "artist" but NOT "celebrity"
            return (
              tags.theme !== undefined &&
              tags.theme.includes('artist') &&
              !tags.theme.includes('celebrity')
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Multiple specific counts should add all corresponding themes
     */
    it('should add all corresponding themes when multiple specific counts > 0', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 500 }),
          fc.integer({ min: 1, max: 500 }),
          fc.integer({ min: 1, max: 500 }),
          fc.integer({ min: 1, max: 500 }),
          (artistCount: number, writerCount: number, musicianCount: number, scientistCount: number) => {
            const record: MergedRecord = {
              qid: 'Q123',
              name: 'Test Cemetery',
              coordinates: { latitude: 48.8, longitude: 2.3 },
              architects: [],
              styles: [],
              images: [],
              celebrityCounts: {
                artist: artistCount,
                writer: writerCount,
                musician: musicianCount,
                scientist: scientistCount,
              },
              sourceUrls: {},
              dataType: 'cemetery',
              sourceFile: 'cemetery1.json',
            };
            
            const tags = tagsBuilder.buildCemeteryTags(record);
            
            return (
              tags.theme !== undefined &&
              tags.theme.includes('artist') &&
              tags.theme.includes('writer') &&
              tags.theme.includes('musician') &&
              tags.theme.includes('scientist') &&
              !tags.theme.includes('celebrity')
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Zero counts should not add themes
     */
    it('should not add themes when counts are zero', () => {
      fc.assert(
        fc.property(
          fc.constant(0),
          () => {
            const record: MergedRecord = {
              qid: 'Q123',
              name: 'Test Cemetery',
              coordinates: { latitude: 48.8, longitude: 2.3 },
              architects: [],
              styles: [],
              images: [],
              celebrityCounts: {
                total: 0,
                artist: 0,
                writer: 0,
                musician: 0,
                scientist: 0,
              },
              sourceUrls: {},
              dataType: 'cemetery',
              sourceFile: 'cemetery1.json',
            };
            
            const tags = tagsBuilder.buildCemeteryTags(record);
            
            // No themes should be added
            return tags.theme === undefined || tags.theme.length === 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Undefined counts should not add themes
     */
    it('should not add themes when counts are undefined', () => {
      const record: MergedRecord = {
        qid: 'Q123',
        name: 'Test Cemetery',
        coordinates: { latitude: 48.8, longitude: 2.3 },
        architects: [],
        styles: [],
        images: [],
        celebrityCounts: {},
        sourceUrls: {},
        dataType: 'cemetery',
        sourceFile: 'cemetery1.json',
      };
      
      const tags = tagsBuilder.buildCemeteryTags(record);
      
      // No themes should be added
      expect(tags.theme === undefined || tags.theme.length === 0).toBe(true);
    });
  });
});
