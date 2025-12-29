/**
 * Property-Based Tests for R2 Image Service
 * 
 * Feature: apify-data-import
 * 
 * Property 8: R2 Key Format
 * *For any* uploaded image, the R2 key should match the pattern 
 * `places/cover/v1/{2chars}/{2chars}/{uuid}.jpg` and never contain googlePlaceId
 * 
 * **Validates: Requirements 3.2, 3.9**
 * 
 * Property 9: Image URL Storage
 * *For any* successfully uploaded image, coverImage should be the R2 public URL,
 * customFields.r2Key should be the R2 key, and customFields.imageSourceUrl should 
 * be the original URL
 * 
 * **Validates: Requirements 3.5, 3.6, 3.7**
 */

import * as fc from 'fast-check';
import { R2ImageService } from '../../src/services/r2ImageService';

// ============================================
// Test Data Generators
// ============================================

/**
 * Generator for Google Place ID format
 */
const googlePlaceIdArbitrary = fc.stringMatching(/^ChIJ[A-Za-z0-9_-]{20,30}$/);

/**
 * Generator for R2 public URL base
 */
const r2PublicUrlArbitrary = fc.constantFrom(
  'https://wanderlog-images.blcubahaa0627.workers.dev',
  'https://images.wanderlog.app',
  'https://cdn.example.com'
);

// ============================================
// Helper Functions
// ============================================

/**
 * Validate R2 key format
 */
function isValidR2KeyFormat(r2Key: string): boolean {
  const pattern = /^places\/cover\/v1\/[a-f0-9]{2}\/[a-f0-9]{4}\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.jpg$/;
  return pattern.test(r2Key);
}

/**
 * Extract prefix2 from R2 key
 */
function extractPrefix2(r2Key: string): string | null {
  const match = r2Key.match(/^places\/cover\/v1\/([a-f0-9]{2})\//);
  return match ? match[1] : null;
}

/**
 * Extract prefix4 from R2 key
 */
function extractPrefix4(r2Key: string): string | null {
  const match = r2Key.match(/^places\/cover\/v1\/[a-f0-9]{2}\/([a-f0-9]{4})\//);
  return match ? match[1] : null;
}

/**
 * Extract UUID from R2 key
 */
function extractUuid(r2Key: string): string | null {
  const match = r2Key.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.jpg$/);
  return match ? match[1] : null;
}

// ============================================
// Property Tests
// ============================================

describe('R2 Image Service Property-Based Tests', () => {
  const service = new R2ImageService();

  /**
   * Feature: apify-data-import, Property 8: R2 Key Format
   * 
   * *For any* uploaded image, the R2 key should match the pattern 
   * `places/cover/v1/{2chars}/{4chars}/{uuid}.jpg` and never contain googlePlaceId
   * 
   * **Validates: Requirements 3.2, 3.9**
   */
  describe('Property 8: R2 Key Format', () => {
    
    /**
     * Requirement 3.2: R2 key format places/cover/v1/{uuid_prefix2}/{uuid_prefix4}/{uuid}.jpg
     */
    it('should generate R2 keys matching the required format pattern', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }), // Generate multiple keys
          () => {
            const r2Key = service.generateR2Key();
            return isValidR2KeyFormat(r2Key);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Requirement 3.2: UUID prefix consistency
     * The prefix2 should be the first 2 chars of UUID
     * The prefix4 should be the first 4 chars of UUID
     */
    it('should have prefix2 and prefix4 derived from UUID', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          () => {
            const r2Key = service.generateR2Key();
            const uuid = extractUuid(r2Key);
            const prefix2 = extractPrefix2(r2Key);
            const prefix4 = extractPrefix4(r2Key);

            if (!uuid || !prefix2 || !prefix4) return false;

            // prefix2 should be first 2 chars of UUID
            const expectedPrefix2 = uuid.substring(0, 2);
            // prefix4 should be first 4 chars of UUID
            const expectedPrefix4 = uuid.substring(0, 4);

            return prefix2 === expectedPrefix2 && prefix4 === expectedPrefix4;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Requirement 3.9: R2 key should never contain googlePlaceId
     */
    it('should never contain googlePlaceId in R2 key', () => {
      fc.assert(
        fc.property(
          googlePlaceIdArbitrary,
          (googlePlaceId: string) => {
            const r2Key = service.generateR2Key();
            
            // R2 key should not contain the googlePlaceId
            return !r2Key.includes(googlePlaceId);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Requirement 3.9: R2 key should never contain ChIJ pattern
     */
    it('should never contain ChIJ pattern (Google Place ID format) in R2 key', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          () => {
            const r2Key = service.generateR2Key();
            return !r2Key.includes('ChIJ');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * R2 key should always end with .jpg
     */
    it('should always end with .jpg extension', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          () => {
            const r2Key = service.generateR2Key();
            return r2Key.endsWith('.jpg');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * R2 key should always start with places/cover/v1/
     */
    it('should always start with places/cover/v1/', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          () => {
            const r2Key = service.generateR2Key();
            return r2Key.startsWith('places/cover/v1/');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Generated R2 keys should be unique
     */
    it('should generate unique R2 keys', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 50 }),
          (count: number) => {
            const keys = new Set<string>();
            for (let i = 0; i < count; i++) {
              keys.add(service.generateR2Key());
            }
            return keys.size === count;
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Static validation should correctly validate R2 keys
     */
    it('should validate generated R2 keys as valid', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          () => {
            const r2Key = service.generateR2Key();
            return R2ImageService.validateR2Key(r2Key);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Static validation should reject keys containing googlePlaceId
     */
    it('should reject R2 keys containing googlePlaceId via static validation', () => {
      fc.assert(
        fc.property(
          googlePlaceIdArbitrary,
          (googlePlaceId: string) => {
            // Create an invalid key that contains googlePlaceId
            const invalidKey = `places/cover/v1/ab/abcd/${googlePlaceId}.jpg`;
            return !R2ImageService.validateR2Key(invalidKey, googlePlaceId);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Static validation should reject malformed keys
     */
    it('should reject malformed R2 keys via static validation', () => {
      const malformedKeys = [
        'places/cover/v1/invalid.jpg',
        'places/cover/v2/ab/abcd/uuid.jpg',
        'images/cover/v1/ab/abcd/uuid.jpg',
        'places/cover/v1/ab/abcd/not-a-uuid.jpg',
        'places/cover/v1/a/abcd/uuid.jpg', // prefix2 too short
        'places/cover/v1/ab/abc/uuid.jpg', // prefix4 too short
      ];

      for (const key of malformedKeys) {
        expect(R2ImageService.validateR2Key(key)).toBe(false);
      }
    });
  });

  /**
   * Feature: apify-data-import, Property 9: Image URL Storage
   * 
   * *For any* successfully uploaded image, coverImage should be the R2 public URL,
   * customFields.r2Key should be the R2 key, and customFields.imageSourceUrl should 
   * be the original URL
   * 
   * **Validates: Requirements 3.5, 3.6, 3.7**
   */
  describe('Property 9: Image URL Storage', () => {
    
    /**
     * Requirement 3.5: Public URL should be constructed from R2 base URL and key
     */
    it('should build public URL from R2 base URL and key', () => {
      fc.assert(
        fc.property(
          r2PublicUrlArbitrary,
          (r2PublicUrl: string) => {
            const customService = new R2ImageService({ r2PublicUrl });
            const r2Key = customService.generateR2Key();
            const publicUrl = customService.buildPublicUrl(r2Key);

            // Public URL should be base URL + / + key
            return publicUrl === `${r2PublicUrl}/${r2Key}`;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Requirement 3.6: R2 key should be extractable from public URL
     */
    it('should have R2 key extractable from public URL', () => {
      fc.assert(
        fc.property(
          r2PublicUrlArbitrary,
          (r2PublicUrl: string) => {
            const customService = new R2ImageService({ r2PublicUrl });
            const r2Key = customService.generateR2Key();
            const publicUrl = customService.buildPublicUrl(r2Key);

            // Should be able to extract key from URL
            const extractedKey = publicUrl.replace(`${r2PublicUrl}/`, '');
            return extractedKey === r2Key;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Public URL should be a valid URL
     */
    it('should generate valid public URLs', () => {
      fc.assert(
        fc.property(
          r2PublicUrlArbitrary,
          (r2PublicUrl: string) => {
            const customService = new R2ImageService({ r2PublicUrl });
            const r2Key = customService.generateR2Key();
            const publicUrl = customService.buildPublicUrl(r2Key);

            try {
              new URL(publicUrl);
              return true;
            } catch {
              return false;
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Public URL should end with .jpg
     */
    it('should generate public URLs ending with .jpg', () => {
      fc.assert(
        fc.property(
          r2PublicUrlArbitrary,
          (r2PublicUrl: string) => {
            const customService = new R2ImageService({ r2PublicUrl });
            const r2Key = customService.generateR2Key();
            const publicUrl = customService.buildPublicUrl(r2Key);

            return publicUrl.endsWith('.jpg');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * UUID extraction should work correctly
     */
    it('should correctly extract UUID from R2 key', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          () => {
            const r2Key = service.generateR2Key();
            const uuid = R2ImageService.extractUuidFromKey(r2Key);

            if (!uuid) return false;

            // UUID should be in the key
            return r2Key.includes(uuid);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Extracted UUID should be valid format
     */
    it('should extract valid UUID format from R2 key', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          () => {
            const r2Key = service.generateR2Key();
            const uuid = R2ImageService.extractUuidFromKey(r2Key);

            if (!uuid) return false;

            // Check UUID format (v4 pattern)
            const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
            return uuidPattern.test(uuid);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Configuration Tests
   */
  describe('Service Configuration', () => {
    /**
     * Custom configuration should be applied
     */
    it('should apply custom configuration', () => {
      const customConfig = {
        r2PublicUrl: 'https://custom.example.com',
        imageQuality: 90,
        maxDimension: 2000,
        downloadTimeoutMs: 5000,
        uploadTimeoutMs: 20000,
        maxRetries: 2,
      };

      const customService = new R2ImageService(customConfig);
      const publicUrl = customService.buildPublicUrl('test/key.jpg');

      expect(publicUrl).toBe('https://custom.example.com/test/key.jpg');
    });

    /**
     * Default configuration should work
     */
    it('should work with default configuration', () => {
      const defaultService = new R2ImageService();
      const r2Key = defaultService.generateR2Key();

      expect(isValidR2KeyFormat(r2Key)).toBe(true);
    });
  });
});

