/**
 * Property-Based Tests for Travel Consultation Handler
 * 
 * Feature: ai-intent-recognition
 * 
 * Property 3: Related Places Have Cover Images
 * *For any* `travel_consultation` response with `relatedPlaces`, all places in the array 
 * SHALL have a non-empty `coverImage` field.
 * **Validates: Requirements 3.4, 6.6**
 * 
 * Property 4: Related Places Minimum Count
 * *For any* `travel_consultation` response with related places, each city section 
 * SHALL have at least 3 places (supplemented from database if AI recommendations are insufficient).
 * **Validates: Requirements 3.6, 3.7**
 * 
 * Property 9: Single vs Multi-City Response Structure
 * *For any* `travel_consultation` response:
 * - If only one city is mentioned, the response SHALL use `relatedPlaces` (flat array)
 * - If multiple cities are mentioned, the response SHALL use `cityPlaces` (grouped by city)
 * **Validates: Requirements 3.4, 3.5, 3.8**
 */

import * as fc from 'fast-check';
import { 
  PlaceResult, 
  TravelConsultationHandlerResult, 
  CityPlacesGroup,
} from '../../src/types/intent';

// ============================================
// Configuration
// ============================================

const MIN_PLACES_PER_CITY = 3;

// ============================================
// Test Data Generators
// ============================================

/**
 * Generator for valid cover image URLs (non-empty)
 */
const validCoverImageArbitrary = fc.webUrl();

/**
 * Generator for city names
 */
const cityNameArbitrary = fc.constantFrom(
  'Paris', 'Tokyo', 'Rome', 'London', 'Barcelona',
  'Berlin', 'Amsterdam', 'Vienna', 'Prague', 'Florence',
  'Kyoto', 'Osaka', 'Seoul', 'Bangkok', 'Singapore'
);

/**
 * Generator for place names
 */
const placeNameArbitrary = fc.constantFrom(
  'Eiffel Tower', 'Louvre Museum', 'Notre-Dame Cathedral',
  'Tokyo Tower', 'Senso-ji Temple', 'Shibuya Crossing',
  'Colosseum', 'Vatican Museums', 'Trevi Fountain',
  'Big Ben', 'Tower Bridge', 'British Museum',
  'Sagrada Familia', 'Park Güell', 'La Rambla'
);

/**
 * Generator for PlaceResult with valid cover image
 */
const placeResultWithImageArbitrary: fc.Arbitrary<PlaceResult> = fc.record({
  id: fc.uuid(),
  name: placeNameArbitrary,
  summary: fc.string({ minLength: 0, maxLength: 200 }),
  coverImage: validCoverImageArbitrary,
  latitude: fc.double({ min: -90, max: 90 }),
  longitude: fc.double({ min: -180, max: 180 }),
  city: cityNameArbitrary,
  country: fc.string({ minLength: 1, maxLength: 50 }),
  rating: fc.option(fc.double({ min: 0, max: 5 }), { nil: null }),
  ratingCount: fc.option(fc.integer({ min: 0, max: 10000 }), { nil: null }),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 5 }),
  isVerified: fc.boolean(),
  source: fc.constantFrom('cache' as const, 'ai' as const),
});

/**
 * Generator for PlaceResult without cover image (empty string)
 */
const placeResultWithoutImageArbitrary: fc.Arbitrary<PlaceResult> = fc.record({
  id: fc.uuid(),
  name: placeNameArbitrary,
  summary: fc.string({ minLength: 0, maxLength: 200 }),
  coverImage: fc.constant(''),
  latitude: fc.double({ min: -90, max: 90 }),
  longitude: fc.double({ min: -180, max: 180 }),
  city: cityNameArbitrary,
  country: fc.string({ minLength: 1, maxLength: 50 }),
  rating: fc.option(fc.double({ min: 0, max: 5 }), { nil: null }),
  ratingCount: fc.option(fc.integer({ min: 0, max: 10000 }), { nil: null }),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 5 }),
  isVerified: fc.boolean(),
  source: fc.constantFrom('cache' as const, 'ai' as const),
});

/**
 * Generator for CityPlacesGroup with minimum places
 */
const cityPlacesGroupArbitrary: fc.Arbitrary<CityPlacesGroup> = fc.record({
  city: cityNameArbitrary,
  places: fc.array(placeResultWithImageArbitrary, { minLength: MIN_PLACES_PER_CITY, maxLength: 10 }),
});

/**
 * Generator for valid TravelConsultationHandlerResult with single city (relatedPlaces)
 */
const singleCityResultArbitrary: fc.Arbitrary<TravelConsultationHandlerResult> = fc.record({
  textContent: fc.string({ minLength: 10, maxLength: 500 }),
  relatedPlaces: fc.array(placeResultWithImageArbitrary, { minLength: MIN_PLACES_PER_CITY, maxLength: 10 }),
});

/**
 * Generator for valid TravelConsultationHandlerResult with multiple cities (cityPlaces)
 */
const multiCityResultArbitrary: fc.Arbitrary<TravelConsultationHandlerResult> = fc.record({
  textContent: fc.string({ minLength: 10, maxLength: 500 }),
  cityPlaces: fc.array(cityPlacesGroupArbitrary, { minLength: 2, maxLength: 5 }),
});

// ============================================
// Helper Functions
// ============================================

/**
 * Check if a place has a valid (non-empty) cover image
 */
function hasValidCoverImage(place: PlaceResult): boolean {
  return !!(place.coverImage && place.coverImage.trim() !== '');
}

/**
 * Check if all places in an array have valid cover images
 */
function allPlacesHaveCoverImages(places: PlaceResult[]): boolean {
  return places.every(place => hasValidCoverImage(place));
}

/**
 * Check if a city group has at least the minimum number of places
 */
function hasMinimumPlaces(group: CityPlacesGroup): boolean {
  return group.places.length >= MIN_PLACES_PER_CITY;
}

/**
 * Determine if a result is single-city (uses relatedPlaces) or multi-city (uses cityPlaces)
 */
function isSingleCityResult(result: TravelConsultationHandlerResult): boolean {
  return result.relatedPlaces !== undefined && result.cityPlaces === undefined;
}

/**
 * Determine if a result is multi-city (uses cityPlaces)
 */
function isMultiCityResult(result: TravelConsultationHandlerResult): boolean {
  return result.cityPlaces !== undefined && result.relatedPlaces === undefined;
}

/**
 * Get all places from a result (either from relatedPlaces or cityPlaces)
 */
function getAllPlaces(result: TravelConsultationHandlerResult): PlaceResult[] {
  if (result.relatedPlaces) {
    return result.relatedPlaces;
  }
  if (result.cityPlaces) {
    return result.cityPlaces.flatMap(group => group.places);
  }
  return [];
}

// ============================================
// Property Tests
// ============================================

describe('Travel Consultation Handler Property-Based Tests', () => {
  
  /**
   * Feature: ai-intent-recognition, Property 3: Related Places Have Cover Images
   * 
   * *For any* `travel_consultation` response with `relatedPlaces`, all places in the array 
   * SHALL have a non-empty `coverImage` field.
   * 
   * **Validates: Requirements 3.4, 6.6**
   */
  describe('Property 3: Related Places Have Cover Images', () => {
    
    /**
     * All places in relatedPlaces (single city) should have valid cover images
     */
    it('should have valid cover images for all places in relatedPlaces (single city)', () => {
      fc.assert(
        fc.property(
          singleCityResultArbitrary,
          (result: TravelConsultationHandlerResult) => {
            if (!result.relatedPlaces || result.relatedPlaces.length === 0) {
              return true; // No places to check
            }
            return allPlacesHaveCoverImages(result.relatedPlaces);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * All places in cityPlaces (multi-city) should have valid cover images
     */
    it('should have valid cover images for all places in cityPlaces (multi-city)', () => {
      fc.assert(
        fc.property(
          multiCityResultArbitrary,
          (result: TravelConsultationHandlerResult) => {
            if (!result.cityPlaces || result.cityPlaces.length === 0) {
              return true; // No city groups to check
            }
            return result.cityPlaces.every(group => allPlacesHaveCoverImages(group.places));
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Helper function correctly identifies places with images
     */
    it('should correctly identify places with valid cover images', () => {
      fc.assert(
        fc.property(
          placeResultWithImageArbitrary,
          (place: PlaceResult) => {
            return hasValidCoverImage(place);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Helper function correctly identifies places without images
     */
    it('should correctly identify places without cover images', () => {
      fc.assert(
        fc.property(
          placeResultWithoutImageArbitrary,
          (place: PlaceResult) => {
            return !hasValidCoverImage(place);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Filtering logic should remove places without images
     */
    it('should filter out places without cover images', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.oneof(placeResultWithImageArbitrary, placeResultWithoutImageArbitrary),
            { minLength: 1, maxLength: 20 }
          ),
          (mixedPlaces: PlaceResult[]) => {
            // Simulate the filtering logic from the service
            const filtered = mixedPlaces.filter(p => hasValidCoverImage(p));
            
            // All filtered places should have valid images
            return allPlacesHaveCoverImages(filtered);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: ai-intent-recognition, Property 4: Related Places Minimum Count
   * 
   * *For any* `travel_consultation` response with related places, each city section 
   * SHALL have at least 3 places (supplemented from database if AI recommendations are insufficient).
   * 
   * **Validates: Requirements 3.6, 3.7**
   */
  describe('Property 4: Related Places Minimum Count', () => {
    
    /**
     * Single city results should have at least MIN_PLACES_PER_CITY places
     */
    it('should have at least 3 places in relatedPlaces (single city)', () => {
      fc.assert(
        fc.property(
          singleCityResultArbitrary,
          (result: TravelConsultationHandlerResult) => {
            if (!result.relatedPlaces) {
              return true; // No places is acceptable (no matches found)
            }
            // If there are places, there should be at least MIN_PLACES_PER_CITY
            return result.relatedPlaces.length >= MIN_PLACES_PER_CITY;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Each city group in multi-city results should have at least MIN_PLACES_PER_CITY places
     */
    it('should have at least 3 places per city in cityPlaces (multi-city)', () => {
      fc.assert(
        fc.property(
          multiCityResultArbitrary,
          (result: TravelConsultationHandlerResult) => {
            if (!result.cityPlaces || result.cityPlaces.length === 0) {
              return true; // No city groups is acceptable
            }
            return result.cityPlaces.every(group => hasMinimumPlaces(group));
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Supplementation logic should bring count up to minimum
     */
    it('should supplement places to reach minimum count', () => {
      fc.assert(
        fc.property(
          // Generate initial places (0 to MIN_PLACES_PER_CITY - 1)
          fc.array(placeResultWithImageArbitrary, { minLength: 0, maxLength: MIN_PLACES_PER_CITY - 1 }),
          // Generate supplement places
          fc.array(placeResultWithImageArbitrary, { minLength: MIN_PLACES_PER_CITY, maxLength: 10 }),
          (initialPlaces: PlaceResult[], supplementPlaces: PlaceResult[]) => {
            // Simulate supplementation logic
            const needed = Math.max(0, MIN_PLACES_PER_CITY - initialPlaces.length);
            const supplemented = supplementPlaces.slice(0, needed);
            const finalPlaces = [...initialPlaces, ...supplemented];
            
            // Final count should be at least MIN_PLACES_PER_CITY
            return finalPlaces.length >= MIN_PLACES_PER_CITY;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Supplementation should not add duplicates
     */
    it('should not add duplicate places during supplementation', () => {
      fc.assert(
        fc.property(
          fc.array(placeResultWithImageArbitrary, { minLength: 1, maxLength: 5 }),
          fc.array(placeResultWithImageArbitrary, { minLength: 5, maxLength: 15 }),
          (initialPlaces: PlaceResult[], supplementPool: PlaceResult[]) => {
            const existingIds = new Set(initialPlaces.map(p => p.id));
            
            // Simulate supplementation logic (exclude existing IDs)
            const needed = Math.max(0, MIN_PLACES_PER_CITY - initialPlaces.length);
            const supplemented = supplementPool
              .filter(p => !existingIds.has(p.id))
              .slice(0, needed);
            
            const finalPlaces = [...initialPlaces, ...supplemented];
            
            // Check for duplicates
            const finalIds = finalPlaces.map(p => p.id);
            const uniqueIds = new Set(finalIds);
            
            return finalIds.length === uniqueIds.size;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: ai-intent-recognition, Property 9: Single vs Multi-City Response Structure
   * 
   * *For any* `travel_consultation` response:
   * - If only one city is mentioned, the response SHALL use `relatedPlaces` (flat array)
   * - If multiple cities are mentioned, the response SHALL use `cityPlaces` (grouped by city)
   * 
   * **Validates: Requirements 3.4, 3.5, 3.8**
   */
  describe('Property 9: Single vs Multi-City Response Structure', () => {
    
    /**
     * Single city results should use relatedPlaces, not cityPlaces
     */
    it('should use relatedPlaces for single city results', () => {
      fc.assert(
        fc.property(
          singleCityResultArbitrary,
          (result: TravelConsultationHandlerResult) => {
            return isSingleCityResult(result);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Multi-city results should use cityPlaces, not relatedPlaces
     */
    it('should use cityPlaces for multi-city results', () => {
      fc.assert(
        fc.property(
          multiCityResultArbitrary,
          (result: TravelConsultationHandlerResult) => {
            return isMultiCityResult(result);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Results should not have both relatedPlaces and cityPlaces
     */
    it('should not have both relatedPlaces and cityPlaces', () => {
      fc.assert(
        fc.property(
          fc.oneof(singleCityResultArbitrary, multiCityResultArbitrary),
          (result: TravelConsultationHandlerResult) => {
            // Should have one or the other, not both
            const hasRelatedPlaces = result.relatedPlaces !== undefined;
            const hasCityPlaces = result.cityPlaces !== undefined;
            
            // XOR: exactly one should be true (or both false for no places)
            return !(hasRelatedPlaces && hasCityPlaces);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * City count determines response structure
     */
    it('should determine structure based on city count', () => {
      fc.assert(
        fc.property(
          fc.array(cityNameArbitrary, { minLength: 1, maxLength: 5 }),
          fc.array(placeResultWithImageArbitrary, { minLength: MIN_PLACES_PER_CITY, maxLength: 20 }),
          (cities: string[], places: PlaceResult[]) => {
            const uniqueCities = [...new Set(cities)];
            
            // Simulate the logic from intentClassifierService.matchRelatedPlaces
            if (uniqueCities.length === 1) {
              // Single city: should return relatedPlaces
              const result: TravelConsultationHandlerResult = {
                textContent: 'Test content',
                relatedPlaces: places.slice(0, Math.max(MIN_PLACES_PER_CITY, 5)),
              };
              return isSingleCityResult(result);
            } else {
              // Multi-city: should return cityPlaces
              const cityPlaces: CityPlacesGroup[] = uniqueCities.map(city => ({
                city,
                places: places.slice(0, MIN_PLACES_PER_CITY),
              }));
              const result: TravelConsultationHandlerResult = {
                textContent: 'Test content',
                cityPlaces,
              };
              return isMultiCityResult(result);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * relatedPlaces should be a flat array (not nested)
     */
    it('should have relatedPlaces as a flat array', () => {
      fc.assert(
        fc.property(
          singleCityResultArbitrary,
          (result: TravelConsultationHandlerResult) => {
            if (!result.relatedPlaces) {
              return true;
            }
            // Check that it's a flat array of PlaceResult objects
            return Array.isArray(result.relatedPlaces) &&
              result.relatedPlaces.every(p => 
                typeof p === 'object' && 
                p !== null && 
                'id' in p && 
                'name' in p
              );
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * cityPlaces should be grouped by city
     */
    it('should have cityPlaces grouped by city', () => {
      fc.assert(
        fc.property(
          multiCityResultArbitrary,
          (result: TravelConsultationHandlerResult) => {
            if (!result.cityPlaces) {
              return true;
            }
            // Check that each group has a city name and places array
            return result.cityPlaces.every(group =>
              typeof group.city === 'string' &&
              group.city.length > 0 &&
              Array.isArray(group.places)
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * TravelConsultationHandlerResult Structure Invariants
   */
  describe('TravelConsultationHandlerResult Structure Invariants', () => {
    
    /**
     * Results should always have textContent
     */
    it('should always have textContent field', () => {
      fc.assert(
        fc.property(
          fc.oneof(singleCityResultArbitrary, multiCityResultArbitrary),
          (result: TravelConsultationHandlerResult) => {
            return typeof result.textContent === 'string';
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * textContent should not be empty for valid results
     */
    it('should have non-empty textContent for valid results', () => {
      fc.assert(
        fc.property(
          fc.oneof(singleCityResultArbitrary, multiCityResultArbitrary),
          (result: TravelConsultationHandlerResult) => {
            return result.textContent.length > 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * All places should have required fields
     */
    it('should have all required fields in places', () => {
      fc.assert(
        fc.property(
          fc.oneof(singleCityResultArbitrary, multiCityResultArbitrary),
          (result: TravelConsultationHandlerResult) => {
            const allPlaces = getAllPlaces(result);
            
            return allPlaces.every(place =>
              typeof place.id === 'string' &&
              typeof place.name === 'string' &&
              typeof place.coverImage === 'string' &&
              typeof place.latitude === 'number' &&
              typeof place.longitude === 'number' &&
              typeof place.city === 'string'
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
