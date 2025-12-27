/**
 * Search V2 Controller
 * 
 * Implements the AI Search V2 parallel pipeline:
 * - GPT-4o-mini (via Kouri) for AI recommendations
 * - Google Text Search Enterprise for verified places
 * - Parallel execution with Promise.allSettled()
 * - Place matching and summary generation
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 5.1, 6.1, 14.1
 */

import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import prisma from '../config/database';

// Import services
import aiRecommendationService, { 
  AIRecommendationResult, 
  AIPlace, 
  PlaceBasicInfo
} from '../services/aiRecommendationService';
import googlePlacesEnterpriseService, { GooglePlace } from '../services/googlePlacesEnterpriseService';
import placeMatcherService, { 
  CachedPlace, 
  PlaceResult, 
  CategoryGroup,
  MatchResult 
} from '../services/placeMatcherService';
import quotaService, { QuotaExceededError } from '../services/quotaService';

// ============================================
// Types and Interfaces
// ============================================

/**
 * Search V2 Request body
 */
interface SearchV2Request {
  query: string;
  userId?: string;
  userLat?: number;
  userLng?: number;
}

/**
 * Search V2 Response
 */
interface SearchV2Response {
  success: boolean;
  acknowledgment: string;
  categories?: CategoryGroup[];
  places: PlaceResult[];
  overallSummary: string;
  quotaRemaining: number;
  stage: 'analyzing' | 'searching' | 'summarizing' | 'complete';
  error?: string;
}

// ============================================
// Timeout Configuration
// ============================================

/**
 * Timeout configuration for parallel calls
 * Requirements: 2.2, 2.3
 */
const TIMEOUT_CONFIG = {
  AI_TIMEOUT_MS: 10000,      // 10 seconds for AI call
  GOOGLE_TIMEOUT_MS: 5000,   // 5 seconds for Google call
};

// ============================================
// Helper Functions
// ============================================

/**
 * Create a promise that rejects after a timeout
 */
function createTimeout<T>(ms: number, name: string): Promise<T> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`${name} timeout after ${ms}ms`));
    }, ms);
  });
}

/**
 * Wrap a promise with a timeout
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  name: string
): Promise<T> {
  return Promise.race([
    promise,
    createTimeout<T>(timeoutMs, name),
  ]);
}

/**
 * Get cached places from database for matching
 */
async function getCachedPlaces(query: string): Promise<CachedPlace[]> {
  try {
    // Search for places that might match the query
    // Use a simple text search on name and city
    const places = await prisma.place.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { city: { contains: query, mode: 'insensitive' } },
        ],
        isVerified: true,
      },
      take: 50,
      select: {
        id: true,
        googlePlaceId: true,
        name: true,
        latitude: true,
        longitude: true,
        city: true,
        country: true,
        rating: true,
        ratingCount: true,
        coverImage: true,
        isVerified: true,
      },
    });

    return places.map(p => ({
      id: p.id,
      googlePlaceId: p.googlePlaceId,
      name: p.name,
      latitude: p.latitude,
      longitude: p.longitude,
      city: p.city,
      country: p.country,
      rating: p.rating,
      ratingCount: p.ratingCount,
      coverImage: p.coverImage,
      isVerified: p.isVerified ?? false,
    }));
  } catch (error) {
    logger.error('[SearchV2] Error fetching cached places:', error);
    return [];
  }
}

/**
 * Save AI-only places to database
 * Requirements: 14.1, 14.7
 */
async function saveAIPlacesToDatabase(aiPlaces: AIPlace[]): Promise<void> {
  for (const place of aiPlaces) {
    try {
      // Check if place already exists by name and coordinates
      const existing = await prisma.place.findFirst({
        where: {
          name: place.name,
          latitude: { gte: place.latitude - 0.001, lte: place.latitude + 0.001 },
          longitude: { gte: place.longitude - 0.001, lte: place.longitude + 0.001 },
        },
      });

      if (!existing) {
        await prisma.place.create({
          data: {
            name: place.name,
            aiDescription: place.summary,
            aiTags: place.tags,
            coverImage: place.coverImageUrl,
            latitude: place.latitude,
            longitude: place.longitude,
            city: place.city,
            country: place.country,
            isVerified: false,
            source: 'ai_search',
          },
        });
        logger.info(`[SearchV2] Saved AI place: ${place.name}`);
      }
    } catch (error) {
      logger.error(`[SearchV2] Error saving AI place ${place.name}:`, error);
    }
  }
}

/**
 * Enrich place results with database data (rating, coverImage, etc.)
 */
async function enrichPlaceResults(
  places: PlaceResult[],
  googlePlaces: GooglePlace[]
): Promise<PlaceResult[]> {
  // Build a map of Google places for quick lookup
  const googlePlaceMap = new Map<string, GooglePlace>();
  for (const gp of googlePlaces) {
    googlePlaceMap.set(gp.placeId, gp);
  }

  // Fetch database records for matched places
  const googlePlaceIds = places
    .filter(p => p.googlePlaceId)
    .map(p => p.googlePlaceId!);

  let dbPlaces: any[] = [];
  if (googlePlaceIds.length > 0) {
    dbPlaces = await prisma.place.findMany({
      where: {
        googlePlaceId: { in: googlePlaceIds },
      },
    });
  }

  const dbPlaceMap = new Map<string, any>();
  for (const dbp of dbPlaces) {
    if (dbp.googlePlaceId) {
      dbPlaceMap.set(dbp.googlePlaceId, dbp);
    }
  }

  // Enrich each place
  return places.map(place => {
    const enriched = { ...place };

    // Try to get data from database first
    if (place.googlePlaceId) {
      const dbPlace = dbPlaceMap.get(place.googlePlaceId);
      if (dbPlace) {
        enriched.id = dbPlace.id;
        enriched.rating = dbPlace.rating ?? enriched.rating;
        enriched.ratingCount = dbPlace.ratingCount ?? enriched.ratingCount;
        if (dbPlace.coverImage) {
          enriched.coverImage = dbPlace.coverImage;
        }
      }

      // Also try Google place data
      const googlePlace = googlePlaceMap.get(place.googlePlaceId);
      if (googlePlace) {
        enriched.rating = enriched.rating ?? googlePlace.rating;
        enriched.ratingCount = enriched.ratingCount ?? googlePlace.userRatingCount;
      }
    }

    return enriched;
  });
}

// ============================================
// Main Controller Function
// ============================================

/**
 * Search V2 - Parallel Pipeline
 * POST /api/places/ai/search-v2
 * 
 * Flow:
 * 1. Check quota
 * 2. Parallel call: AI recommendations + Google Text Search
 * 3. Match AI places against Google + cached places
 * 4. Generate summaries
 * 5. Save AI-only places to database
 * 6. Return results
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 5.1, 6.1, 14.1
 */
export const searchV2 = async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { query, userId } = req.body as SearchV2Request;
    // userLat and userLng are reserved for future location-based filtering
    // const { userLat, userLng } = req.body as SearchV2Request;

    // Validate request
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'query is required',
        acknowledgment: '',
        places: [],
        overallSummary: '',
        quotaRemaining: 0,
        stage: 'complete',
      } as SearchV2Response);
    }

    logger.info(`[SearchV2] Starting search for: "${query}"`);

    // Step 1: Check quota (if userId provided)
    // Requirements: 13.1, 13.2
    let quotaRemaining = 10; // Default for anonymous users
    if (userId) {
      try {
        const canSearch = await quotaService.canSearch(userId);
        if (!canSearch) {
          quotaRemaining = 0;
          return res.status(429).json({
            success: false,
            error: 'Daily search quota exceeded. Please try again tomorrow.',
            acknowledgment: '',
            places: [],
            overallSummary: '',
            quotaRemaining: 0,
            stage: 'complete',
          } as SearchV2Response);
        }
        quotaRemaining = await quotaService.getRemainingQuota(userId);
      } catch (error) {
        if (error instanceof QuotaExceededError) {
          return res.status(429).json({
            success: false,
            error: error.message,
            acknowledgment: '',
            places: [],
            overallSummary: '',
            quotaRemaining: 0,
            stage: 'complete',
          } as SearchV2Response);
        }
        logger.error('[SearchV2] Quota check error:', error);
        // Continue on quota check error (fail open)
      }
    }

    // Step 2: Parallel calls - AI + Google + Cache
    // Requirements: 2.1, 2.4
    logger.info('[SearchV2] Starting parallel calls...');

    const [aiResult, googleResult, cachedPlaces] = await Promise.allSettled([
      // AI Recommendations with timeout
      withTimeout(
        aiRecommendationService.getRecommendations(query),
        TIMEOUT_CONFIG.AI_TIMEOUT_MS,
        'AI Recommendations'
      ),
      // Google Text Search with timeout
      withTimeout(
        googlePlacesEnterpriseService.textSearchEnterprise(query),
        TIMEOUT_CONFIG.GOOGLE_TIMEOUT_MS,
        'Google Text Search'
      ),
      // Cached places (no timeout, fast local query)
      getCachedPlaces(query),
    ]);

    // Process results
    let aiRecommendations: AIRecommendationResult | null = null;
    let googlePlaces: GooglePlace[] = [];
    let cached: CachedPlace[] = [];

    // Handle AI result
    if (aiResult.status === 'fulfilled') {
      aiRecommendations = aiResult.value;
      logger.info(`[SearchV2] AI returned ${aiRecommendations.places.length} places`);
    } else {
      logger.warn('[SearchV2] AI call failed:', aiResult.reason);
    }

    // Handle Google result
    if (googleResult.status === 'fulfilled') {
      googlePlaces = googleResult.value;
      logger.info(`[SearchV2] Google returned ${googlePlaces.length} places`);
      
      // Sync Google places to database (async, don't wait)
      googlePlacesEnterpriseService.syncPlacesToDatabase(googlePlaces).catch(err => {
        logger.error('[SearchV2] Error syncing Google places:', err);
      });
    } else {
      logger.warn('[SearchV2] Google call failed:', googleResult.reason);
    }

    // Handle cached result
    if (cachedPlaces.status === 'fulfilled') {
      cached = cachedPlaces.value;
      logger.info(`[SearchV2] Found ${cached.length} cached places`);
    }

    // Step 3: Handle partial/complete failure
    // Requirements: 2.5
    if (!aiRecommendations && googlePlaces.length === 0) {
      // Both failed - return error
      return res.status(500).json({
        success: false,
        error: 'Both AI and Google services failed. Please try again.',
        acknowledgment: '',
        places: [],
        overallSummary: '',
        quotaRemaining,
        stage: 'complete',
      } as SearchV2Response);
    }

    // Consume quota after successful parallel calls
    if (userId) {
      try {
        await quotaService.consumeQuota(userId);
        quotaRemaining = await quotaService.getRemainingQuota(userId);
      } catch (error) {
        logger.error('[SearchV2] Error consuming quota:', error);
      }
    }

    // Step 4: Match places
    // Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
    let matchResult: MatchResult;
    let acknowledgment = '';
    let categories: CategoryGroup[] | undefined;
    let finalPlaces: PlaceResult[] = [];

    if (aiRecommendations) {
      acknowledgment = aiRecommendations.acknowledgment;
      
      // Match AI places against Google and cached
      matchResult = placeMatcherService.matchPlaces(
        aiRecommendations.places,
        googlePlaces,
        cached
      );

      // Apply display limits
      const displayResult = placeMatcherService.applyDisplayLimits(
        matchResult.matched,
        matchResult.unmatched,
        aiRecommendations.categories
      );

      categories = displayResult.categories;
      finalPlaces = displayResult.places;

      // Save unmatched AI places to database
      // Requirements: 14.1
      if (matchResult.unmatched.length > 0) {
        saveAIPlacesToDatabase(matchResult.unmatched).catch(err => {
          logger.error('[SearchV2] Error saving AI places:', err);
        });
      }
    } else {
      // AI failed - use Google results only
      // Requirements: 2.5
      acknowledgment = `I found some places for "${query}". Here are the results:`;
      
      // Convert Google places to PlaceResult
      finalPlaces = googlePlaces.slice(0, 5).map(gp => ({
        googlePlaceId: gp.placeId,
        name: gp.displayName,
        summary: '', // Will be filled by summary generation
        coverImage: '', // Will be filled from database
        latitude: gp.location.lat,
        longitude: gp.location.lng,
        rating: gp.rating,
        ratingCount: gp.userRatingCount,
        isVerified: true,
        source: 'google' as const,
      }));
    }

    // Step 5: Generate summaries
    // Requirements: 6.1, 6.2, 6.3, 6.4
    let overallSummary = '';
    
    if (finalPlaces.length > 0) {
      try {
        const placesForSummary: PlaceBasicInfo[] = finalPlaces.map(p => ({
          name: p.name,
          city: p.city,
          country: p.country,
        }));

        const summaryResult = await aiRecommendationService.generateSummaries(
          placesForSummary,
          query
        );

        overallSummary = summaryResult.overallSummary;

        // Update place summaries
        finalPlaces = finalPlaces.map(place => {
          const summary = summaryResult.placeSummaries.get(place.name);
          return {
            ...place,
            summary: summary || place.summary,
          };
        });
      } catch (error) {
        logger.error('[SearchV2] Error generating summaries:', error);
        overallSummary = 'Hope you enjoy exploring these places!';
      }
    }

    // Step 6: Enrich with database data
    finalPlaces = await enrichPlaceResults(finalPlaces, googlePlaces);

    // Update categories with enriched places
    if (categories) {
      categories = categories.map(cat => ({
        ...cat,
        places: cat.places.map(p => {
          const enriched = finalPlaces.find(fp => fp.name === p.name);
          return enriched || p;
        }),
      }));
    }

    const duration = Date.now() - startTime;
    logger.info(`[SearchV2] Completed in ${duration}ms, returning ${finalPlaces.length} places`);

    // Return response
    return res.json({
      success: true,
      acknowledgment,
      categories,
      places: finalPlaces,
      overallSummary,
      quotaRemaining,
      stage: 'complete',
    } as SearchV2Response);

  } catch (error: any) {
    logger.error('[SearchV2] Unexpected error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'An unexpected error occurred',
      acknowledgment: '',
      places: [],
      overallSummary: '',
      quotaRemaining: 0,
      stage: 'complete',
    } as SearchV2Response);
  }
};

/**
 * Get quota info for a user
 * GET /api/places/ai/quota
 */
export const getQuotaInfo = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const quotaInfo = await quotaService.getQuotaInfo(userId);

    return res.json({
      success: true,
      quota: quotaInfo,
    });
  } catch (error: any) {
    logger.error('[SearchV2] Error getting quota info:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get quota information',
    });
  }
};

export default {
  searchV2,
  getQuotaInfo,
};
