/**
 * Apify Field Mapper Service
 * 
 * Maps Apify Google Places crawler data to the Place database schema.
 * Handles field mapping, source details extraction, and custom fields extraction.
 * 
 * Requirements: 1.1-1.14, 5.1-5.7
 */

import {
  ApifyPlaceItem,
  MappedPlace,
  SourceDetails,
  CustomFields,
  SearchHit,
  ApifySourceDetails,
} from '../types/apify';

// ============================================
// Constants
// ============================================

/**
 * Source identifier for Apify Google Places imports
 */
export const APIFY_SOURCE = 'apify_google_places' as const;

/**
 * ISO2 Country Code to Full Name mapping
 * Common countries for travel/places data
 */
export const ISO2_TO_COUNTRY_NAME: Record<string, string> = {
  // Europe
  'FR': 'France',
  'DE': 'Germany',
  'IT': 'Italy',
  'ES': 'Spain',
  'PT': 'Portugal',
  'GB': 'United Kingdom',
  'UK': 'United Kingdom',
  'NL': 'Netherlands',
  'BE': 'Belgium',
  'CH': 'Switzerland',
  'AT': 'Austria',
  'SE': 'Sweden',
  'NO': 'Norway',
  'DK': 'Denmark',
  'FI': 'Finland',
  'PL': 'Poland',
  'CZ': 'Czech Republic',
  'GR': 'Greece',
  'IE': 'Ireland',
  'HU': 'Hungary',
  'RO': 'Romania',
  'HR': 'Croatia',
  'SI': 'Slovenia',
  'SK': 'Slovakia',
  'BG': 'Bulgaria',
  'RS': 'Serbia',
  'UA': 'Ukraine',
  'RU': 'Russia',
  'TR': 'Turkey',
  'IS': 'Iceland',
  'LU': 'Luxembourg',
  'MC': 'Monaco',
  'MT': 'Malta',
  'CY': 'Cyprus',
  'EE': 'Estonia',
  'LV': 'Latvia',
  'LT': 'Lithuania',
  
  // Asia
  'JP': 'Japan',
  'CN': 'China',
  'KR': 'South Korea',
  'TW': 'Taiwan',
  'HK': 'Hong Kong',
  'MO': 'Macau',
  'SG': 'Singapore',
  'TH': 'Thailand',
  'VN': 'Vietnam',
  'MY': 'Malaysia',
  'ID': 'Indonesia',
  'PH': 'Philippines',
  'IN': 'India',
  'NP': 'Nepal',
  'LK': 'Sri Lanka',
  'MM': 'Myanmar',
  'KH': 'Cambodia',
  'LA': 'Laos',
  'BD': 'Bangladesh',
  'PK': 'Pakistan',
  'AE': 'United Arab Emirates',
  'SA': 'Saudi Arabia',
  'IL': 'Israel',
  'JO': 'Jordan',
  'LB': 'Lebanon',
  'QA': 'Qatar',
  'KW': 'Kuwait',
  'BH': 'Bahrain',
  'OM': 'Oman',
  'IR': 'Iran',
  'IQ': 'Iraq',
  
  // Americas
  'US': 'United States',
  'CA': 'Canada',
  'MX': 'Mexico',
  'BR': 'Brazil',
  'AR': 'Argentina',
  'CL': 'Chile',
  'CO': 'Colombia',
  'PE': 'Peru',
  'EC': 'Ecuador',
  'VE': 'Venezuela',
  'UY': 'Uruguay',
  'PY': 'Paraguay',
  'BO': 'Bolivia',
  'CR': 'Costa Rica',
  'PA': 'Panama',
  'CU': 'Cuba',
  'DO': 'Dominican Republic',
  'PR': 'Puerto Rico',
  'JM': 'Jamaica',
  'GT': 'Guatemala',
  'HN': 'Honduras',
  'SV': 'El Salvador',
  'NI': 'Nicaragua',
  
  // Oceania
  'AU': 'Australia',
  'NZ': 'New Zealand',
  'FJ': 'Fiji',
  
  // Africa
  'ZA': 'South Africa',
  'EG': 'Egypt',
  'MA': 'Morocco',
  'TN': 'Tunisia',
  'KE': 'Kenya',
  'TZ': 'Tanzania',
  'NG': 'Nigeria',
  'GH': 'Ghana',
  'ET': 'Ethiopia',
  'SN': 'Senegal',
  'CI': 'Ivory Coast',
  'MU': 'Mauritius',
  'SC': 'Seychelles',
};

/**
 * Convert ISO2 country code to full country name
 * Returns the original code if not found in mapping
 */
export function convertCountryCode(iso2Code: string | null | undefined): string | undefined {
  if (!iso2Code) return undefined;
  const upperCode = iso2Code.toUpperCase();
  return ISO2_TO_COUNTRY_NAME[upperCode] || iso2Code;
}

// ============================================
// ApifyFieldMapper Class
// ============================================

class ApifyFieldMapper {
  /**
   * Maps an Apify place item to the Place database schema
   * 
   * Requirements:
   * - 1.1: title → name
   * - 1.2: location.lat/lng → latitude/longitude
   * - 1.3: address → address
   * - 1.4: city → city
   * - 1.5: countryCode → country (ISO2)
   * - 1.6: totalScore → rating
   * - 1.7: reviewsCount → ratingCount
   * - 1.8: placeId → googlePlaceId
   * - 1.9: website → website
   * - 1.10: phoneUnformatted/phone → phoneNumber (prefer phoneUnformatted)
   * - 1.11: openingHours → openingHours (JSON string)
   * - 1.12: price → customFields.priceText (not converted to 0-4)
   * - 1.13: description → description
   * - 1.14: source = 'apify_google_places'
   */
  mapToPlace(item: ApifyPlaceItem): MappedPlace {
    const sourceDetails = this.extractSourceDetails(item);
    const customFields = this.extractCustomFields(item);

    return {
      // Requirement 1.1: title → name
      name: item.title,
      
      // Requirement 1.2: location.lat/lng → latitude/longitude
      latitude: item.location.lat,
      longitude: item.location.lng,
      
      // Requirement 1.3: address → address
      address: item.address ?? undefined,
      
      // Requirement 1.4: city → city
      city: item.city ?? undefined,
      
      // Requirement 1.5: countryCode → country (converted to full name)
      country: convertCountryCode(item.countryCode),
      
      // Requirement 1.6: totalScore → rating
      rating: item.totalScore ?? undefined,
      
      // Requirement 1.7: reviewsCount → ratingCount
      ratingCount: item.reviewsCount ?? undefined,
      
      // Requirement 1.8: placeId → googlePlaceId
      googlePlaceId: item.placeId,
      
      // Requirement 1.9: website → website
      website: item.website ?? undefined,
      
      // Requirement 1.10: phoneUnformatted/phone → phoneNumber (prefer phoneUnformatted)
      phoneNumber: this.extractPhoneNumber(item),
      
      // Requirement 1.11: openingHours → openingHours (JSON string)
      openingHours: this.formatOpeningHours(item.openingHours),
      
      // Requirement 1.13: description → description
      description: item.description ?? undefined,
      
      // price → price (价格范围文本，如 €10–20)
      price: item.price ?? undefined,
      
      // Requirement 1.14: source = 'apify_google_places'
      source: APIFY_SOURCE,
      
      // Source details and custom fields
      sourceDetails,
      customFields,
    };
  }

  /**
   * Extracts source details from Apify data
   * 
   * Requirements:
   * - 5.1: Store scrapedAt, searchString, rank, fid, cid, kgmid in sourceDetails.apify
   * - 5.2: Store searchHits array with [{searchString, rank, scrapedAt, searchPageUrl}]
   */
  extractSourceDetails(item: ApifyPlaceItem): SourceDetails {
    const searchHit: SearchHit = {
      searchString: item.searchString ?? '',
      rank: item.rank ?? 0,
      scrapedAt: item.scrapedAt ?? new Date().toISOString(),
      searchPageUrl: item.searchPageUrl ?? undefined,
    };

    const apifyDetails: ApifySourceDetails = {
      scrapedAt: item.scrapedAt ?? new Date().toISOString(),
      searchString: item.searchString ?? undefined,
      rank: item.rank ?? undefined,
      fid: item.fid ?? undefined,
      cid: item.cid ?? undefined,
      kgmid: item.kgmid ?? undefined,
      searchHits: [searchHit],
    };

    return {
      apify: apifyDetails,
    };
  }

  /**
   * Extracts custom fields from Apify data
   * 
   * Requirements:
   * - 1.12: price → customFields.priceText
   * - 5.3: additionalInfo → customFields.additionalInfo
   * - 5.4: reviewsTags → customFields.reviewsTags
   * - 5.5: popularTimesHistogram → customFields.popularTimes
   * - 5.6: reviewsDistribution → customFields.reviewsDistribution
   * - 5.7: categories → customFields.categoriesRaw
   */
  extractCustomFields(item: ApifyPlaceItem): CustomFields {
    const customFields: CustomFields = {};

    // Requirement 1.12: price → customFields.priceText (not converted to 0-4)
    if (item.price) {
      customFields.priceText = item.price;
    }

    // Requirement 5.3: additionalInfo → customFields.additionalInfo
    if (item.additionalInfo && Object.keys(item.additionalInfo).length > 0) {
      customFields.additionalInfo = item.additionalInfo;
    }

    // Requirement 5.4: reviewsTags → customFields.reviewsTags
    if (item.reviewsTags && item.reviewsTags.length > 0) {
      customFields.reviewsTags = item.reviewsTags;
    }

    // Requirement 5.5: popularTimesHistogram → customFields.popularTimes
    if (item.popularTimesHistogram && Object.keys(item.popularTimesHistogram).length > 0) {
      customFields.popularTimes = item.popularTimesHistogram;
    }

    // Requirement 5.6: reviewsDistribution → customFields.reviewsDistribution
    if (item.reviewsDistribution) {
      customFields.reviewsDistribution = item.reviewsDistribution;
    }

    // Requirement 5.7: categories → customFields.categoriesRaw
    if (item.categories && item.categories.length > 0) {
      customFields.categoriesRaw = item.categories;
    }

    // Store Google IDs for reference
    if (item.fid || item.cid) {
      customFields.googleIds = {
        fid: item.fid ?? undefined,
        cid: item.cid ?? undefined,
      };
    }

    // Store original image URL if present (for later R2 migration)
    if (item.imageUrl) {
      customFields.imageSourceUrl = item.imageUrl;
    }

    return customFields;
  }

  /**
   * Extracts phone number, preferring phoneUnformatted over phone
   * Requirement 1.10
   */
  private extractPhoneNumber(item: ApifyPlaceItem): string | undefined {
    // Prefer phoneUnformatted as it's cleaner for storage
    if (item.phoneUnformatted) {
      return item.phoneUnformatted;
    }
    if (item.phone) {
      return item.phone;
    }
    return undefined;
  }

  /**
   * Formats opening hours array to JSON string
   * Requirement 1.11
   */
  private formatOpeningHours(openingHours: ApifyPlaceItem['openingHours']): string | undefined {
    if (!openingHours || openingHours.length === 0) {
      return undefined;
    }
    return JSON.stringify(openingHours);
  }
}

// Export singleton instance
export const apifyFieldMapper = new ApifyFieldMapper();

// Export class for testing
export { ApifyFieldMapper };
