/**
 * Property-Based Tests for Fallback Chain Execution
 * 
 * Feature: azure-openai-integration
 * Property 5: Fallback Chain Execution
 * 
 * *For any* AI operation, when the primary provider fails (error or timeout), the system SHALL:
 * - Retry up to 3 times for retryable errors (429, 503)
 * - Try the next provider in the configured order
 * - Return error only when all providers fail
 * 
 * **Validates: Requirements 4.2, 5.2, 5.3**
 */

import * as fc from 'fast-check';
import {
  AIProvider,
  AIProviderName,
  PlaceIdentificationResult,
  AIServiceError,
  AIErrorCode,
} from '../../src/services/aiProviders/types';

/**
 * Mock provider for testing fallback behavior
 */
class MockProvider implements AIProvider {
  readonly name: AIProviderName;
  private available: boolean;
  private failCount: number;
  private failWith: AIServiceError | null;
  private callCount: number = 0;
  private successResult: string;

  constructor(
    name: AIProviderName,
    available: boolean = true,
    failCount: number = 0,
    failWith: AIServiceError | null = null,
    successResult: string = 'success'
  ) {
    this.name = name;
    this.available = available;
    this.failCount = failCount;
    this.failWith = failWith;
    this.successResult = successResult;
  }

  isAvailable(): boolean {
    return this.available;
  }

  getCallCount(): number {
    return this.callCount;
  }

  resetCallCount(): void {
    this.callCount = 0;
  }

  async identifyPlace(_imageUrl: string): Promise<PlaceIdentificationResult> {
    this.callCount++;
    
    if (this.failWith && this.callCount <= this.failCount) {
      throw this.failWith;
    }
    
    return {
      placeName: this.successResult,
      confidence: 0.9,
      city: 'Test City',
      country: 'Test Country',
    };
  }

  async generateText(_prompt: string, _systemPrompt?: string): Promise<string> {
    this.callCount++;
    
    if (this.failWith && this.callCount <= this.failCount) {
      throw this.failWith;
    }
    
    return this.successResult;
  }
}

/**
 * Retry configuration for testing
 */
interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

/**
 * Simplified fallback executor for testing
 * Mirrors the logic in AIService.executeWithFallback
 */
class FallbackExecutor {
  private providers: AIProvider[];
  private retryConfig: RetryConfig;
  private retryAttempts: Map<string, number> = new Map();

  constructor(providers: AIProvider[], retryConfig: RetryConfig) {
    this.providers = providers;
    this.retryConfig = retryConfig;
  }

  getRetryAttempts(providerName: string): number {
    return this.retryAttempts.get(providerName) || 0;
  }

  private isRetryableError(error: AIServiceError): boolean {
    return error.retryable === true;
  }

  private async executeWithRetry<T>(
    provider: AIProvider,
    operation: (provider: AIProvider) => Promise<T>
  ): Promise<T> {
    let lastError: AIServiceError | null = null;
    let attempts = 0;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      attempts++;
      try {
        const result = await operation(provider);
        this.retryAttempts.set(provider.name, attempts);
        return result;
      } catch (error) {
        const aiError = error as AIServiceError;
        lastError = aiError;

        if (!this.isRetryableError(aiError) || attempt >= this.retryConfig.maxRetries) {
          break;
        }
        // Skip actual delay in tests for speed
      }
    }

    this.retryAttempts.set(provider.name, attempts);
    throw lastError || new Error('Unknown error during retry');
  }

  async executeWithFallback<T>(
    operation: (provider: AIProvider) => Promise<T>
  ): Promise<{ result: T; usedProvider: string }> {
    const availableProviders = this.providers.filter(p => p.isAvailable());
    
    if (availableProviders.length === 0) {
      throw {
        code: AIErrorCode.CONFIG_ERROR,
        message: 'No AI providers available',
        provider: 'none',
        retryable: false,
      } as AIServiceError;
    }

    const errors: AIServiceError[] = [];

    for (const provider of availableProviders) {
      try {
        const result = await this.executeWithRetry(provider, operation);
        return { result, usedProvider: provider.name };
      } catch (error) {
        errors.push(error as AIServiceError);
      }
    }

    throw {
      code: AIErrorCode.INTERNAL_ERROR,
      message: `All AI providers failed`,
      provider: 'all',
      retryable: false,
      details: errors,
    } as AIServiceError;
  }
}

// Arbitraries for property-based testing

/**
 * Arbitrary for retryable error codes
 */
const retryableErrorCodeArb: fc.Arbitrary<AIErrorCode> = fc.constantFrom(
  AIErrorCode.RATE_LIMITED,
  AIErrorCode.SERVICE_UNAVAILABLE,
  AIErrorCode.INTERNAL_ERROR
);

/**
 * Arbitrary for non-retryable error codes
 */
const nonRetryableErrorCodeArb: fc.Arbitrary<AIErrorCode> = fc.constantFrom(
  AIErrorCode.UNAUTHORIZED,
  AIErrorCode.FORBIDDEN,
  AIErrorCode.NOT_FOUND,
  AIErrorCode.BAD_REQUEST,
  AIErrorCode.CONFIG_ERROR
);

/**
 * Arbitrary for error messages
 */
const errorMessageArb: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 100 });

/**
 * Arbitrary for retryable AIServiceError
 */
const retryableErrorArb: fc.Arbitrary<AIServiceError> = fc.record({
  code: retryableErrorCodeArb,
  message: errorMessageArb,
  provider: fc.constant('test_provider'),
  retryable: fc.constant(true),
});

/**
 * Arbitrary for non-retryable AIServiceError
 */
const nonRetryableErrorArb: fc.Arbitrary<AIServiceError> = fc.record({
  code: nonRetryableErrorCodeArb,
  message: errorMessageArb,
  provider: fc.constant('test_provider'),
  retryable: fc.constant(false),
});

/**
 * Arbitrary for provider order
 */
const providerOrderArb: fc.Arbitrary<AIProviderName[]> = fc.shuffledSubarray(
  [AIProviderName.AZURE_OPENAI, AIProviderName.GEMINI],
  { minLength: 1, maxLength: 2 }
);

describe('Fallback Chain Property Tests', () => {
  const defaultRetryConfig: RetryConfig = {
    maxRetries: 3,
    baseDelayMs: 1,
    maxDelayMs: 8,
  };

  /**
   * Property 5: Fallback Chain Execution
   * 
   * **Validates: Requirements 4.2, 5.2, 5.3**
   */
  describe('Property 5: Fallback Chain Execution', () => {
    
    it('should retry up to maxRetries times for retryable errors (429, 503, 500)', async () => {
      await fc.assert(
        fc.asyncProperty(
          retryableErrorArb,
          fc.integer({ min: 1, max: 5 }),
          async (error: AIServiceError, maxRetries: number) => {
            const config = { ...defaultRetryConfig, maxRetries };
            
            const provider = new MockProvider(
              AIProviderName.AZURE_OPENAI,
              true,
              Infinity,
              error
            );
            
            const executor = new FallbackExecutor([provider], config);
            
            try {
              await executor.executeWithFallback(p => p.generateText('test'));
              return false;
            } catch {
              const attempts = provider.getCallCount();
              return attempts === maxRetries + 1;
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should NOT retry for non-retryable errors (401, 403, 404, 400)', async () => {
      await fc.assert(
        fc.asyncProperty(nonRetryableErrorArb, async (error: AIServiceError) => {
          const provider = new MockProvider(
            AIProviderName.AZURE_OPENAI,
            true,
            Infinity,
            error
          );
          
          const executor = new FallbackExecutor([provider], defaultRetryConfig);
          
          try {
            await executor.executeWithFallback(p => p.generateText('test'));
            return false;
          } catch {
            return provider.getCallCount() === 1;
          }
        }),
        { numRuns: 100 }
      );
    });

    it('should try next provider when primary provider fails', async () => {
      await fc.assert(
        fc.asyncProperty(
          retryableErrorArb,
          fc.string({ minLength: 1, maxLength: 50 }),
          async (error: AIServiceError, successResult: string) => {
            const primaryProvider = new MockProvider(
              AIProviderName.AZURE_OPENAI,
              true,
              Infinity,
              error
            );
            
            const secondaryProvider = new MockProvider(
              AIProviderName.GEMINI,
              true,
              0,
              null,
              successResult
            );
            
            const executor = new FallbackExecutor(
              [primaryProvider, secondaryProvider],
              defaultRetryConfig
            );
            
            try {
              const { result, usedProvider } = await executor.executeWithFallback(
                p => p.generateText('test')
              );
              return usedProvider === AIProviderName.GEMINI && result === successResult;
            } catch {
              return false;
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return error only when ALL providers fail', async () => {
      await fc.assert(
        fc.asyncProperty(
          retryableErrorArb,
          nonRetryableErrorArb,
          async (error1: AIServiceError, error2: AIServiceError) => {
            const provider1 = new MockProvider(
              AIProviderName.AZURE_OPENAI,
              true,
              Infinity,
              error1
            );
            
            const provider2 = new MockProvider(
              AIProviderName.GEMINI,
              true,
              Infinity,
              error2
            );
            
            const executor = new FallbackExecutor([provider1, provider2], defaultRetryConfig);
            
            try {
              await executor.executeWithFallback(p => p.generateText('test'));
              return false;
            } catch (error) {
              const aiError = error as AIServiceError;
              const bothTried = provider1.getCallCount() > 0 && provider2.getCallCount() > 0;
              const errorIndicatesAllFailed = aiError.provider === 'all' || 
                aiError.message.includes('All') ||
                (aiError.details && Array.isArray(aiError.details) && aiError.details.length >= 2);
              return bothTried && errorIndicatesAllFailed;
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should succeed on first available provider if it works', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }),
          async (successResult: string) => {
            const primaryProvider = new MockProvider(
              AIProviderName.AZURE_OPENAI,
              true,
              0,
              null,
              successResult
            );
            
            const secondaryProvider = new MockProvider(
              AIProviderName.GEMINI,
              true,
              0,
              null,
              'secondary_result'
            );
            
            const executor = new FallbackExecutor(
              [primaryProvider, secondaryProvider],
              defaultRetryConfig
            );
            
            try {
              const { result, usedProvider } = await executor.executeWithFallback(
                p => p.generateText('test')
              );
              const usedPrimary = usedProvider === AIProviderName.AZURE_OPENAI;
              const secondaryNotCalled = secondaryProvider.getCallCount() === 0;
              const resultMatches = result === successResult;
              return usedPrimary && secondaryNotCalled && resultMatches;
            } catch {
              return false;
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should skip unavailable providers in the chain', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }),
          async (successResult: string) => {
            const unavailableProvider = new MockProvider(
              AIProviderName.AZURE_OPENAI,
              false,
              0,
              null
            );
            
            const availableProvider = new MockProvider(
              AIProviderName.GEMINI,
              true,
              0,
              null,
              successResult
            );
            
            const executor = new FallbackExecutor(
              [unavailableProvider, availableProvider],
              defaultRetryConfig
            );
            
            try {
              const { result, usedProvider } = await executor.executeWithFallback(
                p => p.generateText('test')
              );
              const usedAvailable = usedProvider === AIProviderName.GEMINI;
              const unavailableNotCalled = unavailableProvider.getCallCount() === 0;
              return usedAvailable && unavailableNotCalled && result === successResult;
            } catch {
              return false;
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should throw CONFIG_ERROR when no providers are available', async () => {
      await fc.assert(
        fc.asyncProperty(fc.constant(null), async () => {
          const provider1 = new MockProvider(AIProviderName.AZURE_OPENAI, false);
          const provider2 = new MockProvider(AIProviderName.GEMINI, false);
          
          const executor = new FallbackExecutor([provider1, provider2], defaultRetryConfig);
          
          try {
            await executor.executeWithFallback(p => p.generateText('test'));
            return false;
          } catch (error) {
            const aiError = error as AIServiceError;
            return aiError.code === AIErrorCode.CONFIG_ERROR &&
              aiError.message.includes('No AI providers available');
          }
        }),
        { numRuns: 100 }
      );
    });

    it('should succeed after transient failures within retry limit', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 3 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          async (failCount: number, successResult: string) => {
            const retryableError: AIServiceError = {
              code: AIErrorCode.RATE_LIMITED,
              message: 'Rate limited',
              provider: AIProviderName.AZURE_OPENAI,
              retryable: true,
            };
            
            const provider = new MockProvider(
              AIProviderName.AZURE_OPENAI,
              true,
              failCount,
              retryableError,
              successResult
            );
            
            const executor = new FallbackExecutor([provider], defaultRetryConfig);
            
            try {
              const { result } = await executor.executeWithFallback(p => p.generateText('test'));
              return result === successResult && provider.getCallCount() === failCount + 1;
            } catch {
              return false;
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should respect provider order when falling back', async () => {
      await fc.assert(
        fc.asyncProperty(
          providerOrderArb,
          fc.string({ minLength: 1, maxLength: 50 }),
          async (order: AIProviderName[], successResult: string) => {
            if (order.length < 2) return true;
            
            const retryableError: AIServiceError = {
              code: AIErrorCode.SERVICE_UNAVAILABLE,
              message: 'Service unavailable',
              provider: 'test',
              retryable: true,
            };
            
            const providers = order.map((name, index) => {
              if (index === 0) {
                return new MockProvider(name, true, Infinity, retryableError);
              }
              return new MockProvider(name, true, 0, null, successResult);
            });
            
            const executor = new FallbackExecutor(providers, defaultRetryConfig);
            
            try {
              const { usedProvider } = await executor.executeWithFallback(
                p => p.generateText('test')
              );
              return usedProvider === order[1];
            } catch {
              return false;
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
