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
import { aiFacetDictionaryService } from '../services/aiFacetDictionaryService';
import { AITagElement } from '../services/aiTagsGeneratorService';

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

/**
 * 构建展示标签：category_en + ai_tags 的并集
 * @param categoryEn 分类英文名
 * @param aiTags AI 标签数组（AITagElement[] 或字符串数组）
 * @returns 合并后的标签数组
 */
/**
 * 构建展示标签：category_en + ai_tags 的并集，返回字符串数组
 */
function buildDisplayTags(categoryEn: string | null | undefined, aiTags: any): string[] {
  const tags: string[] = [];
  
  // 1. 添加 category_en 作为第一个标签
  if (categoryEn && categoryEn.trim()) {
    tags.push(categoryEn.trim());
  }
  
  // 2. 添加 ai_tags（提取 en 字段）
  if (aiTags && Array.isArray(aiTags)) {
    for (const tag of aiTags) {
      let tagStr: string | null = null;
      if (typeof tag === 'string') {
        tagStr = tag;
      } else if (typeof tag === 'object' && tag !== null && tag.en) {
        tagStr = tag.en;
      }
      if (tagStr && tagStr.trim() && !tags.includes(tagStr.trim())) {
        tags.push(tagStr.trim());
      }
    }
  }
  
  return tags;
}

/**
 * 将 AI 推荐的简单 tags 规范化为 AITagElement[] 格式
 * 只保留在 ai_facet_dictionary 中存在的 facet
 * @param simpleTags AI 推荐返回的简单字符串标签
 * @param categorySlug 分类 slug
 * @returns 规范化后的 AITagElement[]
 */
async function normalizeAITagsToFacets(simpleTags: string[], categorySlug: string): Promise<AITagElement[]> {
  if (!simpleTags || simpleTags.length === 0) {
    return [];
  }
  
  const result: AITagElement[] = [];
  const allFacets = await aiFacetDictionaryService.getAllFacets();
  
  for (const tag of simpleTags) {
    if (result.length >= 2) break; // 最多 2 个
    
    const normalizedTag = tag.toLowerCase().trim();
    
    // 在 facet 字典中查找匹配
    for (const facet of allFacets) {
      // 检查是否允许用于该分类
      const isAllowed = await aiFacetDictionaryService.isFacetAllowedForCategory(facet.id, categorySlug);
      if (!isAllowed) continue;
      
      // 匹配检查（模糊匹配）
      const facetIdLower = facet.id.toLowerCase();
      const facetEnLower = facet.en.toLowerCase();
      
      if (normalizedTag === facetIdLower || 
          normalizedTag === facetEnLower ||
          normalizedTag.includes(facetIdLower) ||
          facetIdLower.includes(normalizedTag) ||
          normalizedTag.includes(facetEnLower) ||
          facetEnLower.includes(normalizedTag)) {
        
        // 检查是否已添加
        if (!result.some(r => r.id === facet.id)) {
          result.push({
            kind: 'facet',
            id: facet.id,
            en: facet.en,
            zh: facet.zh,
            priority: facet.priority,
          });
          break; // 找到匹配后跳出内层循环
        }
      }
    }
  }
  
  return result;
}

/**
 * 更新地点的 ai_tags（如果为空）
 */
async function updatePlaceAITags(placeId: string, aiTags: AITagElement[]): Promise<void> {
  if (!placeId || aiTags.length === 0) return;
  
  try {
    await prisma.place.update({
      where: { id: placeId },
      data: { aiTags: aiTags as any },
    });
    logger.info(`[SearchV2] Updated ai_tags for place ${placeId}`);
  } catch (error) {
    logger.warn(`[SearchV2] Failed to update ai_tags for place ${placeId}: ${error}`);
  }
}

// 常见城市名及其变体/拼写错误
const CITY_CORRECTIONS: Record<string, string> = {
  // Paris 变体
  'pairs': 'Paris', 'pari': 'Paris', 'parris': 'Paris', 'paaris': 'Paris',
  // Rome 变体
  'roma': 'Rome', 'rom': 'Rome', 'roome': 'Rome',
  // Tokyo 变体
  'tokio': 'Tokyo', 'tokyio': 'Tokyo', 'toko': 'Tokyo',
  // London 变体
  'londn': 'London', 'londen': 'London', 'londun': 'London',
  // New York 变体
  'newyork': 'New York', 'ny': 'New York', 'nyc': 'New York',
  // Barcelona 变体
  'barca': 'Barcelona', 'barcelone': 'Barcelona', 'barselona': 'Barcelona',
  // Madrid 变体
  'madird': 'Madrid', 'madrид': 'Madrid',
  // Berlin 变体
  'berlín': 'Berlin', 'berlim': 'Berlin',
  // Amsterdam 变体
  'amsterdm': 'Amsterdam', 'amstrdam': 'Amsterdam',
  // Vienna 变体
  'wien': 'Vienna', 'viena': 'Vienna',
  // Prague 变体
  'praha': 'Prague', 'prag': 'Prague',
  // Florence 变体
  'firenze': 'Florence', 'florencia': 'Florence',
  // Venice 变体
  'venezia': 'Venice', 'venecia': 'Venice',
  // Milan 变体
  'milano': 'Milan', 'mailand': 'Milan',
  // Munich 变体
  'münchen': 'Munich', 'munchen': 'Munich', 'muenchen': 'Munich',
  // Kyoto 变体
  'kioto': 'Kyoto', 'kyouto': 'Kyoto',
  // Osaka 变体
  'oosaka': 'Osaka',
  // Seoul 变体
  'seul': 'Seoul', 'souel': 'Seoul',
  // Bangkok 变体
  'bankok': 'Bangkok', 'bangok': 'Bangkok',
  // Singapore 变体
  'singapur': 'Singapore', 'singapor': 'Singapore',
  // Sydney 变体
  'sydeny': 'Sydney', 'sydny': 'Sydney',
  // Melbourne 变体
  'melborne': 'Melbourne', 'melbourn': 'Melbourne',
  // San Francisco 变体
  'sf': 'San Francisco', 'sanfrancisco': 'San Francisco',
  // Los Angeles 变体
  'la': 'Los Angeles', 'losangeles': 'Los Angeles',
  // Chicago 变体
  'chicgo': 'Chicago', 'chigago': 'Chicago',
};

/**
 * 校正城市名拼写错误
 */
function correctCityName(city: string): string {
  if (!city) return city;
  const lower = city.toLowerCase().trim();
  
  // 直接匹配
  if (CITY_CORRECTIONS[lower]) {
    logger.info(`[SearchV2] Corrected city: "${city}" -> "${CITY_CORRECTIONS[lower]}"`);
    return CITY_CORRECTIONS[lower];
  }
  
  // 模糊匹配（编辑距离 <= 2）
  for (const [variant, correct] of Object.entries(CITY_CORRECTIONS)) {
    if (levenshteinDistance(lower, variant) <= 2) {
      logger.info(`[SearchV2] Fuzzy corrected city: "${city}" -> "${correct}"`);
      return correct;
    }
    // 也检查正确名称的模糊匹配
    if (levenshteinDistance(lower, correct.toLowerCase()) <= 2) {
      logger.info(`[SearchV2] Fuzzy corrected city: "${city}" -> "${correct}"`);
      return correct;
    }
  }
  
  // 首字母大写
  return city.charAt(0).toUpperCase() + city.slice(1).toLowerCase();
}

/**
 * 计算编辑距离（Levenshtein Distance）
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

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
  
  // 分类匹配（不区分大小写）
  const categoryKeywords = Object.keys(CATEGORY_MAPPING);
  for (const keyword of categoryKeywords) {
    if (query.toLowerCase().includes(keyword)) {
      result.category = keyword;
      break;
    }
  }
  
  // 城市匹配 - 使用更严格的模式，避免误匹配普通单词
  const cityPatterns = [
    /(?:in|at|around|near)\s+([A-Z][a-zA-Z\s]+?)(?:\s|$|,)/i,
    /([A-Z][a-zA-Z]+)\s+(?:cafes?|restaurants?|places?|spots?|museums?|temples?|shrines?|bars?)/i,
  ];
  
  for (const pattern of cityPatterns) {
    const match = query.match(pattern);
    if (match && match[1]) {
      const potentialCity = match[1].trim();
      // 排除常见的非城市词
      const nonCityWords = ['help', 'find', 'show', 'recommend', 'interesting', 'best', 'good', 'nice', 'great', 'some', 'any', 'the', 'me', 'please'];
      if (!nonCityWords.includes(potentialCity.toLowerCase())) {
        result.city = correctCityName(potentialCity);
        break;
      }
    }
  }
  
  logger.info(`[SearchV2] Parsed query: count=${result.count}, category="${result.category}", city="${result.city}"`);
  return result;
}

// 意图类型
type IntentType = 'specific_place' | 'general_search' | 'need_clarification';

interface IntentResult {
  intent: IntentType;
  placeName?: string;        // 具体地点名（specific_place 时）
  city?: string;             // 城市
  category?: string;         // 分类
  count?: number;            // 数量
  clarificationMessage?: string; // 需要澄清时的提示语
}

/**
 * 使用 AI 识别用户意图
 */
async function detectIntent(query: string, language: string): Promise<IntentResult> {
  const prompt = `Analyze this travel query and determine the user's intent.

Query: "${query}"

Classify into ONE of these intents:
1. "specific_place" - User wants info about a SPECIFIC place (e.g., "Eiffel Tower", "help me find Louvre Museum", "tell me about Central Park")
2. "general_search" - User wants to discover multiple places with some criteria (e.g., "8 restaurants in Tokyo", "cafes in Paris", "best museums in Rome")
3. "need_clarification" - Query is too vague, missing city AND category (e.g., "recommend places", "find something interesting")

Return JSON only:
{
  "intent": "specific_place" | "general_search" | "need_clarification",
  "placeName": "exact place name if specific_place",
  "city": "city name if mentioned or can be inferred",
  "category": "restaurant/cafe/museum/temple/park/bar/shop/hotel or empty",
  "count": number or null,
  "clarificationMessage": "message to ask user for more details if need_clarification, in ${language === 'zh' ? 'Chinese' : 'English'}"
}`;

  try {
    const response = await Promise.race([
      kouriProvider.generateText(prompt),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Intent detection timeout')), 10000)),
    ]);
    
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      logger.info(`[SearchV2] Intent detected: ${JSON.stringify(result)}`);
      return result;
    }
  } catch (error) {
    logger.warn(`[SearchV2] Intent detection failed: ${error}`);
  }
  
  // 回退：简单规则判断
  return fallbackIntentDetection(query, language);
}

/**
 * 回退的意图检测（不依赖 AI）
 */
function fallbackIntentDetection(query: string, language: string): IntentResult {
  const lower = query.toLowerCase();
  
  // 检查是否是具体地点查询
  const specificPlacePatterns = [
    /(?:find|about|tell me about|show me|what is|where is)\s+(?:the\s+)?([A-Z][a-zA-Z\s''-]+)/i,
    /^([A-Z][a-zA-Z\s''-]+)$/,  // 只有地点名
  ];
  
  for (const pattern of specificPlacePatterns) {
    const match = query.match(pattern);
    if (match && match[1]) {
      const potentialPlace = match[1].trim();
      // 排除泛泛的词
      const genericWords = ['restaurants', 'cafes', 'places', 'spots', 'museums', 'bars', 'hotels', 'shops'];
      if (!genericWords.some(w => potentialPlace.toLowerCase().includes(w))) {
        return {
          intent: 'specific_place',
          placeName: potentialPlace,
        };
      }
    }
  }
  
  // 检查是否有城市和分类
  const hasCity = /(?:in|at|around|near)\s+[A-Z][a-z]+/i.test(query) || 
                  Object.keys(CITY_CORRECTIONS).some(c => lower.includes(c)) ||
                  ['paris', 'tokyo', 'rome', 'london', 'new york', 'barcelona', 'madrid', 'berlin'].some(c => lower.includes(c));
  
  const hasCategory = Object.keys(CATEGORY_MAPPING).some(k => lower.includes(k));
  
  if (hasCity || hasCategory) {
    return {
      intent: 'general_search',
      city: hasCity ? '' : undefined, // 让 parseQuery 处理
      category: hasCategory ? '' : undefined,
    };
  }
  
  // 需要澄清
  return {
    intent: 'need_clarification',
    clarificationMessage: language === 'zh' 
      ? '为了更好地帮助您，请告诉我您想去的城市和感兴趣的类型（如餐厅、咖啡馆、博物馆等）'
      : 'To help you better, please tell me which city you\'d like to explore and what type of places interest you (e.g., restaurants, cafes, museums)',
  };
}

/**
 * 处理具体地点查询
 */
async function handleSpecificPlaceQuery(
  placeName: string,
  language: string
): Promise<{ place: PlaceResult | null; description: string }> {
  logger.info(`[SearchV2] Handling specific place query: "${placeName}"`);
  
  // 1. 先在数据库中查找
  const candidates = await prisma.place.findMany({
    where: {
      OR: [
        { name: { contains: placeName, mode: 'insensitive' } },
        { name: { contains: placeName.split(' ')[0], mode: 'insensitive' } },
      ],
    },
    take: 10,
  });
  
  // 找最匹配的（优先有图片的）
  let bestMatch: any = null;
  let bestScore = 0;
  
  for (const candidate of candidates) {
    const similarity = calculateNameSimilarity(placeName, candidate.name);
    if (similarity > bestScore) {
      // 如果分数相近，优先选有图片的
      if (bestMatch && similarity - bestScore < 0.1) {
        if (candidate.coverImage && !bestMatch.coverImage) {
          bestMatch = candidate;
          bestScore = similarity;
        }
      } else {
        bestMatch = candidate;
        bestScore = similarity;
      }
    }
  }
  
  // 2. 用 AI 生成介绍
  const descriptionPrompt = `Write a brief, engaging introduction about "${placeName}" for a traveler.
Include: what it is, why it's notable, and a tip for visitors.
Keep it 2-3 sentences, under 60 words.
Response in ${language === 'zh' ? 'Chinese' : 'English'}.`;

  let description = '';
  try {
    description = await Promise.race([
      kouriProvider.generateText(descriptionPrompt),
      new Promise<string>((resolve) => setTimeout(() => resolve(''), 15000)),
    ]);
    // 清理 AI 响应
    description = description.replace(/^["']|["']$/g, '').trim();
  } catch (error) {
    logger.warn(`[SearchV2] Failed to generate description: ${error}`);
  }
  
  if (bestMatch && bestScore >= 0.6) {
    const hasRating = bestMatch.rating !== null && bestMatch.rating > 0;
    const placeResult: PlaceResult = {
      id: bestMatch.id,
      name: bestMatch.name,
      summary: description || bestMatch.aiDescription || '',
      coverImage: bestMatch.coverImage || '',
      latitude: bestMatch.latitude,
      longitude: bestMatch.longitude,
      city: bestMatch.city || '',
      country: bestMatch.country || '',
      rating: bestMatch.rating,
      ratingCount: bestMatch.ratingCount,
      tags: buildDisplayTags(bestMatch.categoryEn, bestMatch.aiTags),
      isVerified: hasRating || bestMatch.isVerified || false,
      source: 'cache',
      address: bestMatch.address,
      phoneNumber: bestMatch.phoneNumber,
      website: bestMatch.website,
      openingHours: bestMatch.openingHours,
    };
    
    return { place: placeResult, description };
  }
  
  // 没找到数据库匹配，只返回 AI 介绍
  return { place: null, description };
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
    
    // 收集所有匹配的候选（名称相似 + 位置接近）
    const validCandidates: { candidate: any; score: number }[] = [];
    
    for (const candidate of candidates) {
      const nameSimilarity = calculateNameSimilarity(aiPlace.name, candidate.name);
      const latDiff = Math.abs(aiPlace.latitude - candidate.latitude);
      const lngDiff = Math.abs(aiPlace.longitude - candidate.longitude);
      const isNearby = latDiff < CONFIG.COORDINATE_THRESHOLD && lngDiff < CONFIG.COORDINATE_THRESHOLD;
      
      if (nameSimilarity >= CONFIG.NAME_SIMILARITY_THRESHOLD && isNearby) {
        const score = nameSimilarity + (1 - (latDiff + lngDiff) / CONFIG.COORDINATE_THRESHOLD);
        validCandidates.push({ candidate, score });
      }
    }
    
    // 如果有多个匹配，优先选择有图片的
    if (validCandidates.length > 0) {
      // 按分数排序
      validCandidates.sort((a, b) => b.score - a.score);
      
      // 在分数相近的候选中（差距 < 0.1），优先选择有图片的
      const topScore = validCandidates[0].score;
      const closeMatches = validCandidates.filter(v => topScore - v.score < 0.1);
      
      // 优先选择有图片的
      const withImage = closeMatches.find(v => v.candidate.coverImage && v.candidate.coverImage !== '');
      if (withImage) {
        bestMatch = withImage.candidate;
        bestScore = withImage.score;
        if (closeMatches.length > 1) {
          logger.info(`[SearchV2] Found ${closeMatches.length} similar places for "${aiPlace.name}", chose one with image: "${bestMatch.name}"`);
        }
      } else {
        // 没有有图片的，选分数最高的
        bestMatch = validCandidates[0].candidate;
        bestScore = validCandidates[0].score;
      }
    }
    
    if (bestMatch) {
      const hasRating = bestMatch.rating !== null && bestMatch.rating > 0;
      
      // 检查数据库中是否有 ai_tags
      const hasDbAiTags = bestMatch.aiTags && Array.isArray(bestMatch.aiTags) && bestMatch.aiTags.length > 0;
      
      let finalAiTags: AITagElement[] | string[] = [];
      
      if (hasDbAiTags) {
        // 使用数据库中的 ai_tags
        finalAiTags = bestMatch.aiTags;
      } else if (aiPlace.tags && aiPlace.tags.length > 0) {
        // 数据库没有 ai_tags，将 AI 推荐的 tags 规范化
        const categorySlug = bestMatch.categorySlug || 'other';
        const normalizedTags = await normalizeAITagsToFacets(aiPlace.tags, categorySlug);
        
        if (normalizedTags.length > 0) {
          finalAiTags = normalizedTags;
          // 异步保存到数据库（不阻塞主流程）
          updatePlaceAITags(bestMatch.id, normalizedTags).catch(err => 
            logger.warn(`[SearchV2] Failed to save normalized ai_tags: ${err}`)
          );
        }
      }
      
      const displayTags = buildDisplayTags(bestMatch.categoryEn, finalAiTags);
      logger.info(`[SearchV2] Matched "${aiPlace.name}" -> "${bestMatch.name}" (coverImage: ${bestMatch.coverImage ? 'YES' : 'NO'}, categoryEn: ${bestMatch.categoryEn}, displayTags: ${JSON.stringify(displayTags)})`);
      
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
        tags: displayTags,
        isVerified: hasRating || bestMatch.isVerified || false,
        source: 'cache',
        address: bestMatch.address,
        phoneNumber: bestMatch.phoneNumber,
        website: bestMatch.website,
        openingHours: bestMatch.openingHours,
      });
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
    // 多取一些数据，然后随机打乱，实现每次结果不同
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
      take: limit * 3, // 多取3倍数据用于随机
    });
    
    // 随机打乱数组（Fisher-Yates shuffle）
    const shuffled = [...rawPlaces];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    for (const p of shuffled) {
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
            tags: buildDisplayTags(dbPlace.categoryEn, dbPlace.aiTags),
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
      tags: buildDisplayTags(p.categoryEn, p.aiTags),
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
    const { query, userId, language = 'en', excludePlaceIds = [] } = req.body;
    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        success: false, error: 'query is required', acknowledgment: '',
        places: [], overallSummary: '', quotaRemaining: 0, stage: 'complete',
      });
    }

    logger.info(`[SearchV2] Starting search for: "${query}"`);
    
    // ========== 第零步：意图识别 ==========
    const intent = await detectIntent(query, language);
    logger.info(`[SearchV2] Detected intent: ${intent.intent}`);
    
    // 处理需要澄清的情况
    if (intent.intent === 'need_clarification') {
      return res.json({
        success: true,
        acknowledgment: intent.clarificationMessage || 'Please provide more details about what you\'re looking for.',
        places: [],
        categories: [],
        overallSummary: '',
        quotaRemaining: 10,
        stage: 'need_clarification',
        needsClarification: true,
      });
    }
    
    // 处理具体地点查询
    if (intent.intent === 'specific_place' && intent.placeName) {
      const { place, description } = await handleSpecificPlaceQuery(intent.placeName, language);
      
      // 消耗配额
      let quotaRemaining = 10;
      if (userId) {
        try {
          await quotaService.consumeQuota(userId);
          quotaRemaining = await quotaService.getRemainingQuota(userId);
        } catch (error) {
          logger.warn(`[SearchV2] Quota error: ${error}`);
        }
      }
      
      return res.json({
        success: true,
        acknowledgment: description,
        places: place ? [place] : [],
        categories: [],
        overallSummary: '',
        quotaRemaining,
        stage: 'complete',
        isSpecificPlace: true,
      });
    }
    
    // ========== 继续原有的泛泛搜索流程 ==========
    const parsedQuery = parseQuery(query);
    
    // 如果 AI 意图识别返回了城市/分类，优先使用
    if (intent.city) {
      parsedQuery.city = correctCityName(intent.city);
    }
    if (intent.category) {
      parsedQuery.category = intent.category;
    }
    if (intent.count) {
      parsedQuery.count = Math.min(Math.max(intent.count, 1), 20);
    }
    
    const targetCount = parsedQuery.count;

    // 获取用户今日已收藏的地点（需要排除）
    let userSavedPlaceIds: Set<string> = new Set();
    if (userId) {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // 查询用户今日收藏的地点
        const savedSpots = await prisma.$queryRaw<{spot_id: string}[]>`
          SELECT DISTINCT ts.spot_id 
          FROM trip_spots ts
          JOIN trips t ON ts.trip_id = t.id
          WHERE t.user_id = ${userId}
          AND ts.created_at >= ${today}
        `;
        userSavedPlaceIds = new Set(savedSpots.map(s => s.spot_id));
        logger.info(`[SearchV2] User has ${userSavedPlaceIds.size} saved places today`);
      } catch (error) {
        logger.warn(`[SearchV2] Failed to get user saved places: ${error}`);
      }
    }
    
    // 合并前端传来的排除列表
    const allExcludeIds = new Set([...userSavedPlaceIds, ...excludePlaceIds]);

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

    // ========== 第一步：获取 AI 推荐 ==========
    // AI 会从 query 中解析用户请求的数量，返回相应数量的推荐
    // 如果用户没有指定数量，默认返回 20 个
    logger.info(`[SearchV2] Step 1: Getting AI recommendations (target: ${targetCount})...`);
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

    // 收集最终结果（只包含有图片的地点）
    let finalPlaces: PlaceResult[] = [];
    let acknowledgment = aiRecommendations?.acknowledgment || '';
    const usedIds = new Set<string>();
    const usedNames = new Set<string>();
    
    // 辅助函数：检查地点是否有图片
    const hasImage = (p: PlaceResult | any) => p.coverImage && p.coverImage !== '';
    
    // 辅助函数：添加地点到结果（去重 + 过滤已收藏）
    const addPlace = (place: PlaceResult): boolean => {
      const normalizedName = place.name.toLowerCase().trim();
      if (usedIds.has(place.id) || usedNames.has(normalizedName)) {
        return false;
      }
      // 过滤用户今日已收藏的地点
      if (allExcludeIds.has(place.id)) {
        logger.info(`[SearchV2] Skipping "${place.name}" - already saved by user`);
        return false;
      }
      if (!hasImage(place)) {
        logger.info(`[SearchV2] Skipping "${place.name}" - no image`);
        return false;
      }
      usedIds.add(place.id);
      usedNames.add(normalizedName);
      finalPlaces.push(place);
      return true;
    };

    // ========== 第二步：优先级 1 - AI 匹配到数据库的地点（有图片） ==========
    if (aiRecommendations && aiRecommendations.places.length > 0) {
      logger.info('[SearchV2] Step 2: Matching AI places against Supabase...');
      const matchedPlaces = await matchAIPlacesFromDB(aiRecommendations.places);
      logger.info(`[SearchV2] Matched ${matchedPlaces.size}/${aiRecommendations.places.length} AI places`);
      
      // 异步保存未匹配的 AI 地点到数据库（不阻塞主流程）
      const matchedNames = new Set(matchedPlaces.keys());
      saveUnmatchedAIPlacesToDB(aiRecommendations.places, matchedNames, parsedQuery.category)
        .catch(err => logger.warn(`[SearchV2] Failed to save AI places: ${err}`));
      
      // 添加有图片的匹配地点
      for (const [, place] of matchedPlaces) {
        if (finalPlaces.length >= targetCount) break;
        addPlace(place);
      }
      logger.info(`[SearchV2] After AI match: ${finalPlaces.length}/${targetCount} places with images`);
    }

    // ========== 第三步：优先级 2 - AI 结果 + Web Search 图片 ==========
    if (finalPlaces.length < targetCount && aiRecommendations && aiRecommendations.places.length > 0) {
      logger.info('[SearchV2] Step 3: Searching images for unmatched AI places...');
      
      // 找出未匹配的 AI 地点
      const unmatchedAIPlaces = aiRecommendations.places.filter(
        p => !usedNames.has(p.name.toLowerCase().trim())
      );
      
      // 为未匹配的 AI 地点搜索图片（限制数量避免太慢）
      const placesToSearch = unmatchedAIPlaces.slice(0, Math.min(10, targetCount - finalPlaces.length));
      logger.info(`[SearchV2] Searching images for ${placesToSearch.length} unmatched AI places...`);
      
      const imageSearchResults = await Promise.all(
        placesToSearch.map(async (aiPlace) => {
          try {
            const imageUrl = await Promise.race([
              kouriProvider.searchPlaceImage(aiPlace.name, aiPlace.city || parsedQuery.city),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), CONFIG.IMAGE_SEARCH_TIMEOUT_MS)),
            ]);
            return { aiPlace, imageUrl };
          } catch (error) {
            return { aiPlace, imageUrl: null };
          }
        })
      );
      
      // 添加搜索到图片的 AI 地点
      for (const { aiPlace, imageUrl } of imageSearchResults) {
        if (finalPlaces.length >= targetCount) break;
        if (imageUrl) {
          logger.info(`[SearchV2] Found image for AI place "${aiPlace.name}"`);
          const place: PlaceResult = {
            id: `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: aiPlace.name,
            summary: aiPlace.summary || '',
            coverImage: imageUrl,
            latitude: aiPlace.latitude,
            longitude: aiPlace.longitude,
            city: aiPlace.city || parsedQuery.city,
            country: aiPlace.country || '',
            rating: null,
            ratingCount: null,
            tags: buildDisplayTags(null, aiPlace.tags),
            isVerified: false,
            source: 'ai',
            address: undefined,
            phoneNumber: undefined,
            website: undefined,
            openingHours: undefined,
          };
          addPlace(place);
        }
      }
      logger.info(`[SearchV2] After web search: ${finalPlaces.length}/${targetCount} places with images`);
    }

    // ========== 第四步：优先级 3 - Supabase 补充数据（必须有图片） ==========
    if (finalPlaces.length < targetCount && parsedQuery.city) {
      const needed = targetCount - finalPlaces.length;
      logger.info(`[SearchV2] Step 4: Need ${needed} more places, supplementing from Supabase...`);
      
      const excludeIds = Array.from(usedIds);
      const excludeNames = Array.from(usedNames);
      
      // 多取一些作为缓冲
      const supplementPlaces = await getPlacesByCategory(
        parsedQuery.city, parsedQuery.category, excludeIds, needed * 2, excludeNames
      );
      
      logger.info(`[SearchV2] Found ${supplementPlaces.length} supplement places from Supabase`);
      
      for (const p of supplementPlaces) {
        if (finalPlaces.length >= targetCount) break;
        // getPlacesByCategory 已经过滤了没图片的，但再检查一次
        if (!p.coverImage || p.coverImage === '') continue;
        
        const hasRating = p.rating !== null && p.rating > 0;
        const place: PlaceResult = {
          id: p.id,
          name: p.name,
          summary: p.aiDescription || '',
          coverImage: p.coverImage,
          latitude: p.latitude,
          longitude: p.longitude,
          city: p.city || parsedQuery.city,
          country: p.country || '',
          rating: p.rating,
          ratingCount: p.ratingCount,
          tags: buildDisplayTags(p.categoryEn, p.aiTags),
          isVerified: hasRating || p.isVerified || false,
          source: 'cache',
          address: p.address || undefined,
          phoneNumber: p.phoneNumber || undefined,
          website: p.website || undefined,
          openingHours: p.openingHours || undefined,
        };
        addPlace(place);
      }
      logger.info(`[SearchV2] After Supabase supplement: ${finalPlaces.length}/${targetCount} places`);
    }

    // ========== 最终检查：确保所有地点都有图片 ==========
    finalPlaces = finalPlaces.filter(p => hasImage(p));
    logger.info(`[SearchV2] Final count after image filter: ${finalPlaces.length}/${targetCount}`);

    // ========== 第五步：为地点生成分类（如果地点数 >= 6） ==========
    let finalCategories: CategoryGroup[] = [];
    if (finalPlaces.length >= 6) {
      logger.info(`[SearchV2] Step 5: Generating categories for ${finalPlaces.length} places...`);
      
      const placeNames = finalPlaces.map(p => p.name).join(', ');
      const categoryPrompt = `Organize these ${finalPlaces.length} places into 2-4 categories.

Places: ${placeNames}

Requirements:
1. Create 2-4 categories with emoji titles (e.g., "🍽️ Fine Dining", "☕ Casual Eats", "🥐 Brunch Spots")
2. Each category should have 3-5 places
3. All places must be assigned to exactly one category
4. Response in ${language === 'zh' ? 'Chinese' : 'English'}

Return JSON only:
{
  "categories": [
    { "title": "🍽️ Category Name", "placeNames": ["Place 1", "Place 2", "Place 3"] }
  ]
}`;

      try {
        const categoryResponse = await Promise.race([
          kouriProvider.generateText(categoryPrompt),
          new Promise<string>((resolve) => setTimeout(() => resolve(''), 15000)),
        ]);
        
        if (categoryResponse) {
          logger.info(`[SearchV2] Category AI response: ${categoryResponse.substring(0, 500)}`);
          const jsonMatch = categoryResponse.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.categories && Array.isArray(parsed.categories)) {
              logger.info(`[SearchV2] AI returned ${parsed.categories.length} categories`);
              
              // 创建一个 Set 来跟踪已分配的地点
              const assignedPlaceIds = new Set<string>();
              
              for (const cat of parsed.categories) {
                if (cat.title && Array.isArray(cat.placeNames) && cat.placeNames.length >= 2) {
                  logger.info(`[SearchV2] Processing category "${cat.title}" with ${cat.placeNames.length} places: ${cat.placeNames.join(', ')}`);
                  const categoryPlaces: PlaceResult[] = [];
                  
                  for (const placeName of cat.placeNames) {
                    // 改进匹配逻辑：使用更宽松的匹配
                    const normalizedSearchName = placeName.toLowerCase().trim()
                      .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // 移除重音符号
                    
                    const place = finalPlaces.find(p => {
                      const normalizedPlaceName = p.name.toLowerCase().trim()
                        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                      
                      // 精确匹配
                      if (normalizedPlaceName === normalizedSearchName) return true;
                      // 包含匹配
                      if (normalizedPlaceName.includes(normalizedSearchName)) return true;
                      if (normalizedSearchName.includes(normalizedPlaceName)) return true;
                      // 首词匹配（处理 "Pink Mamma" vs "Pink" 的情况）
                      const searchFirstWord = normalizedSearchName.split(/\s+/)[0];
                      const placeFirstWord = normalizedPlaceName.split(/\s+/)[0];
                      if (searchFirstWord.length > 3 && placeFirstWord === searchFirstWord) return true;
                      
                      return false;
                    });
                    
                    if (place && !assignedPlaceIds.has(place.id)) {
                      categoryPlaces.push(place);
                      assignedPlaceIds.add(place.id);
                      logger.info(`[SearchV2] Matched "${placeName}" -> "${place.name}"`);
                    } else if (!place) {
                      logger.warn(`[SearchV2] Could not match "${placeName}" to any place`);
                    }
                  }
                  
                  if (categoryPlaces.length >= 2) {
                    finalCategories.push({ title: cat.title, places: categoryPlaces });
                    logger.info(`[SearchV2] Added category "${cat.title}" with ${categoryPlaces.length} places`);
                  } else {
                    logger.warn(`[SearchV2] Category "${cat.title}" has only ${categoryPlaces.length} places, skipping`);
                  }
                }
              }
              
              // 如果有未分配的地点，创建一个"其他"分类
              const unassignedPlaces = finalPlaces.filter(p => !assignedPlaceIds.has(p.id));
              if (unassignedPlaces.length > 0 && finalCategories.length > 0) {
                logger.info(`[SearchV2] ${unassignedPlaces.length} places not assigned to any category`);
                // 将未分配的地点添加到最后一个分类，或创建新分类
                if (unassignedPlaces.length >= 2) {
                  finalCategories.push({ 
                    title: language === 'zh' ? '🍽️ 更多推荐' : '🍽️ More Picks', 
                    places: unassignedPlaces 
                  });
                  logger.info(`[SearchV2] Created "More Picks" category with ${unassignedPlaces.length} places`);
                } else {
                  // 添加到最后一个分类
                  const lastCategory = finalCategories[finalCategories.length - 1];
                  lastCategory.places.push(...unassignedPlaces);
                  logger.info(`[SearchV2] Added ${unassignedPlaces.length} unassigned places to "${lastCategory.title}"`);
                }
              }
              
              logger.info(`[SearchV2] Final: ${finalCategories.length} categories with total ${finalCategories.reduce((sum, c) => sum + c.places.length, 0)} places`);
            }
          }
        }
      } catch (error) {
        logger.warn(`[SearchV2] Failed to generate categories: ${error}`);
      }
    }

    // ========== 第六步：为所有地点生成 AI summary（每次都动态生成） ==========
    // AI summary 是动态的，每次搜索都重新生成，不使用数据库中的 aiDescription
    logger.info(`[SearchV2] Step 6: Generating AI summaries for ${finalPlaces.length} places...`);
    
    if (finalPlaces.length > 0) {
      const placeNamesForSummary = finalPlaces.map(p => p.name).join(', ');
      const summaryPrompt = `Write a very brief 1-2 sentence summary for each place. Keep it SHORT and concise.

Places: ${placeNamesForSummary}
City: ${parsedQuery.city || 'this city'}
User search: "${parsedQuery.originalQuery}"

CRITICAL: Each summary MUST be 1-2 sentences only, under 30 words. No long descriptions.
Response in ${language === 'zh' ? 'Chinese' : 'English'}

Return JSON only:
{
  "summaries": [
    { "name": "Place Name", "summary": "One or two short sentences." }
  ]
}`;

      try {
        const summaryResponse = await Promise.race([
          kouriProvider.generateText(summaryPrompt),
          new Promise<string>((resolve) => setTimeout(() => resolve(''), 20000)),
        ]);
        
        if (summaryResponse) {
          const jsonMatch = summaryResponse.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.summaries && Array.isArray(parsed.summaries)) {
              for (const item of parsed.summaries) {
                if (item.name && item.summary) {
                  // 在 finalPlaces 中找到对应的地点并更新 summary
                  const place = finalPlaces.find(p => 
                    p.name.toLowerCase().includes(item.name.toLowerCase()) ||
                    item.name.toLowerCase().includes(p.name.toLowerCase())
                  );
                  if (place) {
                    place.summary = item.summary;
                    logger.info(`[SearchV2] Added summary for "${place.name}"`);
                  }
                  
                  // 同时更新 categories 中的地点
                  for (const cat of finalCategories) {
                    const catPlace = cat.places.find(p => 
                      p.name.toLowerCase().includes(item.name.toLowerCase()) ||
                      item.name.toLowerCase().includes(p.name.toLowerCase())
                    );
                    if (catPlace) {
                      catPlace.summary = item.summary;
                    }
                  }
                }
              }
              logger.info(`[SearchV2] Generated summaries for ${parsed.summaries.length} places`);
            }
          }
        }
      } catch (error) {
        logger.warn(`[SearchV2] Failed to generate summaries: ${error}`);
      }
    }

    // 不再生成 overallSummary - 只使用 acknowledgment 作为开头承接语

    if (userId) {
      try {
        await quotaService.consumeQuota(userId);
        quotaRemaining = await quotaService.getRemainingQuota(userId);
      } catch (error) {
        logger.error('[SearchV2] Error consuming quota:', error);
      }
    }

    const duration = Date.now() - startTime;
    logger.info(`[SearchV2] Completed in ${duration}ms: ${finalPlaces.length} places`);
    logger.info(`[SearchV2] Final places: ${finalPlaces.map(p => p.name).join(', ')}`);
    
    // Debug: Log tags for each place
    for (const place of finalPlaces) {
      logger.info(`[SearchV2] Place "${place.name}" tags: ${JSON.stringify(place.tags)}`);
    }

    return res.json({
      success: true,
      acknowledgment: acknowledgment || `Found ${finalPlaces.length} ${parsedQuery.category || 'places'} in ${parsedQuery.city}`,
      categories: finalCategories.length >= 2 ? finalCategories : undefined,
      places: finalPlaces,
      overallSummary: '', // 不再生成中间介绍，只保留开头承接语
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
