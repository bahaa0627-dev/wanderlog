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
  CONSULTATION_TIMEOUT_MS: 30000, // 30 second timeout for travel consultation
  NON_TRAVEL_TIMEOUT_MS: 20000, // 20 second timeout for non-travel responses
  NAME_SIMILARITY_THRESHOLD: 0.6, // Minimum similarity score for place matching
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

Query: "{query}"
Language: {language}

Requirements:
1. Provide a helpful, engaging response in Markdown format
2. Use headings (##, ###) for structure when appropriate
3. Use emoji to make it friendly 🌍✈️🏛️
4. Keep response concise but informative (200-400 words)
5. When mentioning specific places, use **bold** format: **Place Name** (City)
6. At the end, you may add a prompt like "想了解具体地点推荐吗？" or "Would you like specific place recommendations?"

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

Return the response as plain Markdown text (not JSON).`;

// ============ Prompt Templates ============

/**
 * AI prompt for intent classification
 * Designed to accurately distinguish between the four intent types
 */
const INTENT_CLASSIFICATION_PROMPT = `Analyze this query and determine the user's intent.

Query: "{query}"

Classify into ONE of these intents:

1. "general_search" - User wants to FIND/DISCOVER places (this is the most common intent)
   Examples: "8 restaurants in Tokyo", "cafes in Paris", "best museums in Rome", "design museum", "coffee shops", "art galleries", "Design Museum", "contemporary art museum"
   Key signals:
   - Contains a place CATEGORY/TYPE (museum, cafe, restaurant, gallery, shop, bar, hotel, etc.)
   - Contains city/location + category
   - Contains quantity + category
   - User wants to FIND places to visit
   IMPORTANT: "Design Museum", "Art Museum", "Coffee Shop" are CATEGORY searches, NOT specific places!

2. "specific_place" - User wants info about ONE SPECIFIC named place with a UNIQUE proper name
   Examples: "Eiffel Tower", "Louvre Museum", "Central Park", "Vitra Design Museum (Weil am Rhein)", "Museum für Gestaltung Zürich"
   Key signal: Contains a UNIQUE proper noun that identifies ONE specific place (usually includes location or founder name)
   - "Vitra Design Museum" = specific (Vitra is a brand name)
   - "Design Museum" = general_search (just a category)

3. "travel_consultation" - Travel-related advice WITHOUT wanting to find specific places
   Examples: "欧洲哪里好玩", "Plan a 3-day trip to Rome", "Louvre vs Orsay which is better", "best time to visit Japan"
   Key signal: Asking for travel advice, comparisons, trip planning

4. "non_travel" - NOT travel-related at all
   Examples: "北京天气", "推荐运动方案", "心情不好怎么办", "Python怎么学"
   Key signal: Weather, health, emotions, technology, etc.

DECISION RULES (in order):
1. If query contains category words (museum, cafe, restaurant, gallery, etc.) AND user wants to FIND places → "general_search"
2. If query is a unique proper noun identifying ONE specific place → "specific_place"
3. If query asks for travel advice/planning without finding places → "travel_consultation"
4. If not travel-related → "non_travel"

Return JSON only:
{
  "intent": "specific_place" | "general_search" | "travel_consultation" | "non_travel",
  "placeName": "exact place name if specific_place",
  "placeNames": ["place1", "place2"] if travel_consultation mentions specific places,
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
 */
const TRAVEL_CONSULTATION_KEYWORDS = [
  // Comparison
  'vs', '还是', '哪个更', 'which is better', 'compare',
  // Planning
  'plan', '计划', 'itinerary', '行程', 'trip', '旅行',
  // Advice
  '哪里好玩', '推荐', 'recommend', 'suggest', '建议', 'advice',
  // Duration
  'day trip', '一日游', '几天', 'how many days',
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

    // 2. Check for category keywords FIRST (before specific place)
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

    // 3. Check for specific place query (only if no category detected)
    const specificPlace = this.detectSpecificPlace(query);
    if (specificPlace) {
      logger.info(`[IntentClassifier] Fallback: specific_place (${specificPlace})`);
      return {
        intent: 'specific_place',
        placeName: specificPlace,
        confidence: 0.7,
      };
    }

    // 4. Check for travel consultation
    if (this.isTravelConsultation(lower)) {
      logger.info('[IntentClassifier] Fallback: travel_consultation');
      return {
        intent: 'travel_consultation',
        confidence: 0.6,
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
   * @param placeName The name of the specific place to look up
   * @param language User's preferred language ('en' or 'zh')
   * @returns Handler result with description and optional matched place
   */
  async handleSpecificPlace(placeName: string, language: string): Promise<SpecificPlaceHandlerResult> {
    logger.info(`[IntentClassifier] Handling specific place query: "${placeName}"`);

    // Run AI description generation and database matching in parallel
    const [description, matchedPlace] = await Promise.all([
      this.generatePlaceDescription(placeName, language),
      this.matchPlaceFromDatabase(placeName, language as 'en' | 'zh'),
    ]);

    // If place found but no image, or no place found at all, search for image
    if (matchedPlace && (!matchedPlace.coverImage || matchedPlace.coverImage === '')) {
      logger.info(`[IntentClassifier] Place "${matchedPlace.name}" has no image, searching online...`);
      try {
        const imageUrl = await this.kouriProvider.searchPlaceImage(placeName, matchedPlace.city || '');
        if (imageUrl) {
          matchedPlace.coverImage = imageUrl;
          logger.info(`[IntentClassifier] Found image for "${matchedPlace.name}": ${imageUrl}`);
          
          // Save image to database for future use (async, don't wait)
          this.saveImageToDatabase(matchedPlace.id, imageUrl).catch(err => 
            logger.warn(`[IntentClassifier] Failed to save image to DB: ${err}`)
          );
        }
      } catch (error) {
        logger.warn(`[IntentClassifier] Image search failed for "${placeName}": ${error}`);
      }
    }

    logger.info(`[IntentClassifier] Specific place result: description=${description.length} chars, place=${matchedPlace ? matchedPlace.name : 'null'}`);

    return {
      description,
      place: matchedPlace,
    };
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
        // Check for exact match or substring match
        if (inputWord === dbWord || 
            inputWord.includes(dbWord) || 
            dbWord.includes(inputWord) ||
            this.levenshteinSimilarity(inputWord, dbWord) > 0.8) {
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
    
    if (!aiResult.textContent) {
      logger.warn('[IntentClassifier] Failed to generate travel consultation response');
      return { textContent: '' };
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
      .replace('{language}', languageText);

    try {
      const response = await Promise.race([
        this.kouriProvider.generateText(prompt),
        new Promise<string>((resolve) => 
          setTimeout(() => resolve(''), CONFIG.CONSULTATION_TIMEOUT_MS)
        ),
      ]);

      if (!response) {
        logger.warn('[IntentClassifier] Travel consultation generation timed out');
        return { textContent: '', mentionedPlaces: [], cities: [] };
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
      return { textContent: '', mentionedPlaces: [], cities: [] };
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
   * Match places for a single city from database
   * Only returns places with cover images
   * @param placeNames Place names to match
   * @param city City name
   * @returns Array of matched PlaceResults
   */
  private async matchPlacesForCity(placeNames: string[], city: string, language: 'en' | 'zh' = 'en'): Promise<PlaceResult[]> {
    const results: PlaceResult[] = [];
    const usedIds = new Set<string>();

    for (const name of placeNames) {
      try {
        const candidates = await prisma.place.findMany({
          where: {
            OR: [
              { name: { contains: name, mode: 'insensitive' } },
              { name: { contains: name.split(' ')[0], mode: 'insensitive' } },
            ],
            city: { contains: city, mode: 'insensitive' },
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

    try {
      const supplemented = await prisma.place.findMany({
        where: {
          city: { contains: city, mode: 'insensitive' },
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
    return {
      id: dbPlace.id,
      name: dbPlace.name,
      summary: dbPlace.aiDescription || '',
      coverImage: dbPlace.coverImage || '',
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
      .replace('{language}', languageText);

    try {
      const response = await Promise.race([
        this.kouriProvider.generateText(prompt),
        new Promise<string>((resolve) => 
          setTimeout(() => resolve(''), CONFIG.NON_TRAVEL_TIMEOUT_MS)
        ),
      ]);

      if (!response) {
        logger.warn('[IntentClassifier] Non-travel response generation timed out');
        return '';
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
      return '';
    }
  }
}

// Export singleton instance
export const intentClassifierService = new IntentClassifierService();
export default intentClassifierService;
