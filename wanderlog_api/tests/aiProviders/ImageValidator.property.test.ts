/**
 * Property-Based Tests for Image URL Validator
 * 
 * Feature: ai-search-bugfixes
 * 
 * Property 1: Image URL Validation Excludes Invalid URLs
 * *For any* place with a coverImage URL, if the URL is empty, returns HTTP 404, or times out, 
 * the place SHALL be excluded from search results.
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
 */

import * as fc from 'fast-check';
import { validateImageUrl, clearValidationCache } from '../../src/utils/imageValidator';

// ============================================
// Test Data Generators
// ============================================

/**
 * Generate empty or whitespace-only strings
 */
const emptyStringArbitrary = fc.constantFrom('', '   ', '\t', '\n', '  \n  ');

/**
 * Generate invalid URL formats (not valid URLs)
 */
const invalidUrlFormatArbitrary = fc.oneof(
  fc.constant('not-a-url'),
  fc.constant('ftp://example.com/image.jpg'), // Wrong protocol
  fc.constant('file:///path/to/image.jpg'), // File protocol
  fc.constant('javascript:alert(1)'), // JavaScript protocol
  fc.constant('data:image/png;base64,abc'), // Data URL (not HTTP)
  fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes('://')), // Random strings without protocol
);

/**
 * Generate valid HTTP/HTTPS URL formats (syntactically valid)
 */
const validUrlFormatArbitrary = fc.oneof(
  fc.constant('https://example.com/image.jpg'),
  fc.constant('http://example.com/photo.png'),
  fc.constant('https://cdn.example.org/assets/img.webp'),
  fc.webUrl().filter(url => url.startsWith('http://') || url.startsWith('https://')),
);

// ============================================
// Property Tests
// ============================================

describe('ImageValidator Property-Based Tests', () => {
  beforeEach(() => {
    // Clear cache before each test to ensure consistent results
    clearValidationCache();
  });

  /**
   * Feature: ai-search-bugfixes, Property 1: Image URL Validation Excludes Invalid URLs
   * 
   * *For any* place with a coverImage URL, if the URL is empty, returns HTTP 404, or times out, 
   * the place SHALL be excluded from search results.
   * 
   * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
   */
  describe('Property 1: Image URL Validation Excludes Invalid URLs', () => {
    /**
     * Property 1.1: Empty URLs are invalid
     * 
     * WHEN a place has an empty coverImage field, 
     * THE Search_V2_Controller SHALL exclude it from results
     * 
     * **Validates: Requirements 1.1**
     */
    it('should mark empty URLs as invalid with reason "empty"', async () => {
      await fc.assert(
        fc.asyncProperty(
          emptyStringArbitrary,
          async (emptyUrl: string) => {
            const result = await validateImageUrl(emptyUrl);
            
            return (
              result.isValid === false &&
              result.reason === 'empty'
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 1.2: Invalid URL formats are rejected
     * 
     * WHEN a place has a coverImage URL with invalid format (non-HTTP/HTTPS),
     * THE Search_V2_Controller SHALL exclude it from results
     * 
     * **Validates: Requirements 1.1**
     */
    it('should mark invalid URL formats as invalid with reason "invalid_url"', async () => {
      await fc.assert(
        fc.asyncProperty(
          invalidUrlFormatArbitrary,
          async (invalidUrl: string) => {
            const result = await validateImageUrl(invalidUrl);
            
            return (
              result.isValid === false &&
              result.reason === 'invalid_url'
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 1.3: Null and undefined are treated as empty
     * 
     * WHEN a place has null or undefined coverImage,
     * THE Search_V2_Controller SHALL exclude it from results
     * 
     * **Validates: Requirements 1.1**
     */
    it('should mark null/undefined URLs as invalid with reason "empty"', async () => {
      const resultNull = await validateImageUrl(null as unknown as string);
      const resultUndefined = await validateImageUrl(undefined as unknown as string);
      
      expect(resultNull.isValid).toBe(false);
      expect(resultNull.reason).toBe('empty');
      expect(resultUndefined.isValid).toBe(false);
      expect(resultUndefined.reason).toBe('empty');
    });

    /**
     * Property 1.4: Valid URL format returns consistent structure
     * 
     * *For any* syntactically valid HTTP/HTTPS URL, the validation result
     * SHALL have a consistent structure with isValid boolean and optional reason/statusCode
     * 
     * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
     */
    it('should return consistent result structure for valid URL formats', async () => {
      await fc.assert(
        fc.asyncProperty(
          validUrlFormatArbitrary,
          async (url: string) => {
            const result = await validateImageUrl(url, 1000); // Short timeout for test speed
            
            // Result should have isValid boolean
            if (typeof result.isValid !== 'boolean') return false;
            
            // If invalid, should have a reason
            if (!result.isValid) {
              const validReasons = ['empty', 'invalid_url', 'http_error', 'timeout', 'network_error'];
              if (!result.reason || !validReasons.includes(result.reason)) return false;
            }
            
            // If has statusCode, it should be a number
            if (result.statusCode !== undefined && typeof result.statusCode !== 'number') {
              return false;
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 1.5: Validation results are deterministic for same input
     * 
     * *For any* URL, calling validateImageUrl twice with the same URL
     * SHALL return the same result (due to caching)
     * 
     * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
     */
    it('should return deterministic results for same URL (caching)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(emptyStringArbitrary, invalidUrlFormatArbitrary),
          async (url: string) => {
            clearValidationCache(); // Clear cache first
            
            const result1 = await validateImageUrl(url);
            const result2 = await validateImageUrl(url);
            
            return (
              result1.isValid === result2.isValid &&
              result1.reason === result2.reason
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 1.6: URL trimming is applied
     * 
     * *For any* URL with leading/trailing whitespace,
     * the validation SHALL treat it the same as the trimmed version
     * 
     * **Validates: Requirements 1.1**
     */
    it('should trim URLs before validation', async () => {
      await fc.assert(
        fc.asyncProperty(
          invalidUrlFormatArbitrary,
          async (url: string) => {
            clearValidationCache();
            
            const paddedUrl = `  ${url}  `;
            const resultPadded = await validateImageUrl(paddedUrl);
            
            clearValidationCache();
            const resultTrimmed = await validateImageUrl(url.trim());
            
            // Both should have same validation result
            return (
              resultPadded.isValid === resultTrimmed.isValid &&
              resultPadded.reason === resultTrimmed.reason
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 1.7: Invalid results always have a reason
     * 
     * *For any* URL that is marked as invalid,
     * the result SHALL include a reason explaining why
     * 
     * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
     */
    it('should always provide a reason for invalid URLs', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(emptyStringArbitrary, invalidUrlFormatArbitrary),
          async (url: string) => {
            const result = await validateImageUrl(url);
            
            if (!result.isValid) {
              // Invalid results must have a reason
              const validReasons = ['empty', 'invalid_url', 'http_error', 'timeout', 'network_error'];
              return result.reason !== undefined && validReasons.includes(result.reason);
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 1.8: HTTP error or network error results in invalid
     * 
     * *For any* URL that returns an HTTP error or network error,
     * the result SHALL be marked as invalid with appropriate reason
     * 
     * Note: External services may return network_error in test environments
     * 
     * **Validates: Requirements 1.2**
     */
    it('should mark HTTP errors or network errors as invalid', async () => {
      // Test with a URL that is likely to return 404 or network error
      const result = await validateImageUrl('https://httpstat.us/404', 5000);
      
      // Should be invalid with either http_error or network_error reason
      expect(result.isValid).toBe(false);
      expect(['http_error', 'network_error', 'timeout']).toContain(result.reason);
      
      // If it's an http_error, it should have a status code
      if (result.reason === 'http_error') {
        expect(result.statusCode).toBe(404);
      }
    });

    /**
     * Property 1.9: Timeout handling
     * 
     * WHEN a place has a coverImage URL that times out (>5 seconds), 
     * THE Search_V2_Controller SHALL exclude it from results
     * 
     * Note: This test uses a very short timeout to simulate timeout behavior
     * 
     * **Validates: Requirements 1.3**
     */
    it('should handle timeout with reason "timeout"', async () => {
      // Use httpstat.us delay endpoint with a very short timeout
      const result = await validateImageUrl('https://httpstat.us/200?sleep=5000', 100);
      
      // Should timeout with our 100ms limit
      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('timeout');
    });
  });
});
