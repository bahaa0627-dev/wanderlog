/**
 * Intent Recognition Types
 * 
 * Defines types for the AI intent classification system that extends
 * the existing searchV2 functionality with four intent types:
 * - general_search: Finding multiple places with criteria
 * - specific_place: Getting info about a specific named place
 * - travel_consultation: Travel advice without specific place requests
 * - non_travel: Non-travel related queries
 */

// ============ Intent Types ============

/**
 * The four supported intent types
 */
export type IntentType = 
  | 'general_search' 
  | 'specific_place' 
  | 'travel_consultation' 
  | 'non_travel';

/**
 * Result from intent classification
 */
export interface IntentResult {
  intent: IntentType;
  placeName?: string;           // specific_place: the exact place name
  placeNames?: string[];        // travel_consultation: extracted place names from response
  city?: string;                // Detected city name
  category?: string;            // Detected category (restaurant, cafe, museum, etc.)
  count?: number;               // Detected quantity request
  confidence?: number;          // Confidence score 0-1
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
  isVerified: boolean;
  source: 'cache' | 'ai';
  address?: string;
  phoneNumber?: string;
  website?: string;
  openingHours?: string;
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
  name: string;                 // Place name
  city: string;                 // City the place belongs to
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
 * Union type for all search responses
 */
export type SearchResponse = 
  | GeneralSearchResponse 
  | SpecificPlaceResponse 
  | TravelConsultationResponse 
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
