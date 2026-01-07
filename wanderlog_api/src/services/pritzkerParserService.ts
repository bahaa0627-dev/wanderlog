/**
 * Pritzker Architecture Parser Service
 * 普利兹克建筑作品解析服务
 *
 * Core parsing functions for importing Pritzker Prize architect works
 * from Wikidata JSON into the Place database.
 */

import {
  Coordinates,
  WikidataArchitectureEntry,
  DeduplicatedBuilding,
  PlaceImportData,
  ValidationResult,
} from '../types/pritzkerArchitecture';

// ============================================================================
// Coordinate Parsing
// ============================================================================

/**
 * Parse coordinates from Wikidata "Point(lng lat)" format
 *
 * @param coord - Coordinate string in "Point(lng lat)" format, e.g., "Point(-43.196851 -22.911384)"
 * @returns Parsed coordinates object with latitude and longitude, or null if invalid
 *
 * Requirements: 1.2
 */
export function parseCoordinates(coord: string): Coordinates | null {
  if (!coord || typeof coord !== 'string') {
    return null;
  }

  // Match "Point(lng lat)" format - longitude comes first, then latitude
  const match = coord.match(/Point\(([-\d.]+)\s+([-\d.]+)\)/i);
  if (!match) {
    return null;
  }

  const longitude = parseFloat(match[1]);
  const latitude = parseFloat(match[2]);

  // Validate coordinate ranges
  if (isNaN(longitude) || isNaN(latitude)) {
    return null;
  }

  if (longitude < -180 || longitude > 180) {
    return null;
  }

  if (latitude < -90 || latitude > 90) {
    return null;
  }

  return {
    latitude,
    longitude,
  };
}

// ============================================================================
// Wikidata QID Extraction
// ============================================================================

/**
 * Extract Wikidata QID from a Wikidata URL
 *
 * @param url - Wikidata URL, e.g., "http://www.wikidata.org/entity/Q281521"
 * @returns Extracted QID (e.g., "Q281521"), or null if invalid
 *
 * Requirements: 1.3
 */
export function extractWikidataQID(url: string): string | null {
  if (!url || typeof url !== 'string') {
    return null;
  }

  // Match Q followed by one or more digits at the end of the URL
  const match = url.match(/Q\d+$/);
  return match ? match[0] : null;
}

// ============================================================================
// Architect Tag Formatting
// ============================================================================

/**
 * Format architect name into a tag-friendly format
 *
 * Removes spaces, dots, accents, and special characters to create
 * a clean tag format suitable for searching and display.
 *
 * @param architectLabel - Architect name, e.g., "Oscar Niemeyer", "I. M. Pei", "Kenzō Tange"
 * @returns Formatted tag, e.g., "OscarNiemeyer", "IMPei", "KenzoTange"
 *
 * Requirements: 5.2
 */
export function formatArchitectTag(architectLabel: string): string {
  if (!architectLabel || typeof architectLabel !== 'string') {
    return '';
  }

  return architectLabel
    // Normalize Unicode to decompose accented characters (e.g., ō → o + combining macron)
    .normalize('NFD')
    // Remove combining diacritical marks (accents, umlauts, etc.)
    .replace(/[\u0300-\u036f]/g, '')
    // Remove all non-letter characters (spaces, dots, hyphens, etc.)
    .replace(/[^a-zA-Z]/g, '');
}

// ============================================================================
// City Selection
// ============================================================================

/**
 * Select the best city name from a list of city names
 *
 * Prioritizes city names that don't contain administrative subdivisions
 * like "arrondissement", "District", or "Subdistrict". If all cities
 * contain these terms, selects the shortest one.
 *
 * @param cities - Array of city names
 * @returns The best city name, or empty string if array is empty
 *
 * Requirements: 2.2
 */
export function selectBestCity(cities: string[]): string {
  if (!cities || cities.length === 0) {
    return '';
  }

  // Filter out cities containing administrative subdivision terms
  const filtered = cities.filter(
    (c) =>
      !c.includes('arrondissement') &&
      !c.includes('District') &&
      !c.includes('Subdistrict')
  );

  // If we have filtered results, pick the shortest one
  if (filtered.length > 0) {
    return filtered.sort((a, b) => a.length - b.length)[0];
  }

  // Otherwise, pick the shortest from all cities
  return cities.sort((a, b) => a.length - b.length)[0];
}

// ============================================================================
// Deduplication
// ============================================================================

/**
 * Deduplicate entries by Wikidata QID and merge duplicate records
 *
 * Groups entries by their Wikidata QID and merges duplicates by:
 * - Collecting all unique city names
 * - Collecting all unique image URLs
 * - Using the first valid coordinate found
 *
 * @param entries - Array of Wikidata architecture entries
 * @returns Array of deduplicated buildings
 *
 * Requirements: 2.1, 2.2, 7.3
 */
export function deduplicateEntries(
  entries: WikidataArchitectureEntry[]
): DeduplicatedBuilding[] {
  if (!entries || entries.length === 0) {
    return [];
  }

  // Group entries by Wikidata QID
  const groupedByQID = new Map<string, WikidataArchitectureEntry[]>();

  for (const entry of entries) {
    const workQID = extractWikidataQID(entry.work);
    if (!workQID) {
      continue; // Skip entries without valid QID
    }

    if (!groupedByQID.has(workQID)) {
      groupedByQID.set(workQID, []);
    }
    groupedByQID.get(workQID)!.push(entry);
  }

  // Merge duplicate entries
  const deduplicated: DeduplicatedBuilding[] = [];

  for (const [qid, duplicates] of groupedByQID.entries()) {
    // Extract architect QID from the first entry
    const architectQID = extractWikidataQID(duplicates[0].architect);
    if (!architectQID) {
      continue; // Skip if architect QID is invalid
    }

    // Collect all unique cities
    const cities = Array.from(
      new Set(
        duplicates
          .map((d) => d.cityLabel)
          .filter((c): c is string => !!c && c.trim() !== '')
      )
    );

    // Collect all unique images using collectUniqueImages
    const allImages = duplicates
      .map((d) => d.image)
      .filter((img): img is string => !!img && img.trim() !== '');
    const images = collectUniqueImages(allImages);

    // Find the first entry with valid coordinates
    let coordinates: Coordinates | null = null;
    for (const entry of duplicates) {
      if (entry.coord) {
        coordinates = parseCoordinates(entry.coord);
        if (coordinates) {
          break;
        }
      }
    }

    // Skip if no valid coordinates found
    if (!coordinates) {
      continue;
    }

    // Use the first entry's labels and country
    const firstEntry = duplicates[0];

    deduplicated.push({
      wikidataQID: qid,
      architectQID,
      architectLabel: firstEntry.architectLabel,
      workLabel: firstEntry.workLabel,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      cities,
      country: firstEntry.countryLabel || '',
      images,
    });
  }

  return deduplicated;
}

// ============================================================================
// Category Classification
// ============================================================================

/**
 * Classify a building based on its work label
 *
 * Analyzes the work label to determine the appropriate category based on
 * keyword matching. Returns category information including slug and
 * localized names.
 *
 * @param workLabel - The name/label of the building work
 * @returns Category information (category, categorySlug, categoryEn, categoryZh)
 *
 * Requirements: 4.1, 4.2
 */
export function classifyCategory(workLabel: string): {
  category: string;
  categorySlug: string;
  categoryEn: string;
  categoryZh: string;
} {
  // Import category rules
  const { CATEGORY_RULES, DEFAULT_CATEGORY } = require('../constants/pritzkerCategoryRules');

  if (!workLabel || typeof workLabel !== 'string') {
    return DEFAULT_CATEGORY;
  }

  const lowerLabel = workLabel.toLowerCase();

  // Check each rule for keyword matches
  for (const rule of CATEGORY_RULES) {
    for (const keyword of rule.keywords) {
      if (lowerLabel.includes(keyword.toLowerCase())) {
        return {
          category: rule.category,
          categorySlug: rule.categorySlug,
          categoryEn: rule.categoryEn,
          categoryZh: rule.categoryZh,
        };
      }
    }
  }

  // Return default category if no keywords match
  return DEFAULT_CATEGORY;
}

// ============================================================================
// Tag Generation
// ============================================================================

/**
 * Generate structured tags for a building
 *
 * Creates a tags object with award, style, and architect arrays.
 * - award: Always includes "Pritzker"
 * - style: Always includes "Architecture" as generic tag
 * - architect: Formatted architect name tag
 *
 * @param architectLabel - Architect name, e.g., "Oscar Niemeyer"
 * @returns Tags object with award, style, and architect arrays
 *
 * Requirements: 5.1, 5.3, 5.4
 */
export function generateTags(architectLabel: string): {
  award: string[];
  style: string[];
  architect: string[];
} {
  const architectTag = formatArchitectTag(architectLabel);

  return {
    award: ['Pritzker'],
    style: ['Architecture'],
    architect: architectTag ? [architectTag] : [],
  };
}

// ============================================================================
// AI Tag Generation
// ============================================================================

/**
 * Generate AI tags with priority for display ordering
 *
 * Creates an array of tags with priority values for display:
 * - Award tags (e.g., "Pritzker"): priority 100 (highest)
 * - Architect tags (e.g., "OscarNiemeyer"): priority 90
 * - Specific style tags (e.g., "Modernism"): priority 80
 * - Generic style tag ("Architecture"): priority 50 (lowest)
 *
 * @param tags - Structured tags object from generateTags
 * @returns Array of AI tags sorted by priority (descending)
 *
 * Requirements: 6.1, 6.2
 */
export function generateAiTags(tags: {
  award: string[];
  style: string[];
  architect: string[];
}): Array<{ en: string; priority: number }> {
  const aiTags: Array<{ en: string; priority: number }> = [];

  // Add award tags with priority 100
  for (const award of tags.award) {
    aiTags.push({ en: award, priority: 100 });
  }

  // Add architect tags with priority 90
  for (const architect of tags.architect) {
    aiTags.push({ en: architect, priority: 90 });
  }

  // Add style tags with appropriate priority
  for (const style of tags.style) {
    // Generic "Architecture" tag gets priority 50
    // Specific style tags (future enhancement) would get priority 80
    const priority = style === 'Architecture' ? 50 : 80;
    aiTags.push({ en: style, priority });
  }

  // Sort by priority descending (highest first)
  aiTags.sort((a, b) => b.priority - a.priority);

  return aiTags;
}

// ============================================================================
// Image Processing
// ============================================================================

/**
 * Convert Wikimedia Commons URL from HTTP to HTTPS
 *
 * Ensures all image URLs use secure HTTPS protocol instead of HTTP.
 * This is important for security and to avoid mixed content warnings.
 *
 * @param url - Wikimedia Commons image URL (may be HTTP or HTTPS)
 * @returns URL with HTTPS protocol
 *
 * Requirements: 7.1
 */
export function convertWikimediaUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    return '';
  }

  // Replace http:// with https://
  return url.replace(/^http:\/\//i, 'https://');
}

/**
 * Collect unique image URLs from an array
 *
 * Removes duplicate image URLs and returns a deduplicated array.
 * Also converts all URLs to HTTPS for security.
 *
 * @param images - Array of image URLs (may contain duplicates)
 * @returns Array of unique image URLs with HTTPS protocol
 *
 * Requirements: 7.2, 7.3
 */
export function collectUniqueImages(images: string[]): string[] {
  if (!images || !Array.isArray(images)) {
    return [];
  }

  // Filter out empty/invalid URLs
  const validImages = images.filter(
    (img) => img && typeof img === 'string' && img.trim() !== ''
  );

  // Convert all URLs to HTTPS
  const httpsImages = validImages.map((img) => convertWikimediaUrl(img));

  // Remove duplicates using Set
  const uniqueImages = Array.from(new Set(httpsImages));

  return uniqueImages;
}

// ============================================================================
// Data Mapping
// ============================================================================

/**
 * Map a DeduplicatedBuilding to PlaceImportData for database import
 *
 * Converts the intermediate deduplicated building data into the format
 * required for importing into the Place database. This includes:
 * - Selecting the best city name
 * - Classifying the category
 * - Generating tags and AI tags
 * - Setting up custom fields
 *
 * @param building - Deduplicated building data
 * @returns PlaceImportData ready for database import
 *
 * Requirements: 3.1, 3.2, 3.3
 */
export function mapToPlaceData(building: DeduplicatedBuilding): PlaceImportData {
  // Select the best city name from available cities
  const city = selectBestCity(building.cities);

  // Classify the building category based on work label
  const categoryInfo = classifyCategory(building.workLabel);

  // Generate structured tags
  const tags = generateTags(building.architectLabel);

  // Generate AI tags with priority
  const aiTags = generateAiTags(tags);

  // Get the cover image (first image) or null
  const coverImage = building.images.length > 0 ? building.images[0] : null;

  // Build the PlaceImportData object
  const placeData: PlaceImportData = {
    name: building.workLabel,
    city,
    country: building.country,
    latitude: building.latitude,
    longitude: building.longitude,
    coverImage,
    images: building.images,
    source: 'wikidata',
    sourceDetail: building.wikidataQID,
    isVerified: true,
    category: categoryInfo.category,
    categorySlug: categoryInfo.categorySlug,
    categoryEn: categoryInfo.categoryEn,
    categoryZh: categoryInfo.categoryZh,
    tags,
    aiTags,
    customFields: {
      architect: building.architectLabel,
      architectQID: building.architectQID,
      wikidataWorkURL: `http://www.wikidata.org/entity/${building.wikidataQID}`,
    },
  };

  return placeData;
}

// ============================================================================
// Database Operations
// ============================================================================

import prisma from '../config/database';
import { UpsertResult } from '../types/pritzkerArchitecture';
import { Prisma } from '@prisma/client';

/**
 * Upsert a place record in the database
 *
 * Checks if a place already exists by sourceDetail (Wikidata QID) or
 * googlePlaceId (for backward compatibility). If found, updates the
 * existing record; otherwise, creates a new one.
 *
 * @param data - PlaceImportData to upsert
 * @returns UpsertResult indicating the action taken and record ID
 *
 * Requirements: 2.3
 */
export async function upsertPlace(data: PlaceImportData): Promise<UpsertResult> {
  try {
    // Check if a place already exists with the same sourceDetail or googlePlaceId
    const existing = await prisma.place.findFirst({
      where: {
        OR: [
          { sourceDetail: data.sourceDetail },
          { googlePlaceId: data.sourceDetail }, // Backward compatibility
        ],
      },
    });

    if (existing) {
      // Update existing record
      const updated = await prisma.place.update({
        where: { id: existing.id },
        data: {
          name: data.name,
          city: data.city,
          country: data.country,
          latitude: data.latitude,
          longitude: data.longitude,
          coverImage: data.coverImage,
          images: data.images as Prisma.InputJsonValue,
          source: data.source,
          sourceDetail: data.sourceDetail,
          isVerified: data.isVerified,
          category: data.category,
          categorySlug: data.categorySlug,
          categoryEn: data.categoryEn,
          categoryZh: data.categoryZh,
          tags: data.tags as unknown as Prisma.InputJsonValue,
          aiTags: data.aiTags as unknown as Prisma.InputJsonValue,
          customFields: data.customFields as unknown as Prisma.InputJsonValue,
          // Optional fields from AI enrichment
          ...(data.description && { description: data.description }),
          ...(data.address && { address: data.address }),
          ...(data.website && { website: data.website }),
          updatedAt: new Date(),
        },
      });
      return { action: 'updated', id: updated.id };
    } else {
      // Create new record
      const created = await prisma.place.create({
        data: {
          name: data.name,
          city: data.city,
          country: data.country,
          latitude: data.latitude,
          longitude: data.longitude,
          coverImage: data.coverImage,
          images: data.images as Prisma.InputJsonValue,
          source: data.source,
          sourceDetail: data.sourceDetail,
          isVerified: data.isVerified,
          category: data.category,
          categorySlug: data.categorySlug,
          categoryEn: data.categoryEn,
          categoryZh: data.categoryZh,
          tags: data.tags as unknown as Prisma.InputJsonValue,
          aiTags: data.aiTags as unknown as Prisma.InputJsonValue,
          customFields: data.customFields as unknown as Prisma.InputJsonValue,
          // Optional fields from AI enrichment
          ...(data.description && { description: data.description }),
          ...(data.address && { address: data.address }),
          ...(data.website && { website: data.website }),
        },
      });
      return { action: 'created', id: created.id };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { action: 'error', error: errorMessage };
  }
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate a Wikidata architecture entry
 *
 * Checks that all required fields are present and valid:
 * - work: Must be a valid Wikidata URL
 * - workLabel: Must be present and non-empty
 * - architectLabel: Must be present and non-empty
 * - coord: If present, must be in valid "Point(lng lat)" format
 *
 * @param entry - WikidataArchitectureEntry to validate
 * @returns ValidationResult with isValid flag and list of errors
 *
 * Requirements: 1.4
 */
export function validateEntry(entry: WikidataArchitectureEntry): ValidationResult {
  const errors: string[] = [];

  // Check required work URL
  if (!entry.work) {
    errors.push('Missing work URL');
  } else {
    const qid = extractWikidataQID(entry.work);
    if (!qid) {
      errors.push('Invalid work URL: cannot extract Wikidata QID');
    }
  }

  // Check required work label
  if (!entry.workLabel) {
    errors.push('Missing work label');
  } else if (entry.workLabel.trim() === '') {
    errors.push('Work label is empty');
  }

  // Check required architect label
  if (!entry.architectLabel) {
    errors.push('Missing architect label');
  } else if (entry.architectLabel.trim() === '') {
    errors.push('Architect label is empty');
  }

  // Check coordinate format if present
  if (entry.coord) {
    const coords = parseCoordinates(entry.coord);
    if (!coords) {
      errors.push('Invalid coordinate format');
    }
  }

  // Check architect URL if present
  if (entry.architect) {
    const architectQID = extractWikidataQID(entry.architect);
    if (!architectQID) {
      errors.push('Invalid architect URL: cannot extract Wikidata QID');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Check if a work label is a Q-number (needs manual review)
 *
 * Wikidata sometimes returns Q-numbers as labels when no proper
 * label exists for the entity. These records need manual review
 * to add proper names.
 *
 * @param workLabel - The work label to check
 * @returns true if the label is a Q-number (e.g., "Q118424126")
 *
 * Requirements: 3.2
 */
export function isQNumberLabel(workLabel: string): boolean {
  if (!workLabel || typeof workLabel !== 'string') {
    return false;
  }

  // Check if the label matches Q followed by digits only
  return /^Q\d+$/.test(workLabel.trim());
}
