/**
 * Property-Based Tests for Wikidata Global QID Registry
 * 
 * Feature: wikidata-import
 * 
 * Property 3: Global Deduplication Invariant
 * *For any* set of input records, after processing through GlobalQIDRegistry,
 * the number of unique QIDs in output should equal the number of distinct QIDs
 * in input, and no QID should appear more than once.
 * 
 * Property 4: Record Merging Completeness
 * *For any* set of records with the same QID but different architects/styles,
 * merging should produce a record containing all unique architects and all
 * unique styles from the input records.
 * 
 * **Validates: Requirements 2.1, 2.2, 2.3**
 */

import * as fc from 'fast-check';
import {
  GlobalQIDRegistry,
  ParsedArchitecture,
  ParsedCemetery,
  Coordinates,
  CelebrityCounts,
} from '../../src/services/wikidataImportUtils';

// ============================================
// Test Data Generators
// ============================================

/**
 * Generator for valid QID numbers
 */
const validQIDArbitrary = fc.integer({ min: 1, max: 999999999 }).map(n => `Q${n}`);

/**
 * Generator for valid coordinates
 */
const validCoordinatesArbitrary: fc.Arbitrary<Coordinates> = fc.record({
  latitude: fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true }),
  longitude: fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true }),
});

/**
 * Generator for architect names
 */
const architectNameArbitrary: fc.Arbitrary<string> = fc.constantFrom(
  'Oscar Niemeyer',
  'Frank Lloyd Wright',
  'Zaha Hadid',
  'Le Corbusier',
  'Tadao Ando',
  'Renzo Piano',
  'Norman Foster',
  'I. M. Pei',
  'Frank Gehry',
  'Rem Koolhaas',
  'Jean Nouvel',
  'Santiago Calatrava'
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
  'Postmodern',
  'Neoclassical',
  'Baroque',
  'Renaissance',
  'Minimalist',
  'High-tech',
  'Deconstructivist'
);

/**
 * Generator for image URLs
 */
const imageUrlArbitrary = fc.webUrl().map(url => `${url}/image.jpg`);

/**
 * Generator for place names
 */
const placeNameArbitrary: fc.Arbitrary<string> = fc.constantFrom(
  'Eiffel Tower',
  'Sagrada Familia',
  'Sydney Opera House',
  'Guggenheim Museum',
  'Fallingwater',
  'Notre-Dame Cathedral',
  'Burj Khalifa',
  'Empire State Building',
  'Colosseum',
  'Taj Mahal',
  'Big Ben',
  'Brandenburg Gate'
);

/**
 * Generator for country names
 */
const countryNameArbitrary = fc.constantFrom(
  'France',
  'Germany',
  'United States',
  'Japan',
  'United Kingdom',
  'Italy',
  'Spain',
  'Brazil',
  'Australia',
  'Canada'
);

/**
 * Generator for city names
 */
const cityNameArbitrary = fc.constantFrom(
  'Paris',
  'Berlin',
  'New York',
  'Tokyo',
  'London',
  'Rome',
  'Madrid',
  'São Paulo',
  'Sydney',
  'Toronto'
);

/**
 * Generator for source file names
 */
const sourceFileArbitrary = fc.constantFrom(
  'architecture1.json',
  'architecture2.json',
  'Brutalism.json',
  'ArtDeco.json',
  'Modern.json',
  'Gothic.json',
  'cemetery1.json',
  'cemetery2.json'
);

/**
 * Generator for ParsedArchitecture records
 */
const parsedArchitectureArbitrary: fc.Arbitrary<ParsedArchitecture> = fc.record({
  qid: validQIDArbitrary,
  name: placeNameArbitrary,
  coordinates: validCoordinatesArbitrary,
  architects: fc.array(architectNameArbitrary, { minLength: 0, maxLength: 3 }),
  styles: fc.array(styleNameArbitrary, { minLength: 0, maxLength: 3 }),
  images: fc.array(imageUrlArbitrary, { minLength: 0, maxLength: 3 }),
  country: fc.option(countryNameArbitrary, { nil: undefined }),
  city: fc.option(cityNameArbitrary, { nil: undefined }),
  sitelinks: fc.option(fc.integer({ min: 0, max: 500 }), { nil: undefined }),
  sourceUrls: fc.record({
    work: fc.constant('http://www.wikidata.org/entity/Q123'),
    architects: fc.array(fc.constant('http://www.wikidata.org/entity/Q456'), { minLength: 0, maxLength: 2 }),
    styles: fc.array(fc.constant('http://www.wikidata.org/entity/Q789'), { minLength: 0, maxLength: 2 }),
  }),
});

/**
 * Generator for celebrity counts
 */
const celebrityCountsArbitrary: fc.Arbitrary<CelebrityCounts> = fc.record({
  total: fc.option(fc.integer({ min: 0, max: 1000 }), { nil: undefined }),
  artist: fc.option(fc.integer({ min: 0, max: 500 }), { nil: undefined }),
  writer: fc.option(fc.integer({ min: 0, max: 500 }), { nil: undefined }),
  musician: fc.option(fc.integer({ min: 0, max: 500 }), { nil: undefined }),
  scientist: fc.option(fc.integer({ min: 0, max: 500 }), { nil: undefined }),
});

/**
 * Generator for ParsedCemetery records
 */
const parsedCemeteryArbitrary: fc.Arbitrary<ParsedCemetery> = fc.record({
  qid: validQIDArbitrary,
  name: placeNameArbitrary,
  coordinates: validCoordinatesArbitrary,
  images: fc.array(imageUrlArbitrary, { minLength: 0, maxLength: 3 }),
  country: fc.option(countryNameArbitrary, { nil: undefined }),
  city: fc.option(cityNameArbitrary, { nil: undefined }),
  sitelinks: fc.option(fc.integer({ min: 0, max: 500 }), { nil: undefined }),
  celebrityCounts: celebrityCountsArbitrary,
  sourceUrls: fc.record({
    cemetery: fc.constant('http://www.wikidata.org/entity/Q123'),
  }),
});

// ============================================
// Property 3: Global Deduplication Invariant
// ============================================

describe('Wikidata Global QID Registry - Property Tests', () => {
  /**
   * Feature: wikidata-import, Property 3: Global Deduplication Invariant
   * 
   * *For any* set of input records, after processing through GlobalQIDRegistry,
   * the number of unique QIDs in output should equal the number of distinct QIDs
   * in input, and no QID should appear more than once.
   * 
   * **Validates: Requirements 2.1, 2.2**
   */
  describe('Property 3: Global Deduplication Invariant', () => {
    
    /**
     * Core property: output QID count equals distinct input QID count
     */
    it('should have output QID count equal to distinct input QID count', () => {
      fc.assert(
        fc.property(
          fc.array(parsedArchitectureArbitrary, { minLength: 1, maxLength: 20 }),
          sourceFileArbitrary,
          (records: ParsedArchitecture[], sourceFile: string) => {
            const registry = new GlobalQIDRegistry();
            
            // Register all records
            for (const record of records) {
              registry.register(record, sourceFile);
            }
            
            // Count distinct QIDs in input
            const distinctInputQIDs = new Set(records.map(r => r.qid));
            
            // Output count should equal distinct input count
            const outputRecords = registry.getAll();
            return outputRecords.length === distinctInputQIDs.size;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * No QID should appear more than once in output
     */
    it('should not have any duplicate QIDs in output', () => {
      fc.assert(
        fc.property(
          fc.array(parsedArchitectureArbitrary, { minLength: 1, maxLength: 20 }),
          sourceFileArbitrary,
          (records: ParsedArchitecture[], sourceFile: string) => {
            const registry = new GlobalQIDRegistry();
            
            // Register all records
            for (const record of records) {
              registry.register(record, sourceFile);
            }
            
            // Check for duplicates in output
            const outputRecords = registry.getAll();
            const outputQIDs = outputRecords.map(r => r.qid);
            const uniqueOutputQIDs = new Set(outputQIDs);
            
            return outputQIDs.length === uniqueOutputQIDs.size;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Statistics should be accurate
     */
    it('should report accurate deduplication statistics', () => {
      fc.assert(
        fc.property(
          fc.array(parsedArchitectureArbitrary, { minLength: 1, maxLength: 20 }),
          sourceFileArbitrary,
          (records: ParsedArchitecture[], sourceFile: string) => {
            const registry = new GlobalQIDRegistry();
            
            // Register all records
            for (const record of records) {
              registry.register(record, sourceFile);
            }
            
            const stats = registry.getStats();
            const distinctInputQIDs = new Set(records.map(r => r.qid));
            
            // Total should equal input count
            // Unique should equal distinct QID count
            // Duplicates should equal total - unique
            return (
              stats.total === records.length &&
              stats.unique === distinctInputQIDs.size &&
              stats.duplicates === records.length - distinctInputQIDs.size
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Works with mixed architecture and cemetery records
     */
    it('should handle mixed architecture and cemetery records', () => {
      fc.assert(
        fc.property(
          fc.array(parsedArchitectureArbitrary, { minLength: 0, maxLength: 10 }),
          fc.array(parsedCemeteryArbitrary, { minLength: 0, maxLength: 10 }),
          sourceFileArbitrary,
          (archRecords: ParsedArchitecture[], cemRecords: ParsedCemetery[], sourceFile: string) => {
            const registry = new GlobalQIDRegistry();
            
            // Register all records
            for (const record of archRecords) {
              registry.register(record, sourceFile);
            }
            for (const record of cemRecords) {
              registry.register(record, sourceFile);
            }
            
            // Count distinct QIDs across both types
            const allQIDs = [
              ...archRecords.map(r => r.qid),
              ...cemRecords.map(r => r.qid),
            ];
            const distinctQIDs = new Set(allQIDs);
            
            // Output count should equal distinct count
            return registry.getAll().length === distinctQIDs.size;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Register returns correct boolean for new vs duplicate
     */
    it('should return true for new QIDs and false for duplicates', () => {
      fc.assert(
        fc.property(
          parsedArchitectureArbitrary,
          sourceFileArbitrary,
          (record: ParsedArchitecture, sourceFile: string) => {
            const registry = new GlobalQIDRegistry();
            
            // First registration should return true
            const firstResult = registry.register(record, sourceFile);
            
            // Second registration of same QID should return false
            const secondResult = registry.register(record, sourceFile);
            
            return firstResult === true && secondResult === false;
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  // ============================================
  // Property 4: Record Merging Completeness
  // ============================================

  /**
   * Feature: wikidata-import, Property 4: Record Merging Completeness
   * 
   * *For any* set of records with the same QID but different architects/styles,
   * merging should produce a record containing all unique architects and all
   * unique styles from the input records.
   * 
   * **Validates: Requirements 2.3**
   */
  describe('Property 4: Record Merging Completeness', () => {
    
    /**
     * Core property: merged record contains all unique architects
     */
    it('should contain all unique architects from merged records', () => {
      fc.assert(
        fc.property(
          validQIDArbitrary,
          fc.array(fc.array(architectNameArbitrary, { minLength: 1, maxLength: 3 }), { minLength: 2, maxLength: 5 }),
          sourceFileArbitrary,
          (qid: string, architectLists: string[][], sourceFile: string) => {
            const registry = new GlobalQIDRegistry();
            
            // Create records with same QID but different architects
            for (const architects of architectLists) {
              const record: ParsedArchitecture = {
                qid,
                name: 'Test Building',
                coordinates: { latitude: 48.8, longitude: 2.3 },
                architects,
                styles: [],
                images: [],
                sourceUrls: {
                  work: `http://www.wikidata.org/entity/${qid}`,
                  architects: [],
                  styles: [],
                },
              };
              registry.register(record, sourceFile);
            }
            
            // Get merged record
            const merged = registry.get(qid);
            if (!merged) return false;
            
            // Collect all unique architects from input
            const allArchitects = new Set(architectLists.flat());
            
            // Merged record should contain all unique architects
            for (const architect of allArchitects) {
              if (!merged.architects.includes(architect)) {
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
     * Core property: merged record contains all unique styles
     */
    it('should contain all unique styles from merged records', () => {
      fc.assert(
        fc.property(
          validQIDArbitrary,
          fc.array(fc.array(styleNameArbitrary, { minLength: 1, maxLength: 3 }), { minLength: 2, maxLength: 5 }),
          sourceFileArbitrary,
          (qid: string, styleLists: string[][], sourceFile: string) => {
            const registry = new GlobalQIDRegistry();
            
            // Create records with same QID but different styles
            for (const styles of styleLists) {
              const record: ParsedArchitecture = {
                qid,
                name: 'Test Building',
                coordinates: { latitude: 48.8, longitude: 2.3 },
                architects: [],
                styles,
                images: [],
                sourceUrls: {
                  work: `http://www.wikidata.org/entity/${qid}`,
                  architects: [],
                  styles: [],
                },
              };
              registry.register(record, sourceFile);
            }
            
            // Get merged record
            const merged = registry.get(qid);
            if (!merged) return false;
            
            // Collect all unique styles from input
            const allStyles = new Set(styleLists.flat());
            
            // Merged record should contain all unique styles
            for (const style of allStyles) {
              if (!merged.styles.includes(style)) {
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
     * Merged record should contain all unique images
     */
    it('should contain all unique images from merged records', () => {
      fc.assert(
        fc.property(
          validQIDArbitrary,
          fc.array(fc.array(imageUrlArbitrary, { minLength: 1, maxLength: 3 }), { minLength: 2, maxLength: 5 }),
          sourceFileArbitrary,
          (qid: string, imageLists: string[][], sourceFile: string) => {
            const registry = new GlobalQIDRegistry();
            
            // Create records with same QID but different images
            for (const images of imageLists) {
              const record: ParsedArchitecture = {
                qid,
                name: 'Test Building',
                coordinates: { latitude: 48.8, longitude: 2.3 },
                architects: [],
                styles: [],
                images,
                sourceUrls: {
                  work: `http://www.wikidata.org/entity/${qid}`,
                  architects: [],
                  styles: [],
                },
              };
              registry.register(record, sourceFile);
            }
            
            // Get merged record
            const merged = registry.get(qid);
            if (!merged) return false;
            
            // Collect all unique images from input
            const allImages = new Set(imageLists.flat());
            
            // Merged record should contain all unique images
            for (const image of allImages) {
              if (!merged.images.includes(image)) {
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
     * Merged record should not have duplicate architects
     */
    it('should not have duplicate architects in merged record', () => {
      fc.assert(
        fc.property(
          validQIDArbitrary,
          fc.array(fc.array(architectNameArbitrary, { minLength: 1, maxLength: 3 }), { minLength: 2, maxLength: 5 }),
          sourceFileArbitrary,
          (qid: string, architectLists: string[][], sourceFile: string) => {
            const registry = new GlobalQIDRegistry();
            
            // Create records with same QID and potentially overlapping architects
            for (const architects of architectLists) {
              const record: ParsedArchitecture = {
                qid,
                name: 'Test Building',
                coordinates: { latitude: 48.8, longitude: 2.3 },
                architects,
                styles: [],
                images: [],
                sourceUrls: {
                  work: `http://www.wikidata.org/entity/${qid}`,
                  architects: [],
                  styles: [],
                },
              };
              registry.register(record, sourceFile);
            }
            
            // Get merged record
            const merged = registry.get(qid);
            if (!merged) return false;
            
            // Check for duplicates
            const uniqueArchitects = new Set(merged.architects);
            return merged.architects.length === uniqueArchitects.size;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Merged record should not have duplicate styles
     */
    it('should not have duplicate styles in merged record', () => {
      fc.assert(
        fc.property(
          validQIDArbitrary,
          fc.array(fc.array(styleNameArbitrary, { minLength: 1, maxLength: 3 }), { minLength: 2, maxLength: 5 }),
          sourceFileArbitrary,
          (qid: string, styleLists: string[][], sourceFile: string) => {
            const registry = new GlobalQIDRegistry();
            
            // Create records with same QID and potentially overlapping styles
            for (const styles of styleLists) {
              const record: ParsedArchitecture = {
                qid,
                name: 'Test Building',
                coordinates: { latitude: 48.8, longitude: 2.3 },
                architects: [],
                styles,
                images: [],
                sourceUrls: {
                  work: `http://www.wikidata.org/entity/${qid}`,
                  architects: [],
                  styles: [],
                },
              };
              registry.register(record, sourceFile);
            }
            
            // Get merged record
            const merged = registry.get(qid);
            if (!merged) return false;
            
            // Check for duplicates
            const uniqueStyles = new Set(merged.styles);
            return merged.styles.length === uniqueStyles.size;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Cemetery merging should take maximum celebrity counts
     */
    it('should take maximum celebrity counts when merging cemetery records', () => {
      fc.assert(
        fc.property(
          validQIDArbitrary,
          fc.array(celebrityCountsArbitrary, { minLength: 2, maxLength: 5 }),
          sourceFileArbitrary,
          (qid: string, countsList: CelebrityCounts[], sourceFile: string) => {
            const registry = new GlobalQIDRegistry();
            
            // Create cemetery records with same QID but different counts
            for (const counts of countsList) {
              const record: ParsedCemetery = {
                qid,
                name: 'Test Cemetery',
                coordinates: { latitude: 48.8, longitude: 2.3 },
                images: [],
                celebrityCounts: counts,
                sourceUrls: {
                  cemetery: `http://www.wikidata.org/entity/${qid}`,
                },
              };
              registry.register(record, sourceFile);
            }
            
            // Get merged record
            const merged = registry.get(qid);
            if (!merged || !merged.celebrityCounts) return false;
            
            // Calculate expected max values
            const expectedTotal = Math.max(...countsList.map(c => c.total ?? 0));
            const expectedArtist = Math.max(...countsList.map(c => c.artist ?? 0));
            const expectedWriter = Math.max(...countsList.map(c => c.writer ?? 0));
            const expectedMusician = Math.max(...countsList.map(c => c.musician ?? 0));
            const expectedScientist = Math.max(...countsList.map(c => c.scientist ?? 0));
            
            // Verify merged counts are the maximum
            const counts = merged.celebrityCounts;
            return (
              (counts.total ?? 0) === expectedTotal &&
              (counts.artist ?? 0) === expectedArtist &&
              (counts.writer ?? 0) === expectedWriter &&
              (counts.musician ?? 0) === expectedMusician &&
              (counts.scientist ?? 0) === expectedScientist
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Merging should preserve first record's name
     */
    it('should preserve the first record name when merging', () => {
      fc.assert(
        fc.property(
          validQIDArbitrary,
          placeNameArbitrary,
          placeNameArbitrary,
          sourceFileArbitrary,
          (qid: string, firstName: string, secondName: string, sourceFile: string) => {
            const registry = new GlobalQIDRegistry();
            
            // Create two records with same QID but different names
            const record1: ParsedArchitecture = {
              qid,
              name: firstName,
              coordinates: { latitude: 48.8, longitude: 2.3 },
              architects: [],
              styles: [],
              images: [],
              sourceUrls: {
                work: `http://www.wikidata.org/entity/${qid}`,
                architects: [],
                styles: [],
              },
            };
            
            const record2: ParsedArchitecture = {
              qid,
              name: secondName,
              coordinates: { latitude: 48.8, longitude: 2.3 },
              architects: [],
              styles: [],
              images: [],
              sourceUrls: {
                work: `http://www.wikidata.org/entity/${qid}`,
                architects: [],
                styles: [],
              },
            };
            
            registry.register(record1, sourceFile);
            registry.register(record2, sourceFile);
            
            // Get merged record
            const merged = registry.get(qid);
            if (!merged) return false;
            
            // Name should be from first record
            return merged.name === firstName;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
