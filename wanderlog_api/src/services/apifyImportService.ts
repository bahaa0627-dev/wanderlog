/**
 * Apify Import Service
 * 
 * Main service for importing Google Places data from Apify into Supabase.
 * Coordinates field mapping, validation, deduplication, image processing,
 * and category normalization.
 * 
 * Requirements: 6.1-6.6, 2.7
 */

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { apifyFieldMapper } from './apifyFieldMapper';
import { apifyDataValidator } from './apifyDataValidator';
import { placeMergeService, MergedPlace } from './placeMergeService';
import { r2ImageService } from './r2ImageService';
import { normalizationService } from './normalizationService';
import { aiTagsGeneratorService, StructuredTags } from './aiTagsGeneratorService';
import {
  ApifyPlaceItem,
  ImportOptions,
  ImportResult,
  PlaceImportResult,
  MappedPlace,
  ImportReport,
  FieldCoverageStats,
  RequiredFieldsCoverage,
  DuplicateInfo,
} from '../types/apify';

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_DELAY_MS = 100;
const APIFY_API_BASE = 'https://api.apify.com/v2';
const APIFY_PAGE_SIZE = 100;

// ============================================================================
// Types
// ============================================================================

export interface ApifyImportServiceConfig {
  apifyApiToken?: string;
  batchSize?: number;
  delayMs?: number;
}

// ============================================================================
// ApifyImportService Class
// ============================================================================

export class ApifyImportService {
  private apifyApiToken: string;
  private defaultBatchSize: number;
  private defaultDelayMs: number;

  constructor(config?: ApifyImportServiceConfig) {
    this.apifyApiToken = config?.apifyApiToken || process.env.APIFY_API_TOKEN || '';
    this.defaultBatchSize = config?.batchSize || DEFAULT_BATCH_SIZE;
    this.defaultDelayMs = config?.delayMs || DEFAULT_DELAY_MS;
  }

  /**
   * Import places from a local JSON file
   * 
   * Requirement 6.1: Support importing from local JSON files
   * 
   * @param filePath - Path to the JSON file containing Apify data
   * @param options - Import options
   * @returns Import result with statistics
   */
  async importFromFile(filePath: string, options?: ImportOptions): Promise<ImportResult> {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found: ${absolutePath}`);
    }

    const fileContent = fs.readFileSync(absolutePath, 'utf-8');
    let items: ApifyPlaceItem[];

    try {
      items = JSON.parse(fileContent);
      if (!Array.isArray(items)) {
        items = [items];
      }
    } catch (e) {
      throw new Error(`Invalid JSON file: ${(e as Error).message}`);
    }

    return this.importItems(items, options);
  }

  /**
   * Import places from Apify Dataset API
   * 
   * Requirement 6.2: Support importing from Apify API with pagination (100 items per page)
   * 
   * @param datasetId - Apify Dataset ID
   * @param options - Import options
   * @returns Import result with statistics
   */
  async importFromDataset(datasetId: string, options?: ImportOptions): Promise<ImportResult> {
    if (!this.apifyApiToken) {
      throw new Error('APIFY_API_TOKEN is not configured');
    }

    const items: ApifyPlaceItem[] = [];
    let offset = 0;
    let hasMore = true;

    console.log(`📥 Fetching data from Apify Dataset: ${datasetId}`);

    while (hasMore) {
      try {
        const response = await axios.get(
          `${APIFY_API_BASE}/datasets/${datasetId}/items`,
          {
            params: {
              token: this.apifyApiToken,
              offset,
              limit: APIFY_PAGE_SIZE,
            },
          }
        );

        const pageItems = response.data;
        
        if (!Array.isArray(pageItems) || pageItems.length === 0) {
          hasMore = false;
        } else {
          items.push(...pageItems);
          offset += pageItems.length;
          
          // Requirement 6.6: Display progress information
          console.log(`   Fetched ${items.length} items...`);
          
          // Check if we got less than a full page
          if (pageItems.length < APIFY_PAGE_SIZE) {
            hasMore = false;
          }
        }
      } catch (e: any) {
        throw new Error(`Failed to fetch from Apify API: ${e.message}`);
      }
    }

    console.log(`✅ Total items fetched: ${items.length}`);
    
    return this.importItems(items, options);
  }

  /**
   * Import a batch of items
   * 
   * Requirements: 6.4, 6.5, 6.6
   * - 6.4: Support batch upsert (100-500 items per batch)
   * - 6.5: Add appropriate delay between batches
   * - 6.6: Display progress information
   */
  async importItems(items: ApifyPlaceItem[], options?: ImportOptions): Promise<ImportResult> {
    const batchSize = options?.batchSize || this.defaultBatchSize;
    const delayMs = options?.delayMs || this.defaultDelayMs;
    const dryRun = options?.dryRun || false;
    const skipImages = options?.skipImages || false;

    const result: ImportResult = {
      total: items.length,
      inserted: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      stats: {
        cityCount: 0,
        categoryDistribution: {},
        coverImageRate: 0,
        openingHoursRate: 0,
        requiredFieldsRate: 0,
      },
    };

    if (items.length === 0) {
      return result;
    }

    // Track statistics
    const cities = new Set<string>();
    let withCoverImage = 0;
    let withOpeningHours = 0;
    let withRequiredFields = 0;

    console.log(`\n🚀 Starting import of ${items.length} items (batch size: ${batchSize}, dry-run: ${dryRun})`);

    // Process in batches
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(items.length / batchSize);

      // Requirement 6.6: Display progress
      console.log(`\n📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} items)`);

      for (const item of batch) {
        const importResult = await this.importSinglePlace(item, { dryRun, skipImages });

        switch (importResult.action) {
          case 'inserted':
            result.inserted++;
            break;
          case 'updated':
            result.updated++;
            break;
          case 'skipped':
            result.skipped++;
            break;
          case 'failed':
            result.failed++;
            if (importResult.error) {
              result.errors.push({
                placeId: item.placeId,
                name: item.title,
                error: importResult.error,
              });
            }
            break;
        }

        // Track statistics
        if (item.city) cities.add(item.city);
        if (item.imageUrl) withCoverImage++;
        if (item.openingHours && item.openingHours.length > 0) withOpeningHours++;
        
        const validation = apifyDataValidator.validateRequired(item);
        if (validation.valid) withRequiredFields++;

        // Track category distribution
        const categoryResult = normalizationService.normalizeFromApify(
          item.categories,
          item.categoryName,
          item.searchString
        );
        const categorySlug = categoryResult.categorySlug;
        result.stats.categoryDistribution[categorySlug] = 
          (result.stats.categoryDistribution[categorySlug] || 0) + 1;
      }

      // Requirement 6.5: Add delay between batches
      if (i + batchSize < items.length && delayMs > 0) {
        await this.delay(delayMs);
      }
    }

    // Calculate final statistics
    result.stats.cityCount = cities.size;
    result.stats.coverImageRate = items.length > 0 ? (withCoverImage / items.length) * 100 : 0;
    result.stats.openingHoursRate = items.length > 0 ? (withOpeningHours / items.length) * 100 : 0;
    result.stats.requiredFieldsRate = items.length > 0 ? (withRequiredFields / items.length) * 100 : 0;

    // Log summary
    console.log(`\n✅ Import complete!`);
    console.log(`   Total: ${result.total}`);
    console.log(`   Inserted: ${result.inserted}`);
    console.log(`   Updated: ${result.updated}`);
    console.log(`   Skipped: ${result.skipped}`);
    console.log(`   Failed: ${result.failed}`);
    console.log(`   Cities: ${result.stats.cityCount}`);
    console.log(`   Cover Image Rate: ${result.stats.coverImageRate.toFixed(1)}%`);
    console.log(`   Opening Hours Rate: ${result.stats.openingHoursRate.toFixed(1)}%`);

    return result;
  }

  /**
   * Import a single place
   * 
   * Coordinates validation, mapping, deduplication, image processing,
   * and category normalization for a single item.
   */
  async importSinglePlace(
    item: ApifyPlaceItem,
    options?: { dryRun?: boolean; skipImages?: boolean }
  ): Promise<PlaceImportResult> {
    const dryRun = options?.dryRun || false;
    const skipImages = options?.skipImages || false;

    try {
      // Step 0: 预处理 - 根据经纬度补全缺失的 city/countryCode
      const preprocessedItem = apifyDataValidator.preprocessItem(item);

      // Step 1: Check for existing record first (before validation)
      // This allows us to update places even if Apify didn't return city/country
      const existing = await placeMergeService.findExisting(preprocessedItem);
      
      // Step 2: For enrichment scenario - if existing record found, fill missing city/country BEFORE validation
      if (existing) {
        if (!preprocessedItem.city && existing.city) {
          preprocessedItem.city = existing.city;
          console.log(`   📍 Using existing city for ${preprocessedItem.title}: ${existing.city}`);
        }
        if (!preprocessedItem.countryCode && existing.country) {
          preprocessedItem.countryCode = existing.country;
          console.log(`   🌍 Using existing country for ${preprocessedItem.title}: ${existing.country}`);
        }
      }
      
      // Step 3: Validate required fields (Requirement 2.8)
      let validation = apifyDataValidator.validateRequired(preprocessedItem);
      
      // For enrichment: if we have existing record, allow update even if validation fails
      // (as long as we have coordinates to match by)
      if (!validation.valid && existing) {
        const hasCoordinates = preprocessedItem.location?.lat !== undefined && 
                              preprocessedItem.location?.lng !== undefined;
        
        if (hasCoordinates) {
          console.log(`   ℹ️  Enriching existing place ${preprocessedItem.title} (bypassing validation)`);
          validation = { valid: true, errors: [] }; // Override validation for enrichment
        }
      }
      
      // For new places without existing record: if only missing city/country but have coordinates,
      // use reverse geocoding to fill them and allow insertion
      if (!validation.valid && !existing) {
        const hasCoordinates = preprocessedItem.location?.lat !== undefined && 
                              preprocessedItem.location?.lng !== undefined;
        const missingFields = validation.errors;
        const onlyMissingCityCountry = missingFields.every(err => 
          err.includes('city') || err.includes('countryCode')
        );
        
        if (hasCoordinates && onlyMissingCityCountry) {
          // Try reverse geocoding to get city/country
          const geocoded = await apifyDataValidator.reverseGeocode(
            preprocessedItem.location!.lat,
            preprocessedItem.location!.lng
          );
          
          if (geocoded) {
            preprocessedItem.city = geocoded.city;
            preprocessedItem.countryCode = geocoded.countryCode;
            console.log(`   🌍 Reverse geocoded ${preprocessedItem.title}: ${geocoded.city}, ${geocoded.countryCode}`);
            
            // Re-validate after geocoding
            validation = apifyDataValidator.validateRequired(preprocessedItem);
          }
        }
      }
      
      if (!validation.valid) {
        console.log(`   ⚠️  Skipping ${preprocessedItem.title || preprocessedItem.placeId}: ${validation.errors.join(', ')}`);
        return {
          success: false,
          action: 'skipped',
          googlePlaceId: preprocessedItem.placeId,
          error: validation.errors.join(', '),
        };
      }

      // Step 3: Map fields
      const mapped = apifyFieldMapper.mapToPlace(preprocessedItem);

      // Step 4: Normalize category (Requirements 4.1-4.11)
      const categoryResult = normalizationService.normalizeFromApify(
        preprocessedItem.categories,
        preprocessedItem.categoryName,
        preprocessedItem.searchString
      );

      // Step 5: Merge with existing record if found (already checked in Step 1)
      
      let mergedPlace: MergedPlace;
      let isUpdate = false;

      if (existing) {
        // Merge with existing record
        mergedPlace = placeMergeService.merge(existing, mapped);
        isUpdate = true;
        
        // For enrichment: preserve existing city/country if incoming data doesn't have them
        if (!mapped.city && existing.city) {
          mergedPlace.city = existing.city;
        }
        if (!mapped.country && existing.country) {
          mergedPlace.country = existing.country;
        }
      } else {
        // Create new record
        mergedPlace = {
          ...mapped,
          customFields: mapped.customFields as Record<string, unknown>,
          price: mapped.price,  // 确保 price 字段被传递
        };
      }

      // 有 googlePlaceId 时，isVerified = true
      if (preprocessedItem.placeId) {
        mergedPlace.isVerified = true;
      }

      // Apply category normalization
      mergedPlace.categorySlug = categoryResult.categorySlug;
      mergedPlace.categoryEn = categoryResult.categoryEn;
      mergedPlace.categoryZh = categoryResult.categoryZh;

      // Step 5: Generate structured tags from multiple sources
      const structuredTags: Record<string, string[]> = {};
      
      // 5.1: Convert categoryResult.tags (string[]) to structured format
      if (categoryResult.tags.length > 0) {
        for (const tag of categoryResult.tags) {
          const colonIndex = tag.indexOf(':');
          if (colonIndex > 0) {
            const prefix = tag.substring(0, colonIndex);
            const value = tag.substring(colonIndex + 1);
            
            // Map prefix to structured key
            const validKeys = ['theme', 'style', 'award', 'meal', 'cuisine', 'alt_category'];
            
            if (validKeys.includes(prefix)) {
              if (!structuredTags[prefix]) {
                structuredTags[prefix] = [];
              }
              if (!structuredTags[prefix].includes(value)) {
                structuredTags[prefix].push(value);
              }
            }
          }
        }
      }
      
      // 5.2: Extract tags from Apify additionalInfo
      if (preprocessedItem.additionalInfo) {
        // Detect brunch from dining options
        const diningOptions = preprocessedItem.additionalInfo['Dining options'];
        if (diningOptions && Array.isArray(diningOptions)) {
          const hasBrunch = diningOptions.some((opt: Record<string, boolean>) => opt['Brunch'] === true);
          if (hasBrunch && ['restaurant', 'cafe', 'bakery'].includes(categoryResult.categorySlug)) {
            if (!structuredTags.meal) structuredTags.meal = [];
            if (!structuredTags.meal.includes('brunch')) {
              structuredTags.meal.push('brunch');
            }
          }
        }
        
        // Detect atmosphere/style tags
        const atmosphere = preprocessedItem.additionalInfo['Atmosphere'];
        if (atmosphere && Array.isArray(atmosphere)) {
          const styleMap: Record<string, string> = {
            'Trendy': 'trendy',
            'Cozy': 'cozy',
            'Casual': 'casual',
            'Romantic': 'romantic',
            'Upscale': 'upscale',
          };
          for (const atm of atmosphere) {
            for (const [key, value] of Object.entries(atm)) {
              if (value === true && styleMap[key]) {
                if (!structuredTags.style) structuredTags.style = [];
                if (!structuredTags.style.includes(styleMap[key])) {
                  structuredTags.style.push(styleMap[key]);
                }
              }
            }
          }
        }
      }
      
      // 5.3: Extract cuisine from Apify categories
      if (preprocessedItem.categories && ['restaurant', 'cafe'].includes(categoryResult.categorySlug)) {
        const cuisinePatterns: Record<string, string[]> = {
          'Japanese': ['japanese', 'sushi', 'ramen', 'izakaya'],
          'Korean': ['korean', 'bbq'],
          'Vietnamese': ['vietnamese', 'pho'],
          'Thai': ['thai'],
          'Chinese': ['chinese', 'dim sum', 'cantonese'],
          'Italian': ['italian', 'pizza', 'pasta'],
          'French': ['french', 'bistro', 'brasserie'],
          'Spanish': ['spanish', 'tapas'],
          'Indian': ['indian', 'curry'],
          'Mexican': ['mexican', 'taco'],
          'MiddleEastern': ['middle eastern', 'mediterranean', 'lebanese'],
          'Seafood': ['seafood'],
        };
        
        for (const cat of preprocessedItem.categories) {
          const catLower = cat.toLowerCase();
          for (const [cuisine, patterns] of Object.entries(cuisinePatterns)) {
            if (patterns.some(p => catLower.includes(p))) {
              if (!structuredTags.cuisine) structuredTags.cuisine = [];
              if (!structuredTags.cuisine.includes(cuisine)) {
                structuredTags.cuisine.push(cuisine);
              }
              break;
            }
          }
        }
      }
      
      // 5.4: Extract tags from reviewsTags
      if (preprocessedItem.reviewsTags && preprocessedItem.reviewsTags.length > 0) {
        const reviewTagPatterns: Record<string, { key: string; value: string }> = {
          'brunch': { key: 'meal', value: 'brunch' },
          'breakfast': { key: 'meal', value: 'breakfast' },
          'lunch': { key: 'meal', value: 'lunch' },
          'dinner': { key: 'meal', value: 'dinner' },
          'vintage': { key: 'style', value: 'vintage' },
          'cozy': { key: 'style', value: 'cozy' },
          'trendy': { key: 'style', value: 'trendy' },
          'romantic': { key: 'style', value: 'romantic' },
        };
        
        for (const reviewTag of preprocessedItem.reviewsTags) {
          const tagLower = reviewTag.title.toLowerCase();
          for (const [pattern, mapping] of Object.entries(reviewTagPatterns)) {
            if (tagLower.includes(pattern)) {
              if (!structuredTags[mapping.key]) structuredTags[mapping.key] = [];
              if (!structuredTags[mapping.key].includes(mapping.value)) {
                structuredTags[mapping.key].push(mapping.value);
              }
            }
          }
        }
      }
      
      // Save structured tags to the place (only if non-empty)
      if (Object.keys(structuredTags).length > 0) {
        mergedPlace.tags = structuredTags;
      }

      // Step 6: Generate AI tags based on structured tags
      // Convert to StructuredTags format for the generator
      const tagsForGenerator: StructuredTags = structuredTags;
      const aiTags = await aiTagsGeneratorService.generateAITags(
        tagsForGenerator,
        categoryResult.categorySlug,
        categoryResult.categoryEn
      );
      if (aiTags.length > 0) {
        mergedPlace.aiTags = aiTags;
      }

      // Step 7: Process image if available and not skipped
      // NEW LOGIC for data enrichment:
      // - Google image (new) → becomes coverImage
      // - Old coverImage → moves to images array
      // - All images are uploaded to R2
      if (!skipImages && preprocessedItem.imageUrl) {
        const imageResult = await r2ImageService.processAndUpload(preprocessedItem.imageUrl);
        
        if (imageResult.success && imageResult.publicUrl && imageResult.r2Key) {
          const customFields = mergedPlace.customFields as Record<string, unknown>;
          
          // Initialize images array if needed
          if (!customFields.images) {
            customFields.images = [];
          }
          const imagesArray = customFields.images as Array<{ url: string; r2Key: string; addedAt: string; source?: string }>;
          
          // If there's an existing coverImage, move it to images array first
          if (mergedPlace.coverImage) {
            const oldCoverExists = imagesArray.some(img => img.url === mergedPlace.coverImage);
            if (!oldCoverExists) {
              imagesArray.push({
                url: mergedPlace.coverImage,
                r2Key: (customFields.r2Key as string) || '',
                addedAt: (customFields.imageMigratedAt as string) || new Date().toISOString(),
                source: 'wikidata', // Assume old images are from wikidata
              });
              console.log(`   🖼️  Moved old coverImage to images array: ${preprocessedItem.title}`);
            }
          }
          
          // Set Google image as new coverImage
          mergedPlace.coverImage = imageResult.publicUrl;
          customFields.r2Key = imageResult.r2Key;
          customFields.imageMigratedAt = new Date().toISOString();
          console.log(`   🖼️  Set Google image as coverImage: ${preprocessedItem.title}`);
        }
      }

      // Step 8: Dry run check
      if (dryRun) {
        return {
          success: true,
          action: isUpdate ? 'updated' : 'inserted',
          googlePlaceId: preprocessedItem.placeId,
        };
      }

      // Step 9: Upsert to database
      const upsertResult = await placeMergeService.upsert(mergedPlace);

      return {
        success: true,
        action: upsertResult.action,
        placeId: upsertResult.place.id,
        googlePlaceId: preprocessedItem.placeId,
      };

    } catch (e: any) {
      console.error(`   ❌ Error importing ${item.title || item.placeId}: ${e.message}`);
      return {
        success: false,
        action: 'failed',
        googlePlaceId: item.placeId,
        error: e.message,
      };
    }
  }

  /**
   * Validate import statistics accuracy
   * 
   * Requirement 2.7: total = inserted + updated + skipped + failed
   */
  static validateStatistics(result: ImportResult): boolean {
    return result.total === result.inserted + result.updated + result.skipped + result.failed;
  }

  /**
   * Check if metadata is complete for an imported place
   * 
   * Requirements 5.1, 5.2, 5.7:
   * - sourceDetails.apify should contain scrapedAt
   * - sourceDetails.apify.searchHits should be an array
   * - customFields.categoriesRaw should exist if categories was present
   */
  static validateMetadataCompleteness(
    mapped: MappedPlace,
    originalItem: ApifyPlaceItem
  ): { complete: boolean; missing: string[] } {
    const missing: string[] = [];

    // Check sourceDetails.apify.scrapedAt (Requirement 5.1)
    if (!mapped.sourceDetails?.apify?.scrapedAt) {
      missing.push('sourceDetails.apify.scrapedAt');
    }

    // Check sourceDetails.apify.searchHits (Requirement 5.2)
    if (!Array.isArray(mapped.sourceDetails?.apify?.searchHits)) {
      missing.push('sourceDetails.apify.searchHits');
    }

    // Check customFields.categoriesRaw if categories was present (Requirement 5.7)
    if (originalItem.categories && originalItem.categories.length > 0) {
      if (!mapped.customFields?.categoriesRaw) {
        missing.push('customFields.categoriesRaw');
      }
    }

    return {
      complete: missing.length === 0,
      missing,
    };
  }

  /**
   * Generate import validation report
   * 
   * Requirements 7.1-7.6:
   * - 7.1: Output summary report after import completion
   * - 7.2: Statistics for required field coverage (city/country/lat/lng/coverImage)
   * - 7.3: Statistics for openingHours coverage
   * - 7.4: Statistics for cover image availability
   * - 7.5: Detect duplicate rate within same city (same placeId appearing multiple times)
   * - 7.6: Support dry-run mode (only validate, don't write)
   * 
   * @param items - Array of Apify place items to analyze
   * @param importResult - Optional import result to include in report
   * @param isDryRun - Whether this is a dry-run validation
   * @returns Import validation report
   */
  generateReport(
    items: ApifyPlaceItem[],
    importResult?: ImportResult,
    isDryRun: boolean = false
  ): ImportReport {
    const total = items.length;

    // Initialize counters for required fields (Requirement 7.2)
    let withCity = 0;
    let withCountry = 0;
    let withLatitude = 0;
    let withLongitude = 0;
    let withCoverImage = 0;
    let withAllRequired = 0;

    // Opening hours counter (Requirement 7.3)
    let withOpeningHours = 0;

    // Track duplicates (Requirement 7.5)
    const placeIdOccurrences = new Map<string, { name: string; city: string; count: number }>();

    // Track category and city distribution
    const categoryDistribution: Record<string, number> = {};
    const cityDistribution: Record<string, number> = {};

    // Analyze each item
    for (const item of items) {
      // Check required fields (Requirement 7.2)
      const hasCity = !!item.city;
      const hasCountry = !!item.countryCode;
      const hasLatitude = item.location?.lat !== undefined && item.location?.lat !== null;
      const hasLongitude = item.location?.lng !== undefined && item.location?.lng !== null;
      const hasCoverImage = !!item.imageUrl;

      if (hasCity) withCity++;
      if (hasCountry) withCountry++;
      if (hasLatitude) withLatitude++;
      if (hasLongitude) withLongitude++;
      if (hasCoverImage) withCoverImage++;
      if (hasCity && hasCountry && hasLatitude && hasLongitude && hasCoverImage) {
        withAllRequired++;
      }

      // Check opening hours (Requirement 7.3)
      if (item.openingHours && Array.isArray(item.openingHours) && item.openingHours.length > 0) {
        withOpeningHours++;
      }

      // Track duplicates by placeId (Requirement 7.5)
      if (item.placeId) {
        const existing = placeIdOccurrences.get(item.placeId);
        if (existing) {
          existing.count++;
        } else {
          placeIdOccurrences.set(item.placeId, {
            name: item.title || 'Unknown',
            city: item.city || 'Unknown',
            count: 1,
          });
        }
      }

      // Track category distribution
      const categoryResult = normalizationService.normalizeFromApify(
        item.categories,
        item.categoryName,
        item.searchString
      );
      const categorySlug = categoryResult.categorySlug;
      categoryDistribution[categorySlug] = (categoryDistribution[categorySlug] || 0) + 1;

      // Track city distribution
      if (item.city) {
        cityDistribution[item.city] = (cityDistribution[item.city] || 0) + 1;
      }
    }

    // Build required fields coverage (Requirement 7.2)
    const requiredFieldsCoverage: RequiredFieldsCoverage = {
      city: this.buildFieldCoverageStats(total, withCity),
      country: this.buildFieldCoverageStats(total, withCountry),
      latitude: this.buildFieldCoverageStats(total, withLatitude),
      longitude: this.buildFieldCoverageStats(total, withLongitude),
      coverImage: this.buildFieldCoverageStats(total, withCoverImage),
      overall: this.buildFieldCoverageStats(total, withAllRequired),
    };

    // Build opening hours coverage (Requirement 7.3)
    const openingHoursCoverage = this.buildFieldCoverageStats(total, withOpeningHours);

    // Build cover image coverage (Requirement 7.4)
    const coverImageCoverage = this.buildFieldCoverageStats(total, withCoverImage);

    // Build duplicates info (Requirement 7.5)
    const duplicateItems: DuplicateInfo[] = [];
    let totalDuplicateOccurrences = 0;

    for (const [placeId, info] of placeIdOccurrences) {
      if (info.count > 1) {
        duplicateItems.push({
          placeId,
          name: info.name,
          city: info.city,
          count: info.count,
        });
        totalDuplicateOccurrences += info.count - 1; // Count extra occurrences
      }
    }

    // Sort duplicates by count descending
    duplicateItems.sort((a, b) => b.count - a.count);

    const duplicateRate = total > 0 ? (totalDuplicateOccurrences / total) * 100 : 0;

    // Build the report (Requirement 7.1)
    const report: ImportReport = {
      generatedAt: new Date().toISOString(),
      isDryRun,
      totalItems: total,
      summary: {
        inserted: importResult?.inserted || 0,
        updated: importResult?.updated || 0,
        skipped: importResult?.skipped || 0,
        failed: importResult?.failed || 0,
      },
      requiredFieldsCoverage,
      openingHoursCoverage,
      coverImageCoverage,
      duplicates: {
        totalDuplicates: duplicateItems.length,
        duplicateRate,
        items: duplicateItems,
      },
      categoryDistribution,
      cityDistribution,
      errors: importResult?.errors || [],
    };

    return report;
  }

  /**
   * Print a formatted report to console
   * 
   * Requirement 7.1: Output summary report after import completion
   * 
   * @param report - The import report to print
   */
  printReport(report: ImportReport): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 IMPORT VALIDATION REPORT');
    console.log('='.repeat(60));
    console.log(`Generated: ${report.generatedAt}`);
    console.log(`Mode: ${report.isDryRun ? 'DRY-RUN (no data written)' : 'LIVE'}`);
    console.log(`Total Items: ${report.totalItems}`);

    // Summary
    console.log('\n📈 SUMMARY');
    console.log('-'.repeat(40));
    console.log(`  Inserted: ${report.summary.inserted}`);
    console.log(`  Updated:  ${report.summary.updated}`);
    console.log(`  Skipped:  ${report.summary.skipped}`);
    console.log(`  Failed:   ${report.summary.failed}`);

    // Required Fields Coverage (Requirement 7.2)
    console.log('\n📋 REQUIRED FIELDS COVERAGE');
    console.log('-'.repeat(40));
    console.log(`  City:       ${report.requiredFieldsCoverage.city.present}/${report.requiredFieldsCoverage.city.total} (${report.requiredFieldsCoverage.city.rate.toFixed(1)}%)`);
    console.log(`  Country:    ${report.requiredFieldsCoverage.country.present}/${report.requiredFieldsCoverage.country.total} (${report.requiredFieldsCoverage.country.rate.toFixed(1)}%)`);
    console.log(`  Latitude:   ${report.requiredFieldsCoverage.latitude.present}/${report.requiredFieldsCoverage.latitude.total} (${report.requiredFieldsCoverage.latitude.rate.toFixed(1)}%)`);
    console.log(`  Longitude:  ${report.requiredFieldsCoverage.longitude.present}/${report.requiredFieldsCoverage.longitude.total} (${report.requiredFieldsCoverage.longitude.rate.toFixed(1)}%)`);
    console.log(`  Cover Image: ${report.requiredFieldsCoverage.coverImage.present}/${report.requiredFieldsCoverage.coverImage.total} (${report.requiredFieldsCoverage.coverImage.rate.toFixed(1)}%)`);
    console.log(`  All Required: ${report.requiredFieldsCoverage.overall.present}/${report.requiredFieldsCoverage.overall.total} (${report.requiredFieldsCoverage.overall.rate.toFixed(1)}%)`);

    // Opening Hours Coverage (Requirement 7.3)
    console.log('\n⏰ OPENING HOURS COVERAGE');
    console.log('-'.repeat(40));
    console.log(`  With Hours: ${report.openingHoursCoverage.present}/${report.openingHoursCoverage.total} (${report.openingHoursCoverage.rate.toFixed(1)}%)`);

    // Cover Image Coverage (Requirement 7.4)
    console.log('\n🖼️  COVER IMAGE AVAILABILITY');
    console.log('-'.repeat(40));
    console.log(`  With Image: ${report.coverImageCoverage.present}/${report.coverImageCoverage.total} (${report.coverImageCoverage.rate.toFixed(1)}%)`);

    // Duplicates (Requirement 7.5)
    console.log('\n🔄 DUPLICATE DETECTION');
    console.log('-'.repeat(40));
    console.log(`  Unique PlaceIds with duplicates: ${report.duplicates.totalDuplicates}`);
    console.log(`  Duplicate Rate: ${report.duplicates.duplicateRate.toFixed(2)}%`);
    if (report.duplicates.items.length > 0) {
      console.log('  Top duplicates:');
      const topDuplicates = report.duplicates.items.slice(0, 5);
      for (const dup of topDuplicates) {
        console.log(`    - ${dup.name} (${dup.city}): ${dup.count} occurrences`);
      }
      if (report.duplicates.items.length > 5) {
        console.log(`    ... and ${report.duplicates.items.length - 5} more`);
      }
    }

    // Category Distribution
    console.log('\n📂 CATEGORY DISTRIBUTION');
    console.log('-'.repeat(40));
    const sortedCategories = Object.entries(report.categoryDistribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    for (const [category, count] of sortedCategories) {
      const percentage = ((count / report.totalItems) * 100).toFixed(1);
      console.log(`  ${category}: ${count} (${percentage}%)`);
    }
    if (Object.keys(report.categoryDistribution).length > 10) {
      console.log(`  ... and ${Object.keys(report.categoryDistribution).length - 10} more categories`);
    }

    // City Distribution
    console.log('\n🏙️  CITY DISTRIBUTION');
    console.log('-'.repeat(40));
    const sortedCities = Object.entries(report.cityDistribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    for (const [city, count] of sortedCities) {
      const percentage = ((count / report.totalItems) * 100).toFixed(1);
      console.log(`  ${city}: ${count} (${percentage}%)`);
    }
    if (Object.keys(report.cityDistribution).length > 10) {
      console.log(`  ... and ${Object.keys(report.cityDistribution).length - 10} more cities`);
    }

    // Errors
    if (report.errors.length > 0) {
      console.log('\n❌ ERRORS');
      console.log('-'.repeat(40));
      const topErrors = report.errors.slice(0, 10);
      for (const err of topErrors) {
        console.log(`  - ${err.name || err.placeId}: ${err.error}`);
      }
      if (report.errors.length > 10) {
        console.log(`  ... and ${report.errors.length - 10} more errors`);
      }
    }

    console.log('\n' + '='.repeat(60));
  }

  /**
   * Helper: Build field coverage statistics
   */
  private buildFieldCoverageStats(total: number, present: number): FieldCoverageStats {
    return {
      total,
      present,
      rate: total > 0 ? (present / total) * 100 : 0,
    };
  }

  /**
   * Helper: Delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const apifyImportService = new ApifyImportService();
