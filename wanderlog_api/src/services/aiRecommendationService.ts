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
const RECOMMENDATION_SYSTEM_PROMPT = `You are a travel expert helping users discover places.
Your task is to understand the user's intent and recommend places.

CRITICAL - Determine the user's requested count (MUST extract number from query):
- ALWAYS look for numbers in the query: "2 cafes" → requestedCount = 2, "5 museums" → requestedCount = 5
- Numbers can appear anywhere: "give me 3 restaurants" → 3, "推荐10个咖啡馆" → 10
- If user says "a few" or "几个", requestedCount = 3
- If user says "some" or "一些", requestedCount = 5
- If NO number is specified at all, requestedCount = 5 (default)
- Maximum requestedCount is 20 (if user asks for more, set to 20 and note exceededLimit = true)

ALWAYS return exactly 20 places internally for better matching.

Output format (JSON):
{
  "requestedCount": 5,
  "exceededLimit": false,
  "acknowledgment": "A direct, helpful message that explains your recommendation approach WITHOUT starting with a question. Start with 'I've curated...' or 'Here are...' or similar direct statements.",
  "categories": [
    {
      "title": "Category name based on place characteristics (e.g., Cozy Hideaways, Waterfront Views, Historic Gems, Local Favorites)",
      "placeNames": ["Place 1", "Place 2", "Place 3", "Place 4", "Place 5"]
    }
  ],
  "places": [
    {
      "name": "Exact place name",
      "summary": "1-2 sentence description (max 100 chars)",
      "latitude": 0.0,
      "longitude": 0.0,
      "city": "City name",
      "country": "Country name",
      "coverImageUrl": "A publicly accessible image URL for this place",
      "tags": ["tag1", "tag2", "tag3"],
      "recommendationPhrase": "e.g., highly rated, local favorite, hidden gem"
    }
  ]
}

IMPORTANT Rules:
1. ALWAYS return exactly 20 places (for internal matching purposes)
2. Set requestedCount to the number user actually asked for (max 20)
3. Set exceededLimit = true if user asked for more than 20
4. Category rules:
   - If requestedCount >= 5: create categories (e.g., 5 places = 2 categories of 2+3)
   - If requestedCount <= 4: skip categories (not enough for 2 categories with min 2 each)
   - Each category should have 2-5 places
   - When requestedCount is large (10-20), prefer fewer categories with more places each
5. The acknowledgment MUST:
   - NEVER start with a question like "Looking for...?" or "想找...？"
   - Start directly with what you're recommending: "I've curated...", "Here are...", "为你精选了...", "这里有..."
   - Briefly explain your recommendation criteria or approach
   - Be conversational and helpful
6. Use the same language as the user's query for acknowledgment and category titles
7. Provide real, existing places with accurate coordinates
8. coverImageUrl should be a real, publicly accessible image URL (Wikipedia, official sites, etc.)
9. tags should describe the place's style/vibe (2-3 tags)
10. recommendationPhrase should be a short, catchy phrase
11. summary must NOT exceed 100 characters

BAD acknowledgment examples (starting with questions - DO NOT USE):
- "Looking for cafes in Copenhagen? I've curated..."
- "想找哥本哈根的咖啡馆？我按氛围帮你分类了..."
- "Searching for cozy spots? Here are..."

GOOD acknowledgment examples (direct statements - USE THESE):
- "I've curated a mix of cozy neighborhood gems, stylish spots, and places with great coffee. Here's what I recommend based on atmosphere and local popularity:"
- "为你精选了一系列咖啡馆，按氛围分类：有适合工作的安静角落，也有适合约会的浪漫小店。"
- "Here are some fantastic cafes ranging from hidden local favorites to trendy waterfront spots, selected for their unique atmosphere and quality."`;


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
   * Parse JSON from AI response
   */
  private parseJsonResponse<T>(content: string): T {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new AIResponseValidationError('No JSON found in AI response');
    }

    try {
      return JSON.parse(jsonMatch[0]) as T;
    } catch (parseError) {
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

    // Validate summary length (max 100 chars) - Requirement 3.6
    if (place.summary.length > 100) {
      console.warn(`[AIRecommendationService] Place ${index + 1} summary exceeds 100 chars, truncating`);
      place.summary = place.summary.substring(0, 100);
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

    // 期望 20 个地点，但允许少于 20 个
    if (response.places.length < 20) {
      console.warn(`[AIRecommendationService] Expected 20 places, got ${response.places.length}`);
    }
    if (response.places.length === 0) {
      throw new AIResponseValidationError('No places returned by AI');
    }

    // 解析 requestedCount（用户请求的数量），默认 5，最大 20
    let requestedCount = typeof response.requestedCount === 'number' 
      ? Math.max(1, Math.min(20, response.requestedCount))
      : 5;
    
    // 解析 exceededLimit
    const exceededLimit = response.exceededLimit === true;
    
    console.log(`[AIRecommendationService] User requested ${requestedCount} places, exceededLimit: ${exceededLimit}, AI returned ${response.places.length}`);

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
    }

    // 分类策略：
    // - requestedCount >= 5: 分类（5个可以分成2+3）
    // - requestedCount <= 4: 不分类（不够分成2个分类，每个最少2个）
    const shouldUseCategories = requestedCount >= 5 && validatedCategories && validatedCategories.length > 0;

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
   * @returns AI recommendation result with places and optional categories
   */
  async getRecommendations(query: string): Promise<AIRecommendationResult> {
    const userPrompt = `User query: ${query}\n\nProvide 10 place recommendations.`;

    const response = await this.executeWithFallback(
      async (provider) => {
        const content = await provider.generateText(userPrompt, RECOMMENDATION_SYSTEM_PROMPT);
        const parsed = this.parseJsonResponse<any>(content);
        return this.validateRecommendationResponse(parsed);
      },
      'getRecommendations'
    );

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
