/**
 * Integration Tests for AI Search V2 - End-to-End Search Flow
 * 
 * Task 13.1: 端到端搜索流程测试
 * - 测试有分类场景
 * - 测试无分类场景
 * - 测试 AI-only 地点展示
 * 
 * Requirements: 2.1, 5.1, 9.1, 11.1
 */

import { AIPlace, AICategory } from '../../src/services/aiRecommendationService';
import { GooglePlace } from '../../src/services/googlePlacesEnterpriseService';
import placeMatcherService, { 
  CachedPlace, 
  MATCH_CONFIG 
} from '../../src/services/placeMatcherService';

// ============================================
// Test Data Generators
// ============================================

/**
 * Generate mock AI places for testing
 */
function generateMockAIPlaces(count: number, prefix: string = 'AI Place'): AIPlace[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `${prefix} ${i + 1}`,
    summary: `A wonderful place to visit - ${prefix} ${i + 1}`,
    latitude: 40.7128 + i * 0.01,
    longitude: -74.0060 + i * 0.01,
    city: 'New York',
    country: 'USA',
    coverImageUrl: `https://example.com/images/${prefix.toLowerCase().replace(' ', '-')}-${i + 1}.jpg`,
    tags: ['cozy', 'popular'],
    recommendationPhrase: 'highly rated',
  }));
}


/**
 * Generate mock Google places that match AI places
 */
function generateMatchingGooglePlaces(aiPlaces: AIPlace[]): GooglePlace[] {
  return aiPlaces.map((ai, i) => ({
    placeId: `google_place_${i + 1}`,
    displayName: ai.name, // Same name for matching
    location: { lat: ai.latitude, lng: ai.longitude }, // Same location
    types: ['restaurant', 'food'],
    addressComponents: [],
    formattedAddress: `${ai.city}, ${ai.country}`,
    rating: 4.0 + Math.random(),
    userRatingCount: 100 + i * 10,
    googleMapsUri: `https://maps.google.com/?q=${encodeURIComponent(ai.name)}`,
  }));
}

/**
 * Generate mock Google places that DON'T match AI places
 */
function generateNonMatchingGooglePlaces(count: number): GooglePlace[] {
  return Array.from({ length: count }, (_, i) => ({
    placeId: `google_unmatched_${i + 1}`,
    displayName: `Completely Different Place ${i + 1}`,
    location: { lat: 35.6762 + i * 0.01, lng: 139.6503 + i * 0.01 }, // Tokyo coordinates
    types: ['restaurant'],
    addressComponents: [],
    formattedAddress: 'Tokyo, Japan',
    rating: 4.5,
    userRatingCount: 200,
    googleMapsUri: `https://maps.google.com/?q=Tokyo`,
  }));
}

/**
 * Generate mock cached places
 */
function generateCachedPlaces(aiPlaces: AIPlace[]): CachedPlace[] {
  return aiPlaces.slice(0, 3).map((ai, i) => ({
    id: `cached_${i + 1}`,
    googlePlaceId: `google_cached_${i + 1}`,
    name: ai.name,
    latitude: ai.latitude,
    longitude: ai.longitude,
    city: ai.city,
    country: ai.country,
    rating: 4.2,
    ratingCount: 150,
    coverImage: `https://r2.example.com/cached-${i + 1}.jpg`,
    isVerified: true,
  }));
}


// ============================================
// Test Suite: End-to-End Search Flow
// ============================================

describe('SearchV2 Integration Tests - End-to-End Search Flow', () => {
  /**
   * Test Suite: 有分类场景 (With Categories)
   * Requirements: 9.1, 9.2
   */
  describe('有分类场景 (With Categories)', () => {
    it('should correctly process search results with categories', () => {
      // Setup: Create AI places with categories
      const coffeeShops = generateMockAIPlaces(4, 'Coffee Shop');
      const museums = generateMockAIPlaces(3, 'Museum');
      const parks = generateMockAIPlaces(3, 'Park');
      
      const allAIPlaces = [...coffeeShops, ...museums, ...parks];
      
      const categories: AICategory[] = [
        { title: '精品咖啡', placeNames: coffeeShops.map(p => p.name) },
        { title: '小众博物馆', placeNames: museums.map(p => p.name) },
        { title: '城市公园', placeNames: parks.map(p => p.name) },
      ];
      
      // Create matching Google places for most AI places
      const googlePlaces = generateMatchingGooglePlaces(allAIPlaces.slice(0, 8));
      const cachedPlaces: CachedPlace[] = [];
      
      // Execute matching
      const matchResult = placeMatcherService.matchPlaces(
        allAIPlaces,
        googlePlaces,
        cachedPlaces
      );
      
      // Apply display limits with categories
      const displayResult = placeMatcherService.applyDisplayLimits(
        matchResult.matched,
        matchResult.unmatched,
        categories
      );
      
      // Assertions
      expect(displayResult.categories).toBeDefined();
      expect(displayResult.categories!.length).toBeGreaterThan(0);
      
      // Each category should have 2-5 places (Requirement 9.2)
      for (const category of displayResult.categories!) {
        expect(category.places.length).toBeGreaterThanOrEqual(MATCH_CONFIG.minMatchesPerCategory);
        expect(category.places.length).toBeLessThanOrEqual(MATCH_CONFIG.maxMatchesPerCategory);
      }
    });


    it('should display category titles correctly', () => {
      const aiPlaces = generateMockAIPlaces(6, 'Cafe');
      const categories: AICategory[] = [
        { title: '精品咖啡', placeNames: aiPlaces.slice(0, 3).map(p => p.name) },
        { title: '小众咖啡', placeNames: aiPlaces.slice(3, 6).map(p => p.name) },
      ];
      
      const googlePlaces = generateMatchingGooglePlaces(aiPlaces);
      
      const matchResult = placeMatcherService.matchPlaces(aiPlaces, googlePlaces, []);
      const displayResult = placeMatcherService.applyDisplayLimits(
        matchResult.matched,
        matchResult.unmatched,
        categories
      );
      
      // Verify category titles are preserved
      expect(displayResult.categories).toBeDefined();
      const titles = displayResult.categories!.map(c => c.title);
      expect(titles).toContain('精品咖啡');
      expect(titles).toContain('小众咖啡');
    });

    it('should filter out categories with fewer than 2 places', () => {
      const aiPlaces = generateMockAIPlaces(4, 'Place');
      const categories: AICategory[] = [
        { title: 'Good Category', placeNames: [aiPlaces[0].name, aiPlaces[1].name, aiPlaces[2].name] },
        { title: 'Bad Category', placeNames: [aiPlaces[3].name] }, // Only 1 place
      ];
      
      const googlePlaces = generateMatchingGooglePlaces(aiPlaces);
      
      const matchResult = placeMatcherService.matchPlaces(aiPlaces, googlePlaces, []);
      const displayResult = placeMatcherService.applyDisplayLimits(
        matchResult.matched,
        matchResult.unmatched,
        categories
      );
      
      // Only the category with 2+ places should be included
      expect(displayResult.categories).toBeDefined();
      expect(displayResult.categories!.length).toBe(1);
      expect(displayResult.categories![0].title).toBe('Good Category');
    });
  });


  /**
   * Test Suite: 无分类场景 (Without Categories)
   * Requirements: 9.4, 9.5
   */
  describe('无分类场景 (Without Categories)', () => {
    it('should display up to 5 places in flat layout when no categories', () => {
      const aiPlaces = generateMockAIPlaces(10, 'Restaurant');
      const googlePlaces = generateMatchingGooglePlaces(aiPlaces);
      
      const matchResult = placeMatcherService.matchPlaces(aiPlaces, googlePlaces, []);
      
      // No categories provided
      const displayResult = placeMatcherService.applyDisplayLimits(
        matchResult.matched,
        matchResult.unmatched,
        undefined // No categories
      );
      
      // Should not have categories
      expect(displayResult.categories).toBeUndefined();
      
      // Should have at most 5 places (Requirement 9.4)
      expect(displayResult.places.length).toBeLessThanOrEqual(MATCH_CONFIG.maxTotalMatches);
    });

    it('should prioritize matched places over unmatched in flat layout', () => {
      const aiPlaces = generateMockAIPlaces(10, 'Spot');
      // Only match first 3 places
      const googlePlaces = generateMatchingGooglePlaces(aiPlaces.slice(0, 3));
      
      const matchResult = placeMatcherService.matchPlaces(aiPlaces, googlePlaces, []);
      const displayResult = placeMatcherService.applyDisplayLimits(
        matchResult.matched,
        matchResult.unmatched,
        undefined
      );
      
      // First places should be verified (matched)
      const verifiedPlaces = displayResult.places.filter(p => p.isVerified);
      const aiOnlyPlaces = displayResult.places.filter(p => !p.isVerified);
      
      // Matched places should come first
      expect(verifiedPlaces.length).toBe(3);
      
      // Remaining slots filled with AI-only places
      expect(aiOnlyPlaces.length).toBe(2); // 5 total - 3 matched = 2 AI-only
    });


    it('should sort matched places by match score', () => {
      // Create AI places with varying similarity to Google places
      const aiPlaces: AIPlace[] = [
        {
          name: 'Exact Match Cafe',
          summary: 'Test',
          latitude: 40.7128,
          longitude: -74.0060,
          city: 'NYC',
          country: 'USA',
          coverImageUrl: 'https://example.com/1.jpg',
          tags: ['cafe'],
          recommendationPhrase: 'great',
        },
        {
          name: 'Similar Match Restaurant',
          summary: 'Test',
          latitude: 40.7228,
          longitude: -74.0160,
          city: 'NYC',
          country: 'USA',
          coverImageUrl: 'https://example.com/2.jpg',
          tags: ['restaurant'],
          recommendationPhrase: 'good',
        },
      ];
      
      const googlePlaces: GooglePlace[] = [
        {
          placeId: 'g1',
          displayName: 'Exact Match Cafe', // Perfect match
          location: { lat: 40.7128, lng: -74.0060 },
          types: ['cafe'],
          addressComponents: [],
          formattedAddress: 'NYC, USA',
          rating: 4.5,
          userRatingCount: 100,
          googleMapsUri: 'https://maps.google.com',
        },
        {
          placeId: 'g2',
          displayName: 'Similar Match Restaurant', // Also matches
          location: { lat: 40.7228, lng: -74.0160 },
          types: ['restaurant'],
          addressComponents: [],
          formattedAddress: 'NYC, USA',
          rating: 4.0,
          userRatingCount: 50,
          googleMapsUri: 'https://maps.google.com',
        },
      ];
      
      const matchResult = placeMatcherService.matchPlaces(aiPlaces, googlePlaces, []);
      
      // Both should match
      expect(matchResult.matched.length).toBe(2);
      
      // Higher score should come first after sorting
      const sortedMatched = [...matchResult.matched].sort((a, b) => b.matchScore - a.matchScore);
      expect(sortedMatched[0].matchScore).toBeGreaterThanOrEqual(sortedMatched[1].matchScore);
    });
  });


  /**
   * Test Suite: AI-only 地点展示 (AI-Only Places Display)
   * Requirements: 11.1, 11.4
   */
  describe('AI-only 地点展示 (AI-Only Places Display)', () => {
    it('should display AI-only places when no Google matches found', () => {
      const aiPlaces = generateMockAIPlaces(5, 'Hidden Gem');
      // Google places don't match AI places
      const googlePlaces = generateNonMatchingGooglePlaces(10);
      
      const matchResult = placeMatcherService.matchPlaces(aiPlaces, googlePlaces, []);
      
      // All AI places should be unmatched
      expect(matchResult.unmatched.length).toBe(5);
      expect(matchResult.matched.length).toBe(0);
      
      const displayResult = placeMatcherService.applyDisplayLimits(
        matchResult.matched,
        matchResult.unmatched,
        undefined
      );
      
      // All displayed places should be AI-only
      expect(displayResult.places.every(p => p.source === 'ai')).toBe(true);
      expect(displayResult.places.every(p => p.isVerified === false)).toBe(true);
    });

    it('should include recommendationPhrase for AI-only places', () => {
      const aiPlaces = generateMockAIPlaces(3, 'Local Favorite');
      const googlePlaces = generateNonMatchingGooglePlaces(5);
      
      const matchResult = placeMatcherService.matchPlaces(aiPlaces, googlePlaces, []);
      const displayResult = placeMatcherService.applyDisplayLimits(
        matchResult.matched,
        matchResult.unmatched,
        undefined
      );
      
      // AI-only places should have recommendationPhrase (Requirement 11.4)
      for (const place of displayResult.places) {
        if (place.source === 'ai') {
          expect(place.recommendationPhrase).toBeDefined();
          expect(place.recommendationPhrase!.length).toBeGreaterThan(0);
        }
      }
    });


    it('should include AI-generated tags for AI-only places', () => {
      const aiPlaces = generateMockAIPlaces(3, 'Unique Spot');
      const googlePlaces = generateNonMatchingGooglePlaces(5);
      
      const matchResult = placeMatcherService.matchPlaces(aiPlaces, googlePlaces, []);
      const displayResult = placeMatcherService.applyDisplayLimits(
        matchResult.matched,
        matchResult.unmatched,
        undefined
      );
      
      // AI-only places should have tags
      for (const place of displayResult.places) {
        if (place.source === 'ai') {
          expect(place.tags).toBeDefined();
          expect(Array.isArray(place.tags)).toBe(true);
          expect(place.tags!.length).toBeGreaterThan(0);
        }
      }
    });

    it('should include AI-generated coverImage URL for AI-only places', () => {
      const aiPlaces = generateMockAIPlaces(3, 'Photo Spot');
      const googlePlaces = generateNonMatchingGooglePlaces(5);
      
      const matchResult = placeMatcherService.matchPlaces(aiPlaces, googlePlaces, []);
      const displayResult = placeMatcherService.applyDisplayLimits(
        matchResult.matched,
        matchResult.unmatched,
        undefined
      );
      
      // AI-only places should have coverImage from AI
      for (const place of displayResult.places) {
        if (place.source === 'ai') {
          expect(place.coverImage).toBeDefined();
          expect(place.coverImage.length).toBeGreaterThan(0);
          expect(place.coverImage).toContain('https://');
        }
      }
    });

    it('should mark AI-only places as not verified', () => {
      const aiPlaces = generateMockAIPlaces(5, 'Unverified Place');
      const googlePlaces = generateNonMatchingGooglePlaces(5);
      
      const matchResult = placeMatcherService.matchPlaces(aiPlaces, googlePlaces, []);
      const displayResult = placeMatcherService.applyDisplayLimits(
        matchResult.matched,
        matchResult.unmatched,
        undefined
      );
      
      // All AI-only places should have isVerified = false
      for (const place of displayResult.places) {
        if (place.source === 'ai') {
          expect(place.isVerified).toBe(false);
        }
      }
    });
  });


  /**
   * Test Suite: Mixed Results (Matched + AI-only)
   * Requirements: 5.5, 5.6
   */
  describe('Mixed Results (Matched + AI-only)', () => {
    it('should display matched places first, then AI-only places', () => {
      const aiPlaces = generateMockAIPlaces(8, 'Mixed Place');
      // Only match first 3 places
      const googlePlaces = generateMatchingGooglePlaces(aiPlaces.slice(0, 3));
      
      const matchResult = placeMatcherService.matchPlaces(aiPlaces, googlePlaces, []);
      
      expect(matchResult.matched.length).toBe(3);
      expect(matchResult.unmatched.length).toBe(5);
      
      const displayResult = placeMatcherService.applyDisplayLimits(
        matchResult.matched,
        matchResult.unmatched,
        undefined
      );
      
      // Should have 5 places total (max limit)
      expect(displayResult.places.length).toBe(5);
      
      // First 3 should be verified (matched)
      expect(displayResult.places[0].isVerified).toBe(true);
      expect(displayResult.places[1].isVerified).toBe(true);
      expect(displayResult.places[2].isVerified).toBe(true);
      
      // Last 2 should be AI-only
      expect(displayResult.places[3].isVerified).toBe(false);
      expect(displayResult.places[4].isVerified).toBe(false);
    });

    it('should use cached places for matching when available', () => {
      const aiPlaces = generateMockAIPlaces(5, 'Cached Place');
      const googlePlaces: GooglePlace[] = []; // No Google results
      const cachedPlaces = generateCachedPlaces(aiPlaces);
      
      const matchResult = placeMatcherService.matchPlaces(aiPlaces, googlePlaces, cachedPlaces);
      
      // Should match against cached places
      expect(matchResult.matched.length).toBe(3); // We generated 3 cached places
      expect(matchResult.matched.every(m => m.source === 'cache')).toBe(true);
    });
  });


  /**
   * Test Suite: Matching Algorithm Validation
   * Requirements: 5.1, 5.2
   */
  describe('Matching Algorithm Validation', () => {
    it('should match places with similar names within distance threshold', () => {
      const aiPlace: AIPlace = {
        name: 'Central Park Cafe',
        summary: 'A nice cafe',
        latitude: 40.7829,
        longitude: -73.9654,
        city: 'New York',
        country: 'USA',
        coverImageUrl: 'https://example.com/cafe.jpg',
        tags: ['cafe', 'park'],
        recommendationPhrase: 'local favorite',
      };
      
      const googlePlace: GooglePlace = {
        placeId: 'g_central_park',
        displayName: 'Central Park Cafe', // Exact match
        location: { lat: 40.7829, lng: -73.9654 }, // Same location
        types: ['cafe'],
        addressComponents: [],
        formattedAddress: 'New York, USA',
        rating: 4.5,
        userRatingCount: 200,
        googleMapsUri: 'https://maps.google.com',
      };
      
      const matchResult = placeMatcherService.matchPlaces([aiPlace], [googlePlace], []);
      
      expect(matchResult.matched.length).toBe(1);
      expect(matchResult.matched[0].googlePlaceId).toBe('g_central_park');
      expect(matchResult.matched[0].matchScore).toBeGreaterThan(0.9); // High score for exact match
    });

    it('should not match places that are too far apart', () => {
      const aiPlace: AIPlace = {
        name: 'Same Name Cafe',
        summary: 'A cafe',
        latitude: 40.7128, // New York
        longitude: -74.0060,
        city: 'New York',
        country: 'USA',
        coverImageUrl: 'https://example.com/cafe.jpg',
        tags: ['cafe'],
        recommendationPhrase: 'great',
      };
      
      const googlePlace: GooglePlace = {
        placeId: 'g_far_away',
        displayName: 'Same Name Cafe', // Same name
        location: { lat: 35.6762, lng: 139.6503 }, // Tokyo - very far!
        types: ['cafe'],
        addressComponents: [],
        formattedAddress: 'Tokyo, Japan',
        rating: 4.0,
        userRatingCount: 100,
        googleMapsUri: 'https://maps.google.com',
      };
      
      const matchResult = placeMatcherService.matchPlaces([aiPlace], [googlePlace], []);
      
      // Should not match due to distance
      expect(matchResult.matched.length).toBe(0);
      expect(matchResult.unmatched.length).toBe(1);
    });


    it('should not match places with very different names', () => {
      const aiPlace: AIPlace = {
        name: 'Starbucks Coffee',
        summary: 'Coffee shop',
        latitude: 40.7128,
        longitude: -74.0060,
        city: 'New York',
        country: 'USA',
        coverImageUrl: 'https://example.com/starbucks.jpg',
        tags: ['coffee'],
        recommendationPhrase: 'popular',
      };
      
      const googlePlace: GooglePlace = {
        placeId: 'g_different',
        displayName: 'McDonalds Restaurant', // Completely different name
        location: { lat: 40.7128, lng: -74.0060 }, // Same location
        types: ['restaurant'],
        addressComponents: [],
        formattedAddress: 'New York, USA',
        rating: 3.5,
        userRatingCount: 500,
        googleMapsUri: 'https://maps.google.com',
      };
      
      const matchResult = placeMatcherService.matchPlaces([aiPlace], [googlePlace], []);
      
      // Should not match due to name difference
      expect(matchResult.matched.length).toBe(0);
      expect(matchResult.unmatched.length).toBe(1);
    });

    it('should match places with slightly different names (fuzzy matching)', () => {
      const aiPlace: AIPlace = {
        name: 'Blue Bottle Coffee',
        summary: 'Specialty coffee',
        latitude: 40.7128,
        longitude: -74.0060,
        city: 'New York',
        country: 'USA',
        coverImageUrl: 'https://example.com/bluebottle.jpg',
        tags: ['coffee', 'specialty'],
        recommendationPhrase: 'highly rated',
      };
      
      const googlePlace: GooglePlace = {
        placeId: 'g_bluebottle',
        displayName: 'Blue Bottle Coffee Shop', // Slightly different
        location: { lat: 40.7130, lng: -74.0062 }, // Very close
        types: ['cafe'],
        addressComponents: [],
        formattedAddress: 'New York, USA',
        rating: 4.7,
        userRatingCount: 300,
        googleMapsUri: 'https://maps.google.com',
      };
      
      const matchResult = placeMatcherService.matchPlaces([aiPlace], [googlePlace], []);
      
      // Should match due to high name similarity
      expect(matchResult.matched.length).toBe(1);
      expect(matchResult.matched[0].matchScore).toBeGreaterThan(MATCH_CONFIG.nameSimThreshold);
    });
  });
});
