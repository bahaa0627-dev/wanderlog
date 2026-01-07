/**
 * Pritzker Architecture Import Type Definitions
 * 普利兹克奖建筑作品导入类型定义
 * 
 * Types for importing Pritzker Prize architect works from Wikidata JSON
 * into the Place database.
 */

// ============================================================================
// Input Types (from Wikidata JSON)
// ============================================================================

/**
 * Raw entry from Wikidata Architecture list.json
 * Represents a single building/work entry from the scraped data
 */
export interface WikidataArchitectureEntry {
  /** Wikidata URL for architect, e.g., "http://www.wikidata.org/entity/Q134165" */
  architect: string;
  /** Architect name, e.g., "Oscar Niemeyer" */
  architectLabel: string;
  /** Wikidata URL for work, e.g., "http://www.wikidata.org/entity/Q281521" */
  work: string;
  /** Work/building name, e.g., "Sambadrome Marquês de Sapucaí" */
  workLabel: string;
  /** Wikimedia Commons image URL (optional) */
  image?: string;
  /** Coordinates in "Point(lng lat)" format (optional) */
  coord?: string;
  /** City name (optional) */
  cityLabel?: string;
  /** Country name (optional) */
  countryLabel?: string;
}

// ============================================================================
// Intermediate Types (after deduplication)
// ============================================================================

/**
 * Building data after deduplication and merging
 * Multiple entries with the same Wikidata QID are merged into one
 */
export interface DeduplicatedBuilding {
  /** Wikidata QID for the work, e.g., "Q281521" */
  wikidataQID: string;
  /** Wikidata QID for the architect, e.g., "Q134165" */
  architectQID: string;
  /** Architect name */
  architectLabel: string;
  /** Work/building name */
  workLabel: string;
  /** Latitude coordinate */
  latitude: number;
  /** Longitude coordinate */
  longitude: number;
  /** All associated city names (from duplicate entries) */
  cities: string[];
  /** Country name */
  country: string;
  /** All collected image URLs (deduplicated) */
  images: string[];
}

// ============================================================================
// Output Types (for database import)
// ============================================================================

/**
 * Tag structure for Place records
 */
export interface PlaceTags {
  /** Award tags, e.g., ["Pritzker"] */
  award: string[];
  /** Style tags, e.g., ["Architecture", "Modernism"] */
  style: string[];
  /** Architect tags, e.g., ["OscarNiemeyer"] */
  architect: string[];
}

/**
 * AI tag with priority for display ordering
 */
export interface AiTag {
  /** English tag name */
  en: string;
  /** Chinese tag name (optional, handled by i18n) */
  zh?: string;
  /** Priority for display ordering (higher = more important) */
  priority: number;
}

/**
 * Custom fields for additional data storage
 */
export interface PritzkerCustomFields {
  /** Architect name for reference */
  architect: string;
  /** Architect Wikidata QID */
  architectQID: string;
  /** Original Wikidata work URL */
  wikidataWorkURL: string;
  /** Year built (from AI enrichment) */
  yearBuilt?: number;
  /** Whether content was AI-generated */
  aiGenerated?: boolean;
}

/**
 * Data structure for importing a place to the database
 */
export interface PlaceImportData {
  /** Building/work name */
  name: string;
  /** City name */
  city: string;
  /** Country name */
  country: string;
  /** Latitude coordinate */
  latitude: number;
  /** Longitude coordinate */
  longitude: number;
  /** Cover image URL (first image) */
  coverImage: string | null;
  /** All image URLs */
  images: string[];
  /** Data source identifier */
  source: 'wikidata';
  /** Wikidata QID as source detail */
  sourceDetail: string;
  /** Whether the place is verified */
  isVerified: boolean;
  /** Category slug */
  category: string;
  /** Category slug (same as category) */
  categorySlug: string;
  /** Category English name */
  categoryEn: string;
  /** Category Chinese name */
  categoryZh: string;
  /** Structured tags */
  tags: PlaceTags;
  /** AI tags with priority */
  aiTags: AiTag[];
  /** Custom fields for additional data */
  customFields: PritzkerCustomFields;
  /** Description (from AI enrichment) */
  description?: string;
  /** Address (from AI enrichment) */
  address?: string;
  /** Website (from AI enrichment) */
  website?: string;
}

// ============================================================================
// Import Report Types
// ============================================================================

/**
 * Record that was skipped during import
 */
export interface SkippedRecord {
  /** Wikidata QID of the skipped record */
  wikidataQID: string;
  /** Reason for skipping */
  reason: string;
}

/**
 * Record that needs manual review
 */
export interface ReviewRecord {
  /** Wikidata QID of the record */
  wikidataQID: string;
  /** Issue description */
  issue: string;
}

/**
 * Import operation report
 */
export interface ImportReport {
  /** Report generation timestamp (ISO format) */
  timestamp: string;
  /** Total entries in the source JSON file */
  totalEntriesInJson: number;
  /** Unique buildings after deduplication */
  uniqueBuildingsAfterDedup: number;
  /** Number of new records created */
  newRecordsCreated: number;
  /** Number of existing records updated */
  existingRecordsUpdated: number;
  /** Records that were skipped */
  recordsSkipped: SkippedRecord[];
  /** Records that need manual review */
  recordsNeedingReview: ReviewRecord[];
}

// ============================================================================
// AI Enrichment Types (Optional)
// ============================================================================

/**
 * Request for AI enrichment
 */
export interface AIEnrichmentRequest {
  /** Building/work name */
  name: string;
  /** Architect name */
  architect: string;
  /** City name */
  city: string;
  /** Country name */
  country: string;
  /** Latitude coordinate */
  latitude: number;
  /** Longitude coordinate */
  longitude: number;
}

/**
 * Response from AI enrichment
 */
export interface AIEnrichmentResponse {
  /** AI-generated building description */
  description?: string;
  /** Detailed address */
  address?: string;
  /** Official website */
  website?: string;
  /** Opening hours */
  openingHours?: string;
  /** Architectural styles (based on the specific work) */
  architecturalStyle?: string[];
  /** Year the building was constructed */
  yearBuilt?: number;
  /** Architectural significance */
  significance?: string;
}

/**
 * Details fetched from Wikidata API
 */
export interface WikidataDetails {
  /** Year built (from P571) */
  yearBuilt?: number;
  /** Architectural styles (from P149) */
  architecturalStyle?: string[];
  /** Official website (from P856) */
  website?: string;
  /** Street address (from P6375) */
  address?: string;
  /** Commons category (from P373) */
  commonsCategory?: string;
}

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Result of entry validation
 */
export interface ValidationResult {
  /** Whether the entry is valid */
  isValid: boolean;
  /** List of validation errors */
  errors: string[];
}

/**
 * Result of database upsert operation
 */
export interface UpsertResult {
  /** Action taken: 'created', 'updated', or 'error' */
  action: 'created' | 'updated' | 'error';
  /** Database record ID (if successful) */
  id?: string;
  /** Error message (if failed) */
  error?: string;
}

// ============================================================================
// Coordinate Types
// ============================================================================

/**
 * Parsed coordinate pair
 */
export interface Coordinates {
  /** Latitude value */
  latitude: number;
  /** Longitude value */
  longitude: number;
}
