/**
 * Property-Based Tests for Wikidata Place Mapper
 * 
 * Feature: wikidata-import
 * 
 * Property 10: Source Metadata Completeness
 * *For any* imported place, source should be "wikidata", source_detail should be
 * the QID, and is_verified should be true.
 * 
 * Property 11: Custom Fields Preservation
 * *For any* imported place, custom_fields should contain all unmapped data
 * including sitelinks count and all original Wikidata URLs.
 * 
 * Property 12: Field Mapping Correctness
 * *For any* architecture record, name should equal workLabel. *For any* cemetery
 * record, name should equal cemeteryLabel. City and country should be mapped
 * from cityLabel and countryLabel respectively.
 * 
 * **Validates: Requirements 6.1-6.5, 7.1-7.3**
 */

import * as fc from 'fast-check';
import {
  mapToPlaceData,
  MergedRecord,
  WikidataImages,
  PlaceTags,
  Coordinates,
  CelebrityCounts,
  WikidataDataType,
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
  'Rem Koolhaas'
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
  'Minimalist'
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
  'Taj Mahal'
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
 * Generator for source URLs
 */
const sourceUrlsArbitrary = fc.record({
  work: fc.array(fc.constant('http://www.wikidata.org/entity/Q123'), { minLength: 1, maxLength: 2 }),
  architects: fc.array(fc.constant('http://www.wikidata.org/entity/Q456'), { minLength: 0, maxLength: 2 }),
  styles: fc.array(fc.constant('http://www.wikidata.org/entity/Q789'), { minLength: 0, maxLength: 2 }),
});

/**
 * Generator for MergedRecord (architecture)
 */
const mergedArchitectureRecordArbitrary: fc.Arbitrary<MergedRecord> = fc.record({
  qid: validQIDArbitrary,
  name: placeNameArbitrary,
  coordinates: validCoordinatesArbitrary,
  architects: fc.array(architectNameArbitrary, { minLength: 0, maxLength: 3 }),
  styles: fc.array(styleNameArbitrary, { minLength: 0, maxLength: 3 }),
  images: fc.array(imageUrlArbitrary, { minLength: 0, maxLength: 3 }),
  country: fc.option(countryNameArbitrary, { nil: undefined }),
  city: fc.option(cityNameArbitrary, { nil: undefined }),
  sitelinks: fc.option(fc.integer({ min: 0, max: 500 }), { nil: undefined }),
  celebrityCounts: fc.constant(undefined),
  sourceUrls: sourceUrlsArbitrary,
  dataType: fc.constant('architecture' as WikidataDataType),
  sourceFile: sourceFileArbitrary,
});

/**
 * Generator for MergedRecord (cemetery)
 */
const mergedCemeteryRecordArbitrary: fc.Arbitrary<MergedRecord> = fc.record({
  qid: validQIDArbitrary,
  name: placeNameArbitrary,
  coordinates: validCoordinatesArbitrary,
  architects: fc.constant([]),
  styles: fc.constant([]),
  images: fc.array(imageUrlArbitrary, { minLength: 0, maxLength: 3 }),
  country: fc.option(countryNameArbitrary, { nil: undefined }),
  city: fc.option(cityNameArbitrary, { nil: undefined }),
  sitelinks: fc.option(fc.integer({ min: 0, max: 500 }), { nil: undefined }),
  celebrityCounts: fc.option(celebrityCountsArbitrary, { nil: undefined }),
  sourceUrls: fc.record({
    cemetery: fc.array(fc.constant('http://www.wikidata.org/entity/Q123'), { minLength: 1, maxLength: 2 }),
  }),
  dataType: fc.constant('cemetery' as WikidataDataType),
  sourceFile: sourceFileArbitrary,
});

/**
 * Generator for any MergedRecord
 */
const mergedRecordArbitrary: fc.Arbitrary<MergedRecord> = fc.oneof(
  mergedArchitectureRecordArbitrary,
  mergedCemeteryRecordArbitrary
);

/**
 * Generator for WikidataImages
 */
const wikidataImagesArbitrary: fc.Arbitrary<WikidataImages> = fc.record({
  coverImage: fc.option(imageUrlArbitrary, { nil: null }),
  additionalImages: fc.array(imageUrlArbitrary, { minLength: 0, maxLength: 5 }),
});

/**
 * Generator for PlaceTags
 */
const placeTagsArbitrary: fc.Arbitrary<PlaceTags> = fc.record({
  style: fc.option(fc.array(styleNameArbitrary, { minLength: 1, maxLength: 3 }), { nil: undefined }),
  architect: fc.option(fc.array(architectNameArbitrary, { minLength: 1, maxLength: 3 }), { nil: undefined }),
  theme: fc.option(fc.array(fc.constantFrom('artist', 'writer', 'musician', 'scientist', 'celebrity'), { minLength: 1, maxLength: 3 }), { nil: undefined }),
});

// ============================================
// Property Tests
// ============================================

describe('Wikidata Place Mapper - Property Tests', () => {
  
  // ============================================
  // Property 10: Source Metadata Completeness
  // ============================================
  
  /**
   * Feature: wikidata-import, Property 10: Source Metadata Completeness
   * 
   * *For any* imported place, source should be "wikidata", source_detail should be
   * the QID, and is_verified should be true.
   * 
   * **Validates: Requirements 6.1, 6.2, 6.5**
   */
  describe('Property 10: Source Metadata Completeness', () => {
    
    /**
     * Source should always be "wikidata"
     */
    it('should set source to "wikidata" for all records', () => {
      fc.assert(
        fc.property(
          mergedRecordArbitrary,
          wikidataImagesArbitrary,
          placeTagsArbitrary,
          (record: MergedRecord, images: WikidataImages, tags: PlaceTags) => {
            const result = mapToPlaceData(record, images, tags);
            return result.source === 'wikidata';
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * sourceDetail should be the QID from the record
     */
    it('should set sourceDetail to the QID from the record', () => {
      fc.assert(
        fc.property(
          mergedRecordArbitrary,
          wikidataImagesArbitrary,
          placeTagsArbitrary,
          (record: MergedRecord, images: WikidataImages, tags: PlaceTags) => {
            const result = mapToPlaceData(record, images, tags);
            return result.sourceDetail === record.qid;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * isVerified should always be true
     */
    it('should set isVerified to true for all records', () => {
      fc.assert(
        fc.property(
          mergedRecordArbitrary,
          wikidataImagesArbitrary,
          placeTagsArbitrary,
          (record: MergedRecord, images: WikidataImages, tags: PlaceTags) => {
            const result = mapToPlaceData(record, images, tags);
            return result.isVerified === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * All three source metadata fields should be set correctly together
     */
    it('should set all source metadata fields correctly', () => {
      fc.assert(
        fc.property(
          mergedRecordArbitrary,
          wikidataImagesArbitrary,
          placeTagsArbitrary,
          (record: MergedRecord, images: WikidataImages, tags: PlaceTags) => {
            const result = mapToPlaceData(record, images, tags);
            return (
              result.source === 'wikidata' &&
              result.sourceDetail === record.qid &&
              result.isVerified === true
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ============================================
  // Property 11: Custom Fields Preservation
  // ============================================

  /**
   * Feature: wikidata-import, Property 11: Custom Fields Preservation
   * 
   * *For any* imported place, custom_fields should contain all unmapped data
   * including sitelinks count and all original Wikidata URLs.
   * 
   * **Validates: Requirements 6.3, 6.4**
   */
  describe('Property 11: Custom Fields Preservation', () => {
    
    /**
     * customFields should contain sitelinks when present in record
     */
    it('should preserve sitelinks in customFields when present', () => {
      fc.assert(
        fc.property(
          mergedRecordArbitrary,
          wikidataImagesArbitrary,
          placeTagsArbitrary,
          (record: MergedRecord, images: WikidataImages, tags: PlaceTags) => {
            const result = mapToPlaceData(record, images, tags);
            
            if (record.sitelinks !== undefined) {
              return result.customFields.sitelinks === record.sitelinks;
            }
            // If sitelinks is undefined, it should not be in customFields
            return !('sitelinks' in result.customFields);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * customFields should contain wikidataUrls when sourceUrls is present
     */
    it('should preserve wikidataUrls in customFields', () => {
      fc.assert(
        fc.property(
          mergedRecordArbitrary,
          wikidataImagesArbitrary,
          placeTagsArbitrary,
          (record: MergedRecord, images: WikidataImages, tags: PlaceTags) => {
            const result = mapToPlaceData(record, images, tags);
            
            if (record.sourceUrls && Object.keys(record.sourceUrls).length > 0) {
              return (
                result.customFields.wikidataUrls !== undefined &&
                JSON.stringify(result.customFields.wikidataUrls) === JSON.stringify(record.sourceUrls)
              );
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * customFields should contain celebrityCounts for cemetery records
     */
    it('should preserve celebrityCounts in customFields for cemetery records', () => {
      fc.assert(
        fc.property(
          mergedCemeteryRecordArbitrary,
          wikidataImagesArbitrary,
          placeTagsArbitrary,
          (record: MergedRecord, images: WikidataImages, tags: PlaceTags) => {
            const result = mapToPlaceData(record, images, tags);
            
            if (record.celebrityCounts) {
              return (
                result.customFields.celebrityCounts !== undefined &&
                JSON.stringify(result.customFields.celebrityCounts) === JSON.stringify(record.celebrityCounts)
              );
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * customFields should contain sourceFile for traceability
     */
    it('should preserve sourceFile in customFields', () => {
      fc.assert(
        fc.property(
          mergedRecordArbitrary,
          wikidataImagesArbitrary,
          placeTagsArbitrary,
          (record: MergedRecord, images: WikidataImages, tags: PlaceTags) => {
            const result = mapToPlaceData(record, images, tags);
            return result.customFields.sourceFile === record.sourceFile;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * customFields should contain dataType
     */
    it('should preserve dataType in customFields', () => {
      fc.assert(
        fc.property(
          mergedRecordArbitrary,
          wikidataImagesArbitrary,
          placeTagsArbitrary,
          (record: MergedRecord, images: WikidataImages, tags: PlaceTags) => {
            const result = mapToPlaceData(record, images, tags);
            return result.customFields.dataType === record.dataType;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ============================================
  // Property 12: Field Mapping Correctness
  // ============================================

  /**
   * Feature: wikidata-import, Property 12: Field Mapping Correctness
   * 
   * *For any* architecture record, name should equal workLabel. *For any* cemetery
   * record, name should equal cemeteryLabel. City and country should be mapped
   * from cityLabel and countryLabel respectively.
   * 
   * **Validates: Requirements 7.1, 7.2, 7.3**
   */
  describe('Property 12: Field Mapping Correctness', () => {
    
    /**
     * name should be mapped from record.name (workLabel or cemeteryLabel)
     */
    it('should map name correctly from record', () => {
      fc.assert(
        fc.property(
          mergedRecordArbitrary,
          wikidataImagesArbitrary,
          placeTagsArbitrary,
          (record: MergedRecord, images: WikidataImages, tags: PlaceTags) => {
            const result = mapToPlaceData(record, images, tags);
            return result.name === record.name;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * city should be mapped from record.city (cityLabel)
     */
    it('should map city correctly from record', () => {
      fc.assert(
        fc.property(
          mergedRecordArbitrary,
          wikidataImagesArbitrary,
          placeTagsArbitrary,
          (record: MergedRecord, images: WikidataImages, tags: PlaceTags) => {
            const result = mapToPlaceData(record, images, tags);
            return result.city === record.city;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * country should be mapped from record.country (countryLabel)
     */
    it('should map country correctly from record', () => {
      fc.assert(
        fc.property(
          mergedRecordArbitrary,
          wikidataImagesArbitrary,
          placeTagsArbitrary,
          (record: MergedRecord, images: WikidataImages, tags: PlaceTags) => {
            const result = mapToPlaceData(record, images, tags);
            return result.country === record.country;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * latitude should be mapped from record.coordinates.latitude
     */
    it('should map latitude correctly from coordinates', () => {
      fc.assert(
        fc.property(
          mergedRecordArbitrary,
          wikidataImagesArbitrary,
          placeTagsArbitrary,
          (record: MergedRecord, images: WikidataImages, tags: PlaceTags) => {
            const result = mapToPlaceData(record, images, tags);
            return result.latitude === record.coordinates.latitude;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * longitude should be mapped from record.coordinates.longitude
     */
    it('should map longitude correctly from coordinates', () => {
      fc.assert(
        fc.property(
          mergedRecordArbitrary,
          wikidataImagesArbitrary,
          placeTagsArbitrary,
          (record: MergedRecord, images: WikidataImages, tags: PlaceTags) => {
            const result = mapToPlaceData(record, images, tags);
            return result.longitude === record.coordinates.longitude;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * categorySlug should be correct based on dataType
     */
    it('should set correct categorySlug based on dataType', () => {
      fc.assert(
        fc.property(
          mergedRecordArbitrary,
          wikidataImagesArbitrary,
          placeTagsArbitrary,
          (record: MergedRecord, images: WikidataImages, tags: PlaceTags) => {
            const result = mapToPlaceData(record, images, tags);
            
            if (record.dataType === 'architecture') {
              return result.categorySlug === 'architecture';
            } else {
              return result.categorySlug === 'cemetery';
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * categoryEn should be correct based on dataType
     */
    it('should set correct categoryEn based on dataType', () => {
      fc.assert(
        fc.property(
          mergedRecordArbitrary,
          wikidataImagesArbitrary,
          placeTagsArbitrary,
          (record: MergedRecord, images: WikidataImages, tags: PlaceTags) => {
            const result = mapToPlaceData(record, images, tags);
            
            if (record.dataType === 'architecture') {
              return result.categoryEn === 'Architecture';
            } else {
              return result.categoryEn === 'Cemetery';
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * tags should be passed through correctly
     */
    it('should pass through tags correctly', () => {
      fc.assert(
        fc.property(
          mergedRecordArbitrary,
          wikidataImagesArbitrary,
          placeTagsArbitrary,
          (record: MergedRecord, images: WikidataImages, tags: PlaceTags) => {
            const result = mapToPlaceData(record, images, tags);
            return JSON.stringify(result.tags) === JSON.stringify(tags);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * coverImage should be mapped from images.coverImage
     */
    it('should map coverImage correctly from images', () => {
      fc.assert(
        fc.property(
          mergedRecordArbitrary,
          wikidataImagesArbitrary,
          placeTagsArbitrary,
          (record: MergedRecord, images: WikidataImages, tags: PlaceTags) => {
            const result = mapToPlaceData(record, images, tags);
            
            if (images.coverImage) {
              return result.coverImage === images.coverImage;
            } else {
              return result.coverImage === undefined;
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * images array should contain additionalImages
     */
    it('should include additionalImages in images array', () => {
      fc.assert(
        fc.property(
          mergedRecordArbitrary,
          wikidataImagesArbitrary,
          placeTagsArbitrary,
          (record: MergedRecord, images: WikidataImages, tags: PlaceTags) => {
            const result = mapToPlaceData(record, images, tags);
            
            // All additional images should be in the result images array
            for (const img of images.additionalImages) {
              if (!result.images.includes(img)) {
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
});
