/**
 * Image URL Validator Utility
 * 
 * Validates image URLs by performing HTTP HEAD requests to check accessibility.
 * Used to filter out places with invalid/inaccessible images from search results.
 */

import { logger } from './logger';

export interface ImageValidationResult {
  isValid: boolean;
  reason?: 'empty' | 'invalid_url' | 'http_error' | 'timeout' | 'network_error';
  statusCode?: number;
}

// Cache for validation results to avoid repeated checks
const validationCache = new Map<string, { result: ImageValidationResult; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache TTL

/**
 * Validates an image URL by performing an HTTP HEAD request
 * @param url The image URL to validate
 * @param timeoutMs Timeout in milliseconds (default: 5000)
 * @returns Validation result with isValid flag and reason for failure
 */
export async function validateImageUrl(
  url: string,
  timeoutMs: number = 5000
): Promise<ImageValidationResult> {
  // Check for empty URL
  if (!url || url.trim() === '') {
    return { isValid: false, reason: 'empty' };
  }

  const trimmedUrl = url.trim();

  // Check cache first
  const cached = validationCache.get(trimmedUrl);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }

  // Validate URL format
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmedUrl);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      const result: ImageValidationResult = { isValid: false, reason: 'invalid_url' };
      cacheResult(trimmedUrl, result);
      return result;
    }
  } catch {
    const result: ImageValidationResult = { isValid: false, reason: 'invalid_url' };
    cacheResult(trimmedUrl, result);
    return result;
  }

  // Perform HTTP HEAD request with timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(trimmedUrl, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ImageValidator/1.0)',
      },
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const result: ImageValidationResult = { isValid: true, statusCode: response.status };
      cacheResult(trimmedUrl, result);
      return result;
    } else {
      const result: ImageValidationResult = {
        isValid: false,
        reason: 'http_error',
        statusCode: response.status,
      };
      cacheResult(trimmedUrl, result);
      logger.debug(`[ImageValidator] HTTP error for ${trimmedUrl}: ${response.status}`);
      return result;
    }
  } catch (error: any) {
    let result: ImageValidationResult;

    if (error.name === 'AbortError') {
      result = { isValid: false, reason: 'timeout' };
      logger.debug(`[ImageValidator] Timeout for ${trimmedUrl}`);
    } else {
      result = { isValid: false, reason: 'network_error' };
      logger.debug(`[ImageValidator] Network error for ${trimmedUrl}: ${error.message}`);
    }

    cacheResult(trimmedUrl, result);
    return result;
  }
}

/**
 * Cache a validation result
 */
function cacheResult(url: string, result: ImageValidationResult): void {
  validationCache.set(url, { result, timestamp: Date.now() });
  
  // Clean up old cache entries periodically (keep cache size manageable)
  if (validationCache.size > 1000) {
    const now = Date.now();
    for (const [key, value] of validationCache.entries()) {
      if (now - value.timestamp > CACHE_TTL_MS) {
        validationCache.delete(key);
      }
    }
  }
}

/**
 * Clear the validation cache (useful for testing)
 */
export function clearValidationCache(): void {
  validationCache.clear();
}

/**
 * Get cache statistics (useful for debugging)
 */
export function getValidationCacheStats(): { size: number; ttlMs: number } {
  return {
    size: validationCache.size,
    ttlMs: CACHE_TTL_MS,
  };
}
