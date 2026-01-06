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

  const trimmedUrl = normalizeImageUrl(url.trim());

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
      const contentType = response.headers.get('content-type') || '';
      if (contentType.toLowerCase().startsWith('image/')) {
        const result: ImageValidationResult = { isValid: true, statusCode: response.status };
        cacheResult(trimmedUrl, result);
        return result;
      }

      // Some CDNs return empty content-type for HEAD; confirm with a tiny GET.
      const getCheck = await validateWithSmallGet(trimmedUrl, timeoutMs);
      cacheResult(trimmedUrl, getCheck);
      return getCheck;
    }

    // Many hosts block/limit HEAD; try a small GET for common "blocked HEAD" statuses.
    if ([401, 403, 405].includes(response.status)) {
      const getCheck = await validateWithSmallGet(trimmedUrl, timeoutMs);
      cacheResult(trimmedUrl, getCheck);
      return getCheck;
    }

    const result: ImageValidationResult = {
      isValid: false,
      reason: 'http_error',
      statusCode: response.status,
    };
    cacheResult(trimmedUrl, result);
    logger.debug(`[ImageValidator] HTTP error for ${trimmedUrl}: ${response.status}`);
    return result;
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

function normalizeImageUrl(url: string): string {
  // Convert Wikimedia Commons file page URLs into direct file paths.
  // Example: https://commons.wikimedia.org/wiki/File:Foo.jpg
  // -> https://commons.wikimedia.org/wiki/Special:FilePath/Foo.jpg
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname;

    if (hostname === 'commons.wikimedia.org' && pathname.startsWith('/wiki/File:')) {
      const filename = pathname.replace('/wiki/File:', '');
      return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}`;
    }
  } catch {
    // ignore
  }

  return url;
}

async function validateWithSmallGet(url: string, timeoutMs: number): Promise<ImageValidationResult> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ImageValidator/1.0)',
        'Range': 'bytes=0-1023',
        'Accept': 'image/*,*/*;q=0.8',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { isValid: false, reason: 'http_error', statusCode: response.status };
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.toLowerCase().startsWith('image/')) {
      return { isValid: true, statusCode: response.status };
    }

    return { isValid: false, reason: 'http_error', statusCode: response.status };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return { isValid: false, reason: 'timeout' };
    }
    return { isValid: false, reason: 'network_error' };
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
