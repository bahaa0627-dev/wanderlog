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
import { OpenRouterProvider } from './aiProviders/OpenRouterProvider';
import { AIProvider, AIProviderName, AIServiceError, AIErrorCode } from './aiProviders/types';
import { canMakeAICall, incrementAICallCount } from './aiCallCounter';

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
  website?: string;
  rating?: number;
  ratingCount?: number;
  address?: string;
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
 * OPTIMIZED V2: Ultra-compact prompt to reduce token usage by 90%
 */
const RECOMMENDATION_SYSTEM_PROMPT = `Travel expert. JSON only.
RULES: Location-specific places only. Tags=English. Coords=4 decimals. Return 5-8 places. USE WEB SEARCH to find accurate rating, ratingCount, website, and address.
FORMAT:{"requestedCount":8,"exceededLimit":false,"acknowledgment":"1-2 sentences","categories":[{"title":"☕ Title","placeNames":["P1","P2"]}],"places":[{"name":"Name","summary":"50-100 chars describing features and atmosphere","latitude":0.0,"longitude":0.0,"city":"","country":"","coverImageUrl":"","tags":[],"recommendationPhrase":"Hidden gem","website":"example.com","rating":4.5,"ratingCount":1234,"address":"Full address"}]}`;


/**
 * System prompt for summary generation - OPTIMIZED V2
 */
const SUMMARY_SYSTEM_PROMPT = `Generate place summaries. JSON format:
{"placeSummaries":{"Name":"50-100 chars describing unique features and atmosphere"},"overallSummary":"Friendly closing"}`;


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
      } else if (name === 'openrouter') {
        validOrder.push(AIProviderName.OPENROUTER);
      }
    }
    
    // Default order if none valid
    if (validOrder.length === 0) {
      return [AIProviderName.OPENROUTER, AIProviderName.KOURI, AIProviderName.GEMINI];
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

    // Initialize OpenRouter Provider
    const openRouterProvider = new OpenRouterProvider();
    if (openRouterProvider.isAvailable()) {
      this.providers.set(AIProviderName.OPENROUTER, openRouterProvider);
      console.log('[AIRecommendationService] OpenRouter provider registered');
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
    // Check global AI call limit FIRST
    if (!canMakeAICall()) {
      throw {
        code: AIErrorCode.INTERNAL_ERROR,
        message: `AI call limit exceeded for ${operationName}`,
        provider: 'none',
        retryable: false,
      } as AIServiceError;
    }
    
    // Increment counter BEFORE making the call
    incrementAICallCount(operationName);
    
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

    // Validate summary length (max 150 chars) - 允许更详细的摘要
    if (place.summary.length > 150) {
      console.warn(`[AIRecommendationService] Place ${index + 1} summary exceeds 150 chars (${place.summary.length}), truncating`);
      // 截断到最后一个完整的句子或词
      let truncated = place.summary.substring(0, 150);
      const lastPeriod = truncated.lastIndexOf('。');
      const lastDot = truncated.lastIndexOf('.');
      const lastComma = truncated.lastIndexOf('，');
      const lastSpace = truncated.lastIndexOf(' ');
      const cutPoint = Math.max(lastPeriod, lastDot, lastComma, lastSpace);
      if (cutPoint > 60) {
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

    // 期望最多 10 个地点（5-10范围）
    if (response.places.length > 10) {
      console.warn(`[AIRecommendationService] AI returned ${response.places.length} places, truncating to 10`);
      response.places = response.places.slice(0, 10);
    }
    if (response.places.length === 0) {
      throw new AIResponseValidationError('No places returned by AI');
    }

    // 解析 requestedCount（AI 返回的数量），默认 8，最大 10
    let requestedCount = typeof response.requestedCount === 'number' 
      ? Math.max(1, Math.min(10, response.requestedCount))
      : 8; // 默认 8 个地点
    
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
    
    const userPrompt = `Query: ${query}
Lang: ${languageName}. Tags=English. Return 5-8 places in JSON.`;

    const response = await this.executeWithFallback(
      async (provider) => {
        const content = await provider.generateText(userPrompt, RECOMMENDATION_SYSTEM_PROMPT);
        const parsed = this.parseJsonResponse<any>(content);
        return this.validateRecommendationResponse(parsed);
      },
      'getRecommendations'
    );

    if (!response || !Array.isArray(response.places)) {
      throw new AIResponseValidationError('AI response missing places array');
    }

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
