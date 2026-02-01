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
import { OpenRouterProvider } from './aiProviders/OpenRouterProvider';
import aiService from './aiService';
import prisma from '../config/database';
import { calculateNameSimilarity } from './placeMatcherService';
import geocodeService from './reverseGeocodeService';
import { canMakeAICall, incrementAICallCount, getAICallCount, getMaxAICallsPerRequest } from './aiCallCounter';
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
  CONSULTATION_TIMEOUT_MS: 90000, // 90 second timeout for travel consultation (increased for web search)
  NON_TRAVEL_TIMEOUT_MS: 60000, // 60 second timeout for non-travel responses (increased)
  NAME_SIMILARITY_THRESHOLD: 0.6, // Minimum similarity score for place matching
  SPECIFIC_PLACE_SIMILARITY_THRESHOLD: 0.75, // Higher threshold for specific_place to avoid wrong matches
  MAX_DESCRIPTION_WORDS: 140, // Maximum words in description
  MIN_PLACES_PER_CITY: 3, // Minimum places per city section
};

// ============ Prompt Templates ============

/**
 * AI prompt for generating specific place descriptions
 * Designed to produce concise, engaging introductions under 100 words
 */
const SPECIFIC_PLACE_DESCRIPTION_PROMPT = `Write a clear, engaging introduction about "{placeName}" for a traveler.

Requirements:
1. Include a concise basic fact: what it is, where it is, and why it's notable
2. Add 1-2 practical visiting tips (best time, tickets, viewpoints, or queues)
3. Keep it 3-5 sentences, about 90-140 words if in English, or 120-200 Chinese characters if in Chinese
4. Be informative and specific, avoid vague fluff
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
4. IMPORTANT: When asking about restaurants/shops/places, recommend AT LEAST 6-10 specific places, not just 2-3
5. Keep response informative (300-600 words for place recommendations)
6. When mentioning specific places in {language}, format them as:
   - If {language} is Chinese: **中文地名 (English Name)** - e.g., **美人鱼雕像 (The Little Mermaid)**
   - If place name is already in English or has no translation, just use **English Name** without parentheses
   - Do NOT put city name in parentheses, only the English place name
7. For each place, include: address, brief description/style, website if available
8. CRITICAL: Your ENTIRE response MUST be in {language}. Do NOT mix languages.
9. At the end, you may add a follow-up prompt in {language}

Return JSON:
{
  "textContent": "Your Markdown response here...",
  "mentionedPlaces": [
    { "name": "English Place Name", "city": "City", "address": "Full Address", "website": "https://...", "country": "Country", "rating": 4.5, "ratingCount": 1200 }
  ],
  "cities": ["EnglishCity1", "EnglishCity2"]
}

⚠️ IMPORTANT for mentionedPlaces and cities:
- MUST include AT LEAST 5-10 places in mentionedPlaces array when recommending restaurants/cafes/shops
- The "name" field MUST be in ENGLISH (e.g., "Eiffel Tower", NOT "埃菲尔铁塔")
- The "city" field MUST be in ENGLISH (e.g., "Paris", NOT "巴黎")
- Include "address" with full street address if known from web search
- Include "website" with official website URL if found
- Include "country" with the country name
- Include "rating" with the rating score (e.g., 4.5 out of 5) if found from Google/Yelp/TripAdvisor
- Include "ratingCount" with the number of reviews (e.g., 1200) if found
- This is for database matching. Use official English names.`;

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
  'best', 'top', 'good', 'nice', 'great', 'famous', 'popular', 'local', 'hidden',
  'gems', 'favorites', 'recommendations', 'things', 'attractions', 'sights',
  '餐厅', '咖啡馆', '地方', '景点', '博物馆', '酒吧', '酒店', '商店',
  '最好', '推荐', '必去', '网红', '打卡',
];

/**
 * 真正的数据库 category_slug 值
 * 这些是数据库中 Place 表的 categorySlug 字段可能的值
 * 来源：normalizationService.ts APIFY_CATEGORY_MAPPINGS
 */
const CATEGORY_SLUGS = [
  // 数据库中的真正 category_slug 值
  'museum', 'art_gallery', 'cafe', 'bakery', 'restaurant', 
  'thrift_store', 'landmark', 'bar', 'hotel', 'church', 
  'temple', 'university', 'zoo', 'library', 'bookstore', 
  'cemetery', 'park', 'castle', 'market', 'shopping_mall', 
  'yarn_store', 'shop',
];

/**
 * Category 关键词映射到 category_slug
 * 用于将用户查询中的关键词转换为数据库 categorySlug
 */
const CATEGORY_KEYWORD_TO_SLUG: Record<string, string> = {
  // cafe
  'cafe': 'cafe', 'coffee': 'cafe', 'coffee shop': 'cafe', 'espresso': 'cafe',
  '咖啡': 'cafe', '咖啡馆': 'cafe', '咖啡店': 'cafe',
  // bakery
  'bakery': 'bakery', 'pastry': 'bakery', 'patisserie': 'bakery',
  '面包店': 'bakery', '烘焙': 'bakery',
  // restaurant
  'restaurant': 'restaurant', 'dining': 'restaurant', 'bistro': 'restaurant',
  'ramen': 'restaurant', 'sushi': 'restaurant', 'pizza': 'restaurant',
  '餐厅': 'restaurant', '餐馆': 'restaurant', '饭店': 'restaurant',
  '拉面': 'restaurant', '拉麵': 'restaurant', '拉面店': 'restaurant', '寿司': 'restaurant',
  // bar
  'bar': 'bar', 'pub': 'bar', 'cocktail': 'bar',
  '酒吧': 'bar',
  // museum
  'museum': 'museum',
  '博物馆': 'museum',
  // art_gallery
  'gallery': 'art_gallery', 'art gallery': 'art_gallery',
  '美术馆': 'art_gallery', '画廊': 'art_gallery', '艺术馆': 'art_gallery',
  // temple
  'temple': 'temple', 'shrine': 'temple',
  '寺': 'temple', '庙': 'temple', '神社': 'temple',
  // church
  'church': 'church', 'cathedral': 'church', 'chapel': 'church',
  '教堂': 'church',
  // castle
  'castle': 'castle', 'palace': 'castle', 'fortress': 'castle',
  '城堡': 'castle', '宫殿': 'castle',
  // park
  'park': 'park', 'garden': 'park', 'botanical': 'park',
  '公园': 'park', '花园': 'park',
  // landmark
  'landmark': 'landmark', 'monument': 'landmark', 'attraction': 'landmark',
  '地标': 'landmark', '景点': 'landmark',
  // market
  'market': 'market', 'bazaar': 'market', 'food market': 'market',
  '市场': 'market', '夜市': 'market',
  // shopping_mall
  'mall': 'shopping_mall', 'shopping mall': 'shopping_mall', 'shopping center': 'shopping_mall',
  '商场': 'shopping_mall',
  // bookstore
  'bookstore': 'bookstore', 'book shop': 'bookstore',
  '书店': 'bookstore',
  // hotel
  'hotel': 'hotel', 'hostel': 'hotel',
  '酒店': 'hotel', '民宿': 'hotel', '青旅': 'hotel',
  // zoo
  'zoo': 'zoo', 'aquarium': 'zoo',
  '动物园': 'zoo', '水族馆': 'zoo',
  // thrift_store
  'thrift store': 'thrift_store', 'second hand': 'thrift_store', 'vintage shop': 'thrift_store',
  '二手店': 'thrift_store', '古着店': 'thrift_store',
  // shop (通用)
  'shop': 'shop', 'store': 'shop',
  '商店': 'shop',
};

/**
 * Tag 关键词（不是 category，用于 tags/aiTags 搜索）
 * 这些关键词会用于搜索 place 的 tags 和 aiTags 字段
 */
const TAG_KEYWORDS = [
  // Architecture & Design styles（建筑风格标签）
  'architecture', 'architectural', 'brutalist', 'art deco', 'gothic', 
  'modern', 'contemporary', 'minimalist', 'baroque', 'renaissance',
  '建筑', '现代', '古典', '极简',
  // Nature & Outdoors（自然户外标签）
  'beach', 'lake', 'mountain', 'hiking', 'viewpoint', 'lookout', 
  'scenic', 'nature', 'waterfall', 'coastal', 'seaside',
  '海滩', '沙滩', '湖', '山', '徒步', '观景',
  // Lifestyle（生活方式标签）
  'spa', 'wellness', 'yoga', 'rooftop', 'terrace',
  '温泉', '水疗',
  // Entertainment（娱乐标签）
  'nightlife', 'club', 'disco', 'live music', 'jazz', 'karaoke',
  '夜生活', '俱乐部',
  // Food styles（美食风格标签）
  'brunch', 'breakfast', 'street food', 'fine dining', 'vegan', 'vegetarian',
  '早午餐', '街头小吃',
  // Atmosphere（氛围标签）
  'romantic', 'cozy', 'trendy', 'historic', 'photogenic', 'instagrammable',
  '浪漫', '温馨', '网红', '文艺',
  // Theme（主题标签）
  'vintage', 'antique', 'art', 'history', 'historical', 'heritage', 
  'ancient', 'ruins', 'religious', 'spiritual',
  '复古', '古董', '艺术', '历史', '古迹', '遗址',
  // Other
  'winery', 'brewery', 'vineyard', 
  '酒庄', '酿酒厂',
];

/**
 * City names and variants for detection
 * 扩展更多城市
 */
const KNOWN_CITIES = [
  // Europe
  'paris', 'london', 'rome', 'barcelona', 'madrid', 'berlin', 'amsterdam',
  'vienna', 'prague', 'florence', 'venice', 'milan', 'munich', 'hamburg',
  'lisbon', 'porto', 'dublin', 'edinburgh', 'brussels', 'antwerp',
  'zurich', 'geneva', 'stockholm', 'copenhagen', 'oslo', 'helsinki',
  'budapest', 'warsaw', 'krakow', 'athens', 'santorini', 'mykonos',
  'nice', 'lyon', 'marseille', 'bordeaux', 'naples', 'turin', 'bologna',
  'seville', 'valencia', 'granada', 'malaga', 'ibiza',
  // Asia
  'tokyo', 'kyoto', 'osaka', 'nara', 'hiroshima', 'fukuoka', 'sapporo', 'okinawa',
  'seoul', 'busan', 'jeju',
  'beijing', 'shanghai', 'hong kong', 'macau', 'taipei', 'kaohsiung',
  'bangkok', 'chiang mai', 'phuket', 'krabi', 'pattaya',
  'singapore', 'kuala lumpur', 'penang', 'langkawi',
  'bali', 'jakarta', 'yogyakarta',
  'hanoi', 'ho chi minh', 'da nang', 'hoi an',
  'manila', 'cebu', 'boracay',
  'mumbai', 'delhi', 'jaipur', 'goa', 'agra',
  // Americas
  'new york', 'los angeles', 'san francisco', 'chicago', 'miami', 'las vegas',
  'boston', 'seattle', 'portland', 'austin', 'new orleans', 'washington dc',
  'toronto', 'vancouver', 'montreal', 'quebec',
  'mexico city', 'cancun', 'tulum', 'oaxaca',
  'rio de janeiro', 'sao paulo', 'buenos aires', 'lima', 'bogota',
  // Oceania
  'sydney', 'melbourne', 'brisbane', 'perth', 'auckland', 'queenstown',
  // Middle East & Africa
  'dubai', 'abu dhabi', 'doha', 'istanbul', 'tel aviv', 'jerusalem',
  'cape town', 'johannesburg', 'marrakech', 'cairo',
  // Chinese city names (will be mapped to English)
  '巴黎', '伦敦', '罗马', '巴塞罗那', '马德里', '柏林', '阿姆斯特丹',
  '维也纳', '布拉格', '佛罗伦萨', '威尼斯', '米兰', '慕尼黑',
  '里斯本', '都柏林', '布鲁塞尔', '苏黎世', '斯德哥尔摩', '哥本哈根',
  '布达佩斯', '华沙', '雅典',
  '东京', '京都', '大阪', '奈良', '札幌', '冲绳',
  '首尔', '釜山', '济州',
  '北京', '上海', '香港', '澳门', '台北', '高雄',
  '曼谷', '清迈', '普吉', '芭提雅',
  '新加坡', '吉隆坡', '槟城',
  '巴厘岛', '雅加达',
  '河内', '胡志明', '岘港', '会安',
  '马尼拉', '宿务', '长滩岛',
  '孟买', '德里', '斋浦尔', '果阿',
  '纽约', '洛杉矶', '旧金山', '芝加哥', '迈阿密', '拉斯维加斯',
  '多伦多', '温哥华', '蒙特利尔',
  '墨西哥城', '坎昆',
  '里约', '圣保罗', '布宜诺斯艾利斯',
  '悉尼', '墨尔本', '奥克兰',
  '迪拜', '阿布扎比', '伊斯坦布尔', '特拉维夫',
  '开普敦', '马拉喀什', '开罗',
];

/**
 * 中文城市名到英文城市名的映射
 * 用于确保 detectCity 始终返回英文城市名
 */
const CHINESE_CITY_TO_ENGLISH: Record<string, string> = {
  // Europe
  '巴黎': 'Paris', '伦敦': 'London', '罗马': 'Rome', 
  '巴塞罗那': 'Barcelona', '马德里': 'Madrid', '柏林': 'Berlin', 
  '阿姆斯特丹': 'Amsterdam', '维也纳': 'Vienna', '布拉格': 'Prague',
  '佛罗伦萨': 'Florence', '威尼斯': 'Venice', '米兰': 'Milan', 
  '慕尼黑': 'Munich', '里斯本': 'Lisbon', '都柏林': 'Dublin',
  '布鲁塞尔': 'Brussels', '苏黎世': 'Zurich', '斯德哥尔摩': 'Stockholm',
  '哥本哈根': 'Copenhagen', '布达佩斯': 'Budapest', '华沙': 'Warsaw', 
  '雅典': 'Athens',
  // Asia
  '东京': 'Tokyo', '京都': 'Kyoto', '大阪': 'Osaka', '奈良': 'Nara',
  '札幌': 'Sapporo', '冲绳': 'Okinawa', '广岛': 'Hiroshima', '福冈': 'Fukuoka',
  '首尔': 'Seoul', '釜山': 'Busan', '济州': 'Jeju',
  '北京': 'Beijing', '上海': 'Shanghai', '香港': 'Hong Kong', 
  '澳门': 'Macau', '台北': 'Taipei', '高雄': 'Kaohsiung',
  '曼谷': 'Bangkok', '清迈': 'Chiang Mai', '普吉': 'Phuket', '芭提雅': 'Pattaya',
  '新加坡': 'Singapore', '吉隆坡': 'Kuala Lumpur', '槟城': 'Penang',
  '巴厘岛': 'Bali', '雅加达': 'Jakarta',
  '河内': 'Hanoi', '胡志明': 'Ho Chi Minh', '岘港': 'Da Nang', '会安': 'Hoi An',
  '马尼拉': 'Manila', '宿务': 'Cebu', '长滩岛': 'Boracay',
  '孟买': 'Mumbai', '德里': 'Delhi', '斋浦尔': 'Jaipur', '果阿': 'Goa',
  // Americas
  '纽约': 'New York', '洛杉矶': 'Los Angeles', '旧金山': 'San Francisco',
  '芝加哥': 'Chicago', '迈阿密': 'Miami', '拉斯维加斯': 'Las Vegas',
  '多伦多': 'Toronto', '温哥华': 'Vancouver', '蒙特利尔': 'Montreal',
  '墨西哥城': 'Mexico City', '坎昆': 'Cancun',
  '里约': 'Rio de Janeiro', '圣保罗': 'Sao Paulo', '布宜诺斯艾利斯': 'Buenos Aires',
  // Oceania
  '悉尼': 'Sydney', '墨尔本': 'Melbourne', '奥克兰': 'Auckland',
  // Middle East & Africa
  '迪拜': 'Dubai', '阿布扎比': 'Abu Dhabi', '伊斯坦布尔': 'Istanbul', 
  '特拉维夫': 'Tel Aviv', '开普敦': 'Cape Town', '马拉喀什': 'Marrakech', 
  '开罗': 'Cairo',
};

/**
 * Non-travel keywords that indicate non_travel intent
 * 注意：这些关键词必须在非旅行上下文中才算 non_travel
 */
const NON_TRAVEL_KEYWORDS = [
  // Health & Fitness (非旅行场景)
  '运动方案', '健身计划', '减肥方法', '健康饮食',
  'workout plan', 'fitness routine', 'diet plan',
  // Emotions (非旅行场景)
  '心情不好', '难过怎么办', '焦虑怎么办', '压力大',
  'feeling sad', 'feeling anxious', 'stressed out',
  // Technology (完全无关)
  'python教程', 'javascript教程', 'coding tutorial', '编程学习',
  'software development', 'web development', 'app development',
  // General non-travel (完全无关)
  '工作面试', '求职简历', '考试复习', '学习方法',
  'job interview', 'resume tips', 'study tips',
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

  private async generateTextWithFallback(prompt: string, timeoutMs: number): Promise<string> {
    // Check global AI call limit FIRST (global counter is enforced in aiService too)
    if (!canMakeAICall()) {
      logger.warn(`[IntentClassifier] AI call blocked due to limit (${getAICallCount()}/${getMaxAICallsPerRequest()})`);
      return '';
    }
    
    try {
      const timeout = Math.min(timeoutMs, 60000);
      return await Promise.race([
        aiService.executeWithFallback(
          (provider) => provider.generateText(prompt),
          'intentClassifier.generateText',
        ),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error('AI timeout')), timeout)),
      ]);
    } catch (error) {
      logger.warn(`[IntentClassifier] AI text generation failed: ${error}`);
      return '';
    }
  }

  private normalizeMarkdownOutput(raw: string): string {
    let text = (raw || '').trim();
    if (!text) return '';

    text = text.replace(/```[\s\S]*?```/g, '').trim();

    if ((text.startsWith('{') && text.endsWith('}')) ||
        (text.startsWith('[') && text.endsWith(']')) ||
        (text.startsWith('"') && text.endsWith('"'))) {
      try {
        const parsed = JSON.parse(text);
        if (typeof parsed === 'string') {
          text = parsed;
        } else if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (typeof item === 'string' && item.trim()) {
              text = item;
              break;
            }
            if (item && typeof item === 'object') {
              const candidate = (item as any).textContent || (item as any).response || (item as any).content || (item as any).description;
              if (typeof candidate === 'string' && candidate.trim()) {
                text = candidate;
                break;
              }
            }
          }
        } else if (parsed && typeof parsed === 'object') {
          const candidate = (parsed as any).textContent || (parsed as any).response || (parsed as any).content || (parsed as any).description;
          if (candidate && typeof candidate === 'string') {
            text = candidate;
          }
        }
      } catch (_) {
        // ignore parse errors
      }
    }

    text = text
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .trim();

    // Handle common "half-JSON" wrappers like: "response": ##...
    // Also support full-width quotes/colon used in Chinese typography.
    text = text
      .replace(/^\s*["“]?response["”]?\s*[:：]\s*/i, '')
      .replace(/^\s*["“]?description["”]?\s*[:：]\s*/i, '')
      .replace(/^\s*["“]?textContent["”]?\s*[:：]\s*/i, '')
      .replace(/^\s*["“]?content["”]?\s*[:：]\s*/i, '')
      .trim();

    text = text.replace(/^[\[\{\"\s]+/, '').replace(/[\]\}\"\s]+$/, '').trim();
    return text;
  }

  private startsWithChineseCity(query: string): boolean {
    const q = (query || '').trim();
    if (!q) return false;
    const known = [
      '东京', '大阪', '京都', '巴黎', '伦敦', '纽约', '洛杉矶', '旧金山',
      '北京', '上海', '广州', '深圳', '香港', '台北', '首尔', '釜山',
      '曼谷', '清迈', '新加坡', '吉隆坡', '罗马', '米兰', '威尼斯', '巴塞罗那',
    ];
    return known.some((c) => q.startsWith(c));
  }

  private looksLikeChineseSpecificPlace(query: string): boolean {
    const q = (query || '').trim();
    if (!q) return false;
    if (!/[\u4E00-\u9FFF]/.test(q)) return false;

    const compact = q.replace(/\s+/g, '');
    if (compact.length < 2 || compact.length > 16) return false;

    // If it clearly asks for lists/recommendations/how-to, treat as NOT specific_place.
    if (/[，,、\/]/.test(compact)) return false;
    if (/[0-9]/.test(compact)) return false;
    if (/[一二三四五六七八九十]+(个|家|处|条|天|日)/.test(compact)) return false;

    // Category/list intent hints (general_search)
    const generalHints = [
      '推荐', '哪里', '附近', '必去', '清单', '排行', 'top', '地图', '打卡',
      '攻略', '行程', '路线', '一日游', '二日', '三日', '几日', '几天',
      '怎么', '如何', '门票', '开放时间', '交通', '地铁', '机场', '签证',
      '餐厅', '饭店', '酒店', '住宿', '咖啡', '拉面', '寿司', '火锅', '烤肉',
      '酒吧', '夜景', '购物', '商场', '超市', '景点',
      '博物馆', '美术馆', '公园', '温泉', '海滩', '滑雪',
    ];
    if (generalHints.some((h) => compact.includes(h))) {
      // Exception: place names like “卢浮宫博物馆” should still be specific.
      // If it contains a category word but does NOT start with a known city and has extra proper-noun prefix, allow.
      const categoryWords = ['博物馆', '美术馆', '公园', '餐厅', '饭店', '酒店', '咖啡馆', '酒吧'];
      const hitCategory = categoryWords.find((w) => compact.includes(w));
      if (hitCategory) {
        if (compact == hitCategory) return false;
        if (this.startsWithChineseCity(compact)) return false;
        const idx = compact.indexOf(hitCategory);
        const prefix = idx > 0 ? compact.slice(0, idx) : '';
        if (prefix.length >= 2) return true;
      }
      return false;
    }

    return true;
  }

  private containsAnyAlias(text: string, aliases: string[]): boolean {
    const normalized = (text || '').toLowerCase();
    return aliases.some((alias) => {
      const key = (alias || '').toLowerCase().trim();
      return key.length > 0 && normalized.includes(key);
    });
  }

  private normalizeCityForMatching(city: string): string {
    const raw = (city || '').replace(/[()（）]/g, '').trim();
    if (!raw) return '';
    if (!/[ -]/.test(raw)) {
      // fallthrough to CJK map below
    } else {
      return raw;
    }

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
    return cityKeywordMap[raw] || raw;
  }

  private normalizePlaceNameForMatching(name: string): string {
    return (name || '')
      .replace(/[()（）]/g, '')
      .replace(/\s*（[^）]*）/g, '')
      .replace(/\s*\([^)]*\)/g, '')
      .trim();
  }

  private escapeRegExp(text: string): string {
    return (text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async extractMentionedPlacesFromText(
    text: string,
    language: string,
    requiredCity?: string,
  ): Promise<MentionedPlace[]> {
    const input = (text || '').trim();
    if (!input) return [];

    const languageText = language === 'zh' ? 'Chinese' : 'English';
    const cityHint = requiredCity || '';

    const prompt = `Extract the specific place names mentioned in the following travel text.

Text (${languageText}):
"""
${input}
"""

City hint: ${cityHint || 'unknown'}

Requirements:
- Return up to 12 places
- If a city is clearly mentioned, include it
- Return JSON only, no extra text

Return JSON:
{
  "mentionedPlaces": [
    { "name": "Place Name", "city": "City" }
  ],
  "cities": ["City"]
}`;

    try {
      const response = await this.generateTextWithFallback(prompt, 12000);
      if (!response) return [];
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return [];
      const parsed = JSON.parse(jsonMatch[0]);
      const items = Array.isArray(parsed.mentionedPlaces) ? parsed.mentionedPlaces : [];
      return items
        .filter((p: any) => typeof p?.name === 'string' && p.name.trim())
        .map((p: any) => ({ name: p.name.trim(), city: (p.city || '').trim() } as MentionedPlace));
    } catch (error) {
      logger.warn(`[IntentClassifier] Failed to extract mentioned places from text: ${error}`);
      return [];
    }
  }

  /**
   * Extract place names from text content using regex patterns
   * Looks for **地点名 (English Name)** or **English Name** patterns
   * @param text Text content to extract from
   * @param defaultCity Default city for extracted places
   * @returns Array of MentionedPlace objects
   */
  private extractPlaceNamesFromText(text: string, defaultCity: string): MentionedPlace[] {
    const places: MentionedPlace[] = [];
    const seenNames = new Set<string>();

    // Pattern 1: **中文名 (English Name)** or **English Name**
    const boldPattern = /\*\*([^*]+)\*\*/g;
    let match;
    
    while ((match = boldPattern.exec(text)) !== null) {
      let name = match[1].trim();
      
      // Skip if it's just a number like "1." or section headers
      if (/^\d+\.?$/.test(name) || name.length < 3) continue;
      
      // Extract English name from parentheses if present
      const parenMatch = name.match(/[（(]([A-Za-z][^）)]+)[）)]/);
      if (parenMatch) {
        name = parenMatch[1].trim();
      }
      
      // Skip duplicates
      const nameLower = name.toLowerCase();
      if (seenNames.has(nameLower)) continue;
      seenNames.add(nameLower);
      
      places.push({ name, city: defaultCity });
    }

    // Pattern 2: ### 1. **Name** or similar numbered headings with bold
    const headingPattern = /###?\s*\d+\.\s*\*\*([^*]+)\*\*/g;
    while ((match = headingPattern.exec(text)) !== null) {
      let name = match[1].trim();
      
      // Extract English name from parentheses if present
      const parenMatch = name.match(/[（(]([A-Za-z][^）)]+)[）)]/);
      if (parenMatch) {
        name = parenMatch[1].trim();
      }
      
      const nameLower = name.toLowerCase();
      if (seenNames.has(nameLower)) continue;
      seenNames.add(nameLower);
      
      places.push({ name, city: defaultCity });
    }

    logger.info(`[IntentClassifier] Extracted ${places.length} place names from text`);
    return places;
  }

  /**
   * Enrich mentionedPlaces with website URLs extracted from textContent
   * Matches [text](url) patterns and finds corresponding places
   * @param text Text content containing markdown links
   * @param mentionedPlaces Array of mentioned places to enrich
   * @returns Enriched array of mentioned places
   */
  private enrichPlacesWithWebsitesFromText(text: string, mentionedPlaces: MentionedPlace[]): MentionedPlace[] {
    // Extract all markdown links: [text](url)
    const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
    const links: { text: string; url: string }[] = [];
    let match;
    
    while ((match = linkPattern.exec(text)) !== null) {
      links.push({ text: match[1], url: match[2] });
    }
    
    if (links.length === 0) {
      return mentionedPlaces;
    }
    
    logger.info(`[IntentClassifier] Found ${links.length} website links in textContent`);
    
    // Match links to places
    return mentionedPlaces.map(place => {
      // Already has website
      if ((place as any).website) return place;
      
      const placeName = place.name.toLowerCase();
      
      // Find matching link
      for (const link of links) {
        const linkText = link.text.toLowerCase();
        // Match if link text contains place name or vice versa
        if (linkText.includes(placeName) || placeName.includes(linkText) ||
            // Also match partial names (e.g., "Ichiran" matches "一兰官方网站")
            placeName.split(/\s+/).some(word => word.length > 3 && linkText.includes(word))) {
          logger.info(`[IntentClassifier] Matched website "${link.url}" to "${place.name}"`);
          return { ...place, website: link.url };
        }
      }
      
      return place;
    });
  }

  /**
   * Classify user query intent using rule-based detection
   * 
   * OPTIMIZATION: Always use rule-based classification to save AI costs.
   * The fallbackClassify method handles all four intent types accurately:
   * - travel_consultation: detected by keywords (how to, X days, plan, etc.)
   * - general_search: detected by category keywords (cafe, museum, etc.)
   * - specific_place: detected by proper noun patterns
   * - non_travel: detected by non-travel keywords
   */
  async classify(query: string, language: string): Promise<IntentResult> {
    logger.info(`[IntentClassifier] Classifying query: "${query}"`);
    
    // Always use rule-based classification to save AI costs
    // The fallbackClassify method is comprehensive and handles all intent types
    return this.fallbackClassify(query, language);
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
    const hasTags = this.detectTags(lower);
    const hasCity = this.detectCity(lower);
    const count = this.detectCount(query);
    
    // If query contains a category keyword, it's likely a general search
    // unless it also contains a very specific proper noun
    if (hasCategory || hasTags.length > 0) {
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
      
      // Otherwise, it's a general search for that category/tags
      const logCategory = hasCategory || (hasTags.length > 0 ? `tags:${hasTags.join(',')}` : 'none');
      logger.info(`[IntentClassifier] Fallback: general_search (category: ${logCategory}, city: ${hasCity})`);
      return {
        intent: 'general_search',
        city: hasCity || undefined,
        category: hasCategory || undefined,
        tags: hasTags.length > 0 ? hasTags : undefined,
        count: count || undefined,
        confidence: 0.7,
      };
    }

    // 4. Check for specific place query (only if no category and no consultation keywords)
    if (this.looksLikeChineseSpecificPlace(query)) {
      logger.info(`[IntentClassifier] Fallback: specific_place (CJK heuristic: ${query})`);
      return {
        intent: 'specific_place',
        placeName: query.trim(),
        confidence: 0.65,
      };
    }

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
   * 增强逻辑：只有在明确非旅行上下文时才判定为 non_travel
   */
  private isNonTravelQuery(lower: string): boolean {
    // 首先检查是否有城市名 - 如果有城市名，很可能是旅行相关
    const hasCity = this.detectCity(lower);
    if (hasCity) {
      return false; // 有城市名，不是 non_travel
    }
    
    // 检查是否有旅行相关关键词
    const travelIndicators = [
      'travel', 'trip', 'visit', 'tour', 'vacation', 'holiday',
      '旅游', '旅行', '出行', '游玩', '度假',
    ];
    if (travelIndicators.some(word => lower.includes(word))) {
      return false; // 有旅行关键词，不是 non_travel
    }
    
    // 只有明确的非旅行关键词才判定
    return NON_TRAVEL_KEYWORDS.some(keyword => lower.includes(keyword));
  }

  /**
   * Detect specific place name from query
   * 增强逻辑：更准确地识别具体地名
   */
  private detectSpecificPlace(query: string): string | null {
    // 先检查是否是明显的搜索模式
    const searchPatterns = [
      /(?:find|show|recommend|suggest|list)\s+/i,
      /(?:best|top|good|popular)\s+/i,
      /\d+\s+(?:best|top|places?|spots?)/i,
    ];
    if (searchPatterns.some(p => p.test(query))) {
      return null; // 这是搜索，不是具体地点
    }
    
    for (const pattern of SPECIFIC_PLACE_PATTERNS) {
      const match = query.match(pattern);
      if (match && match[1]) {
        const potentialPlace = match[1].trim();
        // Exclude generic words and common adjectives
        if (!GENERIC_WORDS.some(w => potentialPlace.toLowerCase().includes(w))) {
          // 额外检查：地名通常包含专有名词特征
          // 至少有一个非通用词
          const words = potentialPlace.split(/\s+/);
          const hasProperNoun = words.some(w => 
            w.length > 2 && 
            w[0] === w[0].toUpperCase() &&
            !['The', 'And', 'For', 'With', 'Best', 'Top', 'Good'].includes(w)
          );
          if (hasProperNoun || /[\u4e00-\u9fff]/.test(potentialPlace)) {
            return potentialPlace;
          }
        }
      }
    }
    return null;
  }

  /**
   * Check if query is travel consultation
   */
  private isTravelConsultation(lower: string): boolean {
    if (TRAVEL_CONSULTATION_KEYWORDS.some(keyword => lower.includes(keyword))) {
      return true;
    }

    // 中文天数模式：3天、三日
    const chineseDayPattern = /(\d+|[一二三四五六七八九十]+)\s*(天|日)/;
    // 英文天数模式：3 days, 5-day trip, week in Paris, weekend in
    const englishDayPattern = /(\d+)\s*(-?\s*)day(s)?|(\d+)\s*week(s)?|weekend/i;
    const travelWords = ['旅游', '旅行', '行程', '攻略', '游玩', '一日游', 'trip', 'travel', 'visit', 'tour', 'itinerary'];
    const hasDayCount = chineseDayPattern.test(lower) || englishDayPattern.test(lower);
    const hasTravelWord = travelWords.some(word => lower.includes(word));
    const hasCity = this.detectCity(lower) !== null;

    // 天数 + 城市/旅行词 = travel_consultation
    if (hasDayCount && (hasTravelWord || hasCity)) {
      return true;
    }
    
    // 额外的咨询模式检测
    const consultationPatterns = [
      /what to (do|see|eat|visit|explore)/i,
      /things to (do|see|eat)/i,
      /must (see|do|visit|try)/i,
      /worth (visiting|seeing|trying)/i,
      /hidden gems/i,
      /off the beaten path/i,
      /local (favorites?|recommendations?|secrets?)/i,
      /insider (tips?|guide)/i,
      /first time (in|visiting)/i,
      /哪里好玩/,
      /值得.*去/,
      /必去.*景点/,
      /有什么好/,
      /怎么玩/,
    ];
    
    return consultationPatterns.some(pattern => pattern.test(lower));
  }

  /**
   * Detect city name from query
   * 增强：支持模糊匹配和更多变体
   * 始终返回英文城市名（用于数据库查询）
   */
  private detectCity(lower: string): string | null {
    // 首先尝试精确匹配
    for (const city of KNOWN_CITIES) {
      if (lower.includes(city)) {
        // 如果是中文城市名，转换为英文
        if (CHINESE_CITY_TO_ENGLISH[city]) {
          return CHINESE_CITY_TO_ENGLISH[city];
        }
        // 英文城市名，首字母大写
        return city.split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      }
    }
    
    // 尝试从 "in <City>" 或 "to <City>" 模式中提取
    const cityPatterns = [
      /(?:in|to|at|around|near|visiting)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:trip|travel|tour|vacation)/,
    ];
    
    for (const pattern of cityPatterns) {
      const match = lower.match(pattern);
      if (match && match[1]) {
        const potentialCity = match[1].trim();
        // 排除常见的非城市词
        const nonCityWords = ['the', 'best', 'top', 'good', 'nice', 'great', 'some', 'any'];
        if (!nonCityWords.includes(potentialCity.toLowerCase())) {
          return potentialCity;
        }
      }
    }
    
    return null;
  }

  /**
   * Detect category slug from query
   * 返回数据库中的 categorySlug 值
   */
  private detectCategory(lower: string): string | null {
    // 按长度排序，优先匹配更长的关键词（如 "art gallery" 优先于 "gallery"）
    const sortedKeywords = Object.keys(CATEGORY_KEYWORD_TO_SLUG).sort((a, b) => b.length - a.length);
    
    for (const keyword of sortedKeywords) {
      if (lower.includes(keyword)) {
        return CATEGORY_KEYWORD_TO_SLUG[keyword];
      }
    }
    return null;
  }

  /**
   * Detect tag keywords from query
   * 返回匹配到的标签关键词（用于搜索 tags/aiTags 字段）
   */
  private detectTags(lower: string): string[] {
    const matchedTags: string[] = [];
    
    // 按长度排序，优先匹配更长的关键词
    const sortedTags = [...TAG_KEYWORDS].sort((a, b) => b.length - a.length);
    
    for (const tag of sortedTags) {
      if (lower.includes(tag)) {
        matchedTags.push(tag);
      }
    }
    
    return matchedTags;
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
   * OPTIMIZED: Reduced AI calls by checking DB first and reusing existing descriptions
   * 
   * AI Call Strategy (max 2 calls):
   * 1. identifyPlaceFromQuery: Only if query is vague (user forgot the name)
   * 2. generatePlaceDescription: Only if DB has no existing description
   * 
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

    // Step 2: Try database match first (before any AI calls for description)
    // This allows us to reuse existing aiDescription/aiSummary from DB
    let matchedPlace = await this.matchPlaceFromDatabaseStrict(identifiedPlaceName, language as 'en' | 'zh');

    // If Chinese name didn't match DB, try fuzzy matching before translating
    if (!matchedPlace && /[\u4e00-\u9fff]/.test(identifiedPlaceName)) {
      // Try looser matching first
      matchedPlace = await this.matchPlaceFromDatabase(identifiedPlaceName, language as 'en' | 'zh');
      
      // Only translate as last resort (to save AI call)
      if (!matchedPlace) {
        const translatedName = await this.translatePlaceNameToEnglish(identifiedPlaceName);
        if (translatedName && translatedName !== identifiedPlaceName) {
          logger.info(`[IntentClassifier] Trying English match for "${identifiedPlaceName}" -> "${translatedName}"`);
          matchedPlace = await this.matchPlaceFromDatabaseStrict(translatedName, 'en');
        }
      }
    }

    // Step 3: Generate description - reuse DB description if available
    let description = '';
    if (matchedPlace) {
      // Check if DB already has a good description
      const existingDesc = (matchedPlace as any).aiDescription || (matchedPlace as any).aiSummary || '';
      if (existingDesc && existingDesc.length > 50) {
        description = existingDesc;
        logger.info(`[IntentClassifier] Reusing existing description from DB (${description.length} chars)`);
      }
    }
    
    // Ensure at least ONE AI call per intent when possible
    const shouldForceAIDescription = description.length >= 50 && getAICallCount() === 0 && canMakeAICall();
    if (shouldForceAIDescription) {
      const aiDesc = await this.generatePlaceDescription(identifiedPlaceName, language);
      if (aiDesc && aiDesc.length >= 50) {
        description = aiDesc;
      }
    }
    
    // Only call AI if we don't have a good description yet
    if (!description || description.length < 50) {
      description = await this.generatePlaceDescription(identifiedPlaceName, language);
    }

    // Step 4: If place found but no image, search for image (this is a web search, not AI)
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

    if (matchedPlace && language === 'zh' && description) {
      matchedPlace.summary = description;
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
      const response = await this.generateTextWithFallback(prompt, 5000) || 'UNKNOWN';

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
   * Translate a place name to its common English name for database matching
   * OPTIMIZED: Uses static translation table first to avoid AI calls
   * Only falls back to AI if limit not exceeded and no local match found
   */
  private async translatePlaceNameToEnglish(placeName: string): Promise<string | null> {
    // OPTIMIZATION: Check common Chinese place names first (no AI call needed)
    const staticTranslations: Record<string, string> = {
      // Famous landmarks - Japan
      '东京塔': 'Tokyo Tower', '浅草寺': 'Senso-ji Temple', '金阁寺': 'Kinkaku-ji',
      '清水寺': 'Kiyomizu-dera', '伏见稻荷大社': 'Fushimi Inari Shrine', '富士山': 'Mount Fuji',
      '皇居': 'Imperial Palace', '涉谷十字路口': 'Shibuya Crossing', '上野公园': 'Ueno Park',
      '银座': 'Ginza', '新宿御苑': 'Shinjuku Gyoen', '明治神宫': 'Meiji Shrine',
      // Famous landmarks - Europe
      '埃菲尔铁塔': 'Eiffel Tower', '卢浮宫': 'Louvre Museum', '凯旋门': 'Arc de Triomphe',
      '巴黎圣母院': 'Notre-Dame de Paris', '凡尔赛宫': 'Palace of Versailles',
      '大本钟': 'Big Ben', '伦敦塔': 'Tower of London', '白金汉宫': 'Buckingham Palace',
      '大英博物馆': 'British Museum', '泰晤士河': 'Thames River',
      '斗兽场': 'Colosseum', '梵蒂冈': 'Vatican City', '圣彼得大教堂': 'St. Peter\'s Basilica',
      '威尼斯运河': 'Venice Canals', '比萨斜塔': 'Leaning Tower of Pisa',
      '圣家堂': 'Sagrada Familia', '米拉之家': 'Casa Milà', '巴特罗之家': 'Casa Batlló',
      // Famous landmarks - USA
      '自由女神像': 'Statue of Liberty', '时代广场': 'Times Square', '中央公园': 'Central Park',
      '帝国大厦': 'Empire State Building', '布鲁克林大桥': 'Brooklyn Bridge',
      '金门大桥': 'Golden Gate Bridge', '好莱坞': 'Hollywood', '大峡谷': 'Grand Canyon',
      // Famous landmarks - China
      '长城': 'Great Wall of China', '故宫': 'Forbidden City', '天安门': 'Tiananmen Square',
      '外滩': 'The Bund', '东方明珠': 'Oriental Pearl Tower', '西湖': 'West Lake',
      '兵马俑': 'Terracotta Army', '黄山': 'Huangshan', '张家界': 'Zhangjiajie',
      // Famous landmarks - Korea
      '景福宫': 'Gyeongbokgung Palace', '明洞': 'Myeongdong', '南山塔': 'N Seoul Tower',
      '北村韩屋村': 'Bukchon Hanok Village', '东大门': 'Dongdaemun',
      // Famous landmarks - Southeast Asia
      '大皇宫': 'Grand Palace', '卧佛寺': 'Wat Pho', '郑王庙': 'Wat Arun',
      '滨海湾金沙': 'Marina Bay Sands', '鱼尾狮公园': 'Merlion Park',
      '圣淘沙': 'Sentosa Island', '吴哥窟': 'Angkor Wat',
    };
    
    // Check static translations first
    if (staticTranslations[placeName]) {
      logger.info(`[IntentClassifier] Static translation: "${placeName}" -> "${staticTranslations[placeName]}"`);
      return staticTranslations[placeName];
    }
    
    // If no static translation and AI call limit exceeded, return null
    if (!canMakeAICall()) {
      logger.info(`[IntentClassifier] Skip translation for "${placeName}" - AI limit reached`);
      return null;
    }
    
    const prompt = `Translate the place name into its most common English name.

Input: "${placeName}"

Rules:
- Return ONLY the English place name, no JSON, no quotes.
- If it's already in English or you are unsure, return the original input as-is.`;

    try {
      const response = await this.generateTextWithFallback(prompt, 6000);
      if (!response) return null;
      const cleaned = this.normalizeMarkdownOutput(response).trim();
      if (!cleaned) return null;
      return cleaned;
    } catch (error) {
      logger.warn(`[IntentClassifier] Failed to translate place name: ${error}`);
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
      const response = await this.generateTextWithFallback(prompt, CONFIG.DESCRIPTION_TIMEOUT_MS);

      if (!response) {
        logger.warn(`[IntentClassifier] Description generation timed out for "${placeName}"`);
        return '';
      }

      // Clean up / unwrap JSON-ish responses consistently.
      let description = this.normalizeMarkdownOutput(response);

      // Enforce length limits
      const words = description.split(/\s+/);
      if (words.length > CONFIG.MAX_DESCRIPTION_WORDS) {
        description = words.slice(0, CONFIG.MAX_DESCRIPTION_WORDS).join(' ') + '...';
        logger.info(`[IntentClassifier] Truncated description to ${CONFIG.MAX_DESCRIPTION_WORDS} words`);
      }

      if (language === 'zh') {
        const maxChars = 220;
        if (description.length > maxChars) {
          description = description.slice(0, maxChars) + '…';
          logger.info(`[IntentClassifier] Truncated description to ${maxChars} chars (zh)`);
        }
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

  // 需要过滤的旧标签（不再使用的通用标签）
  private static readonly FILTERED_TAGS = new Set(['place', 'landmark']);

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
        if (tagStr && tagStr.trim()) {
          const trimmed = tagStr.trim();
          const key = trimmed.toLowerCase();
          // 过滤掉旧的通用标签（如 "place", "landmark"）
          if (!tags.includes(trimmed) && !IntentClassifierService.FILTERED_TAGS.has(key)) {
            tags.push(trimmed);
          }
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
  async handleTravelConsultation(
    query: string,
    language: string,
    constraints?: { requiredCity?: string; requiredCountry?: string; cityAliases?: string[] },
  ): Promise<TravelConsultationHandlerResult> {
    logger.info(`[IntentClassifier] Handling travel consultation: "${query}"`);

    // Step 1: Generate AI response with place mentions
    const aiResult = await this.generateTravelConsultationResponse(query, language, constraints);
    
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
    // Use shared translation cache to avoid duplicate AI calls
    const translationCache = new Map<string, string>();
    const cities = aiResult.cities || [];
    const result = await this.matchRelatedPlacesWithCache(aiResult.mentionedPlaces, cities, language as 'en' | 'zh', translationCache);

    let textContent = aiResult.textContent;
    if (language === 'zh') {
      const allMatched: PlaceResult[] = result.relatedPlaces
        ? result.relatedPlaces
        : (result.cityPlaces || []).flatMap(group => group.places);

      if (allMatched.length > 0) {
        for (const mentioned of aiResult.mentionedPlaces) {
          const rawName = this.normalizePlaceNameForMatching(mentioned.name || '');
          if (!rawName) continue;

          let candidateName = rawName;
          if (/[\u4e00-\u9fff]/.test(rawName)) {
            // Use cached translation to avoid duplicate AI calls
            if (!translationCache.has(rawName)) {
              const translated = await this.translatePlaceNameToEnglish(rawName);
              translationCache.set(rawName, translated || '');
            }
            const cached = translationCache.get(rawName) || '';
            if (cached) candidateName = cached;
          }

          let best: PlaceResult | null = null;
          let bestScore = 0;
          for (const match of allMatched) {
            const score = Math.max(
              calculateNameSimilarity(candidateName, match.name),
              calculateNameSimilarity(rawName, match.name),
            );
            if (score > bestScore) {
              bestScore = score;
              best = match;
            }
          }

          if (best && bestScore >= 0.6) {
            const escapedName = this.escapeRegExp(mentioned.name);
            const city = (mentioned.city || '').trim();
            if (city) {
              const escapedCity = this.escapeRegExp(city);
              textContent = textContent.replace(
                new RegExp(`${escapedName}\s*[（(]${escapedCity}[)）]`, 'g'),
                best.name,
              );
            }
            textContent = textContent.replace(new RegExp(escapedName, 'g'), best.name);
          }
        }
      }
    }

    logger.info(`[IntentClassifier] Travel consultation result: textContent=${aiResult.textContent.length} chars, cities=${cities.length}`);

    return {
      textContent,
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
  private async generateTravelConsultationResponse(
    query: string,
    language: string,
    constraints?: { requiredCity?: string; requiredCountry?: string; cityAliases?: string[] },
  ): Promise<TravelConsultationAIResult> {
    const languageText = language === 'zh' ? 'Chinese' : 'English';
    let prompt = TRAVEL_CONSULTATION_PROMPT
      .replace('{query}', query)
      .replace(/\{language\}/g, languageText);

    if (constraints?.requiredCity || constraints?.requiredCountry) {
      const cityText = constraints.requiredCity ? `City: ${constraints.requiredCity}` : '';
      const countryText = constraints.requiredCountry ? `Country: ${constraints.requiredCountry}` : '';
      const aliasText = constraints.cityAliases && constraints.cityAliases.length > 0
        ? `Aliases: ${constraints.cityAliases.join(', ')}`
        : '';
      prompt += `\n\nLOCATION CONSTRAINT (MANDATORY): ${[cityText, countryText, aliasText].filter(Boolean).join(' | ')}.\n` +
        `You MUST ONLY mention places within this location.\n` +
        `Do NOT mention any other cities/countries. If unsure, state you will focus on this location only.`;
    }

    try {
      const response = await this.generateTextWithFallback(prompt, CONFIG.CONSULTATION_TIMEOUT_MS) || '__TIMEOUT__';

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
        const normalizedText = this.normalizeMarkdownOutput(result.textContent || result.response || '');
        const aliases = constraints?.cityAliases || (constraints?.requiredCity ? [constraints.requiredCity] : []);

        let mentionedPlaces = result.mentionedPlaces || [];
        let cities = result.cities || [];

        // Filter places and cities by location aliases if specified
        if (aliases.length > 0) {
          mentionedPlaces = mentionedPlaces.filter((p: MentionedPlace) =>
            this.containsAnyAlias(p.city || '', aliases),
          );
          cities = cities.filter((c: string) => this.containsAnyAlias(c, aliases));
        }

        // 后备方案：如果 mentionedPlaces 少于 3 个，从 textContent 中提取 **地点名** 格式的地点
        if (mentionedPlaces.length < 3) {
          const extractedPlaces = this.extractPlaceNamesFromText(normalizedText, constraints?.requiredCity || cities[0] || '');
          // 合并提取的地点（排除已存在的）
          const existingNames = new Set(mentionedPlaces.map((p: MentionedPlace) => p.name.toLowerCase()));
          for (const extracted of extractedPlaces) {
            if (!existingNames.has(extracted.name.toLowerCase())) {
              mentionedPlaces.push(extracted);
              existingNames.add(extracted.name.toLowerCase());
            }
          }
          logger.info(`[IntentClassifier] Extracted ${extractedPlaces.length} additional places from text, total: ${mentionedPlaces.length}`);
        }

        // 从 textContent 中提取网站链接并合并到对应的地点
        mentionedPlaces = this.enrichPlacesWithWebsitesFromText(normalizedText, mentionedPlaces);

        // Log first place to check if AI returned rating data
        if (mentionedPlaces.length > 0) {
          const firstPlace = mentionedPlaces[0];
          logger.info(`[IntentClassifier] First place sample: name="${firstPlace.name}", rating=${firstPlace.rating}, ratingCount=${firstPlace.ratingCount}, address="${firstPlace.address?.substring(0, 50)}"`);
        }

        // NOTE: Removed extractMentionedPlacesFromText and location mismatch retry
        // to reduce AI calls. The prompt now requires AI to return English place names
        // in the mentionedPlaces array, so extraction is not needed.

        logger.info(`[IntentClassifier] Generated travel consultation: ${normalizedText.length} chars, ${mentionedPlaces.length} places, ${cities.length} cities`);
        return {
          textContent: normalizedText,
          mentionedPlaces,
          cities,
        };
      }

      // If no JSON found, treat the whole response as text content
      logger.warn('[IntentClassifier] No JSON in travel consultation response, using raw text');
      return { textContent: this.normalizeMarkdownOutput(response), mentionedPlaces: [], cities: [] };

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
    // Use internal cache when called without external cache
    return this.matchRelatedPlacesWithCache(mentionedPlaces, cities, language, new Map<string, string>());
  }

  /**
   * Match related places from database based on mentioned places (with shared translation cache)
   * Returns flat array for single city, grouped by city for multiple cities
   * @param mentionedPlaces Places mentioned in AI response
   * @param cities Cities mentioned in AI response
   * @param language Language parameter for tag display ('en' or 'zh')
   * @param translationCache Shared translation cache to avoid duplicate AI calls
   * @returns Object with either relatedPlaces (single city) or cityPlaces (multi-city)
   */
  private async matchRelatedPlacesWithCache(
    mentionedPlaces: MentionedPlace[],
    cities: string[],
    language: 'en' | 'zh' = 'en',
    translationCache: Map<string, string>
  ): Promise<{ relatedPlaces?: PlaceResult[]; cityPlaces?: CityPlacesGroup[] }> {
    
    // Group mentioned places by city
    const placesByCity = new Map<string, string[]>();
    for (const place of mentionedPlaces) {
      const normalizedCity = this.normalizeCityForMatching(place.city || '');
      const cityKey = (normalizedCity || place.city || '').toLowerCase().trim();
      const cityPlaces = placesByCity.get(cityKey) || [];
      cityPlaces.push(this.normalizePlaceNameForMatching(place.name));
      placesByCity.set(cityKey, cityPlaces);
    }

    // Normalize cities list
    const normalizedCities = cities
      .map(c => this.normalizeCityForMatching(c.trim()))
      .filter(c => c.length > 0);
    const uniqueCities = [...new Set(normalizedCities)];

    logger.info(`[IntentClassifier] Matching places for ${uniqueCities.length} cities: ${uniqueCities.join(', ')}`);

    // Single city scenario: return flat array
    if (uniqueCities.length === 1) {
      const city = uniqueCities[0];
      const placeNames = placesByCity.get(city.toLowerCase()) || [];
      let results = await this.matchPlacesForCityWithCache(placeNames, city, language, translationCache);
      
      // 如果数据库没有匹配的地点，尝试为 AI 提到的地点创建临时 PlaceResult（联网搜索图片）
      if (results.length === 0 && mentionedPlaces.length > 0) {
        logger.info(`[IntentClassifier] No DB matches for "${city}", creating temp places with image search`);
        results = await this.createTempPlacesWithImageSearch(mentionedPlaces.slice(0, 10), city, language);
      }

      logger.info(`[IntentClassifier] Single city "${city}": ${results.length} places`);
      return { relatedPlaces: results };
    }

    // Multi-city scenario: return grouped by city
    const cityPlaces: CityPlacesGroup[] = [];
    for (const city of uniqueCities) {
      const placeNames = placesByCity.get(city.toLowerCase()) || [];
      let results = await this.matchPlacesForCityWithCache(placeNames, city, language, translationCache);
      
      // 如果数据库没有匹配的地点，尝试为 AI 提到的地点创建临时 PlaceResult
      if (results.length === 0) {
        const cityMentionedPlaces = mentionedPlaces.filter(p => 
          (p.city || '').toLowerCase().includes(city.toLowerCase()) ||
          city.toLowerCase().includes((p.city || '').toLowerCase())
        );
        if (cityMentionedPlaces.length > 0) {
          logger.info(`[IntentClassifier] No DB matches for "${city}", creating temp places with image search`);
          results = await this.createTempPlacesWithImageSearch(cityMentionedPlaces.slice(0, 5), city, language);
        }
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
    // Use internal cache when called without external cache
    return this.matchPlacesForCityWithCache(placeNames, city, language, new Map<string, string>());
  }

  /**
   * Match places for a single city from database (with shared translation cache)
   * Only returns places with cover images
   * @param placeNames Place names to match
   * @param city City name
   * @param language Language parameter for tag display ('en' or 'zh')
   * @param translationCache Shared translation cache to avoid duplicate AI calls
   * @returns Array of matched PlaceResults
   */
  private async matchPlacesForCityWithCache(
    placeNames: string[], 
    city: string, 
    language: 'en' | 'zh' = 'en',
    translationCache: Map<string, string>
  ): Promise<PlaceResult[]> {
    const results: PlaceResult[] = [];
    const usedIds = new Set<string>();

    // 获取城市的所有变体名称（如 Rome/Roma, Venice/Venezia 等）
    const cityVariants = this.getCityVariants(this.normalizeCityForMatching(city));

    for (const name of placeNames) {
      try {
        const cleanedName = this.normalizePlaceNameForMatching(name);
        const nameTerms: string[] = [];
        if (cleanedName) nameTerms.push(cleanedName);

        if (/[\u4e00-\u9fff]/.test(cleanedName)) {
          if (!translationCache.has(cleanedName)) {
            const translated = await this.translatePlaceNameToEnglish(cleanedName);
            translationCache.set(cleanedName, translated || '');
          }
          const translated = translationCache.get(cleanedName) || '';
          if (translated && !nameTerms.includes(translated)) {
            nameTerms.push(translated);
          }
        }

        const nameConditions: any[] = [];
        for (const term of nameTerms) {
          const firstToken = term.split(' ')[0];
          nameConditions.push({ name: { equals: term, mode: 'insensitive' } });
          nameConditions.push({ name: { contains: term, mode: 'insensitive' } });
          if (firstToken && firstToken.length >= 3) {
            nameConditions.push({ name: { contains: firstToken, mode: 'insensitive' } });
          }
        }

        if (nameConditions.length === 0) {
          continue;
        }

        const candidates = await prisma.place.findMany({
          where: {
            OR: nameConditions,
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
          const similarity = calculateNameSimilarity(cleanedName || name, candidate.name);
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
   * Create temporary PlaceResult objects for AI-mentioned places
   * OPTIMIZED: Uses SINGLE batch image search call instead of N individual calls
   * @param mentionedPlaces Places mentioned in AI response
   * @param city City name for the places
   * @param language Language parameter
   * @returns Array of temporary PlaceResults with images (if found)
   */
  private async createTempPlacesWithImageSearch(
    mentionedPlaces: MentionedPlace[],
    city: string,
    language: 'en' | 'zh' = 'en'
  ): Promise<PlaceResult[]> {
    const results: PlaceResult[] = [];
    const placesToProcess = mentionedPlaces.slice(0, 10); // Limit to 10 places
    
    // OPTIMIZATION: Use batch image search (SINGLE AI call for all places)
    let imageMap = new Map<string, string | null>();
    
    // Only do batch image search if AI call limit not exceeded
    if (canMakeAICall() && placesToProcess.length > 0) {
      const openRouter = new OpenRouterProvider();
      if (openRouter.isAvailable()) {
        // Count as 1 AI call for the batch
        incrementAICallCount('intentClassifier.batchImageSearch');
        logger.info(`[IntentClassifier] Batch image search for ${placesToProcess.length} places (global calls: ${getAICallCount()}/${getMaxAICallsPerRequest()})`);
        
        const searchPlaces = placesToProcess.map(p => ({
          name: this.normalizePlaceNameForMatching(p.name) || p.name,
          city: city,
        }));
        
        try {
          imageMap = await openRouter.searchPlaceImagesBatch(searchPlaces);
          logger.info(`[IntentClassifier] Batch image search found ${[...imageMap.values()].filter(v => v).length} images`);
        } catch (error) {
          logger.warn(`[IntentClassifier] Batch image search failed: ${error}`);
        }
      }
    } else {
      logger.info(`[IntentClassifier] Skipping image search - AI limit reached (${getAICallCount()}/${getMaxAICallsPerRequest()})`);
    }

    // Process places with batch results
    for (const place of placesToProcess) {
      try {
        const placeName = this.normalizePlaceNameForMatching(place.name);
        if (!placeName) continue;

        // Get image from batch results
        const imageUrl = imageMap.get(placeName) || imageMap.get(place.name) || '';

        // Try to get coordinates from address using forward geocoding (Nominatim - NOT AI)
        let latitude = 0;
        let longitude = 0;
        const placeAddress = (place as any).address;
        if (placeAddress) {
          try {
            const coords = await geocodeService.forwardGeocode(placeAddress);
            if (coords) {
              latitude = coords.lat;
              longitude = coords.lon;
            }
          } catch (geoError) {
            // Geocoding errors are fine, just continue
          }
        }

        // Create temporary PlaceResult
        const tempPlace: PlaceResult = {
          id: `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          name: place.name,
          summary: language === 'zh' 
            ? `${city}的${placeName}，AI推荐的热门地点。`
            : `${placeName} in ${city}, recommended by AI.`,
          coverImage: imageUrl,
          images: imageUrl ? [imageUrl] : [],
          latitude,
          longitude,
          city: city,
          country: (place as any).country || '',
          rating: (place as any).rating ?? null,
          ratingCount: (place as any).ratingCount ?? null,
          tags: [],
          isVerified: false,
          source: 'ai',
          address: (place as any).address || undefined,
          website: (place as any).website || undefined,
        };

        results.push(tempPlace);
      } catch (error) {
        logger.warn(`[IntentClassifier] Error creating temp place for "${place.name}": ${error}`);
        continue;
      }
    }

    const withImages = results.filter(r => r.coverImage && r.coverImage.startsWith('http')).length;
    logger.info(`[IntentClassifier] Created ${results.length} temp places (${withImages} with images)`);
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
      const response = await this.generateTextWithFallback(prompt, CONFIG.NON_TRAVEL_TIMEOUT_MS) || '__TIMEOUT__';

      if (!response || response === '__TIMEOUT__') {
        logger.warn('[IntentClassifier] Non-travel response generation timed out');
        // 返回友好的超时消息
        return language === 'zh' 
          ? '抱歉，响应超时了。请稍后再试。'
          : 'Sorry, the request timed out. Please try again.';
      }

      // Clean up the response - remove any JSON wrapping if present
      const textContent = this.normalizeMarkdownOutput(response);

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
