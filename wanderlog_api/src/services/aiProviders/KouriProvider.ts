/**
 * Kouri OpenAI Proxy Provider
 * 
 * Implements the AIProvider interface for Kouri API proxy service.
 * Provides access to OpenAI models (gpt-4o-mini, gpt-4o) via OpenAI-compatible API.
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
  private buildApiUrl(): string {
    if (!this.config) {
      throw new Error('Kouri not configured');
    }
    return `${this.config.baseUrl}/chat/completions`;
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
   * Generate text based on a prompt using Kouri API (OpenAI-compatible)
   * @param prompt User prompt
   * @param systemPrompt Optional system prompt
   * @returns Generated text response
   */
  async generateText(prompt: string, systemPrompt?: string): Promise<string> {
    if (!this.isAvailable() || !this.config) {
      throw this.createConfigError();
    }

    const url = this.buildApiUrl();
    
    const messages: Array<{ role: string; content: string }> = [];
    
    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt,
      });
    }
    
    messages.push({
      role: 'user',
      content: prompt,
    });

    const requestBody = {
      model: this.config.chatModel,
      messages,
      max_tokens: 1000,
      temperature: 0.7,
    };

    try {
      console.log(`[Kouri] Sending chat request to: ${url}`);
      
      const response = await axios.post<OpenAIChatResponse>(url, requestBody, {
        headers: this.getHeaders(),
        timeout: 30000, // 30 second timeout
      });

      const content = response.data.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from Kouri API');
      }

      console.log(`[Kouri] Chat request successful`);
      console.log(`[Kouri] Tokens used: ${response.data.usage?.total_tokens || 'unknown'}`);
      
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

    const url = this.buildApiUrl();
    
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
