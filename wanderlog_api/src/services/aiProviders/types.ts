/**
 * AI Provider Types and Interfaces
 * 
 * This module defines the common types and interfaces for all AI providers
 * supporting Azure OpenAI, Gemini, and future providers.
 */

/**
 * Result of place identification from an image
 */
export interface PlaceIdentificationResult {
  placeName: string;
  city?: string;
  country?: string;
  confidence: number;
  description?: string;
  suggestedTags?: string[];
}

/**
 * AI Service Error with provider context
 */
export interface AIServiceError {
  code: string;
  message: string;
  provider: string;
  retryable: boolean;
  details?: any;
}

/**
 * Error codes for AI service errors
 */
export enum AIErrorCode {
  RATE_LIMITED = 'RATE_LIMITED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  BAD_REQUEST = 'BAD_REQUEST',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  TIMEOUT = 'TIMEOUT',
  PARSE_ERROR = 'PARSE_ERROR',
  CONFIG_ERROR = 'CONFIG_ERROR',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Map HTTP status codes to error codes
 */
export function httpStatusToErrorCode(status: number): AIErrorCode {
  switch (status) {
    case 429:
      return AIErrorCode.RATE_LIMITED;
    case 503:
      return AIErrorCode.SERVICE_UNAVAILABLE;
    case 401:
      return AIErrorCode.UNAUTHORIZED;
    case 403:
      return AIErrorCode.FORBIDDEN;
    case 404:
      return AIErrorCode.NOT_FOUND;
    case 400:
      return AIErrorCode.BAD_REQUEST;
    case 500:
      return AIErrorCode.INTERNAL_ERROR;
    default:
      return AIErrorCode.UNKNOWN;
  }
}

/**
 * Check if an error code is retryable
 */
export function isRetryableError(code: AIErrorCode): boolean {
  return [
    AIErrorCode.RATE_LIMITED,
    AIErrorCode.SERVICE_UNAVAILABLE,
    AIErrorCode.INTERNAL_ERROR,
    AIErrorCode.TIMEOUT,
  ].includes(code);
}

/**
 * Create an AIServiceError from an HTTP error
 */
export function createAIServiceError(
  provider: string,
  status: number,
  message: string,
  details?: any
): AIServiceError {
  const code = httpStatusToErrorCode(status);
  return {
    code,
    message,
    provider,
    retryable: isRetryableError(code),
    details,
  };
}

/**
 * Provider names enum
 */
export enum AIProviderName {
  AZURE_OPENAI = 'azure_openai',
  GEMINI = 'gemini',
  KOURI = 'kouri',
}

/**
 * AI Provider interface
 * All AI providers must implement this interface
 */
export interface AIProvider {
  /**
   * Provider name identifier
   */
  readonly name: AIProviderName;

  /**
   * Identify a place from an image URL
   * @param imageUrl URL or base64 encoded image
   * @returns Place identification result
   */
  identifyPlace(imageUrl: string): Promise<PlaceIdentificationResult>;

  /**
   * Generate text based on a prompt
   * @param prompt User prompt
   * @param systemPrompt Optional system prompt
   * @returns Generated text response
   */
  generateText(prompt: string, systemPrompt?: string): Promise<string>;

  /**
   * Search for a place image using web search (optional)
   * @param placeName Name of the place
   * @param city Optional city name for better results
   * @returns Image URL or null
   */
  searchPlaceImage?(placeName: string, city?: string): Promise<string | null>;

  /**
   * Check if the provider is available (configured and ready)
   * @returns true if provider can be used
   */
  isAvailable(): boolean;
}
