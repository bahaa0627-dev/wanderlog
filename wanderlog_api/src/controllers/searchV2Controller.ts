/**
 * Search V2 Controller
 * 
 * 新流程（按流程图）：
 * 1. 解析用户 query（提取数量、品类、城市）
 * 2. AI 输出 20 个结果池
 * 3. 与 Supabase 匹配
 * 4. 如果数量不够 → Supabase 按品类补齐
 * 5. 补齐的内容再过 AI 生成 summary 和分类
 * 6. 最终结果符合：数量、品类、诉求
 */

import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import prisma from '../config/database';

import aiRecommendationService, { 
  AIRecommendationResult, 
  AIPlace
} from '../services/aiRecommendationService';
import { calculateNameSimilarity } from '../services/placeMatcherService';
import quotaService, { QuotaExceededError } from '../services/quotaService';
import { KouriProvider } from '../services/aiProviders/KouriProvider';

interface ParsedQuery {
  count: number;
  category: string;
  city: string;
  originalQuery: string;
}

interface PlaceResult {
  id: string;
  name: string;
  summary: string;
  coverImage: string;
  latitude: number;
  longitude: number;
  city: string;
  country: string;
  rating: number | null;
  ratingCount: number | null;
  tags: string[];
  isVerified: boolean;
  source: 'cache' | 'ai';
  address?: string;
  phoneNumber?: string;
  website?: string;
  openingHours?: string;
}

interface CategoryGroup {
  title: string;
  places: PlaceResult[];
}

const CONFIG = {
  AI_TIMEOUT_MS: 90000,
  AI_SUMMARY_TIMEOUT_MS: 30000,
  DEFAULT_COUNT: 20,
  MIN_PLACES_PER_CATEGORY: 3,
  MIN_CATEGORIES: 3,
  NAME_SIMILARITY_THRESHOLD: 0.6,
  COORDINATE_THRESHOLD: 0.01,
  IMAGE_SEARCH_TIMEOUT_MS: 15000,
};

// 简化映射：用户搜什么就匹配什么，不做扩展
const CATEGORY_MAPPING: Record<string, string[]> = {
  'cafe': ['cafe'],
  'coffee': ['cafe'],
  'bakery': ['bakery'],
  'restaurant': ['restaurant'],
  'ramen': ['restaurant'],
  'sushi': ['restaurant'],
  'museum': ['museum'],
  'gallery': ['gallery'],
  'temple': ['temple'],
  'shrine': ['shrine'],
  'park': ['park'],
  'garden': ['park'],
  'bar': ['bar'],
  'pub': ['bar'],
  'shop': ['shop'],
  'shopping': ['shop'],
  'hotel': ['hotel'],
};

const kouriProvider = new KouriProvider();

function parseQuery(query: string): ParsedQuery {
  const result: ParsedQuery = {
    count: CONFIG.DEFAULT_COUNT,
    category: '',
    city: '',
    originalQuery: query,
  };
  
  const countMatch = query.match(/(\d+)\s+/);
  if (countMatch) {
    result.count = Math.min(Math.max(parseInt(countMatch[1], 10), 1), 20); // max 20
  }
  
  const categoryKeywords = Object.keys(CATEGORY_MAPPING);
  for (const keyword of categoryKeywords) {
    if (query.toLowerCase().includes(keyword)) {
      result.category = keyword;
      break;
    }
  }
  
  const cityPatterns = [
    /(?:in|at|around|near)\s+([A-Z][a-zA-Z\s]+?)(?:\s|$|,)/i,
    /([A-Z][a-zA-Z]+)\s+(?:cafes?|restaurants?|places?|spots?|museums?|temples?|shrines?|bars?)/i,
  ];
  
  for (const pattern of cityPatterns) {
    const match = query.match(pattern);
    if (match && match[1]) {
      result.city = match[1].trim();
      break;
    }
  }
  
  if (!result.city) {
    const words = query.split(/\s+/);
    for (const word of words) {
      if (/^[A-Z][a-z]+$/.test(word) && word.length > 2) {
        result.city = word;
        break;
      }
    }
  }
  
  logger.info(`[SearchV2] Parsed query: count=${result.count}, category="${result.category}", city="${result.city}"`);
  return result;
}

/**
 * 将未匹配的 AI 地点保存到数据库（异步，不阻塞主流程）
 * 这样可以逐步丰富数据库内容
 */
async function saveUnmatchedAIPlacesToDB(
  aiPlaces: AIPlace[],
  matchedNames: Set<string>,
  category: string
): Promise<void> {
  const unmatchedPlaces = aiPlaces.filter(p => !matchedNames.has(p.name));
  if (unmatchedPlaces.length === 0) return;
  
  logger.info(`[SearchV2] Saving ${unmatchedPlaces.length} unmatched AI places to DB...`);
  
  const categoryValue = CATEGORY_MAPPING[category]?.[0] || category || 'other';
  
  for (const place of unmatchedPlaces) {
    try {
      // 检查是否已存在（按名称和坐标）
      const existing = await prisma.place.findFirst({
        where: {
          name: { equals: place.name, mode: 'insensitive' },
          latitude: { gte: place.latitude - 0.001, lte: place.latitude + 0.001 },
          longitude: { gte: place.longitude - 0.001, lte: place.longitude + 0.001 },
        },
      });
      
      if (existing) {
        logger.info(`[SearchV2] AI place "${place.name}" already exists, skipping`);
        continue;
      }
      
      // 创建新地点（source 标记为 ai_generated）
      await prisma.place.create({
        data: {
          name: place.name,
          city: place.city,
          country: place.country,
          latitude: place.latitude,
          longitude: place.longitude,
          categoryEn: categoryValue,
          aiDescription: place.summary,
          aiTags: place.tags,
          source: 'ai_generated',
          isVerified: false,
          coverImage: '', // 暂无图片
        },
      });
      logger.info(`[SearchV2] Saved AI place: "${place.name}"`);
    } catch (error) {
      logger.warn(`[SearchV2] Failed to save AI place "${place.name}": ${error}`);
    }
  }
}

async function matchAIPlacesFromDB(aiPlaces: AIPlace[]): Promise<Map<string, PlaceResult>> {
  const matchedPlaces = new Map<string, PlaceResult>();
  
  for (const aiPlace of aiPlaces) {
    const candidates = await prisma.place.findMany({
      where: {
        OR: [
          { name: { contains: aiPlace.name.split(' ')[0], mode: 'insensitive' } },
          { name: { contains: aiPlace.name, mode: 'insensitive' } },
        ],
      },
      take: 20,
    });
    
    let bestMatch: any = null;
    let bestScore = 0;
    
    for (const candidate of candidates) {
      const nameSimilarity = calculateNameSimilarity(aiPlace.name, candidate.name);
      const latDiff = Math.abs(aiPlace.latitude - candidate.latitude);
      const lngDiff = Math.abs(aiPlace.longitude - candidate.longitude);
      const isNearby = latDiff < CONFIG.COORDINATE_THRESHOLD && lngDiff < CONFIG.COORDINATE_THRESHOLD;
      
      if (nameSimilarity >= CONFIG.NAME_SIMILARITY_THRESHOLD && isNearby) {
        const score = nameSimilarity + (1 - (latDiff + lngDiff) / CONFIG.COORDINATE_THRESHOLD);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = candidate;
        }
      }
    }
    
    if (bestMatch) {
      const hasRating = bestMatch.rating !== null && bestMatch.rating > 0;
      matchedPlaces.set(aiPlace.name, {
        id: bestMatch.id,
        name: bestMatch.name,
        summary: aiPlace.summary || bestMatch.aiDescription || '',
        coverImage: bestMatch.coverImage || '',
        latitude: bestMatch.latitude,
        longitude: bestMatch.longitude,
        city: bestMatch.city || aiPlace.city,
        country: bestMatch.country || aiPlace.country,
        rating: bestMatch.rating,
        ratingCount: bestMatch.ratingCount,
        tags: aiPlace.tags || bestMatch.aiTags || [],
        isVerified: hasRating || bestMatch.isVerified || false,
        source: 'cache',
        address: bestMatch.address,
        phoneNumber: bestMatch.phoneNumber,
        website: bestMatch.website,
        openingHours: bestMatch.openingHours,
      });
      logger.info(`[SearchV2] Matched "${aiPlace.name}" -> "${bestMatch.name}"`);
    }
  }
  
  return matchedPlaces;
}

async function getPlacesByCategory(
  city: string,
  category: string,
  excludeIds: string[],
  limit: number,
  excludeNames: string[] = []
): Promise<any[]> {
  const categoryValues = CATEGORY_MAPPING[category] || [];
  
  // 城市名称变体（Rome/Roma, etc.）
  const cityVariants = [city];
  if (city.toLowerCase() === 'rome') cityVariants.push('Roma');
  if (city.toLowerCase() === 'roma') cityVariants.push('Rome');
  
  // 构建城市条件
  const cityConditions = cityVariants.map(c => ({ city: { contains: c, mode: 'insensitive' as const } }));
  
  // 构建 category 条件（case-insensitive）
  const categoryConditions = categoryValues.map(cat => ({
    categoryEn: { equals: cat, mode: 'insensitive' as const }
  }));
  
  let places: any[] = [];
  const seenNames = new Set(excludeNames.map(n => n.toLowerCase().trim()));
  
  if (categoryValues.length > 0) {
    const rawPlaces = await prisma.place.findMany({
      where: { 
        AND: [
          { OR: cityConditions },
          { OR: categoryConditions },
          { id: { notIn: excludeIds } },
          { coverImage: { not: null } },
          { coverImage: { not: '' } },
        ],
      },
      orderBy: [{ rating: 'desc' }, { ratingCount: 'desc' }],
      take: limit,
    });
    
    for (const p of rawPlaces) {
      const normalizedName = p.name.toLowerCase().trim();
      if (!seenNames.has(normalizedName) && places.length < limit) {
        places.push(p);
        seenNames.add(normalizedName);
      }
    }
    
    if (places.length < limit) {
      const existingIds = [...excludeIds, ...places.map(p => p.id)];
      for (const keyword of categoryValues) {
        if (places.length >= limit) break;
        const morePlaces = await prisma.place.findMany({
          where: {
            AND: [
              { OR: cityConditions },
              { id: { notIn: existingIds } },
              { coverImage: { not: null } },
              { coverImage: { not: '' } },
              { name: { contains: keyword, mode: 'insensitive' } },
            ],
          },
          orderBy: [{ rating: 'desc' }, { ratingCount: 'desc' }],
          take: (limit - places.length) * 2,
        });
        for (const p of morePlaces) {
          const normalizedName = p.name.toLowerCase().trim();
          if (!existingIds.includes(p.id) && !seenNames.has(normalizedName) && places.length < limit) {
            places.push(p);
            existingIds.push(p.id);
            seenNames.add(normalizedName);
          }
        }
      }
    }
  } else {
    places = await prisma.place.findMany({
      where: {
        AND: [
          { OR: cityConditions },
          { id: { notIn: excludeIds } },
          { coverImage: { not: null } },
          { coverImage: { not: '' } },
        ],
      },
      orderBy: [{ rating: 'desc' }, { ratingCount: 'desc' }],
      take: limit,
    });
  }
  
  logger.info(`[SearchV2] Found ${places.length} places for category "${category}" in "${city}"`);
  return places;
}


async function generateAISummaryForPlaces(
  places: any[],
  parsedQuery: ParsedQuery,
  language: string
): Promise<{ places: PlaceResult[]; categories: CategoryGroup[]; overallSummary: string }> {
  if (places.length === 0) {
    return { places: [], categories: [], overallSummary: '' };
  }
  
  const placeNames = places.map(p => `- ${p.name} (${p.category || 'unknown'})`).join('\n');
  const prompt = `Based on the user's search "${parsedQuery.originalQuery}", organize these places and write brief summaries.

Places:
${placeNames}

Requirements:
1. Write a natural, engaging introduction (1-2 sentences) that introduces these recommendations based on the user's query
2. Write a 2-3 sentence summary for each place explaining why it matches the user's request
3. Group them into 2-3 categories with emoji titles (e.g., "☕ Specialty Coffee", "🍰 Cafe & Bakery")
4. Each category should have at least 2 places
5. Response in ${language === 'zh' ? 'Chinese' : 'English'}

Return JSON:
{
  "introduction": "A natural introduction to these recommendations...",
  "categories": [
    {
      "title": "☕ Category Name",
      "places": [
        { "name": "Place Name", "summary": "Brief summary..." }
      ]
    }
  ]
}`;

  try {
    const response = await Promise.race([
      kouriProvider.generateText(prompt),
      new Promise<string>((_, reject) => 
        setTimeout(() => reject(new Error('AI summary timeout')), CONFIG.AI_SUMMARY_TIMEOUT_MS)
      ),
    ]);
    
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    
    const result = JSON.parse(jsonMatch[0]);
    const categoryGroups: CategoryGroup[] = [];
    const allPlaces: PlaceResult[] = [];
    
    for (const cat of result.categories || []) {
      const categoryPlaces: PlaceResult[] = [];
      for (const aiPlace of cat.places || []) {
        const dbPlace = places.find(p => calculateNameSimilarity(p.name, aiPlace.name) > 0.7);
        if (dbPlace) {
          const hasRating = dbPlace.rating !== null && dbPlace.rating > 0;
          const placeResult: PlaceResult = {
            id: dbPlace.id,
            name: dbPlace.name,
            summary: aiPlace.summary || dbPlace.aiDescription || '',
            coverImage: dbPlace.coverImage || '',
            latitude: dbPlace.latitude,
            longitude: dbPlace.longitude,
            city: dbPlace.city || parsedQuery.city,
            country: dbPlace.country || '',
            rating: dbPlace.rating,
            ratingCount: dbPlace.ratingCount,
            tags: (dbPlace.aiTags as string[]) || [],
            isVerified: hasRating || dbPlace.isVerified || false,
            source: 'cache',
            address: dbPlace.address || undefined,
            phoneNumber: dbPlace.phoneNumber || undefined,
            website: dbPlace.website || undefined,
            openingHours: dbPlace.openingHours || undefined,
          };
          categoryPlaces.push(placeResult);
          allPlaces.push(placeResult);
        }
      }
      if (categoryPlaces.length >= 2) {
        categoryGroups.push({ title: cat.title, places: categoryPlaces });
      }
    }
    
    logger.info(`[SearchV2] AI generated ${categoryGroups.length} categories with ${allPlaces.length} places`);
    return { places: allPlaces, categories: categoryGroups, overallSummary: result.introduction || '' };
    
  } catch (error) {
    logger.warn(`[SearchV2] AI summary generation failed: ${error}`);
    const fallbackPlaces: PlaceResult[] = places.map(p => ({
      id: p.id,
      name: p.name,
      summary: p.aiDescription || '',
      coverImage: p.coverImage || '',
      latitude: p.latitude,
      longitude: p.longitude,
      city: p.city || parsedQuery.city,
      country: p.country || '',
      rating: p.rating,
      ratingCount: p.ratingCount,
      tags: (p.aiTags as string[]) || [],
      isVerified: (p.rating !== null && p.rating > 0) || p.isVerified || false,
      source: 'cache' as const,
      address: p.address || undefined,
      phoneNumber: p.phoneNumber || undefined,
      website: p.website || undefined,
      openingHours: p.openingHours || undefined,
    }));
    return { places: fallbackPlaces, categories: [], overallSummary: '' };
  }
}

async function searchMissingImages(places: PlaceResult[], city: string): Promise<void> {
  const placesWithoutImage = places.filter(p => !p.coverImage);
  if (placesWithoutImage.length === 0) return;
  
  logger.info(`[SearchV2] Searching images for ${placesWithoutImage.length} places`);
  const searchPromises = placesWithoutImage.slice(0, 5).map(async (place) => {
    try {
      const imageUrl = await Promise.race([
        kouriProvider.searchPlaceImage(place.name, city),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), CONFIG.IMAGE_SEARCH_TIMEOUT_MS)),
      ]);
      if (imageUrl) {
        place.coverImage = imageUrl;
        logger.info(`[SearchV2] Found image for "${place.name}"`);
      }
    } catch (error) {
      logger.warn(`[SearchV2] Image search failed for "${place.name}"`);
    }
  });
  await Promise.all(searchPromises);
}


export const searchV2 = async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { query, userId, language = 'en' } = req.body;
    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        success: false, error: 'query is required', acknowledgment: '',
        places: [], overallSummary: '', quotaRemaining: 0, stage: 'complete',
      });
    }

    logger.info(`[SearchV2] Starting search for: "${query}"`);
    const parsedQuery = parseQuery(query);

    let quotaRemaining = 10;
    if (userId) {
      try {
        const canSearch = await quotaService.canSearch(userId);
        if (!canSearch) {
          return res.status(429).json({
            success: false, error: 'Daily search quota exceeded.', acknowledgment: '',
            places: [], overallSummary: '', quotaRemaining: 0, stage: 'complete',
          });
        }
        quotaRemaining = await quotaService.getRemainingQuota(userId);
      } catch (error) {
        if (error instanceof QuotaExceededError) {
          return res.status(429).json({
            success: false, error: error.message, acknowledgment: '',
            places: [], overallSummary: '', quotaRemaining: 0, stage: 'complete',
          });
        }
      }
    }

    logger.info('[SearchV2] Getting AI recommendations...');
    let aiRecommendations: AIRecommendationResult | null = null;
    try {
      aiRecommendations = await Promise.race([
        aiRecommendationService.getRecommendations(query, language),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('AI timeout')), CONFIG.AI_TIMEOUT_MS)),
      ]);
      logger.info(`[SearchV2] AI returned ${aiRecommendations.places.length} places`);
    } catch (error) {
      logger.warn(`[SearchV2] AI call failed: ${error}`);
    }

    let matchedPlaces = new Map<string, PlaceResult>();
    let finalPlaces: PlaceResult[] = [];
    let finalCategories: CategoryGroup[] = [];
    let acknowledgment = '';
    
    if (aiRecommendations && aiRecommendations.places.length > 0) {
      logger.info('[SearchV2] Matching against Supabase...');
      matchedPlaces = await matchAIPlacesFromDB(aiRecommendations.places);
      logger.info(`[SearchV2] Matched ${matchedPlaces.size}/${aiRecommendations.places.length} AI places`);
      acknowledgment = aiRecommendations.acknowledgment;
      
      // 异步保存未匹配的 AI 地点到数据库（不阻塞主流程）
      const matchedNames = new Set(matchedPlaces.keys());
      saveUnmatchedAIPlacesToDB(aiRecommendations.places, matchedNames, parsedQuery.category)
        .catch(err => logger.warn(`[SearchV2] Failed to save AI places: ${err}`));
      
      if (aiRecommendations.categories && aiRecommendations.categories.length > 0) {
        for (const aiCat of aiRecommendations.categories) {
          const catPlaces: PlaceResult[] = [];
          for (const placeName of aiCat.placeNames) {
            const matched = matchedPlaces.get(placeName);
            if (matched && !finalPlaces.find(p => p.id === matched.id)) {
              catPlaces.push(matched);
              finalPlaces.push(matched);
            }
          }
          if (catPlaces.length >= 2) {
            finalCategories.push({ title: aiCat.title, places: catPlaces });
          }
        }
      } else {
        finalPlaces = Array.from(matchedPlaces.values());
      }
    }

    const targetCount = parsedQuery.count;
    if (finalPlaces.length < targetCount && parsedQuery.city) {
      const needed = targetCount - finalPlaces.length;
      logger.info(`[SearchV2] Need ${needed} more places, searching Supabase...`);
      
      const excludeIds = finalPlaces.map(p => p.id);
      const excludeNames = finalPlaces.map(p => p.name);
      // 多取一些作为缓冲，因为 AI 分类时可能会丢掉一些不符合分类标题的地点
      const supplementPlaces = await getPlacesByCategory(
        parsedQuery.city, parsedQuery.category, excludeIds, needed * 2, excludeNames
      );
      
      if (supplementPlaces.length > 0) {
        logger.info(`[SearchV2] Found ${supplementPlaces.length} supplement places from Supabase`);
        logger.info(`[SearchV2] Supabase places: ${supplementPlaces.map(p => p.name).join(', ')}`);
        const { places: aiProcessedPlaces, categories: aiCategories, overallSummary: aiSummary } = 
          await generateAISummaryForPlaces(supplementPlaces, parsedQuery, language);
        
        if (aiSummary && !acknowledgment) acknowledgment = aiSummary;
        
        for (const place of aiProcessedPlaces) {
          if (!finalPlaces.find(p => p.id === place.id) && finalPlaces.length < targetCount) {
            finalPlaces.push(place);
          }
        }
        
        // 如果 AI 处理后还不够，直接添加原始地点
        if (finalPlaces.length < targetCount) {
          logger.info(`[SearchV2] Still need ${targetCount - finalPlaces.length} more, adding raw places...`);
          for (const p of supplementPlaces) {
            if (finalPlaces.length >= targetCount) break;
            if (!finalPlaces.find(fp => fp.id === p.id)) {
              const hasRating = p.rating !== null && p.rating > 0;
              finalPlaces.push({
                id: p.id, name: p.name, summary: p.aiDescription || '',
                coverImage: p.coverImage || '', latitude: p.latitude, longitude: p.longitude,
                city: p.city || parsedQuery.city, country: p.country || '',
                rating: p.rating, ratingCount: p.ratingCount,
                tags: (p.aiTags as string[]) || [],
                isVerified: hasRating || p.isVerified || false, source: 'cache' as const,
                address: p.address || undefined, phoneNumber: p.phoneNumber || undefined,
                website: p.website || undefined, openingHours: p.openingHours || undefined,
              });
            }
          }
        }
        
        for (const cat of aiCategories) {
          const existingCat = finalCategories.find(c => c.title === cat.title);
          if (existingCat) {
            for (const place of cat.places) {
              if (!existingCat.places.find(p => p.id === place.id)) existingCat.places.push(place);
            }
          } else {
            finalCategories.push(cat);
          }
        }
      }
    }

    // 去重（ID + 名称）
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();
    finalPlaces = finalPlaces.filter(p => {
      const normalizedName = p.name.toLowerCase().trim();
      if (seenIds.has(p.id) || seenNames.has(normalizedName)) {
        logger.warn(`[SearchV2] Removing duplicate: ${p.name}`);
        return false;
      }
      seenIds.add(p.id);
      seenNames.add(normalizedName);
      return true;
    }).slice(0, targetCount);
    
    const finalPlaceIds = new Set(finalPlaces.map(p => p.id));
    finalCategories = finalCategories
      .map(cat => ({ ...cat, places: cat.places.filter(p => finalPlaceIds.has(p.id)) }))
      .filter(cat => cat.places.length >= 2);

    logger.info('[SearchV2] Searching missing images...');
    await searchMissingImages(finalPlaces, parsedQuery.city);

    // 生成 overallSummary（用 AI）
    let overallSummary = '';
    if (finalCategories.length < 2 && finalPlaces.length > 0 && !acknowledgment) {
      try {
        const placeNames = finalPlaces.slice(0, 5).map(p => p.name).join(', ');
        const introPrompt = `User searched: "${parsedQuery.originalQuery}"
Found places: ${placeNames}
Write a natural, engaging 1-2 sentence introduction for these recommendations. Be creative. Response in ${language === 'zh' ? 'Chinese' : 'English'}.
Return only the introduction text, no JSON.`;
        
        const introResponse = await Promise.race([
          kouriProvider.generateText(introPrompt),
          new Promise<string>((resolve) => setTimeout(() => resolve(''), 10000)),
        ]);
        if (introResponse && introResponse.trim()) {
          overallSummary = introResponse.trim().replace(/^["']|["']$/g, '');
        }
      } catch (error) {
        logger.warn(`[SearchV2] Failed to generate AI introduction: ${error}`);
      }
    }

    if (userId) {
      try {
        await quotaService.consumeQuota(userId);
        quotaRemaining = await quotaService.getRemainingQuota(userId);
      } catch (error) {
        logger.error('[SearchV2] Error consuming quota:', error);
      }
    }

    const duration = Date.now() - startTime;
    logger.info(`[SearchV2] Completed in ${duration}ms: ${finalPlaces.length} places, ${finalCategories.length} categories`);
    logger.info(`[SearchV2] Final places: ${finalPlaces.map(p => p.name).join(', ')}`);

    return res.json({
      success: true,
      acknowledgment: acknowledgment || `Found ${finalPlaces.length} ${parsedQuery.category || 'places'} in ${parsedQuery.city}`,
      categories: finalCategories.length >= 2 ? finalCategories : undefined,
      places: finalPlaces,
      overallSummary,
      quotaRemaining,
      stage: 'complete',
    });

  } catch (error: any) {
    logger.error('[SearchV2] Unexpected error:', error);
    return res.status(500).json({
      success: false, error: error.message || 'An unexpected error occurred',
      acknowledgment: '', places: [], overallSummary: '', quotaRemaining: 0, stage: 'complete',
    });
  }
};

export const getQuotaInfo = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || req.query.userId as string;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required', remaining: 10 });
    }
    const quotaInfo = await quotaService.getQuotaInfo(userId);
    return res.json({
      success: true, remaining: quotaInfo.remaining, limit: quotaInfo.limit,
      used: quotaInfo.used, resetsAt: quotaInfo.resetsAt,
    });
  } catch (error: any) {
    logger.error('[SearchV2] Error getting quota info:', error);
    return res.status(500).json({ success: false, error: 'Failed to get quota information', remaining: 10 });
  }
};

export default { searchV2, getQuotaInfo };
