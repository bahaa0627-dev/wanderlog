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
   * Find existing place record by Google identifiers
   * Priority: placeId > fid > cid
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
}

// Export singleton instance
export const placeMergeService = new PlaceMergeService();

// Export class for testing
export { PlaceMergeService };
