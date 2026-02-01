/**
 * OpenRouter Provider
 * 
 * Implements the AIProvider interface for OpenRouter API.
 * Provides access to OpenAI models (gpt-4o-mini) via OpenRouter with web search capability.
 * Uses /api/v1/responses endpoint with web_search_preview for better recommendations.
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
import { R2ImageService } from '../r2ImageService';

/**
 * OpenRouter API configuration interface
 */
interface OpenRouterConfig {
  apiKey: string;
  baseUrl: string;
  chatModel: string;
  visionModel: string;
}

/**
 * OpenRouter Responses API format (with web search)
 */
interface OpenRouterResponsesResponse {
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
 * OpenRouter Provider implementation
 */
export class OpenRouterProvider implements AIProvider {
  readonly name = AIProviderName.OPENROUTER;
  
  private config: OpenRouterConfig | null = null;
  private configValid: boolean = false;
  private r2ImageService: R2ImageService;

  constructor() {
    this.r2ImageService = new R2ImageService();
    this.loadConfig();
  }

  /**
   * Load and validate configuration from environment variables
   */
  private loadConfig(): void {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
    const chatModel = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
    const visionModel = process.env.OPENROUTER_VISION_MODEL || 'openai/gpt-4o-mini';

    // Validate required configuration
    if (!apiKey) {
      console.log('[OpenRouter] Configuration incomplete - missing API key');
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
    console.log('[OpenRouter] Provider initialized successfully');
    console.log(`[OpenRouter] Base URL: ${this.config.baseUrl}`);
    console.log(`[OpenRouter] Chat model: ${this.config.chatModel}`);
    console.log(`[OpenRouter] Vision model: ${this.config.visionModel}`);
  }

  /**
   * Check if the provider is available (configured and ready)
   */
  isAvailable(): boolean {
    return this.configValid && this.config !== null;
  }

  /**
   * Build API URL for responses endpoint (with web search)
   */
  private buildResponsesApiUrl(): string {
    if (!this.config) {
      throw new Error('OpenRouter not configured');
    }
    return `${this.config.baseUrl}/responses`;
  }

  /**
   * Build API URL for chat completions endpoint
   */
  private buildChatApiUrl(): string {
    if (!this.config) {
      throw new Error('OpenRouter not configured');
    }
    return `${this.config.baseUrl}/chat/completions`;
  }

  /**
   * Get common headers for OpenRouter API requests
   */
  private getHeaders(): Record<string, string> {
    if (!this.config) {
      throw new Error('OpenRouter not configured');
    }
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
      'HTTP-Referer': 'https://wanderlog.app', // Required by OpenRouter
      'X-Title': 'WanderLog', // Optional but recommended
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
   * Generate text based on a prompt using OpenRouter Responses API (with web search)
   * @param prompt User prompt
   * @param systemPrompt Optional system prompt
   * @returns Generated text response
   */
  async generateText(prompt: string, systemPrompt?: string): Promise<string> {
    if (!this.isAvailable() || !this.config) {
      throw this.createConfigError();
    }

    const url = this.buildResponsesApiUrl();
    
    // Build a system instruction that emphasizes staying on topic
    const systemInstruction = `You are a helpful AI assistant. 

CRITICAL INSTRUCTION: 
- When using web search, ONLY use results that are DIRECTLY relevant to the user's specific question
- If the user asks about a specific city/location, ONLY provide information about THAT location
- IGNORE any search results that are about different locations or unrelated topics
- Your response must DIRECTLY answer what the user asked, not provide generic or tangential information

${systemPrompt || ''}`;
    
    // Combine system prompt and user prompt for the responses API
    const fullPrompt = `${systemInstruction}\n\n${prompt}`;

    const requestBody = {
      model: this.config.chatModel,
      input: fullPrompt,
      tools: [{ 
        type: 'web_search_preview',
        search_context_size: 'medium', // Balance between speed and context
      }],
      tool_choice: 'auto', // Let AI decide whether to use web search
    };

    try {
      console.log(`[OpenRouter] Sending responses request to: ${url}`);

      const response = await axios.post<OpenRouterResponsesResponse>(url, requestBody, {
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
        throw new Error('Empty response from OpenRouter Responses API');
      }

      console.log(`[OpenRouter] Responses request successful`);
      console.log(`[OpenRouter] Tokens used: ${response.data.usage?.input_tokens || 'unknown'}`);
      
      return content;
    } catch (error) {
      throw this.handleError(error, 'generateText');
    }
  }

  /**
   * Generate text using chat/completions WITHOUT web search.
   * This is preferred when you need strict JSON output (web search can add noise).
   */
  async generateTextNoSearch(prompt: string, systemPrompt?: string): Promise<string> {
    if (!this.isAvailable() || !this.config) {
      throw this.createConfigError();
    }

    const url = this.buildChatApiUrl();

    const systemInstruction = `You are a helpful AI assistant.

${systemPrompt || ''}`;

    const requestBody = {
      model: this.config.chatModel,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt },
      ],
      max_tokens: 900,
      temperature: 0.3,
    };

    try {
      console.log(`[OpenRouter] Sending chat/completions request to: ${url}`);
      const response = await axios.post<OpenAIChatResponse>(url, requestBody, {
        headers: this.getHeaders(),
        timeout: 45000,
      });

      const content = response.data.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from OpenRouter chat/completions API');
      }

      console.log('[OpenRouter] chat/completions request successful');
      return content;
    } catch (error) {
      throw this.handleError(error, 'generateTextNoSearch');
    }
  }

  /**
   * Identify a place from an image URL using OpenRouter API with vision model
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
      console.log(`[OpenRouter] Sending vision request to: ${url}`);
      
      const response = await axios.post<OpenAIChatResponse>(url, requestBody, {
        headers: this.getHeaders(),
        timeout: 45000, // 45 second timeout for vision requests
      });

      const content = response.data.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from OpenRouter API');
      }

      // Parse JSON response
      const result = this.parseJsonResponse<PlaceIdentificationResult>(content);
      
      console.log(`[OpenRouter] Vision request successful - identified: ${result.placeName}`);
      console.log(`[OpenRouter] Tokens used: ${response.data.usage?.total_tokens || 'unknown'}`);
      
      return result;
    } catch (error) {
      throw this.handleError(error, 'identifyPlace');
    }
  }

  /**
   * Search for place image using web search
   * Downloads the image and uploads to R2 to ensure product domain URL
   * @param placeName Name of the place
   * @param city Optional city name for better results
   * @returns Image URL (R2 CDN URL) or null
   */
  async searchPlaceImage(placeName: string, city?: string): Promise<string | null> {
    if (!this.isAvailable() || !this.config) {
      console.log('[OpenRouter] Not available for image search');
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
      tools: [{ 
        type: 'web_search_preview',
        search_context_size: 'medium',
      }],
      tool_choice: 'auto',
    };

    try {
      console.log(`[OpenRouter] Searching image for: ${searchQuery}`);
      
      const response = await axios.post<OpenRouterResponsesResponse>(url, requestBody, {
        headers: this.getHeaders(),
        timeout: 45000, // 45 second timeout
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
        console.log('[OpenRouter] No text content in image search response');
        return null;
      }

      console.log('[OpenRouter] Image search response:', content.substring(0, 300));

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
            console.log(`[OpenRouter] Found image from ${result.source}: ${result.imageUrl}`);
            
            // Download and upload to R2 to ensure product domain URL
            try {
              const uploadResult = await this.r2ImageService.processAndUpload(result.imageUrl);
              if (uploadResult.success && uploadResult.publicUrl) {
                console.log(`[OpenRouter] Image uploaded to R2: ${uploadResult.publicUrl}`);
                return uploadResult.publicUrl;
              } else {
                console.error('[OpenRouter] Failed to upload image to R2:', uploadResult.error);
                // Return null if upload fails (as per user requirement)
                return null;
              }
            } catch (uploadError) {
              console.error('[OpenRouter] Failed to upload image to R2:', uploadError instanceof Error ? uploadError.message : uploadError);
              // Return null if upload fails (as per user requirement)
              return null;
            }
          } else {
            console.log(`[OpenRouter] Skipping non-direct image URL: ${result.imageUrl.substring(0, 80)}...`);
          }
        } else {
          console.log('[OpenRouter] No imageUrl in parsed response');
        }
      } catch (parseError) {
        console.log('[OpenRouter] Failed to parse image search response:', content.substring(0, 200));
      }
      
      return null;
    } catch (error) {
      console.error('[OpenRouter] Image search error:', error instanceof Error ? error.message : error);
      return null;
    }
  }

  /**
   * Search for images of multiple places in a SINGLE API call
   * This is much more efficient than calling searchPlaceImage for each place
   * @param places Array of {name, city} objects
   * @returns Map of placeName -> imageUrl (or null if not found)
   */
  async searchPlaceImagesBatch(places: Array<{name: string; city: string}>): Promise<Map<string, string | null>> {
    const results = new Map<string, string | null>();
    
    if (!this.isAvailable() || !this.config || places.length === 0) {
      console.log('[OpenRouter] Not available for batch image search or no places');
      return results;
    }

    // Limit to first 5 places to keep response manageable
    const placesToSearch = places.slice(0, 5);
    const placeList = placesToSearch.map((p, i) => `${i + 1}. ${p.name} (${p.city})`).join('\n');

    const url = this.buildResponsesApiUrl();
    const prompt = `Search the web and find direct image URLs for these places:

${placeList}

Requirements:
- Find a direct link to an image file for each place (URL must contain .jpg, .jpeg, .png, .webp, or .gif)
- Prefer images from Wikipedia, Wikimedia Commons, or official tourism websites
- Do NOT use stock photo sites like Getty, Alamy, Shutterstock

Return ONLY this JSON array:
[
  {"name": "Place Name 1", "imageUrl": "https://example.com/image1.jpg"},
  {"name": "Place Name 2", "imageUrl": "https://example.com/image2.jpg"},
  {"name": "Place Name 3", "imageUrl": null}
]

If no image found for a place, set imageUrl to null.`;

    const requestBody = {
      model: this.config.chatModel,
      input: prompt,
      tools: [{ 
        type: 'web_search_preview',
        search_context_size: 'medium',
      }],
      tool_choice: 'auto',
    };

    try {
      console.log(`[OpenRouter] Batch searching images for ${placesToSearch.length} places`);
      
      const response = await axios.post<OpenRouterResponsesResponse>(url, requestBody, {
        headers: this.getHeaders(),
        timeout: 60000, // 60 second timeout for batch
      });

      // Extract text content
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
        console.log('[OpenRouter] No text content in batch image search response');
        return results;
      }

      console.log('[OpenRouter] Batch image search response:', content.substring(0, 500));

      // Remove markdown code blocks
      content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      // Extract JSON array
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        content = jsonMatch[0];
      }

      // Parse response
      try {
        const parsed = JSON.parse(content) as Array<{name: string; imageUrl: string | null}>;
        
        if (Array.isArray(parsed)) {
          const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
          
          for (const item of parsed) {
            if (item.name && item.imageUrl) {
              const urlLower = item.imageUrl.toLowerCase();
              const isDirectImage = imageExtensions.some(ext => urlLower.includes(ext));
              
              if (isDirectImage) {
                // Upload to R2
                try {
                  const uploadResult = await this.r2ImageService.processAndUpload(item.imageUrl);
                  if (uploadResult.success && uploadResult.publicUrl) {
                    results.set(item.name, uploadResult.publicUrl);
                    console.log(`[OpenRouter] Batch: "${item.name}" -> ${uploadResult.publicUrl}`);
                  } else {
                    results.set(item.name, null);
                  }
                } catch (uploadError) {
                  results.set(item.name, null);
                }
              } else {
                results.set(item.name, null);
              }
            } else if (item.name) {
              results.set(item.name, null);
            }
          }
        }
      } catch (parseError) {
        console.log('[OpenRouter] Failed to parse batch image search response');
      }
      
      console.log(`[OpenRouter] Batch search complete: found ${[...results.values()].filter(v => v).length}/${placesToSearch.length} images`);
      return results;
    } catch (error) {
      console.error('[OpenRouter] Batch image search error:', error instanceof Error ? error.message : error);
      return results;
    }
  }

  /**
   * Create a configuration error
   */
  private createConfigError(): AIServiceError {
    return {
      code: AIErrorCode.CONFIG_ERROR,
      message: 'OpenRouter API is not configured',
      provider: this.name,
      retryable: false,
    };
  }

  /**
   * Handle errors from OpenRouter API calls
   */
  private handleError(error: unknown, operation: string): AIServiceError {
    // Handle timeout errors
    if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
      console.error(`[OpenRouter] ${operation} timeout`);
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
      
      console.error(`[OpenRouter] ${operation} error (${status}):`, errorMessage);
      
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
      console.error(`[OpenRouter] ${operation} parse error:`, error.message);
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
    console.error(`[OpenRouter] ${operation} error:`, errorMessage);
    
    return {
      code: AIErrorCode.UNKNOWN,
      message: errorMessage,
      provider: this.name,
      retryable: false,
      details: error,
    };
  }
}
