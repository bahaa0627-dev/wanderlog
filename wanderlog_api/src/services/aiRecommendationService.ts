/**
 * AI Recommendation Service
 * 
 * Handles GPT-4o-mini (via Kouri) calls for place recommendations
 * as part of the AI Search V2 parallel pipeline.
 * 
 * Requirements: 1.1, 3.1, 3.3, 3.4, 3.5, 6.1, 6.2, 6.3, 6.4
 */

import { KouriProvider } from './aiProviders/KouriProvider';
import { AzureOpenAIProvider } from './aiProviders/AzureOpenAIProvider';
import { GeminiProvider } from './aiProviders/GeminiProvider';
import { AIProvider, AIProviderName, AIServiceError, AIErrorCode } from './aiProviders/types';

/**
 * AI-generated place recommendation
 */
export interface AIPlace {
  name: string;
  summary: string;
  latitude: number;
  longitude: number;
  city: string;
  country: string;
  coverImageUrl: string;
  tags: string[];
  recommendationPhrase: string;
}

/**
 * AI category grouping
 */
export interface AICategory {
  title: string;
  placeNames: string[];
}

/**
 * Result from AI recommendation call
 */
export interface AIRecommendationResult {
  acknowledgment: string;
  categories?: AICategory[];
  places: AIPlace[];
  requestedCount: number; // 用户请求的数量，用于控制最终展示（最大20）
  exceededLimit: boolean; // 用户请求是否超过20
}

/**
 * Basic place info for summary generation
 */
export interface PlaceBasicInfo {
  name: string;
  city?: string;
  country?: string;
}

/**
 * Result from summary generation
 */
export interface SummaryResult {
  placeSummaries: Map<string, string>;
  overallSummary: string;
}

/**
 * Validation error for AI responses
 */
export class AIResponseValidationError extends Error {
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'AIResponseValidationError';
  }
}

/**
 * System prompt for place recommendations
 * Requirements: 3.1, 3.3, 3.4, 3.5
 */
const RECOMMENDATION_SYSTEM_PROMPT = `You are a travel expert. Recommend places based on user query.

LANGUAGE RULES (CRITICAL):
- The user will specify their preferred language in the prompt
- ALL output text MUST be in the user's specified language
- Place names should use their commonly known name (can be in original language)
- Category titles, summaries, tags, recommendationPhrase - ALL in user's language
- acknowledgment - MUST be in user's language

CATEGORY RULES (CRITICAL):
- ALWAYS create exactly 3-4 categories
- Each category MUST have 5-7 places
- Total places: match user's requested count (default 20, max 20)
- Categories should have emoji prefix, e.g. "☕ Specialty Coffee", "🏛️ Historic Sites", "🍜 Local Eats"

PLACE SELECTION RULES (CRITICAL):
- For general queries like "interesting places", "things to do", "places to visit":
  - Prioritize FAMOUS landmarks, iconic attractions, and must-see destinations
  - Include a mix: landmarks, museums, temples/shrines, parks, viewpoints
  - Avoid recommending only restaurants or cafes unless specifically asked
- For specific queries like "cafes", "ramen shops", "restaurants":
  - Focus on that specific category
  - Recommend well-known, highly-rated establishments

Return ONLY valid JSON (no markdown, no code blocks):
{
  "requestedCount": 10,
  "exceededLimit": false,
  "acknowledgment": "A creative, engaging intro (2-3 sentences, max 60 words). Avoid generic phrases like 'vibrant city'. Be specific about what makes these recommendations special.",
  "categories": [
    {
      "title": "☕ Category Title with Emoji",
      "placeNames": ["Place 1", "Place 2", "Place 3", "Place 4", "Place 5"]
    }
  ],
  "places": [
    {
      "name": "Place Name",
      "summary": "Brief description (30-50 chars max, must be complete)",
      "latitude": 35.6762,
      "longitude": 139.6503,
      "city": "City",
      "country": "Country",
      "coverImageUrl": "",
      "tags": ["tag1", "tag2"],
      "recommendationPhrase": "Unique phrase (e.g., 'Local favorite', 'Hidden gem', 'Must-visit', 'Iconic landmark', 'Highly acclaimed')"
    }
  ]
}

CRITICAL - Coordinates must be PRECISE:
- Use the EXACT latitude/longitude of the place entrance
- For "Park Güell" use 41.4145, 2.1527 (not approximate)
- For "La Rambla" use 41.3803, 2.1734 (center point)
- Double-check coordinates are accurate to 4 decimal places

CRITICAL - User requested count:
- If user asks for N places (e.g. "12家咖啡"), return EXACTLY N places
- Parse the number from user query carefully
- requestedCount should match user's request

CRITICAL - recommendationPhrase:
- Each place MUST have a UNIQUE recommendationPhrase
- Use varied phrases like: "Local favorite", "Hidden gem", "Must-visit", "Iconic landmark", "Highly acclaimed", "Traveler's choice", "Authentic experience", "Architectural marvel", "Cultural treasure", "Scenic spot"
- NEVER use generic "Recommended" for all places

Rules:
1. Parse user query to determine requested count. Default to 20 if not specified. Max 20.
2. Return EXACTLY the requested number of places (or 20 if exceeds limit)
3. MUST have exactly 3-4 categories (distribute places across them)
4. Each category should have roughly equal places
5. ALWAYS include categories with emoji prefix
6. coverImageUrl: always empty string (images fetched separately)
7. tags: 2 descriptive tags only
8. summary: MUST be 30-50 chars, complete sentence, no ellipsis
9. acknowledgment: Creative intro (2-3 sentences, max 60 words), avoid clichés
10. Set exceededLimit to true if user requested more than 20`;


/**
 * System prompt for summary generation
 * Requirements: 6.1, 6.2, 6.3, 6.4
 */
const SUMMARY_SYSTEM_PROMPT = `You are a travel writer creating engaging summaries.
Generate a brief summary for each place and an overall summary for the recommendation.

Output format (JSON):
{
  "placeSummaries": {
    "Place Name 1": "1-2 sentence summary",
    "Place Name 2": "1-2 sentence summary"
  },
  "overallSummary": "A friendly closing message summarizing the recommendations and wishing the user a great trip"
}

Rules:
1. Keep each place summary under 100 characters
2. The overall summary should be warm and encouraging
3. Use the same language as the original query
4. Include a friendly closing like "祝旅途愉快" or "Have a great trip!"`;


/**
 * AI Recommendation Service class
 * Uses Kouri Provider (GPT-4o-mini) as primary, with fallback to Azure/Gemini
 */
class AIRecommendationService {
  private providers: Map<AIProviderName, AIProvider> = new Map();
  private providerOrder: AIProviderName[];

  constructor() {
    this.providerOrder = this.parseProviderOrder();
    this.initializeProviders();
  }

  /**
   * Parse provider order from environment variable
   * Default: kouri first (GPT-4o-mini), then azure_openai, then gemini
   */
  private parseProviderOrder(): AIProviderName[] {
    const orderStr = process.env.AI_RECOMMENDATION_PROVIDER_ORDER || 'kouri,azure_openai,gemini';
    const order = orderStr.split(',').map(s => s.trim().toLowerCase());
    
    const validOrder: AIProviderName[] = [];
    for (const name of order) {
      if (name === 'kouri') {
        validOrder.push(AIProviderName.KOURI);
      } else if (name === 'azure_openai') {
        validOrder.push(AIProviderName.AZURE_OPENAI);
      } else if (name === 'gemini') {
        validOrder.push(AIProviderName.GEMINI);
      }
    }
    
    // Default order if none valid
    if (validOrder.length === 0) {
      return [AIProviderName.KOURI, AIProviderName.AZURE_OPENAI, AIProviderName.GEMINI];
    }
    
    return validOrder;
  }

  /**
   * Initialize all available providers
   */
  private initializeProviders(): void {
    console.log('[AIRecommendationService] Initializing providers...');
    console.log(`[AIRecommendationService] Provider order: ${this.providerOrder.join(', ')}`);

    // Initialize Kouri Provider (primary for GPT-4o-mini)
    const kouriProvider = new KouriProvider();
    if (kouriProvider.isAvailable()) {
      this.providers.set(AIProviderName.KOURI, kouriProvider);
      console.log('[AIRecommendationService] Kouri provider registered');
    }

    // Initialize Azure OpenAI Provider (fallback)
    const azureProvider = new AzureOpenAIProvider();
    if (azureProvider.isAvailable()) {
      this.providers.set(AIProviderName.AZURE_OPENAI, azureProvider);
      console.log('[AIRecommendationService] Azure OpenAI provider registered');
    }

    // Initialize Gemini Provider (fallback)
    const geminiProvider = new GeminiProvider();
    if (geminiProvider.isAvailable()) {
      this.providers.set(AIProviderName.GEMINI, geminiProvider);
      console.log('[AIRecommendationService] Gemini provider registered');
    }

    const availableProviders = Array.from(this.providers.keys());
    if (availableProviders.length === 0) {
      console.warn('[AIRecommendationService] Warning: No AI providers available!');
    } else {
      console.log(`[AIRecommendationService] Available providers: ${availableProviders.join(', ')}`);
    }
  }

  /**
   * Get ordered list of available providers
   */
  private getOrderedProviders(): AIProvider[] {
    const ordered: AIProvider[] = [];
    
    for (const name of this.providerOrder) {
      const provider = this.providers.get(name);
      if (provider && provider.isAvailable()) {
        ordered.push(provider);
      }
    }
    
    return ordered;
  }

  /**
   * Execute operation with fallback across providers
   */
  private async executeWithFallback<T>(
    operation: (provider: AIProvider) => Promise<T>,
    operationName: string
  ): Promise<T> {
    const providers = this.getOrderedProviders();
    
    if (providers.length === 0) {
      throw {
        code: AIErrorCode.CONFIG_ERROR,
        message: 'No AI providers available for recommendations',
        provider: 'none',
        retryable: false,
      } as AIServiceError;
    }

    const errors: AIServiceError[] = [];

    for (const provider of providers) {
      try {
        console.log(`[AIRecommendationService] Attempting ${operationName} with provider: ${provider.name}`);
        const result = await operation(provider);
        console.log(`[AIRecommendationService] ${operationName} succeeded with provider: ${provider.name}`);
        return result;
      } catch (error) {
        const aiError = this.normalizeError(error, provider.name);
        errors.push(aiError);
        console.warn(`[AIRecommendationService] Provider ${provider.name} failed:`, aiError.message);
      }
    }

    const errorMessages = errors.map(e => `${e.provider}: ${e.message}`).join('; ');
    throw {
      code: AIErrorCode.INTERNAL_ERROR,
      message: `All AI providers failed: ${errorMessages}`,
      provider: 'all',
      retryable: false,
      details: errors,
    } as AIServiceError;
  }

  /**
   * Normalize error to AIServiceError format
   */
  private normalizeError(error: unknown, providerName: string | AIProviderName): AIServiceError {
    if (this.isAIServiceError(error)) {
      return error;
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      code: AIErrorCode.UNKNOWN,
      message,
      provider: providerName.toString(),
      retryable: false,
      details: error,
    };
  }

  /**
   * Type guard for AIServiceError
   */
  private isAIServiceError(error: unknown): error is AIServiceError {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      'message' in error &&
      'provider' in error &&
      'retryable' in error
    );
  }

  /**
   * Parse JSON from AI response with enhanced error recovery
   */
  private parseJsonResponse<T>(content: string): T {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new AIResponseValidationError('No JSON found in AI response');
    }

    let jsonStr = jsonMatch[0];

    try {
      return JSON.parse(jsonStr) as T;
    } catch (parseError) {
      // Try to fix common JSON issues from AI responses
      console.warn('[AIRecommendationService] Initial JSON parse failed, attempting recovery...');
      
      // 1. Try to fix truncated arrays - find last complete object and close the array
      const placesMatch = jsonStr.match(/"places"\s*:\s*\[/);
      if (placesMatch) {
        // Find all complete place objects (ending with })
        const objectMatches = jsonStr.match(/\{[^{}]*"name"[^{}]*\}/g);
        if (objectMatches && objectMatches.length > 0) {
          // Rebuild JSON with only complete objects
          const fixedPlaces = objectMatches.join(',');
          jsonStr = `{"places":[${fixedPlaces}]}`;
          console.log(`[AIRecommendationService] Recovered ${objectMatches.length} complete place objects`);
          
          try {
            return JSON.parse(jsonStr) as T;
          } catch (e) {
            // Continue to other recovery methods
          }
        }
      }

      // 2. Try removing trailing incomplete content
      const lastCompleteIndex = Math.max(
        jsonStr.lastIndexOf('}]'),
        jsonStr.lastIndexOf('"}')
      );
      if (lastCompleteIndex > 0) {
        const trimmed = jsonStr.substring(0, lastCompleteIndex + 2);
        // Try to close any unclosed structures
        const openBraces = (trimmed.match(/\{/g) || []).length;
        const closeBraces = (trimmed.match(/\}/g) || []).length;
        const openBrackets = (trimmed.match(/\[/g) || []).length;
        const closeBrackets = (trimmed.match(/\]/g) || []).length;
        
        let fixed = trimmed;
        for (let i = 0; i < openBrackets - closeBrackets; i++) fixed += ']';
        for (let i = 0; i < openBraces - closeBraces; i++) fixed += '}';
        
        try {
          return JSON.parse(fixed) as T;
        } catch (e) {
          // Continue to throw original error
        }
      }

      throw new AIResponseValidationError(`Failed to parse JSON: ${parseError}`);
    }
  }

  /**
   * Validate a single AIPlace object
   * Requirements: 3.5
   */
  private validatePlace(place: any, index: number): AIPlace {
    const requiredFields = ['name', 'summary', 'latitude', 'longitude', 'city', 'country', 'coverImageUrl', 'tags', 'recommendationPhrase'];
    
    for (const field of requiredFields) {
      if (place[field] === undefined || place[field] === null) {
        throw new AIResponseValidationError(`Place ${index + 1} missing required field: ${field}`);
      }
    }

    // Validate types
    if (typeof place.name !== 'string' || place.name.trim() === '') {
      throw new AIResponseValidationError(`Place ${index + 1}: name must be a non-empty string`);
    }

    if (typeof place.summary !== 'string') {
      throw new AIResponseValidationError(`Place ${index + 1}: summary must be a string`);
    }

    // Validate summary length (max 50 chars) - Requirement 3.6
    if (place.summary.length > 50) {
      console.warn(`[AIRecommendationService] Place ${index + 1} summary exceeds 50 chars (${place.summary.length}), truncating`);
      // 截断到最后一个完整的句子或词
      let truncated = place.summary.substring(0, 50);
      const lastPeriod = truncated.lastIndexOf('。');
      const lastDot = truncated.lastIndexOf('.');
      const lastComma = truncated.lastIndexOf('，');
      const lastSpace = truncated.lastIndexOf(' ');
      const cutPoint = Math.max(lastPeriod, lastDot, lastComma, lastSpace);
      if (cutPoint > 25) {
        truncated = truncated.substring(0, cutPoint + 1);
      }
      place.summary = truncated.trim();
    }

    if (typeof place.latitude !== 'number' || typeof place.longitude !== 'number') {
      throw new AIResponseValidationError(`Place ${index + 1}: latitude and longitude must be numbers`);
    }

    if (!Array.isArray(place.tags)) {
      throw new AIResponseValidationError(`Place ${index + 1}: tags must be an array`);
    }

    return {
      name: place.name.trim(),
      summary: place.summary,
      latitude: place.latitude,
      longitude: place.longitude,
      city: String(place.city || '').trim(),
      country: String(place.country || '').trim(),
      coverImageUrl: String(place.coverImageUrl || '').trim(),
      tags: place.tags.map((t: any) => String(t).trim()).filter((t: string) => t.length > 0),
      recommendationPhrase: String(place.recommendationPhrase || '').trim(),
    };
  }

  /**
   * Validate AI recommendation response
   * Requirements: 3.3, 3.4, 3.5
   */
  private validateRecommendationResponse(response: any): AIRecommendationResult {
    // Validate acknowledgment
    if (!response.acknowledgment || typeof response.acknowledgment !== 'string') {
      throw new AIResponseValidationError('Missing or invalid acknowledgment');
    }

    // Validate places array
    if (!Array.isArray(response.places)) {
      throw new AIResponseValidationError('places must be an array');
    }

    // 期望最多 20 个地点
    if (response.places.length > 20) {
      console.warn(`[AIRecommendationService] AI returned ${response.places.length} places, truncating to 20`);
      response.places = response.places.slice(0, 20);
    }
    if (response.places.length === 0) {
      throw new AIResponseValidationError('No places returned by AI');
    }

    // 解析 requestedCount（AI 返回的数量），默认 20，最大 20
    let requestedCount = typeof response.requestedCount === 'number' 
      ? Math.max(1, Math.min(20, response.requestedCount))
      : 20; // 默认 20 个地点
    
    // 解析 exceededLimit
    const exceededLimit = response.exceededLimit === true;
    
    console.log(`[AIRecommendationService] requestedCount: ${requestedCount}, exceededLimit: ${exceededLimit}, AI returned ${response.places.length}`);

    // Validate each place
    const validatedPlaces: AIPlace[] = [];
    for (let i = 0; i < response.places.length; i++) {
      validatedPlaces.push(this.validatePlace(response.places[i], i));
    }

    // Validate categories if present
    let validatedCategories: AICategory[] | undefined;
    if (response.categories && Array.isArray(response.categories) && response.categories.length > 0) {
      validatedCategories = [];
      for (const cat of response.categories) {
        if (!cat.title || typeof cat.title !== 'string') {
          throw new AIResponseValidationError('Category missing title');
        }
        if (!Array.isArray(cat.placeNames)) {
          throw new AIResponseValidationError(`Category "${cat.title}" missing placeNames array`);
        }
        validatedCategories.push({
          title: cat.title.trim(),
          placeNames: cat.placeNames.map((n: any) => String(n).trim()),
        });
      }
      
      // Warn if categories don't meet requirements
      if (validatedCategories.length < 3) {
        console.warn(`[AIRecommendationService] Expected at least 3 categories, got ${validatedCategories.length}`);
      }
      for (const cat of validatedCategories) {
        if (cat.placeNames.length < 3) {
          console.warn(`[AIRecommendationService] Category "${cat.title}" has only ${cat.placeNames.length} places (expected at least 3)`);
        }
      }
    }

    // 分类策略：
    // - 默认使用分类（至少 3 个分类，每个至少 3 个地点）
    // - requestedCount <= 3: 不分类
    const shouldUseCategories = requestedCount >= 4 && validatedCategories && validatedCategories.length >= 3;

    return {
      acknowledgment: response.acknowledgment.trim(),
      categories: shouldUseCategories ? validatedCategories : undefined,
      places: validatedPlaces,
      requestedCount,
      exceededLimit,
    };
  }

  /**
   * Get AI recommendations for a search query
   * Requirements: 1.1, 3.1, 3.3, 3.4, 3.5
   * 
   * @param query User's search query
   * @param language User's preferred language (e.g., 'en', 'zh', 'ja')
   * @returns AI recommendation result with places and optional categories
   */
  async getRecommendations(query: string, language: string = 'en'): Promise<AIRecommendationResult> {
    // Map language code to full name for AI
    const languageMap: Record<string, string> = {
      'en': 'English',
      'zh': 'Chinese (Simplified)',
      'zh-CN': 'Chinese (Simplified)',
      'zh-TW': 'Chinese (Traditional)',
      'ja': 'Japanese',
      'ko': 'Korean',
      'es': 'Spanish',
      'fr': 'French',
      'de': 'German',
      'it': 'Italian',
      'pt': 'Portuguese',
    };
    const languageName = languageMap[language] || 'English';
    
    const userPrompt = `User query: ${query}

IMPORTANT: Respond in ${languageName}. All text including acknowledgment, category titles, summaries, tags, and recommendationPhrase must be in ${languageName}.

CRITICAL RULES FOR NUMBER OF PLACES:
- Parse the user's query to determine how many places they want
- If user specifies a number (e.g., "12 restaurants", "5家咖啡店"), return EXACTLY that number (max 20)
- If user does NOT specify a number, return exactly 20 places
- If user requests more than 20, return exactly 20 places and set exceededLimit to true
- Set requestedCount in your response to the number you are returning

Each summary MUST be 40-60 characters, complete sentence, no "..." at end.`;

    const response = await this.executeWithFallback(
      async (provider) => {
        const content = await provider.generateText(userPrompt, RECOMMENDATION_SYSTEM_PROMPT);
        const parsed = this.parseJsonResponse<any>(content);
        return this.validateRecommendationResponse(parsed);
      },
      'getRecommendations'
    );

    // 打印 AI 返回的地点名称
    console.log(`[AIRecommendationService] AI places: ${response.places.map(p => p.name).join(', ')}`);

    return response;
  }

  /**
   * Generate summaries for places
   * Requirements: 6.1, 6.2, 6.3, 6.4
   * 
   * @param places Array of places to generate summaries for
   * @param originalQuery Original user query for context
   * @returns Summary result with per-place summaries and overall summary
   */
  async generateSummaries(places: PlaceBasicInfo[], originalQuery: string): Promise<SummaryResult> {
    const placesList = places
      .map(p => `- ${p.name}${p.city ? ` (${p.city}${p.country ? ', ' + p.country : ''})` : ''}`)
      .join('\n');

    const userPrompt = `Original query: ${originalQuery}

Places to summarize:
${placesList}

Generate summaries for these places.`;

    const response = await this.executeWithFallback(
      async (provider) => {
        const content = await provider.generateText(userPrompt, SUMMARY_SYSTEM_PROMPT);
        const parsed = this.parseJsonResponse<any>(content);
        return this.validateSummaryResponse(parsed);
      },
      'generateSummaries'
    );

    return response;
  }

  /**
   * Validate summary response
   */
  private validateSummaryResponse(response: any): SummaryResult {
    if (!response.placeSummaries || typeof response.placeSummaries !== 'object') {
      throw new AIResponseValidationError('Missing or invalid placeSummaries');
    }

    if (!response.overallSummary || typeof response.overallSummary !== 'string') {
      throw new AIResponseValidationError('Missing or invalid overallSummary');
    }

    // Convert placeSummaries object to Map
    const placeSummaries = new Map<string, string>();
    for (const [name, summary] of Object.entries(response.placeSummaries)) {
      if (typeof summary === 'string') {
        // Truncate if over 100 chars
        const truncatedSummary = summary.length > 100 ? summary.substring(0, 100) : summary;
        placeSummaries.set(name, truncatedSummary);
      }
    }

    return {
      placeSummaries,
      overallSummary: response.overallSummary.trim(),
    };
  }

  /**
   * Get list of available provider names
   */
  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}

// Export singleton instance
export const aiRecommendationService = new AIRecommendationService();
export default aiRecommendationService;
