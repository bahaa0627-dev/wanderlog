/**
 * Apify Data Import Type Definitions
 * 
 * Types for importing Google Places data from Apify crawler (compass/crawler-google-places)
 * into the Supabase database.
 */

// ============================================================================
// Apify Input Types (from crawler)
// ============================================================================

/**
 * Location coordinates from Apify
 */
export interface ApifyLocation {
  lat: number;
  lng: number;
}

/**
 * Opening hours entry from Apify
 */
export interface ApifyOpeningHoursEntry {
  day: string;
  hours: string;
}

/**
 * Review tag from Apify
 */
export interface ApifyReviewTag {
  title: string;
  count: number;
}

/**
 * Reviews distribution from Apify
 */
export interface ApifyReviewsDistribution {
  oneStar: number;
  twoStar: number;
  threeStar: number;
  fourStar: number;
  fiveStar: number;
}

/**
 * Popular times histogram entry
 */
export interface ApifyPopularTimesEntry {
  hour: number;
  occupancyPercent: number;
}

/**
 * Popular times histogram by day
 */
export interface ApifyPopularTimesHistogram {
  Su?: ApifyPopularTimesEntry[];
  Mo?: ApifyPopularTimesEntry[];
  Tu?: ApifyPopularTimesEntry[];
  We?: ApifyPopularTimesEntry[];
  Th?: ApifyPopularTimesEntry[];
  Fr?: ApifyPopularTimesEntry[];
  Sa?: ApifyPopularTimesEntry[];
}

/**
 * Main Apify Place Item interface
 * Based on compass/crawler-google-places output format
 */
export interface ApifyPlaceItem {
  // Basic info
  title: string;
  subTitle?: string | null;
  price?: string | null;                    // e.g., "€1–10"
  categoryName?: string | null;             // e.g., "Coffee shop"
  description?: string | null;
  
  // Address fields
  address?: string | null;
  neighborhood?: string | null;
  street?: string | null;
  city?: string | null;
  postalCode?: string | null;
  state?: string | null;
  countryCode?: string | null;              // ISO2 format, e.g., "FR"
  plusCode?: string | null;
  
  // Contact info
  website?: string | null;
  phone?: string | null;
  phoneUnformatted?: string | null;
  
  // Location
  location: ApifyLocation;
  
  // Ratings
  totalScore?: number | null;               // e.g., 4.5
  reviewsCount?: number | null;
  reviewsDistribution?: ApifyReviewsDistribution | null;
  
  // Status
  permanentlyClosed?: boolean;
  temporarilyClosed?: boolean;
  
  // Google identifiers
  placeId: string;                          // e.g., "ChIJZ7SPu5xv5kcRGMfYOG3bVhs"
  fid?: string | null;                      // e.g., "0x47e66f9cbb8fb467:0x1b56db6d38d8c718"
  cid?: string | null;                      // e.g., "1970003149172819736"
  kgmid?: string | null;                    // e.g., "/g/11sz9_n_12"
  
  // Categories
  categories?: string[] | null;             // e.g., ["Coffee shop", "Cafe"]
  
  // Images
  imageUrl?: string | null;
  imagesCount?: number | null;
  imageCategories?: string[] | null;
  imageUrls?: string[] | null;
  
  // Opening hours
  openingHours?: ApifyOpeningHoursEntry[] | null;
  
  // Reviews and tags
  reviewsTags?: ApifyReviewTag[] | null;
  
  // Additional info (service options, highlights, etc.)
  additionalInfo?: Record<string, Array<Record<string, boolean>>> | null;
  
  // Popular times
  popularTimesHistogram?: ApifyPopularTimesHistogram | null;
  popularTimesLiveText?: string | null;
  popularTimesLivePercent?: number | null;
  
  // Scraping metadata
  scrapedAt?: string | null;                // ISO timestamp
  url?: string | null;
  searchPageUrl?: string | null;
  searchString?: string | null;
  language?: string | null;
  rank?: number | null;
  isAdvertisement?: boolean;
  
  // Other fields
  claimThisBusiness?: boolean;
  locatedIn?: string | null;
  menu?: string | null;
  
  // Hotel-specific (usually null for non-hotels)
  hotelStars?: number | null;
  hotelDescription?: string | null;
  hotelAds?: unknown[];
  
  // Input tracking
  inputPlaceId?: string | null;
  userPlaceNote?: string | null;
}

// ============================================================================
// Import Configuration Types
// ============================================================================

/**
 * Options for import operations
 */
export interface ImportOptions {
  /** Batch size for bulk operations, default 100 */
  batchSize?: number;
  /** Only validate data without writing to database */
  dryRun?: boolean;
  /** Skip image download and R2 upload */
  skipImages?: boolean;
  /** Delay between batches in milliseconds, default 100 */
  delayMs?: number;
  /** Maximum retries for failed operations */
  maxRetries?: number;
}

// ============================================================================
// Import Result Types
// ============================================================================

/**
 * Statistics about the import operation
 */
export interface ImportStats {
  /** Number of unique cities in imported data */
  cityCount: number;
  /** Distribution of places by category */
  categoryDistribution: Record<string, number>;
  /** Percentage of places with cover images (0-100) */
  coverImageRate: number;
  /** Percentage of places with opening hours (0-100) */
  openingHoursRate: number;
  /** Percentage of places with all required fields (0-100) */
  requiredFieldsRate: number;
}

/**
 * Error information for failed imports
 */
export interface ImportError {
  /** Google Place ID if available */
  placeId?: string;
  /** Place name if available */
  name?: string;
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
  inserted: number;
  /** Number of existing places updated */
  updated: number;
  /** Number of items skipped (validation failures) */
  skipped: number;
  /** Number of items that failed to import */
  failed: number;
  /** List of errors encountered */
  errors: ImportError[];
  /** Import statistics */
  stats: ImportStats;
}

/**
 * Result of importing a single place
 */
export interface PlaceImportResult {
  /** Whether the import was successful */
  success: boolean;
  /** Action taken: 'inserted', 'updated', 'skipped', 'failed' */
  action: 'inserted' | 'updated' | 'skipped' | 'failed';
  /** Place ID in database if successful */
  placeId?: string;
  /** Google Place ID */
  googlePlaceId?: string;
  /** Error message if failed */
  error?: string;
}

// ============================================================================
// Mapped Place Types (for database)
// ============================================================================

/**
 * Search hit record for tracking multiple imports
 */
export interface SearchHit {
  searchString: string;
  rank: number;
  scrapedAt: string;
  searchPageUrl?: string;
}

/**
 * Source details for Apify imports
 */
export interface ApifySourceDetails {
  scrapedAt: string;
  searchString?: string;
  rank?: number;
  fid?: string;
  cid?: string;
  kgmid?: string;
  searchHits: SearchHit[];
}

/**
 * Source details wrapper
 */
export interface SourceDetails {
  apify: ApifySourceDetails;
}

/**
 * Custom fields for additional data storage
 */
export interface CustomFields {
  /** Price text from Apify, e.g., "€1–10" */
  priceText?: string;
  /** R2 storage key for cover image */
  r2Key?: string;
  /** Original image URL from Apify */
  imageSourceUrl?: string;
  /** Timestamp when image was migrated to R2 */
  imageMigratedAt?: string;
  /** Additional info from Apify (service options, highlights, etc.) */
  additionalInfo?: Record<string, unknown>;
  /** Review tags from Apify */
  reviewsTags?: ApifyReviewTag[];
  /** Popular times histogram */
  popularTimes?: ApifyPopularTimesHistogram;
  /** Reviews distribution */
  reviewsDistribution?: ApifyReviewsDistribution;
  /** Raw categories array from Apify */
  categoriesRaw?: string[];
  /** Google IDs for reference */
  googleIds?: {
    fid?: string;
    cid?: string;
  };
}

/**
 * Mapped place ready for database insertion
 */
export interface MappedPlace {
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  city?: string;
  country?: string;
  rating?: number;
  ratingCount?: number;
  googlePlaceId?: string;
  website?: string;
  phoneNumber?: string;
  openingHours?: string;  // JSON string
  description?: string;
  source: 'apify_google_places';
  sourceDetails: SourceDetails;
  customFields: CustomFields;
}

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Result of data validation
 */
export interface ValidationResult {
  /** Whether the data is valid */
  valid: boolean;
  /** List of validation errors */
  errors: string[];
  /** List of validation warnings */
  warnings: string[];
}

/**
 * Required fields for Apify import
 */
export const REQUIRED_FIELDS = [
  'placeId',
  'city',
  'countryCode',
  'location.lat',
  'location.lng',
] as const;

// ============================================================================
// Image Processing Types
// ============================================================================

/**
 * Result of image upload to R2
 */
export interface ImageUploadResult {
  /** Whether the upload was successful */
  success: boolean;
  /** R2 storage key */
  r2Key?: string;
  /** Public URL for the image */
  publicUrl?: string;
  /** Error message if failed */
  error?: string;
}

// ============================================================================
// Merge Strategy Types
// ============================================================================

/**
 * Merge strategy configuration
 */
export interface MergeStrategy {
  /** Fields where new non-null values overwrite old values */
  nonNullOverwrite: string[];
  /** Fields where the greater value is kept */
  takeGreater: string[];
  /** Fields where the newer value (by scrapedAt) is kept */
  takeNewer: string[];
  /** Fields where arrays are appended */
  appendArray: string[];
}

/**
 * Default merge strategy for Apify imports
 */
export const DEFAULT_MERGE_STRATEGY: MergeStrategy = {
  nonNullOverwrite: ['name', 'address', 'website', 'phoneNumber', 'description'],
  takeGreater: ['ratingCount'],
  takeNewer: ['openingHours', 'rating'],
  appendArray: ['sourceDetails.apify.searchHits'],
};

// ============================================================================
// Import Report Types (Requirements 7.1-7.6)
// ============================================================================

/**
 * Field coverage statistics for the import report
 */
export interface FieldCoverageStats {
  /** Total number of items analyzed */
  total: number;
  /** Number of items with this field present */
  present: number;
  /** Coverage rate as percentage (0-100) */
  rate: number;
}

/**
 * Required fields coverage breakdown
 * Requirement 7.2: Statistics for required field coverage
 */
export interface RequiredFieldsCoverage {
  city: FieldCoverageStats;
  country: FieldCoverageStats;
  latitude: FieldCoverageStats;
  longitude: FieldCoverageStats;
  coverImage: FieldCoverageStats;
  /** Overall coverage rate (all required fields present) */
  overall: FieldCoverageStats;
}

/**
 * Duplicate detection result
 * Requirement 7.5: Detect duplicate rate within same city
 */
export interface DuplicateInfo {
  /** Google Place ID */
  placeId: string;
  /** Place name */
  name: string;
  /** City where duplicate was found */
  city: string;
  /** Number of occurrences */
  count: number;
}

/**
 * Import validation report
 * Requirements 7.1-7.6
 */
export interface ImportReport {
  /** Report generation timestamp */
  generatedAt: string;
  /** Whether this was a dry-run (Requirement 7.6) */
  isDryRun: boolean;
  /** Total items analyzed */
  totalItems: number;
  
  /** Summary statistics (Requirement 7.1) */
  summary: {
    inserted: number;
    updated: number;
    skipped: number;
    failed: number;
  };
  
  /** Required fields coverage (Requirement 7.2) */
  requiredFieldsCoverage: RequiredFieldsCoverage;
  
  /** Opening hours coverage (Requirement 7.3) */
  openingHoursCoverage: FieldCoverageStats;
  
  /** Cover image availability (Requirement 7.4) */
  coverImageCoverage: FieldCoverageStats;
  
  /** Duplicate detection (Requirement 7.5) */
  duplicates: {
    /** Total number of duplicate placeIds found */
    totalDuplicates: number;
    /** Duplicate rate as percentage */
    duplicateRate: number;
    /** List of duplicates with details */
    items: DuplicateInfo[];
  };
  
  /** Category distribution */
  categoryDistribution: Record<string, number>;
  
  /** City distribution */
  cityDistribution: Record<string, number>;
  
  /** Errors encountered */
  errors: ImportError[];
}
