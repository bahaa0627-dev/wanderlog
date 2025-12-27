/**
 * Place Matcher Service
 * 
 * 负责将 AI 推荐地点与数据库/Google 结果进行匹配
 * 使用名称相似度 (Levenshtein) 和地理距离 (Haversine) 算法
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 9.2, 9.4
 */

import { AIPlace, AICategory } from './aiRecommendationService';
import { GooglePlace } from './googlePlacesEnterpriseService';

// ============================================
// Types and Interfaces
// ============================================

/**
 * Cached place from database
 */
export interface CachedPlace {
  id: string;
  googlePlaceId?: string | null;
  name: string;
  latitude: number;
  longitude: number;
  city?: string | null;
  country?: string | null;
  rating?: number | null;
  ratingCount?: number | null;
  coverImage?: string | null;
  isVerified: boolean;
}

/**
 * Matched place result
 */
export interface MatchedPlace {
  aiPlace: AIPlace;
  source: 'google' | 'cache';
  googlePlaceId?: string;
  cachedId?: string;
  matchScore: number;
}

/**
 * Match result containing matched and unmatched places
 */
export interface MatchResult {
  matched: MatchedPlace[];
  unmatched: AIPlace[];
  needsSupplement: boolean;
}

/**
 * Final place result for display
 */
export interface PlaceResult {
  id?: string;
  googlePlaceId?: string;
  name: string;
  summary: string;
  coverImage: string;
  latitude: number;
  longitude: number;
  city?: string;
  country?: string;
  rating?: number;
  ratingCount?: number;
  recommendationPhrase?: string;
  tags?: string[];
  isVerified: boolean;
  source: 'google' | 'cache' | 'ai';
}

/**
 * Category group for display
 */
export interface CategoryGroup {
  title: string;
  places: PlaceResult[];
}

/**
 * Display result with optional categories
 */
export interface DisplayResult {
  categories?: CategoryGroup[];
  places: PlaceResult[];
}

// ============================================
// Matching Configuration
// ============================================

/**
 * Matching algorithm configuration
 * Requirements: 5.1, 5.2, 9.2, 9.4
 */
export const MATCH_CONFIG = {
  nameSimThreshold: 0.7,        // 名称相似度阈值 (70%)
  maxDistanceMeters: 500,       // 最大距离阈值 (500m)
  minMatchesPerCategory: 2,     // 每个分类最少匹配数
  maxMatchesPerCategory: 5,     // 每个分类最多展示数
  minTotalMatches: 5,           // 无分类时最少匹配数
  maxTotalMatches: 5,           // 无分类时最多展示数
};

// ============================================
// Distance Calculation (Haversine Formula)
// ============================================

/**
 * Calculate distance between two coordinates using Haversine formula
 * 
 * @param lat1 - Latitude of first point
 * @param lon1 - Longitude of first point
 * @param lat2 - Latitude of second point
 * @param lon2 - Longitude of second point
 * @returns Distance in meters
 * 
 * Requirements: 5.2
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  
  const toRad = (deg: number) => deg * (Math.PI / 180);
  
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
}

// ============================================
// Name Similarity (Levenshtein Distance)
// ============================================

/**
 * Calculate Levenshtein distance between two strings
 * 
 * @param str1 - First string
 * @param str2 - Second string
 * @returns Edit distance (number of operations needed)
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  
  // Create distance matrix
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  // Initialize first row and column
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  // Fill the matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],     // deletion
          dp[i][j - 1],     // insertion
          dp[i - 1][j - 1]  // substitution
        );
      }
    }
  }
  
  return dp[m][n];
}

/**
 * Calculate normalized name similarity (0-1)
 * 
 * @param name1 - First name
 * @param name2 - Second name
 * @returns Similarity score (0-1, where 1 is identical)
 * 
 * Requirements: 5.1
 */
export function calculateNameSimilarity(name1: string, name2: string): number {
  // Normalize names: lowercase, trim, remove extra spaces
  const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
  
  const n1 = normalize(name1);
  const n2 = normalize(name2);
  
  // Handle empty strings
  if (n1.length === 0 && n2.length === 0) return 1;
  if (n1.length === 0 || n2.length === 0) return 0;
  
  // Calculate Levenshtein distance
  const distance = levenshteinDistance(n1, n2);
  
  // Normalize to similarity score (0-1)
  const maxLen = Math.max(n1.length, n2.length);
  const similarity = 1 - (distance / maxLen);
  
  return similarity;
}

// ============================================
// Place Matcher Service Class
// ============================================

class PlaceMatcherService {
  /**
   * Match AI places against Google and cached places
   * 
   * @param aiPlaces - AI-generated place recommendations
   * @param googlePlaces - Places from Google Text Search
   * @param cachedPlaces - Places from database cache
   * @returns Match result with matched and unmatched places
   * 
   * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
   */
  matchPlaces(
    aiPlaces: AIPlace[],
    googlePlaces: GooglePlace[],
    cachedPlaces: CachedPlace[]
  ): MatchResult {
    const matched: MatchedPlace[] = [];
    const unmatched: AIPlace[] = [];
    
    // Combine Google and cached places for matching
    const allVerifiedPlaces: Array<{
      place: GooglePlace | CachedPlace;
      source: 'google' | 'cache';
    }> = [
      ...googlePlaces.map(p => ({ place: p, source: 'google' as const })),
      ...cachedPlaces.map(p => ({ place: p, source: 'cache' as const })),
    ];
    
    console.log(`🔍 [PlaceMatcher] Matching ${aiPlaces.length} AI places against ${googlePlaces.length} Google + ${cachedPlaces.length} cached places`);
    
    for (const aiPlace of aiPlaces) {
      let bestMatch: {
        place: GooglePlace | CachedPlace;
        score: number;
        source: 'google' | 'cache';
      } | null = null;
      
      for (const { place, source } of allVerifiedPlaces) {
        // Get place name and coordinates based on source
        const placeName = this.getPlaceName(place, source);
        const placeCoords = this.getPlaceCoordinates(place, source);
        
        // Calculate name similarity
        const nameSim = calculateNameSimilarity(aiPlace.name, placeName);
        
        // Calculate geographic distance
        const distance = calculateDistance(
          aiPlace.latitude,
          aiPlace.longitude,
          placeCoords.lat,
          placeCoords.lng
        );
        
        // Check if within distance threshold
        const withinDistance = distance <= MATCH_CONFIG.maxDistanceMeters;
        
        // Calculate combined score (70% name, 30% distance)
        const distanceScore = withinDistance ? 1 : 0;
        const score = nameSim * 0.7 + distanceScore * 0.3;
        
        // Check if meets threshold and is better than current best
        if (nameSim >= MATCH_CONFIG.nameSimThreshold && 
            withinDistance &&
            (!bestMatch || score > bestMatch.score)) {
          bestMatch = { place, score, source };
        }
      }
      
      if (bestMatch) {
        matched.push({
          aiPlace,
          source: bestMatch.source,
          googlePlaceId: this.getGooglePlaceId(bestMatch.place, bestMatch.source),
          cachedId: this.getCachedId(bestMatch.place, bestMatch.source),
          matchScore: bestMatch.score,
        });
        console.log(`✅ Matched: "${aiPlace.name}" -> "${this.getPlaceName(bestMatch.place, bestMatch.source)}" (score: ${bestMatch.score.toFixed(2)})`);
      } else {
        unmatched.push(aiPlace);
        console.log(`❌ Unmatched: "${aiPlace.name}"`);
      }
    }
    
    // Determine if supplement is needed
    const needsSupplement = this.checkNeedsSupplement(matched, aiPlaces);
    
    console.log(`📊 [PlaceMatcher] Result: ${matched.length} matched, ${unmatched.length} unmatched, needsSupplement: ${needsSupplement}`);
    
    return { matched, unmatched, needsSupplement };
  }

  /**
   * Get place name based on source type
   */
  private getPlaceName(place: GooglePlace | CachedPlace, source: 'google' | 'cache'): string {
    if (source === 'google') {
      return (place as GooglePlace).displayName;
    }
    return (place as CachedPlace).name;
  }

  /**
   * Get place coordinates based on source type
   */
  private getPlaceCoordinates(place: GooglePlace | CachedPlace, source: 'google' | 'cache'): { lat: number; lng: number } {
    if (source === 'google') {
      return (place as GooglePlace).location;
    }
    const cached = place as CachedPlace;
    return { lat: cached.latitude, lng: cached.longitude };
  }

  /**
   * Get Google Place ID based on source type
   */
  private getGooglePlaceId(place: GooglePlace | CachedPlace, source: 'google' | 'cache'): string | undefined {
    if (source === 'google') {
      return (place as GooglePlace).placeId;
    }
    return (place as CachedPlace).googlePlaceId || undefined;
  }

  /**
   * Get cached ID based on source type
   */
  private getCachedId(place: GooglePlace | CachedPlace, source: 'google' | 'cache'): string | undefined {
    if (source === 'cache') {
      return (place as CachedPlace).id;
    }
    return undefined;
  }

  /**
   * Check if AI content supplement is needed
   * 
   * Requirements: 5.3, 5.4
   */
  private checkNeedsSupplement(matched: MatchedPlace[], aiPlaces: AIPlace[]): boolean {
    // Check if AI places have categories
    const hasCategories = aiPlaces.some(p => (p as any).category);
    
    if (hasCategories) {
      // With categories: check if each category has 2+ matches
      const categoryMatches = new Map<string, number>();
      for (const m of matched) {
        const cat = (m.aiPlace as any).category;
        if (cat) {
          categoryMatches.set(cat, (categoryMatches.get(cat) || 0) + 1);
        }
      }
      return Array.from(categoryMatches.values()).some(
        count => count < MATCH_CONFIG.minMatchesPerCategory
      );
    } else {
      // Without categories: check if total matches >= 5
      return matched.length < MATCH_CONFIG.minTotalMatches;
    }
  }

  /**
   * Apply display count limits to matched places
   * 
   * @param matched - Matched places
   * @param unmatched - Unmatched AI places
   * @param categories - AI categories (optional)
   * @returns Display result with limited places
   * 
   * Requirements: 9.2, 9.4
   */
  applyDisplayLimits(
    matched: MatchedPlace[],
    unmatched: AIPlace[],
    categories?: AICategory[]
  ): DisplayResult {
    if (categories && categories.length > 0) {
      // With categories: 2-5 places per category
      return this.applyDisplayLimitsWithCategories(matched, unmatched, categories);
    } else {
      // Without categories: max 5 places total
      return this.applyDisplayLimitsFlat(matched, unmatched);
    }
  }

  /**
   * Apply display limits with categories
   * 
   * Requirements: 9.2
   */
  private applyDisplayLimitsWithCategories(
    matched: MatchedPlace[],
    unmatched: AIPlace[],
    categories: AICategory[]
  ): DisplayResult {
    const categoryGroups: CategoryGroup[] = [];
    
    for (const category of categories) {
      const categoryPlaces: PlaceResult[] = [];
      
      // Find matched places for this category
      for (const placeName of category.placeNames) {
        // First try to find in matched
        const matchedPlace = matched.find(
          m => m.aiPlace.name.toLowerCase() === placeName.toLowerCase()
        );
        
        if (matchedPlace) {
          categoryPlaces.push(this.createPlaceResult(matchedPlace));
        } else {
          // Try to find in unmatched
          const unmatchedPlace = unmatched.find(
            u => u.name.toLowerCase() === placeName.toLowerCase()
          );
          if (unmatchedPlace) {
            categoryPlaces.push(this.createAIOnlyPlaceResult(unmatchedPlace));
          }
        }
        
        // Stop if we have enough places for this category
        if (categoryPlaces.length >= MATCH_CONFIG.maxMatchesPerCategory) {
          break;
        }
      }
      
      // Only add category if it has at least 2 places
      if (categoryPlaces.length >= MATCH_CONFIG.minMatchesPerCategory) {
        categoryGroups.push({
          title: category.title,
          places: categoryPlaces,
        });
      }
    }
    
    // Flatten all places for the places array
    const allPlaces = categoryGroups.flatMap(cg => cg.places);
    
    return {
      categories: categoryGroups.length > 0 ? categoryGroups : undefined,
      places: allPlaces,
    };
  }

  /**
   * Apply display limits without categories (flat layout)
   * 
   * Requirements: 9.4
   */
  private applyDisplayLimitsFlat(
    matched: MatchedPlace[],
    unmatched: AIPlace[]
  ): DisplayResult {
    const places: PlaceResult[] = [];
    
    // Add matched places first (sorted by match score)
    const sortedMatched = [...matched].sort((a, b) => b.matchScore - a.matchScore);
    
    for (const m of sortedMatched) {
      if (places.length >= MATCH_CONFIG.maxTotalMatches) break;
      places.push(this.createPlaceResult(m));
    }
    
    // Add unmatched AI places if needed
    for (const u of unmatched) {
      if (places.length >= MATCH_CONFIG.maxTotalMatches) break;
      places.push(this.createAIOnlyPlaceResult(u));
    }
    
    return { places };
  }

  /**
   * Create PlaceResult from matched place
   */
  private createPlaceResult(matched: MatchedPlace): PlaceResult {
    return {
      id: matched.cachedId,
      googlePlaceId: matched.googlePlaceId,
      name: matched.aiPlace.name,
      summary: matched.aiPlace.summary,
      coverImage: matched.aiPlace.coverImageUrl,
      latitude: matched.aiPlace.latitude,
      longitude: matched.aiPlace.longitude,
      city: matched.aiPlace.city,
      country: matched.aiPlace.country,
      tags: matched.aiPlace.tags,
      isVerified: true,
      source: matched.source,
    };
  }

  /**
   * Create PlaceResult from AI-only place
   */
  private createAIOnlyPlaceResult(aiPlace: AIPlace): PlaceResult {
    return {
      name: aiPlace.name,
      summary: aiPlace.summary,
      coverImage: aiPlace.coverImageUrl,
      latitude: aiPlace.latitude,
      longitude: aiPlace.longitude,
      city: aiPlace.city,
      country: aiPlace.country,
      recommendationPhrase: aiPlace.recommendationPhrase,
      tags: aiPlace.tags,
      isVerified: false,
      source: 'ai',
    };
  }

  /**
   * Enrich place results with database data
   * 
   * @param places - Place results to enrich
   * @param cachedPlaces - Cached places from database
   * @returns Enriched place results
   */
  enrichWithDatabaseData(
    places: PlaceResult[],
    cachedPlaces: CachedPlace[]
  ): PlaceResult[] {
    const cachedMap = new Map<string, CachedPlace>();
    
    // Build lookup maps
    for (const cached of cachedPlaces) {
      if (cached.googlePlaceId) {
        cachedMap.set(cached.googlePlaceId, cached);
      }
      cachedMap.set(cached.id, cached);
    }
    
    return places.map(place => {
      // Try to find cached data
      let cached: CachedPlace | undefined;
      if (place.googlePlaceId) {
        cached = cachedMap.get(place.googlePlaceId);
      }
      if (!cached && place.id) {
        cached = cachedMap.get(place.id);
      }
      
      if (cached) {
        return {
          ...place,
          id: cached.id,
          rating: cached.rating || place.rating,
          ratingCount: cached.ratingCount || place.ratingCount,
          coverImage: cached.coverImage || place.coverImage,
        };
      }
      
      return place;
    });
  }
}

// Export singleton instance
export const placeMatcherService = new PlaceMatcherService();
export default placeMatcherService;
export { PlaceMatcherService };
