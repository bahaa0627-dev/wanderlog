/**
 * Intent Classifier Service
 * 
 * Classifies user queries into four intent types:
 * - general_search: Finding multiple places with criteria
 * - specific_place: Getting info about a specific named place
 * - travel_consultation: Travel advice without specific place requests
 * - non_travel: Non-travel related queries
 * 
 * Uses KouriProvider for AI classification with rule-based fallback.
 * Also provides handlers for specific_place intent processing.
 */

import { logger } from '../utils/logger';
import { KouriProvider } from './aiProviders/KouriProvider';
import prisma from '../config/database';
import { calculateNameSimilarity } from './placeMatcherService';
import { 
  IntentType, 
  IntentResult, 
  IIntentClassifier,
  PlaceResult,
  SpecificPlaceHandlerResult,
  TravelConsultationHandlerResult,
  TravelConsultationAIResult,
  MentionedPlace,
  CityPlacesGroup,
  NonTravelHandlerResult,
} from '../types/intent';

// ============ Configuration ============

const CONFIG = {
  AI_TIMEOUT_MS: 10000,  // 10 second timeout for intent classification
  DESCRIPTION_TIMEOUT_MS: 15000, // 15 second timeout for description generation
  CONSULTATION_TIMEOUT_MS: 45000, // 45 second timeout for travel consultation (increased)
  NON_TRAVEL_TIMEOUT_MS: 30000, // 30 second timeout for non-travel responses (increased)
  NAME_SIMILARITY_THRESHOLD: 0.6, // Minimum similarity score for place matching
  SPECIFIC_PLACE_SIMILARITY_THRESHOLD: 0.75, // Higher threshold for specific_place to avoid wrong matches
  MAX_DESCRIPTION_WORDS: 100, // Maximum words in description
  MIN_PLACES_PER_CITY: 3, // Minimum places per city section
};

// ============ Prompt Templates ============

/**
 * AI prompt for generating specific place descriptions
 * Designed to produce concise, engaging introductions under 100 words
 */
const SPECIFIC_PLACE_DESCRIPTION_PROMPT = `Write a brief, engaging introduction about "{placeName}" for a traveler.

Requirements:
1. Include what it is and why it's notable
2. Add a practical tip for visitors if relevant
3. Keep it 2-3 sentences, STRICTLY under 60 words
4. Be informative but concise
5. CRITICAL: You MUST respond ONLY in {language}. Do NOT use any other language.

Return ONLY the description text, no JSON or formatting.`;

/**
 * AI prompt for travel consultation responses
 * Generates Markdown content with place recommendations and extracts mentioned places
 */
const TRAVEL_CONSULTATION_PROMPT = `You are a friendly travel expert. Answer the user's travel question.

=== USER'S QUESTION ===
{query}
=== END OF QUESTION ===

Response Language: {language}

⚠️ CRITICAL - READ CAREFULLY:
1. Your answer MUST be DIRECTLY about the location/topic in the user's question
2. If user asks about "Chiang Mai", ONLY talk about Chiang Mai (NOT other cities, NOT global recommendations)
3. If user asks about "Europe", ONLY recommend places IN EUROPE
4. If user asks about "hidden gems" or "less crowded", recommend LOCAL experiences in THAT specific location
5. DO NOT recommend places from other countries/cities unless explicitly asked
6. DO NOT change the subject or give generic global recommendations
7. IGNORE any web search results that are not directly relevant to the user's specific question

Example of WRONG response:
- User asks: "anything special in Chiang Mai?"
- WRONG: Recommending museums in New York, London, or other cities
- CORRECT: Recommending local Chiang Mai experiences like night markets, temples, cooking classes, etc.

Requirements:
1. Provide a helpful, engaging response in Markdown format
2. Use headings (##, ###) for structure when appropriate
3. Use emoji to make it friendly 🌍✈️🏛️
4. Keep response concise but informative (200-400 words)
5. When mentioning specific places, use **bold** format: **Place Name** (City)
6. CRITICAL: Your ENTIRE response MUST be in {language}. Do NOT mix languages.
7. At the end, you may add a follow-up prompt in {language}

Return JSON:
{
  "textContent": "Your Markdown response here...",
  "mentionedPlaces": [
    { "name": "Place Name 1", "city": "City Name" },
    { "name": "Place Name 2", "city": "City Name" }
  ],
  "cities": ["City1", "City2"]
}`;

/**
 * AI prompt for non-travel responses
 * Generates helpful Markdown content without database queries
 */
const NON_TRAVEL_PROMPT = `You are a helpful assistant. Answer the user's question.

Query: "{query}"
Language: {language}

Requirements:
1. Provide a helpful response in Markdown format
2. Use headings (##, ###) for structure when appropriate
3. Use emoji where appropriate
4. Keep response concise but helpful
5. When mentioning specific items or places, use **bold** format
6. CRITICAL: Your ENTIRE response MUST be in {language}. Do NOT mix languages.
7. When providing external links/resources, format them as a numbered list with each link on its own line:
   - Format: "1. [Site Name](URL) - Brief description"
   - Example:
     1. [AccuWeather](https://accuweather.com) - Detailed hourly forecasts
     2. [Weather.com](https://weather.com) - 10-day weather outlook

Return the response as plain Markdown text (not JSON).`;

// ============ Prompt Templates ============

/**
 * AI prompt for intent classification
 * Designed to accurately distinguish between the four intent types
 */
const INTENT_CLASSIFICATION_PROMPT = `Analyze this query and determine the user's intent.

Query: "{query}"

Classify into ONE of these intents:

1. "general_search" - User wants to FIND/DISCOVER specific PLACES or VENUES
   Examples: 
   - "8 restaurants in Tokyo" (searching for restaurants)
   - "cafes in Paris" (searching for cafes)
   - "best museums in Rome" (searching for museums)
   - "what to eat in Osaka" (searching for food places)
   - "大阪有什么好吃的" (searching for food places)
   - "coffee shops near me"
   Key signals:
   - Contains a place CATEGORY/TYPE (museum, cafe, restaurant, gallery, shop, bar, hotel, market, etc.)
   - User wants a LIST of specific venues/locations to visit
   - Food-related searches ("what to eat", "好吃的", "美食") = general_search for restaurants

2. "specific_place" - User wants BASIC INFO about ONE SPECIFIC named place (NOT asking how-to questions)
   Examples: "Eiffel Tower", "Louvre Museum", "Central Park", "what is Sagrada Familia"
   Key signal: 
   - Contains a UNIQUE proper noun that identifies ONE specific place
   - User just wants to KNOW ABOUT the place (not asking how to do something)
   - Simple queries like just the place name, or "tell me about X", "what is X"
   IMPORTANT: If user asks "how to...", "when to...", "tips for..." about a place, it's travel_consultation!

3. "travel_consultation" - Travel-related ADVICE, TIPS, HOW-TO, or PRACTICAL QUESTIONS
   Covers: 规划、天气、交通、门票、预算、旅行清单、注意事项、签证、语言、网络等
   Examples: 
   - "how to buy ticket of Sagrada Familia" (门票购买)
   - "how to get to Eiffel Tower from airport" (交通)
   - "best time to visit Japan" (时间)
   - "what to pack for Iceland" (旅行清单)
   - "things to avoid in Rome" (注意事项)
   - "do I need visa for Japan" (签证)
   - "weather in Paris in April" (天气)
   - "budget for 7 days in Tokyo" (预算)
   - "Plan a 3-day trip to Rome" (规划)
   - "Louvre vs Orsay which is better" (比较)
   - "which area to stay in London" (住宿区域建议)
   Key signals:
   - Questions starting with "how to", "how do I", "how can I"
   - Questions about tickets, booking, prices, costs, budget
   - Questions about timing, weather, season, best time
   - Questions about transportation, getting there
   - Questions about packing, preparation, checklist
   - Questions about safety, scams, things to avoid
   - Questions about visa, entry requirements
   - Comparisons between places
   - Trip planning questions

4. "non_travel" - NOT travel-related at all
   Examples: "推荐运动方案", "心情不好怎么办", "Python怎么学"
   Key signal: Health, emotions, technology, work, study, etc.

DECISION RULES (in order):
1. If query contains "how to", "how do", "tips for", "best way to", "should I" about travel → "travel_consultation"
2. If query asks about tickets, booking, prices, budget, weather, transport, visa, packing → "travel_consultation"
3. If query asks "what to eat", "好吃的", "美食", or searches for food/restaurants → "general_search"
4. If query contains a place CATEGORY AND wants to FIND venues → "general_search"
5. If query is JUST a place name or simple "what is X" → "specific_place"
6. If not travel-related → "non_travel"

Return JSON only:
{
  "intent": "specific_place" | "general_search" | "travel_consultation" | "non_travel",
  "placeName": "exact place name if specific_place or travel_consultation mentions a specific place",
  "placeNames": ["place1", "place2"] if multiple places mentioned,
  "city": "city name if mentioned",
  "category": "restaurant/cafe/museum/gallery/etc if mentioned",
  "count": number if mentioned,
  "confidence": 0.0-1.0
}`;

// ============ Rule-Based Detection Patterns ============

/**
 * Patterns for detecting specific place queries
 */
const SPECIFIC_PLACE_PATTERNS = [
  /(?:find|about|tell me about|show me|what is|where is|介绍一下|告诉我关于)\s+(?:the\s+)?([A-Z][a-zA-Z\s''-]+)/i,
  /^([A-Z][a-zA-Z\s''-]+)$/,  // Just a place name
  /(?:去|参观|游览)\s*([^\s,，。]+(?:博物馆|美术馆|塔|宫|寺|庙|园|馆|城堡|教堂))/,
];

/**
 * Generic words that indicate general search, not specific places
 */
const GENERIC_WORDS = [
  'restaurants', 'cafes', 'places', 'spots', 'museums', 'bars', 'hotels', 'shops',
  'restaurant', 'cafe', 'place', 'spot', 'museum', 'bar', 'hotel', 'shop',
  '餐厅', '咖啡馆', '地方', '景点', '博物馆', '酒吧', '酒店', '商店',
];

/**
 * Category keywords for general search detection
 */
const CATEGORY_KEYWORDS = [
  'cafe', 'coffee', 'bakery', 'restaurant', 'ramen', 'sushi', 'museum', 'gallery',
  'temple', 'shrine', 'park', 'garden', 'bar', 'pub', 'shop', 'shopping', 'hotel',
  'market', 'flea market', 'food market',
  '咖啡', '餐厅', '博物馆', '公园', '酒吧', '商店', '酒店',
];

/**
 * City names and variants for detection
 */
const KNOWN_CITIES = [
  'paris', 'tokyo', 'rome', 'london', 'new york', 'barcelona', 'madrid', 'berlin',
  'amsterdam', 'vienna', 'prague', 'florence', 'venice', 'milan', 'munich',
  'kyoto', 'osaka', 'seoul', 'bangkok', 'singapore', 'sydney', 'melbourne',
  'san francisco', 'los angeles', 'chicago', 'copenhagen', 'stockholm',
  '巴黎', '东京', '罗马', '伦敦', '纽约', '巴塞罗那', '马德里', '柏林',
  '阿姆斯特丹', '维也纳', '布拉格', '佛罗伦萨', '威尼斯', '米兰', '慕尼黑',
  '京都', '大阪', '首尔', '曼谷', '新加坡', '悉尼', '墨尔本',
  '旧金山', '洛杉矶', '芝加哥', '哥本哈根', '斯德哥尔摩',
];

/**
 * Non-travel keywords that indicate non_travel intent
 */
const NON_TRAVEL_KEYWORDS = [
  // Weather
  '天气', 'weather', '气温', 'temperature',
  // Health & Fitness
  '运动', 'exercise', '健身', 'fitness', '减肥', 'diet', '健康', 'health',
  // Emotions
  '心情', 'mood', '难过', 'sad', '开心', 'happy', '焦虑', 'anxiety',
  // Technology
  'python', 'javascript', 'coding', '编程', '代码', 'code', '软件', 'software',
  // General non-travel
  '工作', 'work', '学习', 'study', '考试', 'exam', '面试', 'interview',
];

/**
 * Travel consultation keywords
 * 用于判断旅游咨询类问题（规划、天气、交通、门票、预算、注意事项等）
 * 注意：美食类问题（what to eat, 吃什么）属于 general_search，不在此列表
 */
const TRAVEL_CONSULTATION_KEYWORDS = [
  // === How-to questions (最高优先级) ===
  'how to', 'how do', 'how can', 'how much', 'how long', 'how far',
  '怎么', '如何', '怎样', '多久', '多远',

  // === 规划 Planning ===
  'plan', 'itinerary', 'schedule', 'route', 'day trip', 'day plan',
  '计划', '行程', '路线', '安排', '规划', '几天', '一日游',

  // === 天气 Weather ===
  'weather', 'climate', 'season', 'temperature', 'rainy', 'sunny', 'cold', 'hot',
  '天气', '气候', '季节', '温度', '穿什么', '冷不冷', '热不热',

  // === 交通 Transportation ===
  'transport', 'get to', 'get there', 'metro', 'subway', 'bus', 'taxi', 'uber',
  'train', 'flight', 'airport', 'transfer',
  '交通', '怎么去', '地铁', '公交', '打车', '机场', '高铁', '火车', '转机',

  // === 门票 Tickets ===
  'ticket', 'admission', 'entry fee', 'pass', 'skip the line', 'queue', 'book', 'reserve',
  '门票', '票价', '排队', '免排队', '通票', '预约', '预订', '买票', '订票',

  // === 预算 Budget ===
  'budget', 'cost', 'expensive', 'cheap', 'afford', 'spend',
  '预算', '花费', '贵不贵', '便宜', '花多少',

  // === 旅行清单 Packing ===
  'pack', 'packing', 'bring', 'luggage', 'checklist', 'prepare', 'essentials',
  '带什么', '准备', '行李', '清单', '必备', '装备',

  // === 注意事项 Tips/Warnings ===
  'tips for', 'advice for', 'avoid', 'scam', 'safety', 'warning', 'careful', 'danger',
  '注意', '小心', '骗局', '安全', '禁忌', '避免', '危险', '陷阱',

  // === 住宿区域建议 (不是搜索酒店) ===
  'where to stay', 'which area', 'best area', 'neighborhood',
  '住哪个区', '哪个区好',

  // === 签证/入境 Visa ===
  'visa', 'entry requirement', 'customs', 'immigration', 'passport', 'border',
  '签证', '入境', '海关', '护照', '过境',

  // === 语言 Language ===
  'language', 'speak english', 'translate', 'communication',
  '语言', '说英语', '沟通', '翻译', '说什么语',

  // === 网络/通讯 Connectivity ===
  'sim card', 'roaming', 'data plan',
  '电话卡', '流量', '漫游',

  // === 时间 Timing ===
  'best time', 'when to', 'when should', 'peak season', 'off season',
  '什么时候', '最佳时间', '旺季', '淡季',

  // === 比较 Comparison ===
  'vs', 'versus', 'compare', 'which is better', 'difference',
  '还是', '哪个更', '对比', '区别', '选哪个',

  // === 体验咨询 (不是搜索地点) ===
  'worth visiting', 'is it worth', 'should i',
  '值得去吗', '要不要去',

  // === 推荐/建议 ===
  'recommend', 'suggest', 'advice',
  '推荐', '建议',
];

// ============ Intent Classifier Service ============

class IntentClassifierService implements IIntentClassifier {
  private kouriProvider: KouriProvider;

  constructor() {
    this.kouriProvider = new KouriProvider();
  }

  /**
   * Classify user query intent using AI
   */
  async classify(query: string, language: string): Promise<IntentResult> {
    logger.info(`[IntentClassifier] Classifying query: "${query}"`);

    try {
      // Build the prompt with the user's query
      const prompt = INTENT_CLASSIFICATION_PROMPT.replace('{query}', query);

      // Call AI with timeout
      const response = await Promise.race([
        this.kouriProvider.generateText(prompt),
        new Promise<string>((_, reject) => 
          setTimeout(() => reject(new Error('Intent classification timeout')), CONFIG.AI_TIMEOUT_MS)
        ),
      ]);

      // Parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]) as IntentResult;
        
        // Validate intent type
        if (!this.isValidIntentType(result.intent)) {
          logger.warn(`[IntentClassifier] Invalid intent type from AI: ${result.intent}, using fallback`);
          return this.fallbackClassify(query, language);
        }

        logger.info(`[IntentClassifier] AI classified as: ${result.intent} (confidence: ${result.confidence})`);
        return result;
      }

      // No valid JSON found, use fallback
      logger.warn('[IntentClassifier] No valid JSON in AI response, using fallback');
      return this.fallbackClassify(query, language);

    } catch (error) {
      logger.warn(`[IntentClassifier] AI classification failed: ${error}, using fallback`);
      return this.fallbackClassify(query, language);
    }
  }

  /**
   * Fallback classification using rule-based detection
   * @param query User's search query
   * @param _language User's preferred language (unused in rule-based detection)
   */
  fallbackClassify(query: string, _language: string): IntentResult {
    logger.info(`[IntentClassifier] Using fallback classification for: "${query}"`);
    const lower = query.toLowerCase();

    // 1. Check for non-travel intent first
    if (this.isNonTravelQuery(lower)) {
      logger.info('[IntentClassifier] Fallback: non_travel');
      return {
        intent: 'non_travel',
        confidence: 0.7,
      };
    }

    // 2. Check for travel consultation FIRST (how-to questions, tips, booking, etc.)
    // This ensures "how to buy ticket of Sagrada Familia" is travel_consultation, not specific_place
    if (this.isTravelConsultation(lower)) {
      logger.info('[IntentClassifier] Fallback: travel_consultation');
      return {
        intent: 'travel_consultation',
        confidence: 0.8,
      };
    }

    // 3. Check for category keywords (before specific place)
    // This ensures "design museum" is classified as general_search, not specific_place
    const hasCategory = this.detectCategory(lower);
    const hasCity = this.detectCity(lower);
    const count = this.detectCount(query);
    
    // If query contains a category keyword, it's likely a general search
    // unless it also contains a very specific proper noun
    if (hasCategory) {
      // Check if it's a specific named place (e.g., "Vitra Design Museum" vs "design museum")
      const specificPlace = this.detectSpecificPlace(query);
      // Only treat as specific_place if the name is significantly longer than just the category
      // e.g., "Vitra Design Museum" (3+ words) vs "design museum" (2 words)
      const wordCount = query.trim().split(/\s+/).length;
      if (specificPlace && wordCount >= 3 && !GENERIC_WORDS.some(w => specificPlace.toLowerCase() === w)) {
        logger.info(`[IntentClassifier] Fallback: specific_place (${specificPlace})`);
        return {
          intent: 'specific_place',
          placeName: specificPlace,
          confidence: 0.7,
        };
      }
      
      // Otherwise, it's a general search for that category
      logger.info(`[IntentClassifier] Fallback: general_search (category: ${hasCategory}, city: ${hasCity})`);
      return {
        intent: 'general_search',
        city: hasCity || undefined,
        category: hasCategory || undefined,
        count: count || undefined,
        confidence: 0.7,
      };
    }

    // 4. Check for specific place query (only if no category and no consultation keywords)
    const specificPlace = this.detectSpecificPlace(query);
    if (specificPlace) {
      logger.info(`[IntentClassifier] Fallback: specific_place (${specificPlace})`);
      return {
        intent: 'specific_place',
        placeName: specificPlace,
        confidence: 0.7,
      };
    }

    // 5. Check for general search (has city)
    if (hasCity) {
      logger.info(`[IntentClassifier] Fallback: general_search (city: ${hasCity})`);
      return {
        intent: 'general_search',
        city: hasCity || undefined,
        count: count || undefined,
        confidence: 0.6,
      };
    }

    // 6. Default to general_search for ambiguous travel-related queries
    logger.info('[IntentClassifier] Fallback: defaulting to general_search');
    return {
      intent: 'general_search',
      confidence: 0.4,
    };
  }

  /**
   * Validate that the intent type is one of the four valid types
   */
  private isValidIntentType(intent: string): intent is IntentType {
    return ['general_search', 'specific_place', 'travel_consultation', 'non_travel'].includes(intent);
  }

  /**
   * Check if query is non-travel related
   */
  private isNonTravelQuery(lower: string): boolean {
    return NON_TRAVEL_KEYWORDS.some(keyword => lower.includes(keyword));
  }

  /**
   * Detect specific place name from query
   */
  private detectSpecificPlace(query: string): string | null {
    for (const pattern of SPECIFIC_PLACE_PATTERNS) {
      const match = query.match(pattern);
      if (match && match[1]) {
        const potentialPlace = match[1].trim();
        // Exclude generic words
        if (!GENERIC_WORDS.some(w => potentialPlace.toLowerCase().includes(w))) {
          return potentialPlace;
        }
      }
    }
    return null;
  }

  /**
   * Check if query is travel consultation
   */
  private isTravelConsultation(lower: string): boolean {
    return TRAVEL_CONSULTATION_KEYWORDS.some(keyword => lower.includes(keyword));
  }

  /**
   * Detect city name from query
   */
  private detectCity(lower: string): string | null {
    for (const city of KNOWN_CITIES) {
      if (lower.includes(city)) {
        // Capitalize first letter of each word
        return city.split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      }
    }
    return null;
  }

  /**
   * Detect category from query
   */
  private detectCategory(lower: string): string | null {
    for (const category of CATEGORY_KEYWORDS) {
      if (lower.includes(category)) {
        return category;
      }
    }
    return null;
  }

  /**
   * Detect count/quantity from query
   */
  private detectCount(query: string): number | null {
    const match = query.match(/(\d+)\s+/);
    if (match) {
      const count = parseInt(match[1], 10);
      return Math.min(Math.max(count, 1), 20); // Clamp between 1 and 20
    }
    return null;
  }

  // ============ Specific Place Handler Methods ============

  /**
   * Handle specific_place intent - generates AI description and matches database
   * If no image found, uses web search to find one
   * @param placeName The name of the specific place to look up (or vague description)
   * @param language User's preferred language ('en' or 'zh')
   * @param originalQuery The original user query (for AI to identify the place)
   * @returns Handler result with description and optional matched place
   */
  async handleSpecificPlace(placeName: string, language: string, originalQuery?: string): Promise<SpecificPlaceHandlerResult> {
    logger.info(`[IntentClassifier] Handling specific place query: "${placeName}"`);

    // Step 1: If the query is vague (user doesn't remember the name), ask AI to identify it first
    let identifiedPlaceName = placeName;
    if (originalQuery && this.isVagueQuery(originalQuery)) {
      logger.info(`[IntentClassifier] Vague query detected, asking AI to identify the place...`);
      const identified = await this.identifyPlaceFromQuery(originalQuery, language);
      if (identified) {
        identifiedPlaceName = identified;
        logger.info(`[IntentClassifier] AI identified place: "${identified}"`);
      }
    }

    // Step 2: Run AI description generation and database matching in parallel
    const [description, matchedPlace] = await Promise.all([
      this.generatePlaceDescription(identifiedPlaceName, language),
      this.matchPlaceFromDatabaseStrict(identifiedPlaceName, language as 'en' | 'zh'),
    ]);

    // Step 3: If place found but no image, search for image
    if (matchedPlace && (!matchedPlace.coverImage || matchedPlace.coverImage === '')) {
      logger.info(`[IntentClassifier] Place "${matchedPlace.name}" has no image, searching online...`);
      try {
        const imageUrl = await this.kouriProvider.searchPlaceImage(identifiedPlaceName, matchedPlace.city || '');
        if (imageUrl) {
          matchedPlace.coverImage = imageUrl;
          logger.info(`[IntentClassifier] Found image for "${matchedPlace.name}": ${imageUrl}`);
          
          // Save image to database for future use (async, don't wait)
          this.saveImageToDatabase(matchedPlace.id, imageUrl).catch(err => 
            logger.warn(`[IntentClassifier] Failed to save image to DB: ${err}`)
          );
        }
      } catch (error) {
        logger.warn(`[IntentClassifier] Image search failed for "${identifiedPlaceName}": ${error}`);
      }
    }

    logger.info(`[IntentClassifier] Specific place result: description=${description.length} chars, place=${matchedPlace ? matchedPlace.name : 'null'}, identified="${identifiedPlaceName}"`);

    return {
      description,
      place: matchedPlace,
      identifiedPlaceName, // Return the AI-identified name for frontend display
    };
  }

  /**
   * Check if the query is vague (user doesn't remember the exact name)
   */
  private isVagueQuery(query: string): boolean {
    const vaguePatterns = [
      /don'?t remember/i,
      /forgot the name/i,
      /can'?t recall/i,
      /what'?s the name/i,
      /help (me )?find/i,
      /不记得.*名/,
      /忘了.*名/,
      /叫什么/,
      /是什么/,
      /哪个/,
    ];
    return vaguePatterns.some(pattern => pattern.test(query));
  }

  /**
   * Ask AI to identify a specific place from a vague query
   */
  private async identifyPlaceFromQuery(query: string, _language: string): Promise<string | null> {
    const prompt = `The user is trying to find a specific place but doesn't remember the exact name.

Query: "${query}"

Based on the description, identify the most likely place they're referring to.
Return ONLY the place name (e.g., "La Boqueria", "Eiffel Tower"), nothing else.
If you cannot identify a specific place, return "UNKNOWN".`;

    try {
      const response = await Promise.race([
        this.kouriProvider.generateText(prompt),
        new Promise<string>((resolve) => 
          setTimeout(() => resolve('UNKNOWN'), 5000)
        ),
      ]);

      const identified = response.trim().replace(/^["']|["']$/g, '');
      if (identified && identified !== 'UNKNOWN' && identified.length > 0 && identified.length < 100) {
        return identified;
      }
      return null;
    } catch (error) {
      logger.warn(`[IntentClassifier] Failed to identify place from query: ${error}`);
      return null;
    }
  }

  /**
   * Match place from database with STRICT similarity threshold
   * Only returns a match if similarity is very high to avoid wrong matches
   */
  private async matchPlaceFromDatabaseStrict(placeName: string, language: 'en' | 'zh' = 'en'): Promise<PlaceResult | null> {
    const result = await this.matchPlaceFromDatabase(placeName, language);
    
    if (!result) return null;
    
    // Verify the match is accurate by checking similarity
    const similarity = Math.max(
      calculateNameSimilarity(placeName, result.name),
      this.calculateWordBasedSimilarity(placeName, result.name)
    );
    
    logger.info(`[IntentClassifier] Strict match check: "${placeName}" vs "${result.name}" = ${similarity.toFixed(3)}`);
    
    // Only return if similarity is above the strict threshold
    if (similarity >= CONFIG.SPECIFIC_PLACE_SIMILARITY_THRESHOLD) {
      return result;
    }
    
    logger.info(`[IntentClassifier] Match rejected: similarity ${similarity.toFixed(3)} < threshold ${CONFIG.SPECIFIC_PLACE_SIMILARITY_THRESHOLD}`);
    return null;
  }

  /**
   * Save image URL to database for a place
   */
  private async saveImageToDatabase(placeId: string, imageUrl: string): Promise<void> {
    try {
      await prisma.place.update({
        where: { id: placeId },
        data: { coverImage: imageUrl },
      });
      logger.info(`[IntentClassifier] Saved image to database for place ${placeId}`);
    } catch (error) {
      logger.warn(`[IntentClassifier] Failed to save image to database: ${error}`);
    }
  }

  /**
   * Generate AI description for a specific place
   * @param placeName Name of the place
   * @param language User's preferred language
   * @returns Description text (under 100 words)
   */
  private async generatePlaceDescription(placeName: string, language: string): Promise<string> {
    const languageText = language === 'zh' ? 'Chinese' : 'English';
    const prompt = SPECIFIC_PLACE_DESCRIPTION_PROMPT
      .replace('{placeName}', placeName)
      .replace('{language}', languageText);

    try {
      const response = await Promise.race([
        this.kouriProvider.generateText(prompt),
        new Promise<string>((resolve) => 
          setTimeout(() => resolve(''), CONFIG.DESCRIPTION_TIMEOUT_MS)
        ),
      ]);

      if (!response) {
        logger.warn(`[IntentClassifier] Description generation timed out for "${placeName}"`);
        return '';
      }

      // Clean up the response
      let description = response
        .replace(/^["']|["']$/g, '') // Remove surrounding quotes
        .replace(/```[\s\S]*?```/g, '') // Remove code blocks
        .trim();

      // Enforce word limit (100 words max)
      const words = description.split(/\s+/);
      if (words.length > CONFIG.MAX_DESCRIPTION_WORDS) {
        description = words.slice(0, CONFIG.MAX_DESCRIPTION_WORDS).join(' ') + '...';
        logger.info(`[IntentClassifier] Truncated description to ${CONFIG.MAX_DESCRIPTION_WORDS} words`);
      }

      logger.info(`[IntentClassifier] Generated description: ${description.length} chars, ${words.length} words`);
      return description;

    } catch (error) {
      logger.warn(`[IntentClassifier] Failed to generate description for "${placeName}": ${error}`);
      return '';
    }
  }

  /**
   * Match place from database, prioritizing places with cover images
   * Supports: case-insensitive, accent-insensitive, word-order-insensitive matching
   * @param placeName Name of the place to match
   * @returns Matched PlaceResult or null
   */
  private async matchPlaceFromDatabase(placeName: string, language: 'en' | 'zh' = 'en'): Promise<PlaceResult | null> {
    logger.info(`[IntentClassifier] Searching database for: "${placeName}"`);

    try {
      // Normalize input for comparison (remove accents, lowercase)
      const normalizedInput = placeName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const significantWords = this.extractSignificantWords(placeName);
      logger.info(`[IntentClassifier] Significant words: ${significantWords.join(', ')}`);
      
      // STRATEGY 1: Use raw SQL for accent-insensitive search with all significant words
      // PostgreSQL's unaccent function handles é -> e, etc.
      if (significantWords.length >= 1) {
        // Build WHERE clause for each word (accent-insensitive)
        const whereConditions = significantWords.map((_, i) => 
          `LOWER(unaccent(name)) LIKE LOWER(unaccent($${i + 1}))`
        ).join(' AND ');
        
        const searchPatterns = significantWords.map(w => `%${w}%`);
        
        try {
          const rawResults = await prisma.$queryRawUnsafe<any[]>(
            `SELECT id, name FROM places WHERE ${whereConditions} LIMIT 30`,
            ...searchPatterns
          );
          
          if (rawResults.length > 0) {
            logger.info(`[IntentClassifier] Found ${rawResults.length} accent-insensitive matches`);
            
            // Check for exact match first (normalized comparison)
            for (const match of rawResults) {
              const matchNormalized = match.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
              if (matchNormalized === normalizedInput) {
                logger.info(`[IntentClassifier] Found exact match: "${match.name}" for "${placeName}"`);
                // Fetch full record with Prisma to get proper camelCase fields
                const fullRecord = await prisma.place.findUnique({ where: { id: match.id } });
                if (fullRecord) {
                  return this.toPlaceResult(fullRecord, language);
                }
              }
            }
            
            // If no exact match, get IDs and fetch full records with Prisma
            const matchIds = rawResults.map(r => r.id);
            const fullRecords = await prisma.place.findMany({
              where: { id: { in: matchIds } },
            });
            
            const best = this.findBestMatch(placeName, fullRecords, language);
            if (best) return best;
          }
        } catch (sqlError) {
          // unaccent extension might not be available, fall back to regular search
          logger.warn(`[IntentClassifier] Raw SQL failed (unaccent may not be installed): ${sqlError}`);
        }
      }
      
      // STRATEGY 2: Fallback - Try AND search with Prisma (works when DB has matching accents)
      if (significantWords.length >= 2) {
        const andResults = await prisma.place.findMany({
          where: {
            AND: significantWords.map(word => ({
              name: { contains: word, mode: 'insensitive' },
            })),
          },
          take: 20,
        });
        
        if (andResults.length > 0) {
          logger.info(`[IntentClassifier] Found ${andResults.length} AND-match candidates`);
          
          for (const match of andResults) {
            const matchNormalized = match.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            if (matchNormalized === normalizedInput) {
              logger.info(`[IntentClassifier] Found exact match: "${match.name}" for "${placeName}"`);
              return this.toPlaceResult(match, language);
            }
          }
          
          const best = this.findBestMatch(placeName, andResults, language);
          if (best) return best;
        }
      }
      
      // STRATEGY 3: Try exact match (for single-word names)
      const exactMatches = await prisma.place.findMany({
        where: {
          OR: [
            { name: { equals: placeName, mode: 'insensitive' } },
            { name: { equals: placeName.normalize('NFD').replace(/[\u0300-\u036f]/g, ''), mode: 'insensitive' } },
          ],
        },
        take: 10,
      });
      
      for (const match of exactMatches) {
        const matchNormalized = match.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (matchNormalized === normalizedInput) {
          logger.info(`[IntentClassifier] Found exact match: "${match.name}" for "${placeName}"`);
          return this.toPlaceResult(match, language);
        }
      }
      
      // STRATEGY 4: Fallback to contains search with scoring
      const searchQueries = this.buildSearchQueries(placeName, significantWords);
      let candidates: any[] = [];
      
      for (const query of searchQueries) {
        if (candidates.length > 0) break;
        
        logger.info(`[IntentClassifier] Trying contains search: "${query}"`);
        const results = await prisma.place.findMany({
          where: {
            name: { contains: query, mode: 'insensitive' },
          },
          take: 30,
        });
        
        if (results.length > 0) {
          candidates = results;
        }
      }

      if (candidates.length === 0) {
        logger.info(`[IntentClassifier] No database matches found for "${placeName}"`);
        return null;
      }

      logger.info(`[IntentClassifier] Found ${candidates.length} candidates for "${placeName}"`);
      return this.findBestMatch(placeName, candidates, language);

    } catch (error) {
      logger.error(`[IntentClassifier] Database matching error for "${placeName}": ${error}`);
      return null;
    }
  }
  
  /**
   * Find best matching place from candidates using similarity scoring
   * @param placeName Name of the place to match
   * @param candidates Array of candidate places from database
   * @param language Language parameter for tag display ('en' or 'zh')
   */
  private findBestMatch(placeName: string, candidates: any[], language: 'en' | 'zh' = 'en'): PlaceResult | null {
    const scoredCandidates: Array<{ candidate: any; score: number; hasImage: boolean }> = [];

    for (const candidate of candidates) {
      // Use both standard similarity and word-based similarity
      const standardSim = calculateNameSimilarity(placeName, candidate.name);
      const wordSim = this.calculateWordBasedSimilarity(placeName, candidate.name);
      const similarity = Math.max(standardSim, wordSim);
      
      if (similarity >= CONFIG.NAME_SIMILARITY_THRESHOLD) {
        const hasImage = !!(candidate.coverImage && candidate.coverImage !== '');
        scoredCandidates.push({
          candidate,
          score: similarity,
          hasImage,
        });
        logger.info(`[IntentClassifier] Candidate "${candidate.name}" score: ${similarity.toFixed(3)} (standard: ${standardSim.toFixed(3)}, word: ${wordSim.toFixed(3)})`);
      }
    }

    if (scoredCandidates.length === 0) {
      logger.info(`[IntentClassifier] No candidates met similarity threshold for "${placeName}"`);
      return null;
    }

    // Sort by: 1) has image (prioritize), 2) similarity score
    scoredCandidates.sort((a, b) => {
      if (a.hasImage !== b.hasImage) {
        return a.hasImage ? -1 : 1;
      }
      return b.score - a.score;
    });

    const bestMatch = scoredCandidates[0];
    const dbPlace = bestMatch.candidate;

    logger.info(`[IntentClassifier] Best match: "${dbPlace.name}" (score: ${bestMatch.score.toFixed(2)}, hasImage: ${bestMatch.hasImage})`);

    return this.toPlaceResult(dbPlace, language);
  }

  /**
   * Extract significant words from a place name (remove common prepositions/articles)
   */
  private extractSignificantWords(name: string): string[] {
    const stopWords = new Set([
      // English
      'the', 'a', 'an', 'of', 'in', 'at', 'on', 'to', 'for', 'and', 'or', 'by',
      // French
      'le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'ou',
      // Spanish
      'el', 'los', 'las', 'del', 'en', 'y',
      // German
      'der', 'die', 'das', 'von', 'und',
      // Italian
      'il', 'lo', 'gli', 'di', 'da',
    ]);
    
    // Normalize: lowercase, remove accents
    const normalized = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[''`]/g, "'")
      .replace(/[^\w\s']/g, ' ')
      .trim();
    
    // Split and filter
    const words = normalized.split(/\s+/).filter(word => 
      word.length > 1 && !stopWords.has(word)
    );
    
    return words;
  }

  /**
   * Build multiple search queries from place name
   */
  private buildSearchQueries(originalName: string, significantWords: string[]): string[] {
    const queries: string[] = [];
    
    // 1. Original name (exact)
    queries.push(originalName);
    
    // 2. Normalized name (no accents)
    const normalizedName = originalName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    if (normalizedName !== originalName) {
      queries.push(normalizedName);
    }
    
    // 3. Significant words joined (for word-order variations)
    if (significantWords.length >= 2) {
      // Try different combinations of significant words
      const longestWord = significantWords.reduce((a, b) => a.length > b.length ? a : b);
      if (!queries.some(q => q.toLowerCase().includes(longestWord))) {
        queries.push(longestWord);
      }
      
      // Try pairs of significant words
      for (let i = 0; i < Math.min(significantWords.length, 3); i++) {
        for (let j = i + 1; j < Math.min(significantWords.length, 3); j++) {
          const pair = `${significantWords[i]} ${significantWords[j]}`;
          if (!queries.includes(pair)) {
            queries.push(pair);
          }
        }
      }
    }
    
    // 4. First significant word only
    if (significantWords.length > 0) {
      const firstWord = significantWords[0];
      if (!queries.includes(firstWord) && firstWord.length > 3) {
        queries.push(firstWord);
      }
    }
    
    return queries;
  }

  /**
   * Calculate word-based similarity (handles word order variations)
   * "denmark design museum" vs "Design Museum Denmark" should score high
   */
  private calculateWordBasedSimilarity(input: string, dbName: string): number {
    const inputWords = this.extractSignificantWords(input);
    const dbWords = this.extractSignificantWords(dbName);
    
    if (inputWords.length === 0 || dbWords.length === 0) return 0;
    
    // Count matching words
    let matchCount = 0;
    const usedDbWords = new Set<number>();
    
    for (const inputWord of inputWords) {
      for (let i = 0; i < dbWords.length; i++) {
        if (usedDbWords.has(i)) continue;
        
        const dbWord = dbWords[i];
        
        // Check for exact match first
        if (inputWord === dbWord) {
          matchCount++;
          usedDbWords.add(i);
          break;
        }
        
        // For substring matching, require minimum length and significant overlap
        // to avoid false positives like "nice" matching "venice"
        const minLen = Math.min(inputWord.length, dbWord.length);
        const maxLen = Math.max(inputWord.length, dbWord.length);
        
        // Only allow substring match if:
        // 1. The shorter word is at least 4 characters
        // 2. The length ratio is at least 0.7 (e.g., "museum" vs "museums" is OK, but "nice" vs "venice" is not)
        const lengthRatio = minLen / maxLen;
        const allowSubstringMatch = minLen >= 4 && lengthRatio >= 0.7;
        
        if (allowSubstringMatch && (inputWord.includes(dbWord) || dbWord.includes(inputWord))) {
          matchCount++;
          usedDbWords.add(i);
          break;
        }
        
        // Check Levenshtein similarity for typos/variations
        // But require high similarity (0.85) to avoid false positives
        if (this.levenshteinSimilarity(inputWord, dbWord) > 0.85) {
          matchCount++;
          usedDbWords.add(i);
          break;
        }
      }
    }
    
    // Calculate similarity based on matched words
    const maxWords = Math.max(inputWords.length, dbWords.length);
    const minWords = Math.min(inputWords.length, dbWords.length);
    
    // If all words from the shorter name match, give high score
    if (matchCount >= minWords) {
      return 0.85 + (0.15 * matchCount / maxWords);
    }
    
    return matchCount / maxWords;
  }

  /**
   * Simple Levenshtein similarity (0-1)
   */
  private levenshteinSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;
    
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
    
    const distance = matrix[b.length][a.length];
    const maxLen = Math.max(a.length, b.length);
    return 1 - distance / maxLen;
  }

  /**
   * Build display tags from category and AI tags
   * @param categoryEn Category in English
   * @param aiTags AI-generated tags
   * @param language Language parameter to determine which field to use ('en' or 'zh')
   * @returns Array of display tag strings
   */
  private buildDisplayTags(categoryEn: string | null | undefined, aiTags: any, language: 'en' | 'zh' = 'en'): string[] {
    const tags: string[] = [];

    // Add category as first tag
    if (categoryEn && categoryEn.trim()) {
      tags.push(categoryEn.trim());
    }

    // Add AI tags (use language-specific field with fallback)
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

  // ============ Travel Consultation Handler Methods ============

  /**
   * Handle travel_consultation intent - generates Markdown response and matches related places
   * @param query User's travel consultation query
   * @param language User's preferred language ('en' or 'zh')
   * @returns Handler result with textContent and optional relatedPlaces/cityPlaces
   */
  async handleTravelConsultation(query: string, language: string): Promise<TravelConsultationHandlerResult> {
    logger.info(`[IntentClassifier] Handling travel consultation: "${query}"`);

    // Step 1: Generate AI response with place mentions
    const aiResult = await this.generateTravelConsultationResponse(query, language);
    
    // 即使 textContent 为空也返回（generateTravelConsultationResponse 已经处理了超时/错误消息）
    if (!aiResult.textContent || aiResult.textContent.length === 0) {
      logger.warn('[IntentClassifier] Empty travel consultation response');
      const fallbackMsg = language === 'zh' 
        ? '抱歉，无法生成回复。请稍后再试。'
        : 'Sorry, unable to generate a response. Please try again.';
      return { textContent: fallbackMsg };
    }

    // Step 2: If no places mentioned, return just the text content
    if (!aiResult.mentionedPlaces || aiResult.mentionedPlaces.length === 0) {
      logger.info('[IntentClassifier] No places mentioned in response');
      return { textContent: aiResult.textContent };
    }

    // Step 3: Match related places from database
    const cities = aiResult.cities || [];
    const result = await this.matchRelatedPlaces(aiResult.mentionedPlaces, cities, language as 'en' | 'zh');

    logger.info(`[IntentClassifier] Travel consultation result: textContent=${aiResult.textContent.length} chars, cities=${cities.length}`);

    return {
      textContent: aiResult.textContent,
      relatedPlaces: result.relatedPlaces,
      cityPlaces: result.cityPlaces,
    };
  }

  /**
   * Generate AI response for travel consultation
   * @param query User's query
   * @param language User's preferred language
   * @returns AI result with textContent, mentionedPlaces, and cities
   */
  private async generateTravelConsultationResponse(query: string, language: string): Promise<TravelConsultationAIResult> {
    const languageText = language === 'zh' ? 'Chinese' : 'English';
    const prompt = TRAVEL_CONSULTATION_PROMPT
      .replace('{query}', query)
      .replace(/\{language\}/g, languageText);

    try {
      const response = await Promise.race([
        this.kouriProvider.generateText(prompt),
        new Promise<string>((resolve) => 
          setTimeout(() => resolve('__TIMEOUT__'), CONFIG.CONSULTATION_TIMEOUT_MS)
        ),
      ]);

      if (!response || response === '__TIMEOUT__') {
        logger.warn('[IntentClassifier] Travel consultation generation timed out');
        // 返回友好的超时消息
        const timeoutMsg = language === 'zh' 
          ? '抱歉，响应超时了。请稍后再试。'
          : 'Sorry, the request timed out. Please try again.';
        return { textContent: timeoutMsg, mentionedPlaces: [], cities: [] };
      }

      // Parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        logger.info(`[IntentClassifier] Generated travel consultation: ${result.textContent?.length || 0} chars, ${result.mentionedPlaces?.length || 0} places, ${result.cities?.length || 0} cities`);
        return {
          textContent: result.textContent || '',
          mentionedPlaces: result.mentionedPlaces || [],
          cities: result.cities || [],
        };
      }

      // If no JSON found, treat the whole response as text content
      logger.warn('[IntentClassifier] No JSON in travel consultation response, using raw text');
      return { textContent: response.trim(), mentionedPlaces: [], cities: [] };

    } catch (error) {
      logger.warn(`[IntentClassifier] Failed to generate travel consultation: ${error}`);
      // 返回友好的错误消息
      const errorMsg = language === 'zh' 
        ? '抱歉，处理请求时出错了。请稍后再试。'
        : 'Sorry, something went wrong. Please try again.';
      return { textContent: errorMsg, mentionedPlaces: [], cities: [] };
    }
  }

  /**
   * Match related places from database based on mentioned places
   * Returns flat array for single city, grouped by city for multiple cities
   * @param mentionedPlaces Places mentioned in AI response
   * @param cities Cities mentioned in AI response
   * @param language Language parameter for tag display ('en' or 'zh')
   * @returns Object with either relatedPlaces (single city) or cityPlaces (multi-city)
   */
  private async matchRelatedPlaces(
    mentionedPlaces: MentionedPlace[],
    cities: string[],
    language: 'en' | 'zh' = 'en'
  ): Promise<{ relatedPlaces?: PlaceResult[]; cityPlaces?: CityPlacesGroup[] }> {
    
    // Group mentioned places by city
    const placesByCity = new Map<string, string[]>();
    for (const place of mentionedPlaces) {
      const cityKey = place.city.toLowerCase().trim();
      const cityPlaces = placesByCity.get(cityKey) || [];
      cityPlaces.push(place.name);
      placesByCity.set(cityKey, cityPlaces);
    }

    // Normalize cities list
    const normalizedCities = cities.map(c => c.trim()).filter(c => c.length > 0);
    const uniqueCities = [...new Set(normalizedCities)];

    logger.info(`[IntentClassifier] Matching places for ${uniqueCities.length} cities: ${uniqueCities.join(', ')}`);

    // Single city scenario: return flat array
    if (uniqueCities.length === 1) {
      const city = uniqueCities[0];
      const placeNames = placesByCity.get(city.toLowerCase()) || [];
      let results = await this.matchPlacesForCity(placeNames, city, language);
      
      // Supplement if less than minimum
      if (results.length < CONFIG.MIN_PLACES_PER_CITY) {
        const supplemented = await this.supplementPlacesFromDB(city, results, CONFIG.MIN_PLACES_PER_CITY - results.length, language);
        results = [...results, ...supplemented];
      }

      logger.info(`[IntentClassifier] Single city "${city}": ${results.length} places`);
      return { relatedPlaces: results };
    }

    // Multi-city scenario: return grouped by city
    const cityPlaces: CityPlacesGroup[] = [];
    for (const city of uniqueCities) {
      const placeNames = placesByCity.get(city.toLowerCase()) || [];
      let results = await this.matchPlacesForCity(placeNames, city, language);
      
      // Supplement if less than minimum
      if (results.length < CONFIG.MIN_PLACES_PER_CITY) {
        const supplemented = await this.supplementPlacesFromDB(city, results, CONFIG.MIN_PLACES_PER_CITY - results.length, language);
        results = [...results, ...supplemented];
      }

      if (results.length > 0) {
        cityPlaces.push({ city, places: results });
        logger.info(`[IntentClassifier] City "${city}": ${results.length} places`);
      }
    }

    return { cityPlaces };
  }

  /**
   * Get all variants of a city name (e.g., Rome/Roma, Venice/Venezia)
   * This helps with exact matching while supporting multiple language variants
   * @param city City name
   * @returns Array of city name variants
   */
  private getCityVariants(city: string): string[] {
    const cityLower = city.toLowerCase().trim();
    
    // 城市名称变体映射
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
      'barcelona': ['Barcelona'],
      'madrid': ['Madrid'],
      'seville': ['Seville', 'Sevilla'],
      'sevilla': ['Seville', 'Sevilla'],
      // France
      'paris': ['Paris'],
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
      // Japan
      'tokyo': ['Tokyo', '東京'],
      'kyoto': ['Kyoto', '京都'],
      'osaka': ['Osaka', '大阪'],
      // China
      'beijing': ['Beijing', '北京'],
      'shanghai': ['Shanghai', '上海'],
      'hong kong': ['Hong Kong', '香港'],
      // Greece
      'athens': ['Athens', 'Athina', 'Αθήνα'],
      // Portugal
      'lisbon': ['Lisbon', 'Lisboa'],
      'lisboa': ['Lisbon', 'Lisboa'],
    };
    
    // 查找变体
    const variants = cityVariantsMap[cityLower];
    if (variants) {
      return variants;
    }
    
    // 如果没有找到变体，返回原始城市名
    return [city];
  }

  /**
   * Match places for a single city from database
   * Only returns places with cover images
   * @param placeNames Place names to match
   * @param city City name
   * @returns Array of matched PlaceResults
   */
  private async matchPlacesForCity(placeNames: string[], city: string, language: 'en' | 'zh' = 'en'): Promise<PlaceResult[]> {
    const results: PlaceResult[] = [];
    const usedIds = new Set<string>();

    // 获取城市的所有变体名称（如 Rome/Roma, Venice/Venezia 等）
    const cityVariants = this.getCityVariants(city);

    for (const name of placeNames) {
      try {
        const candidates = await prisma.place.findMany({
          where: {
            OR: [
              { name: { contains: name, mode: 'insensitive' } },
              { name: { contains: name.split(' ')[0], mode: 'insensitive' } },
            ],
            // 使用精确匹配城市名（支持多个变体）
            city: { in: cityVariants, mode: 'insensitive' },
            AND: [
              { coverImage: { not: null } },
              { coverImage: { not: '' } },
            ],
          },
          take: 5,
        });

        // Filter out candidates without images (double check)
        const withImages = candidates.filter(c => c.coverImage && c.coverImage !== '' && c.coverImage.startsWith('http'));
        
        if (withImages.length === 0) continue;

        // Find best match by name similarity
        let bestMatch: any = null;
        let bestScore = 0;

        for (const candidate of withImages) {
          const similarity = calculateNameSimilarity(name, candidate.name);
          if (similarity > bestScore && similarity >= CONFIG.NAME_SIMILARITY_THRESHOLD) {
            bestMatch = candidate;
            bestScore = similarity;
          }
        }

        if (bestMatch && !usedIds.has(bestMatch.id)) {
          usedIds.add(bestMatch.id);
          results.push(this.toPlaceResult(bestMatch, language));
          logger.info(`[IntentClassifier] Matched "${name}" -> "${bestMatch.name}" (score: ${bestScore.toFixed(2)})`);
        }
      } catch (error) {
        logger.warn(`[IntentClassifier] Error matching place "${name}": ${error}`);
      }
    }

    return results;
  }

  /**
   * Supplement places from database when AI recommendations are insufficient
   * @param city City name
   * @param existingPlaces Already matched places
   * @param needed Number of additional places needed
   * @param language Language parameter for tag display ('en' or 'zh')
   * @returns Array of supplemented PlaceResults
   */
  private async supplementPlacesFromDB(
    city: string,
    existingPlaces: PlaceResult[],
    needed: number,
    language: 'en' | 'zh' = 'en'
  ): Promise<PlaceResult[]> {
    if (needed <= 0) return [];

    const excludeIds = existingPlaces.map(p => p.id);
    const cityVariants = this.getCityVariants(city);

    try {
      const supplemented = await prisma.place.findMany({
        where: {
          // 使用精确匹配城市名（支持多个变体）
          city: { in: cityVariants, mode: 'insensitive' },
          AND: [
            { coverImage: { not: null } },
            { coverImage: { not: '' } },
          ],
          id: { notIn: excludeIds },
        },
        orderBy: [{ rating: 'desc' }, { ratingCount: 'desc' }],
        take: needed * 2, // 多取一些以防有无效图片
      });

      // Filter to ensure all have valid images (must start with http)
      const withImages = supplemented.filter(p => p.coverImage && p.coverImage !== '' && p.coverImage.startsWith('http'));
      
      logger.info(`[IntentClassifier] Supplemented ${withImages.length} places for "${city}"`);
      return withImages.slice(0, needed).map(p => this.toPlaceResult(p, language));
    } catch (error) {
      logger.warn(`[IntentClassifier] Error supplementing places for "${city}": ${error}`);
      return [];
    }
  }

  /**
   * Convert database place to PlaceResult
   * @param dbPlace Database place record
   * @param language Language parameter for tag display ('en' or 'zh')
   * @returns PlaceResult object
   */
  private toPlaceResult(dbPlace: any, language: 'en' | 'zh' = 'en'): PlaceResult {
    const hasRating = dbPlace.rating !== null && dbPlace.rating > 0;
    
    // 解析 images 字段
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
        } catch (e) {
          // 忽略解析错误
        }
      }
    }
    // 如果没有 images，使用 coverImage
    if (images.length === 0 && dbPlace.coverImage) {
      images = [dbPlace.coverImage];
    }
    
    return {
      id: dbPlace.id,
      name: dbPlace.name,
      summary: dbPlace.aiDescription || '',
      coverImage: dbPlace.coverImage || '',
      images: images,
      latitude: dbPlace.latitude,
      longitude: dbPlace.longitude,
      city: dbPlace.city || '',
      country: dbPlace.country || '',
      rating: dbPlace.rating,
      ratingCount: dbPlace.ratingCount,
      tags: this.buildDisplayTags(dbPlace.categoryEn, dbPlace.aiTags, language),
      isVerified: hasRating || dbPlace.isVerified || false,
      source: 'cache',
      address: dbPlace.address || undefined,
      phoneNumber: dbPlace.phoneNumber || undefined,
      website: dbPlace.website || undefined,
      openingHours: dbPlace.openingHours || undefined,
    };
  }

  // ============ Non-Travel Handler Methods ============

  /**
   * Handle non_travel intent - generates Markdown response without database queries
   * @param query User's non-travel query
   * @param language User's preferred language ('en' or 'zh')
   * @returns Handler result with textContent only
   */
  async handleNonTravel(query: string, language: string): Promise<NonTravelHandlerResult> {
    logger.info(`[IntentClassifier] Handling non-travel query: "${query}"`);

    const textContent = await this.generateNonTravelResponse(query, language);

    logger.info(`[IntentClassifier] Non-travel result: textContent=${textContent.length} chars`);

    return { textContent };
  }

  /**
   * Generate AI response for non-travel queries
   * @param query User's query
   * @param language User's preferred language
   * @returns Markdown formatted response text
   */
  private async generateNonTravelResponse(query: string, language: string): Promise<string> {
    const languageText = language === 'zh' ? 'Chinese' : 'English';
    const prompt = NON_TRAVEL_PROMPT
      .replace('{query}', query)
      .replace(/\{language\}/g, languageText);

    try {
      const response = await Promise.race([
        this.kouriProvider.generateText(prompt),
        new Promise<string>((resolve) => 
          setTimeout(() => resolve('__TIMEOUT__'), CONFIG.NON_TRAVEL_TIMEOUT_MS)
        ),
      ]);

      if (!response || response === '__TIMEOUT__') {
        logger.warn('[IntentClassifier] Non-travel response generation timed out');
        // 返回友好的超时消息
        return language === 'zh' 
          ? '抱歉，响应超时了。请稍后再试。'
          : 'Sorry, the request timed out. Please try again.';
      }

      // Clean up the response - remove any JSON wrapping if present
      let textContent = response.trim();
      
      // If response is wrapped in JSON, extract the text content
      const jsonMatch = textContent.match(/\{[\s\S]*"textContent"\s*:\s*"([\s\S]*)"\s*\}/);
      if (jsonMatch && jsonMatch[1]) {
        textContent = jsonMatch[1]
          .replace(/\\n/g, '\n')
          .replace(/\\"/g, '"')
          .trim();
      }

      logger.info(`[IntentClassifier] Generated non-travel response: ${textContent.length} chars`);
      return textContent;

    } catch (error) {
      logger.warn(`[IntentClassifier] Failed to generate non-travel response: ${error}`);
      // 返回友好的错误消息
      return language === 'zh' 
        ? '抱歉，处理请求时出错了。请稍后再试。'
        : 'Sorry, something went wrong. Please try again.';
    }
  }
}

// Export singleton instance
export const intentClassifierService = new IntentClassifierService();
export default intentClassifierService;
