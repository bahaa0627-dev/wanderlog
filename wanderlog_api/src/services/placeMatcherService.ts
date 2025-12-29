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
  // 详情页需要的额外字段
  address?: string | null;
  phoneNumber?: string | null;
  website?: string | null;
  openingHours?: string | null;
}

/**
 * Matched place result
 */
export interface MatchedPlace {
  aiPlace: AIPlace;
  source: 'google' | 'cache';
  googlePlaceId?: string;
  cachedId?: string;
  cachedCoverImage?: string; // 缓存的封面图片
  cachedRating?: number;     // 缓存的评分
  cachedRatingCount?: number; // 缓存的评分数量
  // 详情页需要的额外字段
  cachedAddress?: string;
  cachedPhoneNumber?: string;
  cachedWebsite?: string;
  cachedOpeningHours?: string;
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
  // 详情页需要的额外字段
  address?: string;
  phoneNumber?: string;
  website?: string;
  openingHours?: string;
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
  minMatchesPerCategory: 2,     // 每个分类最少匹配数（触发 Google 的阈值）
  maxMatchesPerCategory: 5,     // 每个分类最多展示数
  minTotalMatches: 5,           // 无分类时最少匹配数（触发 Google 的阈值）
  maxTotalMatches: 5,           // 无分类时最多展示数（默认值，会被 requestedCount 覆盖）
};

/**
 * 展示优先级
 * google > cache > ai
 */
export enum PlacePriority {
  GOOGLE = 1,   // Google 新搜索的内容优先级最高
  CACHE = 2,    // Supabase 缓存次之
  AI = 3,       // AI-only 最低
}

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
 * Prefix translations mapping (for matching translated names)
 */
const PREFIX_TRANSLATIONS: Record<string, string[]> = {
  'restaurant': ['restaurante', 'ristorante', 'レストラン'],
  'museum': ['musée', 'museo', 'museu', '博物館', '美術館'],
  'square': ['plaça', 'plaza', 'piazza', 'platz', '広場'],
  'church': ['église', 'chiesa', 'iglesia', 'kirche', '教会'],
  'garden': ['jardin', 'jardín', 'giardino', 'garten', '庭園'],
  'viewpoint': ['mirador', 'aussichtspunkt', 'belvedere', '展望台'],
  'bakery': ['boulangerie', 'panadería', 'panetteria', 'bäckerei', 'パン屋'],
  'castle': ['château', 'castillo', 'castello', 'schloss', '城'],
  'park': ['parc', 'parque', 'parco', '公園'],
  'market': ['marché', 'mercado', 'mercato', 'markt', '市場'],
  'bridge': ['pont', 'puente', 'ponte', 'brücke', '橋'],
  'tower': ['tour', 'torre', 'turm', '塔'],
  'palace': ['palais', 'palacio', 'palazzo', 'palast', 'palau', '宮殿'],
  'cathedral': ['cathédrale', 'catedral', 'cattedrale', 'kathedrale', '大聖堂'],
  'station': ['gare', 'estación', 'stazione', 'bahnhof', '駅'],
  'basilica': ['basílica', 'basilique', 'basilika'],
};

/**
 * Normalize name by removing/standardizing prefixes for better matching
 */
function normalizeNameForMatching(name: string): string {
  let lower = name.toLowerCase().trim();
  
  // Remove accents
  lower = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  // Remove common prefixes like "Basílica de la", "Iglesia de", etc.
  const prefixPatterns = [
    /^(basilica|basílica)\s+(de\s+la\s+)?/i,
    /^(iglesia|chiesa|église|church)\s+(de\s+la\s+|de\s+|di\s+)?/i,
    /^(catedral|cathedral|cattedrale)\s+(de\s+la\s+|de\s+)?/i,
    /^(museo|museu|musée|museum)\s+(de\s+la\s+|de\s+|del\s+)?/i,
    /^(palacio|palazzo|palais|palace)\s+(de\s+la\s+|de\s+)?/i,
    /^(parque|parc|park)\s+(de\s+la\s+|de\s+)?/i,
    /^(plaza|plaça|piazza|square)\s+(de\s+la\s+|de\s+)?/i,
    /^(la\s+|el\s+|les\s+|los\s+|las\s+)/i,
  ];
  
  for (const pattern of prefixPatterns) {
    lower = lower.replace(pattern, '');
  }
  
  // Try to remove translated prefixes
  for (const [english, translations] of Object.entries(PREFIX_TRANSLATIONS)) {
    // Check if starts with English prefix
    if (lower.startsWith(english + ' ')) {
      return lower.substring(english.length + 1);
    }
    // Check if starts with any translation
    for (const trans of translations) {
      if (lower.startsWith(trans + ' ')) {
        return lower.substring(trans.length + 1);
      }
    }
  }
  
  return lower.trim();
}

/**
 * Check if one name contains the other (for partial matching)
 */
function containsMatch(name1: string, name2: string): boolean {
  const n1 = name1.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const n2 = name2.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return n1.includes(n2) || n2.includes(n1);
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
  
  // Check for contains match first (e.g., "Sagrada Familia" in "Basílica de la Sagrada Família")
  if (containsMatch(n1, n2)) {
    // If one contains the other, give high score
    const shorter = n1.length < n2.length ? n1 : n2;
    const longer = n1.length < n2.length ? n2 : n1;
    // Score based on how much of the longer string is covered
    return Math.max(0.85, shorter.length / longer.length);
  }
  
  // Calculate basic Levenshtein similarity
  const distance = levenshteinDistance(n1, n2);
  const maxLen = Math.max(n1.length, n2.length);
  const basicSimilarity = 1 - (distance / maxLen);
  
  // Also try matching without prefixes (for translated names)
  const n1NoPrefix = normalizeNameForMatching(name1);
  const n2NoPrefix = normalizeNameForMatching(name2);
  
  // Check contains match on normalized names
  if (containsMatch(n1NoPrefix, n2NoPrefix)) {
    const shorter = n1NoPrefix.length < n2NoPrefix.length ? n1NoPrefix : n2NoPrefix;
    const longer = n1NoPrefix.length < n2NoPrefix.length ? n2NoPrefix : n1NoPrefix;
    return Math.max(0.85, shorter.length / longer.length);
  }
  
  if (n1NoPrefix !== n1.toLowerCase().trim() || n2NoPrefix !== n2.toLowerCase().trim()) {
    const distanceNoPrefix = levenshteinDistance(n1NoPrefix, n2NoPrefix);
    const maxLenNoPrefix = Math.max(n1NoPrefix.length, n2NoPrefix.length);
    const noPrefixSimilarity = maxLenNoPrefix > 0 ? 1 - (distanceNoPrefix / maxLenNoPrefix) : 0;
    
    // Return the better match
    return Math.max(basicSimilarity, noPrefixSimilarity);
  }
  
  return basicSimilarity;
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
        // 获取缓存的图片和评分信息
        const cachedData = this.getCachedData(bestMatch.place, bestMatch.source);
        
        matched.push({
          aiPlace,
          source: bestMatch.source,
          googlePlaceId: this.getGooglePlaceId(bestMatch.place, bestMatch.source),
          cachedId: this.getCachedId(bestMatch.place, bestMatch.source),
          cachedCoverImage: cachedData.coverImage,
          cachedRating: cachedData.rating,
          cachedRatingCount: cachedData.ratingCount,
          // 详情页需要的额外字段
          cachedAddress: cachedData.address,
          cachedPhoneNumber: cachedData.phoneNumber,
          cachedWebsite: cachedData.website,
          cachedOpeningHours: cachedData.openingHours,
          matchScore: bestMatch.score,
        });
        console.log(`✅ Matched: "${aiPlace.name}" -> "${this.getPlaceName(bestMatch.place, bestMatch.source)}" (score: ${bestMatch.score.toFixed(2)}, coverImage: ${cachedData.coverImage ? 'YES' : 'NO'})`);
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
   * Get cached data (coverImage, rating, ratingCount, address, etc.) based on source type
   */
  private getCachedData(place: GooglePlace | CachedPlace, source: 'google' | 'cache'): {
    coverImage?: string;
    rating?: number;
    ratingCount?: number;
    address?: string;
    phoneNumber?: string;
    website?: string;
    openingHours?: string;
  } {
    if (source === 'cache') {
      const cached = place as CachedPlace;
      console.log(`📷 [PlaceMatcher] Cache data for "${cached.name}": coverImage=${cached.coverImage ? 'YES' : 'NO'}, rating=${cached.rating}`);
      return {
        coverImage: cached.coverImage || undefined,
        rating: cached.rating || undefined,
        ratingCount: cached.ratingCount || undefined,
        address: cached.address || undefined,
        phoneNumber: cached.phoneNumber || undefined,
        website: cached.website || undefined,
        openingHours: cached.openingHours || undefined,
      };
    }
    // Google places don't have cached data yet
    return {};
  }

  /**
   * Check if Google API call is needed based on match results
   * 
   * 触发条件：
   * - 有分类时：任一分类匹配数 < 2
   * - 无分类时：总匹配数 < 5
   * 
   * @param matched - 已匹配的地点
   * @param categories - AI 分类（可选）
   * @returns 是否需要调用 Google API
   */
  checkNeedsGoogleAPI(
    matched: MatchedPlace[],
    categories?: AICategory[]
  ): boolean {
    if (categories && categories.length > 0) {
      // 有分类时：检查每个分类是否有足够的匹配
      for (const category of categories) {
        const categoryMatchCount = category.placeNames.filter(name =>
          matched.some(m => m.aiPlace.name.toLowerCase() === name.toLowerCase())
        ).length;
        
        if (categoryMatchCount < MATCH_CONFIG.minMatchesPerCategory) {
          console.log(`📊 [PlaceMatcher] Category "${category.title}" has ${categoryMatchCount} matches, need ${MATCH_CONFIG.minMatchesPerCategory}`);
          return true;
        }
      }
      return false;
    } else {
      // 无分类时：检查总匹配数
      const needsMore = matched.length < MATCH_CONFIG.minTotalMatches;
      console.log(`📊 [PlaceMatcher] Total matches: ${matched.length}, need ${MATCH_CONFIG.minTotalMatches}, needsGoogle: ${needsMore}`);
      return needsMore;
    }
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
   * @param requestedCount - 用户请求的数量（控制最终展示数量，最大20）
   * @returns Display result with limited places
   * 
   * Requirements: 9.2, 9.4
   */
  applyDisplayLimits(
    matched: MatchedPlace[],
    unmatched: AIPlace[],
    categories?: AICategory[],
    requestedCount: number = 5
  ): DisplayResult {
    console.log(`📊 [PlaceMatcher] Applying display limits: requestedCount=${requestedCount}, hasCategories=${!!categories}`);
    
    // 分类策略：
    // - requestedCount >= 5: 分类（5个可以分成2+3）
    // - requestedCount <= 4: 不分类（不够分成2个分类，每个最少2个）
    if (requestedCount >= 5 && categories && categories.length > 0) {
      return this.applyDisplayLimitsWithCategories(matched, unmatched, categories, requestedCount);
    } else {
      return this.applyDisplayLimitsFlat(matched, unmatched, requestedCount);
    }
  }

  /**
   * Apply display limits with categories
   * 展示优先级：Google > Cache > AI
   * 
   * 策略：
   * - 每个分类 2-5 个地点
   * - 数量多时尽量每个分类多放，减少分类数量
   * - 总数量 = requestedCount
   * 
   * Requirements: 9.2
   */
  private applyDisplayLimitsWithCategories(
    matched: MatchedPlace[],
    unmatched: AIPlace[],
    categories: AICategory[],
    requestedCount: number
  ): DisplayResult {
    const categoryGroups: CategoryGroup[] = [];
    let totalPlacesAdded = 0;
    
    // 计算理想的分类数量和每个分类的地点数
    // 目标：尽量每个分类多放，减少分类数量
    // 每个分类最多5个，最少2个
    const idealPlacesPerCategory = Math.min(5, Math.max(2, Math.ceil(requestedCount / 3)));
    const idealCategoryCount = Math.ceil(requestedCount / idealPlacesPerCategory);
    
    console.log(`📊 [PlaceMatcher] Category strategy: ${idealCategoryCount} categories, ~${idealPlacesPerCategory} places each`);
    
    // 只使用前 idealCategoryCount 个分类
    const categoriesToUse = categories.slice(0, idealCategoryCount);
    
    for (let catIndex = 0; catIndex < categoriesToUse.length; catIndex++) {
      const category = categoriesToUse[catIndex];
      if (totalPlacesAdded >= requestedCount) break;
      
      // 收集该分类下的所有地点
      const categoryMatchedPlaces: Array<{ place: PlaceResult; priority: number; score: number }> = [];
      const categoryAIOnlyPlaces: PlaceResult[] = [];
      
      for (const placeName of category.placeNames) {
        // 先找匹配的
        const matchedPlace = matched.find(
          m => m.aiPlace.name.toLowerCase() === placeName.toLowerCase()
        );
        
        if (matchedPlace) {
          const priority = matchedPlace.source === 'google' ? 1 : 2; // google=1, cache=2
          categoryMatchedPlaces.push({
            place: this.createPlaceResult(matchedPlace),
            priority,
            score: matchedPlace.matchScore,
          });
        } else {
          // 找 AI-only
          const unmatchedPlace = unmatched.find(
            u => u.name.toLowerCase() === placeName.toLowerCase()
          );
          if (unmatchedPlace) {
            categoryAIOnlyPlaces.push(this.createAIOnlyPlaceResult(unmatchedPlace));
          }
        }
      }
      
      // 按优先级排序匹配的地点：google > cache，同优先级按分数
      categoryMatchedPlaces.sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return b.score - a.score;
      });
      
      // 计算这个分类应该展示多少地点
      const remainingSlots = requestedCount - totalPlacesAdded;
      const remainingCategories = categoriesToUse.length - catIndex;
      // 平均分配剩余的地点，但每个分类最多5个，最少2个
      const targetForThisCategory = Math.min(
        MATCH_CONFIG.maxMatchesPerCategory,
        Math.max(MATCH_CONFIG.minMatchesPerCategory, Math.ceil(remainingSlots / remainingCategories))
      );
      
      // 组合最终列表：先匹配的，再 AI-only
      const categoryPlaces: PlaceResult[] = [];
      
      for (const { place } of categoryMatchedPlaces) {
        if (categoryPlaces.length >= targetForThisCategory) break;
        categoryPlaces.push(place);
      }
      
      for (const place of categoryAIOnlyPlaces) {
        if (categoryPlaces.length >= targetForThisCategory) break;
        categoryPlaces.push(place);
      }
      
      // Only add category if it has at least 2 places
      if (categoryPlaces.length >= MATCH_CONFIG.minMatchesPerCategory) {
        categoryGroups.push({
          title: category.title,
          places: categoryPlaces,
        });
        totalPlacesAdded += categoryPlaces.length;
        console.log(`📊 [PlaceMatcher] Category "${category.title}": ${categoryPlaces.length} places`);
      }
    }
    
    // Flatten all places for the places array
    const allPlaces = categoryGroups.flatMap(cg => cg.places);
    console.log(`📊 [PlaceMatcher] Total displayed: ${allPlaces.length}/${requestedCount} requested, ${categoryGroups.length} categories`);
    
    return {
      categories: categoryGroups.length > 0 ? categoryGroups : undefined,
      places: allPlaces,
    };
  }

  /**
   * Apply display limits without categories (flat layout)
   * 展示优先级：Google > Cache > AI
   * 
   * Requirements: 9.4
   */
  private applyDisplayLimitsFlat(
    matched: MatchedPlace[],
    unmatched: AIPlace[],
    requestedCount: number
  ): DisplayResult {
    const places: PlaceResult[] = [];
    const maxPlaces = requestedCount; // 使用用户请求的数量
    
    // 按优先级排序：google > cache > ai
    // 同优先级内按 matchScore 排序
    const sortedMatched = [...matched].sort((a, b) => {
      // 优先级：google = 1, cache = 2
      const priorityA = a.source === 'google' ? 1 : 2;
      const priorityB = b.source === 'google' ? 1 : 2;
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB; // 优先级小的排前面
      }
      return b.matchScore - a.matchScore; // 同优先级按分数降序
    });
    
    // 添加匹配的地点（已按 google > cache 排序）
    for (const m of sortedMatched) {
      if (places.length >= maxPlaces) break;
      places.push(this.createPlaceResult(m));
    }
    
    // 如果还不够，添加 AI-only 地点
    for (const u of unmatched) {
      if (places.length >= maxPlaces) break;
      places.push(this.createAIOnlyPlaceResult(u));
    }
    
    console.log(`📊 [PlaceMatcher] Flat display: ${places.length}/${requestedCount} requested (${places.filter(p => p.source === 'google').length} google, ${places.filter(p => p.source === 'cache').length} cache, ${places.filter(p => p.source === 'ai').length} ai)`);
    
    return { places };
  }

  /**
   * Create PlaceResult from matched place
   * 优先使用缓存的图片和评分，如果没有则使用 AI 返回的数据
   */
  private createPlaceResult(matched: MatchedPlace): PlaceResult {
    const coverImage = matched.cachedCoverImage || matched.aiPlace.coverImageUrl;
    console.log(`🖼️ [PlaceMatcher] createPlaceResult for "${matched.aiPlace.name}": cachedCoverImage=${matched.cachedCoverImage ? 'YES' : 'NO'}, aiCoverImage=${matched.aiPlace.coverImageUrl ? 'YES' : 'NO'}, final=${coverImage ? 'YES' : 'NO'}`);
    
    return {
      id: matched.cachedId,
      googlePlaceId: matched.googlePlaceId,
      name: matched.aiPlace.name,
      summary: matched.aiPlace.summary,
      // 优先使用缓存的图片
      coverImage: coverImage,
      latitude: matched.aiPlace.latitude,
      longitude: matched.aiPlace.longitude,
      city: matched.aiPlace.city,
      country: matched.aiPlace.country,
      // 优先使用缓存的评分
      rating: matched.cachedRating,
      ratingCount: matched.cachedRatingCount,
      tags: matched.aiPlace.tags,
      isVerified: true,
      source: matched.source,
      // 详情页需要的额外字段
      address: matched.cachedAddress,
      phoneNumber: matched.cachedPhoneNumber,
      website: matched.cachedWebsite,
      openingHours: matched.cachedOpeningHours,
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
