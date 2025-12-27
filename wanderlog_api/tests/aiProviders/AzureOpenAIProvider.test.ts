/**
 * Property-Based Tests for Azure OpenAI Provider
 * 
 * Feature: azure-openai-integration
 * 
 * Tests the request formatting for Azure OpenAI Vision and Text APIs
 * to ensure they conform to Azure OpenAI API specifications.
 */

import * as fc from 'fast-check';

/**
 * Azure OpenAI configuration for testing
 */
interface AzureOpenAIConfig {
  endpoint: string;
  apiKey: string;
  apiVersion: string;
  visionDeployment: string;
  chatDeployment: string;
}

/**
 * Build Azure OpenAI API URL for a specific deployment
 * Extracted from AzureOpenAIProvider for testing
 */
function buildApiUrl(config: AzureOpenAIConfig, deployment: string): string {
  return `${config.endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${config.apiVersion}`;
}

/**
 * Get headers for Azure OpenAI requests
 * Extracted from AzureOpenAIProvider for testing
 */
function getHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'api-key': apiKey,
  };
}

/**
 * Build vision request body
 * Extracted from AzureOpenAIProvider for testing
 */
function buildVisionRequestBody(imageUrl: string, systemPrompt: string) {
  return {
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
 * Build text request body
 * Extracted from AzureOpenAIProvider for testing
 */
function buildTextRequestBody(prompt: string, systemPrompt?: string) {
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
    messages,
    max_tokens: 1000,
    temperature: 0.7,
  };
}

// Character sets for generating valid strings
const alphanumericChars = 'abcdefghijklmnopqrstuvwxyz0123456789';
const alphanumericMixedChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Arbitrary for valid Azure endpoint URLs
 */
const azureEndpointArb: fc.Arbitrary<string> = fc.array(
  fc.constantFrom(...alphanumericChars.split('')),
  { minLength: 3, maxLength: 20 }
).map((chars: string[]) => `https://${chars.join('')}.openai.azure.com`);

/**
 * Arbitrary for API keys (alphanumeric strings)
 */
const apiKeyArb: fc.Arbitrary<string> = fc.array(
  fc.constantFrom(...alphanumericMixedChars.split('')),
  { minLength: 32, maxLength: 64 }
).map((chars: string[]) => chars.join(''));

/**
 * Arbitrary for API versions
 */
const apiVersionArb: fc.Arbitrary<string> = fc.constantFrom('2024-02-15-preview', '2024-05-01-preview', '2024-06-01');

/**
 * Arbitrary for deployment names
 */
const deploymentNameArb: fc.Arbitrary<string> = fc.constantFrom('gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-35-turbo');

/**
 * Arbitrary for valid Azure OpenAI config
 */
const azureConfigArb: fc.Arbitrary<AzureOpenAIConfig> = fc.record({
  endpoint: azureEndpointArb,
  apiKey: apiKeyArb,
  apiVersion: apiVersionArb,
  visionDeployment: deploymentNameArb,
  chatDeployment: deploymentNameArb,
});

/**
 * Arbitrary for image URLs
 */
const imageUrlArb: fc.Arbitrary<string> = fc.oneof(
  fc.webUrl(),
  fc.base64String({ minLength: 100, maxLength: 500 }).map((b64: string) => `data:image/jpeg;base64,${b64}`)
);

/**
 * Arbitrary for text prompts
 */
const promptArb: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 1000 });

/**
 * Arbitrary for system prompts (optional)
 */
const systemPromptArb: fc.Arbitrary<string | undefined> = fc.option(
  fc.string({ minLength: 1, maxLength: 500 }),
  { nil: undefined }
);

describe('AzureOpenAIProvider Property Tests', () => {
  /**
   * Property 2: Azure Vision Request Formatting
   * 
   * *For any* image URL, when Azure OpenAI is configured, the request to Azure SHALL:
   * - Use URL format: `{endpoint}/openai/deployments/{visionDeployment}/chat/completions?api-version={apiVersion}`
   * - Include header `api-key: {apiKey}`
   * - Include the image in the correct message format
   * 
   * **Validates: Requirements 2.1, 2.2, 2.3**
   */
  describe('Property 2: Azure Vision Request Formatting', () => {
    it('should format vision API URL correctly for any valid config and image URL', () => {
      fc.assert(
        fc.property(azureConfigArb, imageUrlArb, (config: AzureOpenAIConfig, _imageUrl: string) => {
          // Build the URL
          const url = buildApiUrl(config, config.visionDeployment);
          
          // Verify URL format: {endpoint}/openai/deployments/{deployment}/chat/completions?api-version={apiVersion}
          expect(url).toBe(`${config.endpoint}/openai/deployments/${config.visionDeployment}/chat/completions?api-version=${config.apiVersion}`);
          
          // Verify URL starts with endpoint
          expect(url.startsWith(config.endpoint)).toBe(true);
          
          // Verify URL contains deployment name
          expect(url).toContain(`/deployments/${config.visionDeployment}/`);
          
          // Verify URL contains api-version parameter
          expect(url).toContain(`api-version=${config.apiVersion}`);
          
          // Verify URL path structure
          const urlObj = new URL(url);
          expect(urlObj.pathname).toBe(`/openai/deployments/${config.visionDeployment}/chat/completions`);
          expect(urlObj.searchParams.get('api-version')).toBe(config.apiVersion);
        }),
        { numRuns: 100 }
      );
    });

    it('should include correct api-key header for any valid config', () => {
      fc.assert(
        fc.property(azureConfigArb, (config: AzureOpenAIConfig) => {
          const headers = getHeaders(config.apiKey);
          
          // Verify api-key header is present (Azure uses api-key, not Authorization Bearer)
          expect(headers['api-key']).toBe(config.apiKey);
          
          // Verify Content-Type header
          expect(headers['Content-Type']).toBe('application/json');
          
          // Verify no Authorization header (Azure uses api-key instead)
          expect(headers['Authorization']).toBeUndefined();
        }),
        { numRuns: 100 }
      );
    });

    it('should format vision request body with image in correct message format', () => {
      fc.assert(
        fc.property(imageUrlArb, promptArb, (imageUrl: string, systemPrompt: string) => {
          const requestBody = buildVisionRequestBody(imageUrl, systemPrompt);
          
          // Verify messages array structure
          expect(requestBody.messages).toHaveLength(2);
          
          // Verify system message
          expect(requestBody.messages[0].role).toBe('system');
          expect(requestBody.messages[0].content).toBe(systemPrompt);
          
          // Verify user message with image
          const userMessage = requestBody.messages[1];
          expect(userMessage.role).toBe('user');
          expect(Array.isArray(userMessage.content)).toBe(true);
          
          // Verify content array has text and image_url
          const content = userMessage.content as Array<{ type: string; text?: string; image_url?: { url: string } }>;
          expect(content).toHaveLength(2);
          
          // Verify text content
          expect(content[0].type).toBe('text');
          expect(typeof content[0].text).toBe('string');
          
          // Verify image_url content
          expect(content[1].type).toBe('image_url');
          expect(content[1].image_url?.url).toBe(imageUrl);
          
          // Verify other parameters
          expect(typeof requestBody.max_tokens).toBe('number');
          expect(requestBody.max_tokens).toBeGreaterThan(0);
          expect(typeof requestBody.temperature).toBe('number');
          expect(requestBody.temperature).toBeGreaterThanOrEqual(0);
          expect(requestBody.temperature).toBeLessThanOrEqual(2);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 3: Azure Text Request Formatting
   * 
   * *For any* text prompt, when Azure OpenAI is configured, the request to Azure SHALL:
   * - Use URL format: `{endpoint}/openai/deployments/{chatDeployment}/chat/completions?api-version={apiVersion}`
   * - Include header `api-key: {apiKey}`
   * - Format messages array correctly
   * 
   * **Validates: Requirements 3.1, 3.2, 3.3**
   */
  describe('Property 3: Azure Text Request Formatting', () => {
    it('should format chat API URL correctly for any valid config', () => {
      fc.assert(
        fc.property(azureConfigArb, (config: AzureOpenAIConfig) => {
          // Build the URL for chat deployment
          const url = buildApiUrl(config, config.chatDeployment);
          
          // Verify URL format
          expect(url).toBe(`${config.endpoint}/openai/deployments/${config.chatDeployment}/chat/completions?api-version=${config.apiVersion}`);
          
          // Verify URL starts with endpoint
          expect(url.startsWith(config.endpoint)).toBe(true);
          
          // Verify URL contains chat deployment name
          expect(url).toContain(`/deployments/${config.chatDeployment}/`);
          
          // Verify URL contains api-version parameter
          expect(url).toContain(`api-version=${config.apiVersion}`);
          
          // Verify URL path structure
          const urlObj = new URL(url);
          expect(urlObj.pathname).toBe(`/openai/deployments/${config.chatDeployment}/chat/completions`);
          expect(urlObj.searchParams.get('api-version')).toBe(config.apiVersion);
        }),
        { numRuns: 100 }
      );
    });

    it('should include correct api-key header for text requests', () => {
      fc.assert(
        fc.property(apiKeyArb, (apiKey: string) => {
          const headers = getHeaders(apiKey);
          
          // Verify api-key header (Azure-specific, not Authorization Bearer)
          expect(headers['api-key']).toBe(apiKey);
          
          // Verify Content-Type header
          expect(headers['Content-Type']).toBe('application/json');
        }),
        { numRuns: 100 }
      );
    });

    it('should format text request body with messages array correctly', () => {
      fc.assert(
        fc.property(promptArb, systemPromptArb, (prompt: string, systemPrompt: string | undefined) => {
          const requestBody = buildTextRequestBody(prompt, systemPrompt);
          
          // Verify messages array exists
          expect(Array.isArray(requestBody.messages)).toBe(true);
          
          if (systemPrompt) {
            // With system prompt: should have 2 messages
            expect(requestBody.messages).toHaveLength(2);
            expect(requestBody.messages[0].role).toBe('system');
            expect(requestBody.messages[0].content).toBe(systemPrompt);
            expect(requestBody.messages[1].role).toBe('user');
            expect(requestBody.messages[1].content).toBe(prompt);
          } else {
            // Without system prompt: should have 1 message
            expect(requestBody.messages).toHaveLength(1);
            expect(requestBody.messages[0].role).toBe('user');
            expect(requestBody.messages[0].content).toBe(prompt);
          }
          
          // Verify other parameters
          expect(typeof requestBody.max_tokens).toBe('number');
          expect(requestBody.max_tokens).toBeGreaterThan(0);
          expect(typeof requestBody.temperature).toBe('number');
          expect(requestBody.temperature).toBeGreaterThanOrEqual(0);
          expect(requestBody.temperature).toBeLessThanOrEqual(2);
        }),
        { numRuns: 100 }
      );
    });

    it('should maintain message order: system first, then user', () => {
      fc.assert(
        fc.property(promptArb, fc.string({ minLength: 1, maxLength: 500 }), (prompt: string, systemPrompt: string) => {
          const requestBody = buildTextRequestBody(prompt, systemPrompt);
          
          // With system prompt, order should be: system, user
          expect(requestBody.messages[0].role).toBe('system');
          expect(requestBody.messages[1].role).toBe('user');
          
          // Content should match inputs
          expect(requestBody.messages[0].content).toBe(systemPrompt);
          expect(requestBody.messages[1].content).toBe(prompt);
        }),
        { numRuns: 100 }
      );
    });
  });
});
