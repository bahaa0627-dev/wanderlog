/**
 * Mocation Scraper Type Definitions
 * 
 * Types for scraping mocation.cc website (movie_detail and place_detail pages)
 * and importing place data into the Supabase database.
 */

// ============================================================================
// Scraper Configuration Types
// ============================================================================

/**
 * Options for MocationScraper initialization
 */
export interface MocationScraperOptions {
  /** Whether to use headless browser mode, default true */
  headless?: boolean;
  /** Page load timeout in milliseconds, default 30000 */
  timeout?: number;
  /** Delay between requests in milliseconds, default 2000 */
  delay?: number;
}

// ============================================================================
// Scraped Data Types (Optimized Structure)
// ============================================================================

/**
 * Movie information (shared across all places in a movie)
 */
export interface MovieInfo {
  /** Movie ID from mocation */
  movieId: string;
  /** Movie Chinese name */
  movieNameCn: string | null;
  /** Movie English name */
  movieNameEn: string | null;
  /** Source URL */
  sourceUrl: string;
  /** Total place count in this movie */
  placeCount: number | null;
}

/**
 * Individual place/location from a movie
 */
export interface MoviePlaceItem {
  /** Place Chinese name */
  placeName: string;
  /** Place English name */
  placeNameEn: string | null;
  /** City, Country */
  cityCountry: string | null;
  /** Scene description */
  sceneDescription: string | null;
  /** Scene image URL */
  image: string | null;
  /** Episode number (for TV series) */
  episode: string | null;
  /** Position/timestamp in movie */
  position: string | null;
}

/**
 * Movie page scraped result (optimized - movie info + places array)
 */
export interface ScrapedMoviePage {
  /** Page type identifier */
  sourceType: 'movie';
  /** Movie information (stored once) */
  movie: MovieInfo;
  /** List of places in this movie */
  places: MoviePlaceItem[];
  /** Scrape timestamp (ISO format) */
  scrapedAt: string;
}

/**
 * Legacy format for backward compatibility
 * @deprecated Use ScrapedMoviePage instead
 */
export interface ScrapedMoviePlace {
  /** Original page ID */
  sourceId: string;
  /** Page type identifier */
  sourceType: 'movie';
  /** Original URL */
  sourceUrl: string;
  /** Movie/drama name (div.h11.alic) */
  movieName: string | null;
  /** Place name (div.fs16.pb5) */
  placeName: string | null;
  /** City, Country (div.fs12.pb5) */
  cityCountry: string | null;
  /** Scene description (div.fs12.c88) */
  sceneDescription: string | null;
  /** Scene images (img[alt="剧照"]) */
  images: string[];
  /** Number of places (.fs36.mocation-num) */
  placeCount: number | null;
  /** Scrape timestamp (ISO format) */
  scrapedAt: string;
}

/**
 * Place Detail page scraped data
 * Source: /html/place_detail.html?id=xxx
 * 
 * A place can be associated with multiple movies, each with its own stills.
 */
export interface ScrapedPlaceDetail {
  /** Original page ID */
  sourceId: string;
  /** Page type identifier */
  sourceType: 'place';
  /** Original URL */
  sourceUrl: string;
  /** Place name (div.fs21.mb5) */
  placeName: string | null;
  /** Place English name */
  placeNameEn: string | null;
  /** Cover image URL (img.mb20.img100[alt="封面"]) */
  coverImage: string | null;
  /** Address (div.fs12.mb20) */
  address: string | null;
  /** Phone number */
  phone: string | null;
  /** Movies associated with this place, each with their own stills */
  movies: PlaceMovieScene[];
  /** Scrape timestamp (ISO format) */
  scrapedAt: string;
}

/**
 * Movie scene data for a place (from place_detail page)
 */
export interface PlaceMovieScene {
  /** Movie ID */
  movieId: string | null;
  /** Movie Chinese name */
  movieNameCn: string | null;
  /** Movie English name */
  movieNameEn: string | null;
  /** Scene description */
  sceneDescription: string | null;
  /** Stills (剧照) for this movie at this place */
  stills: string[];
}

/**
 * Union type for all scraped data
 */
export type ScrapedData = ScrapedMoviePage | ScrapedPlaceDetail;

// ============================================================================
// Scrape Result Types
// ============================================================================

/**
 * Error information for failed scrapes
 */
export interface ScrapeError {
  /** Page ID that failed */
  id: string;
  /** Page type */
  type: 'movie' | 'place';
  /** Error message */
  error: string;
  /** Error code if applicable */
  code?: string;
}

/**
 * Result of a batch scrape operation
 */
export interface ScrapeResult {
  /** Total number of pages attempted */
  total: number;
  /** Number of successfully scraped pages */
  success: number;
  /** Number of failed pages */
  failed: number;
  /** Number of skipped pages (404 or empty) */
  skipped: number;
  /** Successfully scraped data */
  data: ScrapedData[];
  /** Total places extracted (for movie pages, sum of all places) */
  totalPlaces: number;
  /** List of errors encountered */
  errors: ScrapeError[];
  /** Scrape start timestamp */
  startedAt: string;
  /** Scrape end timestamp */
  completedAt: string;
}

// ============================================================================
// Import Types (for database)
// ============================================================================

/**
 * Movie reference for a place (supports multiple movies per place)
 */
export interface MovieReference {
  /** Movie ID from mocation */
  movieId: string;
  /** Movie Chinese name */
  movieNameCn: string | null;
  /** Movie English name */
  movieNameEn: string | null;
  /** Scene description in this movie */
  sceneDescription: string | null;
  /** Scene image from this movie */
  image: string | null;
  /** Source URL */
  sourceUrl: string;
}

/**
 * Custom fields for mocation imports
 */
export interface MocationCustomFields {
  /** List of movies this place appears in */
  movies: MovieReference[];
  /** Original source URL (first movie) */
  sourceUrl: string;
}

/**
 * Place data for database insertion
 */
export interface MocationPlaceInsert {
  /** Place name (English preferred) */
  name: string;
  /** Place English name */
  name_en: string | null;
  /** Place Chinese name */
  name_zh: string | null;
  /** Scene description (from first movie) */
  description: string | null;
  /** First image as cover */
  cover_image: string | null;
  /** All scene images */
  images: string[];
  /** City (parsed from cityCountry) */
  city: string | null;
  /** Country (parsed from cityCountry) */
  country: string | null;
  /** Address */
  address: string | null;
  /** Phone number */
  phone: string | null;
  /** Data source identifier */
  source: 'mocation';
  /** Original page ID */
  source_id: string;
  /** Additional custom fields */
  custom_fields: MocationCustomFields;
}

// ============================================================================
// Import Result Types
// ============================================================================

/**
 * Error information for failed imports
 */
export interface ImportError {
  /** Source ID */
  id: string;
  /** Error message */
  error: string;
  /** Error code if applicable */
  code?: string;
}

/**
 * Result of an import operation
 */
export interface ImportResult {
  /** Total number of items processed */
  total: number;
  /** Number of new places inserted */
  imported: number;
  /** Number of items skipped (duplicates) */
  skipped: number;
  /** Number of places updated (added new movie reference) */
  updated: number;
  /** Number of items that failed to import */
  failed: number;
  /** List of errors encountered */
  errors: ImportError[];
  /** Import start timestamp */
  startedAt: string;
  /** Import end timestamp */
  completedAt: string;
}

/**
 * Options for saving scraped data to JSON file
 */
export interface SaveOptions {
  /** Output file path */
  outputPath: string;
  /** Whether to pretty print JSON (default: true) */
  prettyPrint?: boolean;
}

/**
 * Result of saving data to JSON file
 */
export interface SaveResult {
  /** Whether save was successful */
  success: boolean;
  /** Absolute path to saved file */
  filePath: string;
  /** Number of records saved */
  recordCount: number;
  /** Error message if failed */
  error?: string;
}

// ============================================================================
// Image Handler Types
// ============================================================================

/**
 * Options for ImageHandler
 */
export interface ImageHandlerOptions {
  /** Local directory for downloaded images */
  downloadDir?: string;
  /** Whether to upload images to R2 */
  uploadToR2?: boolean;
}

/**
 * Result of image processing
 */
export interface ImageProcessResult {
  /** Original URL */
  originalUrl: string;
  /** Local file path (if downloaded) */
  localPath?: string;
  /** R2 URL (if uploaded) */
  r2Url?: string;
  /** Final URL to use */
  finalUrl: string;
  /** Whether processing was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

// ============================================================================
// CLI Types
// ============================================================================

/**
 * CLI argument options
 */
export interface CLIOptions {
  /** Page type to scrape */
  type: 'movie' | 'place';
  /** Start ID for range scraping */
  start: number;
  /** End ID for range scraping */
  end: number;
  /** Output file path for JSON */
  output?: string;
  /** Delay between requests in milliseconds */
  delay?: number;
  /** Dry run mode (scrape only, no import) */
  dryRun?: boolean;
  /** Import directly to database */
  import?: boolean;
  /** Show help */
  help?: boolean;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if scraped data is from movie_detail page
 */
export function isScrapedMoviePage(data: ScrapedData): data is ScrapedMoviePage {
  return data.sourceType === 'movie';
}

/**
 * Type guard to check if scraped data is from place_detail page
 */
export function isScrapedPlaceDetail(data: ScrapedData): data is ScrapedPlaceDetail {
  return data.sourceType === 'place';
}

// Legacy type guards for backward compatibility
export const isScrapedMoviePlace = isScrapedMoviePage;

// ============================================================================
// Constants
// ============================================================================

/**
 * Base URL for mocation.cc
 */
export const MOCATION_BASE_URL = 'https://prd.mocation.cc';

/**
 * URL templates for different page types
 */
export const MOCATION_URL_TEMPLATES = {
  movie: `${MOCATION_BASE_URL}/html/movie_detail.html?id=`,
  place: `${MOCATION_BASE_URL}/html/place_detail.html?id=`,
} as const;

/**
 * Default scraper options
 */
export const DEFAULT_SCRAPER_OPTIONS: Required<MocationScraperOptions> = {
  headless: true,
  timeout: 30000,
  delay: 2000,
};

/**
 * CSS selectors for movie_detail page
 */
export const MOVIE_DETAIL_SELECTORS = {
  movieName: 'div.h11.alic',
  placeName: 'div.fs16.pb5',
  cityCountry: 'div.fs12.pb5',
  sceneDescription: 'div.fs12.c88',
  images: 'img[alt="剧照"]',
  placeCount: '.fs36.mocation-num',
} as const;

/**
 * CSS selectors for place_detail page
 */
export const PLACE_DETAIL_SELECTORS = {
  placeName: 'div.fs21.mb5',
  coverImage: 'img.mb20.img100[alt="封面"]',
  address: 'div.fs12.mb20',
  images: 'img[alt="剧照"]',
} as const;
