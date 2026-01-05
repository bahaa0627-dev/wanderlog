/**
 * Search V2 Controller
 * 
 * 新流程（按流程图）：
 * 1. 意图识别：分类为 general_search, specific_place, travel_consultation, non_travel
 * 2. 根据意图类型分发到不同处理器
 * 3. general_search: 保持原有流程（AI 推荐 + 数据库匹配 + 分类）
 * 4. specific_place: AI 描述 + 数据库匹配单个地点
 * 5. travel_consultation: Markdown 回答 + 相关地点
 * 6. non_travel: 纯 Markdown 回答，无数据库查询
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
import { intentClassifierService } from '../services/intentClassifierService';
import { validateImageUrl } from '../utils/imageValidator';
import crypto from 'crypto';

/**
 * Generate a stable ID for AI-generated places
 * Uses a hash of name + city + coordinates to ensure the same place always gets the same ID
 * This allows wishlist status to persist across sessions
 */
function generateStablePlaceId(name: string, city: string, latitude: number, longitude: number): string {
  // Normalize inputs for consistent hashing
  const normalizedName = name.toLowerCase().trim();
  const normalizedCity = (city || '').toLowerCase().trim();
  // Round coordinates to 4 decimal places (~11m precision) to handle minor variations
  const roundedLat = Math.round(latitude * 10000) / 10000;
  const roundedLng = Math.round(longitude * 10000) / 10000;
  
  const input = `${normalizedName}|${normalizedCity}|${roundedLat}|${roundedLng}`;
  const hash = crypto.createHash('md5').update(input).digest('hex').substring(0, 12);
  
  return `ai_${hash}`;
}

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
  MIN_PLACES_FOR_CARDS: 3, // 少于这个数量时，改用文本格式
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
 * @param categoryEn 分类英文名
 * @param aiTags AI 标签数组（AITagElement[] 或字符串数组）
 * @param language 语言参数，决定使用 'en' 或 'zh' 字段
 * @returns 合并后的标签数组
 */
function buildDisplayTags(
  categoryEn: string | null | undefined, 
  aiTags: any,
  language: 'en' | 'zh' = 'en'
): string[] {
  const tags: string[] = [];
  
  // 1. 添加 category_en 作为第一个标签
  if (categoryEn && categoryEn.trim()) {
    tags.push(categoryEn.trim());
  }
  
  // 2. 添加 ai_tags（根据语言参数提取对应字段）
  if (aiTags && Array.isArray(aiTags)) {
    for (const tag of aiTags) {
      let tagStr: string | null = null;
      if (typeof tag === 'string') {
        // Legacy format: use string as-is
        tagStr = tag;
      } else if (typeof tag === 'object' && tag !== null) {
        // Object format: use tag[language] with fallback to tag.en then tag.id
        tagStr = tag[language] || tag.en || tag.id || null;
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


/**
 * 将未匹配的 AI 地点保存到数据库（异步，不阻塞主流程）
 * 这样可以逐步丰富数据库内容
 * 
 * 重复检测策略：
 * 1. 名称完全匹配（不区分大小写）
 * 2. 名称相似度 > 0.8 且在同一城市
 * 3. 坐标接近（0.01 度约 1km）且名称相似度 > 0.6
 */
async function saveUnmatchedAIPlacesToDB(
  aiPlaces: AIPlace[],
  matchedNames: Set<string>,
  category: string
): Promise<void> {
  const unmatchedPlaces = aiPlaces.filter(p => !matchedNames.has(p.name));
  if (unmatchedPlaces.length === 0) return;
  
  logger.info(`[SearchV2] Checking ${unmatchedPlaces.length} unmatched AI places for duplicates...`);
  
  const categoryValue = CATEGORY_MAPPING[category]?.[0] || category || 'other';
  let savedCount = 0;
  let skippedCount = 0;
  
  for (const place of unmatchedPlaces) {
    try {
      // 策略1: 检查名称完全匹配（不区分大小写）
      const exactMatch = await prisma.place.findFirst({
        where: {
          name: { equals: place.name, mode: 'insensitive' },
        },
      });
      
      if (exactMatch) {
        logger.info(`[SearchV2] Skipping "${place.name}" - exact name match exists (id: ${exactMatch.id})`);
        skippedCount++;
        continue;
      }
      
      // 策略2: 检查同城市内名称相似的地点
      const sameCityPlaces = await prisma.place.findMany({
        where: {
          city: { equals: place.city, mode: 'insensitive' },
        },
        select: { id: true, name: true, latitude: true, longitude: true },
        take: 100,
      });
      
      let isDuplicate = false;
      for (const existing of sameCityPlaces) {
        const similarity = calculateNameSimilarity(place.name, existing.name);
        if (similarity > 0.8) {
          logger.info(`[SearchV2] Skipping "${place.name}" - similar to "${existing.name}" in same city (similarity: ${similarity.toFixed(2)})`);
          isDuplicate = true;
          break;
        }
      }
      
      if (isDuplicate) {
        skippedCount++;
        continue;
      }
      
      // 策略3: 检查坐标接近且名称相似的地点（跨城市）
      const nearbyPlaces = await prisma.place.findMany({
        where: {
          latitude: { gte: place.latitude - 0.01, lte: place.latitude + 0.01 },
          longitude: { gte: place.longitude - 0.01, lte: place.longitude + 0.01 },
        },
        select: { id: true, name: true, city: true },
        take: 50,
      });
      
      for (const existing of nearbyPlaces) {
        const similarity = calculateNameSimilarity(place.name, existing.name);
        if (similarity > 0.6) {
          logger.info(`[SearchV2] Skipping "${place.name}" - similar to nearby "${existing.name}" (similarity: ${similarity.toFixed(2)})`);
          isDuplicate = true;
          break;
        }
      }
      
      if (isDuplicate) {
        skippedCount++;
        continue;
      }
      
      // 没有重复，创建新地点
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
          coverImage: '',
        },
      });
      savedCount++;
      logger.info(`[SearchV2] Saved new AI place: "${place.name}" (${place.city})`);
    } catch (error) {
      logger.warn(`[SearchV2] Failed to save AI place "${place.name}": ${error}`);
    }
  }
  
  logger.info(`[SearchV2] AI places: saved ${savedCount}, skipped ${skippedCount} duplicates`);
}

async function matchAIPlacesFromDB(aiPlaces: AIPlace[], language: 'en' | 'zh' = 'en'): Promise<Map<string, PlaceResult>> {
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
      
      const displayTags = buildDisplayTags(bestMatch.categoryEn, finalAiTags, language);
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
  
  // 过滤掉非 UUID 格式的 ID（如 ai_xxx 格式）
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  const validExcludeIds = excludeIds.filter(id => uuidRegex.test(id));
  
  // 城市名称变体（Rome/Roma, etc.）
  const cityVariants = city ? [city] : [];
  if (city && city.toLowerCase() === 'rome') cityVariants.push('Roma');
  if (city && city.toLowerCase() === 'roma') cityVariants.push('Rome');
  
  // 构建城市条件（如果有城市）
  const cityConditions = cityVariants.length > 0 
    ? cityVariants.map(c => ({ city: { contains: c, mode: 'insensitive' as const } }))
    : null;
  
  // 构建 category 条件（case-insensitive）
  const categoryConditions = categoryValues.map(cat => ({
    categoryEn: { equals: cat, mode: 'insensitive' as const }
  }));
  
  let places: any[] = [];
  const seenNames = new Set(excludeNames.map(n => n.toLowerCase().trim()));
  
  if (categoryValues.length > 0) {
    // 构建查询条件
    const whereConditions: any[] = [
      { OR: categoryConditions },
      { id: { notIn: validExcludeIds } },
      { coverImage: { not: null } },
      { coverImage: { not: '' } },
    ];
    
    // 如果有城市条件，添加城市过滤
    if (cityConditions) {
      whereConditions.unshift({ OR: cityConditions });
    }
    
    // 多取一些数据，然后随机打乱，实现每次结果不同
    const rawPlaces = await prisma.place.findMany({
      where: { AND: whereConditions },
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
      const existingIds = [...validExcludeIds, ...places.map(p => p.id)];
      for (const keyword of categoryValues) {
        if (places.length >= limit) break;
        
        const moreWhereConditions: any[] = [
          { id: { notIn: existingIds } },
          { coverImage: { not: null } },
          { coverImage: { not: '' } },
          { name: { contains: keyword, mode: 'insensitive' } },
        ];
        
        if (cityConditions) {
          moreWhereConditions.unshift({ OR: cityConditions });
        }
        
        const morePlaces = await prisma.place.findMany({
          where: { AND: moreWhereConditions },
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
  } else if (cityConditions) {
    // 没有分类但有城市，按城市搜索
    places = await prisma.place.findMany({
      where: {
        AND: [
          { OR: cityConditions },
          { id: { notIn: validExcludeIds } },
          { coverImage: { not: null } },
          { coverImage: { not: '' } },
        ],
      },
      orderBy: [{ rating: 'desc' }, { ratingCount: 'desc' }],
      take: limit,
    });
  }
  // 如果既没有分类也没有城市，返回空数组
  
  logger.info(`[SearchV2] Found ${places.length} places for category "${category}" in "${city || 'global'}"`);
  return places;
}

/**
 * 当有图片的地点数量不足时，生成 Markdown 格式的文本回复
 * 格式：**地点名**\n描述
 */
async function generateTextOnlyResponse(
  aiPlaces: AIPlace[],
  query: string,
  language: string
): Promise<string> {
  if (aiPlaces.length === 0) {
    return '';
  }
  
  const languageText = language === 'zh' ? 'Chinese' : 'English';
  const placeList = aiPlaces.map(p => `- ${p.name} (${p.city || 'unknown city'})`).join('\n');
  
  const prompt = `Based on the user's search "${query}", write a helpful response about these places.

Places:
${placeList}

Requirements:
1. Write a brief introduction (1-2 sentences)
2. For each place, format as:
   **Place Name**
   Brief 1-2 sentence description of why it's worth visiting.

3. Keep descriptions concise and informative
4. CRITICAL: You MUST respond ONLY in ${languageText}. Do NOT use any other language.

Return the response as plain Markdown text (not JSON).`;

  try {
    const response = await Promise.race([
      kouriProvider.generateText(prompt),
      new Promise<string>((resolve) => setTimeout(() => resolve(''), 20000)),
    ]);
    
    if (response) {
      // 清理响应，移除可能的 JSON 包装
      let cleanResponse = response
        .replace(/```markdown\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      logger.info(`[SearchV2] Generated text-only response: ${cleanResponse.length} chars`);
      return cleanResponse;
    }
  } catch (error) {
    logger.warn(`[SearchV2] Failed to generate text-only response: ${error}`);
  }
  
  // Fallback: 手动生成简单的 Markdown
  const fallbackLines: string[] = [];
  for (const place of aiPlaces) {
    fallbackLines.push(`**${place.name}**`);
    fallbackLines.push(place.summary || `A notable place in ${place.city || 'this area'}.`);
    fallbackLines.push('');
  }
  return fallbackLines.join('\n');
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
            tags: buildDisplayTags(dbPlace.categoryEn, dbPlace.aiTags, language as 'en' | 'zh'),
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
      tags: buildDisplayTags(p.categoryEn, p.aiTags, language as 'en' | 'zh'),
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
        success: false, 
        error: 'query is required', 
        intent: 'general_search',
        acknowledgment: '',
        places: [], 
        overallSummary: '', 
        quotaRemaining: 0, 
        stage: 'complete',
      });
    }

    logger.info(`[SearchV2] Starting search for: "${query}"`);
    
    // ========== 第零步：意图识别（使用 IntentClassifierService） ==========
    const intentResult = await intentClassifierService.classify(query, language);
    logger.info(`[SearchV2] Detected intent: ${intentResult.intent} (confidence: ${intentResult.confidence})`);
    
    // ========== 处理 non_travel 意图 ==========
    if (intentResult.intent === 'non_travel') {
      logger.info('[SearchV2] Handling non_travel intent');
      const result = await intentClassifierService.handleNonTravel(query, language);
      
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
      
      const duration = Date.now() - startTime;
      logger.info(`[SearchV2] non_travel completed in ${duration}ms`);
      
      return res.json({
        success: true,
        intent: 'non_travel',
        textContent: result.textContent,
        quotaRemaining,
        stage: 'complete',
      });
    }
    
    // ========== 处理 travel_consultation 意图 ==========
    if (intentResult.intent === 'travel_consultation') {
      logger.info('[SearchV2] Handling travel_consultation intent');
      const result = await intentClassifierService.handleTravelConsultation(query, language);
      
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
      
      const duration = Date.now() - startTime;
      logger.info(`[SearchV2] travel_consultation completed in ${duration}ms`);
      
      return res.json({
        success: true,
        intent: 'travel_consultation',
        textContent: result.textContent,
        relatedPlaces: result.relatedPlaces,
        cityPlaces: result.cityPlaces,
        quotaRemaining,
        stage: 'complete',
      });
    }
    
    // ========== 处理 specific_place 意图 ==========
    if (intentResult.intent === 'specific_place' && intentResult.placeName) {
      logger.info(`[SearchV2] Handling specific_place intent for: "${intentResult.placeName}"`);
      const result = await intentClassifierService.handleSpecificPlace(intentResult.placeName, language);
      
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
      
      const duration = Date.now() - startTime;
      logger.info(`[SearchV2] specific_place completed in ${duration}ms`);
      
      return res.json({
        success: true,
        intent: 'specific_place',
        description: result.description,
        place: result.place,
        quotaRemaining,
        stage: 'complete',
      });
    }
    
    // ========== 继续原有的 general_search 流程 ==========
    logger.info('[SearchV2] Handling general_search intent');
    const parsedQuery = parseQuery(query);
    
    // 如果 AI 意图识别返回了城市/分类，优先使用
    if (intentResult.city) {
      parsedQuery.city = correctCityName(intentResult.city);
    }
    if (intentResult.category) {
      parsedQuery.category = intentResult.category;
    }
    if (intentResult.count) {
      parsedQuery.count = Math.min(Math.max(intentResult.count, 1), 20);
    }
    
    const targetCount = parsedQuery.count;

    // 获取用户今日已收藏的地点（需要排除）
    let userSavedPlaceIds: Set<string> = new Set();
    if (userId) {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // 查询用户今日收藏的地点
        const savedSpots = await prisma.$queryRaw<{place_id: string}[]>`
          SELECT DISTINCT ts.place_id 
          FROM trip_spots ts
          JOIN trips t ON ts.trip_id = t.id
          WHERE t.user_id = ${userId}::uuid
          AND ts.created_at >= ${today}
        `;
        userSavedPlaceIds = new Set(savedSpots.map(s => s.place_id));
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
            success: false, 
            error: 'Daily search quota exceeded.', 
            intent: 'general_search',
            acknowledgment: '',
            places: [], 
            overallSummary: '', 
            quotaRemaining: 0, 
            stage: 'complete',
          });
        }
        quotaRemaining = await quotaService.getRemainingQuota(userId);
      } catch (error) {
        if (error instanceof QuotaExceededError) {
          return res.status(429).json({
            success: false, 
            error: error.message, 
            intent: 'general_search',
            acknowledgment: '',
            places: [], 
            overallSummary: '', 
            quotaRemaining: 0, 
            stage: 'complete',
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
    
    // 辅助函数：检查地点是否有有效图片（同步版本，用于快速检查）
    const hasImageSync = (p: PlaceResult | any) => p.coverImage && p.coverImage !== '';
    
    // 辅助函数：验证图片URL是否可访问（异步版本）
    const validatePlaceImage = async (p: PlaceResult | any): Promise<{ isValid: boolean; reason?: string }> => {
      if (!p.coverImage || p.coverImage === '') {
        return { isValid: false, reason: 'empty' };
      }
      const result = await validateImageUrl(p.coverImage);
      if (!result.isValid) {
        logger.info(`[SearchV2] Image validation failed for "${p.name}": ${result.reason}${result.statusCode ? ` (${result.statusCode})` : ''}`);
      }
      return { isValid: result.isValid, reason: result.reason };
    };
    
    // 辅助函数：添加地点到结果（去重 + 过滤已收藏 + 验证图片）
    const addPlace = async (place: PlaceResult): Promise<boolean> => {
      const normalizedName = place.name.toLowerCase().trim();
      if (usedIds.has(place.id) || usedNames.has(normalizedName)) {
        return false;
      }
      // 过滤用户今日已收藏的地点
      if (allExcludeIds.has(place.id)) {
        logger.info(`[SearchV2] Skipping "${place.name}" - already saved by user`);
        return false;
      }
      // Quick sync check first
      if (!hasImageSync(place)) {
        logger.info(`[SearchV2] Skipping "${place.name}" - no image URL`);
        return false;
      }
      // Async validation of image URL accessibility
      const imageValidation = await validatePlaceImage(place);
      if (!imageValidation.isValid) {
        logger.info(`[SearchV2] Skipping "${place.name}" - invalid image (${imageValidation.reason})`);
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
      const matchedPlaces = await matchAIPlacesFromDB(aiRecommendations.places, language as 'en' | 'zh');
      logger.info(`[SearchV2] Matched ${matchedPlaces.size}/${aiRecommendations.places.length} AI places`);
      
      // 异步保存未匹配的 AI 地点到数据库（不阻塞主流程）
      const matchedNames = new Set(matchedPlaces.keys());
      saveUnmatchedAIPlacesToDB(aiRecommendations.places, matchedNames, parsedQuery.category)
        .catch(err => logger.warn(`[SearchV2] Failed to save AI places: ${err}`));
      
      // 添加有图片的匹配地点
      for (const [, place] of matchedPlaces) {
        if (finalPlaces.length >= targetCount) break;
        await addPlace(place);
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
            id: generateStablePlaceId(aiPlace.name, aiPlace.city || parsedQuery.city, aiPlace.latitude, aiPlace.longitude),
            name: aiPlace.name,
            summary: aiPlace.summary || '',
            coverImage: imageUrl,
            latitude: aiPlace.latitude,
            longitude: aiPlace.longitude,
            city: aiPlace.city || parsedQuery.city,
            country: aiPlace.country || '',
            rating: null,
            ratingCount: null,
            tags: buildDisplayTags(null, aiPlace.tags, language as 'en' | 'zh'),
            isVerified: false,
            source: 'ai',
            address: undefined,
            phoneNumber: undefined,
            website: undefined,
            openingHours: undefined,
          };
          await addPlace(place);
        }
      }
      logger.info(`[SearchV2] After web search: ${finalPlaces.length}/${targetCount} places with images`);
    }

    // ========== 第四步：优先级 3 - Supabase 补充数据（必须有图片） ==========
    // 当有城市或有分类时，都尝试从数据库补充
    if (finalPlaces.length < targetCount && (parsedQuery.city || parsedQuery.category)) {
      const needed = targetCount - finalPlaces.length;
      logger.info(`[SearchV2] Step 4: Need ${needed} more places, supplementing from Supabase...`);
      
      const excludeIds = Array.from(usedIds);
      const excludeNames = Array.from(usedNames);
      
      // 多取一些作为缓冲
      const supplementPlaces = await getPlacesByCategory(
        parsedQuery.city || '', parsedQuery.category, excludeIds, needed * 2, excludeNames
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
          tags: buildDisplayTags(p.categoryEn, p.aiTags, language as 'en' | 'zh'),
          isVerified: hasRating || p.isVerified || false,
          source: 'cache',
          address: p.address || undefined,
          phoneNumber: p.phoneNumber || undefined,
          website: p.website || undefined,
          openingHours: p.openingHours || undefined,
        };
        await addPlace(place);
      }
      logger.info(`[SearchV2] After Supabase supplement: ${finalPlaces.length}/${targetCount} places`);
    }

    // ========== 最终检查：确保所有地点都有图片 ==========
    // Note: Image validation is now done in addPlace, so this is just a safety check for sync hasImage
    finalPlaces = finalPlaces.filter(p => hasImageSync(p));
    logger.info(`[SearchV2] Final count after image filter: ${finalPlaces.length}/${targetCount}`);

    // ========== 数量不足时，改用文本格式返回 ==========
    if (finalPlaces.length < CONFIG.MIN_PLACES_FOR_CARDS) {
      logger.info(`[SearchV2] Only ${finalPlaces.length} places with images, switching to text-only mode`);
      
      let textContent = '';
      
      if (aiRecommendations && aiRecommendations.places.length > 0) {
        // 有 AI 推荐数据，使用它生成文本
        textContent = await generateTextOnlyResponse(
          aiRecommendations.places,
          parsedQuery.originalQuery,
          language
        );
      } else {
        // 没有 AI 推荐数据，直接让 AI 生成文本回复
        const languageText = language === 'zh' ? 'Chinese' : 'English';
        const fallbackPrompt = `The user searched for "${parsedQuery.originalQuery}". 
Please provide helpful information about design museums or relevant places.

Requirements:
1. Write a brief introduction (1-2 sentences)
2. List 5-8 notable design museums around the world
3. For each place, format as:
   **Place Name** (City, Country)
   Brief 1-2 sentence description.

4. CRITICAL: You MUST respond ONLY in ${languageText}. Do NOT use any other language.

Return the response as plain Markdown text.`;

        try {
          const response = await Promise.race([
            kouriProvider.generateText(fallbackPrompt),
            new Promise<string>((resolve) => setTimeout(() => resolve(''), 25000)),
          ]);
          
          if (response) {
            textContent = response
              .replace(/```markdown\n?/g, '')
              .replace(/```\n?/g, '')
              .trim();
          }
        } catch (error) {
          logger.warn(`[SearchV2] Failed to generate fallback text: ${error}`);
        }
        
        // 如果还是没有内容，返回一个默认消息
        if (!textContent) {
          textContent = language === 'zh' 
            ? '抱歉，暂时无法找到相关地点的详细信息。请尝试更具体的搜索词。'
            : 'Sorry, I couldn\'t find detailed information for this search. Please try a more specific query.';
        }
      }
      
      // 消耗配额
      if (userId) {
        try {
          await quotaService.consumeQuota(userId);
          quotaRemaining = await quotaService.getRemainingQuota(userId);
        } catch (error) {
          logger.error('[SearchV2] Error consuming quota:', error);
        }
      }
      
      const duration = Date.now() - startTime;
      logger.info(`[SearchV2] Completed (text-only) in ${duration}ms`);
      
      return res.json({
        success: true,
        intent: 'general_search_text', // 新的 intent 类型，表示文本格式
        textContent: textContent,
        acknowledgment: acknowledgment || '',
        places: [], // 空数组，前端应该显示 textContent
        overallSummary: '',
        quotaRemaining,
        stage: 'complete',
      });
    }

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
      intent: 'general_search',
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
      success: false, 
      error: error.message || 'An unexpected error occurred',
      intent: 'general_search',
      acknowledgment: '', 
      places: [], 
      overallSummary: '', 
      quotaRemaining: 0, 
      stage: 'complete',
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
