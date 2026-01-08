/**
 * Mocation Data Importer
 * 
 * Handles saving scraped data to JSON files and importing to Supabase database.
 * Supports duplicate detection based on name and address.
 * Supports multiple movies per place (adds movie references to existing places).
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  ScrapedData,
  ScrapedMoviePage,
  ScrapedPlaceDetail,
  MoviePlaceItem,
  MovieInfo,
  MovieReference,
  MocationCustomFields,
  ImportResult,
  SaveOptions,
  SaveResult,
  ImageHandlerOptions,
  isScrapedMoviePage,
  isScrapedPlaceDetail,
} from '../types/mocation';
import { MocationImageHandler } from './mocationImageHandler';

// ============================================================================
// JSON File Storage
// Requirements: 4.1
// ============================================================================

/**
 * Save scraped data to a JSON file
 * 
 * @param data - Array of scraped data to save
 * @param options - Save options including output path
 * @returns SaveResult with success status and file path
 * 
 * Requirements: 4.1
 */
export function saveToJson(data: ScrapedData[], options: SaveOptions): SaveResult {
  const { outputPath, prettyPrint = true } = options;
  
  try {
    // Resolve to absolute path
    const absolutePath = path.isAbsolute(outputPath)
      ? outputPath
      : path.resolve(process.cwd(), outputPath);
    
    // Ensure directory exists
    const dir = path.dirname(absolutePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Serialize data
    const jsonContent = prettyPrint
      ? JSON.stringify(data, null, 2)
      : JSON.stringify(data);
    
    // Write to file
    fs.writeFileSync(absolutePath, jsonContent, 'utf-8');
    
    return {
      success: true,
      filePath: absolutePath,
      recordCount: data.length,
    };
  } catch (error: any) {
    return {
      success: false,
      filePath: outputPath,
      recordCount: 0,
      error: error.message || 'Unknown error saving JSON file',
    };
  }
}

/**
 * Load scraped data from a JSON file
 * 
 * @param filePath - Path to JSON file
 * @returns Array of scraped data or null if failed
 */
export function loadFromJson(filePath: string): ScrapedData[] | null {
  try {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);
    
    if (!fs.existsSync(absolutePath)) {
      console.error(`❌ File not found: ${absolutePath}`);
      return null;
    }
    
    const content = fs.readFileSync(absolutePath, 'utf-8');
    const data = JSON.parse(content);
    
    if (!Array.isArray(data)) {
      console.error('❌ Invalid JSON format: expected array');
      return null;
    }
    
    return data as ScrapedData[];
  } catch (error: any) {
    console.error(`❌ Error loading JSON: ${error.message}`);
    return null;
  }
}

// ============================================================================
// Database Import
// Requirements: 4.2, 4.3, 4.4
// ============================================================================

/**
 * Parse city and country from cityCountry string
 * Format: "City, Country" or "City，Country" (Chinese comma)
 * 
 * @param cityCountry - Combined city/country string
 * @returns Object with city and country
 */
function parseCityCountry(cityCountry: string | null): { city: string | null; country: string | null } {
  if (!cityCountry) {
    return { city: null, country: null };
  }
  
  // Try both English and Chinese comma
  const separators = [',', '，', '、'];
  for (const sep of separators) {
    if (cityCountry.includes(sep)) {
      const parts = cityCountry.split(sep).map(s => s.trim());
      if (parts.length >= 2) {
        return {
          city: parts[0] || null,
          country: parts[parts.length - 1] || null,
        };
      }
    }
  }
  
  // No separator found, treat as city
  return {
    city: cityCountry.trim() || null,
    country: null,
  };
}

/**
 * Options for MocationImporter
 */
export interface MocationImporterOptions {
  /** Enable image processing (download and optionally upload to R2) */
  processImages?: boolean;
  /** Image handler options */
  imageHandlerOptions?: ImageHandlerOptions;
}

/**
 * MocationImporter class for database operations
 * 
 * Supports the new optimized ScrapedMoviePage structure:
 * - Movie info stored once per scrape
 * - Places array with individual place data
 * - Multiple movies per place (adds movie references to existing places)
 * 
 * Requirements: 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4
 */
export class MocationImporter {
  private supabase: SupabaseClient;
  private processImages: boolean;
  private imageHandler: MocationImageHandler | null;
  
  constructor(options?: MocationImporterOptions) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        'Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables.'
      );
    }
    
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.processImages = options?.processImages ?? false;
    this.imageHandler = this.processImages 
      ? new MocationImageHandler(options?.imageHandlerOptions)
      : null;
  }
  
  /**
   * Find existing place by name (and optionally city/country)
   * Searches by primary name and also checks i18n for Chinese name
   * Searches across all sources for better deduplication
   * Returns the place record if found, null otherwise
   * 
   * @param name - Place name (can be English or Chinese)
   * @param city - City (optional)
   * @param country - Country (optional)
   * @param nameZh - Chinese name (optional, for additional matching)
   * @returns Existing place record or null
   */
  async findExistingPlace(
    name: string, 
    city: string | null, 
    country: string | null,
    nameZh?: string | null
  ): Promise<{ id: string; custom_fields: MocationCustomFields | null; images: string[] | null } | null> {
    // Search by primary name first
    let query = this.supabase
      .from('places')
      .select('id, custom_fields, images, i18n')
      .eq('name', name);
    
    // Add city/country filters if available
    if (city) {
      query = query.eq('city', city);
    }
    if (country) {
      query = query.eq('country', country);
    }
    
    const { data, error } = await query.limit(1);
    
    if (error) {
      console.warn(`⚠️  Error finding place: ${error.message}`);
      return null;
    }
    
    if (data && data.length > 0) {
      return {
        id: data[0].id,
        custom_fields: data[0].custom_fields as MocationCustomFields | null,
        images: data[0].images as string[] | null,
      };
    }
    
    // Also try searching by Chinese name if provided
    if (nameZh && nameZh !== name) {
      let queryZh = this.supabase
        .from('places')
        .select('id, custom_fields, images, i18n')
        .eq('name', nameZh);
      
      if (city) {
        queryZh = queryZh.eq('city', city);
      }
      if (country) {
        queryZh = queryZh.eq('country', country);
      }
      
      const { data: dataZh, error: errorZh } = await queryZh.limit(1);
      
      if (!errorZh && dataZh && dataZh.length > 0) {
        return {
          id: dataZh[0].id,
          custom_fields: dataZh[0].custom_fields as MocationCustomFields | null,
          images: dataZh[0].images as string[] | null,
        };
      }
    }
    
    return null;
  }
  
  /**
   * Create a MovieReference from movie info and place data
   */
  private createMovieReference(movie: MovieInfo, place: MoviePlaceItem): MovieReference {
    return {
      movieId: movie.movieId,
      movieNameCn: movie.movieNameCn,
      movieNameEn: movie.movieNameEn,
      sceneDescription: place.sceneDescription,
      image: place.image,
      sourceUrl: movie.sourceUrl,
    };
  }
  
  /**
   * Get the Pilgrimage AI tag for mocation imports
   * All mocation data should be tagged with Pilgrimage (圣地巡礼)
   */
  private getPilgrimageTag(): Record<string, any> {
    return {
      kind: 'facet',
      id: 'Pilgrimage',
      en: 'Pilgrimage',
      zh: '圣地巡礼',
      priority: 85,
    };
  }
  
  /**
   * Add a movie reference to an existing place
   * Also updates images array with new stills
   * 
   * @param placeId - Database place ID
   * @param existingCustomFields - Existing custom_fields
   * @param existingImages - Existing images array
   * @param newMovieRef - New movie reference to add
   * @param newImages - New images to add
   * @returns true if updated successfully
   */
  async addMovieReference(
    placeId: string,
    existingCustomFields: MocationCustomFields | null,
    existingImages: string[] | null,
    newMovieRef: MovieReference,
    newImages?: string[]
  ): Promise<boolean> {
    // Get existing movies array or create new one
    const existingMovies = existingCustomFields?.movies || [];
    
    // Check if this movie is already referenced
    const movieExists = existingMovies.some(m => m.movieId === newMovieRef.movieId);
    if (movieExists) {
      return false; // Already has this movie reference
    }
    
    // Add new movie reference
    const updatedMovies = [...existingMovies, newMovieRef];
    const updatedCustomFields: MocationCustomFields = {
      ...existingCustomFields,
      movies: updatedMovies,
      sourceUrl: existingCustomFields?.sourceUrl || newMovieRef.sourceUrl,
    };
    
    // Merge images (avoid duplicates)
    const currentImages = existingImages || [];
    const imagesToAdd = newImages || [];
    const mergedImages = [...new Set([...currentImages, ...imagesToAdd])];
    
    const updateData: Record<string, any> = { 
      custom_fields: updatedCustomFields,
    };
    
    // Only update images if there are new ones
    if (imagesToAdd.length > 0) {
      updateData.images = mergedImages;
    }
    
    // Also add Pilgrimage tag if not present
    updateData.ai_tags = [this.getPilgrimageTag()];
    
    const { error } = await this.supabase
      .from('places')
      .update(updateData)
      .eq('id', placeId);
    
    if (error) {
      console.error(`❌ Error updating place ${placeId}: ${error.message}`);
      return false;
    }
    
    return true;
  }
  
  /**
   * Convert a place from ScrapedMoviePage to database insert format
   * 
   * Default language is English - use English name as primary `name` field.
   * Chinese name stored in `i18n.name_zh` for multilingual support.
   * Automatically adds Pilgrimage tag for all mocation imports.
   * 
   * @param movie - Movie info
   * @param place - Place data
   * @param _scrapedAt - Scrape timestamp (unused, kept for API compatibility)
   * @returns Database insert object
   */
  private convertMoviePagePlace(
    movie: MovieInfo, 
    place: MoviePlaceItem,
    _scrapedAt: string
  ): Record<string, any> {
    const { city, country } = parseCityCountry(place.cityCountry);
    
    const movieRef = this.createMovieReference(movie, place);
    
    // Use English name as primary, fallback to Chinese
    const primaryName = place.placeNameEn || place.placeName;
    
    // Build i18n object for multilingual support
    const i18n: Record<string, any> = {};
    if (place.placeName) {
      i18n.name_zh = place.placeName;
    }
    if (place.placeNameEn) {
      i18n.name_en = place.placeNameEn;
    }
    
    return {
      name: primaryName,
      description: place.sceneDescription,
      cover_image: place.image || null,
      images: place.image ? [place.image] : [],
      city,
      country,
      latitude: 0, // Will need geocoding later
      longitude: 0,
      source: 'mocation',
      source_detail: `movie:${movie.movieId}:${primaryName}`,
      ai_tags: [this.getPilgrimageTag()], // Auto-tag with Pilgrimage
      i18n: i18n,
      custom_fields: {
        movies: [movieRef],
        sourceUrl: movie.sourceUrl,
      } as MocationCustomFields,
      is_verified: false,
    };
  }
  
  /**
   * Convert ScrapedPlaceDetail to database insert format
   * 
   * Default language is English - use English name as primary `name` field.
   * Chinese name stored in `i18n.name_zh` for multilingual support.
   * Automatically adds Pilgrimage tag for all mocation imports.
   * Limits stills to 10 per movie.
   * 
   * @param data - Scraped place detail data
   * @returns Database insert object
   */
  private convertPlaceDetail(data: ScrapedPlaceDetail): Record<string, any> {
    const MAX_STILLS_PER_MOVIE = 10;
    
    // Convert movies to MovieReference format, limiting stills to 10 per movie
    const movieRefs: MovieReference[] = data.movies.map(movie => ({
      movieId: movie.movieId || 'unknown',
      movieNameCn: movie.movieNameCn,
      movieNameEn: movie.movieNameEn,
      sceneDescription: movie.sceneDescription,
      image: movie.stills[0] || null, // Use first still as representative image
      sourceUrl: data.sourceUrl,
    }));
    
    // Collect all stills from all movies (max 10 per movie)
    const allStills: string[] = [];
    for (const movie of data.movies) {
      const limitedStills = movie.stills.slice(0, MAX_STILLS_PER_MOVIE);
      allStills.push(...limitedStills);
    }
    
    // Use English name as primary, fallback to Chinese
    const primaryName = data.placeNameEn || data.placeName || `Mocation Place ${data.sourceId}`;
    
    // Build i18n object for multilingual support
    const i18n: Record<string, any> = {};
    if (data.placeName) {
      i18n.name_zh = data.placeName;
    }
    if (data.placeNameEn) {
      i18n.name_en = data.placeNameEn;
    }
    
    return {
      name: primaryName,
      address: data.address,
      phone_number: data.phone,
      cover_image: data.coverImage || allStills[0] || null,
      images: allStills,
      latitude: 0, // Will need geocoding later
      longitude: 0,
      source: 'mocation',
      source_detail: `place:${data.sourceId}`,
      ai_tags: [this.getPilgrimageTag()], // Auto-tag with Pilgrimage
      i18n: i18n,
      custom_fields: {
        movies: movieRefs,
        sourceUrl: data.sourceUrl,
      } as MocationCustomFields,
      is_verified: false,
    };
  }
  
  /**
   * Process a single image URL (download and optionally upload to R2)
   * 
   * @param imageUrl - Image URL to process
   * @returns Processed image URL
   */
  async processImage(imageUrl: string | null): Promise<string | null> {
    if (!imageUrl || !this.imageHandler || !this.processImages) {
      return imageUrl;
    }
    
    try {
      const result = await this.imageHandler.downloadAndUpload(imageUrl);
      if (result.success && result.r2Url) {
        return result.r2Url;
      }
      return imageUrl;
    } catch (error: any) {
      console.warn(`⚠️ Image processing failed: ${error.message}`);
      return imageUrl;
    }
  }
  
  /**
   * Import a single place from a movie page
   * Handles both new inserts and updates (adding movie references)
   * 
   * @param movie - Movie info
   * @param place - Place data
   * @param scrapedAt - Scrape timestamp
   * @returns 'imported' | 'updated' | 'skipped' | 'error'
   */
  async importMoviePlace(
    movie: MovieInfo,
    place: MoviePlaceItem,
    scrapedAt: string
  ): Promise<'imported' | 'updated' | 'skipped' | 'error'> {
    try {
      const { city, country } = parseCityCountry(place.cityCountry);
      
      // Use English name as primary for lookup
      const primaryName = place.placeNameEn || place.placeName;
      
      // Check if place already exists (search by both English and Chinese names)
      const existingPlace = await this.findExistingPlace(primaryName, city, country, place.placeName);
      
      if (existingPlace) {
        // Place exists - try to add movie reference
        const movieRef = this.createMovieReference(movie, place);
        const newImages = place.image ? [place.image] : [];
        const updated = await this.addMovieReference(
          existingPlace.id,
          existingPlace.custom_fields,
          existingPlace.images,
          movieRef,
          newImages
        );
        
        return updated ? 'updated' : 'skipped';
      }
      
      // Process image if enabled
      const processedImage = await this.processImage(place.image);
      const placeWithProcessedImage = { ...place, image: processedImage };
      
      // New place - insert
      const insertData = this.convertMoviePagePlace(movie, placeWithProcessedImage, scrapedAt);
      
      const { error } = await this.supabase
        .from('places')
        .insert(insertData);
      
      if (error) {
        console.error(`❌ Insert error for ${place.placeName}: ${error.message}`);
        return 'error';
      }
      
      return 'imported';
    } catch (error: any) {
      console.error(`❌ Import error for ${place.placeName}: ${error.message}`);
      return 'error';
    }
  }
  
  /**
   * Import a ScrapedMoviePage (movie info + places array)
   * 
   * @param data - Scraped movie page data
   * @returns Import statistics for this page
   */
  async importMoviePage(data: ScrapedMoviePage): Promise<{
    imported: number;
    updated: number;
    skipped: number;
    failed: number;
  }> {
    const stats = { imported: 0, updated: 0, skipped: 0, failed: 0 };
    
    for (const place of data.places) {
      const status = await this.importMoviePlace(data.movie, place, data.scrapedAt);
      
      switch (status) {
        case 'imported':
          stats.imported++;
          break;
        case 'updated':
          stats.updated++;
          break;
        case 'skipped':
          stats.skipped++;
          break;
        case 'error':
          stats.failed++;
          break;
      }
    }
    
    return stats;
  }
  
  /**
   * Import a ScrapedPlaceDetail
   * Place detail pages contain a place with multiple associated movies and their stills.
   * 
   * @param data - Scraped place detail data
   * @returns 'imported' | 'skipped' | 'error'
   */
  async importPlaceDetail(data: ScrapedPlaceDetail): Promise<'imported' | 'skipped' | 'error'> {
    try {
      // Check if place already exists by name
      const existingPlace = await this.findExistingPlace(
        data.placeName || `Mocation Place ${data.sourceId}`,
        null,
        null
      );
      
      if (existingPlace) {
        return 'skipped';
      }
      
      // Process images if enabled
      if (this.imageHandler && this.processImages) {
        if (data.coverImage) {
          data.coverImage = await this.processImage(data.coverImage);
        }
        // Process stills for each movie
        for (const movie of data.movies) {
          if (movie.stills.length > 0) {
            const processedStills = await Promise.all(
              movie.stills.map(url => this.processImage(url))
            );
            movie.stills = processedStills.filter((url): url is string => url !== null);
          }
        }
      }
      
      const insertData = this.convertPlaceDetail(data);
      
      const { error } = await this.supabase
        .from('places')
        .insert(insertData);
      
      if (error) {
        console.error(`❌ Insert error for ${data.sourceId}: ${error.message}`);
        return 'error';
      }
      
      return 'imported';
    } catch (error: any) {
      console.error(`❌ Import error for ${data.sourceId}: ${error.message}`);
      return 'error';
    }
  }
  
  /**
   * Import all scraped data to the database
   * Handles both ScrapedMoviePage and ScrapedPlaceDetail types
   * 
   * @param data - Array of scraped data
   * @param onProgress - Progress callback
   * @returns ImportResult with statistics
   * 
   * Requirements: 4.2, 4.3, 4.4
   */
  async importAll(
    data: ScrapedData[],
    onProgress?: (current: number, total: number) => void
  ): Promise<ImportResult> {
    const startTime = new Date().toISOString();
    
    // Count total places for progress tracking
    let totalPlaces = 0;
    for (const item of data) {
      if (isScrapedMoviePage(item)) {
        totalPlaces += item.places.length;
      } else {
        totalPlaces += 1;
      }
    }
    
    const result: ImportResult = {
      total: totalPlaces,
      imported: 0,
      skipped: 0,
      updated: 0,
      failed: 0,
      errors: [],
      startedAt: startTime,
      completedAt: '',
    };
    
    console.log(`\n📥 Starting import of ${data.length} pages (${totalPlaces} places)...`);
    
    let processedPlaces = 0;
    
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      
      if (isScrapedMoviePage(item)) {
        // Handle ScrapedMoviePage (new optimized format)
        const movieName = item.movie.movieNameCn || item.movie.movieNameEn || item.movie.movieId;
        console.log(`   📽️  Processing movie: ${movieName} (${item.places.length} places)`);
        
        const pageStats = await this.importMoviePage(item);
        
        result.imported += pageStats.imported;
        result.updated += pageStats.updated;
        result.skipped += pageStats.skipped;
        result.failed += pageStats.failed;
        
        processedPlaces += item.places.length;
        
        if (pageStats.failed > 0) {
          result.errors.push({
            id: item.movie.movieId,
            error: `${pageStats.failed} places failed to import`,
          });
        }
      } else if (isScrapedPlaceDetail(item)) {
        // Handle ScrapedPlaceDetail
        const status = await this.importPlaceDetail(item);
        
        switch (status) {
          case 'imported':
            result.imported++;
            break;
          case 'skipped':
            result.skipped++;
            break;
          case 'error':
            result.failed++;
            result.errors.push({
              id: item.sourceId,
              error: 'Failed to import',
            });
            break;
        }
        
        processedPlaces += 1;
      }
      
      if (onProgress) {
        onProgress(processedPlaces, totalPlaces);
      }
      
      // Log progress every 50 places or at the end
      if (processedPlaces % 50 === 0 || i === data.length - 1) {
        console.log(`   Progress: ${processedPlaces}/${totalPlaces} (imported: ${result.imported}, updated: ${result.updated}, skipped: ${result.skipped}, failed: ${result.failed})`);
      }
    }
    
    result.completedAt = new Date().toISOString();
    
    // Cleanup temporary files if image processing was enabled
    if (this.imageHandler) {
      this.imageHandler.cleanupDownloadDir();
    }
    
    return result;
  }
  
  /**
   * Cleanup temporary image files
   */
  cleanup(): void {
    if (this.imageHandler) {
      this.imageHandler.cleanupDownloadDir();
    }
  }
  
  /**
   * Check if image processing is enabled
   */
  isImageProcessingEnabled(): boolean {
    return this.processImages && this.imageHandler !== null;
  }
}

// ============================================================================
// Export utilities
// ============================================================================

export { parseCityCountry };
export { MocationImageHandler } from './mocationImageHandler';
