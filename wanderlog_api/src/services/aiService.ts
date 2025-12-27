/**
 * AI Service - Multi-Provider Support
 * 
 * Refactored to support multiple AI providers with fallback mechanism.
 * Supports Azure OpenAI (primary) and Gemini (fallback).
 */

import axios from 'axios';
import googleMapsService from './googleMapsService';
import publicPlaceService from './publicPlaceService';
import { 
  AIProvider, 
  AIProviderName, 
  PlaceIdentificationResult,
  AIServiceError,
  AIErrorCode,
} from './aiProviders/types';
import { AzureOpenAIProvider } from './aiProviders/AzureOpenAIProvider';
import { GeminiProvider } from './aiProviders/GeminiProvider';
import { KouriProvider } from './aiProviders/KouriProvider';

/**
 * Retry configuration
 */
interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 8000,
};

/**
 * Parse provider order from environment variable
 */
function parseProviderOrder(): AIProviderName[] {
  const orderStr = process.env.AI_PROVIDER_ORDER || 'azure_openai,gemini';
  const order = orderStr.split(',').map(s => s.trim().toLowerCase());
  
  const validOrder: AIProviderName[] = [];
  for (const name of order) {
    if (name === 'azure_openai') {
      validOrder.push(AIProviderName.AZURE_OPENAI);
    } else if (name === 'gemini') {
      validOrder.push(AIProviderName.GEMINI);
    } else if (name === 'kouri') {
      validOrder.push(AIProviderName.KOURI);
    }
  }
  
  // Default order if none valid
  if (validOrder.length === 0) {
    return [AIProviderName.AZURE_OPENAI, AIProviderName.GEMINI];
  }
  
  return validOrder;
}

class AIService {
  private providers: Map<AIProviderName, AIProvider> = new Map();
  private providerOrder: AIProviderName[];
  private retryConfig: RetryConfig;

  constructor() {
    this.providerOrder = parseProviderOrder();
    this.retryConfig = DEFAULT_RETRY_CONFIG;
    this.initializeProviders();
  }

  /**
   * Initialize all available providers based on configuration
   */
  private initializeProviders(): void {
    console.log('[AIService] Initializing providers...');
    console.log(`[AIService] Provider order: ${this.providerOrder.join(', ')}`);

    // Initialize Azure OpenAI Provider
    const azureProvider = new AzureOpenAIProvider();
    if (azureProvider.isAvailable()) {
      this.providers.set(AIProviderName.AZURE_OPENAI, azureProvider);
      console.log('[AIService] Azure OpenAI provider registered');
    }

    // Initialize Gemini Provider
    const geminiProvider = new GeminiProvider();
    if (geminiProvider.isAvailable()) {
      this.providers.set(AIProviderName.GEMINI, geminiProvider);
      console.log('[AIService] Gemini provider registered');
    }

    // Initialize Kouri Provider
    const kouriProvider = new KouriProvider();
    if (kouriProvider.isAvailable()) {
      this.providers.set(AIProviderName.KOURI, kouriProvider);
      console.log('[AIService] Kouri provider registered');
    }

    // Log available providers
    const availableProviders = Array.from(this.providers.keys());
    if (availableProviders.length === 0) {
      console.warn('[AIService] Warning: No AI providers available!');
    } else {
      console.log(`[AIService] Available providers: ${availableProviders.join(', ')}`);
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
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Calculate delay for exponential backoff
   */
  private calculateBackoffDelay(attempt: number): number {
    const delay = this.retryConfig.baseDelayMs * Math.pow(2, attempt);
    return Math.min(delay, this.retryConfig.maxDelayMs);
  }

  /**
   * Execute operation with retry logic for a single provider
   */
  private async executeWithRetry<T>(
    provider: AIProvider,
    operation: (provider: AIProvider) => Promise<T>
  ): Promise<T> {
    let lastError: AIServiceError | null = null;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await operation(provider);
      } catch (error) {
        const aiError = this.normalizeError(error, provider.name);
        lastError = aiError;

        // Log the error
        console.error(
          `[AIService] Provider ${provider.name} attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1} failed:`,
          aiError.message
        );

        // Check if error is retryable
        if (!aiError.retryable || attempt >= this.retryConfig.maxRetries) {
          break;
        }

        // Calculate and apply backoff delay
        const delay = this.calculateBackoffDelay(attempt);
        console.log(`[AIService] Retrying in ${delay}ms...`);
        await this.sleep(delay);
      }
    }

    throw lastError || new Error('Unknown error during retry');
  }

  /**
   * Execute operation with fallback across multiple providers
   * Tries each provider in order, with retry logic for each
   */
  async executeWithFallback<T>(
    operation: (provider: AIProvider) => Promise<T>,
    operationName: string = 'operation'
  ): Promise<T> {
    const providers = this.getOrderedProviders();
    
    if (providers.length === 0) {
      throw {
        code: AIErrorCode.CONFIG_ERROR,
        message: 'No AI providers available. Please configure at least one provider.',
        provider: 'none',
        retryable: false,
      } as AIServiceError;
    }

    const errors: AIServiceError[] = [];

    for (const provider of providers) {
      try {
        console.log(`[AIService] Attempting ${operationName} with provider: ${provider.name}`);
        const result = await this.executeWithRetry(provider, operation);
        console.log(`[AIService] ${operationName} succeeded with provider: ${provider.name}`);
        return result;
      } catch (error) {
        const aiError = this.normalizeError(error, provider.name);
        errors.push(aiError);
        
        console.warn(
          `[AIService] Provider ${provider.name} failed for ${operationName}:`,
          aiError.message
        );

        // Continue to next provider
      }
    }

    // All providers failed
    const errorMessages = errors.map(e => `${e.provider}: ${e.message}`).join('; ');
    console.error(`[AIService] All providers failed for ${operationName}: ${errorMessages}`);
    
    throw {
      code: AIErrorCode.INTERNAL_ERROR,
      message: `All AI providers failed: ${errorMessages}`,
      provider: 'all',
      retryable: false,
      details: errors,
    } as AIServiceError;
  }

  /**
   * Normalize any error to AIServiceError format
   */
  private normalizeError(error: unknown, providerName: string | AIProviderName): AIServiceError {
    // Already an AIServiceError
    if (this.isAIServiceError(error)) {
      return error;
    }

    // Axios error
    if (axios.isAxiosError(error)) {
      const status = error.response?.status || 500;
      const message = error.response?.data?.error?.message || error.message || 'Unknown error';
      
      let code: AIErrorCode;
      let retryable = false;
      
      switch (status) {
        case 429:
          code = AIErrorCode.RATE_LIMITED;
          retryable = true;
          break;
        case 503:
          code = AIErrorCode.SERVICE_UNAVAILABLE;
          retryable = true;
          break;
        case 500:
          code = AIErrorCode.INTERNAL_ERROR;
          retryable = true;
          break;
        case 401:
          code = AIErrorCode.UNAUTHORIZED;
          break;
        case 403:
          code = AIErrorCode.FORBIDDEN;
          break;
        case 404:
          code = AIErrorCode.NOT_FOUND;
          break;
        case 400:
          code = AIErrorCode.BAD_REQUEST;
          break;
        default:
          code = AIErrorCode.UNKNOWN;
      }

      return {
        code,
        message,
        provider: providerName.toString(),
        retryable,
        details: error.response?.data,
      };
    }

    // Generic error
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
   * 从图片识别地点
   * @param imageUrl 图片URL或base64编码
   * @returns 识别出的地点信息
   */
  async identifyPlaceFromImage(imageUrl: string): Promise<PlaceIdentificationResult> {
    return this.executeWithFallback(
      (provider) => provider.identifyPlace(imageUrl),
      'identifyPlaceFromImage'
    );
  }

  /**
   * 从图片识别地点并添加到公共地点库
   */
  async importFromImage(imageUrl: string): Promise<any> {
    try {
      // 步骤1：AI 识别图片中的地点
      console.log('Identifying place from image...');
      const identification = await this.identifyPlaceFromImage(imageUrl);

      if (identification.confidence < 0.5) {
        throw new Error('Place identification confidence too low');
      }

      // 步骤2：通过地点名称搜索 Google Maps 获取 place_id
      console.log(`Searching Google Maps for: ${identification.placeName}`);
      const placeId = await googleMapsService.textSearch(identification.placeName);

      if (!placeId || placeId.length === 0) {
        throw new Error('Place not found in Google Maps');
      }

      // 使用第一个搜索结果
      const firstPlace = placeId[0];
      const googlePlaceId = firstPlace.place_id;

      if (!googlePlaceId) {
        throw new Error('No place_id found');
      }

      // 步骤3：添加到公共地点库
      console.log(`Adding place to library with place_id: ${googlePlaceId}`);
      const place = await publicPlaceService.addByPlaceId(
        googlePlaceId,
        'ai_image',
        {
          imageUrl,
          aiModel: 'multi-provider',
          identification,
          timestamp: new Date(),
        }
      );

      // 步骤4：使用 AI 生成的标签更新地点
      if (identification.suggestedTags && identification.suggestedTags.length > 0) {
        await publicPlaceService.updatePlace(googlePlaceId, {
          aiTags: identification.suggestedTags,
          aiDescription: identification.description,
        } as any);
      }

      return place;
    } catch (error: any) {
      console.error('Error importing from image:', error);
      throw error;
    }
  }

  /**
   * 通过对话获取地点推荐
   * @param userMessage 用户的消息/需求
   * @param context 对话上下文（可选）
   */
  async getPlaceRecommendations(
    userMessage: string,
    context?: { city?: string; country?: string; preferences?: string[] }
  ): Promise<string[]> {
    const systemPrompt = `You are a travel advisor helping users discover places. 
Based on the user's message, suggest specific place names that match their interests.
Return ONLY a JSON array of place names, like: ["Place Name 1", "Place Name 2", "Place Name 3"]
Maximum 5 suggestions. Be specific with actual place names, not generic categories.`;

    let userPrompt = userMessage;
    if (context?.city) {
      userPrompt += ` (in ${context.city}${context.country ? ', ' + context.country : ''})`;
    }

    const response = await this.executeWithFallback(
      (provider) => provider.generateText(userPrompt, systemPrompt),
      'getPlaceRecommendations'
    );

    // 解析 JSON 数组
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Failed to parse AI recommendations');
    }

    const placeNames = JSON.parse(jsonMatch[0]);
    return placeNames;
  }

  /**
   * 通过对话导入地点到公共地点库
   */
  async importFromChat(
    userMessage: string,
    context?: { city?: string; country?: string }
  ): Promise<{ success: number; failed: number; places: any[] }> {
    try {
      // 步骤1：获取 AI 推荐的地点名称
      console.log('Getting AI recommendations...');
      const placeNames = await this.getPlaceRecommendations(userMessage, context);

      const results: any[] = [];
      let success = 0;
      let failed = 0;

      // 步骤2：逐个搜索并添加
      for (const placeName of placeNames) {
        try {
          console.log(`Processing: ${placeName}`);
          
          // 搜索 Google Maps
          const searchResults = await googleMapsService.textSearch(
            placeName,
            context?.city ? { lat: 0, lng: 0 } : undefined
          );

          if (!searchResults || searchResults.length === 0) {
            console.warn(`Place not found: ${placeName}`);
            failed++;
            continue;
          }

          const googlePlaceId = searchResults[0].place_id;
          
          if (!googlePlaceId) {
            failed++;
            continue;
          }

          // 添加到公共地点库
          const place = await publicPlaceService.addByPlaceId(
            googlePlaceId,
            'ai_chat',
            {
              userMessage,
              aiRecommendation: placeName,
              context,
              timestamp: new Date(),
            }
          );

          results.push(place);
          success++;
        } catch (error) {
          console.error(`Error processing ${placeName}:`, error);
          failed++;
        }
      }

      return { success, failed, places: results };
    } catch (error: any) {
      console.error('Error importing from chat:', error);
      throw error;
    }
  }

  /**
   * 为地点生成 AI 标签和描述
   */
  async generatePlaceTags(placeData: {
    name: string;
    category?: string;
    description?: string;
    city?: string;
    country?: string;
  }): Promise<{ tags: string[]; summary: string; description: string }> {
    const systemPrompt = 'You are a travel content writer specializing in creating engaging place descriptions.';
    
    const prompt = `Given this place information:
Name: ${placeData.name}
Category: ${placeData.category || 'Unknown'}
Location: ${placeData.city || ''}, ${placeData.country || ''}
Description: ${placeData.description || 'None'}

Generate:
1. 5-8 style tags (like "romantic", "instagram-worthy", "family-friendly", "cozy", "historical", etc.)
2. A one-sentence summary
3. A brief 2-3 sentence description highlighting what makes this place special

Return ONLY a JSON object: { "tags": [], "summary": "", "description": "" }`;

    const response = await this.executeWithFallback(
      (provider) => provider.generateText(prompt, systemPrompt),
      'generatePlaceTags'
    );

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse AI response');
    }

    return JSON.parse(jsonMatch[0]);
  }

  /**
   * 使用 AI 生成城市的推荐地点
   * 当数据库中没有匹配的地点时调用
   * 为了省钱，只生成 1 个地点
   */
  async generatePlacesForCity(options: {
    city: string;
    country: string;
    tags: string[];
    maxPerCategory?: number;
  }): Promise<any[]> {
    const { city, country, tags } = options;
    
    // 为了省钱，只让 AI 生成 1 个地点
    const maxPlaces = 1;

    const prompt = `You are a travel expert. Recommend exactly 1 real, specific place in ${city}, ${country} that matches these interests: ${tags.join(', ')}.

Return ONLY a JSON array with exactly 1 place:
[
  {
    "name": "Exact place name",
    "category": "Category name",
    "tags": ["tag1", "tag2"],
    "description": "Brief description"
  }
]

Important:
- Only include a REAL place that actually exists
- Use exact, searchable name
- Return exactly 1 place`;

    const systemPrompt = 'You are a travel expert. Return only valid JSON with exactly 1 place.';

    const response = await this.executeWithFallback(
      (provider) => provider.generateText(prompt, systemPrompt),
      'generatePlacesForCity'
    );

    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Failed to parse AI response');
    }
    
    const aiPlaces = JSON.parse(jsonMatch[0]).slice(0, maxPlaces);
    console.log(`AI generated ${aiPlaces.length} place(s)`);
    
    return await this.processAIGeneratedPlaces(aiPlaces, city, country, maxPlaces);
  }

  /**
   * 处理 AI 生成的地点，通过 Google Maps API 获取详细信息并保存到数据库
   * maxPlaces 参数限制最多处理多少个地点（省钱）
   */
  private async processAIGeneratedPlaces(
    aiPlaces: Array<{ name: string; category: string; tags: string[]; description: string }>,
    city: string,
    country: string,
    maxPlaces: number = 1
  ): Promise<any[]> {
    const results: any[] = [];
    
    // 限制最多处理 maxPlaces 个地点（省钱）
    const placesToProcess = aiPlaces.slice(0, maxPlaces);
    
    for (const aiPlace of placesToProcess) {
      if (results.length >= maxPlaces) break;
      
      try {
        // 搜索 Google Maps 获取 place_id（只取第一个结果）
        const searchQuery = `${aiPlace.name} ${city} ${country}`;
        const searchResults = await googleMapsService.textSearch(searchQuery);
        
        if (!searchResults || searchResults.length === 0) {
          console.warn(`Place not found in Google Maps: ${aiPlace.name}`);
          continue;
        }

        // 只取第一个搜索结果（省钱）
        const googlePlaceId = searchResults[0].place_id;
        if (!googlePlaceId) continue;

        // 添加到数据库
        const place = await publicPlaceService.addByPlaceId(
          googlePlaceId,
          'ai_chat',
          {
            aiGenerated: true,
            aiCategory: aiPlace.category,
            aiTags: aiPlace.tags,
            aiDescription: aiPlace.description,
            timestamp: new Date(),
          }
        );

        // 更新 AI 标签
        if (aiPlace.tags && aiPlace.tags.length > 0) {
          await publicPlaceService.updatePlace(googlePlaceId, {
            aiTags: aiPlace.tags,
            aiDescription: aiPlace.description,
          } as any);
        }

        results.push(place);
        
        // 已经获取到足够的地点，停止处理
        if (results.length >= maxPlaces) {
          console.log(`Reached max places limit (${maxPlaces}), stopping`);
          break;
        }
      } catch (error) {
        console.error(`Error processing AI place ${aiPlace.name}:`, error);
        // 继续处理下一个
      }
    }

    return results;
  }

  /**
   * Get list of available provider names
   */
  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get current provider order
   */
  getProviderOrder(): string[] {
    return [...this.providerOrder];
  }
}

export default new AIService();
