/**
 * Kouri OpenAI Proxy Provider
 * 
 * Implements the AIProvider interface for Kouri API proxy service.
 * Provides access to OpenAI models (gpt-4o-mini, gpt-4o) via OpenAI-compatible API.
 * Uses /v1/responses endpoint with web_search_preview for better recommendations.
 */

import axios, { AxiosError } from 'axios';
import {
  AIProvider,
  AIProviderName,
  PlaceIdentificationResult,
  AIServiceError,
  AIErrorCode,
  httpStatusToErrorCode,
  isRetryableError,
} from './types';

/**
 * Kouri API configuration interface
 */
interface KouriConfig {
  apiKey: string;
  baseUrl: string;
  chatModel: string;
  visionModel: string;
}

/**
 * OpenAI-compatible Chat Completion response format
 */
interface OpenAIChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Kouri Responses API format (with web search)
 */
interface KouriResponsesResponse {
  id: string;
  object: string;
  created_at: number;
  status: string;
  model: string;
  output: Array<{
    id: string;
    type: string;
    status: string;
    content?: Array<{
      type: string;
      text?: string;
      annotations?: Array<any>;
    }>;
    role?: string;
  }>;
  usage?: {
    input_tokens: number;
    output_tokens?: number;
    total_tokens?: number;
  };
}

/**
 * Kouri Provider implementation
 */
export class KouriProvider implements AIProvider {
  readonly name = AIProviderName.KOURI;
  
  private config: KouriConfig | null = null;
  private configValid: boolean = false;

  constructor() {
    this.loadConfig();
  }

  /**
   * Load and validate configuration from environment variables
   */
  private loadConfig(): void {
    const apiKey = process.env.KOURI_API_KEY;
    const baseUrl = process.env.KOURI_BASE_URL;
    const chatModel = process.env.KOURI_CHAT_MODEL || 'gpt-4o-mini';
    const visionModel = process.env.KOURI_VISION_MODEL || 'gpt-4o';

    // Validate required configuration
    if (!apiKey) {
      console.log('[Kouri] Configuration incomplete - missing API key');
      this.configValid = false;
      return;
    }

    if (!baseUrl) {
      console.log('[Kouri] Configuration incomplete - missing base URL');
      this.configValid = false;
      return;
    }

    this.config = {
      apiKey,
      baseUrl: baseUrl.replace(/\/$/, ''), // Remove trailing slash
      chatModel,
      visionModel,
    };

    this.configValid = true;
    console.log('[Kouri] Provider initialized successfully');
    console.log(`[Kouri] Base URL: ${this.config.baseUrl}`);
    console.log(`[Kouri] Chat model: ${this.config.chatModel}`);
    console.log(`[Kouri] Vision model: ${this.config.visionModel}`);
  }

  /**
   * Check if the provider is available (configured and ready)
   */
  isAvailable(): boolean {
    return this.configValid && this.config !== null;
  }


  /**
   * Build API URL for chat completions endpoint
   */
  private buildChatApiUrl(): string {
    if (!this.config) {
      throw new Error('Kouri not configured');
    }
    return `${this.config.baseUrl}/chat/completions`;
  }

  /**
   * Build API URL for responses endpoint (with web search)
   */
  private buildResponsesApiUrl(): string {
    if (!this.config) {
      throw new Error('Kouri not configured');
    }
    return `${this.config.baseUrl}/responses`;
  }

  /**
   * Get common headers for Kouri API requests
   */
  private getHeaders(): Record<string, string> {
    if (!this.config) {
      throw new Error('Kouri not configured');
    }
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
    };
  }

  /**
   * Parse JSON from AI response content
   */
  private parseJsonResponse<T>(content: string): T {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse AI response - no JSON found');
    }

    try {
      return JSON.parse(jsonMatch[0]) as T;
    } catch (parseError) {
      throw new Error(`Failed to parse JSON response: ${parseError}`);
    }
  }

  /**
   * Generate text based on a prompt using Kouri Responses API (with web search)
   * @param prompt User prompt
   * @param systemPrompt Optional system prompt
   * @returns Generated text response
   */
  async generateText(prompt: string, systemPrompt?: string): Promise<string> {
    if (!this.isAvailable() || !this.config) {
      throw this.createConfigError();
    }

    const url = this.buildResponsesApiUrl();
    
    // Combine system prompt and user prompt for the responses API
    const fullPrompt = systemPrompt 
      ? `${systemPrompt}\n\n${prompt}`
      : prompt;

    const requestBody = {
      model: this.config.chatModel,
      input: fullPrompt,
      tools: [{ type: 'web_search_preview' }],
      tool_choice: 'auto', // 让 AI 自己决定是否使用 web search
    };

    try {
      console.log(`[Kouri] Sending responses request to: ${url}`);
      
      const response = await axios.post<KouriResponsesResponse>(url, requestBody, {
        headers: this.getHeaders(),
        timeout: 90000, // 90 second timeout for web search
      });

      // Extract text content from the response
      const output = response.data.output;
      let content = '';
      
      for (const item of output) {
        if (item.type === 'message' && item.content) {
          for (const contentItem of item.content) {
            if (contentItem.type === 'output_text' && contentItem.text) {
              content = contentItem.text;
              break;
            }
          }
        }
      }

      if (!content) {
        throw new Error('Empty response from Kouri Responses API');
      }

      console.log(`[Kouri] Responses request successful`);
      console.log(`[Kouri] Tokens used: ${response.data.usage?.input_tokens || 'unknown'}`);
      
      return content;
    } catch (error) {
      throw this.handleError(error, 'generateText');
    }
  }


  /**
   * Identify a place from an image URL using Kouri API with vision model
   * @param imageUrl URL or base64 encoded image
   * @returns Place identification result
   */
  async identifyPlace(imageUrl: string): Promise<PlaceIdentificationResult> {
    if (!this.isAvailable() || !this.config) {
      throw this.createConfigError();
    }

    const url = this.buildChatApiUrl();
    
    const systemPrompt = `You are a travel expert specializing in identifying famous landmarks, restaurants, cafes, museums, and tourist attractions from images. 
Please identify the place in the image and return ONLY a JSON object with this exact structure:
{
  "placeName": "exact name of the place",
  "city": "city name",
  "country": "country name",
  "confidence": 0.0-1.0,
  "description": "brief description",
  "suggestedTags": ["tag1", "tag2", "tag3"]
}
If you cannot identify the place with reasonable confidence, set confidence to 0 and provide your best guess.`;

    const requestBody = {
      model: this.config.visionModel,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'What place is shown in this image? Please identify it and return the JSON response.',
            },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
              },
            },
          ],
        },
      ],
      max_tokens: 500,
      temperature: 0.2,
    };

    try {
      console.log(`[Kouri] Sending vision request to: ${url}`);
      
      const response = await axios.post<OpenAIChatResponse>(url, requestBody, {
        headers: this.getHeaders(),
        timeout: 45000, // 45 second timeout for vision requests
      });

      const content = response.data.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from Kouri API');
      }

      // Parse JSON response
      const result = this.parseJsonResponse<PlaceIdentificationResult>(content);
      
      console.log(`[Kouri] Vision request successful - identified: ${result.placeName}`);
      console.log(`[Kouri] Tokens used: ${response.data.usage?.total_tokens || 'unknown'}`);
      
      return result;
    } catch (error) {
      throw this.handleError(error, 'identifyPlace');
    }
  }

  /**
   * Search for place image using web search
   * @param placeName Name of the place
   * @param city Optional city name for better results
   * @returns Image URL or null
   */
  async searchPlaceImage(placeName: string, city?: string): Promise<string | null> {
    if (!this.isAvailable() || !this.config) {
      console.log('[Kouri] Not available for image search');
      return null;
    }

    const url = this.buildResponsesApiUrl();
    const searchQuery = city ? `${placeName} ${city}` : placeName;
    
    const prompt = `Search the web for a photo of "${searchQuery}" and find a direct image URL.

I need a direct link to an image file (URL must contain .jpg, .jpeg, .png, .webp, or .gif).
Prefer images from Wikipedia, Wikimedia Commons, or official tourism websites.
Do NOT use stock photo sites like Getty, Alamy, Shutterstock.

Return ONLY this JSON:
{"imageUrl": "https://example.com/image.jpg", "source": "website"}

If no direct image URL found, return:
{"imageUrl": null, "source": null}`;

    const requestBody = {
      model: this.config.chatModel,
      input: prompt,
      tools: [{ type: 'web_search_preview' }],
      tool_choice: 'auto', // Let AI decide, same as generateText
    };

    try {
      console.log(`[Kouri] Searching image for: ${searchQuery}`);
      
      const response = await axios.post<KouriResponsesResponse>(url, requestBody, {
        headers: this.getHeaders(),
        timeout: 45000, // 45 second timeout
      });

      // Extract text content from the response (same logic as generateText)
      const output = response.data.output;
      let content = '';
      
      for (const item of output) {
        if (item.type === 'message' && item.content) {
          for (const contentItem of item.content) {
            if (contentItem.type === 'output_text' && contentItem.text) {
              content = contentItem.text;
              break;
            }
          }
        }
      }

      if (!content) {
        console.log('[Kouri] No text content in image search response');
        return null;
      }

      console.log('[Kouri] Image search response:', content.substring(0, 300));

      // Remove markdown code blocks if present
      content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        content = jsonMatch[0];
      }

      // Parse JSON response
      try {
        const result = this.parseJsonResponse<{ imageUrl: string | null; source: string | null }>(content);
        if (result.imageUrl) {
          // Validate that it's a direct image URL
          const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
          const urlLower = result.imageUrl.toLowerCase();
          const isDirectImage = imageExtensions.some(ext => urlLower.includes(ext));
          
          if (isDirectImage) {
            console.log(`[Kouri] Found image from ${result.source}: ${result.imageUrl}`);
            return result.imageUrl;
          } else {
            console.log(`[Kouri] Skipping non-direct image URL: ${result.imageUrl.substring(0, 80)}...`);
          }
        } else {
          console.log('[Kouri] No imageUrl in parsed response');
        }
      } catch (parseError) {
        console.log('[Kouri] Failed to parse image search response:', content.substring(0, 200));
      }
      
      return null;
    } catch (error) {
      console.error('[Kouri] Image search error:', error instanceof Error ? error.message : error);
      return null;
    }
  }

  /**
   * Create a configuration error
   */
  private createConfigError(): AIServiceError {
    return {
      code: AIErrorCode.CONFIG_ERROR,
      message: 'Kouri API is not configured',
      provider: this.name,
      retryable: false,
    };
  }

  /**
   * Handle errors from Kouri API calls
   */
  private handleError(error: unknown, operation: string): AIServiceError {
    // Handle timeout errors
    if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
      console.error(`[Kouri] ${operation} timeout`);
      return {
        code: AIErrorCode.TIMEOUT,
        message: 'Request timed out',
        provider: this.name,
        retryable: true,
      };
    }

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ error?: { message?: string; code?: string } }>;
      const status = axiosError.response?.status || 500;
      const errorMessage = axiosError.response?.data?.error?.message 
        || axiosError.message 
        || 'Unknown error';
      
      console.error(`[Kouri] ${operation} error (${status}):`, errorMessage);
      
      const code = httpStatusToErrorCode(status);
      return {
        code,
        message: errorMessage,
        provider: this.name,
        retryable: isRetryableError(code),
        details: axiosError.response?.data,
      };
    }

    // Handle parse errors
    if (error instanceof Error && error.message.includes('parse')) {
      console.error(`[Kouri] ${operation} parse error:`, error.message);
      return {
        code: AIErrorCode.PARSE_ERROR,
        message: error.message,
        provider: this.name,
        retryable: false,
        details: error,
      };
    }

    // Non-Axios error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Kouri] ${operation} error:`, errorMessage);
    
    return {
      code: AIErrorCode.UNKNOWN,
      message: errorMessage,
      provider: this.name,
      retryable: false,
      details: error,
    };
  }
}
