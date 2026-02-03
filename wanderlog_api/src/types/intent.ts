/**
 * Intent Recognition Types
 * 
 * Defines types for the AI intent classification system that extends
 * the existing searchV2 functionality with five intent types:
 * - general_search: Finding multiple places with criteria
 * - specific_place: Getting info about a specific named place
 * - travel_consultation: Travel advice without specific place requests
 * - regular_travel: General travel info (city recommendations, transport, tickets, etc.) with optional place matching
 * - non_travel: Non-travel related queries
 */

// ============ Intent Types ============

/**
 * The five supported intent types
 */
export type IntentType = 
  | 'general_search' 
  | 'specific_place' 
  | 'travel_consultation' 
  | 'regular_travel'
  | 'non_travel';

/**
 * Result from intent classification
 */
export interface IntentResult {
  intent: IntentType;
  placeName?: string;           // specific_place: the exact place name
  placeNames?: string[];        // travel_consultation: extracted place names from response
  city?: string;                // Detected city name
  category?: string;            // Detected category slug (restaurant, cafe, museum, etc.)
  tags?: string[];              // Detected tag keywords for search
  count?: number;               // Detected quantity request
  confidence?: number;          // Confidence score 0-1
  isArchitectQuery?: boolean;   // general_search: true if query is about architects/architectural styles
}

// ============ Place Result Types ============

/**
 * Standard place result structure (matches existing searchV2 format)
 */
export interface PlaceResult {
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
  display_tags_en?: string[];  // 展示标签（英文）- category + ai_tags
  isVerified: boolean;
  source: 'cache' | 'ai';
  address?: string;
  phoneNumber?: string;
  website?: string;
  openingHours?: string;
  ticketUrl?: string;  // 购票链接（博物馆、景点等）
}

/**
 * Category group for general_search results
 */
export interface CategoryGroup {
  title: string;
  places: PlaceResult[];
}

// ============ Response Types ============

/**
 * Base response structure - all responses include intent and success
 */
export interface BaseSearchResponse {
  intent: IntentType;
  success: boolean;
  error?: string;
}

/**
 * Response for general_search intent (maintains backward compatibility)
 */
export interface GeneralSearchResponse extends BaseSearchResponse {
  intent: 'general_search';
  acknowledgment: string;
  categories?: CategoryGroup[];
  places: PlaceResult[];
  requestedCount: number;
  exceededLimit: boolean;
  quotaRemaining: number;
  stage: string;
}

/**
 * Response for specific_place intent
 */
export interface SpecificPlaceResponse extends BaseSearchResponse {
  intent: 'specific_place';
  description: string;          // AI-generated introduction (2-3 sentences, <100 words)
  place?: PlaceResult;          // Matched place from database (optional)
}

/**
 * Handler result for specific_place processing
 */
export interface SpecificPlaceHandlerResult {
  description: string;          // AI-generated description (under 100 words)
  place: PlaceResult | null;    // Matched place from database (prioritizes images)
  identifiedPlaceName?: string; // AI-identified place name (for vague queries)
}

/**
 * City places group for multi-city travel consultation
 */
export interface CityPlacesGroup {
  city: string;                 // City name
  places: PlaceResult[];        // Related places for this city (at least 3)
}

/**
 * Mentioned place extracted from AI response
 */
export interface MentionedPlace {
  name: string;                 // Display name (localized, e.g., "卢浮宫玻璃金字塔")
  nameEn?: string;              // English name for database matching (e.g., "Louvre Pyramid")
  city: string;                 // City the place belongs to
  summary?: string;             // Short description (~50 characters)
  address?: string;             // Full address if known
  website?: string;             // Official website URL
  country?: string;             // Country name
  rating?: number;              // Rating score (e.g., 4.5)
  ratingCount?: number;         // Number of reviews
}

/**
 * Result from travel consultation AI generation
 */
export interface TravelConsultationAIResult {
  textContent: string;          // Markdown formatted response
  mentionedPlaces: MentionedPlace[]; // Places mentioned in the response with their cities
  cities: string[];             // All cities mentioned in the response
}

/**
 * Handler result for travel_consultation processing
 */
export interface TravelConsultationHandlerResult {
  textContent: string;          // Markdown formatted response
  relatedPlaces?: PlaceResult[]; // Single city: flat array
  cityPlaces?: CityPlacesGroup[]; // Multi-city: grouped by city
}

/**
 * Handler result for non_travel processing
 */
export interface NonTravelHandlerResult {
  textContent: string;          // Markdown formatted response (no database queries)
}

/**
 * Name mapping for display name to English name matching
 * Used when text content uses localized names (e.g., Chinese) but database has English names
 */
export interface PlaceNameMapping {
  displayName: string;          // Localized display name (e.g., "卢浮宫玻璃金字塔")
  englishName: string;          // English name for database matching (e.g., "Louvre Pyramid")
}

/**
 * Handler result for architect/style query processing
 * 建筑师/建筑风格查询的处理结果
 */
export interface ArchitectQueryHandlerResult {
  textContent: string;          // Markdown formatted intro about the architect/style
  places: PlaceResult[];        // Matched places from database
  nameMapping?: PlaceNameMapping[]; // Mapping of display names to English names for front-end matching
}

/**
 * Response for travel_consultation intent
 */
export interface TravelConsultationResponse extends BaseSearchResponse {
  intent: 'travel_consultation';
  textContent: string;          // Markdown formatted response
  relatedPlaces?: PlaceResult[]; // Single city: flat array for horizontal scroll
  cityPlaces?: CityPlacesGroup[]; // Multi-city: grouped by city
}

/**
 * Response for non_travel intent
 */
export interface NonTravelResponse extends BaseSearchResponse {
  intent: 'non_travel';
  textContent: string;          // Markdown formatted response
}

/**
 * Handler result for regular_travel processing
 * 通用旅行信息的处理结果（城市推荐、交通、门票等）
 * 包含可选的匹配地点（仅展示数据库中有封面图的地点）
 */
export interface RegularTravelHandlerResult {
  textContent: string;          // Markdown formatted response
  mentionedPlaceNames: string[]; // Place names mentioned in the response (for database matching)
  matchedPlaces?: PlaceResult[]; // Places matched from database (with cover images)
}

/**
 * Response for regular_travel intent
 * 通用旅行意图的响应 - 文本 + 可选的匹配地点卡片
 */
export interface RegularTravelResponse extends BaseSearchResponse {
  intent: 'regular_travel';
  textContent: string;          // Markdown formatted response
  matchedPlaces?: PlaceResult[]; // Places matched from database (for cards and map)
}

/**
 * Union type for all search responses
 */
export type SearchResponse = 
  | GeneralSearchResponse 
  | SpecificPlaceResponse 
  | TravelConsultationResponse 
  | RegularTravelResponse
  | NonTravelResponse;

// ============ Intent Classifier Interface ============

/**
 * Interface for the intent classifier service
 */
export interface IIntentClassifier {
  /**
   * Classify user query intent using AI
   * @param query User's search query
   * @param language User's preferred language ('en' or 'zh')
   * @returns Intent classification result
   */
  classify(query: string, language: string): Promise<IntentResult>;
  
  /**
   * Fallback classification using rule-based detection
   * Used when AI classification fails
   * @param query User's search query
   * @param language User's preferred language
   * @returns Intent classification result
   */
  fallbackClassify(query: string, language: string): IntentResult;
}
