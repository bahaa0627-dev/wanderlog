/**
 * Search V2 Controller
 * 
 * Implements the AI Search V2 pipeline with cost optimization:
 * - GPT-4o-mini (via Gemini/Kouri) for AI recommendations
 * - First try to match AI places against Supabase cache
 * - Only call Google Text Search Enterprise if cache miss
 * - Place matching and summary generation
 * 
 * Flow:
 * 1. AI recommendations
 * 2. Match against Supabase cache
 * 3. If insufficient matches -> call Google API
 * 4. Generate summaries
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
  CategoryGroup
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
 * Timeout configuration for API calls
 */
const TIMEOUT_CONFIG = {
  AI_TIMEOUT_MS: 20000,      // 20 seconds for AI call (Gemini needs more time)
  GOOGLE_TIMEOUT_MS: 15000,  // 15 seconds for Google call (proxy may be slow)
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
 * Searches by query text and optionally by specific place names from AI
 */
async function getCachedPlaces(query: string, aiPlaceNames?: string[]): Promise<CachedPlace[]> {
  try {
    // Build search conditions
    const searchConditions: any[] = [
      { name: { contains: query, mode: 'insensitive' } },
      { city: { contains: query, mode: 'insensitive' } },
    ];

    // Add AI place name searches for better matching
    if (aiPlaceNames && aiPlaceNames.length > 0) {
      for (const name of aiPlaceNames) {
        // Normalize name: remove accents for better matching
        const normalizedName = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        
        // Search for full name match
        searchConditions.push({ name: { contains: name, mode: 'insensitive' } });
        searchConditions.push({ name: { contains: normalizedName, mode: 'insensitive' } });
        
        // Also search for partial name matches (first word, first two words)
        const words = name.split(' ');
        if (words.length > 1) {
          searchConditions.push({ name: { contains: words[0], mode: 'insensitive' } });
          searchConditions.push({ name: { contains: words.slice(0, 2).join(' '), mode: 'insensitive' } });
          // Also try last word (e.g., "Sagrada Familia" -> "Familia")
          searchConditions.push({ name: { contains: words[words.length - 1], mode: 'insensitive' } });
        }
      }
    }

    const places = await prisma.place.findMany({
      where: {
        OR: searchConditions,
        // Include both verified and unverified places for matching
      },
      take: 150, // Get more candidates for better matching
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
        // 详情页需要的额外字段
        address: true,
        phoneNumber: true,
        website: true,
        openingHours: true,
      },
    });

    logger.info(`[SearchV2] Found ${places.length} cached places for query: "${query}"`);
    
    // 打印缓存地点的图片信息
    const placesWithImages = places.filter(p => p.coverImage);
    logger.info(`[SearchV2] ${placesWithImages.length}/${places.length} cached places have coverImage`);
    
    // 打印找到的地点名称（调试用）
    if (places.length > 0 && places.length <= 20) {
      logger.info(`[SearchV2] Cached places: ${places.map(p => `"${p.name}" (img: ${p.coverImage ? 'YES' : 'NO'})`).join(', ')}`);
    }

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
      // 详情页需要的额外字段
      address: p.address,
      phoneNumber: p.phoneNumber,
      website: p.website,
      openingHours: p.openingHours,
    }));
  } catch (error) {
    logger.error('[SearchV2] Error fetching cached places:', error);
    return [];
  }
}

/**
 * Save AI-only places to database
 * Requirements: 14.1, 14.7
 * 
 * 去重逻辑：通过名称相似度 + 城市 + 经纬度判断是否已存在
 */
async function saveAIPlacesToDatabase(aiPlaces: AIPlace[]): Promise<void> {
  for (const place of aiPlaces) {
    try {
      // 先通过名称模糊搜索可能的重复
      const candidates = await prisma.place.findMany({
        where: {
          OR: [
            { name: { contains: place.name.split(' ')[0], mode: 'insensitive' } },
            { name: { contains: place.name, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          name: true,
          city: true,
          latitude: true,
          longitude: true,
        },
      });

      // 检查是否有重复（名称相似 + 经纬度接近）
      let isDuplicate = false;
      for (const candidate of candidates) {
        // 计算名称相似度
        const { calculateNameSimilarity } = await import('../services/placeMatcherService');
        const nameSimilarity = calculateNameSimilarity(place.name, candidate.name);
        
        // 检查经纬度是否接近（约100米范围内）
        const latDiff = Math.abs(place.latitude - candidate.latitude);
        const lngDiff = Math.abs(place.longitude - candidate.longitude);
        const isNearby = latDiff < 0.001 && lngDiff < 0.001;
        
        // 如果名称相似度 >= 0.7 且位置接近，认为是重复
        if (nameSimilarity >= 0.7 && isNearby) {
          isDuplicate = true;
          logger.info(`[SearchV2] Skipping duplicate AI place: "${place.name}" (similar to "${candidate.name}")`);
          break;
        }
      }

      if (!isDuplicate) {
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

  // Fetch database records for matched places - by googlePlaceId OR by id
  const googlePlaceIds = places
    .filter(p => p.googlePlaceId)
    .map(p => p.googlePlaceId!);
  
  const placeIds = places
    .filter(p => p.id)
    .map(p => p.id!);

  let dbPlaces: any[] = [];
  if (googlePlaceIds.length > 0 || placeIds.length > 0) {
    dbPlaces = await prisma.place.findMany({
      where: {
        OR: [
          ...(googlePlaceIds.length > 0 ? [{ googlePlaceId: { in: googlePlaceIds } }] : []),
          ...(placeIds.length > 0 ? [{ id: { in: placeIds } }] : []),
        ],
      },
    });
  }

  // Build lookup maps
  const dbPlaceByGoogleId = new Map<string, any>();
  const dbPlaceById = new Map<string, any>();
  for (const dbp of dbPlaces) {
    if (dbp.googlePlaceId) {
      dbPlaceByGoogleId.set(dbp.googlePlaceId, dbp);
    }
    dbPlaceById.set(dbp.id, dbp);
  }

  // Enrich each place
  return places.map(place => {
    const enriched = { ...place };

    // Try to get data from database - by googlePlaceId or by id
    let dbPlace = place.googlePlaceId ? dbPlaceByGoogleId.get(place.googlePlaceId) : null;
    if (!dbPlace && place.id) {
      dbPlace = dbPlaceById.get(place.id);
    }

    if (dbPlace) {
      enriched.id = dbPlace.id;
      enriched.rating = dbPlace.rating ?? enriched.rating;
      enriched.ratingCount = dbPlace.ratingCount ?? enriched.ratingCount;
      if (dbPlace.coverImage) {
        enriched.coverImage = dbPlace.coverImage;
        logger.info(`[SearchV2] Enriched "${place.name}" with coverImage from DB`);
      }
      // 详情页需要的额外字段
      enriched.address = dbPlace.address ?? enriched.address;
      enriched.phoneNumber = dbPlace.phoneNumber ?? enriched.phoneNumber;
      enriched.website = dbPlace.website ?? enriched.website;
      enriched.openingHours = dbPlace.openingHours ?? enriched.openingHours;
    }

    // Also try Google place data for rating
    if (place.googlePlaceId) {
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
 * Search V2 - Cost-Optimized Pipeline
 * POST /api/places/ai/search-v2
 * 
 * Flow (串行，按需调用 Google):
 * 1. Check quota
 * 2. Call AI for recommendations
 * 3. Match AI places against Supabase cache
 * 4. If cache matches < MIN_CACHE_MATCHES, call Google API
 * 5. Generate summaries
 * 6. Save AI-only places to database
 * 7. Return results
 * 
 * This approach significantly reduces Google API costs by only calling
 * Google when the cache doesn't have enough matching places.
 */
export const searchV2 = async (req: Request, res: Response) => {
  const startTime = Date.now();
  let googleApiCalled = false;
  
  try {
    const { query, userId } = req.body as SearchV2Request;

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
    let quotaRemaining = 10;
    if (userId) {
      try {
        const canSearch = await quotaService.canSearch(userId);
        if (!canSearch) {
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
      }
    }

    // Step 2: Call AI for recommendations
    logger.info('[SearchV2] Step 2: Getting AI recommendations...');
    let aiRecommendations: AIRecommendationResult | null = null;
    
    try {
      aiRecommendations = await withTimeout(
        aiRecommendationService.getRecommendations(query),
        TIMEOUT_CONFIG.AI_TIMEOUT_MS,
        'AI Recommendations'
      );
      logger.info(`[SearchV2] AI returned ${aiRecommendations.places.length} places`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn(`[SearchV2] AI call failed: ${errorMsg}`);
    }

    // If AI failed, we need to call Google as fallback
    if (!aiRecommendations) {
      logger.info('[SearchV2] AI failed, falling back to Google API...');
      googleApiCalled = true;
      
      try {
        const googlePlaces = await withTimeout(
          googlePlacesEnterpriseService.textSearchEnterprise(query),
          TIMEOUT_CONFIG.GOOGLE_TIMEOUT_MS,
          'Google Text Search'
        );
        
        if (googlePlaces.length === 0) {
          return res.status(500).json({
            success: false,
            error: 'No results found. Please try a different search.',
            acknowledgment: '',
            places: [],
            overallSummary: '',
            quotaRemaining,
            stage: 'complete',
          } as SearchV2Response);
        }

        // Sync Google places to database
        // Only download photos for displayed places (first 5) to save costs
        const displayPlaceIds = googlePlaces.slice(0, 5).map(gp => gp.placeId);
        googlePlacesEnterpriseService.syncPlacesToDatabase(googlePlaces, displayPlaceIds).catch(err => {
          logger.error(`[SearchV2] Error syncing Google places: ${err}`);
        });

        // Convert Google places to PlaceResult
        const finalPlaces: PlaceResult[] = googlePlaces.slice(0, 5).map(gp => ({
          googlePlaceId: gp.placeId,
          name: gp.displayName,
          summary: '',
          coverImage: '',
          latitude: gp.location.lat,
          longitude: gp.location.lng,
          rating: gp.rating,
          ratingCount: gp.userRatingCount,
          isVerified: true,
          source: 'google' as const,
        }));

        // Consume quota and return
        if (userId) {
          await quotaService.consumeQuota(userId).catch(() => {});
          quotaRemaining = await quotaService.getRemainingQuota(userId);
        }

        const enrichedPlaces = await enrichPlaceResults(finalPlaces, googlePlaces);
        
        return res.json({
          success: true,
          acknowledgment: `I found some places for "${query}". Here are the results:`,
          places: enrichedPlaces,
          overallSummary: 'Hope you enjoy exploring these places!',
          quotaRemaining,
          stage: 'complete',
        } as SearchV2Response);
        
      } catch (googleError) {
        return res.status(500).json({
          success: false,
          error: 'Search services are temporarily unavailable. Please try again.',
          acknowledgment: '',
          places: [],
          overallSummary: '',
          quotaRemaining,
          stage: 'complete',
        } as SearchV2Response);
      }
    }

    // Step 3: Match AI places against Supabase cache
    logger.info('[SearchV2] Step 3: Matching against Supabase cache...');
    const aiPlaceNames = aiRecommendations.places.map(p => p.name);
    const cachedPlaces = await getCachedPlaces(query, aiPlaceNames);
    
    // Try to match AI places with cache only (no Google yet)
    let matchResult = placeMatcherService.matchPlaces(
      aiRecommendations.places,
      [], // No Google places yet
      cachedPlaces
    );

    const cacheMatchCount = matchResult.matched.length;
    logger.info(`[SearchV2] Cache matched ${cacheMatchCount}/${aiRecommendations.places.length} AI places`);

    // Step 4: Check if Google API is needed based on category/total match requirements
    // 有分类时：任一分类匹配数 < 2 触发 Google
    // 无分类时：总匹配数 < 5 触发 Google
    let googlePlaces: GooglePlace[] = [];
    const needsGoogleAPI = placeMatcherService.checkNeedsGoogleAPI(
      matchResult.matched,
      aiRecommendations.categories
    );
    
    if (needsGoogleAPI) {
      logger.info(`[SearchV2] Step 4: Needs Google API, calling...`);
      googleApiCalled = true;
      
      try {
        googlePlaces = await withTimeout(
          googlePlacesEnterpriseService.textSearchEnterprise(query),
          TIMEOUT_CONFIG.GOOGLE_TIMEOUT_MS,
          'Google Text Search'
        );
        logger.info(`[SearchV2] Google returned ${googlePlaces.length} places`);
        
        // Note: We'll sync to database AFTER applyDisplayLimits to know which places need photos

        // Re-match with Google places included
        matchResult = placeMatcherService.matchPlaces(
          aiRecommendations.places,
          googlePlaces,
          cachedPlaces
        );
        logger.info(`[SearchV2] After Google: matched ${matchResult.matched.length} places`);
        
      } catch (googleError) {
        const errorMsg = googleError instanceof Error ? googleError.message : String(googleError);
        logger.warn(`[SearchV2] Google API call failed: ${errorMsg}`);
        // Continue with cache-only results
      }
    } else {
      logger.info(`[SearchV2] Step 4: Skipping Google API (sufficient matches)`);
    }

    // Consume quota after successful search
    if (userId) {
      try {
        await quotaService.consumeQuota(userId);
        quotaRemaining = await quotaService.getRemainingQuota(userId);
      } catch (error) {
        logger.error('[SearchV2] Error consuming quota:', error);
      }
    }

    // Step 5: Apply display limits and prepare results
    // 使用 AI 返回的 requestedCount 来控制展示数量
    const requestedCount = aiRecommendations.requestedCount;
    logger.info(`[SearchV2] User requested ${requestedCount} places`);
    
    const displayResult = placeMatcherService.applyDisplayLimits(
      matchResult.matched,
      matchResult.unmatched,
      aiRecommendations.categories,
      requestedCount
    );

    let categories = displayResult.categories;
    let finalPlaces = displayResult.places;

    // Step 5.5: Now sync Google places to database with display info
    // Only download photos for places that will be displayed (saves $0.007/photo)
    if (googlePlaces.length > 0) {
      // Collect all displayed place IDs (from categories or flat list)
      const displayedGooglePlaceIds: string[] = [];
      
      if (categories) {
        for (const cat of categories) {
          for (const place of cat.places) {
            if (place.googlePlaceId) {
              displayedGooglePlaceIds.push(place.googlePlaceId);
            }
          }
        }
      }
      
      for (const place of finalPlaces) {
        if (place.googlePlaceId && !displayedGooglePlaceIds.includes(place.googlePlaceId)) {
          displayedGooglePlaceIds.push(place.googlePlaceId);
        }
      }
      
      logger.info(`[SearchV2] Syncing ${googlePlaces.length} Google places, downloading photos for ${displayedGooglePlaceIds.length} displayed places`);
      
      // Sync places to database in background (don't wait)
      googlePlacesEnterpriseService.syncPlacesToDatabase(googlePlaces, displayedGooglePlaceIds)
        .then(() => logger.info(`[SearchV2] Google places synced successfully`))
        .catch(err => logger.error(`[SearchV2] Error syncing Google places: ${err}`));
    }

    // Save unmatched AI places to database (background)
    if (matchResult.unmatched.length > 0) {
      saveAIPlacesToDatabase(matchResult.unmatched).catch(err => {
        logger.error('[SearchV2] Error saving AI places:', err);
      });
    }

    // Step 5.6: Fetch images for AI-only places from Wikipedia (FREE)
    const aiOnlyPlacesInDisplay = [
      ...(categories?.flatMap(cat => cat.places.filter(p => p.source === 'ai' && !p.coverImage)) || []),
      ...finalPlaces.filter(p => p.source === 'ai' && !p.coverImage),
    ];
    
    if (aiOnlyPlacesInDisplay.length > 0) {
      logger.info(`[SearchV2] Fetching Wikipedia images for ${aiOnlyPlacesInDisplay.length} AI places...`);
      
      try {
        const { wikipediaImageService } = await import('../services/wikipediaImageService');
        
        // Fetch images with 10 second timeout (Wikipedia needs time through proxy)
        const imagePromise = wikipediaImageService.batchGetImages(
          aiOnlyPlacesInDisplay.map(p => ({ name: p.name, city: p.city }))
        );
        
        const timeoutPromise = new Promise<Map<string, any>>((resolve) => {
          setTimeout(() => {
            logger.warn('[SearchV2] Wikipedia image fetch timed out');
            resolve(new Map());
          }, 10000);
        });
        
        const imageResults = await Promise.race([imagePromise, timeoutPromise]);
        
        // Update places with fetched images
        const updatePlaceImage = (place: PlaceResult): PlaceResult => {
          if (place.source === 'ai' && !place.coverImage) {
            const imageResult = imageResults.get(place.name);
            if (imageResult?.imageUrl) {
              return { ...place, coverImage: imageResult.imageUrl };
            }
          }
          return place;
        };
        
        finalPlaces = finalPlaces.map(updatePlaceImage);
        if (categories) {
          categories = categories.map(cat => ({
            ...cat,
            places: cat.places.map(updatePlaceImage),
          }));
        }
        
        const found = Array.from(imageResults.values()).filter(r => r?.imageUrl).length;
        logger.info(`[SearchV2] Wikipedia: found ${found}/${aiOnlyPlacesInDisplay.length} images`);
      } catch (err) {
        logger.warn(`[SearchV2] Wikipedia image fetch failed: ${err}`);
      }
    }

    // Step 6: Generate summaries (skip for now to speed up response)
    let overallSummary = 'Hope you enjoy exploring these places!';
    
    // TODO: Re-enable summary generation when performance is optimized
    // if (finalPlaces.length > 0) {
    //   try {
    //     const placesForSummary: PlaceBasicInfo[] = finalPlaces.map(p => ({
    //       name: p.name,
    //       city: p.city,
    //       country: p.country,
    //     }));

    //     const summaryResult = await aiRecommendationService.generateSummaries(
    //       placesForSummary,
    //       query
    //     );

    //     overallSummary = summaryResult.overallSummary;
        
    //     // 如果用户请求超过20条，在总结里说明
    //     if (aiRecommendations.exceededLimit) {
    //       const exceedNote = query.match(/[\u4e00-\u9fa5]/) 
    //         ? '先为你推荐20条看看~' 
    //         : "Here are 20 recommendations to start with!";
    //       overallSummary = `${exceedNote} ${overallSummary}`;
    //     }

    //     finalPlaces = finalPlaces.map(place => {
    //       const summary = summaryResult.placeSummaries.get(place.name);
    //       return {
    //         ...place,
    //         summary: summary || place.summary,
    //       };
    //     });
    //   } catch (error) {
    //     logger.error('[SearchV2] Error generating summaries:', error);
    //     overallSummary = 'Hope you enjoy exploring these places!';
    //   }
    // }
    
    // Use AI-provided summaries from the recommendation response
    if (aiRecommendations.exceededLimit) {
      const exceedNote = query.match(/[\u4e00-\u9fa5]/) 
        ? '先为你推荐10条看看~' 
        : "Here are 10 recommendations to start with!";
      overallSummary = exceedNote;
    }

    // Step 7: Enrich with database data
    finalPlaces = await enrichPlaceResults(finalPlaces, googlePlaces);

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
    logger.info(`[SearchV2] Completed in ${duration}ms, returning ${finalPlaces.length} places (Google API called: ${googleApiCalled})`);

    return res.json({
      success: true,
      acknowledgment: aiRecommendations.acknowledgment,
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
 * 
 * Accepts userId from:
 * 1. Authenticated user (req.user.id)
 * 2. Query parameter (userId)
 */
export const getQuotaInfo = async (req: Request, res: Response) => {
  try {
    // Try to get userId from auth or query param
    const userId = (req as any).user?.id || req.query.userId as string;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required',
        remaining: 10, // Return default for anonymous
      });
    }

    const quotaInfo = await quotaService.getQuotaInfo(userId);

    return res.json({
      success: true,
      remaining: quotaInfo.remaining,
      limit: quotaInfo.limit,
      used: quotaInfo.used,
      resetsAt: quotaInfo.resetsAt,
    });
  } catch (error: any) {
    logger.error('[SearchV2] Error getting quota info:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get quota information',
      remaining: 10, // Return default on error
    });
  }
};

export default {
  searchV2,
  getQuotaInfo,
};
