/**
 * Gemini Provider
 * 
 * Implements the AIProvider interface for Google Gemini service.
 * Supports both vision and text generation using Gemini 1.5 Flash model.
 */

import axios, { AxiosError } from 'axios';
import {
  AIProvider,
  AIProviderName,
  PlaceIdentificationResult,
  AIServiceError,
  AIErrorCode,
  createAIServiceError,
} from './types';

/**
 * Gemini configuration interface
 */
interface GeminiConfig {
  apiKey: string;
  model: string;
}

/**
 * Gemini API response format
 */
interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
      role: string;
    };
    finishReason: string;
    index: number;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

/**
 * Gemini Provider implementation
 */
export class GeminiProvider implements AIProvider {
  readonly name = AIProviderName.GEMINI;
  
  private config: GeminiConfig | null = null;
  private configValid: boolean = false;

  constructor() {
    this.loadConfig();
  }

  /**
   * Load and validate configuration from environment variables
   */
  private loadConfig(): void {
    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

    // Validate required configuration
    if (!apiKey) {
      console.log('[Gemini] Configuration incomplete - missing API key');
      this.configValid = false;
      return;
    }

    this.config = {
      apiKey,
      model,
    };

    this.configValid = true;
    console.log('[Gemini] Provider initialized successfully');
    console.log(`[Gemini] Model: ${this.config.model}`);
  }

  /**
   * Check if the provider is available (configured and ready)
   */
  isAvailable(): boolean {
    return this.configValid && this.config !== null;
  }

  /**
   * Build Gemini API URL
   */
  private buildApiUrl(): string {
    if (!this.config) {
      throw new Error('Gemini not configured');
    }
    return `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent?key=${this.config.apiKey}`;
  }

  /**
   * Identify a place from an image URL using Gemini Vision
   * @param imageUrl URL or base64 encoded image
   * @returns Place identification result
   */
  async identifyPlace(imageUrl: string): Promise<PlaceIdentificationResult> {
    if (!this.isAvailable() || !this.config) {
      throw this.createConfigError();
    }

    const url = this.buildApiUrl();
    
    // If URL, download and convert to base64
    let imageBase64 = imageUrl;
    if (imageUrl.startsWith('http')) {
      try {
        console.log('[Gemini] Downloading image from URL...');
        const imageResponse = await axios.get(imageUrl, { 
          responseType: 'arraybuffer',
          timeout: 15000,
        });
        imageBase64 = Buffer.from(imageResponse.data).toString('base64');
      } catch (error) {
        console.error('[Gemini] Failed to download image:', error);
        throw {
          code: AIErrorCode.BAD_REQUEST,
          message: 'Failed to download image from URL',
          provider: this.name,
          retryable: false,
        } as AIServiceError;
      }
    }

    const prompt = `You are a travel expert. Identify the place shown in this image. Return ONLY a JSON object with: placeName, city, country, confidence (0-1), description, and suggestedTags array. If unsure, set confidence low.`;

    const requestBody = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: 'image/jpeg',
                data: imageBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 500,
      },
    };

    try {
      console.log('[Gemini] Sending vision request...');
      
      const response = await axios.post<GeminiResponse>(url, requestBody, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });

      const content = response.data.candidates[0]?.content?.parts[0]?.text;
      if (!content) {
        throw new Error('Empty response from Gemini');
      }

      // Parse JSON response
      const result = this.parseJsonResponse<PlaceIdentificationResult>(content);
      
      console.log(`[Gemini] Vision request successful - identified: ${result.placeName}`);
      if (response.data.usageMetadata) {
        console.log(`[Gemini] Tokens used: ${response.data.usageMetadata.totalTokenCount}`);
      }
      
      return result;
    } catch (error) {
      throw this.handleError(error, 'identifyPlace');
    }
  }

  /**
   * Generate text based on a prompt using Gemini
   * @param prompt User prompt
   * @param systemPrompt Optional system prompt (will be prepended to user prompt)
   * @returns Generated text response
   */
  async generateText(prompt: string, systemPrompt?: string): Promise<string> {
    if (!this.isAvailable() || !this.config) {
      throw this.createConfigError();
    }

    const url = this.buildApiUrl();
    
    // Gemini doesn't have a separate system prompt, so we combine them
    const fullPrompt = systemPrompt 
      ? `${systemPrompt}\n\n${prompt}`
      : prompt;

    const requestBody = {
      contents: [
        {
          parts: [{ text: fullPrompt }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2000,
        responseMimeType: 'application/json',
      },
    };

    try {
      console.log('[Gemini] Sending text generation request...');
      
      const response = await axios.post<GeminiResponse>(url, requestBody, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });

      const content = response.data.candidates[0]?.content?.parts[0]?.text;
      if (!content) {
        throw new Error('Empty response from Gemini');
      }

      console.log('[Gemini] Text generation request successful');
      if (response.data.usageMetadata) {
        console.log(`[Gemini] Tokens used: ${response.data.usageMetadata.totalTokenCount}`);
      }
      
      return content;
    } catch (error) {
      throw this.handleError(error, 'generateText');
    }
  }

  /**
   * Parse JSON from AI response content
   */
  private parseJsonResponse<T>(content: string): T {
    // Try to extract JSON object from the response
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
   * Create a configuration error
   */
  private createConfigError(): AIServiceError {
    return {
      code: AIErrorCode.CONFIG_ERROR,
      message: 'Gemini is not configured',
      provider: this.name,
      retryable: false,
    };
  }

  /**
   * Handle errors from Gemini API calls
   */
  private handleError(error: unknown, operation: string): AIServiceError {
    // Check if it's already an AIServiceError
    if (this.isAIServiceError(error)) {
      return error;
    }

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ error?: { message?: string; code?: string } }>;
      const status = axiosError.response?.status || 500;
      const errorMessage = axiosError.response?.data?.error?.message 
        || axiosError.message 
        || 'Unknown error';
      
      console.error(`[Gemini] ${operation} error (${status}):`, errorMessage);
      
      return createAIServiceError(
        this.name,
        status,
        errorMessage,
        axiosError.response?.data
      );
    }

    // Non-Axios error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Gemini] ${operation} error:`, errorMessage);
    
    return {
      code: AIErrorCode.UNKNOWN,
      message: errorMessage,
      provider: this.name,
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
}
