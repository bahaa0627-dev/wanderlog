/**
 * Property-Based Tests for Kouri OpenAI Proxy Provider
 * 
 * Feature: kouri-openai-proxy, Property 2: Error Code Mapping
 * 
 * Tests that HTTP error status codes are correctly mapped to AIErrorCode
 * with appropriate retryable flags.
 * 
 * **Validates: Requirements 3.3, 4.1, 4.2, 4.3**
 */

import * as fc from 'fast-check';
import { AIErrorCode, httpStatusToErrorCode, isRetryableError } from '../../src/services/aiProviders/types';

/**
 * Define the expected mapping from HTTP status codes to error codes and retryable flags
 * Based on design document error handling specification
 */
const RETRYABLE_STATUS_CODES = [429, 503, 500];
const NON_RETRYABLE_STATUS_CODES = [401, 403, 404, 400];

const STATUS_TO_ERROR_CODE_MAP: Record<number, AIErrorCode> = {
  429: AIErrorCode.RATE_LIMITED,
  503: AIErrorCode.SERVICE_UNAVAILABLE,
  500: AIErrorCode.INTERNAL_ERROR,
  401: AIErrorCode.UNAUTHORIZED,
  403: AIErrorCode.FORBIDDEN,
  404: AIErrorCode.NOT_FOUND,
  400: AIErrorCode.BAD_REQUEST,
};

const RETRYABLE_ERROR_CODES = [
  AIErrorCode.RATE_LIMITED,
  AIErrorCode.SERVICE_UNAVAILABLE,
  AIErrorCode.INTERNAL_ERROR,
  AIErrorCode.TIMEOUT,
];

describe('KouriProvider Property-Based Tests', () => {
  /**
   * Feature: kouri-openai-proxy, Property 2: Error Code Mapping
   * 
   * *For any* HTTP error status code returned by the API, the provider SHALL map it 
   * to the correct AIErrorCode with appropriate retryable flag 
   * (429, 503, 500 → retryable; 401, 403, 404, 400 → non-retryable).
   * 
   * **Validates: Requirements 3.3, 4.1, 4.2, 4.3**
   */
  describe('Property 2: Error Code Mapping', () => {
    /**
     * Property: For any retryable HTTP status code (429, 503, 500),
     * the mapped error code should be marked as retryable
     */
    it('should map retryable HTTP status codes to retryable error codes', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...RETRYABLE_STATUS_CODES),
          (statusCode: number) => {
            const errorCode = httpStatusToErrorCode(statusCode);
            const isRetryable = isRetryableError(errorCode);
            
            // The error code should be retryable
            return isRetryable === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: For any non-retryable HTTP status code (401, 403, 404, 400),
     * the mapped error code should NOT be marked as retryable
     */
    it('should map non-retryable HTTP status codes to non-retryable error codes', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...NON_RETRYABLE_STATUS_CODES),
          (statusCode: number) => {
            const errorCode = httpStatusToErrorCode(statusCode);
            const isRetryable = isRetryableError(errorCode);
            
            // The error code should NOT be retryable
            return isRetryable === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: For any known HTTP status code, the mapping should be deterministic
     * (same input always produces same output)
     */
    it('should produce deterministic error code mapping for known status codes', () => {
      const knownStatusCodes = [...RETRYABLE_STATUS_CODES, ...NON_RETRYABLE_STATUS_CODES];
      
      fc.assert(
        fc.property(
          fc.constantFrom(...knownStatusCodes),
          (statusCode: number) => {
            const expectedErrorCode = STATUS_TO_ERROR_CODE_MAP[statusCode];
            const actualErrorCode = httpStatusToErrorCode(statusCode);
            
            // The mapping should match the expected value
            return actualErrorCode === expectedErrorCode;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: For any unknown HTTP status code (not in the defined mapping),
     * the function should return UNKNOWN error code
     */
    it('should map unknown HTTP status codes to UNKNOWN error code', () => {
      const knownStatusCodes = new Set([...RETRYABLE_STATUS_CODES, ...NON_RETRYABLE_STATUS_CODES]);
      
      fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 599 }).filter(code => !knownStatusCodes.has(code)),
          (statusCode: number) => {
            const errorCode = httpStatusToErrorCode(statusCode);
            
            // Unknown status codes should map to UNKNOWN
            return errorCode === AIErrorCode.UNKNOWN;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: The retryable error codes set should be consistent
     * (RATE_LIMITED, SERVICE_UNAVAILABLE, INTERNAL_ERROR, TIMEOUT are retryable)
     */
    it('should correctly identify all retryable error codes', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...RETRYABLE_ERROR_CODES),
          (errorCode: AIErrorCode) => {
            return isRetryableError(errorCode) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Non-retryable error codes should consistently return false
     */
    it('should correctly identify all non-retryable error codes', () => {
      const nonRetryableErrorCodes = [
        AIErrorCode.UNAUTHORIZED,
        AIErrorCode.FORBIDDEN,
        AIErrorCode.NOT_FOUND,
        AIErrorCode.BAD_REQUEST,
        AIErrorCode.PARSE_ERROR,
        AIErrorCode.CONFIG_ERROR,
        AIErrorCode.UNKNOWN,
      ];
      
      fc.assert(
        fc.property(
          fc.constantFrom(...nonRetryableErrorCodes),
          (errorCode: AIErrorCode) => {
            return isRetryableError(errorCode) === false;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
