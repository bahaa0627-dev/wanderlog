import { Request, Response } from 'express';
import prisma from '../config/database';
import { logger } from '../utils/logger';
import googleMapsService from '../services/googleMapsService';

/**
 * 批量导入 Google Maps 地点
 * POST /api/places/import
 */
export const importSpots = async (req: Request, res: Response) => {
  try {
    const { placeIds } = req.body;

    if (!Array.isArray(placeIds) || placeIds.length === 0) {
      return res.status(400).json({ message: 'placeIds array is required' });
    }

    logger.info(`Starting import of ${placeIds.length} places`);
    const result = await googleMapsService.importSpots(placeIds);

    return res.json({
      message: 'Import completed',
      ...result,
    });
  } catch (error) {
    logger.error('Import Places error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * 导入单个地点
 * POST /api/places/import-one
 */
export const importSpot = async (req: Request, res: Response) => {
  try {
    const { placeId } = req.body;

    if (!placeId) {
      return res.status(400).json({ message: 'placeId is required' });
    }

    const placeData = await googleMapsService.getPlaceDetails(placeId);

    if (!placeData) {
      return res.status(404).json({ message: 'Place not found' });
    }

    // 重复检查
    const existing = await prisma.place.findUnique({
      where: { googlePlaceId: placeData.googlePlaceId },
    });
    if (existing) {
      return res.json({
        message: 'Place already exists',
        place: existing,
        isDuplicate: true,
      });
    }

    // 使用 Prisma ORM 创建
    const place = await prisma.place.create({
      data: {
        googlePlaceId: placeData.googlePlaceId,
        name: placeData.name,
        city: placeData.city,
        country: placeData.country,
        latitude: placeData.latitude,
        longitude: placeData.longitude,
        address: placeData.address,
        description: placeData.description,
        openingHours: placeData.openingHours,
        rating: placeData.rating,
        ratingCount: placeData.ratingCount,
        category: placeData.category,
        tags: placeData.tags ? JSON.parse(placeData.tags) : [],
        coverImage: placeData.coverImage,
        images: placeData.images ? JSON.parse(placeData.images) : [],
        priceLevel: placeData.priceLevel,
        website: placeData.website,
        phoneNumber: placeData.phoneNumber,
        source: 'user_import',
      },
    });

    return res.json({
      message: 'Place imported successfully',
      place,
      isDuplicate: false,
    });
  } catch (error) {
    logger.error('Import Place error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * 获取地点列表
 * GET /api/places
 */
export const getPlaces = async (req: Request, res: Response) => {
  try {
    const {
      city,
      category,
      tags,
      search,
      lat,
      lng,
      radius = '5000',
      limit = '30',
    } = req.query;

    const where: any = {};

    if (city) {
      where.city = String(city);
    }

    if (category) {
      where.category = String(category);
    }

    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: 'insensitive' } },
        { address: { contains: String(search), mode: 'insensitive' } },
        { description: { contains: String(search), mode: 'insensitive' } },
      ];
    }

    // 经纬度筛选
    if (lat && lng) {
      const latitude = parseFloat(String(lat));
      const longitude = parseFloat(String(lng));
      const radiusNum = parseInt(String(radius));

      const latDelta = radiusNum / 111000;
      const lngDelta = radiusNum / (111000 * Math.cos(latitude * Math.PI / 180));

      where.latitude = { gte: latitude - latDelta, lte: latitude + latDelta };
      where.longitude = { gte: longitude - lngDelta, lte: longitude + lngDelta };
    }

    const places = await prisma.place.findMany({
      where,
      take: parseInt(String(limit)),
      orderBy: { rating: 'desc' },
    });

    return res.json({ count: places.length, places });
  } catch (error) {
    logger.error('Get Places error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * 根据 ID 获取地点详情
 * GET /api/places/:id
 */
export const getPlaceById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const place = await prisma.place.findUnique({ where: { id } });
    
    if (!place) {
      return res.status(404).json({ message: 'Place not found' });
    }

    return res.json(place);
  } catch (error) {
    logger.error('Get Place error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * 获取城市中心的默认地点
 * GET /api/places/city-center/:city
 */
export const getCityCenterPlaces = async (req: Request, res: Response) => {
  try {
    const { city } = req.params;

    const cityCoordinates: { [key: string]: { lat: number; lng: number } } = {
      copenhagen: { lat: 55.6761, lng: 12.5683 },
      porto: { lat: 41.1579, lng: -8.6291 },
      paris: { lat: 48.8566, lng: 2.3522 },
      tokyo: { lat: 35.6762, lng: 139.6503 },
      barcelona: { lat: 41.3874, lng: 2.1686 },
      amsterdam: { lat: 52.3676, lng: 4.9041 },
    };

    const coords = cityCoordinates[city.toLowerCase()];
    if (!coords) {
      return res.status(404).json({ message: 'City not found' });
    }

    const places = await prisma.place.findMany({
      where: { city: { equals: city, mode: 'insensitive' } },
      orderBy: [{ rating: 'desc' }, { ratingCount: 'desc' }],
      take: 30,
    });

    return res.json({ city, center: coords, count: places.length, places });
  } catch (error) {
    logger.error('Get City Center Places error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * 从 publicPlace ID 获取 Place 信息
 * POST /api/places/from-public-place
 */
export const getOrCreatePlaceFromPublicPlace = async (req: Request, res: Response) => {
  try {
    const { publicPlaceId } = req.body;

    if (!publicPlaceId) {
      return res.status(400).json({ message: 'publicPlaceId is required' });
    }

    const place = await prisma.place.findUnique({
      where: { id: publicPlaceId },
      select: { id: true, name: true, city: true, address: true },
    });

    if (!place) {
      return res.status(404).json({ message: 'Place not found' });
    }

    return res.json({ success: true, place });
  } catch (error) {
    logger.error('Get Place from PublicPlace error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * 批量从 publicPlace IDs 获取 Place 列表
 * POST /api/places/from-public-places
 */
export const getOrCreatePlacesFromPublicPlaces = async (req: Request, res: Response) => {
  try {
    const { publicPlaceIds } = req.body;

    if (!Array.isArray(publicPlaceIds) || publicPlaceIds.length === 0) {
      return res.status(400).json({ message: 'publicPlaceIds array is required' });
    }

    const places = await prisma.place.findMany({
      where: { id: { in: publicPlaceIds } },
      select: { id: true, name: true, city: true, address: true },
    });

    const results = publicPlaceIds.map(id => {
      const place = places.find(p => p.id === id);
      return place ? { id, place } : { id, error: 'Place not found' };
    });

    return res.json({ success: true, results });
  } catch (error) {
    logger.error('Get Places from PublicPlaces error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * 同步地点数据
 * POST /api/places/sync
 */
export const syncPlaceData = async (_req: Request, res: Response) => {
  try {
    return res.json({ message: 'Sync not implemented yet' });
  } catch (error) {
    logger.error('Sync Place error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};


/**
 * AI 解析用户查询意图
 * POST /api/places/ai/parse-intent
 * 
 * 使用 aiService 的 fallback 机制，按 AI_PROVIDER_ORDER 顺序尝试：
 * kouri (OpenAI 代理) → gemini → azure_openai
 */
export const parseQueryIntent = async (req: Request, res: Response) => {
  try {
    const { query } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ message: 'query is required' });
    }

    const aiService = (await import('../services/aiService')).default;
    
    // 检查是否有可用的 AI provider
    const availableProviders = aiService.getAvailableProviders();
    if (availableProviders.length === 0) {
      return res.status(500).json({ message: 'No AI providers configured' });
    }
    
    logger.info(`[parseQueryIntent] Available providers: ${availableProviders.join(', ')}`);
    logger.info(`[parseQueryIntent] Provider order: ${aiService.getProviderOrder().join(', ')}`);
    
    const systemPrompt = 'You are a travel search query analyzer. Extract user intent and return valid JSON only.';
    
    const prompt = `Analyze this travel search query and extract the user's intent:
"${query}"

Return a JSON object with these fields:
{
  "city": "city name in English (e.g., Rome, Copenhagen, Tokyo, Chiang Mai)",
  "country": "country name in English if mentioned",
  "category": "place category if mentioned (e.g., cafe, restaurant, museum, park, landmark)",
  "tags": ["relevant tags to search for, including movie names, themes, styles"],
  "limit": number of places requested (default 5, extract if user says "two", "3", etc.),
  "wants_popular": true if user wants popular/famous/best places,
  "wants_random": true if user wants random/interesting/surprising places,
  "specific_place_name": "exact place name if user is looking for a specific place",
  "nearby_location": "location name if user wants places NEAR a specific place/landmark/area",
  "wants_near_me": true if user says "near me", "around me", "我附近", "附近" without specifying a location
}

Important:
- ALWAYS translate city names to English (罗马 → Rome, 巴黎 → Paris, 东京 → Tokyo)
- ALWAYS include the country when you can infer it from the city
- Return valid JSON only, no markdown code blocks`;

    // 使用 aiService 的 fallback 机制调用 AI
    const content = await aiService.executeWithFallback(
      (provider) => provider.generateText(prompt, systemPrompt),
      'parseQueryIntent'
    );
    
    // 解析 JSON
    let jsonText = content.trim();
    
    // 移除可能的 markdown 代码块
    if (jsonText.includes('```json')) {
      const start = jsonText.indexOf('```json') + 7;
      const end = jsonText.lastIndexOf('```');
      if (end > start) jsonText = jsonText.substring(start, end).trim();
    } else if (jsonText.includes('```')) {
      const start = jsonText.indexOf('```') + 3;
      const end = jsonText.lastIndexOf('```');
      if (end > start) jsonText = jsonText.substring(start, end).trim();
    }
    
    const jsonStart = jsonText.indexOf('{');
    const jsonEnd = jsonText.lastIndexOf('}');
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      jsonText = jsonText.substring(jsonStart, jsonEnd + 1);
    }
    
    const intent = JSON.parse(jsonText);
    logger.info(`[parseQueryIntent] Parsed intent: ${JSON.stringify(intent)}`);
    return res.json({ success: true, intent });
  } catch (error: any) {
    logger.error('Parse Intent error:', error.message || error);
    return res.status(500).json({ message: 'Failed to parse query intent', error: error.message });
  }
};

/**
 * AI 推荐地点
 * POST /api/places/ai/recommend
 * 
 * 使用 aiService 的 fallback 机制，按 AI_PROVIDER_ORDER 顺序尝试：
 * kouri (OpenAI 代理) → gemini → azure_openai
 */
export const getAIRecommendations = async (req: Request, res: Response) => {
  try {
    const { query, city, country, category, tags, limit = 5 } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ message: 'query is required' });
    }

    const aiService = (await import('../services/aiService')).default;
    
    // 检查是否有可用的 AI provider
    const availableProviders = aiService.getAvailableProviders();
    if (availableProviders.length === 0) {
      return res.status(500).json({ message: 'No AI providers configured' });
    }
    
    logger.info(`[getAIRecommendations] Available providers: ${availableProviders.join(', ')}`);
    
    const locationHint = city ? ` in ${city}${country ? ', ' + country : ''}` : '';
    const categoryHint = category ? ` (${category})` : '';
    const aiLimit = Math.min(limit, 5);

    const systemPrompt = 'You are a travel expert recommending real places. Return valid JSON only.';
    
    const prompt = `Based on this query: "${query}"

Recommend exactly ${aiLimit} specific, real, well-known places${locationHint}${categoryHint}.

${city ? `CRITICAL: All places MUST be located in ${city}. Do NOT recommend places from other cities.` : ''}

Return JSON:
{
  "locations": [
    {
      "name": "Exact place name (use the official name that can be found on Google Maps)",
      "city": "${city || 'City name'}",
      "country": "${country || 'Country name'}",
      "type": "Place type (cafe, restaurant, museum, etc.)",
      "tags": ["tag1", "tag2"]
    }
  ]
}

Rules:
- ONLY recommend real, existing places that can be found on Google Maps
- Use the EXACT official name of the place
- Maximum ${aiLimit} places
- Tags MUST be from: Museum, Attractions, Park, Cafe, Bakery, Restaurant, Art, Architecture, Historical, Landmark, Church, Temple, Shopping, Entertainment
- Maximum 3 tags per place
- Return valid JSON only, no markdown code blocks`;

    // 使用 aiService 的 fallback 机制调用 AI
    const content = await aiService.executeWithFallback(
      (provider) => provider.generateText(prompt, systemPrompt),
      'getAIRecommendations'
    );
    
    // 解析 JSON
    let jsonText = content.trim();
    if (jsonText.includes('```json')) {
      const start = jsonText.indexOf('```json') + 7;
      const end = jsonText.lastIndexOf('```');
      if (end > start) jsonText = jsonText.substring(start, end).trim();
    } else if (jsonText.includes('```')) {
      const start = jsonText.indexOf('```') + 3;
      const end = jsonText.lastIndexOf('```');
      if (end > start) jsonText = jsonText.substring(start, end).trim();
    }
    
    const jsonStart = jsonText.indexOf('{');
    const jsonEnd = jsonText.lastIndexOf('}');
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      jsonText = jsonText.substring(jsonStart, jsonEnd + 1);
    }
    
    const parsed = JSON.parse(jsonText);
    logger.info(`[getAIRecommendations] Got ${parsed.locations?.length || 0} recommendations`);
    return res.json({ success: true, locations: parsed.locations || [] });
  } catch (error: any) {
    logger.error('AI Recommend error:', error.message || error);
    return res.status(500).json({ message: 'Failed to get AI recommendations', error: error.message });
  }
};

/**
 * Google Maps 搜索代理 - 基础版（省钱）
 * POST /api/places/google/search
 * 只返回列表页需要的基础信息：place_id, 名称, 经纬度, 城市, 国家, 封面图, 评分, 评分人数
 */
export const searchGoogleMaps = async (req: Request, res: Response) => {
  try {
    const { query, city } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ message: 'query is required' });
    }

    const searchQuery = city ? `${query} ${city}` : query;
    logger.info(`Google Maps search (basic): ${searchQuery}`);

    // 使用省钱版搜索，只获取基础信息
    const result = await googleMapsService.searchPlaceBasic(searchQuery);

    if (!result) {
      return res.json({ success: true, place: null });
    }

    return res.json({ success: true, place: result });
  } catch (error: any) {
    logger.error('Google Maps search error:', error.message);
    return res.status(500).json({ message: 'Failed to search Google Maps' });
  }
};

/**
 * Google Maps 地点详情代理
 * POST /api/places/google/details
 */
export const getGooglePlaceDetails = async (req: Request, res: Response) => {
  try {
    const { placeId } = req.body;

    if (!placeId || typeof placeId !== 'string') {
      return res.status(400).json({ message: 'placeId is required' });
    }

    logger.info(`Google Maps details: ${placeId}`);

    const result = await googleMapsService.getPlaceDetails(placeId);

    if (!result) {
      return res.json({ success: true, place: null });
    }

    return res.json({ success: true, place: result });
  } catch (error: any) {
    logger.error('Google Maps details error:', error.message);
    return res.status(500).json({ message: 'Failed to get place details' });
  }
};
