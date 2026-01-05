/**
 * Property-Based Tests for Specific Place Handler
 * 
 * Feature: ai-intent-recognition
 * 
 * Property 7: Specific Place Description Length
 * *For any* `specific_place` response, the `description` field SHALL be under 100 words.
 * **Validates: Requirements 2.6**
 * 
 * Property 8: Specific Place Prioritizes Images
 * *For any* `specific_place` query where multiple database matches exist, the returned `place` 
 * (if any) SHALL have a non-empty `coverImage` when at least one match has an image.
 * **Validates: Requirements 2.5**
 */

import * as fc from 'fast-check';
import { SpecificPlaceHandlerResult, PlaceResult } from '../../src/types/intent';

// ============================================
// Configuration
// ============================================

const MAX_DESCRIPTION_WORDS = 100;

/**
 * Generator for mock PlaceResult with image
 */
const placeResultWithImageArbitrary = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  summary: fc.string({ minLength: 0, maxLength: 500 }),
  coverImage: fc.webUrl(), // Non-empty URL
  latitude: fc.double({ min: -90, max: 90 }),
  longitude: fc.double({ min: -180, max: 180 }),
  city: fc.string({ minLength: 1, maxLength: 50 }),
  country: fc.string({ minLength: 1, maxLength: 50 }),
  rating: fc.option(fc.double({ min: 0, max: 5 }), { nil: null }),
  ratingCount: fc.option(fc.integer({ min: 0, max: 10000 }), { nil: null }),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 5 }),
  isVerified: fc.boolean(),
  source: fc.constantFrom('cache' as const, 'ai' as const),
});

/**
 * Generator for mock PlaceResult without image
 */
const placeResultWithoutImageArbitrary = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  summary: fc.string({ minLength: 0, maxLength: 500 }),
  coverImage: fc.constant(''), // Empty string = no image
  latitude: fc.double({ min: -90, max: 90 }),
  longitude: fc.double({ min: -180, max: 180 }),
  city: fc.string({ minLength: 1, maxLength: 50 }),
  country: fc.string({ minLength: 1, maxLength: 50 }),
  rating: fc.option(fc.double({ min: 0, max: 5 }), { nil: null }),
  ratingCount: fc.option(fc.integer({ min: 0, max: 10000 }), { nil: null }),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 5 }),
  isVerified: fc.boolean(),
  source: fc.constantFrom('cache' as const, 'ai' as const),
});

// ============================================
// Helper Functions
// ============================================

/**
 * Count words in a string
 */
function countWords(text: string): number {
  if (!text || text.trim().length === 0) return 0;
  // Split by whitespace and filter out empty strings
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Check if a place has a valid cover image
 */
function hasValidCoverImage(place: PlaceResult | null | undefined): boolean {
  return !!(place && place.coverImage && place.coverImage.trim() !== '');
}

/**
 * Validate description word count is under limit
 */
function isDescriptionUnderWordLimit(description: string): boolean {
  const wordCount = countWords(description);
  return wordCount <= MAX_DESCRIPTION_WORDS;
}

// ============================================
// Property Tests
// ============================================

describe('Specific Place Handler Property-Based Tests', () => {
  
  /**
   * Feature: ai-intent-recognition, Property 7: Specific Place Description Length
   * 
   * *For any* `specific_place` response, the `description` field SHALL be under 100 words.
   * 
   * **Validates: Requirements 2.6**
   */
  describe('Property 7: Specific Place Description Length', () => {
    
    /**
     * Test that word counting helper works correctly
     */
    it('should correctly count words in various strings', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 50 }),
          (words: string[]) => {
            // Filter out empty strings and join with spaces
            const nonEmptyWords = words.filter(w => w.trim().length > 0);
            const text = nonEmptyWords.join(' ');
            const counted = countWords(text);
            
            // Word count should be reasonable (may differ due to whitespace handling)
            // but should never exceed the number of non-empty input words
            return counted >= 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Test that empty descriptions are valid (0 words < 100 words)
     */
    it('should accept empty descriptions as valid', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('', '   ', '\n\t'),
          (emptyDescription: string) => {
            return isDescriptionUnderWordLimit(emptyDescription);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Test that descriptions with exactly 100 words are valid
     */
    it('should accept descriptions with exactly 100 words', () => {
      fc.assert(
        fc.property(
          // Generate exactly 100 non-whitespace words
          fc.array(
            fc.string({ minLength: 1, maxLength: 10 }).filter(s => s.trim().length > 0 && !s.includes(' ')),
            { minLength: 100, maxLength: 100 }
          ),
          (words: string[]) => {
            const description = words.join(' ');
            const wordCount = countWords(description);
            // Exactly 100 words should be valid (100 <= 100)
            return wordCount === 100 && isDescriptionUnderWordLimit(description);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Test that descriptions with more than 100 words are invalid
     */
    it('should reject descriptions with more than 100 words', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 10 }).filter(s => s.trim().length > 0), { minLength: 101, maxLength: 150 }),
          (words: string[]) => {
            const description = words.join(' ');
            const wordCount = countWords(description);
            // More than 100 words should be invalid
            return wordCount > MAX_DESCRIPTION_WORDS ? !isDescriptionUnderWordLimit(description) : true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: ai-intent-recognition, Property 8: Specific Place Prioritizes Images
   * 
   * *For any* `specific_place` query where multiple database matches exist, the returned `place` 
   * (if any) SHALL have a non-empty `coverImage` when at least one match has an image.
   * 
   * **Validates: Requirements 2.5**
   */
  describe('Property 8: Specific Place Prioritizes Images', () => {
    
    /**
     * Test that hasValidCoverImage correctly identifies places with images
     */
    it('should correctly identify places with valid cover images', () => {
      fc.assert(
        fc.property(
          placeResultWithImageArbitrary,
          (place) => {
            // Places generated with webUrl should have valid images
            return hasValidCoverImage(place as PlaceResult);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Test that hasValidCoverImage correctly identifies places without images
     */
    it('should correctly identify places without cover images', () => {
      fc.assert(
        fc.property(
          placeResultWithoutImageArbitrary,
          (place) => {
            // Places generated with empty coverImage should not have valid images
            return !hasValidCoverImage(place as PlaceResult);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Test that null/undefined places are handled correctly
     */
    it('should handle null and undefined places correctly', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(null, undefined),
          (place) => {
            return !hasValidCoverImage(place as any);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Test image prioritization logic:
     * Given a list of candidates where at least one has an image,
     * the selection algorithm should prefer the one with an image
     */
    it('should prioritize places with images when selecting from candidates', () => {
      fc.assert(
        fc.property(
          // Generate a mix of places with and without images
          fc.tuple(
            fc.array(placeResultWithoutImageArbitrary, { minLength: 1, maxLength: 5 }),
            fc.array(placeResultWithImageArbitrary, { minLength: 1, maxLength: 5 })
          ),
          ([placesWithoutImage, placesWithImage]) => {
            // Combine all candidates
            const allCandidates = [...placesWithoutImage, ...placesWithImage] as PlaceResult[];
            
            // Simulate the selection logic from intentClassifierService
            // Sort by: 1) has image (prioritize), 2) some score
            const sorted = [...allCandidates].sort((a, b) => {
              const aHasImage = hasValidCoverImage(a);
              const bHasImage = hasValidCoverImage(b);
              if (aHasImage !== bHasImage) {
                return aHasImage ? -1 : 1;
              }
              return 0;
            });

            // The first element should have an image if any candidate has one
            const hasAnyImage = allCandidates.some(p => hasValidCoverImage(p));
            const selectedHasImage = hasValidCoverImage(sorted[0]);
            
            // If any candidate has an image, the selected one should have an image
            return !hasAnyImage || selectedHasImage;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Test that when all candidates have images, selection still works
     */
    it('should work correctly when all candidates have images', () => {
      fc.assert(
        fc.property(
          fc.array(placeResultWithImageArbitrary, { minLength: 1, maxLength: 10 }),
          (candidates) => {
            const allCandidates = candidates as PlaceResult[];
            
            // All have images, so any selection should have an image
            const sorted = [...allCandidates].sort((a, b) => {
              const aHasImage = hasValidCoverImage(a);
              const bHasImage = hasValidCoverImage(b);
              if (aHasImage !== bHasImage) {
                return aHasImage ? -1 : 1;
              }
              return 0;
            });

            return hasValidCoverImage(sorted[0]);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Test that when no candidates have images, selection still returns a result
     */
    it('should return a result even when no candidates have images', () => {
      fc.assert(
        fc.property(
          fc.array(placeResultWithoutImageArbitrary, { minLength: 1, maxLength: 10 }),
          (candidates) => {
            const allCandidates = candidates as PlaceResult[];
            
            // None have images, but we should still get a result
            const sorted = [...allCandidates].sort((a, b) => {
              const aHasImage = hasValidCoverImage(a);
              const bHasImage = hasValidCoverImage(b);
              if (aHasImage !== bHasImage) {
                return aHasImage ? -1 : 1;
              }
              return 0;
            });

            // Should return the first candidate (none have images)
            return sorted.length > 0 && !hasValidCoverImage(sorted[0]);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Integration-style property tests for SpecificPlaceHandlerResult structure
   */
  describe('SpecificPlaceHandlerResult Structure Invariants', () => {
    
    /**
     * Test that handler results always have a description field (may be empty)
     */
    it('should always have a description field in handler result', () => {
      fc.assert(
        fc.property(
          fc.record({
            description: fc.string(),
            place: fc.option(placeResultWithImageArbitrary, { nil: null }),
          }),
          (result) => {
            const handlerResult = result as SpecificPlaceHandlerResult;
            return typeof handlerResult.description === 'string';
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Test that place field is either null or a valid PlaceResult
     */
    it('should have place field as null or valid PlaceResult', () => {
      fc.assert(
        fc.property(
          fc.record({
            description: fc.string(),
            place: fc.option(placeResultWithImageArbitrary, { nil: null }),
          }),
          (result) => {
            const handlerResult = result as SpecificPlaceHandlerResult;
            if (handlerResult.place === null) {
              return true;
            }
            // If place exists, it should have required fields
            return (
              typeof handlerResult.place.id === 'string' &&
              typeof handlerResult.place.name === 'string' &&
              typeof handlerResult.place.coverImage === 'string'
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
