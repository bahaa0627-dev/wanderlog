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
  images?: string[];  // 多张图片用于详情页横滑展示
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
  DEFAULT_COUNT: 5,  // 默认返回 5 个地点（不分类时 3-5 个）
  MIN_PLACES_PER_CATEGORY: 3,
  MIN_CATEGORIES: 2,  // 至少 2 个分类
  NAME_SIMILARITY_THRESHOLD: 0.6,
  COORDINATE_THRESHOLD: 0.01,
  IMAGE_SEARCH_TIMEOUT_MS: 15000,
  MIN_PLACES_FOR_CARDS: 3, // 少于这个数量时，改用文本格式
};

/**
 * 计算加权评分
 * 公式: rating * log10(ratingCount + 1)
 * 这样评分高且评价人数多的地点会排在前面
 */
function calculateWeightedScore(rating: number | null, ratingCount: number | null): number {
  const r = rating ?? 0;
  const count = ratingCount ?? 0;
  // log10(1) = 0, 所以加 1 确保最小值为 0
  // 评价人数越多，权重越高
  return r * Math.log10(count + 1);
}

/**
 * 按加权评分排序地点数组
 */
function sortByWeightedScore<T extends { rating: number | null; ratingCount: number | null }>(places: T[]): T[] {
  return [...places].sort((a, b) => {
    const scoreA = calculateWeightedScore(a.rating, a.ratingCount);
    const scoreB = calculateWeightedScore(b.rating, b.ratingCount);
    return scoreB - scoreA; // 降序
  });
}

// 分类映射：相关分类合并搜索
const CATEGORY_MAPPING: Record<string, string[]> = {
  'cafe': ['cafe'],
  'coffee': ['cafe'],
  'bakery': ['bakery'],
  'restaurant': ['restaurant'],
  'ramen': ['restaurant'],
  'sushi': ['restaurant'],
  'museum': ['museum'],  // museum 只搜索 museum，不再合并 gallery
  'design museum': ['museum'],  // design museum 只搜索 museum
  'gallery': ['gallery'],  // gallery 只搜索 gallery
  'art gallery': ['gallery'],  // art gallery 只搜索 gallery
  'temple': ['temple'],
  'shrine': ['shrine'],
  'park': ['park'],
  'garden': ['park'],
  'bar': ['bar'],
  'pub': ['bar'],
  'shop': ['shop'],
  'shopping': ['shop'],
  'hotel': ['hotel'],
  'market': ['market'],  // 市场
  'food market': ['market'],
  'flea market': ['market'],
};

const kouriProvider = new KouriProvider();

/**
 * 为地点列表生成 AI summary（异步，可并行调用）
 */
async function generateAISummariesForPlaces(
  places: Array<{ id: string; name: string; city: string; country?: string; latitude?: number; longitude?: number }>,
  parsedQuery: ParsedQuery,
  language: string
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (places.length === 0) return result;

  const summaryPrompt = `Write a brief 2-3 sentence summary for each place.

User search: "${parsedQuery.originalQuery}"
City context: ${parsedQuery.city || 'various cities'}

CRITICAL:
- Each summary MUST be 2-3 sentences, around 30-50 words.
- Focus on what makes each place special or unique.
- Include specific details about the place (e.g., what it's known for, notable features, visitor experience).
- Do NOT include ratings or review counts.
- Do NOT change IDs. Return the same id you were given.
- Output language: ${language === 'zh' ? 'Chinese' : 'English'}

Places JSON:
${JSON.stringify(places)}

Return JSON only:
{
  "summaries": [
    { "id": "<same id>", "summary": "Two to three sentences about what makes this place special and worth visiting." }
  ]
}`;

  try {
    const summaryResponse = await Promise.race([
      kouriProvider.generateText(summaryPrompt),
      new Promise<string>((resolve) => setTimeout(() => resolve(''), 15000)),
    ]);
    
    if (summaryResponse) {
      const jsonMatch = summaryResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.summaries && Array.isArray(parsed.summaries)) {
          for (const item of parsed.summaries) {
            const id = typeof item?.id === 'string' ? item.id : '';
            const summary = typeof item?.summary === 'string' ? item.summary : '';
            if (id && summary) result.set(id, summary.trim());
          }
          logger.info(`[SearchV2] AI generated ${result.size} summaries`);
        }
      }
    }
  } catch (error) {
    logger.warn(`[SearchV2] Failed to generate AI summaries: ${error}`);
  }

  return result;
}

function formatNumberCompact(n: number): string {
  if (!Number.isFinite(n)) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return `${n}`;
}

function buildFallbackPlaceSummary(place: PlaceResult, parsedQuery: ParsedQuery, language: string): string {
  const city = (place.city || parsedQuery.city || '').trim();
  // 不再显示评分，改为显示地点特色描述
  const tags = Array.isArray(place.tags) ? place.tags.filter(t => typeof t === 'string' && t.trim()).slice(0, 3) : [];
  const category = (parsedQuery.category || '').trim();

  if (language === 'zh') {
    const cityText = city ? `位于${city}` : '';
    const catText = category ? `${category}` : '地点';
    const tagText = tags.length > 1 ? `，以${tags.slice(1).join('、')}著称` : '';
    return cityText ? `${cityText}的${catText}${tagText}。` : `推荐的${catText}${tagText}。`;
  }

  const cityText = city ? ` in ${city}` : '';
  const catText = category ? `${category}` : 'place';
  const tagText = tags.length > 1 ? `, known for ${tags.slice(1).join(' and ')}` : '';
  return cityText ? `A ${catText}${cityText}${tagText}.` : `A recommended ${catText}${tagText}.`;
}

function buildFallbackOverallSummary(parsedQuery: ParsedQuery, count: number, language: string): string {
  const categoryText = parsedQuery.category?.trim() ? parsedQuery.category.trim() : (language === 'zh' ? '地点' : 'places');
  const cityText = parsedQuery.city?.trim() ? parsedQuery.city.trim() : (language === 'zh' ? '全球各地' : 'around the world');
  return language === 'zh'
    ? `以上是为你整理的${count}个${cityText}${categoryText}推荐。想看更多选项，可以在地图上继续探索。`
    : `That’s a quick list of ${count} ${categoryText} ${cityText}. Want more options? Explore them on the map.`;
}

/**
 * 构建展示标签：category_en + ai_tags 的并集
 * @param categoryEn 分类英文名
 * @param aiTags AI 标签数组（AITagElement[] 或字符串数组）
 * @returns 合并后的标签数组
 */
/**
 * 从结构化 tags 对象中提取标签列表
 * tags 格式: { meal: ['breakfast', 'brunch'], style: ['cozy'], architect: ['Jørn Utzon'] }
 * 返回: ['breakfast', 'brunch', 'cozy', 'Jørn Utzon']
 */
function extractTagsFromStructured(tags: Record<string, string[]> | null | undefined): string[] {
  if (!tags || typeof tags !== 'object') return [];
  
  const result: string[] = [];
  for (const key of Object.keys(tags)) {
    const values = tags[key];
    if (Array.isArray(values)) {
      for (const v of values) {
        if (typeof v === 'string' && v.trim()) {
          result.push(v.trim());
        }
      }
    }
  }
  return result;
}

/**
 * 构建展示标签：category_en + ai_tags + structured_tags 的并集，返回字符串数组
 * @param categoryEn 分类英文名
 * @param aiTags AI 标签数组（AITagElement[] 或字符串数组）
 * @param language 语言参数，决定使用 'en' 或 'zh' 字段
 * @param structuredTags 结构化标签对象（可选）
 * @returns 合并后的标签数组
 */
function buildDisplayTags(
  categoryEn: string | null | undefined, 
  aiTags: any,
  language: 'en' | 'zh' = 'en',
  structuredTags?: Record<string, string[]> | null
): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();
  
  // 1. 添加 category_en 作为第一个标签
  if (categoryEn && categoryEn.trim()) {
    const cat = categoryEn.trim();
    tags.push(cat);
    seen.add(cat.toLowerCase());
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
      if (tagStr && tagStr.trim()) {
        const trimmed = tagStr.trim();
        const key = trimmed.toLowerCase();
        if (!seen.has(key)) {
          tags.push(trimmed);
          seen.add(key);
        }
      }
    }
  }
  
  // 3. 添加结构化标签（补充到最多 4 个）
  if (structuredTags) {
    const extracted = extractTagsFromStructured(structuredTags);
    for (const tag of extracted) {
      if (tags.length >= 4) break; // 最多 4 个标签
      const key = tag.toLowerCase();
      if (!seen.has(key)) {
        tags.push(tag);
        seen.add(key);
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
 * 获取城市名的所有变体（用于精确匹配）
 * 例如：Nice -> ['Nice'], Venice -> ['Venice', 'Venezia']
 * 返回 null 表示应该使用 contains 匹配
 */
function getCityVariants(city: string): string[] | null {
  if (!city) return null;
  
  const cityLower = city.toLowerCase().trim();
  
  // 城市名称变体映射（双向）- 只包含需要精确匹配的城市
  // 这些城市有歧义或者名称容易混淆
  const cityVariantsMap: Record<string, string[]> = {
    // Italy
    'rome': ['Rome', 'Roma'],
    'roma': ['Rome', 'Roma'],
    'venice': ['Venice', 'Venezia'],
    'venezia': ['Venice', 'Venezia'],
    'florence': ['Florence', 'Firenze'],
    'firenze': ['Florence', 'Firenze'],
    'milan': ['Milan', 'Milano'],
    'milano': ['Milan', 'Milano'],
    'naples': ['Naples', 'Napoli'],
    'napoli': ['Naples', 'Napoli'],
    'turin': ['Turin', 'Torino'],
    'torino': ['Turin', 'Torino'],
    'genoa': ['Genoa', 'Genova'],
    'genova': ['Genoa', 'Genova'],
    // Spain
    'seville': ['Seville', 'Sevilla'],
    'sevilla': ['Seville', 'Sevilla'],
    // France - Nice 需要精确匹配，避免匹配到 Venice
    'nice': ['Nice'],
    'marseille': ['Marseille', 'Marseilles'],
    'marseilles': ['Marseille', 'Marseilles'],
    'lyon': ['Lyon', 'Lyons'],
    'lyons': ['Lyon', 'Lyons'],
    // Germany
    'munich': ['Munich', 'München'],
    'münchen': ['Munich', 'München'],
    'cologne': ['Cologne', 'Köln'],
    'köln': ['Cologne', 'Köln'],
    // Netherlands
    'the hague': ['The Hague', 'Den Haag'],
    'den haag': ['The Hague', 'Den Haag'],
    // Czech Republic
    'prague': ['Prague', 'Praha'],
    'praha': ['Prague', 'Praha'],
    // Austria
    'vienna': ['Vienna', 'Wien'],
    'wien': ['Vienna', 'Wien'],
    // Denmark
    'copenhagen': ['Copenhagen', 'København'],
    'københavn': ['Copenhagen', 'København'],
    // Greece
    'athens': ['Athens', 'Athina'],
    'athina': ['Athens', 'Athina'],
    // Portugal
    'lisbon': ['Lisbon', 'Lisboa'],
    'lisboa': ['Lisbon', 'Lisboa'],
  };
  
  // 查找变体 - 只有在映射表中的城市才返回变体列表
  const variants = cityVariantsMap[cityLower];
  if (variants) {
    return variants;
  }
  
  // 如果没有找到变体，返回 null 表示应该使用 contains 匹配
  return null;
}

/**
 * 构建城市过滤条件
 * 对于有歧义的城市使用精确匹配，其他城市使用 contains 匹配
 */
function buildCityCondition(city: string): any {
  const variants = getCityVariants(city);
  if (variants) {
    // 有变体映射的城市，使用精确匹配
    return { OR: variants.map(c => ({ city: { equals: c, mode: 'insensitive' as const } })) };
  } else {
    // 其他城市，使用 contains 匹配
    return { city: { contains: city.trim(), mode: 'insensitive' as const } };
  }
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
  // 优先匹配更长的关键词（如 "design museum" 优先于 "museum"）
  const categoryKeywords = Object.keys(CATEGORY_MAPPING).sort((a, b) => b.length - a.length);
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
      const nonCityWords = ['help', 'find', 'show', 'recommend', 'interesting', 'best', 'good', 'nice', 'great', 'some', 'any', 'the', 'me', 'please', 'design'];
      const potentialCityLower = potentialCity.toLowerCase();
      const categoryKeywordsLower = Object.keys(CATEGORY_MAPPING).map(k => k.toLowerCase());
      if (!nonCityWords.includes(potentialCityLower) && !categoryKeywordsLower.includes(potentialCityLower)) {
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
      
      const displayTags = buildDisplayTags(bestMatch.categoryEn, finalAiTags, language, bestMatch.tags as Record<string, string[]> | null);
      logger.info(`[SearchV2] Matched "${aiPlace.name}" -> "${bestMatch.name}" (coverImage: ${bestMatch.coverImage ? 'YES' : 'NO'}, categoryEn: ${bestMatch.categoryEn}, displayTags: ${JSON.stringify(displayTags)})`);
      
      matchedPlaces.set(aiPlace.name, {
        id: bestMatch.id,
        name: bestMatch.name,
        // summary 只使用 AI 生成的内容，保证差异化
        summary: aiPlace.summary || '',
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
  
  // 构建城市条件（如果有城市）
  const cityCondition = city ? buildCityCondition(city) : null;
  
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
    if (cityCondition) {
      whereConditions.unshift(cityCondition);
    }
    
    // 多取一些数据，然后按加权评分排序
    const rawPlaces = await prisma.place.findMany({
      where: { AND: whereConditions },
      take: limit * 3, // 多取3倍数据用于筛选
    });
    
    // 按加权评分排序（rating * log10(ratingCount + 1)）
    const sortedPlaces = sortByWeightedScore(rawPlaces);
    
    // 随机打乱数组（Fisher-Yates shuffle）- 在排序后的基础上轻微打乱
    const shuffled = [...sortedPlaces];
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
        
        if (cityCondition) {
          moreWhereConditions.unshift(cityCondition);
        }
        
        const morePlaces = await prisma.place.findMany({
          where: { AND: moreWhereConditions },
          take: (limit - places.length) * 2,
        });
        // 按加权评分排序
        const sortedMorePlaces = sortByWeightedScore(morePlaces);
        for (const p of sortedMorePlaces) {
          const normalizedName = p.name.toLowerCase().trim();
          if (!existingIds.includes(p.id) && !seenNames.has(normalizedName) && places.length < limit) {
            places.push(p);
            existingIds.push(p.id);
            seenNames.add(normalizedName);
          }
        }
      }
    }
  } else if (cityCondition) {
    // 没有分类但有城市，按城市搜索
    const rawPlaces = await prisma.place.findMany({
      where: {
        AND: [
          cityCondition,
          { id: { notIn: validExcludeIds } },
          { coverImage: { not: null } },
          { coverImage: { not: '' } },
        ],
      },
      take: limit * 2,
    });
    // 按加权评分排序
    places = sortByWeightedScore(rawPlaces).slice(0, limit);
  }
  // 如果既没有分类也没有城市，返回空数组
  
  logger.info(`[SearchV2] Found ${places.length} places for category "${category}" in "${city || 'global'}"`);
  return places;
}

async function getPlacesByQueryAllowNoImage(
  parsedQuery: ParsedQuery,
  excludeIds: string[],
  limit: number,
  excludeNames: string[] = []
): Promise<any[]> {
  // 过滤掉非 UUID 格式的 ID（如 ai_xxx 格式）
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  const validExcludeIds = excludeIds.filter(id => uuidRegex.test(id));

  const seenNames = new Set(excludeNames.map(n => n.toLowerCase().trim()));
  const query = (parsedQuery.originalQuery || '').trim();
  const lowerQuery = query.toLowerCase();

  // 粗粒度 token 过滤：去掉停用词和太短的 token
  const stopWords = new Set([
    'in', 'at', 'near', 'around', 'best', 'top', 'good', 'nice', 'great', 'some', 'any', 'the', 'a', 'an',
    'me', 'please', 'show', 'find', 'recommend', 'recommendation', 'recommendations',
  ]);
  const tokens = lowerQuery
    .split(/[^a-z0-9\u4e00-\u9fff]+/i)
    .map(t => t.trim())
    .filter(t => t.length >= 3 && !stopWords.has(t))
    .slice(0, 6);

  const andConditions: any[] = [
    { id: { notIn: validExcludeIds } },
  ];

  if (parsedQuery.city && parsedQuery.city.trim()) {
    andConditions.unshift(buildCityCondition(parsedQuery.city.trim()));
  }

  if (parsedQuery.category && parsedQuery.category.trim()) {
    const categoryValues = CATEGORY_MAPPING[parsedQuery.category] || [parsedQuery.category];
    andConditions.push({
      OR: [
        { categorySlug: { in: categoryValues } },
        { categoryEn: { in: categoryValues, mode: 'insensitive' as const } },
        { category: { in: categoryValues, mode: 'insensitive' as const } },
      ],
    });
  }

  if (tokens.length > 0) {
    andConditions.push({
      OR: [
        ...tokens.map(t => ({ name: { contains: t, mode: 'insensitive' as const } })),
        ...tokens.map(t => ({ description: { contains: t, mode: 'insensitive' as const } })),
        ...tokens.map(t => ({ aiDescription: { contains: t, mode: 'insensitive' as const } })),
        ...tokens.map(t => ({ aiSummary: { contains: t, mode: 'insensitive' as const } })),
      ],
    });
  }

  // 多取一些，后面按 name 去重
  const rawPlaces = await prisma.place.findMany({
    where: { AND: andConditions },
    take: limit * 4,
  });

  // 按加权评分排序
  const sortedPlaces = sortByWeightedScore(rawPlaces);

  const places: any[] = [];
  for (const p of sortedPlaces) {
    const normalizedName = (p.name || '').toLowerCase().trim();
    if (!normalizedName) continue;
    if (seenNames.has(normalizedName)) continue;
    seenNames.add(normalizedName);
    places.push(p);
    if (places.length >= limit) break;
  }

  logger.info(`[SearchV2] DB fallback found ${places.length} places for query "${parsedQuery.originalQuery}" (allow no image)`);
  return places;
}

async function getPlacesByQueryWithImage(
  parsedQuery: ParsedQuery,
  excludeIds: string[],
  limit: number,
  excludeNames: string[] = []
): Promise<any[]> {
  // 过滤掉非 UUID 格式的 ID（如 ai_xxx 格式）
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  const validExcludeIds = excludeIds.filter(id => uuidRegex.test(id));

  const seenNames = new Set(excludeNames.map(n => n.toLowerCase().trim()));
  const query = (parsedQuery.originalQuery || '').trim();
  const lowerQuery = query.toLowerCase();

  // 粗粒度 token 过滤：去掉停用词和太短的 token
  const stopWords = new Set([
    'in', 'at', 'near', 'around', 'best', 'top', 'good', 'nice', 'great', 'some', 'any', 'the', 'a', 'an',
    'me', 'please', 'show', 'find', 'recommend', 'recommendation', 'recommendations',
  ]);
  const tokens = lowerQuery
    .split(/[^a-z0-9\u4e00-\u9fff]+/i)
    .map(t => t.trim())
    .filter(t => t.length >= 2 && !stopWords.has(t))
    .slice(0, 6);

  const places: any[] = [];

  // 第一优先级：名字直接包含查询词的地点（如 "design museum" 匹配 "The Design Museum"）
  if (tokens.length > 0) {
    const nameMatchConditions: any[] = [
      { id: { notIn: validExcludeIds } },
      { coverImage: { not: null } },
      { coverImage: { not: '' } },
    ];
    
    // 名字必须包含所有关键词
    for (const token of tokens) {
      nameMatchConditions.push({ name: { contains: token, mode: 'insensitive' as const } });
    }

    if (parsedQuery.city && parsedQuery.city.trim()) {
      nameMatchConditions.push(buildCityCondition(parsedQuery.city.trim()));
    }

    const nameMatchPlaces = await prisma.place.findMany({
      where: { AND: nameMatchConditions },
      take: limit * 2,
    });

    // 按加权评分排序
    const sortedNameMatchPlaces = sortByWeightedScore(nameMatchPlaces);

    for (const p of sortedNameMatchPlaces) {
      const normalizedName = (p.name || '').toLowerCase().trim();
      if (!normalizedName) continue;
      if (seenNames.has(normalizedName)) continue;
      seenNames.add(normalizedName);
      places.push(p);
      if (places.length >= limit) break;
    }
    
    logger.info(`[SearchV2] Name match found ${places.length} places for "${tokens.join(' ')}"`);
  }

  // 如果名字匹配不够，再按分类和描述搜索
  if (places.length < limit) {
    const andConditions: any[] = [
      { id: { notIn: [...validExcludeIds, ...places.map(p => p.id)] } },
      { coverImage: { not: null } },
      { coverImage: { not: '' } },
    ];

    if (parsedQuery.city && parsedQuery.city.trim()) {
      const cityVariants = getCityVariants(parsedQuery.city.trim());
      andConditions.push({ OR: cityVariants.map(c => ({ city: { equals: c, mode: 'insensitive' as const } })) });
    }

    if (parsedQuery.category && parsedQuery.category.trim()) {
      const categoryValues = CATEGORY_MAPPING[parsedQuery.category] || [parsedQuery.category];
      andConditions.push({
        OR: [
          { categorySlug: { in: categoryValues } },
          { categoryEn: { in: categoryValues, mode: 'insensitive' as const } },
          { category: { in: categoryValues, mode: 'insensitive' as const } },
        ],
      });
    }

    if (tokens.length > 0) {
      andConditions.push({
        OR: [
          ...tokens.map(t => ({ name: { contains: t, mode: 'insensitive' as const } })),
          ...tokens.map(t => ({ description: { contains: t, mode: 'insensitive' as const } })),
          ...tokens.map(t => ({ aiDescription: { contains: t, mode: 'insensitive' as const } })),
          ...tokens.map(t => ({ aiSummary: { contains: t, mode: 'insensitive' as const } })),
        ],
      });
    }

    const rawPlaces = await prisma.place.findMany({
      where: { AND: andConditions },
      take: (limit - places.length) * 4,
    });

    // 按加权评分排序
    const sortedRawPlaces = sortByWeightedScore(rawPlaces);

    for (const p of sortedRawPlaces) {
      const normalizedName = (p.name || '').toLowerCase().trim();
      if (!normalizedName) continue;
      if (seenNames.has(normalizedName)) continue;
      seenNames.add(normalizedName);
      places.push(p);
      if (places.length >= limit) break;
    }
  }

  logger.info(`[SearchV2] Query supplement found ${places.length} places for query "${parsedQuery.originalQuery}" (images only)`);
  return places;
}

async function getPlacesByQueryWithImageForMap(
  parsedQuery: ParsedQuery,
  excludeIds: string[],
  limit: number,
  excludeNames: string[] = []
): Promise<any[]> {
  // Similar to getPlacesByQueryWithImage, but biased toward lower ratingCount
  // so the map can surface more niche/less-reviewed places.
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  const validExcludeIds = excludeIds.filter(id => uuidRegex.test(id));

  const seenNames = new Set(excludeNames.map(n => n.toLowerCase().trim()));
  const query = (parsedQuery.originalQuery || '').trim();
  const lowerQuery = query.toLowerCase();

  const stopWords = new Set([
    'in', 'at', 'near', 'around', 'best', 'top', 'good', 'nice', 'great', 'some', 'any', 'the', 'a', 'an',
    'me', 'please', 'show', 'find', 'recommend', 'recommendation', 'recommendations',
  ]);
  const tokens = lowerQuery
    .split(/[^a-z0-9\u4e00-\u9fff]+/i)
    .map(t => t.trim())
    .filter(t => t.length >= 3 && !stopWords.has(t))
    .slice(0, 6);

  const andConditions: any[] = [
    { id: { notIn: validExcludeIds } },
    { coverImage: { not: null } },
    { coverImage: { not: '' } },
  ];

  if (parsedQuery.city && parsedQuery.city.trim()) {
    const cityVariants = getCityVariants(parsedQuery.city.trim());
    andConditions.unshift({ OR: cityVariants.map(c => ({ city: { equals: c, mode: 'insensitive' as const } })) });
  }

  if (parsedQuery.category && parsedQuery.category.trim()) {
    const categoryValues = CATEGORY_MAPPING[parsedQuery.category] || [parsedQuery.category];
    andConditions.push({
      OR: [
        { categorySlug: { in: categoryValues } },
        { categoryEn: { in: categoryValues, mode: 'insensitive' as const } },
        { category: { in: categoryValues, mode: 'insensitive' as const } },
      ],
    });
  }

  if (tokens.length > 0) {
    andConditions.push({
      OR: [
        ...tokens.map(t => ({ name: { contains: t, mode: 'insensitive' as const } })),
        ...tokens.map(t => ({ description: { contains: t, mode: 'insensitive' as const } })),
        ...tokens.map(t => ({ aiDescription: { contains: t, mode: 'insensitive' as const } })),
        ...tokens.map(t => ({ aiSummary: { contains: t, mode: 'insensitive' as const } })),
      ],
    });
  }

  const rawPlaces = await prisma.place.findMany({
    where: { AND: andConditions },
    // For map: bias toward less-reviewed places
    take: limit * 4,
  });

  // 地图视图：按加权评分升序，优先显示小众但评分不错的地点
  const sortedPlaces = [...rawPlaces].sort((a, b) => {
    const scoreA = calculateWeightedScore(a.rating, a.ratingCount);
    const scoreB = calculateWeightedScore(b.rating, b.ratingCount);
    return scoreA - scoreB; // 升序，小众地点优先
  });

  const places: any[] = [];
  for (const p of sortedPlaces) {
    const normalizedName = (p.name || '').toLowerCase().trim();
    if (!normalizedName) continue;
    if (seenNames.has(normalizedName)) continue;
    seenNames.add(normalizedName);
    places.push(p);
    if (places.length >= limit) break;
  }

  logger.info(`[SearchV2] Map supplement found ${places.length} places for query "${parsedQuery.originalQuery}" (images only, low reviews)`);
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
            summary: aiPlace.summary || dbPlace.aiSummary || dbPlace.aiDescription || '',
            coverImage: dbPlace.coverImage || '',
            latitude: dbPlace.latitude,
            longitude: dbPlace.longitude,
            city: dbPlace.city || parsedQuery.city,
            country: dbPlace.country || '',
            rating: dbPlace.rating,
            ratingCount: dbPlace.ratingCount,
            tags: buildDisplayTags(dbPlace.categoryEn, dbPlace.aiTags, language as 'en' | 'zh', dbPlace.tags as Record<string, string[]> | null),
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
      summary: '', // AI 生成失败时留空，后面用 fallback 模板
      coverImage: p.coverImage || '',
      latitude: p.latitude,
      longitude: p.longitude,
      city: p.city || parsedQuery.city,
      country: p.country || '',
      rating: p.rating,
      ratingCount: p.ratingCount,
      tags: buildDisplayTags(p.categoryEn, p.aiTags, language as 'en' | 'zh', p.tags as Record<string, string[]> | null),
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
      // Pass original query for AI to identify the place if it's a vague query
      const result = await intentClassifierService.handleSpecificPlace(intentResult.placeName, language, query);
      
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
        identifiedPlaceName: result.identifiedPlaceName,
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

    // ========== 第一步：并行执行 AI 推荐和数据库名字匹配 ==========
    logger.info(`[SearchV2] Step 1: Starting parallel AI + DB search (target: ${targetCount})...`);
    
    // 并行执行：AI 推荐 + 数据库名字匹配
    const aiPromise = aiRecommendationService.getRecommendations(query, language)
      .catch(err => {
        logger.warn(`[SearchV2] AI call failed: ${err}`);
        return null;
      });
    
    const dbNameMatchPromise = getPlacesByQueryWithImage(parsedQuery, [], Math.min(10, targetCount), [])
      .catch(err => {
        logger.warn(`[SearchV2] DB name match failed: ${err}`);
        return [];
      });
    
    // 等待两个并行任务完成（设置超时）
    const [aiRecommendations, dbNameMatchPlaces] = await Promise.all([
      Promise.race([
        aiPromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), CONFIG.AI_TIMEOUT_MS)),
      ]),
      dbNameMatchPromise,
    ]);
    
    if (aiRecommendations) {
      logger.info(`[SearchV2] AI returned ${aiRecommendations.places.length} places`);
    }
    logger.info(`[SearchV2] DB name match returned ${dbNameMatchPlaces.length} places`);

    // 收集最终结果（只包含有图片的地点）
    let finalPlaces: PlaceResult[] = [];
    let acknowledgment = aiRecommendations?.acknowledgment || '';
    let overallSummary = '';
    const usedIds = new Set<string>();
    const usedNames = new Set<string>();
    
    // 辅助函数：检查地点是否有有效图片（同步版本，用于快速检查）
    // 注意：某些数据源可能会写入空字符串/空白字符，这里统一按 trim 后判断。
    const hasImageSync = (p: PlaceResult | any) =>
      typeof p?.coverImage === 'string' && p.coverImage.trim().length > 0;
    
    // 辅助函数：验证图片URL是否可访问（异步版本）
    const validatePlaceImage = async (p: PlaceResult | any): Promise<{ isValid: boolean; reason?: string }> => {
      if (typeof p?.coverImage !== 'string' || p.coverImage.trim() === '') {
        return { isValid: false, reason: 'empty' };
      }
      const result = await validateImageUrl(p.coverImage.trim());
      if (!result.isValid) {
        logger.info(`[SearchV2] Image validation failed for "${p.name}": ${result.reason}${result.statusCode ? ` (${result.statusCode})` : ''}`);
      }
      return { isValid: result.isValid, reason: result.reason };
    };
    
    // 辅助函数：添加地点到结果（去重 + 过滤已收藏 + 验证图片）
    // 对于数据库来源的地点（source: 'cache'），信任已有图片 URL，不做实时验证
    // 只对 AI 搜索到的新图片（source: 'ai'）做验证
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
      // 只对 AI 来源的地点做图片验证，数据库来源的信任已有 URL
      if (place.source === 'ai') {
        const imageValidation = await validatePlaceImage(place);
        if (!imageValidation.isValid) {
          logger.info(`[SearchV2] Skipping "${place.name}" - invalid image (${imageValidation.reason})`);
          return false;
        }
      }
      usedIds.add(place.id);
      usedNames.add(normalizedName);
      finalPlaces.push(place);
      return true;
    };

    // ========== 第 1.5 步：优先级 0 - 使用并行获取的数据库名字匹配结果 ==========
    // 同时启动 AI summary 生成（不等待后续步骤）
    let aiSummaryPromise: Promise<Map<string, string>> | null = null;
    
    if (dbNameMatchPlaces.length > 0) {
      logger.info(`[SearchV2] Step 1.5: Processing ${dbNameMatchPlaces.length} name-matched places`);
      
      // 立即启动 AI summary 生成（并行）
      const placesForSummary = dbNameMatchPlaces
        .filter(p => p.coverImage && p.coverImage !== '')
        .slice(0, targetCount)
        .map(p => ({
          id: p.id,
          name: p.name,
          city: p.city || parsedQuery.city || '',
          country: p.country || '',
          latitude: p.latitude,
          longitude: p.longitude,
        }));
      
      if (placesForSummary.length > 0) {
        aiSummaryPromise = generateAISummariesForPlaces(placesForSummary, parsedQuery, language);
      }
      
      for (const p of dbNameMatchPlaces) {
        if (finalPlaces.length >= targetCount) break;
        if (!p.coverImage || p.coverImage === '') continue;
        
        const hasRating = p.rating !== null && p.rating > 0;
        // 解析 images 字段（可能是 JSON 数组或已解析的数组）
        let images: string[] = [];
        if (p.images) {
          if (Array.isArray(p.images)) {
            images = p.images.filter((img: string) => img && img.length > 0);
          } else if (typeof p.images === 'string') {
            try {
              const parsed = JSON.parse(p.images);
              if (Array.isArray(parsed)) {
                images = parsed.filter((img: string) => img && img.length > 0);
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
        // 如果没有 images，使用 coverImage
        if (images.length === 0 && p.coverImage) {
          images = [p.coverImage];
        }
        
        const place: PlaceResult = {
          id: p.id,
          name: p.name,
          summary: '', // 稍后由 AI 填充
          coverImage: p.coverImage,
          images: images,
          latitude: p.latitude,
          longitude: p.longitude,
          city: p.city || parsedQuery.city,
          country: p.country || '',
          rating: p.rating,
          ratingCount: p.ratingCount,
          tags: buildDisplayTags(p.categoryEn, p.aiTags, language as 'en' | 'zh', p.tags as Record<string, string[]> | null),
          isVerified: hasRating || p.isVerified || false,
          source: 'cache',
          address: p.address || undefined,
          phoneNumber: p.phoneNumber || undefined,
          website: p.website || undefined,
          openingHours: p.openingHours || undefined,
        };
        await addPlace(place);
      }
      logger.info(`[SearchV2] After name match: ${finalPlaces.length}/${targetCount} places`);
    }

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
          summary: '', // 数据库补充的地点，summary 留空，后面用 fallback 模板
          coverImage: p.coverImage,
          latitude: p.latitude,
          longitude: p.longitude,
          city: p.city || parsedQuery.city,
          country: p.country || '',
          rating: p.rating,
          ratingCount: p.ratingCount,
          tags: buildDisplayTags(p.categoryEn, p.aiTags, language as 'en' | 'zh', p.tags as Record<string, string[]> | null),
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

    // ========== 第四步补充：按 query token 在库里补充（必须有图片） ==========
    if (finalPlaces.length < targetCount) {
      const needed = targetCount - finalPlaces.length;
      logger.info(`[SearchV2] Step 4b: Need ${needed} more places, supplementing from Supabase by query...`);

      const querySupplement = await getPlacesByQueryWithImage(
        parsedQuery,
        Array.from(usedIds),
        needed * 3,
        Array.from(usedNames),
      );

      logger.info(`[SearchV2] Found ${querySupplement.length} query supplement places from Supabase`);

      for (const p of querySupplement) {
        if (finalPlaces.length >= targetCount) break;
        if (!p.coverImage || p.coverImage === '') continue;

        const hasRating = p.rating !== null && p.rating > 0;
        const place: PlaceResult = {
          id: p.id,
          name: p.name,
          summary: '', // 数据库补充的地点，summary 留空，后面用 fallback 模板
          coverImage: p.coverImage,
          latitude: p.latitude,
          longitude: p.longitude,
          city: p.city || parsedQuery.city,
          country: p.country || '',
          rating: p.rating,
          ratingCount: p.ratingCount,
          tags: buildDisplayTags(p.categoryEn, p.aiTags, language as 'en' | 'zh', p.tags as Record<string, string[]> | null),
          isVerified: hasRating || p.isVerified || false,
          source: 'cache',
          address: p.address || undefined,
          phoneNumber: p.phoneNumber || undefined,
          website: p.website || undefined,
          openingHours: p.openingHours || undefined,
        };
        await addPlace(place);
      }

      logger.info(`[SearchV2] After query supplement: ${finalPlaces.length}/${targetCount} places`);
    }

    // ========== 最终检查：确保所有地点都有图片 ==========
    // Note: Image validation is now done in addPlace, so this is just a safety check for sync hasImage
    // Normalize + filter once more to guarantee response never includes blank images
    finalPlaces = finalPlaces
      .map(p => ({ ...p, coverImage: typeof p.coverImage === 'string' ? p.coverImage.trim() : p.coverImage }))
      .filter(p => hasImageSync(p));
    logger.info(`[SearchV2] Final count after image filter: ${finalPlaces.length}/${targetCount}`);

    // ========== 仅在完全没有图片结果时，改用文本格式返回 ==========
    // 用户明确要求过滤无图地点，因此即便数量偏少也优先返回卡片结果。
    if (finalPlaces.length === 0) {
      logger.info('[SearchV2] No places with images, switching to text-only mode');
      
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
      const categoryPrompt = `Organize these ${finalPlaces.length} places into 2-4 categories based on the user's search intent.

User search: "${parsedQuery.originalQuery}"
Places: ${placeNames}

Requirements:
1. Create 2-4 categories with emoji titles that are DIRECTLY RELEVANT to the user's search intent
2. Each category should have 3-5 places
3. All places must be assigned to exactly one category
4. IMPORTANT: Categories must be closely related to the search query. For example:
   - If user searches "design museum", categories should be about design/architecture/industrial design, NOT generic categories like "Gallery" or "Historical Sites"
   - If user searches "coffee shops", categories should be about coffee styles/vibes, NOT "Restaurants" or "Bars"
5. Put less relevant places into a single "More Picks" category at the end
6. Response in ${language === 'zh' ? 'Chinese' : 'English'}

Return JSON only:
{
  "categories": [
    { "title": "🖼️ Category Name", "placeNames": ["Place 1", "Place 2", "Place 3"] }
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

    // ========== 第六步：合并 AI summary 结果 ==========
    // 先等待之前启动的 AI summary 生成完成
    logger.info(`[SearchV2] Step 6: Merging AI summaries for ${finalPlaces.length} places...`);
    
    let aiSummaries = new Map<string, string>();
    if (aiSummaryPromise) {
      try {
        aiSummaries = await aiSummaryPromise;
        logger.info(`[SearchV2] Got ${aiSummaries.size} pre-generated summaries`);
      } catch (error) {
        logger.warn(`[SearchV2] Failed to get pre-generated summaries: ${error}`);
      }
    }
    
    // 找出还没有 summary 的地点
    const placesNeedingSummary = finalPlaces.filter(p => 
      !p.summary && !aiSummaries.has(p.id)
    );
    
    // 如果还有地点需要 summary，再生成一次
    if (placesNeedingSummary.length > 0) {
      logger.info(`[SearchV2] Generating summaries for ${placesNeedingSummary.length} additional places...`);
      const additionalSummaries = await generateAISummariesForPlaces(
        placesNeedingSummary.map(p => ({
          id: p.id,
          name: p.name,
          city: p.city || parsedQuery.city || '',
          country: p.country || '',
        })),
        parsedQuery,
        language
      );
      // 合并到 aiSummaries
      for (const [id, summary] of additionalSummaries) {
        aiSummaries.set(id, summary);
      }
    }
    
    // 应用所有 summary
    for (const place of finalPlaces) {
      const s = aiSummaries.get(place.id);
      if (s && s.trim()) {
        place.summary = s.trim();
      }
    }
    
    // 同时更新 categories 中的地点
    for (const cat of finalCategories) {
      for (const p of cat.places) {
        const s = aiSummaries.get(p.id);
        if (s && s.trim()) p.summary = s.trim();
      }
    }

    // ========== 第七步：生成 overallSummary（结束语） ==========
    if (finalPlaces.length > 0) {
      const placeNames = finalPlaces.slice(0, 8).map(p => p.name).join(', ');
      const overallPrompt = `Write a short closing summary for this recommendation list.

User search: "${parsedQuery.originalQuery}"
Example places: ${placeNames}

Requirements:
- 1-2 sentences only
- Friendly tone
- Output language: ${language === 'zh' ? 'Chinese' : 'English'}

Return plain text only.`;

      try {
        const overallResponse = await Promise.race([
          kouriProvider.generateText(overallPrompt),
          new Promise<string>((resolve) => setTimeout(() => resolve(''), 12000)),
        ]);
        if (overallResponse && overallResponse.trim()) {
          overallSummary = overallResponse.trim();
        }
      } catch (error) {
        logger.warn(`[SearchV2] Failed to generate overall summary: ${error}`);
      }
    }

    // ========== 确保每个地点都有 summary（Kouri 额度不足时走兜底） ==========
    for (const place of finalPlaces) {
      if (!place.summary || !place.summary.trim()) {
        place.summary = buildFallbackPlaceSummary(place, parsedQuery, language);
      }
    }
    for (const cat of finalCategories) {
      for (const p of cat.places) {
        if (!p.summary || !p.summary.trim()) {
          p.summary = buildFallbackPlaceSummary(p, parsedQuery, language);
        }
      }
    }

    if (!overallSummary || !overallSummary.trim()) {
      overallSummary = buildFallbackOverallSummary(parsedQuery, finalPlaces.length, language);
    }

    // ========== 补齐承接语（如果 AI 没给） ==========
    if (!acknowledgment || !acknowledgment.trim()) {
      const cityText = parsedQuery.city?.trim() ? parsedQuery.city.trim() : (language === 'zh' ? '全球各地' : 'around the world');
      const categoryText = parsedQuery.category?.trim() ? parsedQuery.category.trim() : (language === 'zh' ? '地点' : 'places');
      acknowledgment = language === 'zh'
        ? `我为你挑选了一些${cityText}的${categoryText}，优先考虑综合评分和评价人数。你也可以在地图上查看更多地点。`
        : `Here are some ${categoryText} picks ${cityText}, prioritizing higher ratings and more reviews. You can also explore more on the map.`;
    }

    // ========== 排序：综合评分和评价人数，评价人数权重更高 ==========
    // 评分 4.7 + 147K 评价 应该排在 评分 5.0 + 1 评价 前面
    const score = (p: PlaceResult) => {
      const rating = typeof p.rating === 'number' ? p.rating : 0;
      const count = typeof p.ratingCount === 'number' ? p.ratingCount : 0;
      // 评价人数权重更高：log10(count+1) * 10 + rating
      const countScore = count > 0 ? Math.log10(count + 1) * 10 : 0;
      return countScore + rating;
    };
    finalPlaces.sort((a, b) => score(b) - score(a));
    for (const cat of finalCategories) {
      cat.places.sort((a, b) => score(b) - score(a));
    }

    // ========== Map places：地图最多显示 20 个地点 ==========
    const mapPlaces: PlaceResult[] | undefined = finalPlaces.length > 0 ? finalPlaces : undefined;
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
      mapPlaces,
      overallSummary,
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
