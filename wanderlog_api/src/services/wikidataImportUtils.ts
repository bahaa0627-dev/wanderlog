/**
 * Wikidata Import Utilities
 * Wikidata 数据导入工具函数
 *
 * Core parsing functions for importing Architecture and Cemetery data
 * from Wikidata JSON files into the Place database.
 */

// ============================================================================
// Types - Input JSON Structures
// ============================================================================

/**
 * Parsed coordinate pair
 */
export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Raw architecture entry from Wikidata JSON files
 * Requirements: 1.1
 */
export interface ArchitectureEntry {
  work: string;              // Wikidata URL, e.g., "http://www.wikidata.org/entity/Q243"
  workLabel: string;         // Building name
  architect?: string;        // Architect Wikidata URL
  architectLabel?: string;   // Architect name
  style?: string;            // Style Wikidata URL
  styleLabel?: string;       // Style name
  coord: string;             // "Point(lng lat)" format
  image?: string;            // Commons image URL
  sitelinks?: string;        // Number of sitelinks (as string)
  countryLabel?: string;     // Country name
  cityLabel?: string;        // City name
}

/**
 * Raw cemetery entry from Wikidata JSON files
 * Requirements: 1.2
 */
export interface CemeteryEntry {
  cemetery: string;          // Wikidata URL
  cemeteryLabel: string;     // Cemetery name
  coord: string;             // "Point(lng lat)" format
  countryLabel?: string;     // Country name
  cityLabel?: string;        // City name
  image?: string;            // Commons image URL
  cemSitelinks?: string;     // Number of sitelinks (as string)
  sitelinks?: string;        // Alternative sitelinks field
  // Celebrity count fields (all as strings)
  celebsCount?: string;      // Total celebrity count
  artistCount?: string;      // Artist count
  writerCount?: string;      // Writer count
  musicCount?: string;       // Musician count
  scientistCount?: string;   // Scientist count
  buriedCount?: string;      // Total buried count (alternative field)
}

// ============================================================================
// Types - Parsed Structures
// ============================================================================

/**
 * Parsed architecture data after processing
 * Requirements: 1.1
 */
export interface ParsedArchitecture {
  qid: string;               // Extracted QID, e.g., "Q243"
  name: string;              // Building name from workLabel
  coordinates: Coordinates;  // Parsed coordinates
  architects: string[];      // List of architect names
  styles: string[];          // List of style names
  images: string[];          // List of image URLs
  country?: string;          // Country name
  city?: string;             // City name
  sitelinks?: number;        // Number of sitelinks
  sourceUrls: {
    work: string;            // Original work URL
    architects: string[];    // Architect URLs
    styles: string[];        // Style URLs
  };
}

/**
 * Celebrity counts for cemetery data
 */
export interface CelebrityCounts {
  total?: number;            // celebsCount
  artist?: number;           // artistCount
  writer?: number;           // writerCount
  musician?: number;         // musicCount
  scientist?: number;        // scientistCount
  buried?: number;           // buriedCount (alternative)
}

/**
 * Parsed cemetery data after processing
 * Requirements: 1.2
 */
export interface ParsedCemetery {
  qid: string;               // Extracted QID
  name: string;              // Cemetery name from cemeteryLabel
  coordinates: Coordinates;  // Parsed coordinates
  images: string[];          // List of image URLs
  country?: string;          // Country name
  city?: string;             // City name
  sitelinks?: number;        // Number of sitelinks
  celebrityCounts: CelebrityCounts;
  sourceUrls: {
    cemetery: string;        // Original cemetery URL
  };
}

// ============================================================================
// Types - Merged and Output Structures
// ============================================================================

/**
 * Data type indicator
 */
export type WikidataDataType = 'architecture' | 'cemetery';

/**
 * Merged record after deduplication
 * Combines multiple records with the same QID
 */
export interface MergedRecord {
  qid: string;
  name: string;
  coordinates: Coordinates;
  architects: string[];      // Merged architect list (architecture only)
  styles: string[];          // Merged style list (architecture only)
  images: string[];          // Merged image list
  country?: string;
  city?: string;
  sitelinks?: number;
  celebrityCounts?: CelebrityCounts;  // Cemetery only
  sourceUrls: Record<string, string[]>;
  dataType: WikidataDataType;
  sourceFile: string;        // Source file name for style tag logic
}

/**
 * Place tags structure
 */
export interface PlaceTags {
  style?: string[];
  architect?: string[];
  theme?: string[];
  type?: string[];  // Building type tag (e.g., "Architecture")
}

/**
 * Final place data ready for database import
 */
export interface PlaceImportData {
  name: string;
  city?: string;
  country?: string;
  latitude: number;
  longitude: number;
  categorySlug: string;
  categoryEn: string;
  categoryZh?: string;
  tags: PlaceTags;
  coverImage?: string;
  images: string[];
  source: string;
  sourceDetail: string;      // QID
  isVerified: boolean;
  customFields: Record<string, unknown>;
}

// ============================================================================
// Wikidata API Response Types
// ============================================================================

/**
 * Wikidata API claim structure
 */
interface WikidataClaim {
  mainsnak?: {
    datavalue?: {
      value: string;
    };
  };
}

/**
 * Wikidata API response for wbgetclaims
 */
interface WikidataClaimsResponse {
  claims?: {
    P18?: WikidataClaim[];
  };
}

// ============================================================================
// Coordinate Parsing
// ============================================================================

/**
 * Parse coordinates from Wikidata "Point(longitude latitude)" format
 *
 * @param coordString - Coordinate string in "Point(lng lat)" format, e.g., "Point(2.294479 48.858296)"
 * @returns Parsed coordinates object with latitude and longitude, or null if invalid
 *
 * Requirements: 1.3, 7.4, 7.5
 */
export function parseCoord(coordString: string): Coordinates | null {
  // Handle null, undefined, or non-string input
  if (!coordString || typeof coordString !== 'string') {
    return null;
  }

  // Trim whitespace
  const trimmed = coordString.trim();
  if (trimmed === '') {
    return null;
  }

  // Match "Point(lng lat)" format - longitude comes first, then latitude
  // Supports optional whitespace and both positive/negative numbers with decimals
  const match = trimmed.match(/^Point\(\s*([-+]?\d+(?:\.\d+)?)\s+([-+]?\d+(?:\.\d+)?)\s*\)$/i);
  if (!match) {
    return null;
  }

  const longitude = parseFloat(match[1]);
  const latitude = parseFloat(match[2]);

  // Validate that parsing succeeded
  if (isNaN(longitude) || isNaN(latitude)) {
    return null;
  }

  // Validate coordinate ranges
  // Longitude: -180 to 180
  if (longitude < -180 || longitude > 180) {
    return null;
  }

  // Latitude: -90 to 90
  if (latitude < -90 || latitude > 90) {
    return null;
  }

  return {
    latitude,
    longitude,
  };
}

/**
 * Format coordinates back to Wikidata "Point(longitude latitude)" format
 *
 * @param coords - Coordinates object with latitude and longitude
 * @returns Formatted coordinate string in "Point(lng lat)" format
 *
 * Requirements: 1.3 (for round-trip testing)
 */
export function formatCoord(coords: Coordinates): string {
  return `Point(${coords.longitude} ${coords.latitude})`;
}

// ============================================================================
// QID Extraction
// ============================================================================

/**
 * Extract Wikidata QID from a Wikidata URL
 *
 * Supports both http and https protocols.
 *
 * @param wikidataUrl - Wikidata URL, e.g., "http://www.wikidata.org/entity/Q12345" or "https://www.wikidata.org/entity/Q12345"
 * @returns Extracted QID (e.g., "Q12345"), or null if invalid
 *
 * Requirements: 1.4
 */
export function extractQID(wikidataUrl: string): string | null {
  // Handle null, undefined, or non-string input
  if (!wikidataUrl || typeof wikidataUrl !== 'string') {
    return null;
  }

  // Trim whitespace
  const trimmed = wikidataUrl.trim();
  if (trimmed === '') {
    return null;
  }

  // Match Q followed by one or more digits at the end of the URL
  // This handles both http and https, and various URL formats
  const match = trimmed.match(/Q\d+$/);
  return match ? match[0] : null;
}

// ============================================================================
// Architecture Parser
// ============================================================================

/**
 * Parse a single architecture entry from Wikidata JSON
 *
 * @param entry - Raw architecture entry from JSON file
 * @returns Parsed architecture data, or null if essential fields are missing
 *
 * Requirements: 1.1
 */
export function parseArchitectureEntry(entry: ArchitectureEntry): ParsedArchitecture | null {
  // Validate required fields
  if (!entry || !entry.work || !entry.workLabel || !entry.coord) {
    return null;
  }

  // Extract QID from work URL
  const qid = extractQID(entry.work);
  if (!qid) {
    return null;
  }

  // Parse coordinates
  const coordinates = parseCoord(entry.coord);
  if (!coordinates) {
    return null;
  }

  // Collect architects (may be empty)
  const architects: string[] = [];
  const architectUrls: string[] = [];
  if (entry.architectLabel && entry.architectLabel.trim()) {
    // Skip Q-number only labels (e.g., "Q133285915")
    if (!entry.architectLabel.match(/^Q\d+$/)) {
      architects.push(entry.architectLabel.trim());
    }
  }
  if (entry.architect) {
    architectUrls.push(entry.architect);
  }

  // Collect styles (may be empty)
  const styles: string[] = [];
  const styleUrls: string[] = [];
  if (entry.styleLabel && entry.styleLabel.trim()) {
    styles.push(entry.styleLabel.trim());
  }
  if (entry.style) {
    styleUrls.push(entry.style);
  }

  // Collect images
  const images: string[] = [];
  if (entry.image && entry.image.trim()) {
    images.push(entry.image.trim());
  }

  // Parse sitelinks as number
  let sitelinks: number | undefined;
  if (entry.sitelinks) {
    const parsed = parseInt(entry.sitelinks, 10);
    if (!isNaN(parsed)) {
      sitelinks = parsed;
    }
  }

  return {
    qid,
    name: entry.workLabel.trim(),
    coordinates,
    architects,
    styles,
    images,
    country: entry.countryLabel?.trim(),
    city: entry.cityLabel?.trim(),
    sitelinks,
    sourceUrls: {
      work: entry.work,
      architects: architectUrls,
      styles: styleUrls,
    },
  };
}

// ============================================================================
// Cemetery Parser
// ============================================================================

/**
 * Parse a string number to integer, returning undefined if invalid
 */
function parseStringNumber(value: string | undefined): number | undefined {
  if (!value || typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return undefined;
  }
  const parsed = parseInt(trimmed, 10);
  return isNaN(parsed) ? undefined : parsed;
}

/**
 * Parse a single cemetery entry from Wikidata JSON
 *
 * @param entry - Raw cemetery entry from JSON file
 * @returns Parsed cemetery data, or null if essential fields are missing
 *
 * Requirements: 1.2
 */
export function parseCemeteryEntry(entry: CemeteryEntry): ParsedCemetery | null {
  // Validate required fields
  if (!entry || !entry.cemetery || !entry.cemeteryLabel || !entry.coord) {
    return null;
  }

  // Extract QID from cemetery URL
  const qid = extractQID(entry.cemetery);
  if (!qid) {
    return null;
  }

  // Parse coordinates
  const coordinates = parseCoord(entry.coord);
  if (!coordinates) {
    return null;
  }

  // Collect images
  const images: string[] = [];
  if (entry.image && entry.image.trim()) {
    images.push(entry.image.trim());
  }

  // Parse sitelinks - check both cemSitelinks and sitelinks fields
  let sitelinks: number | undefined;
  const sitelinksStr = entry.cemSitelinks || entry.sitelinks;
  if (sitelinksStr) {
    const parsed = parseInt(sitelinksStr, 10);
    if (!isNaN(parsed)) {
      sitelinks = parsed;
    }
  }

  // Parse celebrity counts
  const celebrityCounts: CelebrityCounts = {};
  
  const totalCount = parseStringNumber(entry.celebsCount);
  if (totalCount !== undefined) {
    celebrityCounts.total = totalCount;
  }
  
  const artistCount = parseStringNumber(entry.artistCount);
  if (artistCount !== undefined) {
    celebrityCounts.artist = artistCount;
  }
  
  const writerCount = parseStringNumber(entry.writerCount);
  if (writerCount !== undefined) {
    celebrityCounts.writer = writerCount;
  }
  
  const musicCount = parseStringNumber(entry.musicCount);
  if (musicCount !== undefined) {
    celebrityCounts.musician = musicCount;
  }
  
  const scientistCount = parseStringNumber(entry.scientistCount);
  if (scientistCount !== undefined) {
    celebrityCounts.scientist = scientistCount;
  }
  
  const buriedCount = parseStringNumber(entry.buriedCount);
  if (buriedCount !== undefined) {
    celebrityCounts.buried = buriedCount;
  }

  return {
    qid,
    name: entry.cemeteryLabel.trim(),
    coordinates,
    images,
    country: entry.countryLabel?.trim(),
    city: entry.cityLabel?.trim(),
    sitelinks,
    celebrityCounts,
    sourceUrls: {
      cemetery: entry.cemetery,
    },
  };
}

// ============================================================================
// Global QID Registry - Deduplication System
// ============================================================================

/**
 * Statistics for the deduplication process
 */
export interface DeduplicationStats {
  total: number;       // Total records registered
  unique: number;      // Unique QIDs
  duplicates: number;  // Duplicate records merged
}

/**
 * Global QID Registry for deduplicating Wikidata records
 * 
 * Maintains a map of processed QIDs and merges duplicate records
 * by combining architects, styles, and images from multiple sources.
 * 
 * Requirements: 2.1, 2.2, 2.3
 */
export class GlobalQIDRegistry {
  private processedQIDs: Map<string, MergedRecord>;
  private duplicateCount: number;

  constructor() {
    this.processedQIDs = new Map();
    this.duplicateCount = 0;
  }

  /**
   * Register a parsed record in the registry
   * 
   * If the QID already exists, merges the new record with the existing one.
   * Returns true if this was a new QID, false if it was a duplicate that was merged.
   * 
   * @param record - Parsed architecture or cemetery record
   * @param sourceFile - Source file name (used for style tag logic)
   * @returns true if new QID, false if duplicate (merged)
   * 
   * Requirements: 2.1, 2.2
   */
  register(record: ParsedArchitecture | ParsedCemetery, sourceFile: string): boolean {
    const existing = this.processedQIDs.get(record.qid);

    if (existing) {
      // Merge with existing record
      const merged = this.merge(existing, record, sourceFile);
      this.processedQIDs.set(record.qid, merged);
      this.duplicateCount++;
      return false;
    }

    // Create new merged record
    const mergedRecord = this.createMergedRecord(record, sourceFile);
    this.processedQIDs.set(record.qid, mergedRecord);
    return true;
  }

  /**
   * Create a MergedRecord from a parsed record
   */
  private createMergedRecord(
    record: ParsedArchitecture | ParsedCemetery,
    sourceFile: string
  ): MergedRecord {
    const isArchitecture = 'architects' in record;

    if (isArchitecture) {
      const arch = record as ParsedArchitecture;
      return {
        qid: arch.qid,
        name: arch.name,
        coordinates: arch.coordinates,
        architects: [...new Set(arch.architects)],  // Deduplicate
        styles: [...new Set(arch.styles)],          // Deduplicate
        images: [...new Set(arch.images)],          // Deduplicate
        country: arch.country,
        city: arch.city,
        sitelinks: arch.sitelinks,
        sourceUrls: {
          work: [arch.sourceUrls.work],
          architects: [...new Set(arch.sourceUrls.architects)],  // Deduplicate
          styles: [...new Set(arch.sourceUrls.styles)],          // Deduplicate
        },
        dataType: 'architecture',
        sourceFile,
      };
    } else {
      const cem = record as ParsedCemetery;
      return {
        qid: cem.qid,
        name: cem.name,
        coordinates: cem.coordinates,
        architects: [],
        styles: [],
        images: [...new Set(cem.images)],  // Deduplicate
        country: cem.country,
        city: cem.city,
        sitelinks: cem.sitelinks,
        celebrityCounts: cem.celebrityCounts,
        sourceUrls: {
          cemetery: [cem.sourceUrls.cemetery],
        },
        dataType: 'cemetery',
        sourceFile,
      };
    }
  }

  /**
   * Merge a new record into an existing merged record
   * 
   * Combines architects, styles, and images from both records,
   * keeping only unique values.
   * 
   * @param existing - Existing merged record
   * @param newRecord - New parsed record to merge
   * @param sourceFile - Source file name of the new record
   * @returns Updated merged record
   * 
   * Requirements: 2.3
   */
  merge(
    existing: MergedRecord,
    newRecord: ParsedArchitecture | ParsedCemetery,
    sourceFile: string
  ): MergedRecord {
    const isArchitecture = 'architects' in newRecord;

    // Create a copy of the existing record
    const merged: MergedRecord = {
      ...existing,
      architects: [...existing.architects],
      styles: [...existing.styles],
      images: [...existing.images],
      sourceUrls: { ...existing.sourceUrls },
    };

    // Deep copy sourceUrls arrays
    for (const key of Object.keys(merged.sourceUrls)) {
      merged.sourceUrls[key] = [...(existing.sourceUrls[key] || [])];
    }

    if (isArchitecture) {
      const arch = newRecord as ParsedArchitecture;

      // Merge architects (unique only)
      for (const architect of arch.architects) {
        if (!merged.architects.includes(architect)) {
          merged.architects.push(architect);
        }
      }

      // Merge styles (unique only)
      for (const style of arch.styles) {
        if (!merged.styles.includes(style)) {
          merged.styles.push(style);
        }
      }

      // Merge images (unique only)
      for (const image of arch.images) {
        if (!merged.images.includes(image)) {
          merged.images.push(image);
        }
      }

      // Merge source URLs
      if (!merged.sourceUrls.work) {
        merged.sourceUrls.work = [];
      }
      if (!merged.sourceUrls.work.includes(arch.sourceUrls.work)) {
        merged.sourceUrls.work.push(arch.sourceUrls.work);
      }

      if (!merged.sourceUrls.architects) {
        merged.sourceUrls.architects = [];
      }
      for (const url of arch.sourceUrls.architects) {
        if (!merged.sourceUrls.architects.includes(url)) {
          merged.sourceUrls.architects.push(url);
        }
      }

      if (!merged.sourceUrls.styles) {
        merged.sourceUrls.styles = [];
      }
      for (const url of arch.sourceUrls.styles) {
        if (!merged.sourceUrls.styles.includes(url)) {
          merged.sourceUrls.styles.push(url);
        }
      }

      // Update sourceFile if this is from a style-named file (takes precedence)
      // Style-named files are more specific than architecture1/2.json
      if (!sourceFile.includes('architecture1') && !sourceFile.includes('architecture2')) {
        merged.sourceFile = sourceFile;
      }
    } else {
      const cem = newRecord as ParsedCemetery;

      // Merge images (unique only)
      for (const image of cem.images) {
        if (!merged.images.includes(image)) {
          merged.images.push(image);
        }
      }

      // Merge source URLs
      if (!merged.sourceUrls.cemetery) {
        merged.sourceUrls.cemetery = [];
      }
      if (!merged.sourceUrls.cemetery.includes(cem.sourceUrls.cemetery)) {
        merged.sourceUrls.cemetery.push(cem.sourceUrls.cemetery);
      }

      // Merge celebrity counts (take the higher values)
      if (cem.celebrityCounts) {
        if (!merged.celebrityCounts) {
          merged.celebrityCounts = {};
        }
        const counts = cem.celebrityCounts;
        const existingCounts = merged.celebrityCounts;

        if (counts.total !== undefined) {
          existingCounts.total = Math.max(existingCounts.total || 0, counts.total);
        }
        if (counts.artist !== undefined) {
          existingCounts.artist = Math.max(existingCounts.artist || 0, counts.artist);
        }
        if (counts.writer !== undefined) {
          existingCounts.writer = Math.max(existingCounts.writer || 0, counts.writer);
        }
        if (counts.musician !== undefined) {
          existingCounts.musician = Math.max(existingCounts.musician || 0, counts.musician);
        }
        if (counts.scientist !== undefined) {
          existingCounts.scientist = Math.max(existingCounts.scientist || 0, counts.scientist);
        }
        if (counts.buried !== undefined) {
          existingCounts.buried = Math.max(existingCounts.buried || 0, counts.buried);
        }
      }
    }

    // Update other fields if they were missing
    if (!merged.country && newRecord.country) {
      merged.country = newRecord.country;
    }
    if (!merged.city && newRecord.city) {
      merged.city = newRecord.city;
    }
    if (merged.sitelinks === undefined && newRecord.sitelinks !== undefined) {
      merged.sitelinks = newRecord.sitelinks;
    } else if (newRecord.sitelinks !== undefined && merged.sitelinks !== undefined) {
      // Take the higher sitelinks count
      merged.sitelinks = Math.max(merged.sitelinks, newRecord.sitelinks);
    }

    return merged;
  }

  /**
   * Get all merged records
   * 
   * @returns Array of all unique merged records
   */
  getAll(): MergedRecord[] {
    return Array.from(this.processedQIDs.values());
  }

  /**
   * Get a specific record by QID
   * 
   * @param qid - The QID to look up
   * @returns The merged record, or undefined if not found
   */
  get(qid: string): MergedRecord | undefined {
    return this.processedQIDs.get(qid);
  }

  /**
   * Check if a QID has been registered
   * 
   * @param qid - The QID to check
   * @returns true if the QID exists in the registry
   */
  has(qid: string): boolean {
    return this.processedQIDs.has(qid);
  }

  /**
   * Get deduplication statistics
   * 
   * @returns Statistics about the deduplication process
   */
  getStats(): DeduplicationStats {
    return {
      total: this.processedQIDs.size + this.duplicateCount,
      unique: this.processedQIDs.size,
      duplicates: this.duplicateCount,
    };
  }

  /**
   * Clear the registry
   */
  clear(): void {
    this.processedQIDs.clear();
    this.duplicateCount = 0;
  }

  /**
   * Get the number of unique QIDs
   */
  get size(): number {
    return this.processedQIDs.size;
  }
}

// ============================================================================
// Category Assignment
// ============================================================================

/**
 * Category information for a place
 */
export interface CategoryInfo {
  categorySlug: string;
  categoryEn: string;
  categoryZh?: string;
}

/**
 * Category slug to display name mapping
 * Matches the mapping in googlePlacesEnterpriseService.ts
 */
const CATEGORY_NAMES: Record<string, { en: string; zh: string }> = {
  'landmark': { en: 'Landmark', zh: '地标' },
  'museum': { en: 'Museum', zh: '博物馆' },
  'art_gallery': { en: 'Gallery', zh: '美术馆' },
  'church': { en: 'Church', zh: '教堂' },
  'castle': { en: 'Castle', zh: '城堡' },
  'library': { en: 'Library', zh: '图书馆' },
  'university': { en: 'University', zh: '大学' },
  'temple': { en: 'Temple', zh: '寺庙' },
  'hotel': { en: 'Hotel', zh: '酒店' },
  'cemetery': { en: 'Cemetery', zh: '墓园' },
  'park': { en: 'Park', zh: '公园' },
  'zoo': { en: 'Zoo', zh: '动物园' },
};

/**
 * Keyword patterns for detecting building type from name
 * Order matters - more specific patterns should come first
 */
const BUILDING_TYPE_PATTERNS: Array<{ pattern: RegExp; slug: string }> = [
  // Religious buildings
  { pattern: /\b(cathedral|basilica|church|chapel|abbey|monastery|priory|minster)\b/i, slug: 'church' },
  { pattern: /\b(mosque|masjid|jami)\b/i, slug: 'temple' },
  { pattern: /\b(temple|shrine|pagoda|stupa|wat|synagogue)\b/i, slug: 'temple' },
  
  // Castles and palaces
  { pattern: /\b(castle|palace|château|chateau|schloss|palacio|palazzo|fort|fortress|citadel|alcázar|alcazar)\b/i, slug: 'castle' },
  
  // Museums and galleries
  { pattern: /\b(museum|musée|museo|muzeum)\b/i, slug: 'museum' },
  { pattern: /\b(gallery|galleria|galerie)\b/i, slug: 'art_gallery' },
  
  // Educational
  { pattern: /\b(university|college|school|academy|institute|polytechnic)\b/i, slug: 'university' },
  { pattern: /\b(library|bibliothèque|biblioteca)\b/i, slug: 'library' },
  
  // Hotels
  { pattern: /\b(hotel|inn|resort|hostel)\b/i, slug: 'hotel' },
  
  // Parks and gardens
  { pattern: /\b(park|garden|botanical|arboretum)\b/i, slug: 'park' },
  { pattern: /\b(zoo|aquarium|safari)\b/i, slug: 'zoo' },
];

/**
 * Detect category from building name using keyword patterns
 * 
 * @param name - Building name (workLabel)
 * @returns Category slug, or 'landmark' as default
 */
export function detectCategoryFromName(name: string): string {
  if (!name || typeof name !== 'string') {
    return 'landmark';
  }

  const normalizedName = name.trim();
  
  for (const { pattern, slug } of BUILDING_TYPE_PATTERNS) {
    if (pattern.test(normalizedName)) {
      return slug;
    }
  }

  // Default to landmark for architecture
  return 'landmark';
}

/**
 * Assign category based on data type and optionally building name
 * 
 * For architecture records, the category is determined by analyzing the building name
 * to detect the actual building type (church, museum, castle, etc.).
 * For cemetery records, the category is always 'cemetery'.
 * 
 * @param dataType - The type of data ('architecture' or 'cemetery')
 * @param name - Optional building name for architecture records (used for category detection)
 * @returns Category information with slug and display names
 * 
 * Requirements: 3.1, 4.1
 */
export function assignCategory(dataType: WikidataDataType, name?: string): CategoryInfo {
  if (dataType === 'cemetery') {
    return {
      categorySlug: 'cemetery',
      categoryEn: 'Cemetery',
      categoryZh: '墓地',
    };
  }

  // For architecture, detect category from name
  const categorySlug = detectCategoryFromName(name || '');
  const names = CATEGORY_NAMES[categorySlug] || { en: 'Landmark', zh: '地标' };

  return {
    categorySlug,
    categoryEn: names.en,
    categoryZh: names.zh,
  };
}

// ============================================================================
// Tags Builder
// ============================================================================

// ============================================================================
// Wikidata Image Fetcher
// ============================================================================

/**
 * Result of fetching images from Wikidata
 */
export interface WikidataImages {
  coverImage: string | null;
  additionalImages: string[];
}

/**
 * Simple rate limiter for API calls
 */
class RateLimiter {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number; // tokens per second
  private lastRefill: number;

  constructor(maxRequestsPerSecond: number) {
    this.maxTokens = maxRequestsPerSecond;
    this.tokens = maxRequestsPerSecond;
    this.refillRate = maxRequestsPerSecond;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();
    
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Wait until we have a token
    const waitTime = Math.ceil((1 - this.tokens) / this.refillRate * 1000);
    await this.sleep(waitTime);
    this.refill();
    this.tokens -= 1;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * WikidataImageFetcher class for fetching images from Wikidata API
 * 
 * Fetches all available images for a Wikidata entity, filters out banner images,
 * and merges with existing images from JSON data.
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */
export class WikidataImageFetcher {
  private rateLimiter: RateLimiter;
  private readonly WIKIDATA_API_URL = 'https://www.wikidata.org/w/api.php';
  
  // Banner image patterns to filter out
  private readonly BANNER_PATTERNS = [
    /banner/i,
    /wikivoyage/i,
    /panorama/i,
    /header/i,
    /wide[_-]?view/i,
    /skyline/i,
    /_banner\./i,
    /\bbanner\b/i,
  ];

  constructor(maxRequestsPerSecond: number = 10) {
    this.rateLimiter = new RateLimiter(maxRequestsPerSecond);
  }

  /**
   * Fetch images for a Wikidata entity and merge with existing images
   * 
   * @param qid - Wikidata QID (e.g., "Q243")
   * @param existingImages - Images already present from JSON data
   * @returns WikidataImages with cover image and additional images
   * 
   * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
   */
  async fetchImages(qid: string, existingImages: string[]): Promise<WikidataImages> {
    // Fetch images from Wikidata API
    const apiImages = await this.fetchFromWikidataAPI(qid);
    
    // Filter out banner images
    const filteredApiImages = this.filterBannerImages(apiImages);
    
    // Merge with existing images (deduplicate)
    const allImages = this.mergeImages(existingImages, filteredApiImages);
    
    // Select cover image and additional images
    return this.selectImages(allImages);
  }

  /**
   * Fetch images from Wikidata API for a given QID
   * 
   * @param qid - Wikidata QID
   * @returns Array of image URLs from Wikidata
   * 
   * Requirements: 5.1
   */
  async fetchFromWikidataAPI(qid: string): Promise<string[]> {
    await this.rateLimiter.acquire();

    try {
      // Use wbgetclaims to get P18 (image) and P373 (Commons category) claims
      const params = new URLSearchParams({
        action: 'wbgetclaims',
        entity: qid,
        property: 'P18', // image property
        format: 'json',
        origin: '*',
      });

      const response = await fetch(`${this.WIKIDATA_API_URL}?${params}`);
      
      if (!response.ok) {
        console.warn(`Wikidata API returned ${response.status} for ${qid}`);
        return [];
      }

      const data = await response.json() as WikidataClaimsResponse;
      
      if (!data.claims || !data.claims.P18) {
        return [];
      }

      // Extract image file names from claims
      const images: string[] = [];
      for (const claim of data.claims.P18) {
        if (claim.mainsnak?.datavalue?.value) {
          const fileName = claim.mainsnak.datavalue.value;
          // Convert file name to Commons URL
          const imageUrl = this.fileNameToCommonsUrl(fileName);
          if (imageUrl) {
            images.push(imageUrl);
          }
        }
      }

      return images;
    } catch (error) {
      console.warn(`Error fetching images from Wikidata for ${qid}:`, error);
      return [];
    }
  }

  /**
   * Convert a Wikimedia Commons file name to a URL
   * 
   * @param fileName - File name (e.g., "Tour Eiffel.jpg")
   * @returns Commons URL
   */
  private fileNameToCommonsUrl(fileName: string): string | null {
    if (!fileName || typeof fileName !== 'string') {
      return null;
    }

    // Encode the file name for URL
    const encodedName = encodeURIComponent(fileName.replace(/ /g, '_'));
    return `http://commons.wikimedia.org/wiki/Special:FilePath/${encodedName}`;
  }

  /**
   * Filter out banner images from the image list
   * 
   * @param images - Array of image URLs
   * @returns Filtered array without banner images
   * 
   * Requirements: 5.1 (excluding banners)
   */
  filterBannerImages(images: string[]): string[] {
    return images.filter(url => {
      if (!url || typeof url !== 'string') {
        return false;
      }
      
      // Check if the URL matches any banner pattern
      for (const pattern of this.BANNER_PATTERNS) {
        if (pattern.test(url)) {
          return false;
        }
      }
      
      return true;
    });
  }

  /**
   * Merge existing images with API images, removing duplicates
   * 
   * @param existingImages - Images from JSON data
   * @param apiImages - Images from Wikidata API
   * @returns Merged array of unique images
   * 
   * Requirements: 5.3, 5.4
   */
  private mergeImages(existingImages: string[], apiImages: string[]): string[] {
    const seen = new Set<string>();
    const merged: string[] = [];

    // Add existing images first (they take priority)
    for (const img of existingImages) {
      if (img && !seen.has(img)) {
        seen.add(img);
        merged.push(img);
      }
    }

    // Add API images
    for (const img of apiImages) {
      if (img && !seen.has(img)) {
        seen.add(img);
        merged.push(img);
      }
    }

    return merged;
  }

  /**
   * Select cover image and additional images from merged list
   * 
   * @param allImages - All merged images
   * @returns WikidataImages with cover and additional images
   * 
   * Requirements: 5.2, 5.5
   */
  private selectImages(allImages: string[]): WikidataImages {
    if (allImages.length === 0) {
      // No images available
      return {
        coverImage: null,
        additionalImages: [],
      };
    }

    // First image is cover image
    const coverImage = allImages[0];
    
    // Rest are additional images
    const additionalImages = allImages.slice(1);

    return {
      coverImage,
      additionalImages,
    };
  }

  /**
   * Check if an image URL is a banner image
   * 
   * @param url - Image URL to check
   * @returns true if the URL appears to be a banner image
   */
  isBannerImage(url: string): boolean {
    if (!url || typeof url !== 'string') {
      return false;
    }
    
    for (const pattern of this.BANNER_PATTERNS) {
      if (pattern.test(url)) {
        return true;
      }
    }
    
    return false;
  }
}

// ============================================================================
// Tags Builder
// ============================================================================

/**
 * TagsBuilder class for constructing place tags
 * 
 * Builds style, architect, and theme tags based on data type and source file.
 * 
 * Requirements: 3.2, 3.3, 3.4, 3.5, 4.2-4.7
 */
export class TagsBuilder {
  /**
   * Check if style tags should be added based on source file name
   * 
   * Style tags should NOT be added for architecture1.json or architecture2.json
   * (top architecture files), but SHOULD be added for style-named files
   * like Brutalism.json, ArtDeco.json, etc.
   * 
   * @param sourceFile - The source file name
   * @returns true if style tags should be added
   * 
   * Requirements: 3.2, 3.3
   */
  shouldAddStyleTag(sourceFile: string): boolean {
    // Normalize the file name for comparison
    const normalizedFile = sourceFile.toLowerCase();
    
    // Do not add style tags for architecture1.json or architecture2.json
    if (normalizedFile.includes('architecture1') || normalizedFile.includes('architecture2')) {
      return false;
    }
    
    // Add style tags for all other architecture files (style-named files)
    return true;
  }

  /**
   * Build tags for architecture records
   * 
   * @param record - The merged architecture record
   * @returns PlaceTags object with style, architect, and type arrays
   * 
   * Requirements: 3.2, 3.3, 3.4, 3.5
   */
  buildArchitectureTags(record: MergedRecord): PlaceTags {
    const tags: PlaceTags = {};

    // Always add type: ["Architecture"] for architecture records
    tags.type = ['Architecture'];

    // Add architect tags if available
    if (record.architects && record.architects.length > 0) {
      tags.architect = [...new Set(record.architects)]; // Ensure uniqueness
    }

    // Add style tags only if from a style-named file
    if (this.shouldAddStyleTag(record.sourceFile)) {
      if (record.styles && record.styles.length > 0) {
        tags.style = [...new Set(record.styles)]; // Ensure uniqueness
      }
    }

    return tags;
  }

  /**
   * Build theme tags based on celebrity counts
   * 
   * @param counts - Celebrity counts from cemetery data
   * @returns Array of theme strings
   * 
   * Requirements: 4.2, 4.3, 4.4, 4.5, 4.6
   */
  private buildThemeTags(counts: CelebrityCounts | undefined): string[] {
    if (!counts) {
      return [];
    }

    const themes: string[] = [];
    let hasSpecificCategory = false;

    // Check specific category counts
    if (counts.artist !== undefined && counts.artist > 0) {
      themes.push('artist');
      hasSpecificCategory = true;
    }

    if (counts.scientist !== undefined && counts.scientist > 0) {
      themes.push('scientist');
      hasSpecificCategory = true;
    }

    if (counts.musician !== undefined && counts.musician > 0) {
      themes.push('musician');
      hasSpecificCategory = true;
    }

    if (counts.writer !== undefined && counts.writer > 0) {
      themes.push('writer');
      hasSpecificCategory = true;
    }

    // Add "celebrity" only if celebsCount > 0 but no specific categories
    if (!hasSpecificCategory && counts.total !== undefined && counts.total > 0) {
      themes.push('celebrity');
    }

    return themes;
  }

  /**
   * Build tags for cemetery records
   * 
   * @param record - The merged cemetery record
   * @returns PlaceTags object with theme array
   * 
   * Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 4.7
   */
  buildCemeteryTags(record: MergedRecord): PlaceTags {
    const tags: PlaceTags = {};

    // Build theme tags from celebrity counts
    const themes = this.buildThemeTags(record.celebrityCounts);
    if (themes.length > 0) {
      tags.theme = themes;
    }

    return tags;
  }

  /**
   * Build tags for any record based on its data type
   * 
   * @param record - The merged record
   * @returns PlaceTags object
   */
  buildTags(record: MergedRecord): PlaceTags {
    if (record.dataType === 'architecture') {
      return this.buildArchitectureTags(record);
    } else {
      return this.buildCemeteryTags(record);
    }
  }
}

// ============================================================================
// Place Mapper
// ============================================================================

/**
 * Map a MergedRecord to PlaceImportData for database insertion
 * 
 * This function transforms a merged Wikidata record into the format
 * required for database import, setting all required fields including
 * source metadata, custom fields, and verification status.
 * 
 * @param record - The merged record from GlobalQIDRegistry
 * @param images - Images fetched from Wikidata API
 * @param tags - Tags built by TagsBuilder
 * @returns PlaceImportData ready for database insertion
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.2, 7.3, 7.6
 */
export function mapToPlaceData(
  record: MergedRecord,
  images: WikidataImages,
  tags: PlaceTags
): PlaceImportData {
  // Get category information based on data type and name
  // For architecture, the name is used to detect the actual building type
  const category = assignCategory(record.dataType, record.name);

  // Build custom fields to preserve all unmapped data
  const customFields: Record<string, unknown> = {};

  // Store sitelinks count if available (Requirement 6.3)
  if (record.sitelinks !== undefined) {
    customFields.sitelinks = record.sitelinks;
  }

  // Store all Wikidata URLs for future reference (Requirement 6.4)
  if (record.sourceUrls && Object.keys(record.sourceUrls).length > 0) {
    customFields.wikidataUrls = record.sourceUrls;
  }

  // Store celebrity counts for cemetery records (Requirement 4.7)
  if (record.dataType === 'cemetery' && record.celebrityCounts) {
    customFields.celebrityCounts = record.celebrityCounts;
  }

  // Store source file name for traceability
  customFields.sourceFile = record.sourceFile;

  // Store data type for reference
  customFields.dataType = record.dataType;

  // Combine cover image with additional images
  const allImages: string[] = [];
  if (images.coverImage) {
    // Cover image is already the first, additional images follow
    allImages.push(...images.additionalImages);
  } else {
    allImages.push(...images.additionalImages);
  }

  return {
    // Field mapping (Requirements 7.1, 7.2, 7.3)
    name: record.name,                           // workLabel or cemeteryLabel
    city: record.city,                           // cityLabel
    country: record.country,                     // countryLabel
    latitude: record.coordinates.latitude,       // from coord (Requirement 7.4)
    longitude: record.coordinates.longitude,     // from coord (Requirement 7.5)

    // Category information (Requirements 3.1, 4.1)
    categorySlug: category.categorySlug,
    categoryEn: category.categoryEn,
    categoryZh: category.categoryZh,

    // Tags (Requirements 3.2-3.5, 4.2-4.7)
    tags,

    // Images (Requirements 5.2, 5.3, 5.4, 5.5)
    coverImage: images.coverImage ?? undefined,
    images: allImages,

    // Source metadata (Requirements 6.1, 6.2, 6.5)
    source: 'wikidata',                          // Requirement 6.2
    sourceDetail: record.qid,                    // Requirement 6.1 - QID
    isVerified: true,                            // Requirement 6.5

    // Custom fields for unmapped data (Requirements 6.3, 6.4)
    customFields,
  };
}

// ============================================================================
// Batch Inserter
// ============================================================================

/**
 * Result of a batch insert operation
 */
export interface InsertResult {
  success: number;
  failed: number;
  errors: Array<{ qid: string; error: string }>;
}

/**
 * Result of a single upsert operation
 */
export type UpsertResult = 'created' | 'updated' | 'error';

/**
 * BatchInserter class for efficient database operations
 * 
 * Handles batch insertion of places with upsert logic based on
 * sourceDetail (QID) for deduplication.
 * 
 * Requirements: 9.1
 */
export class BatchInserter {
  private batchSize: number;
  private prisma: PrismaClientType;

  /**
   * Create a new BatchInserter
   * 
   * @param prisma - Prisma client instance
   * @param batchSize - Number of records per batch (default: 50)
   */
  constructor(prisma: PrismaClientType, batchSize: number = 50) {
    this.prisma = prisma;
    this.batchSize = batchSize;
  }

  /**
   * Insert places in batches
   * 
   * @param places - Array of PlaceImportData to insert
   * @returns InsertResult with success/failure counts and errors
   * 
   * Requirements: 9.1
   */
  async insertBatch(places: PlaceImportData[]): Promise<InsertResult> {
    const result: InsertResult = {
      success: 0,
      failed: 0,
      errors: [],
    };

    // Process in batches of batchSize
    for (let i = 0; i < places.length; i += this.batchSize) {
      const batch = places.slice(i, i + this.batchSize);
      
      // Process each place in the batch
      const batchPromises = batch.map(async (place) => {
        try {
          const upsertResult = await this.upsertPlace(place);
          if (upsertResult === 'error') {
            result.failed++;
            result.errors.push({
              qid: place.sourceDetail,
              error: 'Unknown error during upsert',
            });
          } else {
            result.success++;
          }
        } catch (error) {
          result.failed++;
          result.errors.push({
            qid: place.sourceDetail,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });

      // Wait for all operations in this batch to complete
      await Promise.all(batchPromises);
    }

    return result;
  }

  /**
   * Upsert a single place record
   * 
   * Uses sourceDetail (QID) as the unique identifier for deduplication.
   * If a place with the same QID exists, it will be updated.
   * Otherwise, a new place will be created.
   * 
   * @param place - PlaceImportData to upsert
   * @returns 'created', 'updated', or 'error'
   */
  async upsertPlace(place: PlaceImportData): Promise<UpsertResult> {
    try {
      // Check if a place with this QID already exists
      const existing = await this.prisma.place.findFirst({
        where: {
          source: 'wikidata',
          sourceDetail: place.sourceDetail,
        },
        select: { id: true },
      });

      const placeData = {
        name: place.name,
        city: place.city,
        country: place.country,
        latitude: place.latitude,
        longitude: place.longitude,
        categorySlug: place.categorySlug,
        categoryEn: place.categoryEn,
        categoryZh: place.categoryZh,
        tags: place.tags as Record<string, unknown>,
        coverImage: place.coverImage,
        images: place.images,
        source: place.source,
        sourceDetail: place.sourceDetail,
        isVerified: place.isVerified,
        customFields: place.customFields,
      };

      if (existing) {
        // Update existing place
        await this.prisma.place.update({
          where: { id: existing.id },
          data: placeData,
        });
        return 'updated';
      } else {
        // Create new place
        await this.prisma.place.create({
          data: placeData,
        });
        return 'created';
      }
    } catch (error) {
      console.error(`Error upserting place ${place.sourceDetail}:`, error);
      return 'error';
    }
  }

  /**
   * Get the batch size
   */
  getBatchSize(): number {
    return this.batchSize;
  }

  /**
   * Set the batch size
   */
  setBatchSize(size: number): void {
    if (size > 0) {
      this.batchSize = size;
    }
  }
}

// Type for Prisma client (to avoid importing the full Prisma client)
type PrismaClientType = {
  place: {
    findFirst: (args: {
      where: { source: string; sourceDetail: string };
      select: { id: boolean };
    }) => Promise<{ id: string } | null>;
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
  };
};

// ============================================================================
// Retry Handler - Error Handling and Retry Mechanism
// ============================================================================

/**
 * Options for retry behavior
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelayMs?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
  /** Optional logger function for retry events */
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

/**
 * Result of a retry operation
 */
export interface RetryResult<T> {
  /** Whether the operation succeeded */
  success: boolean;
  /** The result value if successful */
  value?: T;
  /** The last error if all retries failed */
  error?: Error;
  /** Number of attempts made (1 = first try, 2+ = retries) */
  attempts: number;
  /** Total time spent in milliseconds (including delays) */
  totalTimeMs: number;
}

/**
 * Retry attempt information for logging/tracking
 */
export interface RetryAttempt {
  /** Attempt number (1-based) */
  attempt: number;
  /** Error that occurred */
  error: Error;
  /** Delay before next retry in milliseconds */
  delayMs: number;
  /** Timestamp of the attempt */
  timestamp: Date;
}

/**
 * RetryHandler class for implementing exponential backoff retry logic
 * 
 * Provides a robust retry mechanism with:
 * - Exponential backoff (1s, 2s, 4s by default)
 * - Maximum 3 retries by default
 * - Logging of retry attempts
 * - Configurable options
 * 
 * Requirements: 8.2
 */
export class RetryHandler {
  private maxRetries: number;
  private initialDelayMs: number;
  private backoffMultiplier: number;
  private onRetry?: (attempt: number, error: Error, delayMs: number) => void;
  private retryHistory: RetryAttempt[];

  /**
   * Create a new RetryHandler
   * 
   * @param options - Configuration options for retry behavior
   */
  constructor(options: RetryOptions = {}) {
    this.maxRetries = options.maxRetries ?? 3;
    this.initialDelayMs = options.initialDelayMs ?? 1000;
    this.backoffMultiplier = options.backoffMultiplier ?? 2;
    this.onRetry = options.onRetry;
    this.retryHistory = [];
  }

  /**
   * Execute an async operation with retry logic
   * 
   * Implements exponential backoff: delays are initialDelayMs * (backoffMultiplier ^ attempt)
   * Default: 1s, 2s, 4s for attempts 1, 2, 3
   * 
   * @param operation - Async function to execute
   * @param operationName - Name for logging purposes
   * @returns RetryResult with success status, value or error, and attempt count
   * 
   * Requirements: 8.2
   */
  async execute<T>(
    operation: () => Promise<T>,
    operationName: string = 'operation'
  ): Promise<RetryResult<T>> {
    const startTime = Date.now();
    let lastError: Error | undefined;
    let attempts = 0;

    // First attempt + maxRetries retries
    const totalAttempts = 1 + this.maxRetries;

    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
      attempts = attempt;

      try {
        const value = await operation();
        return {
          success: true,
          value,
          attempts,
          totalTimeMs: Date.now() - startTime,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // If this was the last attempt, don't retry
        if (attempt >= totalAttempts) {
          break;
        }

        // Calculate delay with exponential backoff
        // attempt 1 -> delay = initialDelayMs * 1 = 1000ms
        // attempt 2 -> delay = initialDelayMs * 2 = 2000ms
        // attempt 3 -> delay = initialDelayMs * 4 = 4000ms
        const delayMs = this.calculateDelay(attempt);

        // Record retry attempt
        const retryAttempt: RetryAttempt = {
          attempt,
          error: lastError,
          delayMs,
          timestamp: new Date(),
        };
        this.retryHistory.push(retryAttempt);

        // Log retry
        this.logRetry(attempt, lastError, delayMs, operationName);

        // Call onRetry callback if provided
        if (this.onRetry) {
          this.onRetry(attempt, lastError, delayMs);
        }

        // Wait before next retry
        await this.sleep(delayMs);
      }
    }

    // All attempts failed
    return {
      success: false,
      error: lastError,
      attempts,
      totalTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Calculate delay for a given attempt using exponential backoff
   * 
   * @param attempt - Current attempt number (1-based)
   * @returns Delay in milliseconds
   */
  calculateDelay(attempt: number): number {
    // Exponential backoff: initialDelay * (multiplier ^ (attempt - 1))
    // attempt 1: 1000 * 2^0 = 1000ms (1s)
    // attempt 2: 1000 * 2^1 = 2000ms (2s)
    // attempt 3: 1000 * 2^2 = 4000ms (4s)
    return this.initialDelayMs * Math.pow(this.backoffMultiplier, attempt - 1);
  }

  /**
   * Log a retry attempt
   * 
   * @param attempt - Current attempt number
   * @param error - Error that triggered the retry
   * @param delayMs - Delay before next retry
   * @param operationName - Name of the operation
   */
  private logRetry(
    attempt: number,
    error: Error,
    delayMs: number,
    operationName: string
  ): void {
    console.warn(
      `[RetryHandler] ${operationName} failed (attempt ${attempt}/${1 + this.maxRetries}). ` +
      `Retrying in ${delayMs}ms. Error: ${error.message}`
    );
  }

  /**
   * Sleep for a specified duration
   * 
   * @param ms - Duration in milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get the retry history
   * 
   * @returns Array of retry attempts
   */
  getRetryHistory(): RetryAttempt[] {
    return [...this.retryHistory];
  }

  /**
   * Clear the retry history
   */
  clearHistory(): void {
    this.retryHistory = [];
  }

  /**
   * Get the maximum number of retries
   */
  getMaxRetries(): number {
    return this.maxRetries;
  }

  /**
   * Get the initial delay in milliseconds
   */
  getInitialDelayMs(): number {
    return this.initialDelayMs;
  }

  /**
   * Get the backoff multiplier
   */
  getBackoffMultiplier(): number {
    return this.backoffMultiplier;
  }

  /**
   * Create a RetryHandler with default settings for Wikidata API calls
   * 
   * Default: 3 retries with 1s, 2s, 4s delays
   * 
   * @returns RetryHandler configured for Wikidata API
   */
  static forWikidataAPI(): RetryHandler {
    return new RetryHandler({
      maxRetries: 3,
      initialDelayMs: 1000,
      backoffMultiplier: 2,
    });
  }
}
