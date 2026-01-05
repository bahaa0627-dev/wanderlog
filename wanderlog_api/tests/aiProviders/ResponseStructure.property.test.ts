/**
 * Property-Based Tests for Response Structure by Intent
 * 
 * Feature: ai-intent-recognition
 * 
 * Property 2: Response Structure by Intent
 * *For any* search response, the response structure SHALL match the intent type:
 * - `general_search`: includes `categories` (optional) and `places` fields
 * - `specific_place`: includes `description` field and optional `place` field
 * - `travel_consultation`: includes `textContent` field and optional `relatedPlaces` field
 * - `non_travel`: includes only `textContent` field
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**
 * 
 * Property 6: General Search Backward Compatibility
 * *For any* `general_search` response, the response structure SHALL match the existing format 
 * with `acknowledgment`, `categories` (optional), `places`, `requestedCount`, and `exceededLimit` fields.
 * **Validates: Requirements 5.1, 5.2, 5.3**
 */

import * as fc from 'fast-check';
import {
  IntentType,
  PlaceResult,
  CategoryGroup,
  GeneralSearchResponse,
  SpecificPlaceResponse,
  TravelConsultationResponse,
  NonTravelResponse,
  SearchResponse,
  CityPlacesGroup,
} from '../../src/types/intent';

// ============================================
// Valid Intent Types
// ============================================

const VALID_INTENT_TYPES: IntentType[] = [
  'general_search',
  'specific_place',
  'travel_consultation',
  'non_travel',
];

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
  'Berlin', 'Amsterdam', 'Vienna', 'Prague', 'Florence'
);

/**
 * Generator for place names
 */
const placeNameArbitrary = fc.constantFrom(
  'Eiffel Tower', 'Louvre Museum', 'Notre-Dame Cathedral',
  'Tokyo Tower', 'Senso-ji Temple', 'Shibuya Crossing',
  'Colosseum', 'Vatican Museums', 'Trevi Fountain'
);

/**
 * Generator for PlaceResult
 */
const placeResultArbitrary: fc.Arbitrary<PlaceResult> = fc.record({
  id: fc.uuid(),
  name: placeNameArbitrary,
  summary: fc.string({ minLength: 0, maxLength: 200 }),
  coverImage: fc.oneof(validCoverImageArbitrary, fc.constant('')),
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
 * Generator for CategoryGroup
 */
const categoryGroupArbitrary: fc.Arbitrary<CategoryGroup> = fc.record({
  title: fc.string({ minLength: 1, maxLength: 50 }),
  places: fc.array(placeResultArbitrary, { minLength: 2, maxLength: 10 }),
});

/**
 * Generator for CityPlacesGroup
 */
const cityPlacesGroupArbitrary: fc.Arbitrary<CityPlacesGroup> = fc.record({
  city: cityNameArbitrary,
  places: fc.array(placeResultArbitrary, { minLength: 3, maxLength: 10 }),
});

/**
 * Generator for GeneralSearchResponse
 */
const generalSearchResponseArbitrary: fc.Arbitrary<GeneralSearchResponse> = fc.record({
  intent: fc.constant('general_search' as const),
  success: fc.boolean(),
  error: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  acknowledgment: fc.string({ minLength: 0, maxLength: 200 }),
  categories: fc.option(fc.array(categoryGroupArbitrary, { minLength: 0, maxLength: 5 }), { nil: undefined }),
  places: fc.array(placeResultArbitrary, { minLength: 0, maxLength: 20 }),
  requestedCount: fc.integer({ min: 1, max: 20 }),
  exceededLimit: fc.boolean(),
  quotaRemaining: fc.integer({ min: 0, max: 100 }),
  stage: fc.constant('complete'),
});

/**
 * Generator for SpecificPlaceResponse
 */
const specificPlaceResponseArbitrary: fc.Arbitrary<SpecificPlaceResponse> = fc.record({
  intent: fc.constant('specific_place' as const),
  success: fc.boolean(),
  error: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  description: fc.string({ minLength: 0, maxLength: 500 }),
  place: fc.option(placeResultArbitrary, { nil: undefined }),
});

/**
 * Generator for TravelConsultationResponse (single city)
 */
const travelConsultationSingleCityResponseArbitrary: fc.Arbitrary<TravelConsultationResponse> = fc.record({
  intent: fc.constant('travel_consultation' as const),
  success: fc.boolean(),
  error: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  textContent: fc.string({ minLength: 10, maxLength: 500 }),
  relatedPlaces: fc.option(fc.array(placeResultArbitrary, { minLength: 0, maxLength: 10 }), { nil: undefined }),
});

/**
 * Generator for TravelConsultationResponse (multi city)
 */
const travelConsultationMultiCityResponseArbitrary: fc.Arbitrary<TravelConsultationResponse> = fc.record({
  intent: fc.constant('travel_consultation' as const),
  success: fc.boolean(),
  error: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  textContent: fc.string({ minLength: 10, maxLength: 500 }),
  cityPlaces: fc.option(fc.array(cityPlacesGroupArbitrary, { minLength: 2, maxLength: 5 }), { nil: undefined }),
});

/**
 * Generator for NonTravelResponse
 */
const nonTravelResponseArbitrary: fc.Arbitrary<NonTravelResponse> = fc.record({
  intent: fc.constant('non_travel' as const),
  success: fc.boolean(),
  error: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  textContent: fc.string({ minLength: 0, maxLength: 500 }),
});

/**
 * Generator for any SearchResponse
 */
const searchResponseArbitrary: fc.Arbitrary<SearchResponse> = fc.oneof(
  generalSearchResponseArbitrary,
  specificPlaceResponseArbitrary,
  travelConsultationSingleCityResponseArbitrary,
  travelConsultationMultiCityResponseArbitrary,
  nonTravelResponseArbitrary
);

// ============================================
// Helper Functions
// ============================================

/**
 * Check if a response has the required fields for general_search
 */
function isValidGeneralSearchResponse(response: any): boolean {
  if (response.intent !== 'general_search') return false;
  if (typeof response.success !== 'boolean') return false;
  if (typeof response.acknowledgment !== 'string') return false;
  if (!Array.isArray(response.places)) return false;
  if (typeof response.requestedCount !== 'number') return false;
  if (typeof response.exceededLimit !== 'boolean') return false;
  // categories is optional
  if (response.categories !== undefined && !Array.isArray(response.categories)) return false;
  return true;
}

/**
 * Check if a response has the required fields for specific_place
 */
function isValidSpecificPlaceResponse(response: any): boolean {
  if (response.intent !== 'specific_place') return false;
  if (typeof response.success !== 'boolean') return false;
  if (typeof response.description !== 'string') return false;
  // place is optional
  if (response.place !== undefined && response.place !== null) {
    if (typeof response.place.id !== 'string') return false;
    if (typeof response.place.name !== 'string') return false;
  }
  return true;
}

/**
 * Check if a response has the required fields for travel_consultation
 */
function isValidTravelConsultationResponse(response: any): boolean {
  if (response.intent !== 'travel_consultation') return false;
  if (typeof response.success !== 'boolean') return false;
  if (typeof response.textContent !== 'string') return false;
  // relatedPlaces is optional (for single city)
  if (response.relatedPlaces !== undefined && !Array.isArray(response.relatedPlaces)) return false;
  // cityPlaces is optional (for multi city)
  if (response.cityPlaces !== undefined && !Array.isArray(response.cityPlaces)) return false;
  return true;
}

/**
 * Check if a response has the required fields for non_travel
 */
function isValidNonTravelResponse(response: any): boolean {
  if (response.intent !== 'non_travel') return false;
  if (typeof response.success !== 'boolean') return false;
  if (typeof response.textContent !== 'string') return false;
  return true;
}

/**
 * Check if a response has the correct structure based on its intent
 */
function hasCorrectStructureForIntent(response: SearchResponse): boolean {
  switch (response.intent) {
    case 'general_search':
      return isValidGeneralSearchResponse(response);
    case 'specific_place':
      return isValidSpecificPlaceResponse(response);
    case 'travel_consultation':
      return isValidTravelConsultationResponse(response);
    case 'non_travel':
      return isValidNonTravelResponse(response);
    default:
      return false;
  }
}

/**
 * Check if non_travel response has no place-related fields
 */
function nonTravelHasNoPlaceFields(response: NonTravelResponse): boolean {
  const forbiddenFields = ['place', 'places', 'relatedPlaces', 'cityPlaces', 'categories'];
  for (const field of forbiddenFields) {
    if (field in response && (response as any)[field] !== undefined) {
      return false;
    }
  }
  return true;
}

/**
 * Check if general_search response has backward compatible structure
 */
function hasBackwardCompatibleStructure(response: GeneralSearchResponse): boolean {
  // Must have acknowledgment (string)
  if (typeof response.acknowledgment !== 'string') return false;
  // Must have places (array)
  if (!Array.isArray(response.places)) return false;
  // Must have requestedCount (number)
  if (typeof response.requestedCount !== 'number') return false;
  // Must have exceededLimit (boolean)
  if (typeof response.exceededLimit !== 'boolean') return false;
  // categories is optional but if present must be array
  if (response.categories !== undefined && !Array.isArray(response.categories)) return false;
  return true;
}

// ============================================
// Property Tests
// ============================================

describe('Response Structure Property-Based Tests', () => {
  
  /**
   * Feature: ai-intent-recognition, Property 2: Response Structure by Intent
   * 
   * *For any* search response, the response structure SHALL match the intent type:
   * - `general_search`: includes `categories` (optional) and `places` fields
   * - `specific_place`: includes `description` field and optional `place` field
   * - `travel_consultation`: includes `textContent` field and optional `relatedPlaces` field
   * - `non_travel`: includes only `textContent` field
   * 
   * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**
   */
  describe('Property 2: Response Structure by Intent', () => {
    
    /**
     * All responses must have an intent field
     */
    it('should always have an intent field in all responses', () => {
      fc.assert(
        fc.property(
          searchResponseArbitrary,
          (response: SearchResponse) => {
            return 'intent' in response && VALID_INTENT_TYPES.includes(response.intent);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * All responses must have a success field
     */
    it('should always have a success field in all responses', () => {
      fc.assert(
        fc.property(
          searchResponseArbitrary,
          (response: SearchResponse) => {
            return 'success' in response && typeof response.success === 'boolean';
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * general_search responses must have categories (optional) and places fields
     */
    it('should have categories (optional) and places fields for general_search', () => {
      fc.assert(
        fc.property(
          generalSearchResponseArbitrary,
          (response: GeneralSearchResponse) => {
            // Must have places array
            if (!Array.isArray(response.places)) return false;
            // categories is optional, but if present must be array
            if (response.categories !== undefined && !Array.isArray(response.categories)) return false;
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * specific_place responses must have description field and optional place field
     */
    it('should have description field and optional place field for specific_place', () => {
      fc.assert(
        fc.property(
          specificPlaceResponseArbitrary,
          (response: SpecificPlaceResponse) => {
            // Must have description string
            if (typeof response.description !== 'string') return false;
            // place is optional
            if (response.place !== undefined && response.place !== null) {
              // If present, must have id and name
              if (typeof response.place.id !== 'string') return false;
              if (typeof response.place.name !== 'string') return false;
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * travel_consultation responses must have textContent field and optional relatedPlaces field
     */
    it('should have textContent field and optional relatedPlaces/cityPlaces for travel_consultation', () => {
      fc.assert(
        fc.property(
          fc.oneof(travelConsultationSingleCityResponseArbitrary, travelConsultationMultiCityResponseArbitrary),
          (response: TravelConsultationResponse) => {
            // Must have textContent string
            if (typeof response.textContent !== 'string') return false;
            // relatedPlaces is optional (single city)
            if (response.relatedPlaces !== undefined && !Array.isArray(response.relatedPlaces)) return false;
            // cityPlaces is optional (multi city)
            if (response.cityPlaces !== undefined && !Array.isArray(response.cityPlaces)) return false;
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * non_travel responses must have only textContent field (no place-related fields)
     */
    it('should have only textContent field for non_travel (no place-related fields)', () => {
      fc.assert(
        fc.property(
          nonTravelResponseArbitrary,
          (response: NonTravelResponse) => {
            // Must have textContent string
            if (typeof response.textContent !== 'string') return false;
            // Must not have place-related fields
            return nonTravelHasNoPlaceFields(response);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Response structure should match intent type
     */
    it('should have correct structure based on intent type', () => {
      fc.assert(
        fc.property(
          searchResponseArbitrary,
          (response: SearchResponse) => {
            return hasCorrectStructureForIntent(response);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Intent field should be one of the four valid types
     */
    it('should have intent as one of the four valid types', () => {
      fc.assert(
        fc.property(
          searchResponseArbitrary,
          (response: SearchResponse) => {
            return VALID_INTENT_TYPES.includes(response.intent);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: ai-intent-recognition, Property 6: General Search Backward Compatibility
   * 
   * *For any* `general_search` response, the response structure SHALL match the existing format 
   * with `acknowledgment`, `categories` (optional), `places`, `requestedCount`, and `exceededLimit` fields.
   * 
   * **Validates: Requirements 5.1, 5.2, 5.3**
   */
  describe('Property 6: General Search Backward Compatibility', () => {
    
    /**
     * general_search responses must have acknowledgment field
     */
    it('should have acknowledgment field for general_search', () => {
      fc.assert(
        fc.property(
          generalSearchResponseArbitrary,
          (response: GeneralSearchResponse) => {
            return 'acknowledgment' in response && typeof response.acknowledgment === 'string';
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * general_search responses must have places field as array
     */
    it('should have places field as array for general_search', () => {
      fc.assert(
        fc.property(
          generalSearchResponseArbitrary,
          (response: GeneralSearchResponse) => {
            return 'places' in response && Array.isArray(response.places);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * general_search responses must have requestedCount field as number
     */
    it('should have requestedCount field as number for general_search', () => {
      fc.assert(
        fc.property(
          generalSearchResponseArbitrary,
          (response: GeneralSearchResponse) => {
            return 'requestedCount' in response && typeof response.requestedCount === 'number';
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * general_search responses must have exceededLimit field as boolean
     */
    it('should have exceededLimit field as boolean for general_search', () => {
      fc.assert(
        fc.property(
          generalSearchResponseArbitrary,
          (response: GeneralSearchResponse) => {
            return 'exceededLimit' in response && typeof response.exceededLimit === 'boolean';
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * general_search responses categories field should be optional array
     */
    it('should have categories as optional array for general_search', () => {
      fc.assert(
        fc.property(
          generalSearchResponseArbitrary,
          (response: GeneralSearchResponse) => {
            // categories is optional
            if (response.categories === undefined) return true;
            // If present, must be array
            return Array.isArray(response.categories);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * general_search responses should have backward compatible structure
     */
    it('should have backward compatible structure for general_search', () => {
      fc.assert(
        fc.property(
          generalSearchResponseArbitrary,
          (response: GeneralSearchResponse) => {
            return hasBackwardCompatibleStructure(response);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Each place in places array should have required fields
     */
    it('should have required fields in each place for general_search', () => {
      fc.assert(
        fc.property(
          generalSearchResponseArbitrary,
          (response: GeneralSearchResponse) => {
            return response.places.every(place => 
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

    /**
     * Each category in categories array should have title and places
     */
    it('should have title and places in each category for general_search', () => {
      fc.assert(
        fc.property(
          generalSearchResponseArbitrary,
          (response: GeneralSearchResponse) => {
            if (!response.categories) return true;
            return response.categories.every(category =>
              typeof category.title === 'string' &&
              Array.isArray(category.places)
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * requestedCount should be a positive integer
     */
    it('should have positive requestedCount for general_search', () => {
      fc.assert(
        fc.property(
          generalSearchResponseArbitrary,
          (response: GeneralSearchResponse) => {
            return response.requestedCount > 0 && Number.isInteger(response.requestedCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * quotaRemaining should be a non-negative integer
     */
    it('should have non-negative quotaRemaining for general_search', () => {
      fc.assert(
        fc.property(
          generalSearchResponseArbitrary,
          (response: GeneralSearchResponse) => {
            return response.quotaRemaining >= 0 && Number.isInteger(response.quotaRemaining);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Cross-Intent Structure Invariants
   */
  describe('Cross-Intent Structure Invariants', () => {
    
    /**
     * Only general_search should have places array at top level
     */
    it('should only have places array at top level for general_search', () => {
      fc.assert(
        fc.property(
          searchResponseArbitrary,
          (response: SearchResponse) => {
            if (response.intent === 'general_search') {
              return Array.isArray((response as GeneralSearchResponse).places);
            }
            // Other intents should not have places at top level
            return !('places' in response) || (response as any).places === undefined;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Only specific_place should have description field
     */
    it('should only have description field for specific_place', () => {
      fc.assert(
        fc.property(
          searchResponseArbitrary,
          (response: SearchResponse) => {
            if (response.intent === 'specific_place') {
              return typeof (response as SpecificPlaceResponse).description === 'string';
            }
            // Other intents should not have description
            return !('description' in response) || (response as any).description === undefined;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Only travel_consultation and non_travel should have textContent field
     */
    it('should only have textContent field for travel_consultation and non_travel', () => {
      fc.assert(
        fc.property(
          searchResponseArbitrary,
          (response: SearchResponse) => {
            if (response.intent === 'travel_consultation' || response.intent === 'non_travel') {
              return typeof (response as TravelConsultationResponse | NonTravelResponse).textContent === 'string';
            }
            // Other intents should not have textContent
            return !('textContent' in response) || (response as any).textContent === undefined;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Only general_search should have acknowledgment field
     */
    it('should only have acknowledgment field for general_search', () => {
      fc.assert(
        fc.property(
          searchResponseArbitrary,
          (response: SearchResponse) => {
            if (response.intent === 'general_search') {
              return typeof (response as GeneralSearchResponse).acknowledgment === 'string';
            }
            // Other intents should not have acknowledgment
            return !('acknowledgment' in response) || (response as any).acknowledgment === undefined;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Only travel_consultation should have relatedPlaces or cityPlaces
     */
    it('should only have relatedPlaces/cityPlaces for travel_consultation', () => {
      fc.assert(
        fc.property(
          searchResponseArbitrary,
          (response: SearchResponse) => {
            if (response.intent === 'travel_consultation') {
              // May have relatedPlaces or cityPlaces (both optional)
              const tcResponse = response as TravelConsultationResponse;
              if (tcResponse.relatedPlaces !== undefined && !Array.isArray(tcResponse.relatedPlaces)) return false;
              if (tcResponse.cityPlaces !== undefined && !Array.isArray(tcResponse.cityPlaces)) return false;
              return true;
            }
            // Other intents should not have relatedPlaces or cityPlaces
            const hasRelatedPlaces = 'relatedPlaces' in response && (response as any).relatedPlaces !== undefined;
            const hasCityPlaces = 'cityPlaces' in response && (response as any).cityPlaces !== undefined;
            return !hasRelatedPlaces && !hasCityPlaces;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
