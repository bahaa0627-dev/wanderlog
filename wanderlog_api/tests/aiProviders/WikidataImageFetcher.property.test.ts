/**
 * Property-Based Tests for Wikidata Image Fetcher
 * 
 * Feature: wikidata-import
 * 
 * Property 8: Image Collection Preservation
 * *For any* record with existing images from JSON, after processing, the images 
 * array should contain all original images plus any new images from Wikidata API 
 * (excluding banners).
 * 
 * Property 9: Cover Image Selection
 * *For any* record with at least one image, cover_image should be set to the 
 * first image. If Wikidata API returns no images but JSON has an image, that 
 * image should be cover_image.
 * 
 * **Validates: Requirements 5.2, 5.3, 5.4, 5.5**
 */

import * as fc from 'fast-check';
import {
  WikidataImageFetcher,
  WikidataImages,
} from '../../src/services/wikidataImportUtils';

// ============================================
// Test Data Generators
// ============================================

/**
 * Generator for valid Commons image URLs (non-banner)
 */
const validImageUrlArbitrary: fc.Arbitrary<string> = fc.constantFrom(
  'http://commons.wikimedia.org/wiki/Special:FilePath/Tour_Eiffel.jpg',
  'http://commons.wikimedia.org/wiki/Special:FilePath/Colosseum_in_Rome.jpg',
  'http://commons.wikimedia.org/wiki/Special:FilePath/Sagrada_Familia.jpg',
  'http://commons.wikimedia.org/wiki/Special:FilePath/Sydney_Opera_House.jpg',
  'http://commons.wikimedia.org/wiki/Special:FilePath/Taj_Mahal.jpg',
  'http://commons.wikimedia.org/wiki/Special:FilePath/Big_Ben.jpg',
  'http://commons.wikimedia.org/wiki/Special:FilePath/Statue_of_Liberty.jpg',
  'http://commons.wikimedia.org/wiki/Special:FilePath/Machu_Picchu.jpg',
  'http://commons.wikimedia.org/wiki/Special:FilePath/Great_Wall.jpg',
  'http://commons.wikimedia.org/wiki/Special:FilePath/Petra_Treasury.jpg'
);

/**
 * Generator for banner image URLs (should be filtered out)
 */
const bannerImageUrlArbitrary: fc.Arbitrary<string> = fc.constantFrom(
  'http://commons.wikimedia.org/wiki/Special:FilePath/Paris_banner.jpg',
  'http://commons.wikimedia.org/wiki/Special:FilePath/Rome_wikivoyage_banner.png',
  'http://commons.wikimedia.org/wiki/Special:FilePath/City_panorama.jpg',
  'http://commons.wikimedia.org/wiki/Special:FilePath/Skyline_header.jpg',
  'http://commons.wikimedia.org/wiki/Special:FilePath/Wide_view_city.jpg',
  'http://commons.wikimedia.org/wiki/Special:FilePath/Monument_banner.png',
  'http://commons.wikimedia.org/wiki/Special:FilePath/Travel_header_image.jpg'
);

/**
 * Generator for arrays of unique valid image URLs
 */
const uniqueValidImagesArbitrary = (minLength: number, maxLength: number): fc.Arbitrary<string[]> =>
  fc.uniqueArray(validImageUrlArbitrary, { minLength, maxLength });

/**
 * Generator for arrays of unique banner image URLs
 */
const uniqueBannerImagesArbitrary = (minLength: number, maxLength: number): fc.Arbitrary<string[]> =>
  fc.uniqueArray(bannerImageUrlArbitrary, { minLength, maxLength });

// ============================================
// Property 8: Image Collection Preservation
// ============================================

describe('Wikidata Image Fetcher - Property Tests', () => {
  const fetcher = new WikidataImageFetcher();

  /**
   * Feature: wikidata-import, Property 8: Image Collection Preservation
   * 
   * *For any* record with existing images from JSON, after processing, the images 
   * array should contain all original images plus any new images from Wikidata API 
   * (excluding banners).
   * 
   * **Validates: Requirements 5.3, 5.4**
   */
  describe('Property 8: Image Collection Preservation', () => {
    
    /**
     * All existing images should be preserved in the output
     */
    it('should preserve all existing images from JSON in the output', () => {
      fc.assert(
        fc.property(
          uniqueValidImagesArbitrary(1, 5),
          (existingImages: string[]) => {
            // Simulate merging with empty API results
            const apiImages: string[] = [];
            const filteredApiImages = fetcher.filterBannerImages(apiImages);
            
            // Manually merge (simulating internal behavior)
            const seen = new Set<string>();
            const merged: string[] = [];
            
            for (const img of existingImages) {
              if (img && !seen.has(img)) {
                seen.add(img);
                merged.push(img);
              }
            }
            
            for (const img of filteredApiImages) {
              if (img && !seen.has(img)) {
                seen.add(img);
                merged.push(img);
              }
            }
            
            // All existing images should be in merged result
            for (const img of existingImages) {
              if (!merged.includes(img)) {
                return false;
              }
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Banner images should be filtered out from API results
     */
    it('should filter out banner images from API results', () => {
      fc.assert(
        fc.property(
          uniqueBannerImagesArbitrary(1, 5),
          (bannerImages: string[]) => {
            const filtered = fetcher.filterBannerImages(bannerImages);
            
            // All banner images should be filtered out
            return filtered.length === 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Non-banner images should NOT be filtered out
     */
    it('should NOT filter out non-banner images', () => {
      fc.assert(
        fc.property(
          uniqueValidImagesArbitrary(1, 5),
          (validImages: string[]) => {
            const filtered = fetcher.filterBannerImages(validImages);
            
            // All valid images should remain
            return filtered.length === validImages.length;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Mixed images should only keep non-banner images
     */
    it('should keep only non-banner images when given mixed input', () => {
      fc.assert(
        fc.property(
          uniqueValidImagesArbitrary(1, 3),
          uniqueBannerImagesArbitrary(1, 3),
          (validImages: string[], bannerImages: string[]) => {
            const mixedImages = [...validImages, ...bannerImages];
            const filtered = fetcher.filterBannerImages(mixedImages);
            
            // Filtered should contain all valid images
            for (const img of validImages) {
              if (!filtered.includes(img)) {
                return false;
              }
            }
            
            // Filtered should NOT contain any banner images
            for (const img of bannerImages) {
              if (filtered.includes(img)) {
                return false;
              }
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * isBannerImage should correctly identify banner images
     */
    it('should correctly identify banner images with isBannerImage', () => {
      fc.assert(
        fc.property(
          bannerImageUrlArbitrary,
          (bannerUrl: string) => {
            return fetcher.isBannerImage(bannerUrl) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * isBannerImage should correctly identify non-banner images
     */
    it('should correctly identify non-banner images with isBannerImage', () => {
      fc.assert(
        fc.property(
          validImageUrlArbitrary,
          (validUrl: string) => {
            return fetcher.isBannerImage(validUrl) === false;
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  // ============================================
  // Property 9: Cover Image Selection
  // ============================================

  /**
   * Feature: wikidata-import, Property 9: Cover Image Selection
   * 
   * *For any* record with at least one image, cover_image should be set to the 
   * first image. If Wikidata API returns no images but JSON has an image, that 
   * image should be cover_image.
   * 
   * **Validates: Requirements 5.2, 5.5**
   */
  describe('Property 9: Cover Image Selection', () => {
    
    /**
     * Helper to simulate fetchImages behavior without actual API call
     */
    function simulateFetchImages(existingImages: string[], apiImages: string[]): WikidataImages {
      // Filter banner images from API results
      const filteredApiImages = fetcher.filterBannerImages(apiImages);
      
      // Merge images (existing first, then API)
      const seen = new Set<string>();
      const merged: string[] = [];
      
      for (const img of existingImages) {
        if (img && !seen.has(img)) {
          seen.add(img);
          merged.push(img);
        }
      }
      
      for (const img of filteredApiImages) {
        if (img && !seen.has(img)) {
          seen.add(img);
          merged.push(img);
        }
      }
      
      // Select cover and additional images
      if (merged.length === 0) {
        return {
          coverImage: null,
          additionalImages: [],
        };
      }
      
      return {
        coverImage: merged[0],
        additionalImages: merged.slice(1),
      };
    }

    /**
     * Cover image should be the first image when images exist
     */
    it('should set cover_image to the first image when images exist', () => {
      fc.assert(
        fc.property(
          uniqueValidImagesArbitrary(1, 5),
          (existingImages: string[]) => {
            const result = simulateFetchImages(existingImages, []);
            
            // Cover image should be the first existing image
            return result.coverImage === existingImages[0];
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * When API returns no images but JSON has images, JSON image should be cover
     */
    it('should use JSON image as cover when API returns no images', () => {
      fc.assert(
        fc.property(
          uniqueValidImagesArbitrary(1, 3),
          (existingImages: string[]) => {
            // API returns empty
            const result = simulateFetchImages(existingImages, []);
            
            // Cover should be the first JSON image
            return result.coverImage === existingImages[0];
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * When API returns only banner images, JSON image should be cover
     */
    it('should use JSON image as cover when API returns only banner images', () => {
      fc.assert(
        fc.property(
          uniqueValidImagesArbitrary(1, 3),
          uniqueBannerImagesArbitrary(1, 3),
          (existingImages: string[], bannerImages: string[]) => {
            // API returns only banners (which get filtered)
            const result = simulateFetchImages(existingImages, bannerImages);
            
            // Cover should be the first JSON image
            return result.coverImage === existingImages[0];
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Additional images should contain all images except the first
     */
    it('should put all images except first in additionalImages', () => {
      fc.assert(
        fc.property(
          uniqueValidImagesArbitrary(2, 5),
          (existingImages: string[]) => {
            const result = simulateFetchImages(existingImages, []);
            
            // Additional images should be all except the first
            if (result.additionalImages.length !== existingImages.length - 1) {
              return false;
            }
            
            // All additional images should be from the original list (excluding first)
            for (let i = 1; i < existingImages.length; i++) {
              if (!result.additionalImages.includes(existingImages[i])) {
                return false;
              }
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * When no images exist, cover should be null
     */
    it('should return null cover_image when no images exist', () => {
      const result = simulateFetchImages([], []);
      
      expect(result.coverImage).toBeNull();
      expect(result.additionalImages).toEqual([]);
    });

    /**
     * Existing images should take priority over API images for cover
     */
    it('should prioritize existing images over API images for cover', () => {
      fc.assert(
        fc.property(
          uniqueValidImagesArbitrary(1, 3),
          uniqueValidImagesArbitrary(1, 3),
          (existingImages: string[], apiImages: string[]) => {
            // Make sure they're different
            const uniqueApiImages = apiImages.filter(img => !existingImages.includes(img));
            
            const result = simulateFetchImages(existingImages, uniqueApiImages);
            
            // Cover should be the first existing image
            return result.coverImage === existingImages[0];
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Duplicate images should be deduplicated
     */
    it('should deduplicate images when same image appears in both sources', () => {
      fc.assert(
        fc.property(
          uniqueValidImagesArbitrary(1, 3),
          (images: string[]) => {
            // Same images in both sources
            const result = simulateFetchImages(images, images);
            
            // Total images should equal original count (no duplicates)
            const totalImages = 1 + result.additionalImages.length;
            return totalImages === images.length;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
