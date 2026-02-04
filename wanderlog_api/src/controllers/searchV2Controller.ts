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
import { OpenRouterProvider } from '../services/aiProviders/OpenRouterProvider';
import { AIErrorCode } from '../services/aiProviders/types';
import aiService from '../services/aiService';
import { aiFacetDictionaryService } from '../services/aiFacetDictionaryService';
import { AITagElement } from '../services/aiTagsGeneratorService';
import { resetAICallCounter, getAICallCount } from '../services/aiCallCounter';
import { intentClassifierService } from '../services/intentClassifierService';
import { validateImageUrl } from '../utils/imageValidator';
import crypto from 'crypto';
import geocodeService from '../services/reverseGeocodeService';

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
  category: string;           // categorySlug (e.g., 'cafe', 'museum')
  tags?: string[];            // tag keywords for search (e.g., ['architecture', 'beach'])
  city: string;
  country: string;
  region: string;             // continent/region (e.g., 'Europe', 'Asia', 'North America')
  originalQuery: string;
  explicitCount: boolean;
}

type TranslationStatus = 'not_needed' | 'translated' | 'failed';

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
  recommendationPhrase?: string;  // AI recommendation phrase (e.g., "Hidden gem", "Local favorite")
  customFields?: Record<string, unknown>;  // 自定义字段（包含剧照等数据）
}

interface MentionedPlaceLite {
  name: string;
  city?: string;
  country?: string;
}

interface CategoryGroup {
  title: string;
  places: PlaceResult[];
}

const CONFIG = {
  AI_TIMEOUT_MS: 60000, // 降低到 60 秒以避免客户端超时
  AI_SUMMARY_TIMEOUT_MS: 30000,
  DEFAULT_COUNT: 8,  // 默认返回 5-10 个地点
  MIN_COUNT: 5,       // 最少返回 5 个地点
  MAX_COUNT: 10,      // 最多返回 10 个地点（不分类时）
  CATEGORY_REGION_MAX_COUNT: 15, // 分类+地区查询最多返回 15 个地点
  CATEGORY_THRESHOLD: 6, // 超过这个数量时分类展示
  MIN_PLACES_PER_CATEGORY: 3,
  MIN_CATEGORIES: 2,  // 至少 2 个分类
  NAME_SIMILARITY_THRESHOLD: 0.6,
  COORDINATE_THRESHOLD: 0.01, // ~1.1km for strict matching
  COORDINATE_THRESHOLD_RELAXED: 0.02, // ~2.2km for relaxed matching with city
  COORDINATE_THRESHOLD_VERY_CLOSE: 0.002, // ~220m for same place with different names
  IMAGE_SEARCH_TIMEOUT_MS: 15000,
  MIN_PLACES_FOR_CARDS: 3, // 少于这个数量时，改用文本格式
  GEOCODE_TIMEOUT_MS: 3000, // 单个地址 geocoding 超时（从 5s 降到 3s）
};

/**
 * 对没有有效坐标的地点进行地址反查坐标
 * 使用 Nominatim 的 forwardGeocode 功能
 * @param places 地点数组
 * @param city 城市名（用于补充地址）
 * @returns 处理后的地点数组（原地修改）
 */
async function geocodePlacesMissingCoordinates(
  places: PlaceResult[],
  city?: string,
  language?: string
): Promise<PlaceResult[]> {
  // 找出需要 geocoding 的地点：坐标为 0 或接近 0，且有地址或名称
  const needsGeocode = places.filter(p => {
    const hasInvalidCoords = (p.latitude === 0 && p.longitude === 0) ||
      (Math.abs(p.latitude) < 0.0001 && Math.abs(p.longitude) < 0.0001);
    const hasAddressInfo = p.address || p.name;
    return hasInvalidCoords && hasAddressInfo;
  });

  if (needsGeocode.length === 0) {
    return places;
  }

  logger.info(`[SearchV2] Geocoding ${needsGeocode.length} places with missing coordinates (using Mapbox + Nominatim fallback)...`);

  // 并行处理，使用 Mapbox 可以支持更高并发
  const batchSize = 5; // Mapbox 支持更高并发
  for (let i = 0; i < needsGeocode.length; i += batchSize) {
    const batch = needsGeocode.slice(i, i + batchSize);
    
    await Promise.all(batch.map(async (place) => {
      try {
        // 获取城市：优先使用 place.city，其次使用传入参数 city
        const effectiveCity = place.city || city || '';
        
        // 构建搜索地址：总是包含城市以确保坐标在正确的城市
        // 即使有地址也要加城市，防止同名地点被匹配到错误位置
        let searchAddress: string;
        if (place.address) {
          // 检查地址是否已包含城市
          const addressLower = place.address.toLowerCase();
          const cityLower = effectiveCity.toLowerCase();
          if (effectiveCity && !addressLower.includes(cityLower)) {
            searchAddress = `${place.address}, ${effectiveCity}`;
          } else {
            searchAddress = place.address;
          }
        } else {
          searchAddress = `${place.name}${effectiveCity ? `, ${effectiveCity}` : ''}${place.country ? `, ${place.country}` : ''}`;
        }
        
        const coords = await Promise.race([
          geocodeService.forwardGeocode(searchAddress, { language }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), CONFIG.GEOCODE_TIMEOUT_MS)),
        ]);

        if (coords) {
          place.latitude = coords.lat;
          place.longitude = coords.lon;
          logger.info(`[SearchV2] Geocoded "${place.name}": ${coords.lat}, ${coords.lon}`);
        } else {
          logger.warn(`[SearchV2] Geocoding failed for "${place.name}" (address: "${searchAddress}")`);
        }
      } catch (error) {
        logger.warn(`[SearchV2] Geocoding error for "${place.name}": ${error}`);
      }
    }));

    // 批次间稍作延迟（Mapbox 不太需要，但保持以防万一）
    if (i + batchSize < needsGeocode.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  const geocoded = needsGeocode.filter(p => p.latitude !== 0 || p.longitude !== 0).length;
  logger.info(`[SearchV2] Successfully geocoded ${geocoded}/${needsGeocode.length} places`);

  return places;
}

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
  // ⚠️ 分类值使用小写，查询时使用 mode: 'insensitive' 进行大小写不敏感匹配
  'cafe': ['cafe'],
  'cafes': ['cafe'],  // 复数形式
  'coffee': ['cafe'],
  'bakery': ['bakery'],
  'bakeries': ['bakery'],  // 复数形式
  'restaurant': ['restaurant'],
  'restaurants': ['restaurant'],  // 复数形式
  'ramen': ['restaurant'],
  'sushi': ['restaurant'],
  '拉面': ['restaurant'],
  '拉麵': ['restaurant'],
  '拉面店': ['restaurant'],
  '拉麵店': ['restaurant'],
  '日式拉面': ['restaurant'],
  '日式拉麵': ['restaurant'],
  '面馆': ['restaurant'],
  '面館': ['restaurant'],
  '寿司': ['restaurant'],
  'museum': ['museum'],  // museum 只搜索 museum，不再合并 gallery
  'museums': ['museum'],  // 复数形式
  'design museum': ['museum'],  // design museum 只搜索 museum
  'design museums': ['museum'],  // 复数形式
  'gallery': ['gallery'],  // gallery 只搜索 gallery
  'galleries': ['gallery'],  // 复数形式
  'art gallery': ['gallery'],  // art gallery 只搜索 gallery
  'art galleries': ['gallery'],  // 复数形式
  'temple': ['temple'],
  'temples': ['temple'],  // 复数形式
  'shrine': ['shrine'],
  'shrines': ['shrine'],  // 复数形式
  'park': ['park'],
  'parks': ['park'],  // 复数形式
  'garden': ['park'],
  'gardens': ['park'],  // 复数形式
  'bar': ['bar'],
  'bars': ['bar'],  // 复数形式
  'pub': ['bar'],
  'pubs': ['bar'],  // 复数形式
  'shop': ['shop'],
  'shops': ['shop'],  // 复数形式
  'shopping': ['shop'],
  'hotel': ['hotel'],
  'hotels': ['hotel'],  // 复数形式
  'market': ['market'],  // 市场
  'markets': ['market'],  // 复数形式
  'food market': ['market'],
  'food markets': ['market'],  // 复数形式
  'flea market': ['market'],
  'flea markets': ['market'],  // 复数形式
  'yarn': ['yarn_store'],  // 毛线店
  'yarn store': ['yarn_store'],
  'yarn stores': ['yarn_store'],  // 复数形式
  'yarn shop': ['yarn_store'],
  'yarn shops': ['yarn_store'],  // 复数形式
  'knitting': ['yarn_store'],
  'craft store': ['yarn_store', 'shop'],
  'craft stores': ['yarn_store', 'shop'],  // 复数形式
  '毛线': ['yarn_store'],      // 中文毛线
  '毛线店': ['yarn_store'],    // 中文毛线店
  '编织': ['yarn_store'],      // 中文编织
  '编织店': ['yarn_store'],    // 中文编织店
  'bookstore': ['bookstore'],
  'bookstores': ['bookstore'],  // 复数形式
  'thrift store': ['thrift_store'],
  'thrift stores': ['thrift_store'],  // 复数形式
  'vintage shop': ['thrift_store'],
  'vintage shops': ['thrift_store'],  // 复数形式
  'cemetery': ['cemetery'],
  'cemeteries': ['cemetery'],  // 复数形式
  'graveyard': ['cemetery'],
  'graveyards': ['cemetery'],  // 复数形式
  '墓园': ['cemetery'],
  '公墓': ['cemetery'],
  // 其他常见分类的单复数
  'church': ['church'],
  'churches': ['church'],
  'castle': ['castle'],
  'castles': ['castle'],
  'beach': ['beach'],
  'beaches': ['beach'],
  'bridge': ['bridge'],
  'bridges': ['bridge'],
  'library': ['library'],
  'libraries': ['library'],
  'theater': ['theater'],
  'theaters': ['theater'],
  'theatre': ['theater'],
  'theatres': ['theater'],
  'stadium': ['stadium'],
  'stadiums': ['stadium'],
  'university': ['university'],
  'universities': ['university'],
  'square': ['square'],
  'squares': ['square'],
  'palace': ['palace'],
  'palaces': ['palace'],
  'monument': ['monument'],
  'monuments': ['monument'],
  'tower': ['tower'],
  'towers': ['tower'],
  'fountain': ['fountain'],
  'fountains': ['fountain'],
};

const COUNTRY_KEYWORD_MAP: Record<string, string> = {
  // Chinese
  '日本': 'Japan',
  '中国': 'China',
  '美国': 'United States',
  '英国': 'United Kingdom',
  '法国': 'France',
  '意大利': 'Italy',
  '西班牙': 'Spain',
  '德国': 'Germany',
  '韩国': 'South Korea',
  '泰国': 'Thailand',
  '新加坡': 'Singapore',
  '澳大利亚': 'Australia',
  '加拿大': 'Canada',
  '荷兰': 'Netherlands',
  // English (lowercase matching)
  'japan': 'Japan',
  'china': 'China',
  'united states': 'United States',
  'usa': 'United States',
  'united kingdom': 'United Kingdom',
  'uk': 'United Kingdom',
  'france': 'France',
  'italy': 'Italy',
  'spain': 'Spain',
  'germany': 'Germany',
  'south korea': 'South Korea',
  'korea': 'South Korea',
  'thailand': 'Thailand',
  'singapore': 'Singapore',
  'australia': 'Australia',
  'canada': 'Canada',
  'netherlands': 'Netherlands',
};

let _kouriProvider: KouriProvider | null = null;
function getKouriProvider(): KouriProvider {
  // This module is imported before dotenv.config() runs in src/index.ts
  // (TS transpiles imports to top-level requires). Lazy init ensures
  // providers see env vars loaded from .env.
  _kouriProvider ??= new KouriProvider();
  return _kouriProvider;
}

/**
 * Remove accents/diacritics from a string for better matching
 * e.g., "Père-Lachaise" -> "Pere-Lachaise"
 */
function removeAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normalize a name for search matching:
 * - Remove accents (è -> e, é -> e)
 * - Convert to lowercase
 * - Remove common prefixes/suffixes like "Cemetery", "du", "of", etc.
 */
function normalizeNameForSearch(name: string): string {
  if (!name) return '';
  let normalized = removeAccents(name).toLowerCase().trim();
  // Remove common articles and prepositions
  normalized = normalized.replace(/\b(the|du|de|la|le|of|del|der|das|die)\b/gi, ' ');
  // Collapse multiple spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();
  return normalized;
}

// Extract core name from a place name (without location suffix, numbers, etc.)
function getCoreName(name: string): string {
  // Remove leading numbers like "1. " or "1."
  let coreName = name.replace(/^\d+\.\s*/, '').trim();
  // Remove common location suffixes
  coreName = coreName.replace(/\s*[-–]\s*(st\s+giles|soho|covent\s+garden|regent\s+street|central|mayfair|chinatown|shoreditch|chelsea|westfield|canary\s+wharf|kings?\s+cross|brixton|camden|islington|paddington|victoria|piccadilly|oxford\s+street|tottenham\s+court\s+road)$/i, '').trim();
  // Remove parenthetical content
  coreName = coreName.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return coreName.toLowerCase();
}

function isRetryableAIError(error: unknown): boolean {
  const code = (error as any)?.code;
  return code === AIErrorCode.RATE_LIMITED
    || code === AIErrorCode.SERVICE_UNAVAILABLE
    || code === AIErrorCode.INTERNAL_ERROR
    || code === AIErrorCode.TIMEOUT;
}

async function generateTextWithFallback(
  prompt: string,
  timeoutMs: number,
  systemPrompt?: string,
): Promise<string> {
  try {
    const timeout = Math.min(timeoutMs, 15000);
    return await Promise.race([
      aiService.executeWithFallback(
        (provider) => provider.generateText(prompt, systemPrompt),
        'generateText',
      ),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('AI timeout')), timeout)),
    ]);
  } catch (error) {
    logger.warn(`[SearchV2] AI text generation failed: ${JSON.stringify(error)}`);
    return '';
  }
}

async function generateJsonTextWithFallback(prompt: string, timeoutMs: number): Promise<string> {
  try {
    const kouriTimeoutMs = Math.min(timeoutMs, 15000);
    return await Promise.race<string>([
      aiService.executeWithFallback(
        (provider) => {
          const anyProvider = provider as any;
          if (typeof anyProvider.generateTextNoSearch === 'function') {
            return anyProvider.generateTextNoSearch(prompt);
          }
          return provider.generateText(prompt);
        },
        'generateJsonTextWithFallback',
      ),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('AI timeout')), kouriTimeoutMs)),
    ]);
  } catch (error) {
    logger.warn(`[SearchV2] AI JSON generation failed: ${JSON.stringify(error)}`);
    return '';
  }
}

/**
 * 使用联网搜索功能生成文本（用于需要实时网络信息的场景）
 * 优先使用 Kouri，其次 OpenRouter（两者都支持 web_search_preview）
 */
async function generateTextWithWebSearch(prompt: string, timeoutMs: number): Promise<string> {
  try {
    // 优先尝试 Kouri（它的 generateText 也支持 web_search_preview）
    const kouriProvider = getKouriProvider();
    if (kouriProvider.isAvailable()) {
      logger.info('[SearchV2] Using Kouri web search for enrichment');
      try {
        const result = await Promise.race([
          kouriProvider.generateText(prompt),  // Kouri generateText 使用 web_search_preview
          new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Kouri timeout')), timeoutMs)),
        ]);
        if (result && result.trim()) {
          return result;
        }
      } catch (kouriError) {
        logger.warn(`[SearchV2] Kouri web search failed: ${kouriError}, trying OpenRouter`);
      }
    }

    // 回退到 OpenRouter
    const openRouterProvider = new OpenRouterProvider();
    if (openRouterProvider.isAvailable()) {
      logger.info('[SearchV2] Using OpenRouter web search for enrichment');
      const result = await Promise.race([
        openRouterProvider.generateText(prompt),  // OpenRouter generateText 使用 web_search_preview
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error('OpenRouter timeout')), timeoutMs)),
      ]);
      return result;
    }
    
    // Fallback to regular generation if neither available
    logger.warn('[SearchV2] No web search provider available, falling back to regular AI');
    return await generateTextWithFallback(prompt, timeoutMs);
  } catch (error) {
    logger.warn(`[SearchV2] Web search generation failed: ${error}`);
    return '';
  }
}

/**
 * 合并调用：生成开场白 + 总结 + 地点摘要（一次 AI 调用）
 * Combined AI call: Generate acknowledgment + overall summary + place summaries in ONE request
 * 这样可以将 3 次 AI 调用减少为 1 次
 */
interface CombinedTextResult {
  acknowledgment: string;
  overallSummary: string;
  placeSummaries: Map<string, string>;
}

async function generateCombinedTexts(
  query: string,
  places: Array<{ id: string; name: string; city?: string; country?: string }>,
  language: 'en' | 'zh',
  parsedQuery: ParsedQuery,
): Promise<CombinedTextResult> {
  const lang = language === 'zh' ? 'Chinese' : 'English';
  const city = parsedQuery.city?.trim() || '';
  
  // 🚀 优化：取前14个地点生成 summary（确保所有返回的地点都有）
  const placesToSummarize = places.slice(0, 14);
  const placesList = placesToSummarize.map(p => `${p.id}:${p.name}`).join(';');
  
  // 根据语言选择不同的示例
  const ackExamples = language === 'zh' 
    ? `  - 哥本哈根brunch: "哥本哈根的brunch文化源于北欧人对健康饮食的追求，开放式三明治smørrebrød、有机酸奶是当地热门选择。"
  - 伦敦公园: "伦敦的皇家公园承载着数百年历史，从亨利八世的狩猎场到维多利亚时代的公共绿地。当地人喜欢在Hyde Park晨跑、Regent's Park野餐。"
  - 东京拉面: "东京拉面讲究'一期一会'的匠人精神，从浓郁豚骨到清爽酱油各区都有代表性流派。�的涓谷家系、新宿二郎系、池�的�的味道豚骨都是经典选择。"
  - 巴黎咖啡馆: "巴黎咖啡馆文化可追溯至17世纪，左岸的Café de Flore和Les Deux Magots曾是萨特和波伏瓦的据点。点一杯浓缩配可颂，是巴黎人的日常仪式。"`
    : `  - Copenhagen brunch: "Copenhagen's brunch scene reflects the Nordic passion for fresh, organic ingredients. Open-faced smørrebrød and artisanal coffee are local favorites."
  - London parks: "London's Royal Parks date back to Henry VIII's hunting grounds. Locals jog in Hyde Park at dawn and picnic in Regent's Park on weekends."
  - Tokyo ramen: "Tokyo's ramen culture is an art form, from rich tonkotsu to light shoyu. Each neighborhood has its signature style, with late-night spots beloved by salarymen."
  - Paris cafes: "Parisian cafe culture dates to the 17th century. Left Bank classics like Café de Flore once hosted Sartre and Simone de Beauvoir. Order an espresso with a croissant—the Parisian ritual."`;
  
  const summaryExample = language === 'zh' ? '"有问题随时问我！"' : '"Feel free to ask for more details!"';
  
  // 🔧 改进 prompt：更明确地要求 JSON 输出，强调语言一致性
  const prompt = `You are a travel assistant with local expertise. Generate JSON response ONLY.

CRITICAL: ALL text MUST be in ${lang}. Do NOT mix languages. Every single word must be in ${lang}.
Language: ${lang}
Query: "${query}"${city ? `\nCity: ${city}` : ''}
Places (id:name): ${placesList}

Return ONLY this exact JSON structure (no markdown, no explanation):
{"acknowledgment":"<100-150 char culturally rich opening in ${lang}>","overallSummary":"<40-60 char short closing in ${lang}>","placeSummaries":[{"id":"<place id>","summary":"<50-100 char description in ${lang}>"}]}

CRITICAL RULES:
- LANGUAGE: ALL OUTPUT MUST BE IN ${lang.toUpperCase()}. No English words in Chinese output, no Chinese in English output.
- acknowledgment (100-150 chars): Write a culturally informative introduction with SPECIFIC insider knowledge about this topic in this city. MUST include at least 2-3 of: historical context, local traditions, unique characteristics, specific local terminology, what locals do/prefer, seasonal aspects, or cultural significance. NEVER use generic phrases like "known for their beauty" or "offers many options".
  Examples (in ${lang}):
${ackExamples}
- overallSummary (40-60 chars): A SHORT closing that only says "Let me know if you need more info" or similar. DO NOT repeat any content from acknowledgment.
  Example: ${summaryExample}
- Each place summary: 50-100 chars, vivid description of what makes it special. MUST be in ${lang}.
Include ALL places in placeSummaries array. JSON only:`;

  try {
    const response = await generateTextWithFallback(prompt, 15000);
    logger.info(`[SearchV2] generateCombinedTexts AI response: ${response?.substring(0, 500) || 'EMPTY'}`);
    if (!response) {
      return {
        acknowledgment: generateAcknowledgmentTemplate(query, language, parsedQuery),
        overallSummary: generateOverallSummaryTemplate(query, places as PlaceResult[], language),
        placeSummaries: new Map(),
      };
    }
    
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const placeSummaries = new Map<string, string>();
      
      logger.info(`[SearchV2] Parsed placeSummaries: ${JSON.stringify(parsed.placeSummaries)?.substring(0, 500)}`);
      
      if (parsed.placeSummaries && Array.isArray(parsed.placeSummaries)) {
        for (const item of parsed.placeSummaries) {
          const id = typeof item?.id === 'string' ? item.id : '';
          const summary = typeof item?.summary === 'string' ? item.summary : '';
          if (id && summary) placeSummaries.set(id, summary.trim());
        }
      }
      
      logger.info(`[SearchV2] Combined AI: ack=${(parsed.acknowledgment || '').length}c, ${placeSummaries.size} summaries`);
      
      return {
        acknowledgment: normalizeAcknowledgment(parsed.acknowledgment || '', 50, 250),
        overallSummary: sanitizePlainTextOutput(parsed.overallSummary || ''),
        placeSummaries,
      };
    }
  } catch (error) {
    logger.warn(`[SearchV2] generateCombinedTexts failed: ${error}`);
  }
  
  // Fallback to templates
  return {
    acknowledgment: generateAcknowledgmentTemplate(query, language, parsedQuery),
    overallSummary: generateOverallSummaryTemplate(query, places as PlaceResult[], language),
    placeSummaries: new Map(),
  };
}

/**
 * 旧版合并调用：生成开场白 + 总结（一次 AI 调用）
 * Legacy Combined AI call: Generate acknowledgment + overall summary in one request
 */
interface AcknowledgmentAndSummary {
  acknowledgment: string;
  overallSummary: string;
}

async function generateAcknowledgmentAndSummary(
  query: string,
  places: PlaceResult[],
  language: 'en' | 'zh',
  parsedQuery: ParsedQuery,
): Promise<AcknowledgmentAndSummary> {
  const languageText = language === 'zh' ? 'Chinese' : 'English';
  const cityText = parsedQuery.city?.trim() || parsedQuery.country?.trim() || '';
  const categoryText = parsedQuery.category?.trim() || '';
  const placeNames = places.slice(0, 5).map(p => p.name).join(', ');
  
  const prompt = `Generate TWO pieces of text for a travel recommendation:

User search: "${query}"
Context: ${cityText ? `City: ${cityText}` : ''}${categoryText ? `, Category: ${categoryText}` : ''}
Places found: ${placeNames || 'various places'}

Requirements:
1. "acknowledgment": Opening text (100-150 chars)
   - Culturally informative introduction about this topic in this city/area
   - Include local characteristics, food culture, lifestyle, popular dishes/styles
   - Make it feel like insider knowledge
   - DO NOT use generic greetings or "enjoy your trip" phrases
   - Example (Chinese): "哥本哈根的brunch文化源于北欧人对健康饮食的追求，开放式三明治和有机酸奶是当地热门选择，下面为你推荐几家好店。"
2. "overallSummary": Closing text (40-60 chars)
   - Short closing that only invites follow-up questions
   - DO NOT repeat content from acknowledgment
   - DO NOT say "enjoy your trip/adventure"
   - Example: "有问题随时问我！" or "Feel free to ask for more details!"

Output language: ${languageText}
Return JSON only: {"acknowledgment": "...", "overallSummary": "..."}`;

  try {
    const response = await generateTextWithFallback(prompt, 10000);
    if (!response) {
      return {
        acknowledgment: generateAcknowledgmentTemplate(query, language, parsedQuery),
        overallSummary: generateOverallSummaryTemplate(query, places, language),
      };
    }
    
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        acknowledgment: normalizeAcknowledgment(parsed.acknowledgment || '', 50, 250),
        overallSummary: sanitizePlainTextOutput(parsed.overallSummary || ''),
      };
    }
  } catch (error) {
    logger.warn(`[SearchV2] generateAcknowledgmentAndSummary failed: ${error}`);
  }
  
  // Fallback to templates
  return {
    acknowledgment: generateAcknowledgmentTemplate(query, language, parsedQuery),
    overallSummary: generateOverallSummaryTemplate(query, places, language),
  };
}

/**
 * 合并调用：生成地点摘要（直接用目标语言，一次 AI 调用）
 * Combined AI call: Generate place summaries in target language (no separate translation needed)
 */
interface PlaceSummaryInfo {
  id: string;
  name: string;
  city?: string;
  country?: string;
}

async function generatePlaceSummariesInLanguage(
  places: PlaceSummaryInfo[],
  query: string,
  language: 'en' | 'zh',
): Promise<Map<string, string>> {
  if (places.length === 0) return new Map();
  
  const languageText = language === 'zh' ? 'Chinese' : 'English';
  const placesList = places.map(p => `- ${p.name}${p.city ? ` (${p.city})` : ''}`).join('\n');
  
  const prompt = `Generate short summaries for these places based on the search query.

Search query: "${query}"
Places:
${placesList}

Requirements:
- Each summary: 40-60 characters, complete sentence
- Highlight what makes each place special for this query
- Output language: ${languageText}

Return JSON only: {"summaries": {"PlaceName1": "summary1", "PlaceName2": "summary2", ...}}`;

  try {
    const response = await generateTextWithFallback(prompt, 15000);
    if (!response) return new Map();
    
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const summaries = parsed.summaries || parsed;
      const result = new Map<string, string>();
      
      for (const place of places) {
        // Try exact match first, then fuzzy match
        let summary = summaries[place.name];
        if (!summary) {
          // Try case-insensitive match
          const key = Object.keys(summaries).find(
            k => k.toLowerCase() === place.name.toLowerCase()
          );
          if (key) summary = summaries[key];
        }
        if (summary && typeof summary === 'string') {
          result.set(place.id, summary.trim());
        }
      }
      return result;
    }
  } catch (error) {
    logger.warn(`[SearchV2] generatePlaceSummariesInLanguage failed: ${error}`);
  }
  
  return new Map();
}

/**
 * Generate acknowledgment template - fallback when AI fails
 * 更丰富的开场白，包含当地文化特色
 */
function generateAcknowledgmentTemplate(
  query: string,
  language: 'en' | 'zh',
  parsedQuery: ParsedQuery,
): string {
  const cityText = parsedQuery.city?.trim() || parsedQuery.country?.trim() || '';
  const categoryText = parsedQuery.category?.trim() || '';
  const categoryLower = categoryText.toLowerCase();
  const queryLower = parsedQuery.originalQuery?.toLowerCase() || '';
  
  // 针对不同类型的地点，提供更有文化特色的模板
  if (language === 'zh') {
    if (cityText) {
      // 拉面专门处理
      if (categoryLower.includes('ramen') || categoryLower.includes('拉面') || categoryLower.includes('拉麵') || 
          queryLower.includes('拉面') || queryLower.includes('拉麵') || queryLower.includes('ramen')) {
        return `${cityText}的拉面文化讲究匠人精神，从浓郁豚骨到清爽酱油，各区都有代表性流派。无论是深夜食堂还是立食店，都能感受到面道的精髓。`;
      }
      // 公园/绿地
      if (categoryLower.includes('park') || categoryLower.includes('公园') || categoryLower.includes('garden') || categoryLower.includes('花园')) {
        return `${cityText}的公园绿地承载着丰富的历史与城市记忆，是当地人晨练、野餐和周末休闲的首选。以下推荐几处自然与人文兼具的好去处。`;
      }
      // 咖啡/下午茶
      if (categoryLower.includes('coffee') || categoryLower.includes('咖啡') || categoryLower.includes('cafe') || categoryLower.includes('tea')) {
        return `${cityText}的咖啡文化有着独特的本地风味，从隐藏在小巷的独立咖啡馆到历史悠久的老字号，每家店都有自己的故事。`;
      }
      // 餐厅/美食
      if (categoryLower.includes('restaurant') || categoryLower.includes('餐') || categoryLower.includes('food') || categoryLower.includes('美食')) {
        return `${cityText}的美食文化融合了传统与创新，从街边小吃到高档料理，处处都能感受当地人对味道的执着追求。`;
      }
      // 通用
      if (categoryText) {
        return `${cityText}的${categoryText}场景丰富多彩，融合了当地人的生活品味与创意灵感。以下推荐几处值得一探的好去处。`;
      }
      return `${cityText}是一座值得细细品味的城市，隐藏着许多当地人钟爱的宝藏地点。以下是精心挑选的推荐。`;
    } else if (categoryText) {
      return `${categoryText}的选择丰富多彩，每一处都有独特的氛围和故事。以下是几处值得探索的推荐。`;
    }
    return '以下是为你精心挑选的推荐，每一处都有独特的亮点和体验。';
  } else {
    if (cityText) {
      // Parks/Gardens
      if (categoryLower.includes('park') || categoryLower.includes('garden')) {
        return `${cityText}'s parks and gardens reflect centuries of history and urban heritage. They're beloved by locals for morning jogs, weekend picnics, and peaceful escapes. Here are some top picks.`;
      }
      // Coffee/Cafe
      if (categoryLower.includes('coffee') || categoryLower.includes('cafe') || categoryLower.includes('tea')) {
        return `${cityText}'s cafe culture has its own distinctive character, from hidden alley roasters to historic establishments. Each spot tells a unique story. Here are some favorites.`;
      }
      // Restaurants/Food
      if (categoryLower.includes('restaurant') || categoryLower.includes('food') || categoryLower.includes('dining')) {
        return `${cityText}'s culinary scene blends tradition with innovation, from street food to fine dining. Locals take great pride in their food heritage. Here are some standouts.`;
      }
      // Generic with category
      if (categoryText) {
        return `${cityText} offers a vibrant ${categoryText} scene shaped by local tastes and creative flair. Here are some spots worth exploring.`;
      }
      return `${cityText} is a city worth savoring slowly, with hidden gems beloved by locals. Here are some curated recommendations.`;
    } else if (categoryText) {
      return `There are many wonderful ${categoryText} options to explore, each with its own unique atmosphere and story. Here are some recommendations.`;
    }
    return 'Here are some carefully curated recommendations, each with its own unique highlights and experiences.';
  }
}

/**
 * Generate overall summary template - fallback when AI fails
 * 简短的结束语，只邀请用户询问更多
 */
function generateOverallSummaryTemplate(
  query: string,
  places: PlaceResult[],
  language: 'en' | 'zh',
): string {
  if (language === 'zh') {
    return '有问题随时问我！';
  } else {
    return 'Feel free to ask for more details!';
  }
}

// Legacy function - now delegates to combined function or template
async function generateAcknowledgment(
  query: string,
  language: 'en' | 'zh',
  parsedQuery: ParsedQuery,
): Promise<string> {
  return generateAcknowledgmentTemplate(query, language, parsedQuery);
}

// Legacy function - now delegates to template
async function generateOverallSummaryText(
  query: string,
  places: PlaceResult[],
  language: 'en' | 'zh',
): Promise<string> {
  return generateOverallSummaryTemplate(query, places, language);
}

function sanitizePlainTextOutput(text: string): string {
  if (!text) return '';
  let cleaned = text.replace(/```[\s\S]*?```/g, '').trim();
  // Remove leading/trailing JSON-like wrappers or list brackets/quotes.
  cleaned = cleaned
    .replace(/^[\[\]\{\}\"\'“”‘’]+/g, '')
    .replace(/[\[\]\{\}\"\'“”‘’]+$/g, '')
    .trim();
  // Remove stray leading list markers/quotes per line.
  cleaned = cleaned
    .split('\n')
    .map(line => line.replace(/^[\s\[\]\{\}\"\'“”‘’，、\-]+/, '').trim())
    .filter(line => line.length > 0)
    .join('\n');
  // Remove lingering trailing quotes after punctuation.
  cleaned = cleaned.replace(/[\"\'“”‘’]+\s*$/g, '').trim();
  return cleaned;
}

function normalizeAcknowledgment(text: string, minChars: number, maxChars: number): string {
  let cleaned = sanitizePlainTextOutput(text || '');
  if (!cleaned) return '';
  cleaned = cleaned.replace(/["“”‘’]+/g, '').replace(/\s+/g, ' ').trim();
  const normalized = cleaned.replace(/，\s*,/g, '，').trim();
  const parts = normalized
    .split(/(?<=[。！？!?])/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const part of parts) {
    const key = part.replace(/[\s，,。！？!?]+/g, '');
    if (!key || part.length < 6) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(part);
  }

  // Collapse repeated "为您推荐" style sentences, keep the most informative one.
  const recommendParts = unique.filter(p => p.includes('为您推荐'));
  const otherParts = unique.filter(p => !p.includes('为您推荐'));
  if (recommendParts.length > 1) {
    recommendParts.sort((a, b) => b.length - a.length);
    otherParts.unshift(recommendParts[0]);
  } else if (recommendParts.length === 1) {
    otherParts.unshift(recommendParts[0]);
  }

  const mergedParts = otherParts.length > 0 ? otherParts : unique;

  if (unique.length === 0) return '';

  let result = '';
  for (const part of mergedParts) {
    const candidate = result ? `${result} ${part}` : part;
    if (candidate.length > maxChars) break;
    result = candidate;
    if (result.length >= minChars) break;
  }

  if (!result) {
    result = mergedParts[0] || '';
  }

  return result.trim();
}

function containsCjk(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

function isCjkString(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

async function translateQueryToEnglish(
  query: string,
): Promise<{ translatedQuery: string; status: TranslationStatus }> {
  if (!containsCjk(query)) {
    return { translatedQuery: query, status: 'not_needed' };
  }

  const prompt = `Translate the following travel search query into natural English.
Only return the translated query, no quotes, no extra text.

Query: "${query}"`;

  try {
    const response = await generateTextWithFallback(prompt, 6000);

    const translated = (response || '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/^["“”']|["“”']$/g, '')
      .trim();

    if (translated) {
      return { translatedQuery: translated, status: 'translated' };
    }
  } catch (error) {
    logger.warn(`[SearchV2] Query translation failed: ${error}`);
  }

  return { translatedQuery: query, status: 'failed' };
}

/**
 * 为地点列表生成 AI summary（异步，可并行调用）
 */
/**
 * 生成地点摘要（直接用目标语言，无需后续翻译）
 * Generate place summaries directly in target language (no separate translation needed)
 * 这个函数会直接生成目标语言的摘要，合并了原来的 generateAISummaries + translateSummaries
 */
async function generateAISummariesForPlaces(
  places: Array<{ id: string; name: string; city: string; country?: string; latitude?: number; longitude?: number }>,
  parsedQuery: ParsedQuery,
  language: string
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (places.length === 0) return result;

  // 直接生成目标语言的摘要，无需后续翻译
  const languageText = language === 'zh' ? 'Chinese (Simplified)' : 'English';

  // Batch to keep prompts small and responses fast/reliable.
  const batchSize = 8; // 增加批次大小以减少 AI 调用次数
  for (let i = 0; i < places.length; i += batchSize) {
    const batch = places.slice(i, i + batchSize);

    const summaryPrompt = `Write a brief but informative summary for each place.

User search: "${parsedQuery.originalQuery}"
City context: ${parsedQuery.city || 'various cities'}

CRITICAL REQUIREMENTS:
- Output language: ${languageText}
- Each summary should be 1 sentence, between 40-70 characters.
- Highlight 1-2 distinctive features: specialty dishes, atmosphere, or unique selling points.
- Make it vivid and specific.
- Do NOT include ratings, review counts, or numbers.
- Do NOT mention the address, city, or country.
- Do NOT change IDs. Return the same id you were given.
- Return JSON only. No markdown, no extra text.

EXAMPLES of GOOD summaries (${languageText}):
${language === 'zh' 
  ? `- "手工染制纯羊毛纱线，氛围温馨。"
- "世界各地稀有纱线，意大利马海毛为特色。"
- "独立设计师手工纱线，色彩丰富细腻。"`
  : `- "Hand-dyed wool yarns in stunning colors, cozy vibe."
- "Rare yarns from worldwide, specializing in Italian mohair."`}

Places JSON:
${JSON.stringify(batch)}

Return JSON only:
{
  "summaries": [
    { "id": "<same id>", "summary": "<concise summary in ${languageText}, 40-70 chars>" }
  ]
}`;

    try {
      const summaryResponse = await generateJsonTextWithFallback(summaryPrompt, CONFIG.AI_SUMMARY_TIMEOUT_MS);

      if (!summaryResponse) continue;

      const jsonMatch = summaryResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) continue;

      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.summaries && Array.isArray(parsed.summaries)) {
        for (const item of parsed.summaries) {
          const id = typeof item?.id === 'string' ? item.id : '';
          const summary = typeof item?.summary === 'string' ? item.summary : '';
          if (id && summary) result.set(id, summary.trim());
        }
      }
    } catch (error) {
      logger.warn(`[SearchV2] Failed to generate AI summaries (batch ${i}-${i + batch.length - 1}): ${error}`);
    }
  }

  if (result.size > 0) {
    logger.info(`[SearchV2] AI generated ${result.size} summaries in ${languageText}`);
  }

  return result;
}

function formatNumberCompact(n: number): string {
  if (!Number.isFinite(n)) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return `${n}`;
}

function buildFallbackPlaceSummary(_place: PlaceResult, _parsedQuery: ParsedQuery, _language: string): string {
  // Avoid template-style fallback copy. If AI summary is unavailable, leave empty.
  return '';
}

/**
 * 检测文本是否匹配目标语言
 * @param text 要检测的文本
 * @param language 目标语言 'zh' 或 'en'
 * @returns true 如果文本与目标语言匹配
 */
function isTextInTargetLanguage(text: string, language: string): boolean {
  const s = (text || '').trim();
  if (!s || s.length < 5) return true; // 太短无法判断，默认匹配
  
  const hasChinese = /[\u4e00-\u9fff]/.test(s);
  const hasJapanese = /[\u3040-\u309f\u30a0-\u30ff]/.test(s); // hiragana + katakana
  const hasKorean = /[\uac00-\ud7af]/.test(s);
  const hasCJK = hasChinese || hasJapanese || hasKorean;
  
  if (language === 'zh') {
    // 中文模式：需要有中文字符
    return hasChinese;
  } else {
    // 英文模式：不应该有大量 CJK 字符
    // 允许少量 CJK（如地名），但主体应该是英文
    const cjkCount = (s.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g) || []).length;
    const totalChars = s.length;
    return cjkCount / totalChars < 0.3; // CJK 字符少于 30%
  }
}

function isLikelyFallbackSummary(summary: string, language: string): boolean {
  const s = (summary || '').trim();
  if (!s) return false;

  // 首先检查语言是否匹配
  if (!isTextInTargetLanguage(s, language)) {
    return true; // 语言不匹配，需要重新生成
  }

  if (s.startsWith('Known for ')) return true;
  if (s.includes('memorable vibe') && s.includes('Distinctive flavors')) return true;
  return false;
}

function buildFallbackOverallSummary(_parsedQuery: ParsedQuery, _count: number, _language: string): string {
  // Avoid template-style fallback copy. If AI overall summary is unavailable, leave empty.
  return '';
}

function truncateToMaxChars(text: string, maxChars: number): string {
  if (!text) return '';
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return trimmed.slice(0, maxChars);
}

function isSummaryRelevant(placeName: string, summary: string): boolean {
  if (!placeName || !summary) return false;
  const normalizedSummary = summary.toLowerCase();
  const tokens = placeName
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3);

  if (tokens.length === 0) return false;
  return tokens.some(token => normalizedSummary.includes(token));
}

function normalizeLocationText(value: string | null | undefined): string {
  return (value || '').toLowerCase().trim();
}

function inferCountryFromCuisine(query: string): string {
  const lower = query.toLowerCase();
  if (query.includes('日本') || query.includes('日式')) return 'Japan';
  if (lower.includes('japan') || lower.includes('japanese')) return 'Japan';
  return '';
}

function inferCityFromQuery(query: string): string {
  const lower = query.toLowerCase();
  if (query.includes('东京') || query.includes('東京') || lower.includes('tokyo')) return 'Tokyo';
  if (query.includes('大阪') || lower.includes('osaka')) return 'Osaka';
  return '';
}

function buildFallbackEnglishQuery(query: string): string {
  let result = query;
  const replacements: Array<[RegExp, string]> = [
    // 城市名 - 从 intentClassifierService 的 CHINESE_CITY_TO_ENGLISH 中复制常见的
    [/东京|東京/gi, 'Tokyo'],
    [/伦敦|倫敦/gi, 'London'],
    [/巴黎/gi, 'Paris'],
    [/纽约|紐約/gi, 'New York'],
    [/首尔|首爾/gi, 'Seoul'],
    [/北京/gi, 'Beijing'],
    [/上海/gi, 'Shanghai'],
    [/曼谷/gi, 'Bangkok'],
    [/新加坡/gi, 'Singapore'],
    [/香港/gi, 'Hong Kong'],
    [/台北/gi, 'Taipei'],
    [/京都/gi, 'Kyoto'],
    [/大阪/gi, 'Osaka'],
    // 国家
    [/日本/gi, 'Japan'],
    [/日式/gi, 'Japanese'],
    [/韩国|韓國/gi, 'Korea'],
    [/韩式|韓式/gi, 'Korean'],
    [/中国|中國/gi, 'China'],
    [/中式/gi, 'Chinese'],
    [/泰国|泰國/gi, 'Thailand'],
    [/泰式/gi, 'Thai'],
    [/法国|法國/gi, 'France'],
    [/法式/gi, 'French'],
    [/意大利/gi, 'Italy'],
    [/意式/gi, 'Italian'],
    // 餐饮类别
    [/拉面店|拉麵店/gi, 'ramen shop'],
    [/拉面|拉麵/gi, 'ramen'],
    [/咖啡店|咖啡馆|咖啡廳|咖啡厅/gi, 'cafe'],
    [/咖啡/gi, 'coffee'],
    [/餐厅|餐廳/gi, 'restaurant'],
    [/美食/gi, 'food'],
    [/酒吧/gi, 'bar'],
    [/酒店|民宿/gi, 'hotel'],
    [/青旅/gi, 'hostel'],
    [/甜品店|甜点店/gi, 'dessert shop'],
    [/甜品|甜点/gi, 'dessert'],
    [/烘焙|面包店|麵包店/gi, 'bakery'],
    [/寿司店|壽司店/gi, 'sushi restaurant'],
    [/寿司|壽司/gi, 'sushi'],
    [/烧烤|燒烤/gi, 'BBQ'],
    [/火锅|火鍋/gi, 'hotpot'],
    // 购物类别
    [/毛线店/gi, 'yarn store'],
    [/毛线/gi, 'yarn'],
    [/手工艺店|手工店/gi, 'craft store'],
    [/编织/gi, 'knitting'],
    [/商店/gi, 'shop'],
    [/书店|書店/gi, 'bookstore'],
    [/二手店/gi, 'thrift store'],
    [/古着店/gi, 'vintage shop'],
    // 景点类别
    [/博物馆|博物館/gi, 'museum'],
    [/美术馆|美術館|画廊/gi, 'art gallery'],
    [/公园|公園/gi, 'park'],
    [/神社/gi, 'shrine'],
    [/寺庙|寺廟/gi, 'temple'],
    [/教堂/gi, 'church'],
    [/城堡/gi, 'castle'],
    // 著名地标（需要放在通用词之前）
    [/埃菲尔铁塔|艾菲尔铁塔|巴黎铁塔/gi, 'Eiffel Tower'],
    [/卢浮宫|罗浮宫/gi, 'Louvre Museum'],
    [/凯旋门/gi, 'Arc de Triomphe'],
    [/自由女神像/gi, 'Statue of Liberty'],
    [/金门大桥/gi, 'Golden Gate Bridge'],
    [/大本钟/gi, 'Big Ben'],
    [/伦敦眼/gi, 'London Eye'],
    [/白金汉宫/gi, 'Buckingham Palace'],
    [/东京塔/gi, 'Tokyo Tower'],
    [/浅草寺/gi, 'Sensoji Temple'],
    [/富士山/gi, 'Mount Fuji'],
    [/长城|万里长城/gi, 'Great Wall of China'],
    [/故宫|紫禁城/gi, 'Forbidden City'],
    [/天安门/gi, 'Tiananmen'],
    [/兵马俑/gi, 'Terracotta Army'],
    [/西湖/gi, 'West Lake'],
    [/外滩/gi, 'The Bund'],
    [/迪士尼乐园|迪斯尼乐园/gi, 'Disneyland'],
    [/环球影城/gi, 'Universal Studios'],
    // 形容词
    [/最好|最佳/gi, 'best'],
    [/好吃/gi, 'delicious'],
    [/推荐|推薦/gi, 'recommended'],
    [/网红|網紅/gi, 'popular'],
    [/打卡/gi, 'must visit'],
    // 数量词
    [/几家|幾家/gi, 'several'],
    [/一些/gi, 'some'],
    [/几个|幾個/gi, 'several'],
    [/一家/gi, 'a'],
    [/两家|兩家/gi, 'two'],
    [/三家/gi, 'three'],
    [/四家/gi, 'four'],
    [/五家/gi, 'five'],
    // 助词（移除）
    [/的/gi, ''],
    // 
    [/附近/gi, 'near me'],
    [/预约/gi, 'reservation'],
    [/门票/gi, 'tickets'],
    [/攻略/gi, 'guide'],
    [/怎么去/gi, 'how to get to'],
  ];

  for (const [pattern, value] of replacements) {
    result = result.replace(pattern, ` ${value} `);
  }

  result = result
    .replace(/[^\p{L}\p{N}\s\-'&]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return result;
}

function normalizeAnyTagsToStrings(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const item of value) {
      if (!item) continue;
      if (typeof item === 'string') {
        if (item.trim()) out.push(item.trim());
        continue;
      }
      if (typeof item === 'object') {
        const s = item.en || item.zh || item.id;
        if (typeof s === 'string' && s.trim()) out.push(s.trim());
      }
    }
    return out;
  }
  if (typeof value === 'object') {
    // structured tags map
    return extractTagsFromStructured(value);
  }
  return [];
}

function hasRamenSignalFromStrings(values: string[]): boolean {
  const joined = values
    .filter((v) => typeof v === 'string' && v.trim())
    .join(' ')
    .toLowerCase();
  if (!joined) return false;

  // Canonical ramen + cross-script variants
  const ramenKeywords = [
    'ramen',
    '拉面',
    '拉麵',
    'ラーメン',
    // Common ramen terms
    'tonkotsu',
    'tsukemen',
    'shoyu',
    'miso',
    'shio',
    // High-signal chains/aliases
    'ichiran',
    '一蘭',
    '一兰',
    '一蘭拉麵',
  ];

  return ramenKeywords.some((k) => joined.includes(k.toLowerCase()));
}

async function translateSummariesToChinese(
  summaries: Array<{ id: string; summary: string }>,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (summaries.length === 0) return result;

  const prompt = `Translate the following place summaries into Simplified Chinese.
Return JSON only:
{
  "translations": [
    { "id": "<same id>", "summary": "<translated summary>" }
  ]
}

Items:
${JSON.stringify(summaries)}
`;

  try {
    const response = await generateTextWithFallback(prompt, 12000);

    if (response) {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed.translations)) {
          for (const item of parsed.translations) {
            const id = typeof item?.id === 'string' ? item.id : '';
            const summary = typeof item?.summary === 'string' ? item.summary : '';
            if (id && summary) result.set(id, summary.trim());
          }
        }
      }
    }
  } catch (error) {
    logger.warn(`[SearchV2] Failed to translate summaries: ${error}`);
  }

  return result;
}

async function translateTextToChinese(text: string): Promise<string> {
  const input = (text || '').trim();
  if (!input) return '';
  if (containsCjk(input)) return input;

  const prompt = `Translate the following text into Simplified Chinese.
Only return the translated text, no quotes, no extra commentary.

Text:
${input}`;

  try {
    const response = await generateTextWithFallback(prompt, 12000);

    const translated = (response || '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/^['"“”]|['"“”]$/g, '')
      .trim();

    return translated || '';
  } catch (error) {
    logger.warn(`[SearchV2] Failed to translate text to Chinese: ${error}`);
    return '';
  }
}

function normalizeCityForMatching(input: string | undefined, parsedQuery: ParsedQuery): string {
  const raw = (input || '').replace(/[()（）]/g, '').trim();
  if (!raw) return parsedQuery.city || '';
  if (containsCjk(raw)) {
    const cityKeywordMap: Record<string, string> = {
      '伦敦': 'London',
      '巴黎': 'Paris',
      '罗马': 'Rome',
      '巴塞罗那': 'Barcelona',
      '马德里': 'Madrid',
      '柏林': 'Berlin',
      '阿姆斯特丹': 'Amsterdam',
      '维也纳': 'Vienna',
      '布拉格': 'Prague',
      '米兰': 'Milan',
      '佛罗伦萨': 'Florence',
      '威尼斯': 'Venice',
      '东京': 'Tokyo',
      '大阪': 'Osaka',
      '京都': 'Kyoto',
      '首尔': 'Seoul',
      '曼谷': 'Bangkok',
      '新加坡': 'Singapore',
      '悉尼': 'Sydney',
      '墨尔本': 'Melbourne',
      '纽约': 'New York',
      '洛杉矶': 'Los Angeles',
      '旧金山': 'San Francisco',
      '芝加哥': 'Chicago',
      '哥本哈根': 'Copenhagen',
    };
    return cityKeywordMap[raw] || parsedQuery.city || '';
  }
  return correctCityName(raw);
}

function normalizeCountryForMatching(input: string | undefined, parsedQuery: ParsedQuery): string {
  const raw = (input || '').replace(/[()（）]/g, '').trim();
  if (!raw) return parsedQuery.country || '';
  if (containsCjk(raw)) {
    return COUNTRY_KEYWORD_MAP[raw] || parsedQuery.country || '';
  }
  return raw;
}

/**
 * 为 AI 生成的地点获取评分（通过 AI 联网搜索）
 * 🚀 优化版：精简 prompt，只获取关键字段
 * @param places AI 生成的地点列表
 * @param city 城市名
 * @param _language 语言代码（未使用）
 * @returns 带有评分的地点列表
 */
async function enrichPlacesWithRatings(
  places: PlaceResult[],
  city: string,
  _language: 'en' | 'zh',
): Promise<PlaceResult[]> {
  if (places.length === 0) return places;
  
  // 过滤出需要获取详细信息的地点
  const placesNeedingInfo = places.filter(
    p => p.source === 'ai' || p.rating === null || p.rating === undefined || p.rating === 0
  );
  
  if (placesNeedingInfo.length === 0) return places;
  
  // 🚀 超精简 prompt - 只获取关键数据
  const names = placesNeedingInfo.slice(0, 5).map(p => p.name).join(',');
  const prompt = `${city}: ${names}
JSON:{"places":[{"name":"","rating":0,"ratingCount":0,"address":"","website":""}]}`;

  try {
    const response = await generateTextWithWebSearch(prompt, 20000);
    if (!response) return places;
    
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return places;
    
    const parsed = JSON.parse(jsonMatch[0]);
    const placeData = Array.isArray(parsed.places) ? parsed.places : [];
    
    const infoMap = new Map<string, { rating?: number; ratingCount?: number; address?: string; website?: string }>();
    for (const item of placeData) {
      if (item.name) {
        infoMap.set(item.name.toLowerCase().trim(), {
          rating: typeof item.rating === 'number' ? item.rating : undefined,
          ratingCount: typeof item.ratingCount === 'number' ? item.ratingCount : undefined,
          address: typeof item.address === 'string' ? item.address : undefined,
          website: typeof item.website === 'string' ? item.website : undefined,
        });
      }
    }
    
    return places.map(place => {
      const key = place.name.toLowerCase().trim();
      const data = infoMap.get(key);
      if (data) {
        const updates: Partial<PlaceResult> = {};
        if (data.rating !== undefined && (!place.rating || place.rating === 0)) {
          updates.rating = data.rating;
          updates.ratingCount = data.ratingCount || 0;
        }
        if (data.address && !place.address) updates.address = data.address;
        if (data.website && !place.website) updates.website = data.website;
        if (Object.keys(updates).length > 0) return { ...place, ...updates };
      }
      return place;
    });
  } catch (error) {
    logger.warn(`[SearchV2] enrichPlacesWithRatings failed: ${error}`);
    return places;
  }
}

/**
 * 完整地点持久化函数
 * 通过 AI 联网搜索获取地点的完整信息（地址、网站、坐标、评分、图片），然后存入数据库
 * 针对连锁店，会要求 AI 推荐具体的某一家分店
 * 
 * @param places AI 生成的地点列表
 * @param city 城市名
 * @param country 国家名
 * @param language 语言代码
 * @param category 分类（用于数据库）
 * @returns 带有真实数据库 ID 的地点列表
 */
async function persistAIPlacesToDB(
  places: PlaceResult[],
  city: string,
  country: string,
  language: 'en' | 'zh',
  category: string,
  options: { skipWebSearch?: boolean } = {},
): Promise<PlaceResult[]> {
  if (places.length === 0) return places;
  
  const skipWebSearch = options.skipWebSearch ?? false;
  logger.info(`[SearchV2] Persisting ${places.length} AI places to database... (skipWebSearch: ${skipWebSearch})`);

  const buildPlaceResultFromDb = (dbPlace: any, fallbackPlace: PlaceResult): PlaceResult => {
    const images = buildPlaceImagesFromDb(dbPlace);
    const existingSummary = String((dbPlace as any).aiSummary || (dbPlace as any).ai_summary || (dbPlace as any).aiDescription || (dbPlace as any).ai_description || '').trim();
    const summary = fallbackPlace.summary || existingSummary || '';
    const hasRating = dbPlace.rating !== null && dbPlace.rating > 0;
    return {
      id: dbPlace.id,
      name: dbPlace.name,
      summary,
      coverImage: dbPlace.coverImage || '',
      images: images.length > 0 ? images : undefined,
      latitude: dbPlace.latitude,
      longitude: dbPlace.longitude,
      city: dbPlace.city || fallbackPlace.city || city,
      country: dbPlace.country || fallbackPlace.country || country,
      rating: dbPlace.rating,
      ratingCount: dbPlace.ratingCount,
      tags: buildDisplayTags(dbPlace.categoryEn, dbPlace.aiTags, 'en', dbPlace.tags as Record<string, string[]> | null),
      isVerified: hasRating || dbPlace.isVerified || false,
      source: 'cache',
      address: dbPlace.address || undefined,
      phoneNumber: dbPlace.phoneNumber || undefined,
      website: dbPlace.website || undefined,
      openingHours: dbPlace.openingHours || undefined,
      customFields: dbPlace.customFields || undefined,
    };
  };

  // 先查找是否已有“联网搜”来源的 AI 地点，避免重复 web search
  const preMatchedWeb = new Map<string, PlaceResult>();
  const placesToEnrich: PlaceResult[] = [];

  for (const place of places) {
    const normalizedName = place.name.toLowerCase().trim();
    const matchCity = (city || place.city || '').trim();
    try {
      const where: any = {
        source: 'ai_generated_web',
        name: { equals: place.name, mode: 'insensitive' as const },
      };
      if (matchCity) {
        where.city = { equals: matchCity, mode: 'insensitive' as const };
      }

      const existingWeb = await prisma.place.findFirst({ where });
      if (existingWeb) {
        preMatchedWeb.set(normalizedName, buildPlaceResultFromDb(existingWeb, place));
      } else {
        placesToEnrich.push(place);
      }
    } catch (error) {
      logger.warn(`[SearchV2] Failed to check existing web-enriched place for "${place.name}": ${error}`);
      placesToEnrich.push(place);
    }
  }

  if (placesToEnrich.length === 0) {
    logger.info(`[SearchV2] Reused ${preMatchedWeb.size}/${places.length} web-enriched places from DB`);
    return places.map(p => preMatchedWeb.get(p.name.toLowerCase().trim()) || p);
  }

  // 🚀 优化：只搜索前5个地点，减少 token 消耗
  const MAX_PLACES_TO_ENRICH = 5;
  const limitedPlacesToEnrich = placesToEnrich.slice(0, MAX_PLACES_TO_ENRICH);
  const skippedPlaces = placesToEnrich.slice(MAX_PLACES_TO_ENRICH);
  
  if (skippedPlaces.length > 0) {
    logger.info(`[SearchV2] Limited enrichment to ${limitedPlacesToEnrich.length} places, ${skippedPlaces.length} will be saved without enrichment`);
  }

  // 🚀 超精简 prompt - 从 600 字符减到 ~100 字符
  const names = limitedPlacesToEnrich.map(p => p.name).join(',');

  const buildMergedMap = (enrichedPlaces: PlaceResult[]): Map<string, PlaceResult> => {
    const merged = new Map<string, PlaceResult>();
    for (const p of enrichedPlaces) {
      merged.set(p.name.toLowerCase().trim(), p);
    }
    for (const original of placesToEnrich) {
      const originalKey = original.name.toLowerCase().trim();
      if (merged.has(originalKey)) continue;
      const matched = enrichedPlaces.find(p => {
        const pName = p.name.toLowerCase().trim();
        return pName === originalKey || pName.includes(originalKey) || originalKey.includes(pName);
      });
      if (matched) {
        merged.set(originalKey, matched);
      }
    }
    return merged;
  };
  
  // 🚀 超精简 prompt - 一次AI调用获取所有关键信息
  const prompt = `${city || 'city'}${country ? `,${country}` : ''}:${names}
JSON:{"places":[{"name":"","address":"","website":"","latitude":0,"longitude":0,"rating":0,"ratingCount":0}]}`;

  // Helper function to save places to DB (with or without enriched data)
  // 图片搜索改为批量一次性调用，不阻塞主流程
  const savePlacesToDB = async (placesToPersist: PlaceResult[], enrichedMap: Map<string, {
    name: string;
    address: string;
    website: string;
    latitude: number;
    longitude: number;
    rating: number;
    ratingCount: number;
    phoneNumber: string;
    openingHours: string;
  }> | null): Promise<PlaceResult[]> => {
    const categoryValue = CATEGORY_MAPPING[category]?.[0] || category || 'other';
    const persistedPlaces: PlaceResult[] = [];
    
    // 图片搜索已关闭 - 不再通过 AI 搜索图片
    const imageMap = new Map<string, string | null>();
    
    for (const place of placesToPersist) {
      const key = place.name.toLowerCase().trim();
      const info = enrichedMap?.get(key) || null;
      
      // Merge information (enriched data takes priority)
      // 🔧 落库时只保存英文名称
      const rawName = info?.name || place.name;
      const finalName = extractEnglishName(rawName);
      const finalAddress = info?.address || place.address || '';
      const finalWebsite = info?.website || place.website || '';
      let finalLat: number = (info?.latitude && info.latitude !== 0) ? info.latitude : (place.latitude || 0);
      let finalLng: number = (info?.longitude && info.longitude !== 0) ? info.longitude : (place.longitude || 0);
      const finalRating: number = (info?.rating && info.rating > 0) ? info.rating : (place.rating || 0);
      const finalRatingCount: number = (info?.ratingCount && info.ratingCount > 0) ? info.ratingCount : (place.ratingCount || 0);
      // 从批量搜索结果中获取图片
      let finalImage = place.coverImage || imageMap.get(finalName) || '';
      const finalPhone = info?.phoneNumber || place.phoneNumber || '';
      const finalHours = info?.openingHours || place.openingHours || '';
      
      // 如果坐标缺失或无效，通过 Mapbox 地理编码获取（使用地址）
      if ((finalLat === 0 || finalLng === 0) && finalAddress) {
        logger.info(`[SearchV2] Geocoding "${finalName}" using address: "${finalAddress}"`);
        try {
          const geocodeResult = await geocodeService.forwardGeocode(finalAddress, {
            country: country || place.country,
          });
          if (geocodeResult) {
            finalLat = geocodeResult.lat;
            finalLng = geocodeResult.lon;
            logger.info(`[SearchV2] Geocoded "${finalName}" -> (${finalLat}, ${finalLng})`);
          } else {
            logger.warn(`[SearchV2] Geocoding failed for "${finalName}", no result found`);
          }
        } catch (geoError) {
          logger.warn(`[SearchV2] Geocoding error for "${finalName}": ${geoError}`);
        }
      }
      
      try {
        // Check if exists (by name + city)
        const existing = await prisma.place.findFirst({
          where: {
            OR: [
              { name: { equals: finalName, mode: 'insensitive' } },
              { name: { equals: place.name, mode: 'insensitive' } },
            ],
            city: { equals: city || place.city, mode: 'insensitive' },
          },
        });
        
        if (existing) {
          // Update if has new data
          const updateData: Record<string, unknown> = {};
          if (finalAddress && !existing.address) updateData.address = finalAddress;
          if (finalWebsite && !existing.website) updateData.website = finalWebsite;
          if (finalLat && finalLat !== 0 && (!existing.latitude || existing.latitude === 0)) updateData.latitude = finalLat;
          if (finalLng && finalLng !== 0 && (!existing.longitude || existing.longitude === 0)) updateData.longitude = finalLng;
          // 评分更新条件：有新评分 AND 现有评分为空或为0
          if (finalRating && finalRating > 0 && (existing.rating === null || existing.rating === undefined || existing.rating === 0)) {
            updateData.rating = finalRating;
            logger.info(`[SearchV2] Will update rating for "${existing.name}": ${existing.rating} -> ${finalRating}`);
          }
          if (finalRatingCount && finalRatingCount > 0 && (existing.ratingCount === null || existing.ratingCount === undefined || existing.ratingCount === 0)) {
            updateData.ratingCount = finalRatingCount;
            logger.info(`[SearchV2] Will update ratingCount for "${existing.name}": ${existing.ratingCount} -> ${finalRatingCount}`);
          }
          if (finalImage && !existing.coverImage) updateData.coverImage = finalImage;
          if (finalPhone && !existing.phoneNumber) updateData.phoneNumber = finalPhone;
          if (finalHours && !existing.openingHours) updateData.openingHours = finalHours;
          if (existing.source === 'ai_generated' || !existing.source) {
            updateData.source = 'ai_generated_web';
          }
          
          if (Object.keys(updateData).length > 0) {
            await prisma.place.update({
              where: { id: existing.id },
              data: updateData,
            });
            logger.info(`[SearchV2] Updated existing place "${existing.name}" (id: ${existing.id}) with: ${JSON.stringify(updateData)}`);
          }
          
          // Use real DB ID
          persistedPlaces.push({
            ...place,
            id: existing.id,
            name: existing.name,
            city: existing.city || city || place.city || '',
            country: existing.country || country || place.country || '',
            address: finalAddress || existing.address || undefined,
            website: finalWebsite || existing.website || undefined,
            latitude: existing.latitude || finalLat,
            longitude: existing.longitude || finalLng,
            rating: finalRating || existing.rating,
            ratingCount: finalRatingCount || existing.ratingCount,
            coverImage: finalImage || existing.coverImage || '',
            phoneNumber: finalPhone || existing.phoneNumber || undefined,
            openingHours: finalHours || existing.openingHours || undefined,
            source: 'cache', // 已持久化到数据库
            isVerified: existing.isVerified || false,
          });
        } else {
          // Create new record
          const newPlace = await prisma.place.create({
            data: {
              name: finalName,
              city: city || place.city,
              country: country || place.country,
              latitude: finalLat,
              longitude: finalLng,
              address: finalAddress || null,
              website: finalWebsite || null,
              phoneNumber: finalPhone || null,
              openingHours: finalHours || null,
              rating: finalRating !== 0 ? finalRating : null,
              ratingCount: finalRatingCount !== 0 ? finalRatingCount : null,
              coverImage: finalImage || '',
              categoryEn: categoryValue,
              aiDescription: place.summary,
              aiTags: place.tags,
              source: 'ai_generated_web',
              isVerified: false,
            },
          });
          
          logger.info(`[SearchV2] Created new place "${newPlace.name}" (id: ${newPlace.id})`);
          
          persistedPlaces.push({
            ...place,
            id: newPlace.id,
            name: newPlace.name,
            city: city || place.city || '',
            country: country || place.country || '',
            address: finalAddress || undefined,
            website: finalWebsite || undefined,
            latitude: finalLat,
            longitude: finalLng,
            rating: finalRating,
            ratingCount: finalRatingCount,
            coverImage: finalImage,
            phoneNumber: finalPhone || undefined,
            openingHours: finalHours || undefined,
            source: 'cache', // 已持久化到数据库
            isVerified: false,
          });
        }
      } catch (dbError) {
        logger.warn(`[SearchV2] Failed to persist place "${place.name}": ${dbError}`);
        persistedPlaces.push(place);
      }
    }
    
    logger.info(`[SearchV2] Persisted ${persistedPlaces.length} places to database`);
    return persistedPlaces;
  };

  // 🚀 优化策略：先快速保存获取 ID，然后后台异步联网搜索更新详细信息
  if (skipWebSearch) {
    // 第一阶段：快速保存到数据库（不做联网搜索）
    logger.info(`[SearchV2] Fast save: saving ${placesToEnrich.length} places directly...`);
    const enrichedPlaces = await savePlacesToDB(placesToEnrich, null);
    const mergedMap = buildMergedMap(enrichedPlaces);
    const result = places.map(p => preMatchedWeb.get(p.name.toLowerCase().trim()) || mergedMap.get(p.name.toLowerCase().trim()) || p);
    
    // 第二阶段：后台异步联网搜索更新详细信息（不阻塞前端）
    const placesNeedingEnrichment = enrichedPlaces.filter(p => 
      !p.rating || p.rating === 0 || !p.address || !p.latitude || p.latitude === 0
    );
    if (placesNeedingEnrichment.length > 0) {
      logger.info(`[SearchV2] Scheduling background web search for ${placesNeedingEnrichment.length} places...`);
      // 异步执行联网搜索更新
      (async () => {
        try {
          const response = await generateTextWithWebSearch(prompt, 45000);
          if (response) {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              const enrichedData = Array.isArray(parsed.places) ? parsed.places : [];
              logger.info(`[SearchV2] Background enrichment: AI returned ${enrichedData.length} places`);
              
              // 更新数据库中的地点信息
              for (const item of enrichedData) {
                if (!item.name) continue;
                const itemNameLower = item.name.toLowerCase().trim();
                // 找到对应的已保存地点
                const savedPlace = enrichedPlaces.find(p => {
                  const pNameLower = p.name.toLowerCase().trim();
                  return pNameLower === itemNameLower || 
                         itemNameLower.includes(pNameLower) || 
                         pNameLower.includes(itemNameLower);
                });
                if (savedPlace && savedPlace.id && !savedPlace.id.startsWith('temp_')) {
                  try {
                    const updateData: Record<string, unknown> = {};
                    if (item.address && !savedPlace.address) updateData.address = item.address;
                    if (item.website && !savedPlace.website) updateData.website = item.website;
                    if (item.latitude && item.latitude !== 0 && (!savedPlace.latitude || savedPlace.latitude === 0)) {
                      updateData.latitude = item.latitude;
                    }
                    if (item.longitude && item.longitude !== 0 && (!savedPlace.longitude || savedPlace.longitude === 0)) {
                      updateData.longitude = item.longitude;
                    }
                    if (item.rating && item.rating > 0 && (!savedPlace.rating || savedPlace.rating === 0)) {
                      updateData.rating = item.rating;
                    }
                    if (item.ratingCount && item.ratingCount > 0 && (!savedPlace.ratingCount || savedPlace.ratingCount === 0)) {
                      updateData.ratingCount = item.ratingCount;
                    }
                    if (item.phoneNumber && !savedPlace.phoneNumber) updateData.phoneNumber = item.phoneNumber;
                    if (item.openingHours && !savedPlace.openingHours) updateData.openingHours = item.openingHours;
                    
                    if (Object.keys(updateData).length > 0) {
                      await prisma.place.update({
                        where: { id: savedPlace.id },
                        data: updateData,
                      });
                      logger.info(`[SearchV2] Background updated "${savedPlace.name}" with: ${Object.keys(updateData).join(', ')}`);
                    }
                  } catch (updateError) {
                    logger.warn(`[SearchV2] Background update failed for "${savedPlace.name}": ${updateError}`);
                  }
                }
              }
              logger.info(`[SearchV2] Background enrichment completed`);
            }
          }
        } catch (bgError) {
          logger.warn(`[SearchV2] Background web search failed: ${bgError}`);
        }
      })();
    }
    
    return result;
  }

  try {
    // 🚀 优化：使用较短超时时间（15秒），只搜索有限数量的地点
    logger.info(`[SearchV2] Using web search to enrich ${limitedPlacesToEnrich.length} places (max ${MAX_PLACES_TO_ENRICH})...`);
    const response = await generateTextWithWebSearch(prompt, 15000);
    
    // 先保存被跳过的地点（不做enrichment）
    let skippedPersistedPlaces: PlaceResult[] = [];
    if (skippedPlaces.length > 0) {
      skippedPersistedPlaces = await savePlacesToDB(skippedPlaces, null);
    }
    
    if (!response) {
      logger.warn('[SearchV2] No response from AI web search for place enrichment, saving without enrichment');
      const enrichedPlaces = await savePlacesToDB(limitedPlacesToEnrich, null);
      const allPersistedPlaces = [...enrichedPlaces, ...skippedPersistedPlaces];
      const mergedMap = buildMergedMap(allPersistedPlaces);
      return places.map(p => preMatchedWeb.get(p.name.toLowerCase().trim()) || mergedMap.get(p.name.toLowerCase().trim()) || p);
    }
    
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn('[SearchV2] No JSON found in AI response for place enrichment, saving without enrichment');
      const enrichedPlaces = await savePlacesToDB(limitedPlacesToEnrich, null);
      const allPersistedPlaces = [...enrichedPlaces, ...skippedPersistedPlaces];
      const mergedMap = buildMergedMap(allPersistedPlaces);
      return places.map(p => preMatchedWeb.get(p.name.toLowerCase().trim()) || mergedMap.get(p.name.toLowerCase().trim()) || p);
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    const enrichedData = Array.isArray(parsed.places) ? parsed.places : [];
    
    logger.info(`[SearchV2] Enrichment AI returned ${enrichedData.length} places`);
    if (enrichedData.length > 0) {
      logger.info(`[SearchV2] Enriched names: ${enrichedData.map((p: { name?: string }) => p.name).join(', ')}`);
    }
    
    // 创建名称到详细信息的映射（不再包含 imageUrl）
    const infoMap = new Map<string, {
      name: string;
      address: string;
      website: string;
      latitude: number;
      longitude: number;
      rating: number;
      ratingCount: number;
      phoneNumber: string;
      openingHours: string;
    }>();
    
    // 辅助函数：提取核心名称（移除城市、分店后缀等）
    const getCoreName = (name: string): string => {
      return name.toLowerCase().trim()
        .replace(/\s*(paris|tokyo|shibuya|shinjuku|ginza|bastille|république|opera|saint|st\.?)[\s\-]*/gi, '')
        .replace(/\s*(店|分店|branch|store|restaurant|ramen)$/gi, '')
        .trim();
    };
    
    for (const item of enrichedData) {
      if (item.name) {
        const itemNameLower = item.name.toLowerCase().trim();
        const itemCoreName = getCoreName(item.name);
        
        // 更宽松的匹配逻辑 - 只在 limitedPlacesToEnrich 中查找
        const originalPlace = limitedPlacesToEnrich.find(p => {
          const pNameLower = p.name.toLowerCase().trim();
          const pCoreName = getCoreName(p.name);
          
          // 1. 完全匹配
          if (pNameLower === itemNameLower) return true;
          // 2. AI 返回的名称包含原始名称
          if (itemNameLower.includes(pNameLower)) return true;
          // 3. 原始名称包含 AI 返回的名称
          if (pNameLower.includes(itemNameLower)) return true;
          // 4. 核心名称匹配
          if (pCoreName && itemCoreName && (pCoreName.includes(itemCoreName) || itemCoreName.includes(pCoreName))) return true;
          // 5. 第一个单词匹配（适用于连锁店如 Ichiran）
          const pFirstWord = pNameLower.split(/\s+/)[0];
          const itemFirstWord = itemNameLower.split(/\s+/)[0];
          if (pFirstWord.length > 3 && pFirstWord === itemFirstWord) return true;
          
          return false;
        });
        
        const keyName = originalPlace?.name || item.name;
        logger.info(`[SearchV2] Enriched "${item.name}" -> matched to "${keyName}" (rating: ${item.rating})`);
        
        infoMap.set(keyName.toLowerCase().trim(), {
          name: item.name || keyName,
          address: item.address || '',
          website: item.website || '',
          latitude: typeof item.latitude === 'number' ? item.latitude : 0,
          longitude: typeof item.longitude === 'number' ? item.longitude : 0,
          rating: typeof item.rating === 'number' ? item.rating : 0,
          ratingCount: typeof item.ratingCount === 'number' ? item.ratingCount : 0,
          phoneNumber: item.phoneNumber || '',
          openingHours: item.openingHours || '',
        });
      }
    }
    
    logger.info(`[SearchV2] Got enriched data for ${infoMap.size}/${limitedPlacesToEnrich.length} places`);
    
    // Use helper function to save to DB
    const enrichedPlaces = await savePlacesToDB(limitedPlacesToEnrich, infoMap);
    // 合并所有持久化的地点
    const allPersistedPlaces = [...enrichedPlaces, ...skippedPersistedPlaces];
    const mergedMap = buildMergedMap(allPersistedPlaces);
    return places.map(p => preMatchedWeb.get(p.name.toLowerCase().trim()) || mergedMap.get(p.name.toLowerCase().trim()) || p);
    
  } catch (error) {
    logger.warn(`[SearchV2] Failed to enrich places: ${error}, saving without enrichment`);
    // Even if enrichment fails, still save to DB
    try {
      const enrichedPlaces = await savePlacesToDB(limitedPlacesToEnrich, null);
      // 保存被跳过的地点
      let skippedPersistedPlaces: PlaceResult[] = [];
      if (skippedPlaces.length > 0) {
        skippedPersistedPlaces = await savePlacesToDB(skippedPlaces, null);
      }
      const allPersistedPlaces = [...enrichedPlaces, ...skippedPersistedPlaces];
      const mergedMap = buildMergedMap(allPersistedPlaces);
      return places.map(p => preMatchedWeb.get(p.name.toLowerCase().trim()) || mergedMap.get(p.name.toLowerCase().trim()) || p);
    } catch (dbError) {
      logger.warn(`[SearchV2] Failed to save places to DB: ${dbError}`);
      return places.map(p => preMatchedWeb.get(p.name.toLowerCase().trim()) || p);
    }
  }
}

async function extractMentionedPlacesFromText(
  text: string,
  language: 'en' | 'zh',
  parsedQuery: ParsedQuery,
): Promise<MentionedPlaceLite[]> {
  const input = (text || '').trim();
  if (!input) return [];

  const languageText = language === 'zh' ? 'Chinese' : 'English';
  const cityHint = parsedQuery.city || '';
  const countryHint = parsedQuery.country || '';

  const prompt = `Extract the specific place names mentioned in the following travel text.

Text (${languageText}):
"""
${input}
"""

Context hints:
- City: ${cityHint || 'unknown'}
- Country: ${countryHint || 'unknown'}

Requirements:
- Return up to 10 places
- ONLY extract actual PLACE NAMES (store names, restaurant names, museum names, etc.)
- DO NOT extract introductory/descriptive sentences as place names. Examples of NOT valid:
  - "在伦敦，有许多优秀的毛线店" (this is intro, NOT a place)
  - "以下是几家推荐的店铺" (this is intro, NOT a place)
  - "适合羊毛编织爱好者" (this is description, NOT a place)
- IMPORTANT: Always return place names in ENGLISH (translate if necessary)
  - e.g., "卢浮宫" → "Louvre Museum"
  - e.g., "埃菲尔铁塔" → "Eiffel Tower"
  - e.g., "杜乐丽花园" → "Tuileries Garden"
- City names should also be in English (e.g., "巴黎" → "Paris")
- Return JSON only, no extra text

Return JSON:
{
  "places": [
    { "name": "Place Name in English", "city": "City in English" }
  ]
}`;

  // 过滤介绍性文字的辅助函数
  const isIntroText = (name: string): boolean => {
    const introPatterns = [
      /^在.{1,30}，有/,
      /^这是/,
      /^以下是/,
      /^如果你/,
      /^对于/,
      /有许多/,
      /适合.{1,20}者/,
      /推荐的.{1,10}店/,
      /以下是几家/,
      /^Here are/i,
      /^In .+, there are/i,
      /^If you/i,
      /^These are/i,
      /^Following are/i,
    ];
    return introPatterns.some(p => p.test(name));
  };

  try {
    const response = await generateJsonTextWithFallback(prompt, 8000); // 8秒超时以加快响应
    if (!response) return [];
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);
    const items = Array.isArray(parsed.places) ? parsed.places : [];
    const results: MentionedPlaceLite[] = [];
    for (const item of items) {
      const name = typeof item?.name === 'string' ? item.name.trim() : '';
      if (!name) continue;
      // 过滤介绍性文字
      if (isIntroText(name)) {
        logger.info(`[SearchV2] Skipping intro text as place: "${name}"`);
        continue;
      }
      // 过滤过长的名称（真正的地点名称通常不超过60个字符）
      if (name.length > 60) {
        logger.info(`[SearchV2] Skipping too long name as place: "${name.substring(0, 50)}..."`);
        continue;
      }
      const city = typeof item?.city === 'string' ? item.city.trim() : undefined;
      const country = typeof item?.country === 'string' ? item.country.trim() : undefined;
      results.push({ name, city, country });
    }
    return results.slice(0, 10);
  } catch (error) {
    logger.warn(`[SearchV2] Failed to extract mentioned places: ${error}`);
    return [];
  }
}

function buildPlaceImagesFromDb(dbPlace: any): string[] {
  let images: string[] = [];
  if (dbPlace.images) {
    if (Array.isArray(dbPlace.images)) {
      images = dbPlace.images.filter((img: string) => img && img.length > 0);
    } else if (typeof dbPlace.images === 'string') {
      try {
        const parsed = JSON.parse(dbPlace.images);
        if (Array.isArray(parsed)) {
          images = parsed.filter((img: string) => img && img.length > 0);
        }
      } catch (_) {
        // ignore
      }
    }
  }
  if (images.length === 0 && dbPlace.coverImage) {
    images = [dbPlace.coverImage];
  }
  return images;
}

async function matchMentionedPlacesFromDB(
  mentioned: MentionedPlaceLite[],
  parsedQuery: ParsedQuery,
  language: 'en' | 'zh',
  requiredCategory?: string,
  requireImage: boolean = true, // 是否要求有图片，text-only 模式可设为 false
): Promise<PlaceResult[]> {
  const results: PlaceResult[] = [];
  const seen = new Set<string>();

  // Build category keywords for filtering if provided
  const categoryKeywords = requiredCategory ? buildCategoryKeywords(requiredCategory) : null;

  for (const place of mentioned) {
    const rawName = (place.name || '').trim();
    if (!rawName) continue;
    const nameKey = rawName.toLowerCase();
    if (seen.has(nameKey)) continue;

    let searchTerms = [rawName];
    if (containsCjk(rawName)) {
      const translated = await translateQueryToEnglish(rawName);
      if (translated.translatedQuery && translated.translatedQuery !== rawName) {
        searchTerms.push(translated.translatedQuery);
      }
    }

    let matched: any = null;
    let bestScore = 0;

    for (const term of searchTerms) {
      const city = normalizeCityForMatching(place.city, parsedQuery);
      const country = normalizeCountryForMatching(place.country, parsedQuery);
      
      logger.info(`[matchMentioned] Searching for "${term}" in city="${city}", country="${country}" (requireImage=${requireImage})`);

      // 策略1：先尝试不带位置过滤的精确名字匹配
      // 如果名字完全匹配且只有一个结果，直接使用（避免城市格式不一致导致的匹配失败）
      const exactNameOnlyConditions: any[] = [
        { name: { equals: term, mode: 'insensitive' as const } },
      ];
      // 只在需要图片时添加图片条件
      if (requireImage) {
        exactNameOnlyConditions.unshift({ coverImage: { not: null } });
        exactNameOnlyConditions.unshift({ coverImage: { not: '' } });
      }
      
      const exactNameMatches = await prisma.place.findMany({
        where: { AND: exactNameOnlyConditions },
        take: 5,
      });
      
      // 如果只有一个精确名字匹配，直接使用
      if (exactNameMatches.length === 1) {
        logger.info(`[matchMentioned] Found unique exact name match for "${term}": ${exactNameMatches[0].name} (city: ${exactNameMatches[0].city})`);
        matched = exactNameMatches[0];
        bestScore = 1;
        break;
      }
      
      // 如果有多个同名地点，尝试用城市过滤
      if (exactNameMatches.length > 1) {
        logger.info(`[matchMentioned] Found ${exactNameMatches.length} places with name "${term}", filtering by city...`);
        // 尝试找城市匹配的那个
        const cityMatched = exactNameMatches.find(p => {
          if (!city) return false;
          const pCity = (p.city || '').toLowerCase().trim();
          const targetCity = city.toLowerCase().trim();
          return pCity === targetCity || pCity.includes(targetCity) || targetCity.includes(pCity);
        });
        if (cityMatched) {
          logger.info(`[matchMentioned] Found city-matched: ${cityMatched.name} (city: ${cityMatched.city})`);
          matched = cityMatched;
          bestScore = 1;
          break;
        }
        // 如果没有城市匹配，使用第一个（有图片的）
        matched = exactNameMatches[0];
        bestScore = 0.95;
        logger.info(`[matchMentioned] Using first match: ${matched.name} (city: ${matched.city})`);
        break;
      }

      // 策略2：如果精确名字匹配失败，尝试带位置过滤的 contains 匹配
      const exactConditions: any[] = [
        { name: { equals: term, mode: 'insensitive' as const } },
      ];
      if (requireImage) {
        exactConditions.unshift({ coverImage: { not: null } });
        exactConditions.unshift({ coverImage: { not: '' } });
      }
      if (city) {
        exactConditions.unshift(buildCityCondition(city));
      }
      if (country) {
        exactConditions.unshift(buildCountryCondition(country));
      }

      const exactMatch = await prisma.place.findFirst({
        where: { AND: exactConditions },
      });
      
      logger.info(`[matchMentioned] Exact match with location for "${term}": ${exactMatch ? exactMatch.name + ' (id: ' + exactMatch.id + ', city: ' + exactMatch.city + ')' : 'NOT FOUND'}`);
      
      if (exactMatch) {
        matched = exactMatch;
        bestScore = 1;
        break;
      }

      const conditions: any[] = [
        { name: { contains: term, mode: 'insensitive' as const } },
      ];
      if (requireImage) {
        conditions.unshift({ coverImage: { not: null } });
        conditions.unshift({ coverImage: { not: '' } });
      }

      if (city) {
        conditions.unshift(buildCityCondition(city));
      }
      if (country) {
        conditions.unshift(buildCountryCondition(country));
      }

      const candidates = await prisma.place.findMany({
        where: { AND: conditions },
        take: 20,
      });

      for (const candidate of candidates) {
        const score = calculateNameSimilarity(rawName, candidate.name || '');
        if (score > bestScore) {
          bestScore = score;
          matched = candidate;
        }
      }

      if (matched && bestScore >= 0.78) break;
    }

    if (!matched || bestScore < 0.78) continue;

    // Filter by category relevance if required
    if (categoryKeywords && categoryKeywords.length > 0) {
      const placeCategory = (matched.categoryEn || '').toLowerCase();
      const placeName = (matched.name || '').toLowerCase();
      const placeAiTags = Array.isArray(matched.aiTags) 
        ? matched.aiTags.map((t: any) => typeof t === 'string' ? t.toLowerCase() : (t?.tag || '').toLowerCase())
        : [];
      
      const isRelevant = categoryKeywords.some(keyword => 
        placeCategory.includes(keyword) || 
        placeName.includes(keyword) ||
        placeAiTags.some((tag: string) => tag.includes(keyword))
      );
      
      if (!isRelevant) {
        logger.info(`[SearchV2] Filtering out irrelevant place: ${matched.name} (category: ${placeCategory})`);
        continue;
      }
    }

    const summaryRaw = matched.aiDescription || matched.aiSummary || matched.summary || '';
    let summary = summaryRaw || '';
    if (language === 'zh' && summary && !containsCjk(summary)) {
      summary = await translateTextToChinese(summary);
    }

    const hasRating = matched.rating !== null && matched.rating > 0;
    const placeResult: PlaceResult = {
      id: matched.id,
      name: matched.name,
      summary: truncateToMaxChars(summary, 120),
      coverImage: matched.coverImage || '',
      images: buildPlaceImagesFromDb(matched),
      latitude: matched.latitude,
      longitude: matched.longitude,
      city: matched.city || parsedQuery.city,
      country: matched.country || parsedQuery.country || '',
      rating: matched.rating,
      ratingCount: matched.ratingCount,
      tags: buildDisplayTags(matched.categoryEn, matched.aiTags, 'en', matched.tags as Record<string, string[]> | null),
      isVerified: hasRating || matched.isVerified || false,
      source: 'cache',
      address: matched.address || undefined,
      phoneNumber: matched.phoneNumber || undefined,
      website: matched.website || undefined,
      openingHours: matched.openingHours || undefined,
      customFields: matched.customFields || undefined,
    };

    results.push(placeResult);
    seen.add(nameKey);
  }

  return results;
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
// 需要过滤的旧标签（不再使用的通用标签）
const FILTERED_TAGS = new Set(['place', 'landmark']);

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
        // 过滤掉旧的通用标签（如 "place", "landmark"）
        if (!seen.has(key) && !FILTERED_TAGS.has(key)) {
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
      // 过滤掉旧的通用标签
      if (!seen.has(key) && !FILTERED_TAGS.has(key)) {
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
    // Japan
    'tokyo': ['Tokyo', '東京', '东京'],
    '東京': ['Tokyo', '東京', '东京'],
    '东京': ['Tokyo', '東京', '东京'],
    'osaka': ['Osaka', '大阪'],
    '大阪': ['Osaka', '大阪'],
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
 * Build category keywords from a search query for filtering places
 * Returns normalized keywords that can be used to match against place categories
 */
function buildCategoryKeywords(query: string): string[] {
  const normalized = query.toLowerCase().trim();
  const keywords: string[] = [];
  
  // Food & Dining
  if (/ramen|拉面|ラーメン|noodle|面|麵/.test(normalized)) {
    keywords.push('ramen', 'noodle', 'restaurant', 'japanese', 'food');
  }
  if (/cafe|咖啡|coffee|カフェ/.test(normalized)) {
    keywords.push('cafe', 'coffee', 'bakery');
  }
  if (/restaurant|餐厅|餐馆|饭店/.test(normalized)) {
    keywords.push('restaurant', 'food', 'dining');
  }
  if (/bar|酒吧|pub/.test(normalized)) {
    keywords.push('bar', 'pub', 'nightlife');
  }
  if (/bakery|面包|甜点|dessert/.test(normalized)) {
    keywords.push('bakery', 'dessert', 'cafe');
  }
  
  // Shopping
  if (/shop|store|商店|购物/.test(normalized)) {
    keywords.push('shop', 'store', 'shopping', 'retail');
  }
  
  // Attractions
  if (/museum|博物馆|美术馆/.test(normalized)) {
    keywords.push('museum', 'gallery', 'art');
  }
  if (/park|公园|garden/.test(normalized)) {
    keywords.push('park', 'garden', 'nature');
  }
  if (/temple|寺|神社|shrine/.test(normalized)) {
    keywords.push('temple', 'shrine', 'religious');
  }
  if (/church|教堂/.test(normalized)) {
    keywords.push('church', 'cathedral', 'religious');
  }
  if (/beach|海滩/.test(normalized)) {
    keywords.push('beach', 'coast', 'seaside');
  }
  
  // Accommodation
  if (/hotel|酒店|宾馆/.test(normalized)) {
    keywords.push('hotel', 'lodging', 'accommodation');
  }
  
  return [...new Set(keywords)]; // Remove duplicates
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

function buildCountryCondition(country: string): any {
  return { country: { equals: country.trim(), mode: 'insensitive' as const } };
}

/**
 * 构建地区过滤条件
 * 根据地区名称（如 Europe）返回该地区所有国家的 OR 条件
 */
function buildRegionCondition(region: string): any | null {
  const countries = REGION_COUNTRIES[region];
  if (!countries || countries.length === 0) {
    return null;
  }
  return {
    OR: countries.map(c => ({ country: { equals: c, mode: 'insensitive' as const } }))
  };
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

// Region/Continent keywords for filtering
const REGION_KEYWORD_MAP: Record<string, string> = {
  // English
  'europe': 'Europe',
  'european': 'Europe',
  'asia': 'Asia',
  'asian': 'Asia',
  'north america': 'North America',
  'south america': 'South America',
  'africa': 'Africa',
  'oceania': 'Oceania',
  'middle east': 'Middle East',
  'southeast asia': 'Southeast Asia',
  'east asia': 'East Asia',
  // Chinese
  '欧洲': 'Europe',
  '亚洲': 'Asia',
  '北美': 'North America',
  '南美': 'South America',
  '非洲': 'Africa',
  '大洋洲': 'Oceania',
  '中东': 'Middle East',
  '东南亚': 'Southeast Asia',
  '东亚': 'East Asia',
};

// Countries that belong to each region (for database filtering)
const REGION_COUNTRIES: Record<string, string[]> = {
  'Europe': ['France', 'Germany', 'Italy', 'Spain', 'United Kingdom', 'Netherlands', 'Belgium', 'Austria', 'Switzerland', 'Portugal', 'Greece', 'Czech Republic', 'Poland', 'Sweden', 'Norway', 'Denmark', 'Finland', 'Ireland', 'Hungary', 'Romania', 'Croatia', 'Slovenia', 'Slovakia', 'Bulgaria', 'Serbia', 'Ukraine', 'Russia', 'Turkey', 'Iceland', 'Luxembourg', 'Monaco', 'Malta', 'Cyprus', 'Estonia', 'Latvia', 'Lithuania'],
  'Asia': ['Japan', 'China', 'South Korea', 'Taiwan', 'Hong Kong', 'Singapore', 'Thailand', 'Vietnam', 'Malaysia', 'Indonesia', 'Philippines', 'India', 'Nepal', 'Sri Lanka', 'Myanmar', 'Cambodia', 'Laos', 'Mongolia', 'Bangladesh', 'Pakistan'],
  'North America': ['United States', 'Canada', 'Mexico'],
  'South America': ['Brazil', 'Argentina', 'Chile', 'Peru', 'Colombia', 'Ecuador', 'Bolivia', 'Venezuela', 'Uruguay', 'Paraguay'],
  'Africa': ['Egypt', 'Morocco', 'South Africa', 'Kenya', 'Tanzania', 'Ethiopia', 'Nigeria', 'Ghana', 'Tunisia', 'Algeria'],
  'Oceania': ['Australia', 'New Zealand', 'Fiji', 'Papua New Guinea'],
  'Middle East': ['United Arab Emirates', 'Saudi Arabia', 'Israel', 'Jordan', 'Lebanon', 'Qatar', 'Kuwait', 'Bahrain', 'Oman', 'Iran', 'Iraq'],
  'Southeast Asia': ['Thailand', 'Vietnam', 'Singapore', 'Malaysia', 'Indonesia', 'Philippines', 'Myanmar', 'Cambodia', 'Laos', 'Brunei'],
  'East Asia': ['Japan', 'China', 'South Korea', 'Taiwan', 'Hong Kong', 'Mongolia'],
};

function parseQuery(query: string, options: { allowChinese?: boolean } = {}): ParsedQuery {
  const result: ParsedQuery = {
    count: CONFIG.DEFAULT_COUNT,
    category: '',
    city: '',
    country: '',
    region: '',
    originalQuery: query,
    explicitCount: false,
  };
  const allowChinese = options.allowChinese ?? true;

  // Count parsing:
  // - English: "8 restaurants", "top 8 cafes"
  // - Chinese: "8个", "8家", "8間", "8处/8處"
  // Keep it conservative to avoid accidentally treating years/addresses as counts.
  const countPatterns: RegExp[] = [
    /(?:^|\s)(\d{1,2})\s+(?:(?:best|top)\s+)?(?:places?|spots?|restaurants?|cafes?|bakery|bakeries|museums?|bars?|hotels?|shops?|galleries?|temples?|churches?|parks?|beaches?|clubs?|pubs?|bistros?|diners?)\b/i,
    /(\d{1,2})\s*(?:个|家|間|处|處)/,
    /(?:^|\s)(\d{1,2})\s+(?:best|top)\b/i,
  ];
  for (const pattern of countPatterns) {
    const match = query.match(pattern);
    if (match && match[1]) {
      result.count = Math.min(Math.max(parseInt(match[1], 10), 1), 20);
      result.explicitCount = true;
      break;
    }
  }
  
  // 分类匹配（不区分大小写）
  // 优先匹配更长的关键词（如 "design museum" 优先于 "museum"）
  let categoryKeywords = Object.keys(CATEGORY_MAPPING).sort((a, b) => b.length - a.length);
  if (!allowChinese) {
    categoryKeywords = categoryKeywords.filter((keyword) => !isCjkString(keyword));
  }
  for (const keyword of categoryKeywords) {
    if (query.toLowerCase().includes(keyword)) {
      result.category = keyword;
      break;
    }
  }

  // 国家匹配
  const lowerQuery = query.toLowerCase();
  for (const [keyword, countryName] of Object.entries(COUNTRY_KEYWORD_MAP)) {
    if (!allowChinese && isCjkString(keyword)) continue;
    const match = isCjkString(keyword)
        ? query.includes(keyword)
        : lowerQuery.includes(keyword);
    if (match) {
      result.country = countryName;
      break;
    }
  }

  // 🌍 地区/大洲匹配（如 Europe, Asia 等）
  // 注意：不要把地区误认为是城市
  for (const [keyword, regionName] of Object.entries(REGION_KEYWORD_MAP)) {
    if (!allowChinese && isCjkString(keyword)) continue;
    const match = isCjkString(keyword)
        ? query.includes(keyword)
        : lowerQuery.includes(keyword);
    if (match) {
      result.region = regionName;
      // 如果之前把 "Europe" 误解为城市，需要清除
      if (result.city.toLowerCase() === keyword.toLowerCase()) {
        result.city = '';
        logger.info(`[SearchV2] Cleared city="${keyword}" as it's a region: ${regionName}`);
      }
      break;
    }
  }

  // 中文城市关键词匹配（优先于英文模式）
  if (!result.city && allowChinese) {
    const cityKeywordMap: Record<string, string> = {
      '伦敦': 'London',
      '巴黎': 'Paris',
      '罗马': 'Rome',
      '巴塞罗那': 'Barcelona',
      '马德里': 'Madrid',
      '柏林': 'Berlin',
      '阿姆斯特丹': 'Amsterdam',
      '维也纳': 'Vienna',
      '布拉格': 'Prague',
      '米兰': 'Milan',
      '佛罗伦萨': 'Florence',
      '威尼斯': 'Venice',
      '东京': 'Tokyo',
      '大阪': 'Osaka',
      '京都': 'Kyoto',
      '首尔': 'Seoul',
      '曼谷': 'Bangkok',
      '新加坡': 'Singapore',
      '悉尼': 'Sydney',
      '墨尔本': 'Melbourne',
      '纽约': 'New York',
      '洛杉矶': 'Los Angeles',
      '旧金山': 'San Francisco',
      '芝加哥': 'Chicago',
      '哥本哈根': 'Copenhagen',
    };
    for (const [keyword, cityName] of Object.entries(cityKeywordMap)) {
      if (query.includes(keyword)) {
        result.city = cityName;
        break;
      }
    }
  }
  
  // 城市匹配 - 使用更严格的模式，避免误匹配普通单词
  const cityPatterns = [
    /(?:in|at|around|near)\s+([A-Z][a-zA-Z\s]+?)(?:\s|$|,)/i,
    /([A-Z][a-zA-Z]+)\s+(?:cafes?|restaurants?|places?|spots?|museums?|temples?|shrines?|bars?)/i,
  ];
  
  // 获取所有地区关键词用于排除
  const regionKeywordsLower = Object.keys(REGION_KEYWORD_MAP).map(k => k.toLowerCase());
  
  for (const pattern of cityPatterns) {
    const match = query.match(pattern);
    if (match && match[1]) {
      const potentialCity = match[1].trim();
      // 排除常见的非城市词
      const nonCityWords = ['help', 'find', 'show', 'recommend', 'interesting', 'best', 'good', 'nice', 'great', 'some', 'any', 'the', 'me', 'please', 'design'];
      const potentialCityLower = potentialCity.toLowerCase();
      const categoryKeywordsLower = Object.keys(CATEGORY_MAPPING).map(k => k.toLowerCase());
      // 🌍 排除地区/大洲名称，避免把 Europe, Asia 等误认为城市
      if (!nonCityWords.includes(potentialCityLower) && 
          !categoryKeywordsLower.includes(potentialCityLower) &&
          !regionKeywordsLower.includes(potentialCityLower)) {
        result.city = correctCityName(potentialCity);
        break;
      }
    }
  }

  // 如果有城市但没有国家，自动推断国家
  if (result.city && !result.country) {
    const CITY_TO_COUNTRY: Record<string, string> = {
      'London': 'United Kingdom',
      'Paris': 'France',
      'Tokyo': 'Japan',
      'Osaka': 'Japan',
      'Kyoto': 'Japan',
      'New York': 'United States',
      'Los Angeles': 'United States',
      'San Francisco': 'United States',
      'Chicago': 'United States',
      'Seoul': 'South Korea',
      'Bangkok': 'Thailand',
      'Singapore': 'Singapore',
      'Sydney': 'Australia',
      'Melbourne': 'Australia',
      'Rome': 'Italy',
      'Milan': 'Italy',
      'Florence': 'Italy',
      'Venice': 'Italy',
      'Barcelona': 'Spain',
      'Madrid': 'Spain',
      'Berlin': 'Germany',
      'Amsterdam': 'Netherlands',
      'Vienna': 'Austria',
      'Prague': 'Czech Republic',
      'Copenhagen': 'Denmark',
      'Beijing': 'China',
      'Shanghai': 'China',
      'Hong Kong': 'China',
      'Taipei': 'Taiwan',
    };
    result.country = CITY_TO_COUNTRY[result.city] || '';
    if (result.country) {
      logger.info(`[SearchV2] Inferred country "${result.country}" from city "${result.city}"`);
    }
  }
  
  logger.info(`[SearchV2] Parsed query: count=${result.count}, category="${result.category}", city="${result.city}", country="${result.country}", region="${result.region}", tags=${JSON.stringify(result.tags || [])}`);
  return result;
}


/**
 * 从中英文混合名称中提取英文名称（用于落库）
 * 例如："金田家 Kanada-Ya" -> "Kanada-Ya"
 * 例如："一风堂 Ippudo" -> "Ippudo"
 */
function extractEnglishName(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return trimmed;
  
  // 检查是否包含中文字符
  const hasChinese = /[\u4e00-\u9fff]/.test(trimmed);
  if (!hasChinese) return trimmed; // 纯英文，直接返回
  
  // 尝试分割中英文
  // 模式1: "中文名 English Name" - 空格分隔
  const parts = trimmed.split(/\s+/);
  const englishParts = parts.filter(p => !/[\u4e00-\u9fff]/.test(p) && p.length > 0);
  
  if (englishParts.length > 0) {
    const englishName = englishParts.join(' ').trim();
    if (englishName.length >= 3) {
      logger.info(`[SearchV2] Extracted English name: "${trimmed}" -> "${englishName}"`);
      return englishName;
    }
  }
  
  // 模式2: "中文名English" - 直接相连，提取非中文部分
  const nonChineseMatch = trimmed.match(/[a-zA-Z][a-zA-Z0-9\s\-'&]+/);
  if (nonChineseMatch && nonChineseMatch[0].trim().length >= 3) {
    const englishName = nonChineseMatch[0].trim();
    logger.info(`[SearchV2] Extracted English name (pattern 2): "${trimmed}" -> "${englishName}"`);
    return englishName;
  }
  
  // 无法提取，返回原名
  return trimmed;
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
  
  // 🔧 辅助函数：检查名称是否有包含关系
  const isNameContained = (name1: string, name2: string): boolean => {
    const n1 = name1.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
    const n2 = name2.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
    if (n1.length < 4 || n2.length < 4) return false;
    return n1.includes(n2) || n2.includes(n1);
  };
  
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
      
      // 策略1.5: 检查名称包含匹配（如 "Ippudo" 包含在 "一风堂 Ippudo" 中）
      const containsMatch = await prisma.place.findFirst({
        where: {
          OR: [
            { name: { contains: place.name, mode: 'insensitive' } },
            // 反向检查较难用 Prisma 实现，下面手动检查
          ],
        },
      });
      
      if (containsMatch && isNameContained(place.name, containsMatch.name)) {
        logger.info(`[SearchV2] Skipping "${place.name}" - name contained in "${containsMatch.name}" (id: ${containsMatch.id})`);
        skippedCount++;
        continue;
      }
      
      // 策略2: 检查同城市内名称相似或包含的地点
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
        // 🔧 增加包含检查
        const hasContainment = isNameContained(place.name, existing.name);
        if (similarity > 0.8 || hasContainment) {
          logger.info(`[SearchV2] Skipping "${place.name}" - similar/contained to "${existing.name}" in same city (similarity: ${similarity.toFixed(2)}, contained: ${hasContainment})`);
          isDuplicate = true;
          break;
        }
      }
      
      if (isDuplicate) {
        skippedCount++;
        continue;
      }
      
      // 策略3: 检查坐标接近且名称相似或包含的地点（跨城市）
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
        // 🔧 增加包含检查：坐标接近时，名称包含也算重复
        const hasContainment = isNameContained(place.name, existing.name);
        if (similarity > 0.6 || hasContainment) {
          logger.info(`[SearchV2] Skipping "${place.name}" - similar/contained to nearby "${existing.name}" (similarity: ${similarity.toFixed(2)}, contained: ${hasContainment})`);
          isDuplicate = true;
          break;
        }
      }
      
      if (isDuplicate) {
        skippedCount++;
        continue;
      }
      
      // 没有重复，创建新地点
      // 🔧 落库时只保存英文名称
      const englishName = extractEnglishName(place.name);
      await prisma.place.create({
        data: {
          name: englishName,
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
      logger.info(`[SearchV2] Saved new AI place: "${englishName}" (original: "${place.name}", city: ${place.city})`);
    } catch (error) {
      logger.warn(`[SearchV2] Failed to save AI place "${place.name}": ${error}`);
    }
  }
  
  logger.info(`[SearchV2] AI places: saved ${savedCount}, skipped ${skippedCount} duplicates`);
}

async function matchAIPlacesFromDB(aiPlaces: AIPlace[], language: 'en' | 'zh' = 'en'): Promise<Map<string, PlaceResult>> {
  const matchedPlaces = new Map<string, PlaceResult>();

  const buildNameSearchTerms = (name: string): string[] => {
    const trimmed = (name || '').trim();
    if (!trimmed) return [];
    
    // 🔧 First, remove accents for better matching (Père -> Pere, etc.)
    const noAccents = removeAccents(trimmed);
    const lower = noAccents.toLowerCase();
    
    const tokens = lower
      .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);

    const terms = new Set<string>();
    terms.add(trimmed);
    terms.add(noAccents); // Add accent-stripped version
    // Add all tokens with length >= 4 for better matching
    tokens.filter(t => t.length >= 4).forEach(t => terms.add(t));
    // Also add the first token regardless of length
    if (tokens.length > 0) terms.add(tokens[0]);

    // Minimal alias dictionary for high-signal chains that are commonly stored in Japanese/Chinese.
    if (tokens.some(t => t === 'ichiran' || t.includes('ichiran'))) {
      terms.add('ichiran');
      terms.add('一蘭');
      terms.add('一兰');
    }
    
    // 🔧 Add cemetery-specific terms for better matching
    if (tokens.some(t => t === 'lachaise' || t === 'pere')) {
      terms.add('pere lachaise');
      terms.add('père lachaise');
      terms.add('pere-lachaise');
      terms.add('lachaise');
    }

    return Array.from(terms).filter(t => t && t.trim().length >= 2).slice(0, 15);
  };

  const isIchiranAliasPair = (aiName: string, dbName: string): boolean => {
    const aiLower = (aiName || '').toLowerCase();
    const db = dbName || '';
    const aiMentionsIchiran = aiLower.includes('ichiran') || aiName.includes('一蘭') || aiName.includes('一兰');
    const dbMentionsIchiran = db.toLowerCase().includes('ichiran') || db.includes('一蘭') || db.includes('一兰');
    return aiMentionsIchiran && dbMentionsIchiran;
  };
  
  for (const aiPlace of aiPlaces) {
    const nameTerms = buildNameSearchTerms(aiPlace.name);
    const candidates = await prisma.place.findMany({
      where: {
        // Only consider DB places that already have a cover image.
        // This prevents matching to ai_generated/no-image rows and avoids UI placeholder cards.
        coverImage: { not: '' },
        OR: [
          ...nameTerms.map((term) => ({ name: { contains: term, mode: 'insensitive' as const } })),
        ],
      },
      take: 20,
    });
    
    let bestMatch: any = null;
    let bestScore = 0;
    
    // 收集候选（先严格：名称相似 + 位置接近；再放宽：同城 + 坐标接近 + 名称相似）
    const strictCandidates: { candidate: any; score: number }[] = [];
    const relaxedCandidates: { candidate: any; score: number }[] = [];
    
    for (const candidate of candidates) {
      let nameSimilarity = calculateNameSimilarity(aiPlace.name, candidate.name);
      
      // 🔧 包含匹配增强：如果 AI 名称完全包含在数据库名称中，或反之，提升相似度
      // 例如："Ippudo" 包含在 "一风堂 Ippudo" 或 "Ippudo Central Saint Giles" 中
      // 🔧 Also handle accented characters (Père -> Pere)
      const aiNameLower = removeAccents(aiPlace.name).toLowerCase().trim();
      const dbNameLower = removeAccents(candidate.name || '').toLowerCase().trim();
      const aiNameNormalized = aiNameLower.replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
      const dbNameNormalized = dbNameLower.replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
      
      if (aiNameNormalized.length >= 4 && dbNameNormalized.length >= 4) {
        // 如果 AI 名称是数据库名称的子串，或反之
        if (dbNameNormalized.includes(aiNameNormalized) || aiNameNormalized.includes(dbNameNormalized)) {
          nameSimilarity = Math.max(nameSimilarity, 0.85);
          logger.info(`[SearchV2] Name containment match: "${aiPlace.name}" <-> "${candidate.name}", boosted similarity to ${nameSimilarity.toFixed(2)}`);
        }
      }
      
      // 🔧 Special handling for cemetery/landmark names with different word order
      // e.g., "Père Lachaise Cemetery" vs "Cemetery du Père-Lachaise"
      const aiTokensNormalized = aiNameLower.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length >= 4);
      const dbTokensNormalized = dbNameLower.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length >= 4);
      const significantTokenOverlap = aiTokensNormalized.filter(t => dbTokensNormalized.includes(t));
      if (significantTokenOverlap.length >= 2) {
        // Strong signal: 2+ significant tokens match (e.g., "pere" and "lachaise")
        nameSimilarity = Math.max(nameSimilarity, 0.80);
        logger.info(`[SearchV2] Token overlap match: "${aiPlace.name}" <-> "${candidate.name}", tokens: [${significantTokenOverlap.join(', ')}], boosted similarity to ${nameSimilarity.toFixed(2)}`);
      }
      
      const latDiff = Math.abs(aiPlace.latitude - candidate.latitude);
      const lngDiff = Math.abs(aiPlace.longitude - candidate.longitude);
      const coordDistance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
      const isNearby = latDiff < CONFIG.COORDINATE_THRESHOLD && lngDiff < CONFIG.COORDINATE_THRESHOLD;
      const isVeryClose = coordDistance < CONFIG.COORDINATE_THRESHOLD_VERY_CLOSE; // ~220m
      const isWithinRelaxedRange = coordDistance < CONFIG.COORDINATE_THRESHOLD_RELAXED; // ~2.2km

      // Cross-script alias boost (e.g. AI: "Ichiran" -> DB: "一蘭 渋谷店")
      if (isIchiranAliasPair(aiPlace.name, candidate.name)) {
        nameSimilarity = Math.max(nameSimilarity, 0.86);
      }

      const aiCity = (aiPlace.city || '').toLowerCase().trim();
      const candidateCity = (candidate.city || '').toLowerCase().trim();
      const aiCountry = (aiPlace.country || '').toLowerCase().trim();
      const candidateCountry = (candidate.country || '').toLowerCase().trim();
      const isSameCity = !!aiCity && !!candidateCity && aiCity === candidateCity;
      const isSameCountry = !!aiCountry && !!candidateCountry && aiCountry === candidateCountry;
      const aiTokens = aiPlace.name
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length >= 4);
      const candidateName = candidate.name.toLowerCase();
      const hasTokenOverlap = aiTokens.some(token => candidateName.includes(token));
      
      // 1. Strict matching: name similarity >= threshold AND coordinates within 1km
      if (nameSimilarity >= CONFIG.NAME_SIMILARITY_THRESHOLD && isNearby) {
        const score = nameSimilarity + (1 - coordDistance / CONFIG.COORDINATE_THRESHOLD);
        strictCandidates.push({ candidate, score });
        continue;
      }
      
      // 2. Very close coordinates (< 220m): allow lower name similarity (>= 0.4)
      // This handles same place with different names (e.g., "Sainte-Chapelle" vs "Sainte Chapelle")
      if (isVeryClose && nameSimilarity >= 0.4) {
        // High score for coordinate proximity
        const score = nameSimilarity + (1 - coordDistance / CONFIG.COORDINATE_THRESHOLD_VERY_CLOSE) * 0.5;
        strictCandidates.push({ candidate, score });
        continue;
      }

      // 3. Relaxed matching: same city + within 2km + moderate name similarity (>= 0.7)
      // OR same city + very high name similarity (>= 0.85) regardless of distance
      if (isSameCity) {
        if (isWithinRelaxedRange && nameSimilarity >= 0.7) {
          const ratingCount = typeof candidate.ratingCount === 'number' ? candidate.ratingCount : 0;
          const score = nameSimilarity * 1.5 + (1 - coordDistance / CONFIG.COORDINATE_THRESHOLD_RELAXED) * 0.5 + Math.log10(ratingCount + 1) * 0.1;
          relaxedCandidates.push({ candidate, score });
          continue;
        }
        if (nameSimilarity >= 0.85) {
          const ratingCount = typeof candidate.ratingCount === 'number' ? candidate.ratingCount : 0;
          const score = nameSimilarity * 2 + Math.log10(ratingCount + 1) * 0.15;
          relaxedCandidates.push({ candidate, score });
          continue;
        }
      }
      
      // 4. Chain matching: same country + high name similarity with token overlap
      // More restrictive than before - require both token overlap AND high similarity
      if (isSameCountry && hasTokenOverlap && nameSimilarity >= 0.8) {
        const ratingCount = typeof candidate.ratingCount === 'number' ? candidate.ratingCount : 0;
        const score = nameSimilarity * 1.5 + Math.log10(ratingCount + 1) * 0.15;
        relaxedCandidates.push({ candidate, score });
        continue;
      }

      // 5. Fallback: No city info, but very strong name match (>= 0.9) - more restrictive
      if (!aiCity && nameSimilarity >= 0.9) {
        const ratingCount = typeof candidate.ratingCount === 'number' ? candidate.ratingCount : 0;
        const score = nameSimilarity * 2 + Math.log10(ratingCount + 1) * 0.15;
        relaxedCandidates.push({ candidate, score });
      }
    }
    
    // 如果有多个匹配，优先选择有图片的
    const validCandidates = strictCandidates.length > 0 ? strictCandidates : relaxedCandidates;

    if (validCandidates.length > 0) {
      // 按分数排序
      validCandidates.sort((a, b) => b.score - a.score);
      
      // 在分数相近的候选中（差距 < 0.1），优先选择有图片的
      // NOTE: we already filter candidates to coverImage != '', but keep this as a safety net.
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
      
      const displayTags = buildDisplayTags(bestMatch.categoryEn, finalAiTags, 'en', bestMatch.tags as Record<string, string[]> | null);
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
        // 🔧 Pass through AI recommendation phrase for display when rating not available
        recommendationPhrase: aiPlace.recommendationPhrase || '',
        customFields: bestMatch.customFields || undefined,
      });
    }
  }
  
  return matchedPlaces;
}

async function getPlacesByCategory(
  city: string,
  country: string,
  category: string,
  excludeIds: string[],
  limit: number,
  excludeNames: string[] = [],
  region: string = ''
): Promise<any[]> {
  const categoryValues = Array.from(
    new Set([
      ...(CATEGORY_MAPPING[category] || []),
      ...(category && category.trim() ? [category.trim()] : []),
    ]),
  );
  
  // 过滤掉非 UUID 格式的 ID（如 ai_xxx 格式）
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  const validExcludeIds = excludeIds.filter(id => uuidRegex.test(id));
  
  // 构建城市条件（如果有城市）
  const cityCondition = city ? buildCityCondition(city) : null;
  const countryCondition = country ? buildCountryCondition(country) : null;
  // 🌍 构建地区条件（如 Europe -> [France, Germany, Italy, ...]）
  const regionCondition = region ? buildRegionCondition(region) : null;

  const ramenCategoryIntent = categoryValues.some((v) => v.toLowerCase().trim() === 'ramen') ||
    (category || '').toLowerCase().trim() === 'ramen';

  const hasRamenSignalRow = (row: any): boolean => {
    const signals: string[] = [];
    if (typeof row?.name === 'string') signals.push(row.name);
    if (typeof row?.categoryEn === 'string') signals.push(row.categoryEn);
    if (typeof row?.categorySlug === 'string') signals.push(row.categorySlug);
    if (typeof row?.category === 'string') signals.push(row.category);
    signals.push(...normalizeAnyTagsToStrings(row?.aiTags));
    signals.push(...normalizeAnyTagsToStrings(row?.tags));
    return hasRamenSignalFromStrings(signals);
  };
  
  // 构建 category 条件（case-insensitive）
  // 注意：数据库中 categoryEn 可能是 "Cemetery" 或 "cemetery"，需要同时匹配
  const categoryCondition = categoryValues.length > 0
    ? {
        OR: [
          { categorySlug: { in: categoryValues, mode: 'insensitive' as const } },
          { categoryEn: { in: categoryValues, mode: 'insensitive' as const } },
          { category: { in: categoryValues, mode: 'insensitive' as const } },
        ],
      }
    : null;
  
  let places: any[] = [];
  const seenNames = new Set(excludeNames.map(n => n.toLowerCase().trim()));
  
  if (categoryValues.length > 0) {
    // 构建查询条件
    const whereConditions: any[] = [
      ...(categoryCondition ? [categoryCondition] : []),
      { id: { notIn: validExcludeIds } },
      { coverImage: { not: null } },
      { coverImage: { not: '' } },
    ];
    
    // 如果有城市条件，添加城市过滤
    if (cityCondition) {
      whereConditions.unshift(cityCondition);
    }
    if (countryCondition) {
      whereConditions.unshift(countryCondition);
    }
    // 🌍 如果有地区条件（如 Europe），按地区内国家过滤
    if (regionCondition && !countryCondition) {
      whereConditions.unshift(regionCondition);
      logger.info(`[SearchV2] Using region filter: ${region} (${REGION_COUNTRIES[region]?.length || 0} countries)`);
    }
    
    // 多取一些数据，按评价数降序排序，优先返回高评价的地点
    // 注意：必须在数据库层面排序，否则只取 limit*3 条可能漏掉高评价地点
    // 使用 nulls: 'last' 确保没有评价数的地点排在最后
    const rawPlaces = await prisma.place.findMany({
      where: { AND: whereConditions },
      take: limit * 3, // 多取3倍数据用于筛选
      orderBy: [
        { ratingCount: { sort: 'desc', nulls: 'last' } },  // 优先按评价数降序，null 排最后
        { rating: { sort: 'desc', nulls: 'last' } },       // 其次按评分降序
      ],
    });

    // Ramen intent: bias toward places that look like ramen (name/tags/ai_tags/category fields)
    // before weighted score, so we don't fill results with generic restaurants.
    const sortedPlaces = ramenCategoryIntent
      ? [...rawPlaces].sort((a, b) => {
          const aSignal = hasRamenSignalRow(a) ? 1 : 0;
          const bSignal = hasRamenSignalRow(b) ? 1 : 0;
          if (aSignal !== bSignal) return bSignal - aSignal;
          return calculateWeightedScore(b.rating, b.ratingCount) - calculateWeightedScore(a.rating, a.ratingCount);
        })
      : sortByWeightedScore(rawPlaces);
    
    // ⚠️ 不再随机打乱结果，保持按评价数排序
    // 这样高评价的地点会优先返回（如 Père Lachaise Cemetery 有 4000+ 评价）
    // 之前的随机打乱会导致低评价的地点被优先返回
    
    for (const p of sortedPlaces) {
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

        // Avoid generic keyword expansion for ramen: "restaurant" is too broad.
        if (ramenCategoryIntent && keyword.toLowerCase().trim() === 'restaurant') continue;
        
        const moreWhereConditions: any[] = [
          { id: { notIn: existingIds } },
          { coverImage: { not: null } },
          { coverImage: { not: '' } },
          { name: { contains: keyword, mode: 'insensitive' } },
        ];
        
        if (cityCondition) {
          moreWhereConditions.unshift(cityCondition);
        }
        if (countryCondition) {
          moreWhereConditions.unshift(countryCondition);
        }
        
        const morePlaces = await prisma.place.findMany({
          where: { AND: moreWhereConditions },
          take: (limit - places.length) * 2,
        });
        // 按加权评分排序
        const sortedMorePlaces = ramenCategoryIntent
          ? [...morePlaces].sort((a, b) => {
              const aSignal = hasRamenSignalRow(a) ? 1 : 0;
              const bSignal = hasRamenSignalRow(b) ? 1 : 0;
              if (aSignal !== bSignal) return bSignal - aSignal;
              return calculateWeightedScore(b.rating, b.ratingCount) - calculateWeightedScore(a.rating, a.ratingCount);
            })
          : sortByWeightedScore(morePlaces);
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
          ...(countryCondition ? [countryCondition] : []),
          { id: { notIn: validExcludeIds } },
          { coverImage: { not: null } },
          { coverImage: { not: '' } },
        ],
      },
      take: limit * 2,
    });
    // 按加权评分排序
    places = sortByWeightedScore(rawPlaces).slice(0, limit);
  } else if (countryCondition) {
    // 没有分类也没有城市，但有国家，按国家搜索
    const rawPlaces = await prisma.place.findMany({
      where: {
        AND: [
          countryCondition,
          { id: { notIn: validExcludeIds } },
          { coverImage: { not: null } },
          { coverImage: { not: '' } },
        ],
      },
      take: limit * 2,
    });
    places = sortByWeightedScore(rawPlaces).slice(0, limit);
  }
  // 如果既没有分类也没有城市，返回空数组
  
  logger.info(`[SearchV2] Found ${places.length} places for category "${category}" in "${city || country || 'global'}"`);
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

  if (parsedQuery.country && parsedQuery.country.trim()) {
    andConditions.unshift(buildCountryCondition(parsedQuery.country.trim()));
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

  // 🚀 优化：并行执行两个查询，减少等待时间
  if (tokens.length > 0) {
    // 构建名字匹配条件
    const nameMatchConditions: any[] = [
      { id: { notIn: validExcludeIds } },
      { coverImage: { not: null } },
      { coverImage: { not: '' } },
    ];
    for (const token of tokens) {
      nameMatchConditions.push({ name: { contains: token, mode: 'insensitive' as const } });
    }
    if (parsedQuery.city && parsedQuery.city.trim()) {
      nameMatchConditions.push(buildCityCondition(parsedQuery.city.trim()));
    }
    if (parsedQuery.country && parsedQuery.country.trim()) {
      nameMatchConditions.push(buildCountryCondition(parsedQuery.country.trim()));
    }

    // 构建分类/描述匹配条件（简化版，减少 contains 查询）
    const categoryConditions: any[] = [
      { id: { notIn: validExcludeIds } },
      { coverImage: { not: null } },
      { coverImage: { not: '' } },
    ];
    if (parsedQuery.city && parsedQuery.city.trim()) {
      const cityVariants = getCityVariants(parsedQuery.city.trim()) || [parsedQuery.city.trim()];
      categoryConditions.push({ OR: cityVariants.map(c => ({ city: { equals: c, mode: 'insensitive' as const } })) });
    }
    if (parsedQuery.country && parsedQuery.country.trim()) {
      categoryConditions.push(buildCountryCondition(parsedQuery.country.trim()));
    }
    if (parsedQuery.category && parsedQuery.category.trim()) {
      const categoryValues = CATEGORY_MAPPING[parsedQuery.category] || [parsedQuery.category];
      categoryConditions.push({
        OR: [
          { categorySlug: { in: categoryValues } },
          { categoryEn: { in: categoryValues, mode: 'insensitive' as const } },
        ],
      });
    }

    // 🚀 并行执行两个查询
    const [nameMatchPlaces, categoryPlaces] = await Promise.all([
      prisma.place.findMany({
        where: { AND: nameMatchConditions },
        take: limit * 2,
      }),
      // 只有在有分类条件时才执行分类查询
      parsedQuery.category ? prisma.place.findMany({
        where: { AND: categoryConditions },
        take: limit * 2,
      }) : Promise.resolve([]),
    ]);

    // 先处理名字匹配结果
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

    // 如果不够，再从分类结果补充
    if (places.length < limit && categoryPlaces.length > 0) {
      const sortedCategoryPlaces = sortByWeightedScore(categoryPlaces);
      for (const p of sortedCategoryPlaces) {
        const normalizedName = (p.name || '').toLowerCase().trim();
        if (!normalizedName) continue;
        if (seenNames.has(normalizedName)) continue;
        seenNames.add(normalizedName);
        places.push(p);
        if (places.length >= limit) break;
      }
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
    const cityVariants = getCityVariants(parsedQuery.city.trim()) || [parsedQuery.city.trim()];
    andConditions.unshift({ OR: cityVariants.map(c => ({ city: { equals: c, mode: 'insensitive' as const } })) });
  }
  if (parsedQuery.country && parsedQuery.country.trim()) {
    andConditions.unshift(buildCountryCondition(parsedQuery.country.trim()));
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
 * 🚀 优化版：使用 web search 但精简 prompt，只获取关键信息
 */
async function generateTextOnlyResponse(
  aiPlaces: AIPlace[],
  query: string,
  language: string
): Promise<string> {
  if (aiPlaces.length === 0) {
    return '';
  }
  
  const isZh = language === 'zh';
  const selectedPlaces = aiPlaces.slice(0, 8);
  const names = selectedPlaces.map(p => p.name).join(',');
  
  // 🚀 超精简 prompt - 从 2000+ 字符减到 ~200 字符
  const prompt = isZh
    ? `搜索:${query}
地点:${names}
用中文写简介，每个地点50-80字符，描述特色亮点。如果知道官网地址也请提供。格式:
### 地点名
简介描述。
网站:xxx.com`
    : `Query:${query}
Places:${names}
Write 50-80 char description for each place highlighting unique features. Include website if known. Format:
### Place Name
Description of features and atmosphere.
Website: xxx.com`;

  try {
    const response = await generateTextWithWebSearch(prompt, 25000);
    
    if (response) {
      const cleanResponse = response
        .replace(/```markdown\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      logger.info(`[SearchV2] Generated text-only response: ${cleanResponse.length} chars`);
      return cleanResponse;
    }
  } catch (error) {
    logger.warn(`[SearchV2] generateTextOnlyResponse failed: ${error}`);
  }
  
  // Fallback: 模板生成
  const fallbackLines: string[] = [];
  if (isZh) {
    fallbackLines.push(`关于"${query}"，以下是推荐的地点：\n`);
  } else {
    fallbackLines.push(`Here are recommended places for "${query}":\n`);
  }
  
  for (const place of selectedPlaces) {
    fallbackLines.push(`### ${place.name}`);
    fallbackLines.push('');
    fallbackLines.push(place.summary || (isZh ? `位于${place.city || '当地'}的知名地点。` : `A notable place in ${place.city || 'this area'}.`));
    fallbackLines.push('');
  }
  
  if (isZh) {
    fallbackLines.push('\n希望以上推荐对你有帮助！有问题随时问 😊');
  } else {
    fallbackLines.push('\nHope these help! Let me know if you have questions 😊');
  }
  
  return fallbackLines.join('\n');
}


async function generateAISummaryForPlaces(
  places: any[],
  parsedQuery: ParsedQuery,
  language: string
): Promise<{ places: PlaceResult[]; categories: CategoryGroup[]; overallSummary: string }> {
  // Create matchLanguageCode from language parameter
  const matchLanguageCode = language as 'en' | 'zh';
  
  if (places.length === 0) {
    return { places: [], categories: [], overallSummary: '' };
  }
  
  // 🚀 优化：精简 prompt（从 ~500 字符减到 ~150 字符）
  const names = places.slice(0, 8).map(p => p.name).join(',');
  const lang = language === 'zh' ? 'Chinese' : 'English';
  const prompt = `${lang}. Query:"${parsedQuery.originalQuery}". Places:${names}
JSON:{"introduction":"<40字>","categories":[{"title":"☕ Cat","places":[{"name":"","summary":"<30字>"}]}]}`;

  try {
    const response = await generateTextWithFallback(prompt, CONFIG.AI_SUMMARY_TIMEOUT_MS);
    
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
            tags: buildDisplayTags(dbPlace.categoryEn, dbPlace.aiTags, 'en', dbPlace.tags as Record<string, string[]> | null),
            isVerified: hasRating || dbPlace.isVerified || false,
            source: 'cache',
            address: dbPlace.address || undefined,
            phoneNumber: dbPlace.phoneNumber || undefined,
            website: dbPlace.website || undefined,
            openingHours: dbPlace.openingHours || undefined,
            customFields: dbPlace.customFields || undefined,
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
      tags: buildDisplayTags(p.categoryEn, p.aiTags, 'en', p.tags as Record<string, string[]> | null),
      isVerified: (p.rating !== null && p.rating > 0) || p.isVerified || false,
      source: 'cache' as const,
      address: p.address || undefined,
      phoneNumber: p.phoneNumber || undefined,
      website: p.website || undefined,
      openingHours: p.openingHours || undefined,
      customFields: p.customFields || undefined,
    }));
    return { places: fallbackPlaces, categories: [], overallSummary: '' };
  }
}

async function searchMissingImages(places: PlaceResult[], city: string): Promise<void> {
  // 图片搜索已关闭
  return;
}


export const searchV2 = async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { query, userId, language = 'en', excludePlaceIds = [] } = req.body;
    logger.info(`[SearchV2] Received request - query: "${query}", language: "${language}", isNonLatin: ${/[\u0080-\uFFFF]/.test(query)}`);
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
        translationStatus: 'not_needed',
        translatedQuery: '',
      });
    }

    const isChineseQuery = containsCjk(query);
    // Use CJK detection instead of generic non-Latin check
    // This avoids false positives from smart quotes, accented characters, etc.
    const isNonLatinQuery = isChineseQuery;

    // Narrative (ack/overall/summary text) should be Chinese for Chinese queries.
    // Retrieval/matching can still use English.
    const matchLanguage = isChineseQuery ? 'en' : language;
    const narrativeLanguage = isChineseQuery ? 'zh' : language;
    const matchLanguageCode = matchLanguage as 'en' | 'zh';
    const narrativeLanguageCode = narrativeLanguage as 'en' | 'zh';
    const summaryLanguageCode = narrativeLanguageCode;
    const narrativeQuery = query;

    // Avoid any AI translation waits. For CJK/non-Latin queries we use a deterministic fallback
    // to build an English matchQuery (e.g., "日本拉面店" -> "Japan ramen shop").
    let translationStatus: TranslationStatus = isNonLatinQuery ? 'translated' : 'not_needed';
    let translatedQuery = query;
    if (isNonLatinQuery) {
      const fallbackQuery = buildFallbackEnglishQuery(query);
      if (fallbackQuery && fallbackQuery.trim()) {
        translatedQuery = fallbackQuery;
      } else {
        translationStatus = 'failed';
        translatedQuery = query;
      }
    }

    let matchQuery = translationStatus === 'translated' ? translatedQuery : query;
    if (translationStatus === 'failed' && isNonLatinQuery) {
      const fallbackQuery = buildFallbackEnglishQuery(query);
      if (fallbackQuery && fallbackQuery.trim()) {
        matchQuery = fallbackQuery;
        translatedQuery = fallbackQuery;
      }
    }

    logger.info(`[SearchV2] Starting search for: "${query}"`);
    
    // ========== 第零步：意图识别（使用 IntentClassifierService） ==========
    // IMPORTANT: Reset GLOBAL AI call counter at the start of each request
    resetAICallCounter();
    
    const intentResult = await intentClassifierService.classify(query, narrativeLanguage);
    logger.info(`[SearchV2] Detected intent: ${intentResult.intent} (confidence: ${intentResult.confidence}), AI calls used: ${getAICallCount()}`);
    
    // ========== 处理 non_travel 意图 ==========
    if (intentResult.intent === 'non_travel') {
      logger.info('[SearchV2] Handling non_travel intent');
      const result = await intentClassifierService.handleNonTravel(query, narrativeLanguage);
      
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
        translationStatus,
        translatedQuery,
      });
    }
    
    // ========== 处理 regular_travel 意图 ==========
    if (intentResult.intent === 'regular_travel') {
      logger.info('[SearchV2] Handling regular_travel intent');
      const result = await intentClassifierService.handleRegularTravel(query, narrativeLanguage);
      
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
      logger.info(`[SearchV2] regular_travel completed in ${duration}ms`);
      
      // Generate nameMapping: map mentioned place names (possibly in Chinese) to matched database places (English names)
      // This helps frontend match text content to clickable places
      const nameMapping: Array<{ displayName: string; englishName: string }> = [];
      if (result.matchedPlaces && result.matchedPlaces.length > 0 && result.mentionedPlaceNames.length > 0) {
        for (const mentionedName of result.mentionedPlaceNames) {
          // Find the matched place for this mentioned name
          const matchedPlace = result.matchedPlaces.find(p => 
            p.name.toLowerCase().includes(mentionedName.toLowerCase()) ||
            mentionedName.toLowerCase().includes(p.name.toLowerCase())
          );
          if (matchedPlace) {
            nameMapping.push({
              displayName: mentionedName,
              englishName: matchedPlace.name,
            });
            logger.info(`[SearchV2] nameMapping: "${mentionedName}" -> "${matchedPlace.name}"`);
          }
        }
      }
      
      return res.json({
        success: true,
        intent: 'regular_travel',
        textContent: result.textContent,
        mentionedPlaceNames: result.mentionedPlaceNames,
        places: result.matchedPlaces || [],
        nameMapping: nameMapping.length > 0 ? nameMapping : undefined,
        quotaRemaining,
        stage: 'complete',
        translationStatus,
        translatedQuery,
      });
    }
    
    // ========== 处理 travel_consultation 意图 ==========
    if (intentResult.intent === 'travel_consultation') {
      // 检查是否是建筑师/风格查询 - 使用专门的处理方法，不进行联网搜索
      if (intentResult.isArchitectQuery) {
        logger.info('[SearchV2] Handling architect/style query as travel_consultation');
        const result = await intentClassifierService.handleArchitectQuery(query, narrativeLanguage);
        
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
        logger.info(`[SearchV2] architect_query completed in ${duration}ms`);
        
        // 返回 travel_consultation 意图，前端会使用文本+横滑卡片的布局
        // 不进行联网搜索，只使用数据库匹配的地点
        // 包含 nameMapping 用于前端匹配中文地点名到英文数据库名
        return res.json({
          success: true,
          intent: 'travel_consultation',
          textContent: result.textContent,
          places: result.places || [],
          mapPlaces: result.places || [],
          nameMapping: result.nameMapping,  // 地点名映射：中文显示名 -> 英文数据库名
          quotaRemaining,
          stage: 'complete',
          translationStatus,
          translatedQuery,
        });
      }
      
      // 普通的 travel_consultation 处理
      logger.info('[SearchV2] Handling travel_consultation intent');
      const consultationQuery = parseQuery(query, { allowChinese: true });
      const requiredCity = (consultationQuery.city || '').trim();
      const requiredCountry = (consultationQuery.country || '').trim();
      let cityAliases: string[] = [];
      if (requiredCity) {
        cityAliases = getCityVariants(requiredCity) || [requiredCity];
        if (query.includes('伦敦') && !cityAliases.includes('伦敦')) {
          cityAliases.push('伦敦');
        }
      }
      const result = await intentClassifierService.handleTravelConsultation(query, narrativeLanguage, {
        requiredCity,
        requiredCountry,
        cityAliases,
      });
      
      // 对返回的地点进行坐标补全（地址反查）并持久化到数据库
      if (result.relatedPlaces && result.relatedPlaces.length > 0) {
        // 过滤出 AI 生成的临时地点（需要持久化的）
        const aiPlaces = result.relatedPlaces.filter(p => p.source === 'ai' || p.id?.startsWith('temp_'));
        // 统计数据库已匹配的地点数量
        const dbMatchedCount = result.relatedPlaces.filter(p => p.source !== 'ai' && !p.id?.startsWith('temp_')).length;
        
        if (aiPlaces.length > 0) {
          // 🚀 优化：如果数据库已匹配 >= 3 个地点，跳过联网搜索；否则执行联网搜索补充信息
          const shouldSkipWebSearch = dbMatchedCount >= 3;
          logger.info(`[SearchV2] DB matched ${dbMatchedCount} places, AI places: ${aiPlaces.length}, skipWebSearch: ${shouldSkipWebSearch}`);
          logger.info(`[SearchV2] Persisting ${aiPlaces.length} AI places to database for travel_consultation...`);
          const persistedPlaces = await persistAIPlacesToDB(
            aiPlaces,
            requiredCity,
            requiredCountry,
            narrativeLanguage,
            '', // category - travel consultation 可能没有特定分类
            { skipWebSearch: shouldSkipWebSearch }, // 根据数据库匹配数量决定是否联网搜索
          );
          
          // 用持久化后的地点替换原来的临时地点（使用模糊匹配）
          logger.info(`[SearchV2] Matching ${result.relatedPlaces.length} places with ${persistedPlaces.length} persisted places`);
          result.relatedPlaces = result.relatedPlaces.map(place => {
            // 移除序号前缀（如 "1. " 或 "1."）
            const cleanName = place.name.replace(/^\d+\.\s*/, '').toLowerCase().trim();
            const coreName = getCoreName(place.name);
            
            // 尝试多种匹配方式
            const persisted = persistedPlaces.find(p => {
              const pCleanName = p.name.replace(/^\d+\.\s*/, '').toLowerCase().trim();
              const pCoreName = getCoreName(p.name);
              
              // 1. 完全匹配（清理后）
              if (pCleanName === cleanName) return true;
              // 2. 包含匹配
              if (pCleanName.includes(cleanName) || cleanName.includes(pCleanName)) return true;
              // 3. 核心名称匹配
              if (coreName && pCoreName && (coreName.includes(pCoreName) || pCoreName.includes(coreName))) return true;
              // 4. 第一个单词匹配（适用于连锁店）
              const firstWord = cleanName.split(/\s+/)[0];
              const pFirstWord = pCleanName.split(/\s+/)[0];
              if (firstWord.length > 3 && firstWord === pFirstWord) return true;
              
              return false;
            });
            
            if (persisted) {
              logger.info(`[SearchV2] Matched "${place.name}" -> "${persisted.name}" (rating: ${persisted.rating})`);
              return persisted;
            } else {
              logger.warn(`[SearchV2] No match for "${place.name}"`);
              return place;
            }
          });
        } else {
          // 没有 AI 地点，但仍需补全坐标和评分
          await geocodePlacesMissingCoordinates(result.relatedPlaces, requiredCity, narrativeLanguage);
          const placesNeedingRating = result.relatedPlaces.filter(
            p => p.rating === null || p.rating === undefined
          );
          if (placesNeedingRating.length > 0) {
            result.relatedPlaces = await enrichPlacesWithRatings(
              result.relatedPlaces,
              requiredCity,
              narrativeLanguage
            );
          }
        }
      }
      if (result.cityPlaces && result.cityPlaces.length > 0) {
        for (const group of result.cityPlaces) {
          if (group.places && group.places.length > 0) {
            // 过滤出 AI 生成的临时地点
            const aiPlaces = group.places.filter(p => p.source === 'ai' || p.id?.startsWith('temp_'));
            // 统计数据库已匹配的地点数量
            const dbMatchedCount = group.places.filter(p => p.source !== 'ai' && !p.id?.startsWith('temp_')).length;
            
            if (aiPlaces.length > 0) {
              // 🚀 优化：如果数据库已匹配 >= 3 个地点，跳过联网搜索；否则执行联网搜索补充信息
              const shouldSkipWebSearch = dbMatchedCount >= 3;
              logger.info(`[SearchV2] City ${group.city}: DB matched ${dbMatchedCount} places, AI places: ${aiPlaces.length}, skipWebSearch: ${shouldSkipWebSearch}`);
              const persistedPlaces = await persistAIPlacesToDB(
                aiPlaces,
                group.city,
                requiredCountry,
                narrativeLanguage,
                '',
                { skipWebSearch: shouldSkipWebSearch }, // 根据数据库匹配数量决定是否联网搜索
              );
              
              // 用持久化后的地点替换原来的临时地点（使用模糊匹配）
              group.places = group.places.map(place => {
                const cleanName = place.name.replace(/^\d+\.\s*/, '').toLowerCase().trim();
                const coreName = getCoreName(place.name);
                
                const persisted = persistedPlaces.find(p => {
                  const pCleanName = p.name.replace(/^\d+\.\s*/, '').toLowerCase().trim();
                  const pCoreName = getCoreName(p.name);
                  if (pCleanName === cleanName) return true;
                  if (pCleanName.includes(cleanName) || cleanName.includes(pCleanName)) return true;
                  if (coreName && pCoreName && (coreName.includes(pCoreName) || pCoreName.includes(coreName))) return true;
                  const firstWord = cleanName.split(/\s+/)[0];
                  const pFirstWord = pCleanName.split(/\s+/)[0];
                  if (firstWord.length > 3 && firstWord === pFirstWord) return true;
                  return false;
                });
                return persisted || place;
              });
            } else {
              // 没有 AI 地点，但仍需补全坐标和评分
              await geocodePlacesMissingCoordinates(group.places, group.city, narrativeLanguage);
              const placesNeedingRating = group.places.filter(
                p => p.rating === null || p.rating === undefined
              );
              if (placesNeedingRating.length > 0) {
                group.places = await enrichPlacesWithRatings(
                  group.places,
                  group.city,
                  narrativeLanguage
                );
              }
            }
          }
        }
      }
      
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
        nameMapping: result.nameMapping,
        quotaRemaining,
        stage: 'complete',
        translationStatus,
        translatedQuery,
      });
    }
    
    // ========== 处理 specific_place 意图 ==========
    if (intentResult.intent === 'specific_place' && intentResult.placeName) {
      logger.info(`[SearchV2] Handling specific_place intent for: "${intentResult.placeName}"`);
      
      // 对于 specific_place 意图，使用 AI 翻译获取准确的英文地点名称
      // 因为 buildFallbackEnglishQuery 无法正确翻译专有地名（如"埃菲尔铁塔"）
      let placeNameForMatch = intentResult.placeName;
      if (isChineseQuery && containsCjk(intentResult.placeName)) {
        logger.info(`[SearchV2] Translating specific place name: "${intentResult.placeName}"`);
        const aiTranslation = await translateQueryToEnglish(intentResult.placeName);
        if (aiTranslation.status === 'translated' && aiTranslation.translatedQuery) {
          placeNameForMatch = aiTranslation.translatedQuery;
          logger.info(`[SearchV2] Translated to: "${placeNameForMatch}"`);
        } else {
          // 如果 AI 翻译失败，使用原始查询让 handleSpecificPlace 内部处理
          placeNameForMatch = query;
          logger.info(`[SearchV2] AI translation failed, using original query`);
        }
      }
      
      const result = await intentClassifierService.handleSpecificPlace(
        placeNameForMatch,
        narrativeLanguage,
        query,
      );
      
      // 对返回的地点进行坐标补全（地址反查）
      if (result.place) {
        await geocodePlacesMissingCoordinates([result.place], undefined, narrativeLanguage);
      }
      
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
        translationStatus,
        translatedQuery,
      });
    }
    
    // ========== 继续原有的 general_search 流程 ==========
    logger.info('[SearchV2] Handling general_search intent');
    const allowChineseParsing = !containsCjk(matchQuery);
    const parsedQuery = parseQuery(matchQuery, { allowChinese: allowChineseParsing });
    parsedQuery.originalQuery = matchQuery;

    // If the user specified a count in the ORIGINAL Chinese query (e.g., "8个/8家"),
    // preserve it even though matchQuery is converted to English for retrieval.
    if (isChineseQuery && !parsedQuery.explicitCount) {
      const originalParsed = parseQuery(query, { allowChinese: true });
      if (originalParsed.explicitCount) {
        parsedQuery.count = originalParsed.count;
        parsedQuery.explicitCount = true;
      }
    }
    if (!parsedQuery.country && isChineseQuery) {
      const originalCountry = parseQuery(query, { allowChinese: true }).country;
      if (originalCountry) {
        parsedQuery.country = originalCountry;
      }
    }
    if (!parsedQuery.country) {
      const inferredCountry = inferCountryFromCuisine(query) || inferCountryFromCuisine(matchQuery);
      if (inferredCountry) {
        parsedQuery.country = inferredCountry;
      }
    }

    if (!parsedQuery.city) {
      const inferredCity = inferCityFromQuery(query) || inferCityFromQuery(matchQuery);
      if (inferredCity) {
        parsedQuery.city = correctCityName(inferredCity);
        if (!parsedQuery.country && inferredCity) {
          const inferredCountry = inferCountryFromCuisine(query) || inferCountryFromCuisine(matchQuery) || 'Japan';
          parsedQuery.country = inferredCountry;
        }
      }
    }

    // If the query clearly indicates ramen, make sure category supplement kicks in.
    // This is critical for "日本拉面店" where DB has plenty of cached ramen places.
    const ramenIntent = /ramen|\u62c9\u9762|\u62c9\u9eb5|\u30e9\u30fc\u30e1\u30f3/i.test(query) ||
      /ramen|\u62c9\u9762|\u62c9\u9eb5|\u30e9\u30fc\u30e1\u30f3/i.test(matchQuery);
    if (ramenIntent && !parsedQuery.category) {
      parsedQuery.category = 'ramen';
    }
    logger.info(`[SearchV2] Translation status: ${translationStatus}, matchQuery: "${matchQuery}"`);
    logger.info(`[SearchV2] Parsed location: city="${parsedQuery.city}", country="${parsedQuery.country}"`);
    
    // 如果 AI 意图识别返回了城市/分类，优先使用
    // intentClassifier.detectCity 现在始终返回英文城市名
    if (intentResult.city && !parsedQuery.city) {
      parsedQuery.city = correctCityName(intentResult.city);
      logger.info(`[SearchV2] Using intent city: "${parsedQuery.city}"`);
    }
    if (intentResult.category && !isCjkString(intentResult.category) && !parsedQuery.category) {
      parsedQuery.category = intentResult.category;
    }
    // 添加 tags 支持（用于搜索 tags/aiTags 字段，如 architecture, beach 等）
    if (intentResult.tags && intentResult.tags.length > 0) {
      parsedQuery.tags = intentResult.tags;
      logger.info(`[SearchV2] Added tags from intent: ${JSON.stringify(parsedQuery.tags)}`);
    }
    if (intentResult.count && !parsedQuery.explicitCount) {
      parsedQuery.count = Math.min(Math.max(intentResult.count, 1), 15);
      parsedQuery.explicitCount = true;
    }

    // 🌍 判断是否为分类+地区查询（如 "famous cemetery in Europe"）
    // 这类查询应该优先使用数据库，目标为 5-15 个地点
    const isCategoryRegionQuery = !!(parsedQuery.category && parsedQuery.region && !parsedQuery.city);
    
    // If user didn't specify a count, use random 5-10 range (or 8-15 for category+region)
    // 用户要求：返回 5-10 个地点，每次随机，超过 5 个时分类展示
    // 分类+地区查询：返回 5-15 个地点，优先使用数据库
    // 🔧 修复：用户明确指定数量时，使用用户指定的数量，不强制 MIN_COUNT
    const maxCount = isCategoryRegionQuery ? CONFIG.CATEGORY_REGION_MAX_COUNT : CONFIG.MAX_COUNT;
    const randomTarget = isCategoryRegionQuery
      ? Math.floor(Math.random() * (maxCount - CONFIG.MIN_COUNT + 1)) + CONFIG.MIN_COUNT  // 5-15
      : Math.floor(Math.random() * (CONFIG.MAX_COUNT - CONFIG.MIN_COUNT + 1)) + CONFIG.MIN_COUNT;  // 5-10
    const targetCount = parsedQuery.explicitCount
      ? Math.min(Math.max(parsedQuery.count, 1), maxCount)  // 用户指定数量：限制在 1-maxCount 之间
      : Math.min(Math.max(randomTarget, CONFIG.MIN_COUNT), maxCount);  // 随机：限制在 MIN_COUNT-maxCount 之间
    logger.info(`[SearchV2] isCategoryRegionQuery: ${isCategoryRegionQuery}, explicitCount: ${parsedQuery.explicitCount}, random target: ${randomTarget}, final target: ${targetCount}`);

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
            translationStatus,
            translatedQuery,
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
            translationStatus,
            translatedQuery,
          });
        }
      }
    }

    // ========== 第一步：并行执行 AI 推荐和数据库名字匹配 ==========
    logger.info(`[SearchV2] Step 1: Starting parallel AI + DB search (target: ${targetCount})...`);

    // 🌍 分类+地区查询：优先使用数据库，不等待 AI
    // 例如 "famous cemetery in Europe" - 应该优先从数据库获取欧洲的墓地
    let dbCategoryRegionPlaces: any[] = [];
    if (isCategoryRegionQuery) {
      logger.info(`[SearchV2] Category+Region query detected: category="${parsedQuery.category}", region="${parsedQuery.region}"`);
      dbCategoryRegionPlaces = await getPlacesByCategory(
        '', // no city
        '', // no country  
        parsedQuery.category,
        [],
        targetCount * 2, // 多取一些用于筛选
        [],
        parsedQuery.region
      ).catch(err => {
        logger.warn(`[SearchV2] DB category+region query failed: ${err}`);
        return [];
      });
      logger.info(`[SearchV2] DB category+region returned ${dbCategoryRegionPlaces.length} places`);
    }

    // Always start the AI request in parallel, so we can prioritize AI→DB matched places when available.
    // We'll cap how long we wait based on whether the DB cache already satisfies the target.
    // 使用 narrativeLanguageCode 确保 AI 返回的 acknowledgment 语言与用户查询语言一致
    // 🌍 对于分类+地区查询，如果数据库已有足够数据，不启动 AI 请求
    const shouldSkipAI = isCategoryRegionQuery && dbCategoryRegionPlaces.length >= targetCount;
    const aiPromise = shouldSkipAI
      ? Promise.resolve(null)
      : aiRecommendationService.getRecommendations(matchQuery, narrativeLanguageCode)
        .catch(err => {
          logger.warn(`[SearchV2] AI call failed: ${err}`);
          return null;
        });

    // DB-first: if Supabase already has enough image places, skip AI to keep latency low.
    // This is critical for queries like "日本拉面店" where cache is rich.
    // 🌍 对于分类+地区查询，已经有 dbCategoryRegionPlaces，不需要重复查询
    const dbNameMatchPlaces = isCategoryRegionQuery
      ? []  // 分类+地区查询已经在上面查询过了
      : await getPlacesByQueryWithImage(parsedQuery, [], Math.min(10, targetCount), [])
        .catch(err => {
          logger.warn(`[SearchV2] DB name match failed: ${err}`);
          return [];
        });

    // 初步判断缓存是否充足
    // 注意：这里只做初步判断，后续可能因为意图过滤导致结果为空
    let cacheSufficient = isCategoryRegionQuery 
      ? dbCategoryRegionPlaces.length >= targetCount
      : dbNameMatchPlaces.length >= targetCount;

    let aiRecommendations: AIRecommendationResult | null = null;
    // 🌍 分类+地区查询且数据库充足：不等待 AI
    // 其他情况：如果缓存看起来充足，只等 2.5 秒；否则等待完整的 AI 超时
    let aiWaitMs = shouldSkipAI ? 0 : (cacheSufficient && !parsedQuery.explicitCount ? 2500 : CONFIG.AI_TIMEOUT_MS);
    if (!shouldSkipAI) {
      aiRecommendations = await Promise.race([
        aiPromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), aiWaitMs)),
      ]);
    }
    
    if (aiRecommendations) {
      logger.info(`[SearchV2] AI returned ${aiRecommendations.places.length} places`);
    } else if (shouldSkipAI) {
      logger.info(`[SearchV2] AI skipped - using database for category+region query`);
    }
    logger.info(`[SearchV2] DB name match returned ${dbNameMatchPlaces.length} places`);

    // 收集最终结果（只包含有图片的地点）
    let finalPlaces: PlaceResult[] = [];
    let acknowledgment = aiRecommendations?.acknowledgment || '';
    
    // 🌍 分类+地区查询：如果 AI 被跳过，生成模板 acknowledgment
    if (isCategoryRegionQuery && shouldSkipAI && !acknowledgment) {
      const isZh = narrativeLanguageCode === 'zh';
      const categoryDisplay = parsedQuery.category || '';
      const regionDisplay = parsedQuery.region || '';
      if (isZh) {
        acknowledgment = `为您搜集了${regionDisplay}著名的${categoryDisplay}，这些地方都有着独特的历史和文化价值。`;
      } else {
        acknowledgment = `I've gathered famous ${categoryDisplay}s in ${regionDisplay} for you. Each of these places has unique historical and cultural significance.`;
      }
    }
    
    let overallSummary = '';
    const usedIds = new Set<string>();
    const usedNames = new Set<string>();

    // If an AI recommended place is matched to a cached DB place, prioritize it in final ordering.
    // Map: dbPlaceId -> rank (lower is better).
    const aiMatchedRankById = new Map<string, number>();
    
    // 辅助函数：检查地点是否有有效图片（同步版本，用于快速检查）
    // 注意：某些数据源可能会写入空字符串/空白字符，这里统一按 trim 后判断。
    const hasImageSync = (p: PlaceResult | any) =>
      typeof p?.coverImage === 'string' && p.coverImage.trim().length > 0;

    const isStrictLocationMatch = (p: PlaceResult | any): boolean => {
      // 归一化城市和国家名称，处理中英文差异
      const normalizeCity = (city: string | undefined): string => {
        if (!city) return '';
        const lower = city.toLowerCase().trim();
        // 中文城市映射
        const cityMap: Record<string, string> = {
          '哥本哈根': 'copenhagen',
          '伦敦': 'london',
          '巴黎': 'paris',
          '东京': 'tokyo',
          '大阪': 'osaka',
        };
        return cityMap[city.trim()] || lower;
      };
      
      const normalizeCountry = (country: string | undefined): string => {
        if (!country) return '';
        const lower = country.toLowerCase().trim();
        // 中文国家映射
        const countryMap: Record<string, string> = {
          '丹麦': 'denmark',
          '日本': 'japan',
          '中国': 'china',
          '美国': 'united states',
          '英国': 'united kingdom',
          '法国': 'france',
        };
        return countryMap[country.trim()] || lower;
      };
      
      const requiredCountry = normalizeCountry(parsedQuery.country);
      const requiredCity = normalizeCity(parsedQuery.city);
      const requiredRegion = parsedQuery.region;
      const placeCountry = normalizeCountry(p?.country);
      const placeCity = normalizeCity(p?.city);

      // 🌍 如果有地区要求（如 Europe），检查地点的国家是否在该地区
      if (requiredRegion && !requiredCountry && !requiredCity) {
        const regionCountries = REGION_COUNTRIES[requiredRegion];
        if (regionCountries && regionCountries.length > 0) {
          const placeCountryRaw = (p?.country || '').trim();
          const isInRegion = regionCountries.some(c => 
            c.toLowerCase() === placeCountryRaw.toLowerCase() ||
            c.toLowerCase() === placeCountry
          );
          if (!isInRegion) {
            return false;
          }
        }
      }

      if (requiredCountry) {
        if (!placeCountry) return false;
        if (placeCountry !== requiredCountry) return false;
      }

      if (requiredCity) {
        if (!placeCity) return false;
        const cityVariants = getCityVariants(requiredCity) || [requiredCity];
        const matchesVariant = cityVariants.some(
          (variant) => placeCity === normalizeLocationText(variant),
        );
        if (!matchesVariant) {
          if (!placeCity.includes(requiredCity) && !requiredCity.includes(placeCity)) {
            return false;
          }
        }
      }

      return true;
    };

    const isCategoryMatch = (p: PlaceResult | any): boolean => {
      if (!parsedQuery.category) return true;
      const categoryValues = Array.from(
        new Set([
          ...(CATEGORY_MAPPING[parsedQuery.category] || []),
          parsedQuery.category,
        ]),
      );
      // 标准化所有值，并添加常见变体（如 yarn_store -> yarn, yarn store）
      const normalizedValues = new Set<string>();
      for (const v of categoryValues) {
        const lower = v.toLowerCase().trim();
        normalizedValues.add(lower);
        // 添加下划线变体 (yarn_store <-> yarn store)
        if (lower.includes('_')) {
          normalizedValues.add(lower.replace(/_/g, ' '));
          normalizedValues.add(lower.replace(/_/g, ''));  // yarnstore
        }
        if (lower.includes(' ')) {
          normalizedValues.add(lower.replace(/ /g, '_'));
        }
        // 提取主词（如 yarn_store -> yarn, craft store -> craft）
        const parts = lower.split(/[_\s]+/);
        if (parts.length > 1) {
          normalizedValues.add(parts[0]);  // yarn, craft
        }
      }
      const placeCategory = normalizeLocationText(p?.category);
      const placeCategoryEn = normalizeLocationText(p?.categoryEn);
      const placeCategorySlug = normalizeLocationText(p?.categorySlug);
      const tags: string[] = Array.isArray(p?.tags) ? p.tags.map((t: string) => t.toLowerCase().trim()) : [];

      return [...normalizedValues].some((value) => {
        if (!value) return false;
        if (placeCategory === value || placeCategoryEn === value || placeCategorySlug === value) return true;
        if (placeCategory.includes(value) || placeCategoryEn.includes(value) || placeCategorySlug.includes(value)) return true;
        // 反向检查：categoryEn 包含在搜索值中（如 categoryEn="yarn", 搜索="yarn store"）
        if (value.includes(placeCategory) || value.includes(placeCategoryEn)) return true;
        if (tags.includes(value)) return true;
        // 检查 tags 中是否包含搜索值
        if (tags.some(t => t.includes(value) || value.includes(t))) return true;
        return false;
      });
    };
    
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
      logger.info(`[SearchV2] 🔍 Evaluating place: "${place.name}" (source: ${place.source}, city: ${place.city}, country: ${place.country}, hasImage: ${hasImageSync(place)})`);
      
      if (usedIds.has(place.id) || usedNames.has(normalizedName)) {
        logger.info(`[SearchV2] ❌ Skipping "${place.name}" - duplicate (id or name)`);
        return false;
      }
      if (place.source === 'ai') {
        logger.info(`[SearchV2] ❌ Skipping "${place.name}" - AI-only card disabled`);
        return false;
      }
      if (!isStrictLocationMatch(place)) {
        logger.info(`[SearchV2] ❌ Skipping "${place.name}" - location mismatch (required city: ${parsedQuery.city}, country: ${parsedQuery.country})`);
        return false;
      }

      // Ramen intent hard-filter: must look like a ramen shop by name/tags/ai_tags-derived tags.
      // This prevents filling results with generic restaurants when user explicitly asked for ramen.
      if (ramenIntent) {
        const ramenSignals: string[] = [];
        ramenSignals.push(place.name);
        if (Array.isArray(place.tags)) ramenSignals.push(...place.tags);
        if (!hasRamenSignalFromStrings(ramenSignals)) {
          logger.info(`[SearchV2] Skipping "${place.name}" - ramen intent mismatch`);
          return false;
        }
      }
      if (!isCategoryMatch(place)) {
        logger.info(`[SearchV2] Skipping "${place.name}" - category mismatch`);
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

    // ========== 第 1.3 步：优先级 0 - 分类+地区查询的数据库结果 ==========
    // 🌍 对于分类+地区查询（如 "famous cemetery in Europe"），优先使用数据库结果
    if (isCategoryRegionQuery && dbCategoryRegionPlaces.length > 0) {
      logger.info(`[SearchV2] Step 1.3: Processing ${dbCategoryRegionPlaces.length} category+region places from database`);
      
      for (const p of dbCategoryRegionPlaces) {
        if (finalPlaces.length >= targetCount) break;
        if (!p.coverImage || p.coverImage === '') continue;
        
        const hasRating = p.rating !== null && p.rating > 0;
        // 解析 images 字段
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
        if (images.length === 0 && p.coverImage) {
          images = [p.coverImage];
        }
        
        const existingSummary = String((p as any).aiSummary || (p as any).ai_summary || (p as any).aiDescription || (p as any).ai_description || '').trim();
        const place: PlaceResult = {
          id: p.id,
          name: p.name,
          summary: existingSummary,
          coverImage: p.coverImage,
          images: images,
          latitude: p.latitude,
          longitude: p.longitude,
          city: p.city || '',
          country: p.country || '',
          rating: p.rating,
          ratingCount: p.ratingCount,
          tags: buildDisplayTags(p.categoryEn, p.aiTags, 'en', p.tags as Record<string, string[]> | null),
          isVerified: hasRating || p.isVerified || false,
          source: 'cache',
          address: p.address || undefined,
          phoneNumber: p.phoneNumber || undefined,
          website: p.website || undefined,
          openingHours: p.openingHours || undefined,
          customFields: p.customFields || undefined,
        };
        await addPlace(place);
      }
      logger.info(`[SearchV2] After category+region DB: ${finalPlaces.length}/${targetCount} places`);
    }

    // ========== 第 1.5 步：优先级 0 - 使用并行获取的数据库名字匹配结果 ==========
    // 重要：只有当 AI 没有返回结果时才使用 dbNameMatchPlaces
    // 如果 AI 返回了推荐，应该优先使用 AI 结果，避免添加 AI 没有推荐的地点
    let aiSummaryPromise: Promise<Map<string, string>> | null = null;
    
    // 判断是否应该使用 DB 名字匹配结果
    // 只有当 AI 没有返回足够结果时才使用，避免添加不相关的地点
    // 🌍 分类+地区查询已经在 Step 1.3 处理过了，跳过
    const shouldUseDbNameMatch = !isCategoryRegionQuery && (!aiRecommendations || aiRecommendations.places.length < 3);
    
    if (dbNameMatchPlaces.length > 0 && shouldUseDbNameMatch) {
      logger.info(`[SearchV2] Step 1.5: Processing ${dbNameMatchPlaces.length} name-matched places (AI returned ${aiRecommendations?.places?.length || 0} places)`);
      
      // 立即启动 AI summary 生成（并行）
      // Even on cache hits, generate summaries if we don't have good ones yet.
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

      // 优化：缓存充足时，不启动额外的 AI summary 生成
      // 使用数据库中已有的 summary，或使用 AI 推荐返回的 summary
      const shouldStartSummariesOnCacheHit = false; // 禁用缓存命中时的额外 summary 生成

      if (placesForSummary.length > 0 && !cacheSufficient && shouldStartSummariesOnCacheHit) {
        aiSummaryPromise = generateAISummariesForPlaces(placesForSummary, parsedQuery, summaryLanguageCode);
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
        
        const existingSummary = String((p as any).aiSummary || (p as any).ai_summary || (p as any).aiDescription || (p as any).ai_description || '').trim();
        const place: PlaceResult = {
          id: p.id,
          name: p.name,
          summary: existingSummary, // Use DB AI summary as fallback; may be overridden by LLM summaries
          coverImage: p.coverImage,
          images: images,
          latitude: p.latitude,
          longitude: p.longitude,
          city: p.city || parsedQuery.city,
          country: p.country || '',
          rating: p.rating,
          ratingCount: p.ratingCount,
          tags: buildDisplayTags(p.categoryEn, p.aiTags, 'en', p.tags as Record<string, string[]> | null),
          isVerified: hasRating || p.isVerified || false,
          source: 'cache',
          address: p.address || undefined,
          phoneNumber: p.phoneNumber || undefined,
          website: p.website || undefined,
          openingHours: p.openingHours || undefined,
          customFields: p.customFields || undefined,
        };
        await addPlace(place);
      }
      logger.info(`[SearchV2] After name match: ${finalPlaces.length}/${targetCount} places`);
    } else if (dbNameMatchPlaces.length > 0) {
      logger.info(`[SearchV2] Step 1.5: Skipping ${dbNameMatchPlaces.length} name-matched places because AI returned ${aiRecommendations?.places?.length || 0} places`);
    }

    // ========== 第二步：优先级 1 - AI 匹配到数据库的地点（有图片） ==========
    if (aiRecommendations && aiRecommendations.places.length > 0) {
      logger.info('[SearchV2] Step 2: Matching AI places against Supabase...');

      const aiOrderByName = new Map<string, number>();
      for (let i = 0; i < aiRecommendations.places.length; i++) {
        const name = (aiRecommendations.places[i]?.name || '').toLowerCase().trim();
        if (name && !aiOrderByName.has(name)) aiOrderByName.set(name, i);
      }

      const matchedPlaces = await matchAIPlacesFromDB(aiRecommendations.places, matchLanguageCode);
      logger.info(`[SearchV2] Matched ${matchedPlaces.size}/${aiRecommendations.places.length} AI places`);

      for (const [aiName, place] of matchedPlaces) {
        const key = (aiName || '').toLowerCase().trim();
        const rank = aiOrderByName.get(key);
        if (typeof rank === 'number' && place?.id) {
          const prev = aiMatchedRankById.get(place.id);
          if (prev === undefined || rank < prev) aiMatchedRankById.set(place.id, rank);
        }
      }
      
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

    // ========== 第三步：优先级 2 - AI 结果 + Web Search 图片（批量搜索）==========
    if (finalPlaces.length < targetCount && aiRecommendations && aiRecommendations.places.length > 0) {
      logger.info('[SearchV2] Step 3: Batch searching images for unmatched AI places...');
      
      // 找出未匹配的 AI 地点
      const unmatchedAIPlaces = aiRecommendations.places.filter(
        p => !usedNames.has(p.name.toLowerCase().trim())
      );

      const filteredUnmatched = unmatchedAIPlaces.filter((p) =>
        isStrictLocationMatch({
          name: p.name,
          city: p.city || parsedQuery.city,
          country: p.country || parsedQuery.country,
        }),
      );
      
      // 图片搜索已关闭 - 跳过 Step 3
      logger.info(`[SearchV2] Step 3: Image search disabled, skipping ${filteredUnmatched.length} unmatched AI places`);
      
      // 直接记录，不再搜索图片
      const foundImages = 0;
      logger.info(`[SearchV2] After batch web search: ${finalPlaces.length}/${targetCount} places (found ${foundImages} images)`);
    }

    // ========== 第三步补充：为 AI-only 地点补全联网信息并持久化 ==========
    // 🚀 优化：改为后台异步执行，不阻塞前端响应
    const aiOnlyPlaces = finalPlaces.filter(p =>
      p.source === 'ai' || p.id?.startsWith('ai_') || p.id?.startsWith('temp_')
    );
    if (aiOnlyPlaces.length > 0) {
      logger.info(`[SearchV2] Scheduling background persist for ${aiOnlyPlaces.length} AI-only places (non-blocking)...`);
      // 🚀 后台异步执行，不 await
      persistAIPlacesToDB(
        aiOnlyPlaces,
        parsedQuery.city || '',
        parsedQuery.country || '',
        narrativeLanguageCode,
        parsedQuery.category || '',
      ).then(persistedPlaces => {
        logger.info(`[SearchV2] Background persist completed: ${persistedPlaces.length} places saved`);
      }).catch(err => {
        logger.warn(`[SearchV2] Background persist failed: ${err}`);
      });
      // 不等待，直接继续（使用临时 ID）
    }

    // ========== 第四步：优先级 3 - Supabase 补充数据（必须有图片） ==========
    // 🚀 优化：并行执行 getPlacesByCategory 和 getPlacesByQueryWithImage
    if (finalPlaces.length < targetCount) {
      const needed = targetCount - finalPlaces.length;
      logger.info(`[SearchV2] Step 4: Need ${needed} more places, supplementing from Supabase (parallel)...`);
      
      const excludeIds = Array.from(usedIds);
      const excludeNames = Array.from(usedNames);
      
      // 🚀 并行执行两个补充查询
      const [categoryPlaces, queryPlaces] = await Promise.all([
        // 按分类补充
        (parsedQuery.city || parsedQuery.category || parsedQuery.region)
          ? getPlacesByCategory(
              parsedQuery.city || '', parsedQuery.country || '', parsedQuery.category, excludeIds, needed * 2, excludeNames, parsedQuery.region || ''
            )
          : Promise.resolve([]),
        // 按查询词补充
        getPlacesByQueryWithImage(
          parsedQuery,
          excludeIds,
          needed * 2,
          excludeNames,
        ),
      ]);
      
      logger.info(`[SearchV2] Found ${categoryPlaces.length} category + ${queryPlaces.length} query supplement places`);
      
      // 先处理分类结果
      for (const p of categoryPlaces) {
        if (finalPlaces.length >= targetCount) break;
        if (!p.coverImage || p.coverImage === '') continue;
        
        const hasRating = p.rating !== null && p.rating > 0;
        const existingSummary = String((p as any).aiSummary || (p as any).ai_summary || (p as any).aiDescription || (p as any).ai_description || '').trim();
        const place: PlaceResult = {
          id: p.id,
          name: p.name,
          summary: existingSummary,
          coverImage: p.coverImage,
          latitude: p.latitude,
          longitude: p.longitude,
          city: p.city || parsedQuery.city,
          country: p.country || '',
          rating: p.rating,
          ratingCount: p.ratingCount,
          tags: buildDisplayTags(p.categoryEn, p.aiTags, 'en', p.tags as Record<string, string[]> | null),
          isVerified: hasRating || p.isVerified || false,
          source: 'cache',
          address: p.address || undefined,
          phoneNumber: p.phoneNumber || undefined,
          website: p.website || undefined,
          openingHours: p.openingHours || undefined,
          customFields: p.customFields || undefined,
        };
        await addPlace(place);
      }
      
      // 再从查询结果补充
      for (const p of queryPlaces) {
        if (finalPlaces.length >= targetCount) break;
        if (!p.coverImage || p.coverImage === '') continue;

        const hasRating = p.rating !== null && p.rating > 0;
        const existingSummary = String((p as any).aiSummary || (p as any).ai_summary || (p as any).aiDescription || (p as any).ai_description || '').trim();
        const place: PlaceResult = {
          id: p.id,
          name: p.name,
          summary: existingSummary,
          coverImage: p.coverImage,
          latitude: p.latitude,
          longitude: p.longitude,
          city: p.city || parsedQuery.city,
          country: p.country || '',
          rating: p.rating,
          ratingCount: p.ratingCount,
          tags: buildDisplayTags(p.categoryEn, p.aiTags, 'en', p.tags as Record<string, string[]> | null),
          isVerified: hasRating || p.isVerified || false,
          source: 'cache',
          address: p.address || undefined,
          phoneNumber: p.phoneNumber || undefined,
          website: p.website || undefined,
          openingHours: p.openingHours || undefined,
          customFields: p.customFields || undefined,
        };
        await addPlace(place);
      }
      
      logger.info(`[SearchV2] After Supabase supplement: ${finalPlaces.length}/${targetCount} places`);
    }

    // ========== 最终检查：确保所有地点都有图片 ==========
    // Note: Image validation is now done in addPlace, so this is just a safety check for sync hasImage
    // Normalize + filter once more to guarantee response never includes blank images
    finalPlaces = finalPlaces
      .map(p => ({ ...p, coverImage: typeof p.coverImage === 'string' ? p.coverImage.trim() : p.coverImage }))
      .filter(p => hasImageSync(p));
    logger.info(`[SearchV2] Final count after image filter: ${finalPlaces.length}/${targetCount}`);

    // ========== 文本补齐：当匹配到的卡片数量不足时，用 AI 文本补齐 ==========
    // 如果结果不足且 AI 还没返回，重新等待 AI 完成
    const remaining = Math.max(targetCount - finalPlaces.length, 0);
    if (remaining > 0 && !aiRecommendations) {
      logger.info(`[SearchV2] Results shortage: got ${finalPlaces.length}, need ${targetCount}, waiting for AI...`);
      aiRecommendations = await Promise.race([
        aiPromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), CONFIG.AI_TIMEOUT_MS)),
      ]);
      if (aiRecommendations) {
        logger.info(`[SearchV2] AI returned ${aiRecommendations.places.length} places after retry`);
      } else {
        logger.warn(`[SearchV2] AI still not available after retry`);
      }
    }
    
    const textOnlyPlaces: PlaceResult[] = [];
    if (aiRecommendations && aiRecommendations.places.length > 0) {
      if (remaining > 0) {
        logger.info(`[SearchV2] Results shortage: got ${finalPlaces.length}, need ${targetCount}, generating ${remaining} text supplements`);
        const seenNames = new Set<string>(Array.from(usedNames));
        for (const aiPlace of aiRecommendations.places) {
          if (textOnlyPlaces.length >= remaining) break;
          const normalizedName = aiPlace.name.toLowerCase().trim();
          if (seenNames.has(normalizedName)) continue;

          const basePlace: PlaceResult = {
            id: generateStablePlaceId(aiPlace.name, aiPlace.city || parsedQuery.city, aiPlace.latitude, aiPlace.longitude),
            name: aiPlace.name,
            summary: aiPlace.summary || '',
            coverImage: '',
            images: [],
            latitude: aiPlace.latitude,
            longitude: aiPlace.longitude,
            city: aiPlace.city || parsedQuery.city,
            country: aiPlace.country || '',
            rating: aiPlace.rating ?? null,
            ratingCount: aiPlace.ratingCount ?? null,
            tags: buildDisplayTags(null, aiPlace.tags, 'en'), // 标签始终用英文
            isVerified: false,
            source: 'ai',
            recommendationPhrase: aiPlace.recommendationPhrase || '',
            address: aiPlace.address || undefined,
            phoneNumber: undefined,
            website: aiPlace.website || undefined,
            openingHours: undefined,
          };

          let summary = basePlace.summary || '';
          if (!summary.trim()) {
            summary = buildFallbackPlaceSummary(basePlace, parsedQuery, matchLanguageCode);
          }
          basePlace.summary = truncateToMaxChars(summary, 100);

          textOnlyPlaces.push(basePlace);
          seenNames.add(normalizedName);
        }
      }
    }

    // ========== 仅在完全没有图片结果时，改用文本格式返回 ==========
    // 用户明确要求过滤无图地点，因此即便数量偏少也优先返回卡片结果。
    if (finalPlaces.length === 0) {
      logger.info('[SearchV2] No places with images, switching to text-only mode');
      
      // 如果 AI 推荐为空（可能是初步判断缓存充足导致等待时间过短），重新等待 AI 完成
      if (!aiRecommendations) {
        logger.info('[SearchV2] AI recommendations is null, waiting for AI to complete...');
        aiRecommendations = await Promise.race([
          aiPromise,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), CONFIG.AI_TIMEOUT_MS)),
        ]);
        
        // 如果 AI 推荐返回了，重新生成 textOnlyPlaces
        if (aiRecommendations && aiRecommendations.places.length > 0) {
          logger.info(`[SearchV2] AI returned ${aiRecommendations.places.length} places after retry`);
          textOnlyPlaces.length = 0; // 清空
          const seenNames = new Set<string>(Array.from(usedNames));
          for (const aiPlace of aiRecommendations.places) {
            if (textOnlyPlaces.length >= targetCount) break;
            const normalizedName = aiPlace.name.toLowerCase().trim();
            if (seenNames.has(normalizedName)) continue;

            const basePlace: PlaceResult = {
              id: generateStablePlaceId(aiPlace.name, aiPlace.city || parsedQuery.city, aiPlace.latitude, aiPlace.longitude),
              name: aiPlace.name,
              summary: aiPlace.summary || '',
              coverImage: '',
              images: [],
              latitude: aiPlace.latitude,
              longitude: aiPlace.longitude,
              city: aiPlace.city || parsedQuery.city,
              country: aiPlace.country || '',
              rating: aiPlace.rating ?? null,
              ratingCount: aiPlace.ratingCount ?? null,
              tags: buildDisplayTags(null, aiPlace.tags, 'en'), // 标签始终用英文
              isVerified: false,
              source: 'ai',
              recommendationPhrase: aiPlace.recommendationPhrase || '',
              address: aiPlace.address || undefined,
              phoneNumber: undefined,
              website: aiPlace.website || undefined,
              openingHours: undefined,
            };

            let summary = basePlace.summary || '';
            if (!summary.trim()) {
              summary = buildFallbackPlaceSummary(basePlace, parsedQuery, matchLanguageCode);
            }
            basePlace.summary = truncateToMaxChars(summary, 100);

            textOnlyPlaces.push(basePlace);
            seenNames.add(normalizedName);
          }
        }
      }
      
      logger.info(`[SearchV2] Text-only mode: aiRecommendations=${aiRecommendations ? aiRecommendations.places.length : 'null'}, textOnlyPlaces=${textOnlyPlaces.length}`);
      
      let textContent = '';
      let matchedTextPlaces: PlaceResult[] = [];
      
      if (aiRecommendations && aiRecommendations.places.length > 0) {
        // 有 AI 推荐数据，使用它生成文本
        textContent = await generateTextOnlyResponse(
          aiRecommendations.places,
          narrativeQuery,
          narrativeLanguageCode
        );
      } else {
        // 没有 AI 推荐数据，直接让 AI 生成文本回复
        const isZh = narrativeLanguageCode === 'zh';
        const languageText = isZh ? 'Chinese (简体中文)' : 'English';
        const fallbackPrompt = `The user searched for "${narrativeQuery}". 

USE WEB SEARCH to find relevant and accurate information about real places.

STRUCTURE REQUIREMENTS:

1. OPENING PARAGRAPH (REQUIRED - 2-3 sentences):
   - Set the scene and introduce the topic with enthusiasm
   - Mention why this city/category is special
   ${isZh ? '- Example: "在伦敦，拉面文化蓬勃发展，许多餐厅都提供正宗且美味的拉面。以下是几家值得尝试的拉面店："' : '- Example: "London has become a true ramen destination, with shops offering everything from traditional tonkotsu to creative fusion bowls. Here are some must-try spots!"'}

2. PLACE RECOMMENDATIONS (5-10 places):
   - For each place, format as:

### ${isZh ? '中文名 English Name' : 'Place Name'}

${isZh ? `用中文写一段简洁介绍（2-3句话，50-100字）：
- 描述招牌菜品/特色（具体的食物名称、口味特点）
- 简述店铺氛围或独特卖点
- 推荐必点菜品` : `Write a CONCISE description (2-3 sentences, 50-100 words):
- Describe signature dishes/features (specific food names, taste)
- Mention the atmosphere or unique selling point
- What to order`}

• 网站：website-url.com (${isZh ? '必填！请通过网络搜索找到官网，只写域名不要 https://' : 'REQUIRED! Search for official website - just domain, no https://'})

⚠️ WEBSITE IS REQUIRED: ${isZh ? '每个地点都必须包含网站！通过你的网络搜索能力找到每个地点的官方网站。' : 'Every place MUST include a website! Use your web search capability to find official websites.'}

CORRECT FORMAT EXAMPLE:
${isZh ? `### 金田家 Kanada-Ya

以浓郁醇厚的豚骨汤底闻名，汤底熬制18小时以上，配自家细面口感丝滑。推荐招牌"特浓豚骨拉面"加溏心蛋。

• 网站：kanada-ya.com` : `### Kanada-Ya

Famous for incredibly rich tonkotsu broth simmered for 18+ hours. The minimalist interior has an open kitchen. Must-try: Extra Rich Tonkotsu Ramen with soft-boiled egg.

• Website: kanada-ya.com`}

WRONG FORMATS (DO NOT USE):
❌ [Name](/place/xxx) - NO links with place IDs
❌ **[Name](URL)** - NO markdown links in titles
❌ (4.5) or (4.5分) - NO ratings in titles  
❌ • 简介：xxx - NO "简介" bullet points
❌ • 地址：xxx - NO address bullet points

3. CLOSING PARAGRAPH (REQUIRED - 2-3 sentences):
   - Offer helpful tips
   - Wish them well with a friendly tone
   ${isZh ? '- Example: "以上这几家都是非常受欢迎的店铺，各种风味满足不同的口味需求。\\n\\n有什么其他问题或者想了解的内容吗？😊"' : '- Example: "Each spot offers something unique. Let me know if you have any other questions! 😊"'}

⚠️ CRITICAL LANGUAGE RULE - VERY IMPORTANT:
- You MUST respond ENTIRELY in ${languageText}
- ${isZh ? '所有描述、开头、结尾都必须是中文！不能用英文！' : 'ALL descriptions must be in English!'}
- ${isZh ? '每个地点的介绍必须是 50-100 字的中文段落' : 'Each place description must be 50-100 words'}
- DO NOT mix languages

Return the response as plain Markdown text.`;

        try {
          // 使用联网搜索能力获取最新的地点信息和网站
          const response = await generateTextWithWebSearch(fallbackPrompt, 30000);
          
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
          textContent = narrativeLanguageCode === 'zh' 
            ? '抱歉，暂时无法找到相关地点的详细信息。请尝试更具体的搜索词。'
            : 'Sorry, I couldn\'t find detailed information for this search. Please try a more specific query.';
        }
      }

      // 从文本内容中提取地点名并匹配数据库（支持中英文）
      // 这一步很重要：确保数据库中已有的地点能被匹配到并添加到 places 数组
      let mentioned: MentionedPlaceLite[] = [];
      if (textContent) {
        mentioned = await extractMentionedPlacesFromText(
          textContent,
          narrativeLanguageCode,
          parsedQuery,
        );
        if (mentioned.length > 0) {
          // Pass original query to filter matched places by category relevance
          // text-only 模式不要求有图片（requireImage: false）
          matchedTextPlaces = await matchMentionedPlacesFromDB(
            mentioned,
            parsedQuery,
            narrativeLanguageCode,
            query, // Original query for category filtering
            false, // requireImage: false - 允许匹配无图片的地点
          );
          logger.info(`[SearchV2] Extracted ${mentioned.length} places from text, matched ${matchedTextPlaces.length} from DB`);
        }
      }
      
      // 🔧 对于未匹配到数据库的地点，创建基本的 PlaceResult 以便前端显示
      const matchedNames = new Set(matchedTextPlaces.map(p => p.name.toLowerCase().trim()));
      const unmatchedMentioned: PlaceResult[] = [];
      for (const m of mentioned) {
        const mNameLower = m.name.toLowerCase().trim();
        if (!matchedNames.has(mNameLower)) {
          // 创建基本的 PlaceResult，后续会通过地理编码获取坐标
          const basePlace: PlaceResult = {
            id: generateStablePlaceId(m.name, m.city || parsedQuery.city || '', 0, 0),
            name: m.name,
            summary: '', // 无 summary
            coverImage: '',
            images: [],
            latitude: 0,
            longitude: 0,
            city: m.city || parsedQuery.city || '',
            country: m.country || parsedQuery.country || '',
            rating: null,
            ratingCount: null,
            tags: [],
            isVerified: false,
            source: 'ai', // 来自 AI 推荐
            recommendationPhrase: '',
            address: undefined,
            phoneNumber: undefined,
            website: undefined,
            openingHours: undefined,
          };
          unmatchedMentioned.push(basePlace);
          logger.info(`[SearchV2] Created unmatched place from text: "${m.name}" (will geocode)`);
        }
      }
      
      // 为文本中提到的地点获取评分（通过 AI 联网搜索）
      // 规则：已匹配 >= 3 则未匹配仅文本展示；已匹配 < 3 则未匹配联网补全并可点进详情
      const matchedCount = matchedTextPlaces.length;
      const shouldEnrichUnmatched = matchedCount < 3;
      const unmatchedCandidates = [...textOnlyPlaces, ...unmatchedMentioned];
      let allTextPlaces = [...matchedTextPlaces];

      if (shouldEnrichUnmatched && unmatchedCandidates.length > 0) {
        // 启用联网搜索，获取完整的地点信息（评分、地址、网站等）
        logger.info(`[SearchV2] Matched ${matchedCount} (<3). Enriching ${unmatchedCandidates.length} unmatched places...`);
        const persistedPlaces = await persistAIPlacesToDB(
          unmatchedCandidates,
          parsedQuery.city || '',
          parsedQuery.country || '',
          narrativeLanguageCode,
          parsedQuery.category || '',
          { skipWebSearch: false }, // 启用联网搜索获取评分等信息
        );

        // 只添加不在 matchedTextPlaces 中的地点
        const matchedNameSet = new Set(matchedTextPlaces.map(p => p.name.toLowerCase().trim()));
        for (const p of persistedPlaces) {
          if (!matchedNameSet.has(p.name.toLowerCase().trim())) {
            allTextPlaces.push(p);
          }
        }
      } else {
        logger.info(`[SearchV2] Matched ${matchedCount} (>=3). Skipping enrichment for unmatched places (text-only display).`);
      }
      
      // 为缺失坐标的地点进行地理编码
      if (allTextPlaces.length > 0) {
        logger.info(`[SearchV2] Geocoding ${allTextPlaces.length} places with missing coordinates...`);
        await geocodePlacesMissingCoordinates(allTextPlaces, parsedQuery.city, narrativeLanguageCode);
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
      
      // 不再在文本中添加 /place/uuid 链接
      // Flutter 端会通过 _buildClickableHeader 根据地点名匹配使标题可点击
      // 只需要清理可能存在的错误格式
      let linkedTextContent = textContent;
      
      const placesForTextCleanup = shouldEnrichUnmatched
        ? allTextPlaces
        : [...matchedTextPlaces, ...unmatchedMentioned, ...textOnlyPlaces];
      logger.info(`[SearchV2] Cleaning text content, ${placesForTextCleanup.length} places available for name matching`);
      
      // 清理可能存在的错误格式
      for (const place of placesForTextCleanup) {
        if (place.name) {
          const escapedName = place.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          
          // 1. 移除简介行中的伪链接格式 [Name](rating) 
          // 这种格式不是真正的链接，而是 AI 错误生成的
          const fakeIntroLinkPattern = new RegExp(`(简介[：:])\\s*\\[${escapedName}[^\\]]*\\]\\(\\d+\\.?\\d*\\)`, 'gi');
          linkedTextContent = linkedTextContent.replace(fakeIntroLinkPattern, (match, prefix) => {
            logger.info(`[SearchV2] Removed fake intro link: "${match}"`);
            return `${prefix}${place.name}`;
          });
          
          // 2. 移除可能存在的 /place/ 链接格式（不应该出现，但为安全起见清理）
          const placeLinkPattern = new RegExp(`\\[${escapedName}[^\\]]*\\]\\(/place/[^)]+\\)`, 'gi');
          linkedTextContent = linkedTextContent.replace(placeLinkPattern, (match) => {
            logger.info(`[SearchV2] Removed place link: "${match}"`);
            return place.name;
          });
          
          // 3. 移除标题中的评分（Flutter 端会自动添加评分）
          // 匹配 ### Name (4.5) 或 ### Name (4.5分) 格式
          const titleRatingPattern = new RegExp(`^(###\\s+${escapedName})\\s*\\([^)]*分?\\)\\s*$`, 'gim');
          linkedTextContent = linkedTextContent.replace(titleRatingPattern, '$1');
        }
      }
      
      logger.info(`[SearchV2] Link replacement completed`);
      
      const duration = Date.now() - startTime;
      logger.info(`[SearchV2] Completed (text-only) in ${duration}ms`);
      
      // 筛选出有有效坐标的地点用于地图显示
      const validMapPlaces = allTextPlaces.filter(p => 
        p.latitude && p.longitude && 
        Math.abs(p.latitude) > 0.0001 && Math.abs(p.longitude) > 0.0001
      );
      logger.info(`[SearchV2] Text-only mapPlaces: ${validMapPlaces.length}/${allTextPlaces.length} have valid coordinates`);
      
      return res.json({
        success: true,
        intent: 'general_search_text', // 新的 intent 类型，表示文本格式
        textContent: linkedTextContent, // 带链接的文本
        acknowledgment: acknowledgment || '',
        places: allTextPlaces, // 合并后的地点列表（包含评分）
        textOnlyPlaces: [], // 已合并到 places，清空避免重复
        mapPlaces: validMapPlaces.length > 0 ? validMapPlaces : undefined, // 使用所有有有效坐标的地点
        overallSummary: '',
        quotaRemaining,
        stage: 'complete',
        translationStatus,
        translatedQuery,
      });
    }

    // ========== 第五步：为地点生成分类（如果地点数 >= 6） ==========
    // 修复：无论缓存是否充足，当地点数 >= 6 时都应生成分类以保持中英文一致性
    let finalCategories: CategoryGroup[] = [];
    if (finalPlaces.length >= 6) {
      logger.info(`[SearchV2] Step 5: Generating categories for ${finalPlaces.length} places (cacheSufficient=${cacheSufficient})...`);
      
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
6. Response in ${matchLanguage === 'zh' ? 'Chinese' : 'English'}

Return JSON only:
{
  "categories": [
    { "title": "🖼️ Category Name", "placeNames": ["Place 1", "Place 2", "Place 3"] }
  ]
}`;

      try {
        const categoryResponse = await generateTextWithFallback(categoryPrompt, 15000);
        
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
                    title: matchLanguage === 'zh' ? '🍽️ 更多推荐' : '🍽️ More Picks', 
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

      // Fallback: if AI categorization fails or returns too few categories, create a simple split.
      // This keeps the "return >5 and show categories" behavior even when AI is slow/unavailable.
      if (finalCategories.length < CONFIG.MIN_CATEGORIES) {
        const sorted = [...finalPlaces].sort((a, b) => {
          const scoreA = calculateWeightedScore(a.rating, a.ratingCount);
          const scoreB = calculateWeightedScore(b.rating, b.ratingCount);
          return scoreB - scoreA;
        });

        const topN = Math.min(5, sorted.length);
        const top = sorted.slice(0, topN);
        const rest = sorted.slice(topN);

        const topTitle = narrativeLanguageCode === 'zh' ? '🏆 精选推荐' : '🏆 Top Picks';
        const moreTitle = narrativeLanguageCode === 'zh' ? '🍽️ 更多推荐' : '🍽️ More Picks';

        // Only emit categories if we can create at least two meaningful groups.
        if (top.length >= 3 && rest.length >= 3) {
          finalCategories = [
            { title: topTitle, places: top },
            { title: moreTitle, places: rest },
          ];
          logger.info(`[SearchV2] Fallback categories created: ${finalCategories.length}`);
        }
      }
    }

    // ========== 第六步：合并 AI 调用：acknowledgment + overallSummary + place summaries ==========
    // 优化：使用 generateCombinedTexts 一次性生成所有文案，减少 AI 调用次数
    const placesWithMissingSummary = finalPlaces.filter(p => 
      !p.summary || !p.summary.trim() || isLikelyFallbackSummary(p.summary, summaryLanguageCode)
    );
    const needsAISummaries = finalPlaces.length > 0 && placesWithMissingSummary.length > 0;
    const needsAckOrSummary = !acknowledgment || acknowledgment.trim().length < 50 || !overallSummary || overallSummary.length < 30;

    // 使用合并调用：同时生成 acknowledgment + overallSummary + place summaries
    if (needsAISummaries || needsAckOrSummary) {
      logger.info(`[SearchV2] Step 6: Combined AI call (needsSummaries=${needsAISummaries}, needsAck=${needsAckOrSummary})`);
      
      // 先尝试使用之前启动的异步任务
      let aiSummaries = new Map<string, string>();
      if (aiSummaryPromise) {
        try {
          aiSummaries = await aiSummaryPromise;
          logger.info(`[SearchV2] Got ${aiSummaries.size} pre-generated summaries`);
        } catch (error) {
          logger.warn(`[SearchV2] Failed to get pre-generated summaries: ${error}`);
        }
      }
      
      // 找出仍然缺少 summary 的地点
      const placesNeedingSummary = finalPlaces.filter(p => 
        !aiSummaries.has(p.id) && (!p.summary || !p.summary.trim() || isLikelyFallbackSummary(p.summary, summaryLanguageCode))
      );
      
      // 只有需要时才调用 AI（节省调用次数）
      if (placesNeedingSummary.length > 0 || needsAckOrSummary) {
        logger.info(`[SearchV2] Calling generateCombinedTexts for ${placesNeedingSummary.length} places + ack/summary`);
        
        const combinedResult = await generateCombinedTexts(
          narrativeQuery,
          placesNeedingSummary.map(p => ({
            id: p.id,
            name: p.name,
            city: p.city || parsedQuery.city || '',
            country: p.country || '',
          })),
          narrativeLanguageCode,
          parsedQuery
        );
        
        // 更新 acknowledgment 和 overallSummary
        if (needsAckOrSummary) {
          if (!acknowledgment || acknowledgment.trim().length < 50) {
            acknowledgment = combinedResult.acknowledgment;
          }
          if (!overallSummary || overallSummary.length < 30) {
            overallSummary = combinedResult.overallSummary;
          }
        }
        
        // 合并 place summaries
        for (const [id, summary] of combinedResult.placeSummaries) {
          aiSummaries.set(id, summary);
        }
      }

      // 应用所有 summary
      // 🔧 修改：如果数据库中已有描述但语言不匹配，使用 AI 生成的 summary
      logger.info(`[SearchV2] aiSummaries has ${aiSummaries.size} entries: ${[...aiSummaries.keys()].join(', ')}`);
      for (const place of finalPlaces) {
        const existingSummary = (place.summary || '').trim();
        const aiSummary = aiSummaries.get(place.id);
        
        // 检查现有 summary 是否语言匹配
        if (existingSummary && isTextInTargetLanguage(existingSummary, summaryLanguageCode)) {
          logger.info(`[SearchV2] Keeping existing summary for "${place.name}" (id=${place.id})`);
          continue;
        }
        
        // 现有 summary 语言不匹配或为空，使用 AI 生成的
        if (aiSummary && aiSummary.trim()) {
          place.summary = aiSummary.trim();
          logger.info(`[SearchV2] Applied AI summary to finalPlace "${place.name}" (id=${place.id}, reason: ${existingSummary ? 'language mismatch' : 'no existing'})`);
          continue;
        }
        
        // 如果还有现有 summary（虽然语言不对），至少保留它
        if (existingSummary) {
          logger.info(`[SearchV2] Keeping mismatched-language summary for "${place.name}" (no AI alternative)`);
        }
      }

      // 同时更新 categories 中的地点
      logger.info(`[SearchV2] Updating ${finalCategories.length} categories with summaries`);
      for (const cat of finalCategories) {
        for (const p of cat.places) {
          const existingSummary = (p.summary || '').trim();
          const aiSummary = aiSummaries.get(p.id);
          
          // 检查现有 summary 是否语言匹配
          if (existingSummary && isTextInTargetLanguage(existingSummary, summaryLanguageCode)) {
            logger.info(`[SearchV2] Keeping existing summary for category place "${p.name}" (id=${p.id})`);
            continue;
          }
          
          // 现有 summary 语言不匹配或为空，使用 AI 生成的
          if (aiSummary && aiSummary.trim()) {
            p.summary = aiSummary.trim();
            logger.info(`[SearchV2] Applied AI summary to category place "${p.name}" (id=${p.id}, reason: ${existingSummary ? 'language mismatch' : 'no existing'})`);
          } else {
            logger.info(`[SearchV2] No summary for category place "${p.name}" (id=${p.id}, hasAI=${!!aiSummary})`);
          }
        }
      }
    }

    // Use AI recommendation summaries as a secondary AI source (still from Kouri) when per-place summaries are missing.
    const aiSummaryByName = new Map<string, string>();
    if (aiRecommendations && aiRecommendations.places.length > 0) {
      for (const p of aiRecommendations.places) {
        const key = (p?.name || '').toLowerCase().trim();
        const summary = (p?.summary || '').trim();
        if (key && summary && !aiSummaryByName.has(key)) aiSummaryByName.set(key, summary);
      }
    }

    // ========== 第七步：生成 overallSummary（结束语） ==========
    // 优化：只在非缓存充足且非中文搜索时生成，减少 AI 调用
    // 进一步优化：完全跳过 overallSummary 生成，因为它不是关键功能
    if (false && !cacheSufficient && !isChineseQuery && finalPlaces.length > 0) {
      const placeNames = finalPlaces.slice(0, 8).map(p => p.name).join(', ');
      const overallPrompt = `Write a short closing summary for this recommendation list.

User search: "${narrativeQuery}"
Example places: ${placeNames}

Requirements:
- 1-2 sentences only
- Friendly tone
- Output language: ${narrativeLanguage === 'zh' ? 'Chinese' : 'English'}

Return plain text only.`;

      try {
        const overallResponse = await generateTextWithFallback(overallPrompt, 12000);
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
        const key = place.name.toLowerCase().trim();
        place.summary = aiSummaryByName.get(key) || buildFallbackPlaceSummary(place, parsedQuery, summaryLanguageCode);
      }
    }
    for (const cat of finalCategories) {
      for (const p of cat.places) {
        if (!p.summary || !p.summary.trim()) {
          const key = p.name.toLowerCase().trim();
          p.summary = aiSummaryByName.get(key) || buildFallbackPlaceSummary(p, parsedQuery, summaryLanguageCode);
        }
      }
    }

    // 注意：摘要翻译和 acknowledgment+summary 已在第六步的合并调用中完成
    // 不再需要单独的 generateAcknowledgmentAndSummary 调用
    
    // 确保 acknowledgment 被规范化（如果已有的话）
    acknowledgment = normalizeAcknowledgment(acknowledgment || '', 50, 250);

    // ========== 排序：综合评分和评价人数，评价人数权重更高 ==========
    // 评分 4.7 + 147K 评价 应该排在 评分 5.0 + 1 评价 前面
    const score = (p: PlaceResult) => {
      const rating = typeof p.rating === 'number' ? p.rating : 0;
      const count = typeof p.ratingCount === 'number' ? p.ratingCount : 0;
      // 评价人数权重更高：log10(count+1) * 10 + rating
      const countScore = count > 0 ? Math.log10(count + 1) * 10 : 0;
      return countScore + rating;
    };

    const comparePlaces = (a: PlaceResult, b: PlaceResult) => {
      const rankA = aiMatchedRankById.get(a.id);
      const rankB = aiMatchedRankById.get(b.id);
      const bucketA = rankA === undefined ? 1 : 0;
      const bucketB = rankB === undefined ? 1 : 0;
      if (bucketA !== bucketB) return bucketA - bucketB;
      if (rankA !== undefined && rankB !== undefined && rankA !== rankB) return rankA - rankB;
      return score(b) - score(a);
    };

    finalPlaces.sort(comparePlaces);
    for (const cat of finalCategories) {
      cat.places.sort(comparePlaces);
    }

    // ========== Geocoding：对没有坐标的地点进行地址反查 ==========
    await geocodePlacesMissingCoordinates(finalPlaces, parsedQuery.city, narrativeLanguage);
    // 同时处理 textOnlyPlaces
    if (textOnlyPlaces.length > 0) {
      await geocodePlacesMissingCoordinates(textOnlyPlaces, parsedQuery.city, narrativeLanguage);
    }

    // ========== 补充文本：当结果不足时，用 AI 生成补充推荐 ==========
    // 🔧 修改：用户明确指定数量时，不补充；只有默认搜索且少于 5 条时才补充
    let supplementText = '';
    const actualCount = finalPlaces.length;
    // 如果用户明确指定了数量，不需要补充；只有非明确指定且少于 5 条时才补充
    const needSupplement = !parsedQuery.explicitCount && actualCount > 0 && actualCount < 5;
    if (needSupplement) {
      const shortfall = 5 - actualCount;
      logger.info(`[SearchV2] Results shortage: got ${actualCount}, need 5, generating ${shortfall} text supplements`);
      
      // 收集已返回的地点名称，避免重复推荐
      const existingNames = new Set(finalPlaces.map(p => p.name.toLowerCase()));
      
      // 从 textOnlyPlaces 或 AI 推荐中找到尚未出现的地点
      const supplementPlaces: AIPlace[] = [];
      
      // 优先使用 textOnlyPlaces
      for (const tp of textOnlyPlaces) {
        if (supplementPlaces.length >= shortfall) break;
        if (!existingNames.has(tp.name.toLowerCase())) {
          supplementPlaces.push({
            name: tp.name,
            summary: tp.summary || '',
            latitude: tp.latitude || 0,
            longitude: tp.longitude || 0,
            city: tp.city || parsedQuery.city || '',
            country: tp.country || '',
            coverImageUrl: tp.coverImage || '',
            tags: tp.tags || [],
            recommendationPhrase: '',
          });
          existingNames.add(tp.name.toLowerCase());
        }
      }
      
      // 如果 textOnlyPlaces 不够，再从 AI 推荐中补充
      if (supplementPlaces.length < shortfall && aiRecommendations) {
        for (const aiPlace of aiRecommendations.places) {
          if (supplementPlaces.length >= shortfall) break;
          if (!existingNames.has(aiPlace.name.toLowerCase())) {
            supplementPlaces.push(aiPlace);
            existingNames.add(aiPlace.name.toLowerCase());
          }
        }
      }
      
      if (supplementPlaces.length > 0) {
        logger.info(`[SearchV2] Generating supplement text for ${supplementPlaces.length} additional places`);
        supplementText = await generateTextOnlyResponse(
          supplementPlaces,
          narrativeQuery,
          narrativeLanguageCode
        );
        
        // 添加分隔标题（不使用---分隔线）
        if (supplementText) {
          const headerText = narrativeLanguageCode === 'zh' 
            ? `\n\n### 📍 更多推荐\n\n以下是更多符合你搜索条件的地点（暂无封面图片）：\n\n`
            : `\n\n### 📍 More Recommendations\n\nHere are more places matching your search (no cover images available):\n\n`;
          supplementText = headerText + supplementText;
        }
      }
    }

    // ========== Map places：合并所有有坐标的地点用于地图展示 ==========
    // 包括有图片的 finalPlaces 和有坐标的 textOnlyPlaces
    let mapPlaces: PlaceResult[] = [];
    
    // 为 textOnlyPlaces 补充评分数据（如果有的话）
    if (textOnlyPlaces.length > 0) {
      const aiPlacesNeedingRatings = textOnlyPlaces.filter(p => p.rating === null || p.rating === undefined);
      if (aiPlacesNeedingRatings.length > 0) {
        logger.info(`[SearchV2] Enriching ${aiPlacesNeedingRatings.length} AI places with ratings...`);
        try {
          const enrichedPlaces = await enrichPlacesWithRatings(aiPlacesNeedingRatings, parsedQuery.city || '', narrativeLanguageCode as 'en' | 'zh');
          // 用 enriched 结果更新 textOnlyPlaces 数组
          for (let i = 0; i < textOnlyPlaces.length; i++) {
            const enriched = enrichedPlaces.find(ep => ep.name.toLowerCase() === textOnlyPlaces[i].name.toLowerCase());
            if (enriched) {
              textOnlyPlaces[i] = enriched;
            }
          }
        } catch (err) {
          logger.warn(`[SearchV2] Failed to enrich AI places with ratings: ${err}`);
        }
      }
    }
    
    // 添加有图片的地点
    for (const place of finalPlaces) {
      if (place.latitude && place.longitude && 
          Math.abs(place.latitude) > 0.0001 && Math.abs(place.longitude) > 0.0001) {
        mapPlaces.push(place);
      }
    }
    
    // 添加文本补充地点（如果有坐标）
    const existingMapIds = new Set(mapPlaces.map(p => p.id || p.name.toLowerCase()));
    for (const place of textOnlyPlaces) {
      const placeKey = place.id || place.name.toLowerCase();
      const hasValidCoords = place.latitude && place.longitude && 
          Math.abs(place.latitude) > 0.0001 && Math.abs(place.longitude) > 0.0001;
      logger.info(`[SearchV2] TextOnly place "${place.name}": lat=${place.latitude}, lon=${place.longitude}, validCoords=${hasValidCoords}`);
      if (!existingMapIds.has(placeKey) && hasValidCoords) {
        mapPlaces.push(place);
        existingMapIds.add(placeKey);
      }
    }
    
    logger.info(`[SearchV2] Map places: ${mapPlaces.length} (${finalPlaces.length} with images, ${mapPlaces.length - finalPlaces.filter(p => p.latitude && p.longitude).length} text-only with coords)`);
    
    // 🔧 如果用户指定了数量，限制最终返回的地点数量
    if (parsedQuery.explicitCount && finalPlaces.length > targetCount) {
      logger.info(`[SearchV2] User requested ${targetCount} places, limiting from ${finalPlaces.length}`);
      finalPlaces = finalPlaces.slice(0, targetCount);
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
    logger.info(`[SearchV2] Completed in ${duration}ms: ${finalPlaces.length} places`);
    logger.info(`[SearchV2] Final places: ${finalPlaces.map(p => p.name).join(', ')}`);
    
    // Debug: Log tags for each place
    for (const place of finalPlaces) {
      logger.info(`[SearchV2] Place "${place.name}" tags: ${JSON.stringify(place.tags)}`);
    }

    return res.json({
      success: true,
      intent: 'general_search',
      acknowledgment: acknowledgment || '',
      categories: finalCategories.length >= 2 ? finalCategories : undefined,
      places: finalPlaces,
      textOnlyPlaces,
      supplementText,  // AI 补充推荐文本（当卡片结果不足时）
      mapPlaces: mapPlaces.length > 0 ? mapPlaces : undefined,
      overallSummary,
      quotaRemaining,
      stage: 'complete',
      translationStatus,
      translatedQuery,
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
      translationStatus: 'failed',
      translatedQuery: '',
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
