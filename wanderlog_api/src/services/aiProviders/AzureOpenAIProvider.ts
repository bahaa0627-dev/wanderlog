/**
 * Azure OpenAI Provider
 * 
 * Implements the AIProvider interface for Azure OpenAI service.
 * Supports both vision (GPT-4o) and chat (GPT-4o-mini) deployments.
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
 * Azure OpenAI configuration interface
 */
interface AzureOpenAIConfig {
  endpoint: string;
  apiKey: string;
  apiVersion: string;
  visionDeployment: string;
  chatDeployment: string;
}

/**
 * Azure OpenAI API response format
 */
interface AzureOpenAIResponse {
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
 * Azure OpenAI Provider implementation
 */
export class AzureOpenAIProvider implements AIProvider {
  readonly name = AIProviderName.AZURE_OPENAI;
  
  private config: AzureOpenAIConfig | null = null;
  private configValid: boolean = false;

  constructor() {
    this.loadConfig();
  }

  /**
   * Load and validate configuration from environment variables
   */
  private loadConfig(): void {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-02-15-preview';
    const visionDeployment = process.env.AZURE_OPENAI_DEPLOYMENT_VISION || 'gpt-4o';
    const chatDeployment = process.env.AZURE_OPENAI_DEPLOYMENT_CHAT || 'gpt-4o-mini';

    // Validate required configuration
    if (!endpoint || !apiKey) {
      console.log('[AzureOpenAI] Configuration incomplete - missing endpoint or API key');
      this.configValid = false;
      return;
    }

    // Validate endpoint format
    if (!this.isValidEndpoint(endpoint)) {
      console.warn('[AzureOpenAI] Invalid endpoint format:', endpoint);
      this.configValid = false;
      return;
    }

    this.config = {
      endpoint: endpoint.replace(/\/$/, ''), // Remove trailing slash
      apiKey,
      apiVersion,
      visionDeployment,
      chatDeployment,
    };

    this.configValid = true;
    console.log('[AzureOpenAI] Provider initialized successfully');
    console.log(`[AzureOpenAI] Endpoint: ${this.config.endpoint}`);
    console.log(`[AzureOpenAI] Vision deployment: ${this.config.visionDeployment}`);
    console.log(`[AzureOpenAI] Chat deployment: ${this.config.chatDeployment}`);
  }

  /**
   * Validate endpoint URL format
   */
  private isValidEndpoint(endpoint: string): boolean {
    try {
      const url = new URL(endpoint);
      return url.protocol === 'https:' && url.hostname.includes('openai.azure.com');
    } catch {
      return false;
    }
  }

  /**
   * Check if the provider is available (configured and ready)
   */
  isAvailable(): boolean {
    return this.configValid && this.config !== null;
  }

  /**
   * Build Azure OpenAI API URL for a specific deployment
   */
  private buildApiUrl(deployment: string): string {
    if (!this.config) {
      throw new Error('Azure OpenAI not configured');
    }
    return `${this.config.endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${this.config.apiVersion}`;
  }

  /**
   * Get common headers for Azure OpenAI requests
   */
  private getHeaders(): Record<string, string> {
    if (!this.config) {
      throw new Error('Azure OpenAI not configured');
    }
    return {
      'Content-Type': 'application/json',
      'api-key': this.config.apiKey,
    };
  }


  /**
   * Identify a place from an image URL using Azure OpenAI Vision (GPT-4o)
   * @param imageUrl URL or base64 encoded image
   * @returns Place identification result
   */
  async identifyPlace(imageUrl: string): Promise<PlaceIdentificationResult> {
    if (!this.isAvailable() || !this.config) {
      throw this.createConfigError();
    }

    const url = this.buildApiUrl(this.config.visionDeployment);
    
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
      console.log(`[AzureOpenAI] Sending vision request to: ${url}`);
      
      const response = await axios.post<AzureOpenAIResponse>(url, requestBody, {
        headers: this.getHeaders(),
        timeout: 30000, // 30 second timeout
      });

      const content = response.data.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from Azure OpenAI');
      }

      // Parse JSON response
      const result = this.parseJsonResponse<PlaceIdentificationResult>(content);
      
      console.log(`[AzureOpenAI] Vision request successful - identified: ${result.placeName}`);
      console.log(`[AzureOpenAI] Tokens used: ${response.data.usage?.total_tokens || 'unknown'}`);
      
      return result;
    } catch (error) {
      throw this.handleError(error, 'identifyPlace');
    }
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
   * Generate text based on a prompt using Azure OpenAI Chat (GPT-4o-mini)
   * @param prompt User prompt
   * @param systemPrompt Optional system prompt
   * @returns Generated text response
   */
  async generateText(prompt: string, systemPrompt?: string): Promise<string> {
    if (!this.isAvailable() || !this.config) {
      throw this.createConfigError();
    }

    const url = this.buildApiUrl(this.config.chatDeployment);
    
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
      messages,
      max_tokens: 1000,
      temperature: 0.7,
    };

    try {
      console.log(`[AzureOpenAI] Sending chat request to: ${url}`);
      
      const response = await axios.post<AzureOpenAIResponse>(url, requestBody, {
        headers: this.getHeaders(),
        timeout: 30000, // 30 second timeout
      });

      const content = response.data.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from Azure OpenAI');
      }

      console.log(`[AzureOpenAI] Chat request successful`);
      console.log(`[AzureOpenAI] Tokens used: ${response.data.usage?.total_tokens || 'unknown'}`);
      
      return content;
    } catch (error) {
      throw this.handleError(error, 'generateText');
    }
  }

  /**
   * Create a configuration error
   */
  private createConfigError(): AIServiceError {
    return {
      code: AIErrorCode.CONFIG_ERROR,
      message: 'Azure OpenAI is not configured',
      provider: this.name,
      retryable: false,
    };
  }

  /**
   * Handle errors from Azure OpenAI API calls
   */
  private handleError(error: unknown, operation: string): AIServiceError {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ error?: { message?: string; code?: string } }>;
      const status = axiosError.response?.status || 500;
      const errorMessage = axiosError.response?.data?.error?.message 
        || axiosError.message 
        || 'Unknown error';
      
      console.error(`[AzureOpenAI] ${operation} error (${status}):`, errorMessage);
      
      return createAIServiceError(
        this.name,
        status,
        errorMessage,
        axiosError.response?.data
      );
    }

    // Non-Axios error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[AzureOpenAI] ${operation} error:`, errorMessage);
    
    return {
      code: AIErrorCode.UNKNOWN,
      message: errorMessage,
      provider: this.name,
      retryable: false,
      details: error,
    };
  }
}
