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
  AI_TIMEOUT_MS: 90000,
  AI_SUMMARY_TIMEOUT_MS: 30000,
  DEFAULT_COUNT: 5,  // 默认返回 5 个地点（不分类时 3-5 个）
  MIN_PLACES_PER_CATEGORY: 3,
  MIN_CATEGORIES: 2,  // 至少 2 个分类
  NAME_SIMILARITY_THRESHOLD: 0.6,
  COORDINATE_THRESHOLD: 0.01,
  IMAGE_SEARCH_TIMEOUT_MS: 15000,
  MIN_PLACES_FOR_CARDS: 3, // 少于这个数量时，改用文本格式
  GEOCODE_TIMEOUT_MS: 5000, // 单个地址 geocoding 超时
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
  city?: string
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

  logger.info(`[SearchV2] Geocoding ${needsGeocode.length} places with missing coordinates...`);

  // 并行处理，限制并发数量避免被 Nominatim 限流
  const batchSize = 3;
  for (let i = 0; i < needsGeocode.length; i += batchSize) {
    const batch = needsGeocode.slice(i, i + batchSize);
    
    await Promise.all(batch.map(async (place) => {
      try {
        // 构建搜索地址：优先使用 address，否则用 name + city
        const searchAddress = place.address 
          ? place.address 
          : `${place.name}${city ? `, ${city}` : ''}${place.country ? `, ${place.country}` : ''}`;
        
        const coords = await Promise.race([
          geocodeService.forwardGeocode(searchAddress),
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

    // 批次间稍作延迟，避免 Nominatim 限流
    if (i + batchSize < needsGeocode.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
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
  'cafe': ['cafe'],
  'coffee': ['cafe'],
  'bakery': ['bakery'],
  'restaurant': ['restaurant'],
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
    return await Promise.race([
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

async function generateAcknowledgment(
  query: string,
  language: 'en' | 'zh',
  parsedQuery: ParsedQuery,
): Promise<string> {
  const languageText = language === 'zh' ? 'Chinese' : 'English';
  const cityText = parsedQuery.city?.trim() || parsedQuery.country?.trim() || (language === 'zh' ? '附近' : 'nearby');
  const categoryText = parsedQuery.category?.trim() || (language === 'zh' ? '地点' : 'places');
  const prompt = `Write a short opening acknowledgment (1-2 sentences) to introduce recommendations.

User search: "${query}"
Context: ${cityText}, ${categoryText}

Requirements:
- Output language: ${languageText}
- Must sound natural and specific to the query
- Length: 60-140 characters (count characters, not words)
- MUST explicitly mention the query topic (e.g., "东京拉面")
- Include 1-2 concrete traits (e.g.,口味/汤头/风格/人气/排队/氛围/代表性)
- No templates, no placeholders, no bullet points
- Return plain text only (no JSON, no braces)`;

  const response = await generateTextWithFallback(prompt, 8000);
  const cleaned = (response || '').replace(/```[\s\S]*?```/g, '').trim();
  if (!cleaned) return '';
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const value = typeof parsed.acknowledgment === 'string' ? parsed.acknowledgment.trim() : '';
      return normalizeAcknowledgment(value || cleaned.replace(/^[\s\S]*\}/, '').trim(), 50, 140);
    } catch (_) {
      return normalizeAcknowledgment(cleaned.replace(/^[\s\S]*\}/, '').trim(), 50, 140);
    }
  }
  return normalizeAcknowledgment(cleaned, 50, 140);
}

async function generateOverallSummaryText(
  query: string,
  places: PlaceResult[],
  language: 'en' | 'zh',
): Promise<string> {
  if (places.length === 0) return '';
  const languageText = language === 'zh' ? 'Chinese' : 'English';
  const placeNames = places.slice(0, 8).map(p => p.name).join(', ');
  const prompt = `Write a short closing summary for this recommendation list.

User search: "${query}"
Example places: ${placeNames}

Requirements:
- 1-2 sentences only
- Friendly, warm tone with a bit of human touch
- Encourage the user to ask follow-up questions or refine preferences
- Output language: ${languageText}
- Return plain text only (no JSON, no braces)`;

  const response = await generateTextWithFallback(prompt, 12000);
  const cleaned = (response || '').replace(/```[\s\S]*?```/g, '').trim();
  if (!cleaned) return '';
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const value = typeof parsed.summary === 'string'
        ? parsed.summary.trim()
        : (typeof parsed.overallSummary === 'string' ? parsed.overallSummary.trim() : '');
      return sanitizePlainTextOutput(value || cleaned.replace(/^[\s\S]*\}/, '').trim());
    } catch (_) {
      return sanitizePlainTextOutput(cleaned.replace(/^[\s\S]*\}/, '').trim());
    }
  }
  return sanitizePlainTextOutput(cleaned);
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
async function generateAISummariesForPlaces(
  places: Array<{ id: string; name: string; city: string; country?: string; latitude?: number; longitude?: number }>,
  parsedQuery: ParsedQuery,
  language: string
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (places.length === 0) return result;

  // Batch to keep prompts small and responses fast/reliable.
  const batchSize = 6;
  for (let i = 0; i < places.length; i += batchSize) {
    const batch = places.slice(i, i + batchSize);

    const summaryPrompt = `Write a brief 1-sentence summary for each place.

User search: "${parsedQuery.originalQuery}"
City context: ${parsedQuery.city || 'various cities'}

CRITICAL:
- Output language: ${language === 'zh' ? 'Chinese' : 'English'}
- Each summary MUST be exactly 1 sentence.
- Keep it vivid and specific (what it's known for / what the experience feels like).
- Do NOT include ratings or review counts.
- Do NOT mention the address, city, or country.
- Do NOT change IDs. Return the same id you were given.
- Return JSON only. No markdown, no extra text.

Places JSON:
${JSON.stringify(batch)}

Return JSON only:
{
  "summaries": [
    { "id": "<same id>", "summary": "<one sentence, under 120 characters>" }
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
    logger.info(`[SearchV2] AI generated ${result.size} summaries`);
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

function isLikelyFallbackSummary(summary: string, language: string): boolean {
  const s = (summary || '').trim();
  if (!s) return false;

  if (language === 'zh') {
    return false;
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
    [/酒店|饭店/gi, 'hotel'],
    [/甜品店|甜点店/gi, 'dessert shop'],
    [/甜品|甜点/gi, 'dessert'],
    [/烘焙|面包店|麵包店/gi, 'bakery'],
    [/寿司店|壽司店/gi, 'sushi restaurant'],
    [/寿司|壽司/gi, 'sushi'],
    [/烧烤|燒烤/gi, 'BBQ'],
    [/火锅|火鍋/gi, 'hotpot'],
    // 景点类别
    [/博物馆|博物館/gi, 'museum'],
    [/美术馆|美術館|画廊/gi, 'art gallery'],
    [/公园|公園/gi, 'park'],
    [/神社/gi, 'shrine'],
    [/寺庙|寺廟/gi, 'temple'],
    [/教堂/gi, 'church'],
    [/城堡/gi, 'castle'],
    [/塔/gi, 'tower'],
    // 形容词
    [/最好|最佳/gi, 'best'],
    [/好吃/gi, 'delicious'],
    [/推荐|推薦/gi, 'recommended'],
    [/网红|網紅/gi, 'popular'],
    [/打卡/gi, 'must visit'],
  ];

  for (const [pattern, value] of replacements) {
    result = result.replace(pattern, ` ${value} `);
  }

  result = result
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
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
- Return up to 8 places
- If a city is clearly mentioned, include it
- Return JSON only, no extra text

Return JSON:
{
  "places": [
    { "name": "Place Name", "city": "City" }
  ]
}`;

  try {
    const response = await generateJsonTextWithFallback(prompt, 12000);
    if (!response) return [];
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);
    const items = Array.isArray(parsed.places) ? parsed.places : [];
    const results: MentionedPlaceLite[] = [];
    for (const item of items) {
      const name = typeof item?.name === 'string' ? item.name.trim() : '';
      if (!name) continue;
      const city = typeof item?.city === 'string' ? item.city.trim() : undefined;
      const country = typeof item?.country === 'string' ? item.country.trim() : undefined;
      results.push({ name, city, country });
    }
    return results.slice(0, 8);
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

      const exactConditions: any[] = [
        { coverImage: { not: null } },
        { coverImage: { not: '' } },
        { name: { equals: term, mode: 'insensitive' as const } },
      ];
      if (city) {
        exactConditions.unshift(buildCityCondition(city));
      }
      if (country) {
        exactConditions.unshift(buildCountryCondition(country));
      }

      const exactMatch = await prisma.place.findFirst({
        where: { AND: exactConditions },
      });
      if (exactMatch) {
        matched = exactMatch;
        bestScore = 1;
        break;
      }

      const conditions: any[] = [
        { coverImage: { not: null } },
        { coverImage: { not: '' } },
        { name: { contains: term, mode: 'insensitive' as const } },
      ];

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
      tags: buildDisplayTags(matched.categoryEn, matched.aiTags, language, matched.tags as Record<string, string[]> | null),
      isVerified: hasRating || matched.isVerified || false,
      source: 'cache',
      address: matched.address || undefined,
      phoneNumber: matched.phoneNumber || undefined,
      website: matched.website || undefined,
      openingHours: matched.openingHours || undefined,
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

function parseQuery(query: string, options: { allowChinese?: boolean } = {}): ParsedQuery {
  const result: ParsedQuery = {
    count: CONFIG.DEFAULT_COUNT,
    category: '',
    city: '',
    country: '',
    originalQuery: query,
    explicitCount: false,
  };
  const allowChinese = options.allowChinese ?? true;

  // Count parsing:
  // - English: "8 restaurants", "top 8 cafes"
  // - Chinese: "8个", "8家", "8間", "8处/8處"
  // Keep it conservative to avoid accidentally treating years/addresses as counts.
  const countPatterns: RegExp[] = [
    /(?:^|\s)(\d{1,2})\s+(?:(?:best|top)\s+)?(?:places?|spots?|restaurants?|cafes?|museums?|bars?|hotels?|shops?)\b/i,
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
  
  logger.info(`[SearchV2] Parsed query: count=${result.count}, category="${result.category}", city="${result.city}", country="${result.country}", tags=${JSON.stringify(result.tags || [])}`);
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

  const buildNameSearchTerms = (name: string): string[] => {
    const trimmed = (name || '').trim();
    if (!trimmed) return [];
    const lower = trimmed.toLowerCase();
    const tokens = lower
      .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);

    const terms = new Set<string>();
    terms.add(trimmed);
    if (tokens.length > 0) terms.add(tokens[0]);

    // Minimal alias dictionary for high-signal chains that are commonly stored in Japanese/Chinese.
    if (tokens.some(t => t === 'ichiran' || t.includes('ichiran'))) {
      terms.add('ichiran');
      terms.add('一蘭');
      terms.add('一兰');
    }

    return Array.from(terms).filter(t => t && t.trim().length >= 2).slice(0, 8);
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
    
    // 收集候选（先严格：名称相似 + 位置接近；再放宽：同城/同国 + 名称很相似）
    const strictCandidates: { candidate: any; score: number }[] = [];
    const relaxedCandidates: { candidate: any; score: number }[] = [];
    
    for (const candidate of candidates) {
      let nameSimilarity = calculateNameSimilarity(aiPlace.name, candidate.name);
      const latDiff = Math.abs(aiPlace.latitude - candidate.latitude);
      const lngDiff = Math.abs(aiPlace.longitude - candidate.longitude);
      const isNearby = latDiff < CONFIG.COORDINATE_THRESHOLD && lngDiff < CONFIG.COORDINATE_THRESHOLD;

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
      
      if (nameSimilarity >= CONFIG.NAME_SIMILARITY_THRESHOLD && isNearby) {
        const score = nameSimilarity + (1 - (latDiff + lngDiff) / CONFIG.COORDINATE_THRESHOLD);
        strictCandidates.push({ candidate, score });
        continue;
      }

      // Relaxed matching for chains / ambiguous queries: if AI's coordinates are not close to a
      // specific branch, allow a strong name match within the same city or country.
      // Example: "Ichiran" -> "ICHIRAN Shibuya" (same country, different coordinates).
      if ((isSameCity || isSameCountry) && (nameSimilarity >= 0.72 || hasTokenOverlap)) {
        // Score favors stronger name match, then higher rating count if present.
        const ratingCount = typeof candidate.ratingCount === 'number' ? candidate.ratingCount : 0;
        const score = Math.max(nameSimilarity, hasTokenOverlap ? 0.68 : 0) * 2 + Math.log10(ratingCount + 1) * 0.15;
        relaxedCandidates.push({ candidate, score });
        continue;
      }

      // If the AI place doesn't include a city (or it's ambiguous), still allow a very strong
      // name similarity match. This is a fallback to prefer real DB places with images.
      if (!aiCity && nameSimilarity >= 0.85) {
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
  country: string,
  category: string,
  excludeIds: string[],
  limit: number,
  excludeNames: string[] = []
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
  const categoryCondition = categoryValues.length > 0
    ? {
        OR: [
          { categorySlug: { in: categoryValues } },
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
    
    // 多取一些数据，然后按加权评分排序
    const rawPlaces = await prisma.place.findMany({
      where: { AND: whereConditions },
      take: limit * 3, // 多取3倍数据用于筛选
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
    
    // 随机打乱数组（Fisher-Yates shuffle）- 在排序后的基础上轻微打乱
    // For ramen intent, keep deterministic ordering to preserve relevance.
    const shuffled = ramenCategoryIntent ? [...sortedPlaces] : [...sortedPlaces];
    if (!ramenCategoryIntent) {
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
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
    if (parsedQuery.country && parsedQuery.country.trim()) {
      nameMatchConditions.push(buildCountryCondition(parsedQuery.country.trim()));
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
      const cityVariants = getCityVariants(parsedQuery.city.trim()) || [parsedQuery.city.trim()];
      andConditions.push({ OR: cityVariants.map(c => ({ city: { equals: c, mode: 'insensitive' as const } })) });
    }
    if (parsedQuery.country && parsedQuery.country.trim()) {
      andConditions.push(buildCountryCondition(parsedQuery.country.trim()));
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

    // 添加 tags 搜索条件（如 architecture, beach 等标签关键词）
    if (parsedQuery.tags && parsedQuery.tags.length > 0) {
      andConditions.push({
        OR: [
          ...parsedQuery.tags.map(t => ({ tags: { string_contains: t } })),
          ...parsedQuery.tags.map(t => ({ aiTags: { string_contains: t } })),
          // 也在描述中搜索这些标签关键词
          ...parsedQuery.tags.map(t => ({ description: { contains: t, mode: 'insensitive' as const } })),
          ...parsedQuery.tags.map(t => ({ aiDescription: { contains: t, mode: 'insensitive' as const } })),
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
          // 搜索 tags JSON 字段（如 { "style": ["Brutalist", "Modernist"] }）
          ...tokens.map(t => ({ tags: { string_contains: t } })),
          // 搜索 aiTags JSON 字段（如 [{ "en": "Pritzker", "zh": "普利兹克" }]）
          ...tokens.map(t => ({ aiTags: { string_contains: t } })),
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
  
  const isZh = language === 'zh';
  const languageText = isZh ? 'Chinese (简体中文)' : 'English';
  
  // 限制地点数量，最多15个
  const maxPlaces = Math.min(aiPlaces.length, 15);
  const selectedPlaces = aiPlaces.slice(0, maxPlaces);
  
  // 判断是否需要分类（超过6个地点）
  const needCategories = selectedPlaces.length > 6;
  
  const placeList = selectedPlaces.map(p => `- ${p.name} (${p.city || 'unknown city'})`).join('\n');
  
  const categoryInstructions = needCategories ? `
CATEGORIZATION (REQUIRED - you have ${selectedPlaces.length} places):
- Group places into 2-3 categories based on their characteristics
- Each category should have a descriptive emoji title like "🍜 经典拉面名店" or "🌟 人气新锐店铺"
- Format each category as:
  
  ## 🍜 Category Title
  
  Then list places under that category
` : '';

  const prompt = `Based on the user's search "${query}", write a comprehensive and helpful response about these places.

USE WEB SEARCH to find accurate information about each place including:
- Opening hours / business hours
- Address / location details  
- What makes it special

Places to cover:
${placeList}

STRUCTURE REQUIREMENTS:

1. OPENING PARAGRAPH (REQUIRED):
   - Write 2-3 sentences introducing the topic
   - Acknowledge what the user is looking for
   - Set expectations about what you'll recommend
   ${isZh ? '- Example: "在伦敦寻找正宗的拉面店？这座城市拥有众多优质的日式拉面馆，从博多风味到味噌拉面应有尽有。以下是我为你精选的几家值得一试的店铺。"' : '- Example: "Looking for authentic ramen in London? The city boasts numerous quality Japanese ramen shops..."'}

${categoryInstructions}

2. FOR EACH PLACE (2-3 lines each):
   **Place Name**
   - Line 1: What makes it special / signature dishes / atmosphere (1-2 sentences)
   - Line 2: Address and opening hours (use web search to find accurate info)
   ${isZh ? '- Example:\n   **Bone Daddies**\n   以浓郁的豚骨汤底闻名，招牌拉面配上软嫩的叉烧肉，是伦敦最受欢迎的拉面店之一。\n   📍 Soho区 Peter Street 31号 | ⏰ 周一至周日 11:30-22:00' : ''}

3. CLOSING PARAGRAPH (REQUIRED):
   - Write 2-3 sentences as a friendly conclusion
   - Offer helpful tips or suggestions
   - Wish them well
   ${isZh ? '- Example: "以上推荐的拉面店各有特色，建议避开用餐高峰期前往，能获得更好的用餐体验。祝你在伦敦找到心仪的那碗拉面！"' : '- Example: "Each of these ramen shops offers something unique. I recommend visiting during off-peak hours for the best experience. Enjoy your ramen adventure!"'}

CRITICAL LANGUAGE RULE:
- You MUST respond ENTIRELY in ${languageText}
- ALL text including place descriptions, opening/closing paragraphs, category titles - EVERYTHING must be in ${languageText}
- Place names can keep their original names but descriptions MUST be in ${languageText}
- DO NOT use any other language

Return the response as plain Markdown text (not JSON).`;

  try {
    const response = await generateTextWithFallback(prompt, 45000);
    
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
  
  // 开头
  if (isZh) {
    fallbackLines.push(`关于"${query}"，以下是一些值得推荐的地点：`);
  } else {
    fallbackLines.push(`Here are some recommended places for "${query}":`);
  }
  fallbackLines.push('');
  
  for (const place of selectedPlaces) {
    fallbackLines.push(`**${place.name}**`);
    fallbackLines.push(place.summary || (isZh ? `位于${place.city || '当地'}的知名地点。` : `A notable place in ${place.city || 'this area'}.`));
    fallbackLines.push('');
  }
  
  // 结尾
  if (isZh) {
    fallbackLines.push('希望以上推荐对你有所帮助，祝旅途愉快！');
  } else {
    fallbackLines.push('Hope these recommendations help. Have a great trip!');
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
            tags: buildDisplayTags(dbPlace.categoryEn, dbPlace.aiTags, matchLanguageCode, dbPlace.tags as Record<string, string[]> | null),
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
      tags: buildDisplayTags(p.categoryEn, p.aiTags, matchLanguageCode, p.tags as Record<string, string[]> | null),
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
        getKouriProvider().searchPlaceImage(place.name, city),
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
        translationStatus: 'not_needed',
        translatedQuery: '',
      });
    }

    const isChineseQuery = containsCjk(query);
    const isNonLatinQuery = /[\u0080-\uFFFF]/.test(query);

    // Narrative (ack/overall/summary text) should be Chinese for Chinese queries.
    // Retrieval/matching can still use English.
    const matchLanguage = isNonLatinQuery ? 'en' : language;
    const narrativeLanguage = isNonLatinQuery ? 'zh' : language;
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
    
    // ========== 处理 travel_consultation 意图 ==========
    if (intentResult.intent === 'travel_consultation') {
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
      
      // 对返回的地点进行坐标补全（地址反查）
      if (result.relatedPlaces && result.relatedPlaces.length > 0) {
        await geocodePlacesMissingCoordinates(result.relatedPlaces, requiredCity);
      }
      if (result.cityPlaces && result.cityPlaces.length > 0) {
        for (const group of result.cityPlaces) {
          if (group.places && group.places.length > 0) {
            await geocodePlacesMissingCoordinates(group.places, group.city);
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
        quotaRemaining,
        stage: 'complete',
        translationStatus,
        translatedQuery,
      });
    }
    
    // ========== 处理 specific_place 意图 ==========
    if (intentResult.intent === 'specific_place' && intentResult.placeName) {
      logger.info(`[SearchV2] Handling specific_place intent for: "${intentResult.placeName}"`);
      // Pass original query for AI to identify the place if it's a vague query
      const placeNameForMatch = translationStatus === 'translated'
        ? translatedQuery
        : intentResult.placeName;
      const result = await intentClassifierService.handleSpecificPlace(
        placeNameForMatch,
        narrativeLanguage,
        query,
      );
      
      // 对返回的地点进行坐标补全（地址反查）
      if (result.place) {
        await geocodePlacesMissingCoordinates([result.place]);
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
      parsedQuery.count = Math.min(Math.max(intentResult.count, 1), 20);
      parsedQuery.explicitCount = true;
    }

    // If user didn't specify a count, return at least 5 and try to exceed 5
    // to enable category grouping (English search behavior).
    const defaultTarget = (parsedQuery.city || parsedQuery.country || parsedQuery.category)
      ? 10
      : CONFIG.DEFAULT_COUNT;
    const targetCount = Math.min(
      Math.max(parsedQuery.explicitCount ? parsedQuery.count : defaultTarget, CONFIG.DEFAULT_COUNT),
      20,
    );

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

    // Always start the AI request in parallel, so we can prioritize AI→DB matched places when available.
    // We'll cap how long we wait based on whether the DB cache already satisfies the target.
    const aiPromise = aiRecommendationService.getRecommendations(matchQuery, matchLanguage)
      .catch(err => {
        logger.warn(`[SearchV2] AI call failed: ${err}`);
        return null;
      });

    // DB-first: if Supabase already has enough image places, skip AI to keep latency low.
    // This is critical for queries like "日本拉面店" where cache is rich.
    const dbNameMatchPlaces = await getPlacesByQueryWithImage(parsedQuery, [], Math.min(10, targetCount), [])
      .catch(err => {
        logger.warn(`[SearchV2] DB name match failed: ${err}`);
        return [];
      });

    const cacheSufficient = dbNameMatchPlaces.length >= targetCount;

    let aiRecommendations: AIRecommendationResult | null = null;
    const aiWaitMs = cacheSufficient && !parsedQuery.explicitCount ? 2500 : CONFIG.AI_TIMEOUT_MS;
    aiRecommendations = await Promise.race([
      aiPromise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), aiWaitMs)),
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

    // If an AI recommended place is matched to a cached DB place, prioritize it in final ordering.
    // Map: dbPlaceId -> rank (lower is better).
    const aiMatchedRankById = new Map<string, number>();
    
    // 辅助函数：检查地点是否有有效图片（同步版本，用于快速检查）
    // 注意：某些数据源可能会写入空字符串/空白字符，这里统一按 trim 后判断。
    const hasImageSync = (p: PlaceResult | any) =>
      typeof p?.coverImage === 'string' && p.coverImage.trim().length > 0;

    const isStrictLocationMatch = (p: PlaceResult | any): boolean => {
      const requiredCountry = normalizeLocationText(parsedQuery.country);
      const requiredCity = normalizeLocationText(parsedQuery.city);
      const placeCountry = normalizeLocationText(p?.country);
      const placeCity = normalizeLocationText(p?.city);

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
      const normalizedValues = categoryValues.map((v) => v.toLowerCase().trim());
      const placeCategory = normalizeLocationText(p?.category);
      const placeCategoryEn = normalizeLocationText(p?.categoryEn);
      const placeCategorySlug = normalizeLocationText(p?.categorySlug);
      const tags: string[] = Array.isArray(p?.tags) ? p.tags.map((t: string) => t.toLowerCase().trim()) : [];

      return normalizedValues.some((value) => {
        if (!value) return false;
        if (placeCategory === value || placeCategoryEn === value || placeCategorySlug === value) return true;
        if (placeCategory.includes(value) || placeCategoryEn.includes(value) || placeCategorySlug.includes(value)) return true;
        if (tags.includes(value)) return true;
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
      if (usedIds.has(place.id) || usedNames.has(normalizedName)) {
        return false;
      }
      if (place.source === 'ai') {
        logger.info(`[SearchV2] Skipping "${place.name}" - AI-only card disabled`);
        return false;
      }
      if (!isStrictLocationMatch(place)) {
        logger.info(`[SearchV2] Skipping "${place.name}" - location mismatch`);
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

    // ========== 第 1.5 步：优先级 0 - 使用并行获取的数据库名字匹配结果 ==========
    // 同时启动 AI summary 生成（不等待后续步骤）
    let aiSummaryPromise: Promise<Map<string, string>> | null = null;
    
    if (dbNameMatchPlaces.length > 0) {
      logger.info(`[SearchV2] Step 1.5: Processing ${dbNameMatchPlaces.length} name-matched places`);
      
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
          tags: buildDisplayTags(p.categoryEn, p.aiTags, matchLanguageCode, p.tags as Record<string, string[]> | null),
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

    // ========== 第三步：优先级 2 - AI 结果 + Web Search 图片 ==========
    if (finalPlaces.length < targetCount && aiRecommendations && aiRecommendations.places.length > 0) {
      logger.info('[SearchV2] Step 3: Searching images for unmatched AI places...');
      
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
      
      // 为未匹配的 AI 地点搜索图片（限制数量避免太慢）
      const placesToSearch = filteredUnmatched.slice(0, Math.min(10, targetCount - finalPlaces.length));
      logger.info(`[SearchV2] Searching images for ${placesToSearch.length} unmatched AI places...`);
      
      const imageSearchResults = await Promise.all(
        placesToSearch.map(async (aiPlace) => {
          try {
            const imageUrl = await Promise.race([
              getKouriProvider().searchPlaceImage(
                aiPlace.name,
                aiPlace.city || parsedQuery.city || parsedQuery.country,
              ),
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
            tags: buildDisplayTags(null, aiPlace.tags, matchLanguageCode),
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
        parsedQuery.city || '', parsedQuery.country || '', parsedQuery.category, excludeIds, needed * 2, excludeNames
      );
      
      logger.info(`[SearchV2] Found ${supplementPlaces.length} supplement places from Supabase`);
      
      for (const p of supplementPlaces) {
        if (finalPlaces.length >= targetCount) break;
        // getPlacesByCategory 已经过滤了没图片的，但再检查一次
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
          tags: buildDisplayTags(p.categoryEn, p.aiTags, matchLanguageCode, p.tags as Record<string, string[]> | null),
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
          tags: buildDisplayTags(p.categoryEn, p.aiTags, matchLanguageCode, p.tags as Record<string, string[]> | null),
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

    // ========== 文本补齐：当匹配到的卡片数量不足时，用 AI 文本补齐 ==========
    const textOnlyPlaces: PlaceResult[] = [];
    if (aiRecommendations && aiRecommendations.places.length > 0) {
      const remaining = Math.max(targetCount - finalPlaces.length, 0);
      if (remaining > 0) {
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
            rating: null,
            ratingCount: null,
            tags: buildDisplayTags(null, aiPlace.tags, matchLanguageCode),
            isVerified: false,
            source: 'ai',
            address: undefined,
            phoneNumber: undefined,
            website: undefined,
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

USE WEB SEARCH to find relevant and accurate information.

STRUCTURE REQUIREMENTS:

1. OPENING PARAGRAPH (REQUIRED - 2-3 sentences):
   - Acknowledge what the user is looking for
   - Set expectations about what you'll recommend
   ${isZh ? '- Example: "在寻找相关的地点？以下是一些值得推荐的选择..."' : ''}

2. PLACE RECOMMENDATIONS:
   - List 8-12 notable places relevant to the search
   - If results exceed 6 places, group them into 2-3 categories with emoji titles
   - For each place, format as:
     **Place Name** (City, Country)
     Line 1: What makes it special (1-2 sentences)
     Line 2: 📍 Address | ⏰ Opening hours (if available from web search)

3. CLOSING PARAGRAPH (REQUIRED - 2-3 sentences):
   - Offer helpful tips
   - Wish them well
   ${isZh ? '- Example: "希望以上推荐对你有所帮助，祝旅途愉快！"' : ''}

CRITICAL: You MUST respond ENTIRELY in ${languageText}. ALL text must be in ${languageText}.

Return the response as plain Markdown text.`;

        try {
          const response = await generateTextWithFallback(fallbackPrompt, 45000);
          
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

      if (textContent && narrativeLanguageCode === 'zh') {
        const mentioned = await extractMentionedPlacesFromText(
          textContent,
          narrativeLanguageCode,
          parsedQuery,
        );
        if (mentioned.length > 0) {
          // Pass original query to filter matched places by category relevance
          matchedTextPlaces = await matchMentionedPlacesFromDB(
            mentioned,
            parsedQuery,
            narrativeLanguageCode,
            query, // Original query for category filtering
          );
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
        places: matchedTextPlaces, // 若能匹配到 DB 地点，展示卡片与地图
        textOnlyPlaces: textOnlyPlaces,
        mapPlaces: matchedTextPlaces,
        overallSummary: '',
        quotaRemaining,
        stage: 'complete',
        translationStatus,
        translatedQuery,
      });
    }

    // ========== 第五步：为地点生成分类（如果地点数 >= 6 且缓存不充足） ==========
    // 优化：缓存充足时跳过分类生成 AI 调用
    let finalCategories: CategoryGroup[] = [];
    if (finalPlaces.length >= 6 && !cacheSufficient) {
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

    // ========== 第六步：合并 AI summary 结果 ==========
    // 优化：缓存充足时跳过额外的 AI summary 生成调用
    // 使用 AI 推荐已返回的 summary 或数据库中已有的 summary
    const needsAISummaries = !cacheSufficient && finalPlaces.length > 0 && 
      finalPlaces.some(p => !p.summary || !p.summary.trim() || isLikelyFallbackSummary(p.summary, summaryLanguageCode));

    if (needsAISummaries) {
      logger.info(`[SearchV2] Step 6: Merging AI summaries for ${finalPlaces.length} places... (cacheSufficient=${cacheSufficient})`);

      let aiSummaries = new Map<string, string>();
      if (aiSummaryPromise) {
        try {
          aiSummaries = await aiSummaryPromise;
          logger.info(`[SearchV2] Got ${aiSummaries.size} pre-generated summaries`);
        } catch (error) {
          logger.warn(`[SearchV2] Failed to get pre-generated summaries: ${error}`);
        }
      }

      // 优化：缓存充足时不再生成额外 summary，只使用已有的
      // Find places still missing AI-generated summaries
      const placesNeedingSummary = finalPlaces.filter(p => !aiSummaries.has(p.id));
      if (placesNeedingSummary.length > 0 && !cacheSufficient) {
        logger.info(`[SearchV2] Generating summaries for ${placesNeedingSummary.length} additional places...`);
        const additionalSummaries = await generateAISummariesForPlaces(
          placesNeedingSummary.map(p => ({
            id: p.id,
            name: p.name,
            city: p.city || parsedQuery.city || '',
            country: p.country || '',
            latitude: p.latitude,
            longitude: p.longitude,
          })),
          parsedQuery,
          summaryLanguageCode
        );
        for (const [id, summary] of additionalSummaries) {
          aiSummaries.set(id, summary);
        }
      }

      // 应用所有 summary
      for (const place of finalPlaces) {
        const s = aiSummaries.get(place.id);
        const accept = summaryLanguageCode === 'zh' ? true : isSummaryRelevant(place.name, s || '');
        if (s && s.trim() && accept) {
          place.summary = s.trim();
        }
      }

      // 同时更新 categories 中的地点
      for (const cat of finalCategories) {
        for (const p of cat.places) {
          const s = aiSummaries.get(p.id);
          const accept = summaryLanguageCode === 'zh' ? true : isSummaryRelevant(p.name, s || '');
          if (s && s.trim() && accept) p.summary = s.trim();
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

    // ========== 中文查询：摘要翻译为中文（仅在需要且非缓存命中时） ==========
    // If summaries are already Chinese (or we hit cache and used fallback), skip any AI translation calls.
    if (isChineseQuery && !cacheSufficient && finalPlaces.length > 0) {
      const needsTranslation = finalPlaces.some(p => p.summary && p.summary.trim() && !containsCjk(p.summary));
      if (needsTranslation) {
        const summariesToTranslate = finalPlaces
          .filter(p => p.summary && p.summary.trim())
          .map(p => ({ id: p.id, summary: p.summary }));
        const translatedSummaries = await translateSummariesToChinese(summariesToTranslate);

        for (const place of finalPlaces) {
          const translated = translatedSummaries.get(place.id);
          if (translated) place.summary = translated;
        }
        for (const cat of finalCategories) {
          for (const p of cat.places) {
            const translated = translatedSummaries.get(p.id);
            if (translated) p.summary = translated;
          }
        }
      }
    }

    acknowledgment = normalizeAcknowledgment(acknowledgment || '', 50, 140);
    // 优化：缓存充足时跳过 acknowledgment 重新生成
    if (!cacheSufficient && (!acknowledgment || acknowledgment.trim().length < 50)) {
      const regenerated = await generateAcknowledgment(narrativeQuery, narrativeLanguageCode, parsedQuery);
      acknowledgment = normalizeAcknowledgment(regenerated || '', 50, 140);
    }

    // 优化：缓存充足时使用确定性的 overallSummary，不调用 AI
    if (!overallSummary || !overallSummary.trim()) {
      if (cacheSufficient) {
        // 使用确定性的 overallSummary
        overallSummary = narrativeLanguageCode === 'zh' 
          ? `以上是为您推荐的地点，希望对您有所帮助。`
          : `These are the recommended places for your search.`;
      } else {
        overallSummary = await generateOverallSummaryText(narrativeQuery, finalPlaces, narrativeLanguageCode);
      }
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
    await geocodePlacesMissingCoordinates(finalPlaces, parsedQuery.city);
    // 同时处理 textOnlyPlaces
    if (textOnlyPlaces.length > 0) {
      await geocodePlacesMissingCoordinates(textOnlyPlaces, parsedQuery.city);
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
      acknowledgment: acknowledgment || '',
      categories: finalCategories.length >= 2 ? finalCategories : undefined,
      places: finalPlaces,
      textOnlyPlaces,
      mapPlaces,
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
