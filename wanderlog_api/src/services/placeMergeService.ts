/**
 * Place Merge Service
 * 
 * Handles deduplication and merging of place data during Apify imports.
 * Implements merge strategies for conflict resolution.
 * 
 * Requirements: 2.1-2.6
 */

import prisma from '../config/database';
import {
  ApifyPlaceItem,
  MappedPlace,
  SourceDetails,
  SearchHit,
  MergeStrategy,
  DEFAULT_MERGE_STRATEGY,
} from '../types/apify';
import { Place } from '@prisma/client';

// ============================================
// Types
// ============================================

/**
 * Result of a merge operation
 */
export interface MergedPlace extends Omit<MappedPlace, 'sourceDetails' | 'customFields'> {
  id?: string;
  sourceDetails: SourceDetails;
  customFields: Record<string, unknown>;
  categorySlug?: string;
  categoryEn?: string;
  categoryZh?: string;
  coverImage?: string;
  isVerified?: boolean;
  tags?: Record<string, string[]>;  // StructuredTags
  aiTags?: Array<{ kind: string; id: string; en: string; zh: string; priority?: number }>;
  price?: string;       // 价格范围文本 (如 €10–20)
  priceLevel?: number;  // 价格等级 (0-4)
}

/**
 * Result of an upsert operation
 */
export interface UpsertResult {
  place: Place;
  action: 'inserted' | 'updated';
}

// ============================================
// PlaceMergeService Class
// ============================================

class PlaceMergeService {
  private mergeStrategy: MergeStrategy;

  constructor(strategy: MergeStrategy = DEFAULT_MERGE_STRATEGY) {
    this.mergeStrategy = strategy;
  }

  /**
   * Find existing place record by Google identifiers or location similarity
   * Priority: 
   * 1. placeId (exact match)
   * 2. fid (exact match)
   * 3. cid (exact match)
   * 4. name + coordinates + country (fuzzy match for deduplication)
   * 
   * Requirement 2.1, 2.2
   */
  async findExisting(item: ApifyPlaceItem): Promise<Place | null> {
    // Priority 1: Search by googlePlaceId (placeId)
    if (item.placeId) {
      const byPlaceId = await prisma.place.findUnique({
        where: { googlePlaceId: item.placeId },
      });
      if (byPlaceId) return byPlaceId;
    }

    // Priority 2: Search by fid in customFields
    if (item.fid) {
      const byFid = await prisma.place.findFirst({
        where: {
          customFields: {
            path: ['googleIds', 'fid'],
            equals: item.fid,
          },
        },
      });
      if (byFid) return byFid;
    }

    // Priority 3: Search by cid in customFields
    if (item.cid) {
      const byCid = await prisma.place.findFirst({
        where: {
          customFields: {
            path: ['googleIds', 'cid'],
            equals: item.cid,
          },
        },
      });
      if (byCid) return byCid;
    }

    // Priority 4: Search by location + name + category similarity (for enrichment scenarios)
    // Combines coordinate proximity with name and category matching
    // Works even without countryCode for enrichment
    if (item.location) {
      const COORDINATE_THRESHOLD = 0.0005; // ~55 meters
      
      // Build search criteria
      const whereClause: any = {
        latitude: {
          gte: item.location.lat - COORDINATE_THRESHOLD,
          lte: item.location.lat + COORDINATE_THRESHOLD,
        },
        longitude: {
          gte: item.location.lng - COORDINATE_THRESHOLD,
          lte: item.location.lng + COORDINATE_THRESHOLD,
        },
      };
      
      // Add country filter if available (helps narrow down search)
      if (item.countryCode) {
        whereClause.country = item.countryCode;
      }
      
      // Search for places nearby
      const nearbyPlaces = await prisma.place.findMany({
        where: whereClause,
        take: 20, // Increased limit when no country filter
      });

      if (nearbyPlaces.length > 0) {
        let bestMatch: Place | null = null;
        let bestScore = 0;

        for (const place of nearbyPlaces) {
          // Calculate distance score (0-1, closer = higher)
          const latDiff = Math.abs(place.latitude - item.location.lat);
          const lngDiff = Math.abs(place.longitude - item.location.lng);
          const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
          const distanceScore = Math.max(0, 1 - (distance / COORDINATE_THRESHOLD));

          // Calculate name similarity score (0-1)
          const nameScore = this.calculateNameSimilarity(
            place.name.toLowerCase(),
            item.title.toLowerCase()
          );

          // Calculate category similarity score (0-1)
          const placeAny = place as Place & { categorySlug?: string | null };
          const categoryScore = this.calculateCategorySimilarity(
            placeAny.categorySlug,
            item.categories,
            item.categoryName
          );

          // Combined score: weighted average
          // Distance is most important (50%), then name (30%), then category (20%)
          const combinedScore = 
            distanceScore * 0.5 + 
            nameScore * 0.3 + 
            categoryScore * 0.2;

          // Require minimum thresholds for each component
          // For enrichment: be more lenient with matching
          const meetsMinimums = 
            distance < COORDINATE_THRESHOLD && // Must be within 55m
            (nameScore > 0.2 || categoryScore > 0.4); // Lowered thresholds for enrichment

          if (meetsMinimums && combinedScore > bestScore) {
            bestScore = combinedScore;
            bestMatch = place;
          }
        }

        // Only match if combined score is reasonable (>0.4, lowered from 0.5)
        if (bestMatch && bestScore > 0.4) {
          console.log(`   🔗 Found matching place: "${bestMatch.name}" (score: ${bestScore.toFixed(2)})`);
          return bestMatch;
        }
      }
    }
    
    // Priority 5: Fallback to name + location + country (fuzzy match)
    // This helps deduplicate places with different names
    if (item.title && item.location && item.countryCode) {
      const COORDINATE_THRESHOLD = 0.001; // ~111 meters
      
      // Search for places with similar name in the same country and nearby location
      const similarPlaces = await prisma.place.findMany({
        where: {
          country: item.countryCode,
          name: {
            contains: item.title,
            mode: 'insensitive',
          },
          latitude: {
            gte: item.location.lat - COORDINATE_THRESHOLD,
            lte: item.location.lat + COORDINATE_THRESHOLD,
          },
          longitude: {
            gte: item.location.lng - COORDINATE_THRESHOLD,
            lte: item.location.lng + COORDINATE_THRESHOLD,
          },
        },
        take: 5,
      });

      // Find the closest match
      if (similarPlaces.length > 0) {
        let closestPlace: Place | null = null;
        let minDistance = Infinity;

        for (const place of similarPlaces) {
          // Calculate distance
          const latDiff = Math.abs(place.latitude - item.location.lat);
          const lngDiff = Math.abs(place.longitude - item.location.lng);
          const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);

          // Check name similarity (simple check)
          const nameSimilar = 
            place.name.toLowerCase().includes(item.title.toLowerCase()) ||
            item.title.toLowerCase().includes(place.name.toLowerCase());

          if (nameSimilar && distance < minDistance && distance < COORDINATE_THRESHOLD) {
            minDistance = distance;
            closestPlace = place;
          }
        }

        if (closestPlace) {
          console.log(`   🔗 Found similar place: "${closestPlace.name}" (distance: ${(minDistance * 111).toFixed(0)}m)`);
          return closestPlace;
        }
      }
    }

    return null;
  }

  /**
   * Merge incoming data with existing record
   * 
   * Strategies:
   * - Non-null overwrite: name, address, website, phoneNumber, description (Req 2.3)
   * - Take greater: ratingCount, and rating from side with greater ratingCount (Req 2.4)
   * - Take newer: openingHours based on scrapedAt (Req 2.5)
   * - Append array: sourceDetails.apify.searchHits (Req 2.6)
   */
  merge(existing: Place, incoming: MappedPlace): MergedPlace {
    const existingSourceDetails = this.parseSourceDetails(existing.sourceDetails);
    const existingCustomFields = this.parseCustomFields(existing.customFields);
    const incomingScrapedAt = incoming.sourceDetails.apify.scrapedAt;
    const existingScrapedAt = existingSourceDetails?.apify?.scrapedAt;

    // Cast existing to access category fields
    const existingAny = existing as Place & {
      categorySlug?: string | null;
      categoryEn?: string | null;
      categoryZh?: string | null;
    };

    // Start with existing values
    const merged: MergedPlace = {
      id: existing.id,
      name: existing.name,
      latitude: existing.latitude,
      longitude: existing.longitude,
      address: existing.address ?? undefined,
      city: existing.city ?? undefined,
      country: existing.country ?? undefined,
      rating: existing.rating ?? undefined,
      ratingCount: existing.ratingCount ?? undefined,
      googlePlaceId: existing.googlePlaceId ?? undefined,
      website: existing.website ?? undefined,
      phoneNumber: existing.phoneNumber ?? undefined,
      openingHours: existing.openingHours ?? undefined,
      description: existing.description ?? undefined,
      source: 'apify_google_places',
      sourceDetails: existingSourceDetails || { apify: { scrapedAt: '', searchHits: [] } },
      customFields: existingCustomFields || {},
      categorySlug: existingAny.categorySlug ?? undefined,
      categoryEn: existingAny.categoryEn ?? undefined,
      categoryZh: existingAny.categoryZh ?? undefined,
      coverImage: existing.coverImage ?? undefined,
      isVerified: existing.isVerified,
    };

    // Apply non-null overwrite strategy (Req 2.3)
    for (const field of this.mergeStrategy.nonNullOverwrite) {
      const incomingValue = this.getFieldValue(incoming as unknown as Record<string, unknown>, field);
      if (incomingValue !== null && incomingValue !== undefined) {
        this.setFieldValue(merged as unknown as Record<string, unknown>, field, incomingValue);
      }
    }

    // Apply take greater strategy for ratingCount (Req 2.4)
    const existingRatingCount = existing.ratingCount ?? 0;
    const incomingRatingCount = incoming.ratingCount ?? 0;
    
    if (incomingRatingCount > existingRatingCount) {
      merged.ratingCount = incomingRatingCount;
      merged.rating = incoming.rating;
    } else if (incomingRatingCount === existingRatingCount && incoming.rating !== undefined) {
      // If equal, take incoming rating if available
      merged.rating = incoming.rating ?? merged.rating;
    }
    // If existing has more reviews, keep existing rating

    // Apply take newer strategy for openingHours (Req 2.5)
    if (this.isNewer(incomingScrapedAt, existingScrapedAt)) {
      if (incoming.openingHours !== undefined) {
        merged.openingHours = incoming.openingHours;
      }
    }

    // Apply append array strategy for searchHits (Req 2.6)
    merged.sourceDetails = this.mergeSourceDetails(
      existingSourceDetails,
      incoming.sourceDetails
    );

    // Merge custom fields
    merged.customFields = this.mergeCustomFields(
      existingCustomFields,
      incoming.customFields as unknown as Record<string, unknown>
    );

    // Always update latitude/longitude if incoming has valid values
    if (incoming.latitude !== undefined && incoming.longitude !== undefined) {
      merged.latitude = incoming.latitude;
      merged.longitude = incoming.longitude;
    }

    // Always update googlePlaceId if incoming has it
    if (incoming.googlePlaceId) {
      merged.googlePlaceId = incoming.googlePlaceId;
    }

    // Update price if incoming has it (non-null overwrite)
    if (incoming.price !== undefined && incoming.price !== null) {
      merged.price = incoming.price;
    }

    return merged;
  }

  /**
   * Execute upsert operation to database
   */
  async upsert(place: MergedPlace): Promise<UpsertResult> {
    const data = {
      name: place.name,
      latitude: place.latitude,
      longitude: place.longitude,
      address: place.address ?? null,
      city: place.city ?? null,
      country: place.country ?? null,
      rating: place.rating ?? null,
      ratingCount: place.ratingCount ?? null,
      googlePlaceId: place.googlePlaceId ?? null,
      website: place.website ?? null,
      phoneNumber: place.phoneNumber ?? null,
      openingHours: place.openingHours ?? null,
      description: place.description ?? null,
      price: place.price ?? null,
      priceLevel: place.priceLevel ?? null,
      source: place.source,
      sourceDetails: place.sourceDetails as object,
      customFields: place.customFields as object,
      categorySlug: place.categorySlug ?? null,
      categoryEn: place.categoryEn ?? null,
      categoryZh: place.categoryZh ?? null,
      coverImage: place.coverImage ?? null,
      isVerified: place.isVerified ?? false,
      tags: place.tags ? (place.tags as object) : undefined,
      aiTags: place.aiTags ? (place.aiTags as object[]) : undefined,
      updatedAt: new Date(),
    };

    if (place.id) {
      // Update existing record
      const updated = await prisma.place.update({
        where: { id: place.id },
        data,
      });
      return { place: updated, action: 'updated' };
    } else if (place.googlePlaceId) {
      // Upsert by googlePlaceId
      const upserted = await prisma.place.upsert({
        where: { googlePlaceId: place.googlePlaceId },
        update: data,
        create: {
          ...data,
          createdAt: new Date(),
        },
      });
      
      // Determine if it was an insert or update
      const wasInsert = upserted.createdAt.getTime() === upserted.updatedAt.getTime();
      return { place: upserted, action: wasInsert ? 'inserted' : 'updated' };
    } else {
      // Create new record without googlePlaceId
      const created = await prisma.place.create({
        data: {
          ...data,
          createdAt: new Date(),
        },
      });
      return { place: created, action: 'inserted' };
    }
  }

  // ============================================
  // Helper Methods
  // ============================================

  /**
   * Parse sourceDetails from database JSON
   */
  private parseSourceDetails(sourceDetails: unknown): SourceDetails | null {
    if (!sourceDetails || typeof sourceDetails !== 'object') {
      return null;
    }
    return sourceDetails as SourceDetails;
  }

  /**
   * Parse customFields from database JSON
   */
  private parseCustomFields(customFields: unknown): Record<string, unknown> {
    if (!customFields || typeof customFields !== 'object') {
      return {};
    }
    return customFields as Record<string, unknown>;
  }

  /**
   * Check if incoming timestamp is newer than existing
   */
  private isNewer(incoming?: string, existing?: string): boolean {
    if (!incoming) return false;
    if (!existing) return true;
    
    try {
      const incomingDate = new Date(incoming);
      const existingDate = new Date(existing);
      return incomingDate > existingDate;
    } catch {
      return false;
    }
  }

  /**
   * Get field value from object using dot notation
   */
  private getFieldValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;
    
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
    
    return current;
  }

  /**
   * Set field value on object using dot notation
   */
  private setFieldValue(obj: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.');
    
    if (parts.length === 1) {
      obj[path] = value;
      return;
    }
    
    let current: Record<string, unknown> = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current) || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }
    
    current[parts[parts.length - 1]] = value;
  }

  /**
   * Merge source details, appending searchHits
   */
  private mergeSourceDetails(
    existing: SourceDetails | null,
    incoming: SourceDetails
  ): SourceDetails {
    const existingHits = existing?.apify?.searchHits || [];
    const incomingHits = incoming.apify.searchHits || [];
    
    // Deduplicate searchHits by searchString + scrapedAt
    const hitKey = (hit: SearchHit) => `${hit.searchString}|${hit.scrapedAt}`;
    const existingKeys = new Set(existingHits.map(hitKey));
    
    const newHits = incomingHits.filter(hit => !existingKeys.has(hitKey(hit)));
    const mergedHits = [...existingHits, ...newHits];

    return {
      apify: {
        scrapedAt: incoming.apify.scrapedAt,
        searchString: incoming.apify.searchString ?? existing?.apify?.searchString,
        rank: incoming.apify.rank ?? existing?.apify?.rank,
        fid: incoming.apify.fid ?? existing?.apify?.fid,
        cid: incoming.apify.cid ?? existing?.apify?.cid,
        kgmid: incoming.apify.kgmid ?? existing?.apify?.kgmid,
        searchHits: mergedHits,
      },
    };
  }

  /**
   * Merge custom fields
   */
  private mergeCustomFields(
    existing: Record<string, unknown>,
    incoming: Record<string, unknown>
  ): Record<string, unknown> {
    const merged = { ...existing };
    
    // Merge incoming fields, preferring non-null incoming values
    for (const [key, value] of Object.entries(incoming)) {
      if (value !== null && value !== undefined) {
        if (key === 'googleIds' && existing.googleIds) {
          // Merge googleIds object
          merged.googleIds = {
            ...(existing.googleIds as object),
            ...(value as object),
          };
        } else {
          merged[key] = value;
        }
      }
    }
    
    return merged;
  }

  /**
   * Calculate name similarity using Levenshtein distance
   * Returns a score between 0 (completely different) and 1 (identical)
   */
  private calculateNameSimilarity(name1: string, name2: string): number {
    // Normalize strings
    const s1 = name1.trim().toLowerCase();
    const s2 = name2.trim().toLowerCase();

    // Exact match
    if (s1 === s2) return 1.0;

    // Check if one contains the other
    if (s1.includes(s2) || s2.includes(s1)) {
      const longer = Math.max(s1.length, s2.length);
      const shorter = Math.min(s1.length, s2.length);
      return shorter / longer; // Partial match score
    }

    // Calculate Levenshtein distance
    const distance = this.levenshteinDistance(s1, s2);
    const maxLength = Math.max(s1.length, s2.length);
    
    // Convert distance to similarity score (0-1)
    return Math.max(0, 1 - (distance / maxLength));
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix: number[][] = [];

    // Initialize matrix
    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // deletion
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }

    return matrix[len1][len2];
  }

  /**
   * Calculate category similarity
   * Returns a score between 0 (completely different) and 1 (same category)
   */
  private calculateCategorySimilarity(
    existingCategorySlug: string | null | undefined,
    incomingCategories: string[] | undefined,
    incomingCategoryName: string | undefined
  ): number {
    if (!existingCategorySlug) return 0;

    // Normalize incoming category using the same logic as normalization service
    const { normalizationService } = require('./normalizationService');
    const normalized = normalizationService.normalizeFromApify(
      incomingCategories,
      incomingCategoryName,
      undefined
    );

    // Exact match
    if (existingCategorySlug === normalized.categorySlug) {
      return 1.0;
    }

    // Related categories (partial match)
    const relatedCategories: Record<string, string[]> = {
      'restaurant': ['cafe', 'bakery', 'bar'],
      'cafe': ['restaurant', 'bakery'],
      'museum': ['landmark', 'church', 'castle'],
      'church': ['landmark', 'museum'],
      'hotel': ['hostel'],
      'shop': ['mall'],
    };

    const related = relatedCategories[existingCategorySlug] || [];
    if (related.includes(normalized.categorySlug)) {
      return 0.6; // Partial match for related categories
    }

    return 0; // Different categories
  }
}

// Export singleton instance
export const placeMergeService = new PlaceMergeService();

// Export class for testing
export { PlaceMergeService };
