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
  ArchitectQueryHandlerResult,
} from '../types/intent';

// ============ Configuration ============

const CONFIG = {
  AI_TIMEOUT_MS: 30000,  // 30 second timeout for intent classification (prioritize accuracy)
  DESCRIPTION_TIMEOUT_MS: 25000, // 25 second timeout for description generation (increased to allow fallback)
  CONSULTATION_TIMEOUT_MS: 90000, // 90 second timeout for travel consultation (increased for web search)
  NON_TRAVEL_TIMEOUT_MS: 60000, // 60 second timeout for non-travel responses (increased)
  ARCHITECT_QUERY_TIMEOUT_MS: 90000, // 90 second timeout for architect/style queries (increased)
  NAME_SIMILARITY_THRESHOLD: 0.6, // Minimum similarity score for place matching
  SPECIFIC_PLACE_SIMILARITY_THRESHOLD: 0.75, // Higher threshold for specific_place to avoid wrong matches
  MAX_DESCRIPTION_WORDS: 140, // Maximum words in description
  MIN_PLACES_PER_CITY: 3, // Minimum places per city section
};

// ============ Prompt Templates ============

/**
 * AI prompt for generating specific place descriptions
 * OPTIMIZED: Reduced to save tokens
 */
const SPECIFIC_PLACE_DESCRIPTION_PROMPT = `Write 3-5 sentences about "{placeName}" in {language}. Include: what it is, why notable, 1-2 visiting tips. No JSON.`;

/**
 * AI prompt for travel consultation responses
 * OPTIMIZED: Reduced from ~150 lines to ~50 lines to save ~70% tokens
 */
const TRAVEL_CONSULTATION_PROMPT = `You are a travel expert. Answer: {query}

RULES:
1. Language: {language} only. English names in mentionedPlaces, but summary in {language}
2. Location: ONLY recommend places in the location user asked about
3. Include 5-10 places with practical tips
4. For itinerary requests (N-day/行程): Use day-by-day format with time slots
5. Each place summary MUST be around 50 characters (45-55 chars), describing unique features and why it's worth visiting

FORMAT:
- Use Markdown with ## headings and emoji
- Places: ### **Place Name** followed by 1-2 sentence description
- Keep concise (300-500 words)

Return JSON:
{
  "textContent": "Markdown response...",
  "mentionedPlaces": [{"name": "English Name", "city": "City", "summary": "~50 char description in {language}, e.g. '流线型当代艺术博物馆，扎哈·哈迪德标志性曲线建筑代表作'", "address": "Address", "website": "URL", "country": "Country", "rating": 4.5, "ratingCount": 1200}],
  "cities": ["City1"]
}`;

/**
 * AI prompt for non-travel responses
 * OPTIMIZED: Reduced to save tokens
 */
const NON_TRAVEL_PROMPT = `Answer in {language} using Markdown: {query}. Be concise, use emoji and **bold** for key items. Return plain text.`;

/**
 * AI prompt for architect/architectural style queries
 * 建筑师/建筑风格查询的 prompt - 先介绍人物/风格，再列出著名建筑
 */
const ARCHITECT_STYLE_PROMPT = `You are an architecture expert. Answer: {query}

Return ONLY valid JSON:
{
  "textContent": "[Markdown text in {language}]",
  "mentionedPlaces": [{"name": "localized building name in {language}", "nameEn": "English building name", "city": "city in English", "country": "country in English", "summary": "15-20 word feature in {language}"}],
  "cities": ["City1", "City2"]
}

textContent structure:

## [Name]'s Architecture
[2-3 sentences: nationality, philosophy, significance]

## Key Characteristics
• **[Feature 1]** [emoji]: [One sentence]
• **[Feature 2]** [emoji]: [One sentence]
• **[Feature 3]** [emoji]: [One sentence]

## Notable Buildings
1. [**Building Name in {language}**](place) - City, Country. [15-20 word feature in {language}]
2. [**Building Name in {language}**](place) - City, Country. [15-20 word feature in {language}]
(list 5-8 buildings, each with feature description)

CRITICAL RULES:
- ALL text content MUST be in {language}
- Building names in textContent: use {language} (e.g., "卢浮宫玻璃金字塔" for Chinese)
- Use [**Name**](place) format in Notable Buildings
- Each building MUST have a 15-20 word feature description in {language}
- mentionedPlaces: 
  - "name" = localized display name in {language} (must match exactly what appears in textContent)
  - "nameEn" = English name for database matching (e.g., "Louvre Pyramid", "Bank of China Tower")
  - city/country = always in English
  - summary = in {language}
- Keep under 500 words`;

// ============ Prompt Templates ============

/**
 * AI prompt for intent classification
 * OPTIMIZED: Reduced from ~100 lines to ~30 lines to save ~70% tokens
 */
const INTENT_CLASSIFICATION_PROMPT = `Classify query intent. Return JSON only.

Query: "{query}"

INTENTS:
1. "general_search" - Finding places/venues (cafes, restaurants, museums). "what to eat" = general_search
2. "specific_place" - Info about ONE named place ("Eiffel Tower", "what is Louvre")
3. "travel_consultation" - Travel advice (how-to, tickets, budget, transport, visa, packing, architecture styles)
4. "non_travel" - Weather queries or non-travel topics (health, tech, emotions)

RULES: weather→non_travel | "how to"→consultation | category+find→general_search | just place name→specific_place

JSON: {"intent":"...", "placeName":"if specific", "city":"if mentioned", "category":"if mentioned", "count":N, "confidence":0.0-1.0}`;

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
  // yarn_store
  'yarn store': 'yarn_store', 'yarn shop': 'yarn_store', 'wool shop': 'yarn_store', 
  'knitting': 'yarn_store', 'haberdashery': 'yarn_store', 'craft store': 'yarn_store',
  'yarn': 'yarn_store',
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
  // Weather queries (天气查询 - 不需要地点匹配，直接返回 AI 文本)
  'weather', 'weather in', '天气', '天气怎么样', '气候', '温度', '穿什么', '冷不冷', '热不热',
  'what is the weather', "what's the weather", 'forecast',
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

  // === 建筑/艺术/风格 (有可参观地点) ===
  'architecture', 'architect', 'architectural', 'brutalism', 'brutalist',
  'modernism', 'modernist', 'art deco', 'gothic', 'baroque', 'renaissance',
  'gaudi', 'zaha hadid', 'frank gehry', 'le corbusier', 'renzo piano',
  'norman foster', 'tadao ando', 'works of', 'buildings by', 'designed by',
  '建筑', '建筑师', '作品', '风格', '设计',

  // 注意：'推荐', '建议', 'recommend', 'suggest', 'advice' 这些词不放在这里
  // 因为用户来都是求推荐的，"推荐几家伦敦的毛线店" 应该是 general_search 而不是 travel_consultation
];

/**
 * Architect / Architectural Style keywords
 * 这些关键词会触发 isArchitectQuery 标记，走 general_search 但使用特殊处理
 * 用户查询 "zaha hadid's architecture" 应该先介绍建筑师，再展示相关建筑
 */
const ARCHITECT_STYLE_KEYWORDS = [
  // Architects (English)
  'gaudi', 'zaha hadid', 'frank gehry', 'le corbusier', 'renzo piano',
  'norman foster', 'tadao ando', 'frank lloyd wright', 'i.m. pei', 'rem koolhaas',
  'jean nouvel', 'bjarke ingels', 'kengo kuma', 'herzog & de meuron', 'david chipperfield',
  'shigeru ban', 'peter zumthor', 'álvaro siza', 'louis kahn', 'mies van der rohe',
  // Styles (English)
  'brutalism', 'brutalist', 'art deco', 'gothic', 'baroque', 'renaissance',
  'modernism', 'modernist', 'postmodern', 'deconstructivism', 'neoclassical',
  'art nouveau', 'bauhaus', 'minimalism', 'high-tech', 'organic architecture',
  // Patterns (English)
  'architecture', 'architect', 'architectural', 'works of', 'buildings by', 'designed by',
  // Chinese
  '建筑师', '建筑风格', '作品', '设计风格',
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

  /**
   * Generate simple text WITHOUT web search (faster and more reliable)
   * Used for simple tasks like place description generation
   */
  private async generateSimpleTextWithFallback(prompt: string, timeoutMs: number): Promise<string> {
    // Check global AI call limit FIRST (global counter is enforced in aiService too)
    if (!canMakeAICall()) {
      logger.warn(`[IntentClassifier] AI call blocked due to limit (${getAICallCount()}/${getMaxAICallsPerRequest()})`);
      return '';
    }
    
    try {
      const timeout = Math.min(timeoutMs, 60000);
      return await Promise.race([
        aiService.executeSimpleTextGeneration(prompt, undefined, 'intentClassifier.simpleTextGeneration'),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error('AI timeout')), timeout)),
      ]);
    } catch (error) {
      logger.warn(`[IntentClassifier] Simple AI text generation failed: ${error}`);
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
    // 包含这些词时，通常是搜索一类地点而非特定地点
    const generalHints = [
      '推荐', '哪里', '附近', '必去', '清单', '排行', 'top', '地图', '打卡',
      '攻略', '行程', '路线', '一日游', '二日', '三日', '几日', '几天',
      '怎么', '如何', '门票', '开放时间', '交通', '地铁', '机场', '签证',
      // 餐饮类
      '餐厅', '饭店', '酒店', '住宿', '咖啡', '咖啡店', '咖啡厅',
      '拉面', '拉面店', '寿司', '寿司店', '火锅', '火锅店', '烤肉', '烤肉店',
      '甜品', '甜品店', '甜点', '蛋糕', '蛋糕店', '面包', '面包店', '烘焙',
      '奶茶', '奶茶店', '饮品', '小吃', '小吃店', '早餐', '早餐店', '早午餐',
      '酒吧', '夜店', '居酒屋', '小酒馆', '酒庄', '啤酒',
      // 购物类
      '购物', '商场', '超市', '便利店', '书店', '唱片店',
      '毛线', '毛线店', '手工', '手工店', '工艺', '工艺品',
      '古着', '古董', '跳蚤市场', '市集', '夜市',
      // 景点类
      '夜景', '景点', '博物馆', '美术馆', '画廊', '公园', '花园',
      '温泉', '海滩', '沙滩', '滑雪', '滑雪场', '游乐园', '主题公园',
      '教堂', '寺庙', '神社', '城堡', '宫殿',
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
      
      // Remove rating suffix like (4.7分) or (4.7) first
      name = name.replace(/\s*[（(]\d+\.?\d*(分)?[）)]$/, '').trim();
      
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
      
      // Remove rating suffix like (4.7分) or (4.7) first
      name = name.replace(/\s*[（(]\d+\.?\d*(分)?[）)]$/, '').trim();
      
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

    // Pattern 3: Bullet or sentence lines like "海德公园：..." or "Hyde Park: ..."
    const lineColonPattern = /(?:^|\n)\s*(?:[-•*]\s*)?([^\n:：]{2,40})[：:]\s+/g;
    while ((match = lineColonPattern.exec(text)) !== null) {
      let name = match[1].trim();

      // Remove common leading verbs
      name = name.replace(/^(参观|前往|游览|打卡|欣赏|探访|体验|走访|逛|去|到|建议|安排)\s*/i, '');
      name = name.replace(/^(visit|explore|head to|go to|check out|see)\s+/i, '');

      // Skip time slots or section labels
      if (/^(第.+天|上午|中午|下午|傍晚|晚上|夜晚|清晨|早上|午后|夜间|morning|afternoon|evening|night|day\s*\d+)/i.test(name)) {
        continue;
      }

      // Extract English name from parentheses if present
      const parenMatch = name.match(/[（(]([A-Za-z][^）)]+)[）)]/);
      if (parenMatch) {
        name = parenMatch[1].trim();
      }

      if (name.length < 3) continue;
      const nameLower = name.toLowerCase();
      if (seenNames.has(nameLower)) continue;
      seenNames.add(nameLower);
      places.push({ name, city: defaultCity });
    }

    // Pattern 4: "Hyde Park - relax..." style
    const lineDashPattern = /(?:^|\n)\s*(?:[-•*]\s*)?([^\n\-–—]{2,40})\s*[\-–—]\s+/g;
    while ((match = lineDashPattern.exec(text)) !== null) {
      let name = match[1].trim();

      name = name.replace(/^(参观|前往|游览|打卡|欣赏|探访|体验|走访|逛|去|到|建议|安排)\s*/i, '');
      name = name.replace(/^(visit|explore|head to|go to|check out|see)\s+/i, '');

      if (/^(第.+天|上午|中午|下午|傍晚|晚上|夜晚|清晨|早上|午后|夜间|morning|afternoon|evening|night|day\s*\d+)/i.test(name)) {
        continue;
      }

      const parenMatch = name.match(/[（(]([A-Za-z][^）)]+)[）)]/);
      if (parenMatch) {
        name = parenMatch[1].trim();
      }

      if (name.length < 3) continue;
      const nameLower = name.toLowerCase();
      if (seenNames.has(nameLower)) continue;
      seenNames.add(nameLower);
      places.push({ name, city: defaultCity });
    }

    // Pattern 5: Bullet point lines like "• 卢浮宫（4.8分）" or "· 巴黎圣母院"
    const bulletPointPattern = /(?:^|\n)\s*[•·]\s*([^\n（(]{2,50})(?:[（(]([^）)]+)[）)])?/g;
    while ((match = bulletPointPattern.exec(text)) !== null) {
      let name = match[1].trim();
      const parenContent = match[2]?.trim();

      // Skip time slots or section headers
      if (/^(第.+天|上午|中午|下午|傍晚|晚上|夜晚|清晨|早上|午后|夜间|morning|afternoon|evening|night|day\s*\d+)/i.test(name)) {
        continue;
      }

      // Remove trailing colons or punctuation
      name = name.replace(/[：:，,。.]+$/, '').trim();

      // If there's English name in parentheses, use it
      if (parenContent && /[A-Za-z]/.test(parenContent) && !/^\d+\.?\d*分?$/.test(parenContent)) {
        name = parenContent;
      }

      if (name.length < 2) continue;
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
   * Uses AI for accurate intent classification with rule-based fallback.
   * The AI can better understand complex queries and distinguish between:
   * - travel_consultation: advice, tips, how-to questions
   * - general_search: finding multiple places by category/criteria
   * - specific_place: info about one specific named place
   * - non_travel: non-travel related queries
   */
  async classify(query: string, language: string): Promise<IntentResult> {
    logger.info(`[IntentClassifier] Classifying query: "${query}"`);
    const lower = query.toLowerCase();
    
    // FIRST: Check for architect/style queries - these go to travel_consultation
    // This check must happen BEFORE AI classification to ensure correct handling
    // e.g., "zaha hadid's architecture" should be travel_consultation (intro + places)
    if (this.isArchitectStyleQuery(lower)) {
      const hasCity = this.detectCity(lower);
      logger.info(`[IntentClassifier] Detected architect/style query, forcing travel_consultation (city: ${hasCity})`);
      return {
        intent: 'travel_consultation',
        city: hasCity || undefined,
        isArchitectQuery: true,  // Flag to use special architect handling in handleTravelConsultation
        confidence: 0.9,
      };
    }
    
    // Try AI classification for other queries
    try {
      const aiResult = await this.classifyWithAI(query, language);
      if (aiResult && aiResult.intent) {
        logger.info(`[IntentClassifier] AI classification: ${aiResult.intent} (confidence: ${aiResult.confidence})`);
        return aiResult;
      }
    } catch (error) {
      logger.warn(`[IntentClassifier] AI classification failed, falling back to rules: ${error}`);
    }
    
    // Fallback to rule-based classification
    logger.info(`[IntentClassifier] Using fallback classification for: "${query}"`);
    return this.fallbackClassify(query, language);
  }

  /**
   * AI-based intent classification using INTENT_CLASSIFICATION_PROMPT
   * @param query User's search query
   * @param language User's preferred language
   * @returns IntentResult or null if AI call fails
   */
  private async classifyWithAI(query: string, language: string): Promise<IntentResult | null> {
    const prompt = INTENT_CLASSIFICATION_PROMPT.replace('{query}', query);
    
    try {
      const response = await Promise.race([
        aiService.executeWithFallback(
          (provider) => provider.generateText(prompt),
          'intentClassifier.classify',
        ),
        new Promise<string>((_, reject) => 
          setTimeout(() => reject(new Error('AI classification timeout')), CONFIG.AI_TIMEOUT_MS)
        ),
      ]);
      
      if (!response) {
        logger.warn('[IntentClassifier] Empty AI response for classification');
        return null;
      }
      
      // Parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn('[IntentClassifier] No JSON found in AI classification response');
        return null;
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate intent type
      const validIntents = ['general_search', 'specific_place', 'travel_consultation', 'non_travel'];
      if (!parsed.intent || !validIntents.includes(parsed.intent)) {
        logger.warn(`[IntentClassifier] Invalid intent from AI: ${parsed.intent}`);
        return null;
      }
      
      // Build IntentResult
      const result: IntentResult = {
        intent: parsed.intent,
        confidence: parsed.confidence || 0.8,
      };
      
      // Add optional fields based on intent
      if (parsed.placeName) result.placeName = parsed.placeName;
      if (parsed.placeNames && Array.isArray(parsed.placeNames)) result.placeNames = parsed.placeNames;
      if (parsed.city) {
        // Ensure city is in English
        result.city = CHINESE_CITY_TO_ENGLISH[parsed.city] || parsed.city;
      }
      if (parsed.category) result.category = parsed.category;
      if (parsed.count && typeof parsed.count === 'number') result.count = parsed.count;
      
      return result;
    } catch (error) {
      logger.warn(`[IntentClassifier] AI classification error: ${error}`);
      return null;
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

    // 2. Check for architect/style queries BEFORE travel_consultation
    // These go to travel_consultation with isArchitectQuery flag for special handling
    // e.g., "zaha hadid's architecture" → introduce architect first, then show buildings
    if (this.isArchitectStyleQuery(lower)) {
      const hasCity = this.detectCity(lower);
      logger.info(`[IntentClassifier] Fallback: travel_consultation (isArchitectQuery, city: ${hasCity})`);
      return {
        intent: 'travel_consultation',
        city: hasCity || undefined,
        isArchitectQuery: true,
        confidence: 0.85,
      };
    }

    // 3. Check for travel consultation (how-to questions, tips, booking, etc.)
    // This ensures "how to buy ticket of Sagrada Familia" is travel_consultation, not specific_place
    if (this.isTravelConsultation(lower)) {
      logger.info('[IntentClassifier] Fallback: travel_consultation');
      return {
        intent: 'travel_consultation',
        confidence: 0.8,
      };
    }

    // 4. Check for category keywords (before specific place)
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
   * Check if query is specifically about architects or architectural styles
   * 检测是否是建筑师/建筑风格查询
   * 这类查询走 general_search 但需要特殊处理（先介绍人物/风格，再展示建筑）
   */
  private isArchitectStyleQuery(lower: string): boolean {
    return ARCHITECT_STYLE_KEYWORDS.some(keyword => lower.includes(keyword));
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

    // Step 4: If NO database match, use AI web search to get complete info and persist
    if (!matchedPlace) {
      logger.info(`[IntentClassifier] No DB match for "${identifiedPlaceName}", using AI web search...`);
      try {
        const webPlace = await this.searchAndPersistPlace(identifiedPlaceName, language);
        if (webPlace) {
          matchedPlace = webPlace;
          logger.info(`[IntentClassifier] AI web search found and persisted: "${webPlace.name}"`);
        }
      } catch (error) {
        logger.warn(`[IntentClassifier] AI web search failed for "${identifiedPlaceName}": ${error}`);
      }
    }

    // Step 5: If place found but no image, search for image (this is a web search, not AI)
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
   * Search for a place via AI web search and persist to database
   * Used when database has no match for specific_place intent
   * 一次性获取: 名称、地址、评分、网站、电话、营业时间、封面图
   * 坐标优先走 Mapbox，失败则用 AI 返回的坐标
   */
  private async searchAndPersistPlace(placeName: string, language: string): Promise<PlaceResult | null> {
    const isZh = language === 'zh';
    
    const prompt = `Search the web for information about "${placeName}".

Provide the following details:
1. name: The official place name (in English)
2. localName: The local/native name if different (e.g., Chinese name for places in China)
3. address: Full street address
4. city: City name (in English)
5. country: Country name (in English)
6. website: Official website URL
7. latitude: GPS latitude coordinate (decimal, e.g., 35.6892)
8. longitude: GPS longitude coordinate (decimal, e.g., 139.6917)
9. rating: Google Maps/TripAdvisor rating (e.g., 4.5 out of 5)
10. ratingCount: Number of reviews (e.g., 12000)
11. phoneNumber: Phone number
12. openingHours: Brief opening hours (e.g., "Mon-Sun 9:00-18:00")
13. category: Place type (e.g., museum, restaurant, landmark, cafe, temple, park)
14. coverImageUrl: A publicly accessible image URL of this place (from Wikipedia, official website, or travel sites)
15. description: A brief 2-3 sentence description${isZh ? ' in Chinese' : ' in English'}
16. ticketUrl: Official ticket booking URL if available (for museums, attractions, landmarks)

Return JSON only:
{
  "name": "Place Name",
  "localName": "本地名称",
  "address": "123 Main St, City, Country",
  "city": "City",
  "country": "Country",
  "website": "https://example.com",
  "ticketUrl": "https://tickets.example.com",
  "latitude": 35.6892,
  "longitude": 139.6917,
  "rating": 4.5,
  "ratingCount": 12000,
  "phoneNumber": "+1-234-567-8900",
  "openingHours": "Mon-Sun 9:00-18:00",
  "category": "museum",
  "coverImageUrl": "https://example.com/image.jpg",
  "description": "Description text here..."
}`;

    try {
      const response = await aiService.executeWithFallback(
        (provider) => provider.generateText(prompt),
        'intentClassifier.searchAndPersistPlace',
      );
      
      if (!response) {
        logger.warn(`[IntentClassifier] No response from AI web search for "${placeName}"`);
        return null;
      }

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn(`[IntentClassifier] No JSON in AI response for "${placeName}"`);
        return null;
      }

      const info = JSON.parse(jsonMatch[0]);
      if (!info.name) {
        logger.warn(`[IntentClassifier] AI response missing name for "${placeName}"`);
        return null;
      }

      // Get coordinates: prioritize Mapbox, fallback to AI
      let finalLat = info.latitude || 0;
      let finalLng = info.longitude || 0;
      
      if ((finalLat === 0 || finalLng === 0) && info.address) {
        logger.info(`[IntentClassifier] Geocoding "${info.name}" via Mapbox...`);
        try {
          const geocodeResult = await geocodeService.forwardGeocode(info.address, {
            country: info.country,
          });
          if (geocodeResult) {
            finalLat = geocodeResult.lat;
            finalLng = geocodeResult.lon;
            logger.info(`[IntentClassifier] Mapbox geocode success: (${finalLat}, ${finalLng})`);
          }
        } catch (geoError) {
          logger.warn(`[IntentClassifier] Mapbox geocode failed, using AI coords: ${geoError}`);
        }
      }

      // If still no coords but have city, try geocoding city + name
      if ((finalLat === 0 || finalLng === 0) && info.city) {
        const searchQuery = `${info.name}, ${info.city}`;
        logger.info(`[IntentClassifier] Trying city-based geocode: "${searchQuery}"`);
        try {
          const geocodeResult = await geocodeService.forwardGeocode(searchQuery, {
            country: info.country,
          });
          if (geocodeResult) {
            finalLat = geocodeResult.lat;
            finalLng = geocodeResult.lon;
            logger.info(`[IntentClassifier] City geocode success: (${finalLat}, ${finalLng})`);
          }
        } catch (geoError) {
          logger.warn(`[IntentClassifier] City geocode failed: ${geoError}`);
        }
      }

      // Get cover image if not provided by AI
      let coverImage = info.coverImageUrl || '';
      if (!coverImage) {
        logger.info(`[IntentClassifier] Searching cover image for "${info.name}"...`);
        try {
          const imageUrl = await this.kouriProvider.searchPlaceImage(info.name, info.city || '');
          if (imageUrl) {
            coverImage = imageUrl;
            logger.info(`[IntentClassifier] Found cover image: ${imageUrl.substring(0, 50)}...`);
          }
        } catch (imgError) {
          logger.warn(`[IntentClassifier] Image search failed: ${imgError}`);
        }
      }

      // Persist to database
      const categorySlug = this.mapCategoryToSlug(info.category || 'landmark');
      
      try {
        // Check if exists
        const existing = await prisma.place.findFirst({
          where: {
            name: { equals: info.name, mode: 'insensitive' },
            city: { equals: info.city || '', mode: 'insensitive' },
          },
        });

        let dbPlace: any;
        if (existing) {
          // Update with new info
          const updateData: Record<string, unknown> = {};
          if (info.address && !existing.address) updateData.address = info.address;
          if (info.website && !existing.website) updateData.website = info.website;
          if (finalLat && finalLat !== 0 && (!existing.latitude || existing.latitude === 0)) updateData.latitude = finalLat;
          if (finalLng && finalLng !== 0 && (!existing.longitude || existing.longitude === 0)) updateData.longitude = finalLng;
          if (info.rating && info.rating > 0 && (!existing.rating || existing.rating === 0)) updateData.rating = info.rating;
          if (info.ratingCount && info.ratingCount > 0 && (!existing.ratingCount || existing.ratingCount === 0)) updateData.ratingCount = info.ratingCount;
          if (coverImage && !existing.coverImage) updateData.coverImage = coverImage;
          if (info.phoneNumber && !existing.phoneNumber) updateData.phoneNumber = info.phoneNumber;
          if (info.openingHours && !existing.openingHours) updateData.openingHours = info.openingHours;
          if (info.description && !(existing as any).aiDescription) updateData.aiDescription = info.description;
          if (!existing.source || existing.source === 'ai_generated') updateData.source = 'ai_generated_web';
          
          if (Object.keys(updateData).length > 0) {
            dbPlace = await prisma.place.update({
              where: { id: existing.id },
              data: updateData,
            });
            logger.info(`[IntentClassifier] Updated existing place "${existing.name}"`);
          } else {
            dbPlace = existing;
          }
        } else {
          // Create new
          dbPlace = await prisma.place.create({
            data: {
              name: info.name,
              city: info.city || 'Unknown',
              country: info.country || 'Unknown',
              latitude: finalLat,
              longitude: finalLng,
              address: info.address || null,
              website: info.website || null,
              phoneNumber: info.phoneNumber || null,
              openingHours: info.openingHours || null,
              rating: info.rating || null,
              ratingCount: info.ratingCount || null,
              coverImage: coverImage || '',
              categoryEn: categorySlug,
              aiDescription: info.description || null,
              source: 'ai_generated_web',
              isVerified: false,
            },
          });
          logger.info(`[IntentClassifier] Created new place "${dbPlace.name}" (id: ${dbPlace.id})`);
        }

        // Build PlaceResult
        return {
          id: dbPlace.id,
          name: dbPlace.name,
          summary: info.description || '',
          coverImage: dbPlace.coverImage || coverImage || '',
          latitude: dbPlace.latitude || finalLat,
          longitude: dbPlace.longitude || finalLng,
          city: dbPlace.city || info.city || '',
          country: dbPlace.country || info.country || '',
          rating: dbPlace.rating || info.rating,
          ratingCount: dbPlace.ratingCount || info.ratingCount,
          tags: [],
          isVerified: dbPlace.isVerified || false,
          source: 'cache',
          address: dbPlace.address || info.address || undefined,
          phoneNumber: dbPlace.phoneNumber || info.phoneNumber || undefined,
          website: dbPlace.website || info.website || undefined,
          openingHours: dbPlace.openingHours || info.openingHours || undefined,
          ticketUrl: info.ticketUrl || undefined,
        };
      } catch (dbError) {
        logger.warn(`[IntentClassifier] Failed to persist place "${info.name}": ${dbError}`);
        // Return without DB ID
        return {
          id: `temp_${Date.now()}`,
          name: info.name,
          summary: info.description || '',
          coverImage: coverImage || '',
          latitude: finalLat,
          longitude: finalLng,
          city: info.city || '',
          country: info.country || '',
          rating: info.rating,
          ratingCount: info.ratingCount,
          tags: [],
          isVerified: false,
          source: 'ai',
          address: info.address || undefined,
          phoneNumber: info.phoneNumber || undefined,
          website: info.website || undefined,
          openingHours: info.openingHours || undefined,
          ticketUrl: info.ticketUrl || undefined,
        };
      }
    } catch (error) {
      logger.warn(`[IntentClassifier] searchAndPersistPlace failed for "${placeName}": ${error}`);
      return null;
    }
  }

  /**
   * Map category string to database category slug
   */
  private mapCategoryToSlug(category: string): string {
    const categoryMap: Record<string, string> = {
      'museum': 'museum',
      'art gallery': 'art_gallery',
      'gallery': 'art_gallery',
      'cafe': 'cafe',
      'coffee': 'cafe',
      'restaurant': 'restaurant',
      'bar': 'bar',
      'pub': 'bar',
      'church': 'church',
      'cathedral': 'church',
      'temple': 'temple',
      'shrine': 'temple',
      'park': 'park',
      'garden': 'park',
      'castle': 'castle',
      'palace': 'castle',
      'landmark': 'landmark',
      'monument': 'landmark',
      'attraction': 'landmark',
      'market': 'market',
      'hotel': 'hotel',
      'hostel': 'hotel',
      'bookstore': 'bookstore',
      'zoo': 'zoo',
      'aquarium': 'zoo',
      'university': 'university',
      'library': 'library',
      'yarn store': 'yarn_store',
      'craft store': 'yarn_store',
      'shop': 'shop',
      'store': 'shop',
    };
    
    const lower = (category || '').toLowerCase().trim();
    return categoryMap[lower] || 'landmark';
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
   * Uses simple text generation (no web search) for faster and more reliable results
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
      // Use simple text generation (no web search) for faster, more reliable results
      const response = await this.generateSimpleTextWithFallback(prompt, CONFIG.DESCRIPTION_TIMEOUT_MS);

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

    let cities = aiResult.cities || [];
    let mentionedPlaces = aiResult.mentionedPlaces || [];

    // 如果没有识别到城市但有 constraints.requiredCity，使用它作为默认城市
    if (cities.length === 0 && constraints?.requiredCity) {
      cities = [constraints.requiredCity];
      logger.info(`[IntentClassifier] Using requiredCity as default: ${constraints.requiredCity}`);
    }

    // 如果地点数量偏少，尝试从文本中补充提取
    if (mentionedPlaces.length < 5) {
      const extractedPlaces = this.extractPlaceNamesFromText(
        aiResult.textContent,
        constraints?.requiredCity || cities[0] || '',
      );
      const existingNames = new Set(
        mentionedPlaces.map((p: MentionedPlace) => (p.name || '').toLowerCase()),
      );
      for (const extracted of extractedPlaces) {
        if (!existingNames.has(extracted.name.toLowerCase())) {
          mentionedPlaces.push(extracted);
          existingNames.add(extracted.name.toLowerCase());
        }
      }
      aiResult.mentionedPlaces = mentionedPlaces;
    }

    // Step 2: If no places mentioned, return just the text content
    if (!mentionedPlaces || mentionedPlaces.length === 0) {
      logger.info('[IntentClassifier] No places mentioned in response');
      return { textContent: aiResult.textContent };
    }

    // Step 2.5: Deduplicate places with similar names (e.g., "Loop" and "Loop London")
    // Keep the more specific/longer name when two names are substrings of each other
    mentionedPlaces = this.deduplicatePlaces(mentionedPlaces);
    logger.info(`[IntentClassifier] After deduplication: ${mentionedPlaces.length} unique places`);

    // Step 3: Match related places from database
    // Use shared translation cache to avoid duplicate AI calls
    const translationCache = new Map<string, string>();
    const result = await this.matchRelatedPlacesWithCache(mentionedPlaces, cities, language as 'en' | 'zh', translationCache);

    let textContent = aiResult.textContent;
    if (language === 'zh') {
      const allMatched: PlaceResult[] = result.relatedPlaces
        ? result.relatedPlaces
        : (result.cityPlaces || []).flatMap(group => group.places);

      if (allMatched.length > 0) {
        for (const mentioned of mentionedPlaces) {
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

        // Log all mentioned places for debugging
        if (mentionedPlaces.length > 0) {
          const placeNames = mentionedPlaces.map((p: MentionedPlace) => p.name).join(', ');
          logger.info(`[IntentClassifier] All mentioned places: ${placeNames}`);
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
   * @param skipImageSearch If true, skip image search for places not in DB (speeds up multi-city scenarios)
   * @returns Object with either relatedPlaces (single city) or cityPlaces (multi-city)
   */
  private async matchRelatedPlacesWithCache(
    mentionedPlaces: MentionedPlace[],
    cities: string[],
    language: 'en' | 'zh' = 'en',
    translationCache: Map<string, string>,
    skipImageSearch: boolean = false
  ): Promise<{ relatedPlaces?: PlaceResult[]; cityPlaces?: CityPlacesGroup[] }> {
    
    // Build a mapping from localized display name to English name for database matching
    // This allows us to display Chinese names while matching with English database entries
    const displayNameToEnglishName = new Map<string, string>();
    for (const place of mentionedPlaces) {
      if (place.nameEn && place.nameEn.trim()) {
        displayNameToEnglishName.set(
          this.normalizePlaceNameForMatching(place.name).toLowerCase(),
          place.nameEn.trim()
        );
        logger.info(`[IntentClassifier] Name mapping: "${place.name}" -> "${place.nameEn}"`);
      }
    }
    
    // Group mentioned places by city - use nameEn for matching if available
    const placesByCity = new Map<string, string[]>();
    for (const place of mentionedPlaces) {
      const normalizedCity = this.normalizeCityForMatching(place.city || '');
      const cityKey = (normalizedCity || place.city || '').toLowerCase().trim();
      const cityPlaces = placesByCity.get(cityKey) || [];
      // Use nameEn for database matching if available, otherwise fall back to name
      const nameForMatching = place.nameEn?.trim() || place.name;
      cityPlaces.push(this.normalizePlaceNameForMatching(nameForMatching));
      placesByCity.set(cityKey, cityPlaces);
    }

    // Normalize cities list
    const normalizedCities = cities
      .map(c => this.normalizeCityForMatching(c.trim()))
      .filter(c => c.length > 0);
    const uniqueCities = [...new Set(normalizedCities)];

    logger.info(`[IntentClassifier] Matching places for ${uniqueCities.length} cities: ${uniqueCities.join(', ')} (skipImageSearch: ${skipImageSearch})`);

    // 🚀 优化：多城市场景自动跳过图片搜索以避免超时
    const shouldSkipImageSearch = skipImageSearch || uniqueCities.length > 2;
    if (shouldSkipImageSearch && uniqueCities.length > 2) {
      logger.info(`[IntentClassifier] Auto-skipping image search for multi-city scenario (${uniqueCities.length} cities)`);
    }

    // Single city scenario: return flat array
    if (uniqueCities.length === 1) {
      const city = uniqueCities[0];
      const placeNames = placesByCity.get(city.toLowerCase()) || [];
      let results = await this.matchPlacesForCityWithCache(placeNames, city, language, translationCache);
      
      // 如果数据库没有匹配的地点，尝试为 AI 提到的地点创建临时 PlaceResult（联网搜索图片）
      if (results.length === 0 && mentionedPlaces.length > 0 && !shouldSkipImageSearch) {
        logger.info(`[IntentClassifier] No DB matches for "${city}", creating temp places with image search`);
        results = await this.createTempPlacesWithImageSearch(mentionedPlaces.slice(0, 10), city, language);
      } else if (results.length === 0 && mentionedPlaces.length > 0) {
        // 跳过图片搜索时，创建简单的临时地点（无图片）
        logger.info(`[IntentClassifier] No DB matches for "${city}", creating temp places without image search (fast mode)`);
        results = await this.createTempPlacesWithoutImageSearch(mentionedPlaces.slice(0, 10), city, language);
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
          if (!shouldSkipImageSearch) {
            logger.info(`[IntentClassifier] No DB matches for "${city}", creating temp places with image search`);
            results = await this.createTempPlacesWithImageSearch(cityMentionedPlaces.slice(0, 5), city, language);
          } else {
            // 🚀 优化：跳过图片搜索，直接创建临时地点（无图片但有坐标）
            logger.info(`[IntentClassifier] No DB matches for "${city}", creating temp places without image search (fast mode)`);
            results = await this.createTempPlacesWithoutImageSearch(cityMentionedPlaces.slice(0, 5), city, language);
          }
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

    // 常见地点别名映射（AI可能使用不同名称）
    const placeAliases: Record<string, string[]> = {
      // Versailles 别名
      'Château de Versailles': ['Palace of Versailles', 'Versailles Palace'],
      'Palace of Versailles': ['Château de Versailles', 'Versailles Palace'],
      'Versailles Palace': ['Palace of Versailles', 'Château de Versailles'],
      // Paris landmarks
      'Sacré-Cœur Basilica': ['Basilique du Sacré-Cœur de Montmartre', 'Sacré-Cœur'],
      'Sacré-Cœur': ['Basilique du Sacré-Cœur de Montmartre', 'Sacré-Cœur Basilica'],
      'Arc de Triomphe': ['Triumphal Arch', 'Arc de Triomphe de l\'Étoile'],
      'Jardin des Tuileries': ['Tuileries Garden', 'Tuileries Gardens'],
      'Trocadéro Gardens': ['Gardens du Trocadéro', 'Jardins du Trocadéro'],
      'Picasso Museum': ['Musée Picasso', 'Museum National Picasso-Paris'],
      'Luxembourg Gardens': ['Jardin du Luxembourg'],
      'Jardin du Luxembourg': ['Luxembourg Gardens'],
    };

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

        // 构建所有可能的名称（包括别名）
        const allNamesToTry = [cleanedName];
        const aliases = placeAliases[cleanedName] || placeAliases[name];
        if (aliases) {
          allNamesToTry.push(...aliases);
        }

        // 策略1：先尝试精确名字匹配（在指定城市内，包括别名）
        let exactMatch: any = null;
        for (const tryName of allNamesToTry) {
          exactMatch = await prisma.place.findFirst({
            where: {
              name: { equals: tryName, mode: 'insensitive' },
              city: { in: cityVariants, mode: 'insensitive' },
              AND: [
                { coverImage: { not: null } },
                { coverImage: { not: '' } },
              ],
            },
          });
          if (exactMatch) {
            if (tryName !== cleanedName) {
              logger.info(`[IntentClassifier] Matched via alias: "${name}" -> "${tryName}" -> "${exactMatch.name}"`);
            }
            break;
          }
        }
        
        // 策略1.5：如果城市内没找到，尝试不限城市的精确名字匹配
        // （精确名字匹配足够可靠，如 "Palace of Versailles" 城市是 Versailles 不是 Paris）
        if (!exactMatch) {
          for (const tryName of allNamesToTry) {
            exactMatch = await prisma.place.findFirst({
              where: {
                name: { equals: tryName, mode: 'insensitive' },
                AND: [
                  { coverImage: { not: null } },
                  { coverImage: { not: '' } },
                ],
              },
            });
            if (exactMatch) {
              logger.info(`[IntentClassifier] Found exact match outside city: "${exactMatch.name}" in ${exactMatch.city}`);
              break;
            }
          }
        }
        
        if (exactMatch && exactMatch.coverImage && exactMatch.coverImage.startsWith('http')) {
          if (!usedIds.has(exactMatch.id)) {
            usedIds.add(exactMatch.id);
            results.push(this.toPlaceResult(exactMatch, language));
            logger.info(`[IntentClassifier] Exact matched "${name}" -> "${exactMatch.name}"`);
          }
          continue; // 精确匹配成功，跳过模糊匹配
        }

        // 策略2：模糊匹配（增加 take 限制到 10）
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
          take: 10,  // 增加到10以确保不遗漏精确匹配
        });
        
        logger.info(`[IntentClassifier] DB query for "${name}": found ${candidates.length} candidates in cities [${cityVariants.join(', ')}]`);
        
        // Log candidate names for debugging
        if (candidates.length > 0) {
          const candidateInfo = candidates.map(c => `"${c.name}" (city: ${c.city})`).join(', ');
          logger.info(`[IntentClassifier] Candidates for "${name}": ${candidateInfo}`);
        }

        // Filter out candidates without images (double check)
        const withImages = candidates.filter(c => c.coverImage && c.coverImage !== '' && c.coverImage.startsWith('http'));
        
        if (withImages.length === 0) {
          logger.info(`[IntentClassifier] No candidates with valid images for "${name}"`);
          continue;
        }

        // Find best match by name similarity (use both standard and word-based)
        let bestMatch: any = null;
        let bestScore = 0;

        for (const candidate of withImages) {
          const standardSim = calculateNameSimilarity(cleanedName || name, candidate.name);
          const wordSim = this.calculateWordBasedSimilarity(cleanedName || name, candidate.name);
          const similarity = Math.max(standardSim, wordSim);
          logger.info(`[IntentClassifier] Similarity "${cleanedName || name}" vs "${candidate.name}": ${similarity.toFixed(3)} (standard: ${standardSim.toFixed(3)}, word: ${wordSim.toFixed(3)})`);
          if (similarity > bestScore && similarity >= CONFIG.NAME_SIMILARITY_THRESHOLD) {
            bestMatch = candidate;
            bestScore = similarity;
          }
        }

        if (bestMatch && !usedIds.has(bestMatch.id)) {
          usedIds.add(bestMatch.id);
          results.push(this.toPlaceResult(bestMatch, language));
          logger.info(`[IntentClassifier] Matched "${name}" -> "${bestMatch.name}" (score: ${bestScore.toFixed(2)})`);
        } else if (!bestMatch) {
          logger.info(`[IntentClassifier] No match found for "${name}" (candidates: ${withImages.length}, threshold: ${CONFIG.NAME_SIMILARITY_THRESHOLD})`);
        }
      } catch (error) {
        logger.warn(`[IntentClassifier] Error matching place "${name}": ${error}`);
      }
    }

    return results;
  }

  /**
   * Deduplicate places with similar names
   * When two place names are substrings of each other (e.g., "Loop" and "Loop London"),
   * keep the more specific/longer name
   * @param places Array of mentioned places
   * @returns Deduplicated array of places
   */
  private deduplicatePlaces(places: MentionedPlace[]): MentionedPlace[] {
    if (places.length <= 1) return places;

    const result: MentionedPlace[] = [];
    const processedIndices = new Set<number>();

    for (let i = 0; i < places.length; i++) {
      if (processedIndices.has(i)) continue;

      const place1 = places[i];
      const name1Lower = (place1.name || '').toLowerCase().trim();
      if (!name1Lower) {
        processedIndices.add(i);
        continue;
      }

      let bestPlace = place1;
      let bestNameLength = name1Lower.length;

      // Find all places that are similar to this one
      for (let j = i + 1; j < places.length; j++) {
        if (processedIndices.has(j)) continue;

        const place2 = places[j];
        const name2Lower = (place2.name || '').toLowerCase().trim();
        if (!name2Lower) continue;

        // Check if names are related (one contains the other, or high similarity)
        const isSimilar = 
          name1Lower.includes(name2Lower) || 
          name2Lower.includes(name1Lower) ||
          this.calculateNameSimilarity(name1Lower, name2Lower) > 0.8;

        if (isSimilar) {
          processedIndices.add(j);
          // Keep the longer/more specific name
          if (name2Lower.length > bestNameLength) {
            bestPlace = place2;
            bestNameLength = name2Lower.length;
          }
          logger.info(`[IntentClassifier] Dedup: "${place2.name}" merged into "${bestPlace.name}"`);
        }
      }

      result.push(bestPlace);
      processedIndices.add(i);
    }

    return result;
  }

  /**
   * Calculate similarity between two place names (0-1)
   */
  private calculateNameSimilarity(name1: string, name2: string): number {
    const n1 = name1.toLowerCase().trim();
    const n2 = name2.toLowerCase().trim();
    
    if (n1 === n2) return 1;
    if (!n1 || !n2) return 0;

    // Simple Jaccard similarity on words
    const words1 = new Set(n1.split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(n2.split(/\s+/).filter(w => w.length > 2));
    
    if (words1.size === 0 || words2.size === 0) return 0;

    let intersection = 0;
    for (const word of words1) {
      if (words2.has(word)) intersection++;
    }

    const union = words1.size + words2.size - intersection;
    return union > 0 ? intersection / union : 0;
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
    const unmatchedPlaces: MentionedPlace[] = [];
    // Default city variants (used as fallback)
    const defaultCityVariants = this.getCityVariants(this.normalizeCityForMatching(city));

    // Step 1: Try to find existing places in database first (with full details)
    for (const place of placesToProcess) {
      const placeName = this.normalizePlaceNameForMatching(place.name);
      if (!placeName) {
        unmatchedPlaces.push(place);
        continue;
      }

      // Use place's own city if available, otherwise use default city
      const placeCity = place.city?.trim() || city;
      const placeCityVariants = placeCity !== city 
        ? this.getCityVariants(this.normalizeCityForMatching(placeCity))
        : defaultCityVariants;

      try {
        // Try exact match first with place's city
        let dbPlace = await prisma.place.findFirst({
          where: {
            name: { equals: placeName, mode: 'insensitive' },
            city: { in: placeCityVariants, mode: 'insensitive' },
          },
        });

        // Try fuzzy match if exact match fails
        if (!dbPlace) {
          dbPlace = await prisma.place.findFirst({
            where: {
              name: { contains: placeName, mode: 'insensitive' },
              city: { in: placeCityVariants, mode: 'insensitive' },
            },
          });
        }

        // Also try matching without city constraint for unique/famous names
        if (!dbPlace) {
          dbPlace = await prisma.place.findFirst({
            where: {
              name: { equals: placeName, mode: 'insensitive' },
            },
          });
        }
        
        // Try fuzzy match without city for unique names
        if (!dbPlace) {
          dbPlace = await prisma.place.findFirst({
            where: {
              name: { contains: placeName, mode: 'insensitive' },
            },
          });
        }

        if (dbPlace) {
          logger.info(`[IntentClassifier] Found existing place in DB: "${placeName}" -> "${dbPlace.name}" (city: ${dbPlace.city})`);
          results.push(this.toPlaceResult(dbPlace, language));
        } else {
          unmatchedPlaces.push(place);
        }
      } catch (error) {
        logger.warn(`[IntentClassifier] DB lookup failed for "${placeName}": ${error}`);
        unmatchedPlaces.push(place);
      }
    }

    // If all places were found in DB, return early
    if (unmatchedPlaces.length === 0) {
      logger.info(`[IntentClassifier] All ${results.length} places found in database with full details`);
      return results;
    }

    logger.info(`[IntentClassifier] ${results.length} from DB, ${unmatchedPlaces.length} need temp creation`);
    
    // OPTIMIZATION: Use batch image search (SINGLE AI call for all places)
    let imageMap = new Map<string, string | null>();
    
    // Only do batch image search if AI call limit not exceeded
    if (canMakeAICall() && unmatchedPlaces.length > 0) {
      const openRouter = new OpenRouterProvider();
      if (openRouter.isAvailable()) {
        // Count as 1 AI call for the batch
        incrementAICallCount('intentClassifier.batchImageSearch');
        logger.info(`[IntentClassifier] Batch image search for ${unmatchedPlaces.length} places (global calls: ${getAICallCount()}/${getMaxAICallsPerRequest()})`);
        
        // Use each place's own city for image search
        const searchPlaces = unmatchedPlaces.map(p => ({
          name: this.normalizePlaceNameForMatching(p.name) || p.name,
          city: p.city?.trim() || city,
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

    // Process unmatched places with batch results
    for (const place of unmatchedPlaces) {
      try {
        const placeName = this.normalizePlaceNameForMatching(place.name);
        if (!placeName) continue;

        // Get image from batch results
        const imageUrl = imageMap.get(placeName) || imageMap.get(place.name) || '';

        // Use place's own city if available
        const placeCity = place.city?.trim() || city;
        const placeCountry = (place as any).country || '';

        // Try to get coordinates from address using forward geocoding (Nominatim - NOT AI)
        // IMPORTANT: Always include city in geocoding query to avoid matching wrong locations
        let latitude = 0;
        let longitude = 0;
        const placeAddress = (place as any).address;
        // Build geocoding query: use address+city if address exists, otherwise use placeName+city
        const geocodeQuery = placeAddress 
          ? `${placeAddress}, ${placeCity}`
          : `${placeName}, ${placeCity}`;
        
        try {
          const coords = await geocodeService.forwardGeocode(geocodeQuery);
          if (coords) {
            latitude = coords.lat;
            longitude = coords.lon;
            logger.debug(`[IntentClassifier] Geocoded "${placeName}" in ${placeCity}: ${coords.lat}, ${coords.lon}`);
          }
        } catch (geoError) {
          // Geocoding errors are fine, just continue
        }

        // Build summary: prefer AI-provided summary, fallback to generic
        const rating = (place as any).rating;
        const ratingStr = rating ? ` (${rating}⭐)` : '';
        const locationStr = placeCountry ? `${placeCity}, ${placeCountry}` : placeCity;
        
        let summary: string;
        if ((place as any).summary && (place as any).summary.trim().length > 0) {
          // Use AI-provided summary if available
          summary = (place as any).summary.trim();
        } else if (language === 'zh') {
          summary = `位于${locationStr}${ratingStr}，是一个值得探索的独特目的地。`;
        } else {
          summary = `Located in ${locationStr}${ratingStr}, a unique destination worth exploring.`;
        }

        // Create temporary PlaceResult
        const tempPlace: PlaceResult = {
          id: `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          name: place.name,
          summary,
          coverImage: imageUrl,
          images: imageUrl ? [imageUrl] : [],
          latitude,
          longitude,
          city: placeCity,
          country: placeCountry,
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
   * Create temporary PlaceResults WITHOUT image search (fast mode)
   * Used for multi-city scenarios to avoid timeout
   * Only geocodes addresses, no AI image search
   * @param mentionedPlaces Places mentioned by AI
   * @param city Default city name
   * @param language Language for display
   * @returns Array of PlaceResults without images
   */
  private async createTempPlacesWithoutImageSearch(
    mentionedPlaces: MentionedPlace[],
    city: string,
    language: 'en' | 'zh' = 'en'
  ): Promise<PlaceResult[]> {
    const results: PlaceResult[] = [];
    const placesToProcess = mentionedPlaces.slice(0, 10);
    const defaultCityVariants = this.getCityVariants(this.normalizeCityForMatching(city));

    // Step 1: Try to find existing places in database first
    for (const place of placesToProcess) {
      const placeName = this.normalizePlaceNameForMatching(place.name);
      if (!placeName) continue;

      const placeCity = place.city?.trim() || city;
      const placeCityVariants = placeCity !== city 
        ? this.getCityVariants(this.normalizeCityForMatching(placeCity))
        : defaultCityVariants;

      try {
        // Try exact match first
        let dbPlace = await prisma.place.findFirst({
          where: {
            name: { equals: placeName, mode: 'insensitive' },
            city: { in: placeCityVariants, mode: 'insensitive' },
          },
        });

        // Try fuzzy match
        if (!dbPlace) {
          dbPlace = await prisma.place.findFirst({
            where: {
              name: { contains: placeName, mode: 'insensitive' },
              city: { in: placeCityVariants, mode: 'insensitive' },
            },
          });
        }

        // Try without city constraint
        if (!dbPlace) {
          dbPlace = await prisma.place.findFirst({
            where: {
              name: { equals: placeName, mode: 'insensitive' },
            },
          });
        }

        if (dbPlace) {
          logger.info(`[IntentClassifier] Found existing place in DB (fast mode): "${placeName}" -> "${dbPlace.name}"`);
          results.push(this.toPlaceResult(dbPlace, language));
          continue;
        }
      } catch (error) {
        logger.warn(`[IntentClassifier] DB lookup failed for "${placeName}": ${error}`);
      }

      // Step 2: Create temp place without image (just geocode)
      try {
        const placeCity = place.city?.trim() || city;
        const placeCountry = (place as any).country || '';

        // Try to get coordinates (fast, uses Nominatim not AI)
        let latitude = 0;
        let longitude = 0;
        const placeAddress = (place as any).address;
        const geocodeQuery = placeAddress 
          ? `${placeAddress}, ${placeCity}`
          : `${placeName}, ${placeCity}`;
        
        try {
          const coords = await geocodeService.forwardGeocode(geocodeQuery);
          if (coords) {
            latitude = coords.lat;
            longitude = coords.lon;
            logger.info(`[IntentClassifier] Geocoded "${placeName}" -> (${latitude}, ${longitude})`);
          } else {
            logger.warn(`[IntentClassifier] Geocoding failed for "${placeName}" - no coords returned`);
          }
        } catch (geoError) {
          logger.warn(`[IntentClassifier] Geocoding error for "${placeName}": ${geoError}`);
        }

        // Build summary: prefer AI-provided summary, fallback to generic
        const rating = (place as any).rating;
        const ratingStr = rating ? ` (${rating}⭐)` : '';
        const locationStr = placeCountry ? `${placeCity}, ${placeCountry}` : placeCity;
        
        let summary: string;
        if ((place as any).summary && (place as any).summary.trim().length > 0) {
          // Use AI-provided summary if available
          summary = (place as any).summary.trim();
        } else if (language === 'zh') {
          summary = `位于${locationStr}${ratingStr}，是一个值得探索的独特目的地。`;
        } else {
          summary = `Located in ${locationStr}${ratingStr}, a unique destination worth exploring.`;
        }

        const tempPlace: PlaceResult = {
          id: `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          name: place.name,
          summary,
          coverImage: '', // 🚀 No image search - will be empty
          images: [],
          latitude,
          longitude,
          city: placeCity,
          country: placeCountry,
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
        logger.warn(`[IntentClassifier] Error creating temp place (fast mode) for "${place.name}": ${error}`);
      }
    }

    logger.info(`[IntentClassifier] Created ${results.length} temp places (fast mode, no image search)`);
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
    
    // Build summary with fallback
    let summary = dbPlace.aiDescription || dbPlace.description || '';
    if (!summary) {
      // Generate a fallback summary based on available data
      const city = dbPlace.city || '';
      const country = dbPlace.country || '';
      const category = dbPlace.categoryEn || '';
      const rating = dbPlace.rating;
      
      const locationStr = country ? `${city}, ${country}` : city;
      const ratingStr = rating ? ` (${rating}⭐)` : '';
      const categoryStr = category ? ` ${category.toLowerCase()}` : '';
      
      if (language === 'zh') {
        summary = locationStr 
          ? `位于${locationStr}的${categoryStr ? categoryStr : '景点'}${ratingStr}。`
          : `值得探索的${categoryStr ? categoryStr : '景点'}${ratingStr}。`;
      } else {
        summary = locationStr
          ? `A${categoryStr || ' destination'} in ${locationStr}${ratingStr}.`
          : `A${categoryStr || ' destination'} worth exploring${ratingStr}.`;
      }
    }
    
    return {
      id: dbPlace.id,
      name: dbPlace.name,
      summary,
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

  // ============ Architect/Style Query Handler Methods ============

  /**
   * Handle architect/architectural style queries
   * 处理建筑师/建筑风格查询 - 先介绍人物/风格，再展示相关地点
   * @param query User's query (e.g., "zaha hadid's architecture")
   * @param language User's preferred language ('en' or 'zh')
   * @returns Handler result with textContent and matched places
   */
  async handleArchitectQuery(query: string, language: string): Promise<ArchitectQueryHandlerResult> {
    logger.info(`[IntentClassifier] Handling architect/style query: "${query}"`);

    // Step 1: Generate AI response with architect/style intro and place mentions
    const aiResult = await this.generateArchitectQueryResponse(query, language);

    if (!aiResult.textContent || aiResult.textContent.length === 0) {
      logger.warn('[IntentClassifier] Empty architect query response');
      const fallbackMsg = language === 'zh'
        ? '抱歉，无法生成回复。请稍后再试。'
        : 'Sorry, unable to generate a response. Please try again.';
      return { textContent: fallbackMsg, places: [] };
    }

    // Step 2: Extract mentioned places and match with database
    const mentionedPlaces = aiResult.mentionedPlaces || [];
    const cities = aiResult.cities || [];

    if (mentionedPlaces.length === 0) {
      logger.info('[IntentClassifier] No places mentioned in architect query response');
      return { textContent: aiResult.textContent, places: [] };
    }

    // Build a map of AI-provided summaries by normalized place name
    const summaryMap = new Map<string, string>();
    for (const place of mentionedPlaces) {
      if (place.summary && place.summary.trim()) {
        const normalizedName = this.normalizePlaceNameForMatching(place.name).toLowerCase();
        summaryMap.set(normalizedName, place.summary.trim());
      }
    }

    // Step 3: Match places from database
    const translationCache = new Map<string, string>();
    const matchResult = await this.matchRelatedPlacesWithCache(
      mentionedPlaces,
      cities,
      language as 'en' | 'zh',
      translationCache,
      false // 允许图片搜索
    );

    // Flatten results
    let matchedPlaces: PlaceResult[] = [];
    if (matchResult.relatedPlaces) {
      matchedPlaces = matchResult.relatedPlaces;
    } else if (matchResult.cityPlaces) {
      matchedPlaces = matchResult.cityPlaces.flatMap(g => g.places);
    }

    // Step 4: Filter out AI-generated temporary places, keep only database-matched places
    // AI-generated places (source: 'ai' or temp_ IDs) should NOT be clickable or shown on map
    const dbMatchedPlaces = matchedPlaces.filter(place => {
      const isDbPlace = place.source === 'cache' && !place.id.startsWith('temp_');
      if (!isDbPlace) {
        logger.info(`[IntentClassifier] Filtered out AI-generated place: "${place.name}" (source: ${place.source}, id: ${place.id})`);
      }
      return isDbPlace;
    });

    logger.info(`[IntentClassifier] Filtered places: ${matchedPlaces.length} total -> ${dbMatchedPlaces.length} database-matched`);

    // Step 5: Apply AI-generated summaries to database-matched places
    for (const place of dbMatchedPlaces) {
      const normalizedName = this.normalizePlaceNameForMatching(place.name).toLowerCase();
      const aiSummary = summaryMap.get(normalizedName);
      if (aiSummary) {
        place.summary = aiSummary;
        logger.info(`[IntentClassifier] Applied AI summary to "${place.name}": ${aiSummary.substring(0, 50)}...`);
      } else {
        // Try partial match for places with different names (e.g., "MAXXI Museum" -> "MAXXI - National Museum...")
        for (const [key, summary] of summaryMap.entries()) {
          if (normalizedName.includes(key) || key.includes(normalizedName.split(' ')[0])) {
            place.summary = summary;
            logger.info(`[IntentClassifier] Applied AI summary (partial match) to "${place.name}": ${summary.substring(0, 50)}...`);
            break;
          }
        }
      }
    }

    // Step 6: Build name mapping for frontend matching
    // This maps localized display names (used in textContent) to English database names
    const nameMapping: Array<{ displayName: string; englishName: string }> = [];
    for (const mentionedPlace of mentionedPlaces) {
      // Find the matched database place by using nameEn
      const nameEnLower = (mentionedPlace.nameEn || '').toLowerCase();
      const matchedDbPlace = dbMatchedPlaces.find(dbPlace => {
        const dbNameLower = dbPlace.name.toLowerCase();
        return dbNameLower.includes(nameEnLower) || nameEnLower.includes(dbNameLower);
      });
      
      if (matchedDbPlace && mentionedPlace.name !== matchedDbPlace.name) {
        nameMapping.push({
          displayName: mentionedPlace.name,  // Localized name from AI (e.g., "卢浮宫玻璃金字塔")
          englishName: matchedDbPlace.name,   // Database name (e.g., "Louvre Pyramid")
        });
        logger.info(`[IntentClassifier] Name mapping added: "${mentionedPlace.name}" -> "${matchedDbPlace.name}"`);
      }
    }

    logger.info(`[IntentClassifier] Architect query result: textContent=${aiResult.textContent.length} chars, dbMatchedPlaces=${dbMatchedPlaces.length}, nameMapping=${nameMapping.length}`);

    return {
      textContent: aiResult.textContent,
      places: dbMatchedPlaces,
      nameMapping: nameMapping.length > 0 ? nameMapping : undefined,
    };
  }

  /**
   * Generate AI response for architect/style queries
   * @param query User's query
   * @param language User's preferred language
   * @returns AI result with textContent, mentionedPlaces, and cities
   */
  private async generateArchitectQueryResponse(
    query: string,
    language: string
  ): Promise<TravelConsultationAIResult> {
    const languageText = language === 'zh' ? 'Chinese' : 'English';
    const prompt = ARCHITECT_STYLE_PROMPT
      .replace('{query}', query)
      .replace(/\{language\}/g, languageText);

    try {
      const response = await this.generateTextWithFallback(prompt, CONFIG.ARCHITECT_QUERY_TIMEOUT_MS) || '__TIMEOUT__';

      if (!response || response === '__TIMEOUT__') {
        logger.warn('[IntentClassifier] Architect query response generation timed out');
        return {
          textContent: language === 'zh'
            ? '抱歉，响应超时了。请稍后再试。'
            : 'Sorry, the request timed out. Please try again.',
          mentionedPlaces: [],
          cities: [],
        };
      }

      // Try to parse JSON response with fallback for truncated JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          const textContent = this.normalizeMarkdownOutput(parsed.textContent || '');
          
          // Debug: log raw mentionedPlaces from AI
          const rawPlaces = parsed.mentionedPlaces;
          logger.info(`[IntentClassifier] Raw mentionedPlaces from AI: ${JSON.stringify(rawPlaces)?.substring(0, 500)}`);
          
          const mentionedPlaces: MentionedPlace[] = (rawPlaces || [])
            .filter((p: any) => p && typeof p.name === 'string' && p.name.trim())
            .map((p: any) => ({
              name: p.name.trim(),
              nameEn: (p.nameEn || '').trim(),  // English name for database matching
              city: (p.city || '').trim(),
              country: (p.country || '').trim(),
              summary: (p.summary || '').trim(),
            }));
          const cities = Array.isArray(parsed.cities) ? parsed.cities : [];

          logger.info(`[IntentClassifier] Generated architect query response: ${textContent.length} chars, ${mentionedPlaces.length} places`);
          return { textContent, mentionedPlaces, cities };
        } catch (parseError) {
          // JSON parsing failed, try to extract textContent from truncated response
          logger.warn(`[IntentClassifier] JSON parse failed, trying to extract textContent: ${parseError}`);
          
          // Try to extract textContent field even from malformed JSON
          const textMatch = response.match(/"textContent"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
          if (textMatch) {
            const extractedText = textMatch[1]
              .replace(/\\n/g, '\n')
              .replace(/\\"/g, '"')
              .replace(/\\\\/g, '\\');
            const textContent = this.normalizeMarkdownOutput(extractedText);
            
            // Try to extract mentionedPlaces from the raw response
            const placesMatch = response.match(/"mentionedPlaces"\s*:\s*\[([\s\S]*?)(?:\]|$)/);
            let mentionedPlaces: MentionedPlace[] = [];
            if (placesMatch) {
              // Extract individual place objects using regex
              const placeRegex = /\{\s*"name"\s*:\s*"([^"]+)"(?:,\s*"city"\s*:\s*"([^"]*)")?(?:,\s*"country"\s*:\s*"([^"]*)")?/g;
              let placeMatch;
              while ((placeMatch = placeRegex.exec(placesMatch[1])) !== null) {
                mentionedPlaces.push({
                  name: placeMatch[1].trim(),
                  city: (placeMatch[2] || '').trim(),
                  country: (placeMatch[3] || '').trim(),
                });
              }
            }
            
            logger.info(`[IntentClassifier] Extracted from truncated JSON: ${textContent.length} chars, ${mentionedPlaces.length} places`);
            return { textContent, mentionedPlaces, cities: [] };
          }
        }
      }

      // If no JSON found, treat the whole response as text content
      logger.warn('[IntentClassifier] No JSON in architect query response, using raw text');
      return { textContent: this.normalizeMarkdownOutput(response), mentionedPlaces: [], cities: [] };

    } catch (error) {
      logger.warn(`[IntentClassifier] Failed to generate architect query response: ${error}`);
      return {
        textContent: language === 'zh'
          ? '抱歉，处理请求时出错了。请稍后再试。'
          : 'Sorry, something went wrong. Please try again.',
        mentionedPlaces: [],
        cities: [],
      };
    }
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
