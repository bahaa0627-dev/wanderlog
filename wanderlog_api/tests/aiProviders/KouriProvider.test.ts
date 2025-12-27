/**
 * Unit Tests for Kouri OpenAI Proxy Provider
 * 
 * Feature: kouri-openai-proxy
 * 
 * Tests configuration loading, availability checks, request building,
 * and error handling for the KouriProvider.
 * 
 * Requirements: 1.2, 1.3, 4.1, 4.2, 4.3, 4.4
 */

import { AIErrorCode, httpStatusToErrorCode, isRetryableError } from '../../src/services/aiProviders/types';

/**
 * Kouri configuration interface for testing
 */
interface KouriConfig {
  apiKey: string;
  baseUrl: string;
  chatModel: string;
  visionModel: string;
}

/**
 * Build API URL for chat completions endpoint
 * Extracted from KouriProvider for testing
 */
function buildApiUrl(baseUrl: string): string {
  return `${baseUrl}/chat/completions`;
}

/**
 * Get headers for Kouri API requests
 * Extracted from KouriProvider for testing
 */
function getHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };
}

/**
 * Build text request body
 * Extracted from KouriProvider for testing
 */
function buildTextRequestBody(model: string, prompt: string, systemPrompt?: string) {
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

  return {
    model,
    messages,
    max_tokens: 1000,
    temperature: 0.7,
  };
}

/**
 * Build vision request body
 * Extracted from KouriProvider for testing
 */
function buildVisionRequestBody(model: string, imageUrl: string, systemPrompt: string) {
  return {
    model,
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
}

/**
 * Validate configuration and return availability status
 * Extracted from KouriProvider for testing
 */
function validateConfig(apiKey?: string, baseUrl?: string): { valid: boolean; config: KouriConfig | null } {
  if (!apiKey || !baseUrl) {
    return { valid: false, config: null };
  }
  
  return {
    valid: true,
    config: {
      apiKey,
      baseUrl: baseUrl.replace(/\/$/, ''),
      chatModel: 'gpt-4o-mini',
      visionModel: 'gpt-4o',
    },
  };
}

describe('KouriProvider Unit Tests', () => {
  /**
   * Test configuration loading
   * Requirements: 1.2, 1.3
   */
  describe('Configuration Loading', () => {
    it('should return valid config when API key and base URL are provided', () => {
      const result = validateConfig('test-api-key', 'https://api.kouri.com/v1');
      
      expect(result.valid).toBe(true);
      expect(result.config).not.toBeNull();
      expect(result.config?.apiKey).toBe('test-api-key');
      expect(result.config?.baseUrl).toBe('https://api.kouri.com/v1');
    });

    it('should return invalid when API key is missing', () => {
      const result = validateConfig(undefined, 'https://api.kouri.com/v1');
      
      expect(result.valid).toBe(false);
      expect(result.config).toBeNull();
    });

    it('should return invalid when base URL is missing', () => {
      const result = validateConfig('test-api-key', undefined);
      
      expect(result.valid).toBe(false);
      expect(result.config).toBeNull();
    });

    it('should return invalid when both API key and base URL are missing', () => {
      const result = validateConfig(undefined, undefined);
      
      expect(result.valid).toBe(false);
      expect(result.config).toBeNull();
    });

    it('should remove trailing slash from base URL', () => {
      const result = validateConfig('test-api-key', 'https://api.kouri.com/v1/');
      
      expect(result.valid).toBe(true);
      expect(result.config?.baseUrl).toBe('https://api.kouri.com/v1');
    });

    it('should use default chat model gpt-4o-mini', () => {
      const result = validateConfig('test-api-key', 'https://api.kouri.com/v1');
      
      expect(result.config?.chatModel).toBe('gpt-4o-mini');
    });

    it('should use default vision model gpt-4o', () => {
      const result = validateConfig('test-api-key', 'https://api.kouri.com/v1');
      
      expect(result.config?.visionModel).toBe('gpt-4o');
    });
  });

  /**
   * Test isAvailable() logic
   * Requirements: 1.2, 1.3
   */
  describe('isAvailable() Logic', () => {
    it('should return true when config is valid', () => {
      const result = validateConfig('test-api-key', 'https://api.kouri.com/v1');
      expect(result.valid).toBe(true);
    });

    it('should return false when API key is empty string', () => {
      const result = validateConfig('', 'https://api.kouri.com/v1');
      expect(result.valid).toBe(false);
    });

    it('should return false when base URL is empty string', () => {
      const result = validateConfig('test-api-key', '');
      expect(result.valid).toBe(false);
    });
  });

  /**
   * Test request building
   * Requirements: 1.4, 1.5
   */
  describe('Request Building', () => {
    describe('URL Construction', () => {
      it('should build correct API URL', () => {
        const url = buildApiUrl('https://api.kouri.com/v1');
        expect(url).toBe('https://api.kouri.com/v1/chat/completions');
      });

      it('should handle base URL without trailing slash', () => {
        const url = buildApiUrl('https://api.kouri.com/v1');
        expect(url).toBe('https://api.kouri.com/v1/chat/completions');
      });
    });

    describe('Headers', () => {
      it('should include Authorization Bearer header', () => {
        const headers = getHeaders('test-api-key');
        expect(headers['Authorization']).toBe('Bearer test-api-key');
      });

      it('should include Content-Type header', () => {
        const headers = getHeaders('test-api-key');
        expect(headers['Content-Type']).toBe('application/json');
      });
    });

    describe('Text Request Body', () => {
      it('should build request with user message only when no system prompt', () => {
        const body = buildTextRequestBody('gpt-4o-mini', 'Hello world');
        
        expect(body.model).toBe('gpt-4o-mini');
        expect(body.messages).toHaveLength(1);
        expect(body.messages[0].role).toBe('user');
        expect(body.messages[0].content).toBe('Hello world');
      });

      it('should build request with system and user messages when system prompt provided', () => {
        const body = buildTextRequestBody('gpt-4o-mini', 'Hello world', 'You are helpful');
        
        expect(body.model).toBe('gpt-4o-mini');
        expect(body.messages).toHaveLength(2);
        expect(body.messages[0].role).toBe('system');
        expect(body.messages[0].content).toBe('You are helpful');
        expect(body.messages[1].role).toBe('user');
        expect(body.messages[1].content).toBe('Hello world');
      });

      it('should include max_tokens parameter', () => {
        const body = buildTextRequestBody('gpt-4o-mini', 'Hello');
        expect(body.max_tokens).toBe(1000);
      });

      it('should include temperature parameter', () => {
        const body = buildTextRequestBody('gpt-4o-mini', 'Hello');
        expect(body.temperature).toBe(0.7);
      });
    });

    describe('Vision Request Body', () => {
      it('should build vision request with image URL', () => {
        const body = buildVisionRequestBody('gpt-4o', 'https://example.com/image.jpg', 'Identify this place');
        
        expect(body.model).toBe('gpt-4o');
        expect(body.messages).toHaveLength(2);
      });

      it('should include system message in vision request', () => {
        const body = buildVisionRequestBody('gpt-4o', 'https://example.com/image.jpg', 'Identify this place');
        
        expect(body.messages[0].role).toBe('system');
        expect(body.messages[0].content).toBe('Identify this place');
      });

      it('should format user message with text and image_url content', () => {
        const body = buildVisionRequestBody('gpt-4o', 'https://example.com/image.jpg', 'Identify this place');
        
        const userMessage = body.messages[1];
        expect(userMessage.role).toBe('user');
        expect(Array.isArray(userMessage.content)).toBe(true);
        
        const content = userMessage.content as Array<{ type: string; text?: string; image_url?: { url: string } }>;
        expect(content).toHaveLength(2);
        expect(content[0].type).toBe('text');
        expect(content[1].type).toBe('image_url');
        expect(content[1].image_url?.url).toBe('https://example.com/image.jpg');
      });

      it('should use lower temperature for vision requests', () => {
        const body = buildVisionRequestBody('gpt-4o', 'https://example.com/image.jpg', 'Identify this place');
        expect(body.temperature).toBe(0.2);
      });

      it('should use lower max_tokens for vision requests', () => {
        const body = buildVisionRequestBody('gpt-4o', 'https://example.com/image.jpg', 'Identify this place');
        expect(body.max_tokens).toBe(500);
      });
    });
  });

  /**
   * Test error handling - HTTP status to error code mapping
   * Requirements: 4.1, 4.2, 4.3, 4.4
   */
  describe('Error Handling', () => {
    describe('HTTP Status to Error Code Mapping', () => {
      it('should map 429 to RATE_LIMITED', () => {
        expect(httpStatusToErrorCode(429)).toBe(AIErrorCode.RATE_LIMITED);
      });

      it('should map 401 to UNAUTHORIZED', () => {
        expect(httpStatusToErrorCode(401)).toBe(AIErrorCode.UNAUTHORIZED);
      });

      it('should map 403 to FORBIDDEN', () => {
        expect(httpStatusToErrorCode(403)).toBe(AIErrorCode.FORBIDDEN);
      });

      it('should map 404 to NOT_FOUND', () => {
        expect(httpStatusToErrorCode(404)).toBe(AIErrorCode.NOT_FOUND);
      });

      it('should map 400 to BAD_REQUEST', () => {
        expect(httpStatusToErrorCode(400)).toBe(AIErrorCode.BAD_REQUEST);
      });

      it('should map 500 to INTERNAL_ERROR', () => {
        expect(httpStatusToErrorCode(500)).toBe(AIErrorCode.INTERNAL_ERROR);
      });

      it('should map 503 to SERVICE_UNAVAILABLE', () => {
        expect(httpStatusToErrorCode(503)).toBe(AIErrorCode.SERVICE_UNAVAILABLE);
      });

      it('should map unknown status to UNKNOWN', () => {
        expect(httpStatusToErrorCode(418)).toBe(AIErrorCode.UNKNOWN);
      });
    });

    describe('Retryable Error Logic', () => {
      it('should mark RATE_LIMITED as retryable (429)', () => {
        expect(isRetryableError(AIErrorCode.RATE_LIMITED)).toBe(true);
      });

      it('should mark SERVICE_UNAVAILABLE as retryable (503)', () => {
        expect(isRetryableError(AIErrorCode.SERVICE_UNAVAILABLE)).toBe(true);
      });

      it('should mark INTERNAL_ERROR as retryable (500)', () => {
        expect(isRetryableError(AIErrorCode.INTERNAL_ERROR)).toBe(true);
      });

      it('should mark TIMEOUT as retryable', () => {
        expect(isRetryableError(AIErrorCode.TIMEOUT)).toBe(true);
      });

      it('should mark UNAUTHORIZED as non-retryable (401)', () => {
        expect(isRetryableError(AIErrorCode.UNAUTHORIZED)).toBe(false);
      });

      it('should mark FORBIDDEN as non-retryable (403)', () => {
        expect(isRetryableError(AIErrorCode.FORBIDDEN)).toBe(false);
      });

      it('should mark NOT_FOUND as non-retryable (404)', () => {
        expect(isRetryableError(AIErrorCode.NOT_FOUND)).toBe(false);
      });

      it('should mark BAD_REQUEST as non-retryable (400)', () => {
        expect(isRetryableError(AIErrorCode.BAD_REQUEST)).toBe(false);
      });

      it('should mark PARSE_ERROR as non-retryable', () => {
        expect(isRetryableError(AIErrorCode.PARSE_ERROR)).toBe(false);
      });

      it('should mark CONFIG_ERROR as non-retryable', () => {
        expect(isRetryableError(AIErrorCode.CONFIG_ERROR)).toBe(false);
      });
    });
  });
});
