/**
 * Property-Based Tests for Wikidata Retry Handler
 * 
 * Feature: wikidata-import
 * 
 * Property 13: Retry Behavior on API Failure
 * *For any* Wikidata API call that fails, the system should retry up to 3 times 
 * with exponential backoff before giving up.
 * 
 * **Validates: Requirements 8.2**
 */

import * as fc from 'fast-check';
import { RetryHandler } from '../../src/services/wikidataImportUtils';

// ============================================
// Test Data Generators
// ============================================

/**
 * Generator for error messages
 */
const errorMessageArbitrary: fc.Arbitrary<string> = fc.string({ minLength: 5, maxLength: 50 })
  .map(s => `Error: ${s}`);

// ============================================
// Helper Functions
// ============================================

/**
 * Create a mock operation that fails a specified number of times before succeeding
 */
function createMockOperation<T>(
  failuresBeforeSuccess: number,
  successValue: T,
  errorMessage: string = 'Mock error'
): { operation: () => Promise<T>; callCount: () => number } {
  let calls = 0;
  
  const operation = async (): Promise<T> => {
    calls++;
    if (calls <= failuresBeforeSuccess) {
      throw new Error(errorMessage);
    }
    return successValue;
  };
  
  return {
    operation,
    callCount: () => calls,
  };
}

/**
 * Create a mock operation that always fails
 */
function createAlwaysFailingOperation(
  errorMessage: string = 'Always fails'
): { operation: () => Promise<never>; callCount: () => number } {
  let calls = 0;
  
  const operation = async (): Promise<never> => {
    calls++;
    throw new Error(errorMessage);
  };
  
  return {
    operation,
    callCount: () => calls,
  };
}

// ============================================
// Property 13: Retry Behavior on API Failure
// ============================================

describe('Wikidata Retry Handler - Property Tests', () => {
  
  /**
   * Feature: wikidata-import, Property 13: Retry Behavior on API Failure
   * 
   * *For any* Wikidata API call that fails, the system should retry up to 3 times 
   * with exponential backoff before giving up.
   * 
   * **Validates: Requirements 8.2**
   */
  describe('Property 13: Retry Behavior on API Failure', () => {
    
    /**
     * Default retry handler should retry exactly 3 times (4 total attempts)
     */
    it('should retry up to 3 times with default settings', async () => {
      const handler = new RetryHandler({
        maxRetries: 3,
        initialDelayMs: 1, // Use 1ms for fast tests
        backoffMultiplier: 2,
      });
      
      const { operation, callCount } = createAlwaysFailingOperation('Test error');
      
      const result = await handler.execute(operation, 'test');
      
      // Should have made 4 attempts (1 initial + 3 retries)
      expect(callCount()).toBe(4);
      expect(result.success).toBe(false);
      expect(result.attempts).toBe(4);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('Test error');
    });

    /**
     * For any maxRetries value, total attempts should be maxRetries + 1
     */
    it('should make exactly maxRetries + 1 attempts when always failing', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          async (maxRetries: number) => {
            const handler = new RetryHandler({
              maxRetries,
              initialDelayMs: 1, // Fast tests
              backoffMultiplier: 2,
            });
            
            const { operation, callCount } = createAlwaysFailingOperation();
            
            const result = await handler.execute(operation, 'test');
            
            // Total attempts = 1 initial + maxRetries
            const expectedAttempts = 1 + maxRetries;
            return callCount() === expectedAttempts && 
                   result.attempts === expectedAttempts &&
                   result.success === false;
          }
        ),
        { numRuns: 20 } // Reduced runs since async tests are slower
      );
    });

    /**
     * Should succeed immediately if operation succeeds on first try
     */
    it('should succeed immediately without retries if operation succeeds', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          async (maxRetries: number, successValue: string) => {
            const handler = new RetryHandler({
              maxRetries,
              initialDelayMs: 1,
              backoffMultiplier: 2,
            });
            
            const { operation, callCount } = createMockOperation(0, successValue);
            
            const result = await handler.execute(operation, 'test');
            
            return callCount() === 1 && 
                   result.success === true &&
                   result.value === successValue &&
                   result.attempts === 1;
          }
        ),
        { numRuns: 20 }
      );
    });

    /**
     * Should succeed after retries if operation eventually succeeds
     */
    it('should succeed after retries if operation eventually succeeds', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 3 }),
          fc.integer({ min: 1, max: 3 }),
          async (maxRetries: number, failuresBeforeSuccess: number) => {
            // Only test cases where success is possible
            if (failuresBeforeSuccess > maxRetries) {
              return true; // Skip this case
            }
            
            const handler = new RetryHandler({
              maxRetries,
              initialDelayMs: 1,
              backoffMultiplier: 2,
            });
            
            const successValue = 'success';
            const { operation, callCount } = createMockOperation(failuresBeforeSuccess, successValue);
            
            const result = await handler.execute(operation, 'test');
            
            // Should succeed after failuresBeforeSuccess + 1 attempts
            const expectedAttempts = failuresBeforeSuccess + 1;
            return callCount() === expectedAttempts && 
                   result.success === true &&
                   result.value === successValue &&
                   result.attempts === expectedAttempts;
          }
        ),
        { numRuns: 20 }
      );
    });

    /**
     * Should fail if operation fails more times than maxRetries allows
     */
    it('should fail if operation fails more times than maxRetries allows', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 3 }),
          async (maxRetries: number) => {
            const handler = new RetryHandler({
              maxRetries,
              initialDelayMs: 1,
              backoffMultiplier: 2,
            });
            
            // Fail more times than allowed
            const failuresBeforeSuccess = maxRetries + 2;
            const { operation, callCount } = createMockOperation(failuresBeforeSuccess, 'success');
            
            const result = await handler.execute(operation, 'test');
            
            // Should have exhausted all attempts
            const expectedAttempts = 1 + maxRetries;
            return callCount() === expectedAttempts && 
                   result.success === false &&
                   result.attempts === expectedAttempts;
          }
        ),
        { numRuns: 20 }
      );
    });

    /**
     * Exponential backoff should calculate correct delays
     */
    it('should calculate exponential backoff delays correctly', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 2000 }),
          fc.double({ min: 1.5, max: 3, noNaN: true }),
          fc.integer({ min: 1, max: 5 }),
          (initialDelayMs: number, backoffMultiplier: number, attempt: number) => {
            const handler = new RetryHandler({
              maxRetries: 3,
              initialDelayMs,
              backoffMultiplier,
            });
            
            const expectedDelay = initialDelayMs * Math.pow(backoffMultiplier, attempt - 1);
            const actualDelay = handler.calculateDelay(attempt);
            
            // Allow small floating point differences
            return Math.abs(actualDelay - expectedDelay) < 0.001;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Default exponential backoff should be 1s, 2s, 4s
     */
    it('should use default exponential backoff of 1s, 2s, 4s', () => {
      const handler = new RetryHandler({
        maxRetries: 3,
        initialDelayMs: 1000,
        backoffMultiplier: 2,
      });
      
      expect(handler.calculateDelay(1)).toBe(1000);  // 1s
      expect(handler.calculateDelay(2)).toBe(2000);  // 2s
      expect(handler.calculateDelay(3)).toBe(4000);  // 4s
    });

    /**
     * onRetry callback should be called for each retry
     */
    it('should call onRetry callback for each retry attempt', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 3 }),
          async (maxRetries: number) => {
            const retryCalls: Array<{ attempt: number; delayMs: number }> = [];
            
            const handler = new RetryHandler({
              maxRetries,
              initialDelayMs: 1,
              backoffMultiplier: 2,
              onRetry: (attempt, _error, delayMs) => {
                retryCalls.push({ attempt, delayMs });
              },
            });
            
            const { operation } = createAlwaysFailingOperation();
            
            await handler.execute(operation, 'test');
            
            // Should have called onRetry for each retry (not the initial attempt)
            // Retries happen after attempts 1, 2, ..., maxRetries (before the final attempt)
            return retryCalls.length === maxRetries;
          }
        ),
        { numRuns: 20 }
      );
    });

    /**
     * Retry history should record all retry attempts
     */
    it('should record retry attempts in history', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 3 }),
          async (maxRetries: number) => {
            const handler = new RetryHandler({
              maxRetries,
              initialDelayMs: 1,
              backoffMultiplier: 2,
            });
            
            const { operation } = createAlwaysFailingOperation('Test error');
            
            await handler.execute(operation, 'test');
            
            const history = handler.getRetryHistory();
            
            // Should have recorded maxRetries retry attempts
            return history.length === maxRetries &&
                   history.every(h => h.error.message === 'Test error');
          }
        ),
        { numRuns: 20 }
      );
    });

    /**
     * Result should include total time spent
     */
    it('should track total time spent including delays', async () => {
      const handler = new RetryHandler({
        maxRetries: 2,
        initialDelayMs: 10, // 10ms delays for measurable but fast tests
        backoffMultiplier: 2,
      });
      
      const { operation } = createAlwaysFailingOperation();
      
      const result = await handler.execute(operation, 'test');
      
      // Should have spent at least the delay time (10ms + 20ms = 30ms)
      // Allow some tolerance for execution time
      expect(result.totalTimeMs).toBeGreaterThanOrEqual(25);
    });

    /**
     * forWikidataAPI factory should create handler with correct defaults
     */
    it('should create handler with correct defaults for Wikidata API', () => {
      const handler = RetryHandler.forWikidataAPI();
      
      expect(handler.getMaxRetries()).toBe(3);
      expect(handler.getInitialDelayMs()).toBe(1000);
      expect(handler.getBackoffMultiplier()).toBe(2);
    });

    /**
     * clearHistory should clear the retry history
     */
    it('should clear retry history when clearHistory is called', async () => {
      const handler = new RetryHandler({
        maxRetries: 2,
        initialDelayMs: 1,
        backoffMultiplier: 2,
      });
      
      const { operation } = createAlwaysFailingOperation();
      
      await handler.execute(operation, 'test');
      
      expect(handler.getRetryHistory().length).toBeGreaterThan(0);
      
      handler.clearHistory();
      
      expect(handler.getRetryHistory().length).toBe(0);
    });

    /**
     * Error should be preserved in result when all retries fail
     */
    it('should preserve the last error in result when all retries fail', async () => {
      await fc.assert(
        fc.asyncProperty(
          errorMessageArbitrary,
          async (errorMessage: string) => {
            const handler = new RetryHandler({
              maxRetries: 2,
              initialDelayMs: 1,
              backoffMultiplier: 2,
            });
            
            const { operation } = createAlwaysFailingOperation(errorMessage);
            
            const result = await handler.execute(operation, 'test');
            
            return result.success === false &&
                   result.error !== undefined &&
                   result.error.message === errorMessage;
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
