/**
 * Property-Based Tests for PlaceMatcherService
 * 
 * Feature: ai-search-v2-parallel-pipeline, Property 7: Display Count Limits
 * 
 * Tests that display count limits are correctly enforced:
 * - IF categories exist, EACH category SHALL show 2-5 places
 * - IF no categories exist, the total displayed places SHALL be at most 5
 * 
 * **Validates: Requirements 9.2, 9.4**
 */

import * as fc from 'fast-check';
import {
  PlaceMatcherService,
  MATCH_CONFIG,
  MatchedPlace,
} from '../../src/services/placeMatcherService';
import { AIPlace, AICategory } from '../../src/services/aiRecommendationService';

// ============================================
// Test Data Generators
// ============================================

/**
 * Generate an array of unique place names
 */
const uniquePlaceNamesArbitrary = (count: number): fc.Arbitrary<string[]> =>
  fc.array(fc.string({ minLength: 3, maxLength: 30 }), { minLength: count, maxLength: count })
    .map(names => [...new Set(names.map((n, i) => `${n}_${i}`))]);

/**
 * Generate a category with specified number of places
 */
const categoryArbitrary = (minPlaces: number, maxPlaces: number): fc.Arbitrary<AICategory> =>
  fc.integer({ min: minPlaces, max: maxPlaces }).chain(placeCount =>
    uniquePlaceNamesArbitrary(placeCount).map(placeNames => ({
      title: `Category_${Math.random().toString(36).substring(7)}`,
      placeNames,
    }))
  );

// ============================================
// Property Tests
// ============================================

describe('PlaceMatcherService Property-Based Tests', () => {
  let service: PlaceMatcherService;

  beforeEach(() => {
    service = new PlaceMatcherService();
  });

  /**
   * Feature: ai-search-v2-parallel-pipeline, Property 7: Display Count Limits
   * 
   * *For any* final search result displayed to users:
   * - IF categories exist, EACH category SHALL show 2-5 places
   * - IF no categories exist, the total displayed places SHALL be at most 5
   * 
   * **Validates: Requirements 9.2, 9.4**
   */
  describe('Property 7: Display Count Limits', () => {
    /**
     * Property: When categories exist, each category should have 2-5 places
     * 
     * Requirements: 9.2
     */
    it('should limit each category to 2-5 places when categories exist', () => {
      fc.assert(
        fc.property(
          // Generate 2-4 categories, each with 2-8 place names
          fc.array(categoryArbitrary(2, 8), { minLength: 1, maxLength: 4 }),
          (categories: AICategory[]) => {
            // Create AI places for all place names in categories
            const allPlaceNames = categories.flatMap(c => c.placeNames);
            const aiPlaces: AIPlace[] = allPlaceNames.map(name => ({
              name,
              summary: 'Test summary',
              latitude: 40.7128,
              longitude: -74.0060,
              city: 'New York',
              country: 'USA',
              coverImageUrl: 'https://example.com/image.jpg',
              tags: ['test'],
              recommendationPhrase: 'highly rated',
            }));

            // Create matched places for all AI places
            const matched: MatchedPlace[] = aiPlaces.map(aiPlace => ({
              aiPlace,
              source: 'google' as const,
              googlePlaceId: `place_${aiPlace.name}`,
              matchScore: 0.9,
            }));

            // Apply display limits with categories
            const result = service.applyDisplayLimits(matched, [], categories);

            // Verify: if categories exist in result, each should have 2-5 places
            if (result.categories && result.categories.length > 0) {
              for (const category of result.categories) {
                const placeCount = category.places.length;
                // Each category should have at least minMatchesPerCategory (2)
                // and at most maxMatchesPerCategory (5)
                if (placeCount < MATCH_CONFIG.minMatchesPerCategory) {
                  return false; // Category has fewer than minimum
                }
                if (placeCount > MATCH_CONFIG.maxMatchesPerCategory) {
                  return false; // Category has more than maximum
                }
              }
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: When no categories exist, total places should be at most 5
     * 
     * Requirements: 9.4
     */
    it('should limit total places to 5 when no categories exist', () => {
      fc.assert(
        fc.property(
          // Generate 1-15 AI places (more than the limit to test truncation)
          fc.integer({ min: 1, max: 15 }),
          (placeCount: number) => {
            // Create AI places
            const aiPlaces: AIPlace[] = Array.from({ length: placeCount }, (_, i) => ({
              name: `Place_${i}`,
              summary: 'Test summary',
              latitude: 40.7128 + i * 0.01,
              longitude: -74.0060 + i * 0.01,
              city: 'New York',
              country: 'USA',
              coverImageUrl: 'https://example.com/image.jpg',
              tags: ['test'],
              recommendationPhrase: 'highly rated',
            }));

            // Create matched places for all AI places
            const matched: MatchedPlace[] = aiPlaces.map(aiPlace => ({
              aiPlace,
              source: 'google' as const,
              googlePlaceId: `place_${aiPlace.name}`,
              matchScore: 0.9,
            }));

            // Apply display limits WITHOUT categories
            const result = service.applyDisplayLimits(matched, []);

            // Verify: total places should be at most maxTotalMatches (5)
            return result.places.length <= MATCH_CONFIG.maxTotalMatches;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Categories with fewer than 2 places should be excluded
     * 
     * Requirements: 9.2
     */
    it('should exclude categories with fewer than 2 places', () => {
      fc.assert(
        fc.property(
          // Generate categories where some have only 1 place name
          fc.array(
            fc.oneof(
              categoryArbitrary(1, 1), // Category with only 1 place
              categoryArbitrary(2, 5), // Category with 2-5 places
            ),
            { minLength: 2, maxLength: 5 }
          ),
          (categories: AICategory[]) => {
            // Create AI places for all place names
            const allPlaceNames = categories.flatMap(c => c.placeNames);
            const aiPlaces: AIPlace[] = allPlaceNames.map(name => ({
              name,
              summary: 'Test summary',
              latitude: 40.7128,
              longitude: -74.0060,
              city: 'New York',
              country: 'USA',
              coverImageUrl: 'https://example.com/image.jpg',
              tags: ['test'],
              recommendationPhrase: 'highly rated',
            }));

            // Create matched places for all AI places
            const matched: MatchedPlace[] = aiPlaces.map(aiPlace => ({
              aiPlace,
              source: 'google' as const,
              googlePlaceId: `place_${aiPlace.name}`,
              matchScore: 0.9,
            }));

            // Apply display limits with categories
            const result = service.applyDisplayLimits(matched, [], categories);

            // Verify: all categories in result should have at least 2 places
            if (result.categories) {
              for (const category of result.categories) {
                if (category.places.length < MATCH_CONFIG.minMatchesPerCategory) {
                  return false;
                }
              }
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Mixed matched and unmatched places should respect limits
     * 
     * Requirements: 9.4
     */
    it('should respect limits when mixing matched and unmatched places', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 10 }), // matched count
          fc.integer({ min: 0, max: 10 }), // unmatched count
          (matchedCount: number, unmatchedCount: number) => {
            // Create matched AI places
            const matchedAiPlaces: AIPlace[] = Array.from({ length: matchedCount }, (_, i) => ({
              name: `Matched_${i}`,
              summary: 'Test summary',
              latitude: 40.7128 + i * 0.01,
              longitude: -74.0060 + i * 0.01,
              city: 'New York',
              country: 'USA',
              coverImageUrl: 'https://example.com/image.jpg',
              tags: ['test'],
              recommendationPhrase: 'highly rated',
            }));

            // Create unmatched AI places
            const unmatchedAiPlaces: AIPlace[] = Array.from({ length: unmatchedCount }, (_, i) => ({
              name: `Unmatched_${i}`,
              summary: 'Test summary',
              latitude: 41.7128 + i * 0.01,
              longitude: -75.0060 + i * 0.01,
              city: 'Chicago',
              country: 'USA',
              coverImageUrl: 'https://example.com/image2.jpg',
              tags: ['test'],
              recommendationPhrase: 'hidden gem',
            }));

            // Create matched places
            const matched: MatchedPlace[] = matchedAiPlaces.map(aiPlace => ({
              aiPlace,
              source: 'google' as const,
              googlePlaceId: `place_${aiPlace.name}`,
              matchScore: 0.9,
            }));

            // Apply display limits WITHOUT categories
            const result = service.applyDisplayLimits(matched, unmatchedAiPlaces);

            // Verify: total places should be at most maxTotalMatches (5)
            return result.places.length <= MATCH_CONFIG.maxTotalMatches;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Matched places should be prioritized over unmatched
     * 
     * Requirements: 9.4
     */
    it('should prioritize matched places over unmatched in flat layout', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 3, max: 10 }), // matched count (enough to fill limit)
          fc.integer({ min: 1, max: 5 }),  // unmatched count
          (matchedCount: number, unmatchedCount: number) => {
            // Create matched AI places
            const matchedAiPlaces: AIPlace[] = Array.from({ length: matchedCount }, (_, i) => ({
              name: `Matched_${i}`,
              summary: 'Test summary',
              latitude: 40.7128 + i * 0.01,
              longitude: -74.0060 + i * 0.01,
              city: 'New York',
              country: 'USA',
              coverImageUrl: 'https://example.com/image.jpg',
              tags: ['test'],
              recommendationPhrase: 'highly rated',
            }));

            // Create unmatched AI places
            const unmatchedAiPlaces: AIPlace[] = Array.from({ length: unmatchedCount }, (_, i) => ({
              name: `Unmatched_${i}`,
              summary: 'Test summary',
              latitude: 41.7128 + i * 0.01,
              longitude: -75.0060 + i * 0.01,
              city: 'Chicago',
              country: 'USA',
              coverImageUrl: 'https://example.com/image2.jpg',
              tags: ['test'],
              recommendationPhrase: 'hidden gem',
            }));

            // Create matched places with varying scores
            const matched: MatchedPlace[] = matchedAiPlaces.map((aiPlace, i) => ({
              aiPlace,
              source: 'google' as const,
              googlePlaceId: `place_${aiPlace.name}`,
              matchScore: 0.9 - i * 0.01, // Decreasing scores
            }));

            // Apply display limits WITHOUT categories
            const result = service.applyDisplayLimits(matched, unmatchedAiPlaces);

            // If we have enough matched places to fill the limit,
            // all displayed places should be verified (from matched)
            if (matchedCount >= MATCH_CONFIG.maxTotalMatches) {
              return result.places.every(p => p.isVerified === true);
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Display result should never exceed configured limits
     * 
     * Requirements: 9.2, 9.4
     */
    it('should never exceed configured display limits regardless of input size', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 50 }), // large number of matched places
          fc.integer({ min: 0, max: 50 }), // large number of unmatched places
          fc.boolean(), // whether to use categories
          (matchedCount: number, unmatchedCount: number, useCategories: boolean) => {
            // Create AI places
            const allAiPlaces: AIPlace[] = Array.from(
              { length: matchedCount + unmatchedCount },
              (_, i) => ({
                name: `Place_${i}`,
                summary: 'Test summary',
                latitude: 40.7128 + i * 0.001,
                longitude: -74.0060 + i * 0.001,
                city: 'New York',
                country: 'USA',
                coverImageUrl: 'https://example.com/image.jpg',
                tags: ['test'],
                recommendationPhrase: 'highly rated',
              })
            );

            const matchedAiPlaces = allAiPlaces.slice(0, matchedCount);
            const unmatchedAiPlaces = allAiPlaces.slice(matchedCount);

            // Create matched places
            const matched: MatchedPlace[] = matchedAiPlaces.map(aiPlace => ({
              aiPlace,
              source: 'google' as const,
              googlePlaceId: `place_${aiPlace.name}`,
              matchScore: 0.9,
            }));

            // Create categories if needed
            let categories: AICategory[] | undefined;
            if (useCategories && matchedCount > 0) {
              // Create 2 categories with half the places each
              const half = Math.ceil(matchedAiPlaces.length / 2);
              categories = [
                {
                  title: 'Category A',
                  placeNames: matchedAiPlaces.slice(0, half).map(p => p.name),
                },
                {
                  title: 'Category B',
                  placeNames: matchedAiPlaces.slice(half).map(p => p.name),
                },
              ];
            }

            // Apply display limits
            const result = service.applyDisplayLimits(matched, unmatchedAiPlaces, categories);

            // Verify limits
            if (result.categories && result.categories.length > 0) {
              // With categories: each category should have 2-5 places
              for (const category of result.categories) {
                if (category.places.length > MATCH_CONFIG.maxMatchesPerCategory) {
                  return false;
                }
              }
            } else {
              // Without categories: total should be at most 5
              if (result.places.length > MATCH_CONFIG.maxTotalMatches) {
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
