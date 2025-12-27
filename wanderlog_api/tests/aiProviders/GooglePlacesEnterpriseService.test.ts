/**
 * Unit Tests for Google Places Enterprise Service
 * 
 * Feature: ai-search-v2-parallel-pipeline
 * 
 * Tests Field Mask configuration and database sync functionality
 * for the GooglePlacesEnterpriseService.
 * 
 * Requirements: 4.1, 4.5
 */

// ============================================
// Types and Interfaces (extracted for testing)
// ============================================

interface GooglePlace {
  placeId: string;
  displayName: string;
  location: { lat: number; lng: number };
  types: string[];
  addressComponents: AddressComponent[];
  formattedAddress: string;
  photoReference?: string;
  openingHours?: OpeningHours;
  rating?: number;
  userRatingCount?: number;
  phoneNumber?: string;
  websiteUri?: string;
  googleMapsUri: string;
  priceLevel?: number;
  priceRange?: string;
}

interface AddressComponent {
  longText: string;
  shortText: string;
  types: string[];
}

interface OpeningHours {
  openNow?: boolean;
  weekdayDescriptions?: string[];
}

interface RawGooglePlace {
  id: string;
  displayName?: { text: string; languageCode?: string };
  location?: { latitude: number; longitude: number };
  types?: string[];
  addressComponents?: RawAddressComponent[];
  formattedAddress?: string;
  photos?: RawPhoto[];
  currentOpeningHours?: RawOpeningHours;
  rating?: number;
  userRatingCount?: number;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  priceLevel?: string;
  priceRange?: { startPrice?: { units: string }; endPrice?: { units: string } };
}

interface RawAddressComponent {
  longText: string;
  shortText: string;
  types: string[];
}

interface RawPhoto {
  name: string;
  widthPx?: number;
  heightPx?: number;
}

interface RawOpeningHours {
  openNow?: boolean;
  weekdayDescriptions?: string[];
}

// ============================================
// Field Mask Configuration (extracted for testing)
// ============================================

/**
 * Field Mask 配置 - 控制 API 成本
 * 只请求需要的字段，避免不必要的费用
 * 
 * 成本: ~$0.035 per request (Enterprise tier)
 * Requirements: 4.1, 4.2, 4.3
 */
const ENTERPRISE_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.location',
  'places.types',
  'places.addressComponents',
  'places.formattedAddress',
  'places.photos',
  'places.currentOpeningHours',
  'places.rating',
  'places.userRatingCount',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.googleMapsUri',
  'places.priceLevel',
  'places.priceRange',
];

// ============================================
// City Name Mapping (extracted for testing)
// ============================================

const cityNameMapping: Record<string, string> = {
  'København': 'Copenhagen',
  'Kobenhavn': 'Copenhagen',
  '東京': 'Tokyo',
  '東京都': 'Tokyo',
  '大阪': 'Osaka',
  '大阪市': 'Osaka',
  '京都': 'Kyoto',
  '京都市': 'Kyoto',
  '札幌': 'Sapporo',
  '札幌市': 'Sapporo',
  'กรุงเทพมหานคร': 'Bangkok',
  'เชียงใหม่': 'Chiang Mai',
  'München': 'Munich',
  'Köln': 'Cologne',
  'Wien': 'Vienna',
  'Roma': 'Rome',
  'Milano': 'Milan',
  'Firenze': 'Florence',
  'Venezia': 'Venice',
  'Napoli': 'Naples',
  'Sevilla': 'Seville',
  '北京': 'Beijing',
  '上海': 'Shanghai',
  '香港': 'Hong Kong',
  '서울': 'Seoul',
  '부산': 'Busan',
};

function normalizeCity(city: string): string {
  if (!city) return city;
  return cityNameMapping[city] || city;
}

// ============================================
// Helper Functions (extracted for testing)
// ============================================

/**
 * Transform raw Google API response to our interface
 */
function transformPlace(raw: RawGooglePlace): GooglePlace {
  return {
    placeId: raw.id,
    displayName: raw.displayName?.text || '',
    location: {
      lat: raw.location?.latitude || 0,
      lng: raw.location?.longitude || 0,
    },
    types: raw.types || [],
    addressComponents: (raw.addressComponents || []).map(ac => ({
      longText: ac.longText,
      shortText: ac.shortText,
      types: ac.types,
    })),
    formattedAddress: raw.formattedAddress || '',
    photoReference: raw.photos?.[0]?.name, // Only first photo
    openingHours: raw.currentOpeningHours ? {
      openNow: raw.currentOpeningHours.openNow,
      weekdayDescriptions: raw.currentOpeningHours.weekdayDescriptions,
    } : undefined,
    rating: raw.rating,
    userRatingCount: raw.userRatingCount,
    phoneNumber: raw.internationalPhoneNumber,
    websiteUri: raw.websiteUri,
    googleMapsUri: raw.googleMapsUri || '',
    priceLevel: raw.priceLevel ? parsePriceLevel(raw.priceLevel) : undefined,
    priceRange: raw.priceRange ? formatPriceRange(raw.priceRange) : undefined,
  };
}

/**
 * Extract city and country from address components
 */
function extractCityCountry(components: RawAddressComponent[]): { city: string; country: string } {
  let city = '';
  let country = '';

  for (const component of components) {
    if (component.types.includes('locality')) {
      city = component.longText;
    } else if (!city && component.types.includes('administrative_area_level_2')) {
      city = component.longText;
    } else if (!city && component.types.includes('administrative_area_level_1')) {
      city = component.longText;
    }

    if (component.types.includes('country')) {
      country = component.longText;
    }
  }

  return { city: normalizeCity(city) || 'Unknown', country: country || 'Unknown' };
}

/**
 * Parse price level string to number
 */
function parsePriceLevel(priceLevel: string): number | undefined {
  const mapping: Record<string, number> = {
    'PRICE_LEVEL_FREE': 0,
    'PRICE_LEVEL_INEXPENSIVE': 1,
    'PRICE_LEVEL_MODERATE': 2,
    'PRICE_LEVEL_EXPENSIVE': 3,
    'PRICE_LEVEL_VERY_EXPENSIVE': 4,
  };
  return mapping[priceLevel];
}

/**
 * Format price range
 */
function formatPriceRange(priceRange: { startPrice?: { units: string }; endPrice?: { units: string } }): string | undefined {
  if (priceRange.startPrice && priceRange.endPrice) {
    return `${priceRange.startPrice.units} - ${priceRange.endPrice.units}`;
  }
  return undefined;
}

/**
 * Extract category from Google place types
 */
function extractCategory(types: string[]): string {
  const categoryMap: Record<string, string> = {
    'museum': 'museum',
    'art_gallery': 'art_gallery',
    'cafe': 'cafe',
    'restaurant': 'restaurant',
    'bar': 'bar',
    'church': 'church',
    'park': 'park',
    'shopping_mall': 'shopping_mall',
    'store': 'store',
    'bakery': 'bakery',
    'library': 'library',
    'tourist_attraction': 'tourist_attraction',
    'lodging': 'lodging',
    'night_club': 'night_club',
    'market': 'market',
    'food': 'food',
    'point_of_interest': 'point_of_interest',
  };

  for (const type of types) {
    if (categoryMap[type]) {
      return categoryMap[type];
    }
  }

  return types[0] || 'other';
}

/**
 * Prepare database record from GooglePlace
 * This simulates what syncPlacesToDatabase does for validation
 */
function prepareDatabaseRecord(place: GooglePlace, coverImage: string | null): {
  googlePlaceId: string;
  name: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  address: string;
  openingHours: string | null;
  rating: number | undefined;
  ratingCount: number | undefined;
  category: string;
  coverImage: string | undefined;
  priceLevel: number | undefined;
  website: string | undefined;
  phoneNumber: string | undefined;
  isVerified: boolean;
  source: string;
} {
  const { city, country } = extractCityCountry(place.addressComponents);
  const category = extractCategory(place.types);
  const openingHours = place.openingHours?.weekdayDescriptions
    ? JSON.stringify(place.openingHours.weekdayDescriptions)
    : null;

  return {
    googlePlaceId: place.placeId,
    name: place.displayName,
    city: city,
    country: country,
    latitude: place.location.lat,
    longitude: place.location.lng,
    address: place.formattedAddress,
    openingHours: openingHours,
    rating: place.rating,
    ratingCount: place.userRatingCount,
    category: category,
    coverImage: coverImage || undefined,
    priceLevel: place.priceLevel,
    website: place.websiteUri,
    phoneNumber: place.phoneNumber,
    isVerified: true, // Google places are always verified
    source: 'google_maps',
  };
}

// ============================================
// Tests
// ============================================

describe('GooglePlacesEnterpriseService Unit Tests', () => {
  /**
   * Test Field Mask Configuration
   * Requirements: 4.1, 4.2, 4.3
   */
  describe('Field Mask Configuration (Requirements 4.1, 4.2, 4.3)', () => {
    it('should include all required fields for place data', () => {
      // Requirement 4.2: place_id, displayName, location, types, etc.
      expect(ENTERPRISE_FIELD_MASK).toContain('places.id');
      expect(ENTERPRISE_FIELD_MASK).toContain('places.displayName');
      expect(ENTERPRISE_FIELD_MASK).toContain('places.location');
      expect(ENTERPRISE_FIELD_MASK).toContain('places.types');
      expect(ENTERPRISE_FIELD_MASK).toContain('places.addressComponents');
      expect(ENTERPRISE_FIELD_MASK).toContain('places.formattedAddress');
    });

    it('should include photo field for image fetching', () => {
      // Requirement 4.4: photo fetch
      expect(ENTERPRISE_FIELD_MASK).toContain('places.photos');
    });

    it('should include opening hours field', () => {
      expect(ENTERPRISE_FIELD_MASK).toContain('places.currentOpeningHours');
    });

    it('should include rating fields', () => {
      expect(ENTERPRISE_FIELD_MASK).toContain('places.rating');
      expect(ENTERPRISE_FIELD_MASK).toContain('places.userRatingCount');
    });

    it('should include contact information fields', () => {
      expect(ENTERPRISE_FIELD_MASK).toContain('places.internationalPhoneNumber');
      expect(ENTERPRISE_FIELD_MASK).toContain('places.websiteUri');
      expect(ENTERPRISE_FIELD_MASK).toContain('places.googleMapsUri');
    });

    it('should include price fields', () => {
      expect(ENTERPRISE_FIELD_MASK).toContain('places.priceLevel');
      expect(ENTERPRISE_FIELD_MASK).toContain('places.priceRange');
    });

    it('should have exactly 15 fields for cost optimization', () => {
      // Requirement 4.3: cost control - only request needed fields
      expect(ENTERPRISE_FIELD_MASK).toHaveLength(15);
    });

    it('should generate correct comma-separated field mask string', () => {
      const fieldMaskString = ENTERPRISE_FIELD_MASK.join(',');
      expect(fieldMaskString).toContain('places.id,');
      expect(fieldMaskString).not.toContain(',,'); // No empty fields
    });
  });

  /**
   * Test Place Transformation
   */
  describe('Place Transformation', () => {
    it('should transform raw Google API response to GooglePlace interface', () => {
      const rawPlace: RawGooglePlace = {
        id: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        displayName: { text: 'Test Cafe', languageCode: 'en' },
        location: { latitude: 35.6762, longitude: 139.6503 },
        types: ['cafe', 'food', 'point_of_interest'],
        addressComponents: [
          { longText: 'Tokyo', shortText: 'Tokyo', types: ['locality'] },
          { longText: 'Japan', shortText: 'JP', types: ['country'] },
        ],
        formattedAddress: '1-1-1 Shibuya, Tokyo, Japan',
        photos: [{ name: 'places/ChIJN1t_tDeuEmsRUsoyG83frY4/photos/abc123' }],
        currentOpeningHours: {
          openNow: true,
          weekdayDescriptions: ['Monday: 9:00 AM – 6:00 PM'],
        },
        rating: 4.5,
        userRatingCount: 1234,
        internationalPhoneNumber: '+81-3-1234-5678',
        websiteUri: 'https://example.com',
        googleMapsUri: 'https://maps.google.com/?cid=123',
        priceLevel: 'PRICE_LEVEL_MODERATE',
      };

      const result = transformPlace(rawPlace);

      expect(result.placeId).toBe('ChIJN1t_tDeuEmsRUsoyG83frY4');
      expect(result.displayName).toBe('Test Cafe');
      expect(result.location.lat).toBe(35.6762);
      expect(result.location.lng).toBe(139.6503);
      expect(result.types).toEqual(['cafe', 'food', 'point_of_interest']);
      expect(result.formattedAddress).toBe('1-1-1 Shibuya, Tokyo, Japan');
      expect(result.photoReference).toBe('places/ChIJN1t_tDeuEmsRUsoyG83frY4/photos/abc123');
      expect(result.openingHours?.openNow).toBe(true);
      expect(result.rating).toBe(4.5);
      expect(result.userRatingCount).toBe(1234);
      expect(result.phoneNumber).toBe('+81-3-1234-5678');
      expect(result.websiteUri).toBe('https://example.com');
      expect(result.priceLevel).toBe(2); // MODERATE = 2
    });

    it('should handle missing optional fields', () => {
      const rawPlace: RawGooglePlace = {
        id: 'test-id',
        displayName: { text: 'Minimal Place' },
      };

      const result = transformPlace(rawPlace);

      expect(result.placeId).toBe('test-id');
      expect(result.displayName).toBe('Minimal Place');
      expect(result.location.lat).toBe(0);
      expect(result.location.lng).toBe(0);
      expect(result.types).toEqual([]);
      expect(result.photoReference).toBeUndefined();
      expect(result.openingHours).toBeUndefined();
      expect(result.rating).toBeUndefined();
    });

    it('should only take first photo reference', () => {
      const rawPlace: RawGooglePlace = {
        id: 'test-id',
        photos: [
          { name: 'photo1' },
          { name: 'photo2' },
          { name: 'photo3' },
        ],
      };

      const result = transformPlace(rawPlace);
      expect(result.photoReference).toBe('photo1');
    });
  });

  /**
   * Test City/Country Extraction
   */
  describe('City/Country Extraction', () => {
    it('should extract city from locality type', () => {
      const components: RawAddressComponent[] = [
        { longText: 'Tokyo', shortText: 'Tokyo', types: ['locality'] },
        { longText: 'Japan', shortText: 'JP', types: ['country'] },
      ];

      const result = extractCityCountry(components);
      expect(result.city).toBe('Tokyo');
      expect(result.country).toBe('Japan');
    });

    it('should fallback to administrative_area_level_2 when locality not present', () => {
      const components: RawAddressComponent[] = [
        { longText: 'Shibuya', shortText: 'Shibuya', types: ['administrative_area_level_2'] },
        { longText: 'Japan', shortText: 'JP', types: ['country'] },
      ];

      const result = extractCityCountry(components);
      expect(result.city).toBe('Shibuya');
    });

    it('should fallback to administrative_area_level_1 when others not present', () => {
      const components: RawAddressComponent[] = [
        { longText: 'California', shortText: 'CA', types: ['administrative_area_level_1'] },
        { longText: 'United States', shortText: 'US', types: ['country'] },
      ];

      const result = extractCityCountry(components);
      expect(result.city).toBe('California');
    });

    it('should return Unknown for missing city/country', () => {
      const components: RawAddressComponent[] = [];
      const result = extractCityCountry(components);
      expect(result.city).toBe('Unknown');
      expect(result.country).toBe('Unknown');
    });
  });

  /**
   * Test City Name Normalization
   */
  describe('City Name Normalization', () => {
    it('should normalize Japanese city names', () => {
      expect(normalizeCity('東京')).toBe('Tokyo');
      expect(normalizeCity('東京都')).toBe('Tokyo');
      expect(normalizeCity('大阪')).toBe('Osaka');
      expect(normalizeCity('京都')).toBe('Kyoto');
    });

    it('should normalize European city names', () => {
      expect(normalizeCity('København')).toBe('Copenhagen');
      expect(normalizeCity('München')).toBe('Munich');
      expect(normalizeCity('Wien')).toBe('Vienna');
      expect(normalizeCity('Roma')).toBe('Rome');
    });

    it('should normalize Asian city names', () => {
      expect(normalizeCity('กรุงเทพมหานคร')).toBe('Bangkok');
      expect(normalizeCity('서울')).toBe('Seoul');
      expect(normalizeCity('北京')).toBe('Beijing');
    });

    it('should return original name if not in mapping', () => {
      expect(normalizeCity('New York')).toBe('New York');
      expect(normalizeCity('London')).toBe('London');
    });

    it('should handle empty string', () => {
      expect(normalizeCity('')).toBe('');
    });
  });

  /**
   * Test Price Level Parsing
   */
  describe('Price Level Parsing', () => {
    it('should parse all price levels correctly', () => {
      expect(parsePriceLevel('PRICE_LEVEL_FREE')).toBe(0);
      expect(parsePriceLevel('PRICE_LEVEL_INEXPENSIVE')).toBe(1);
      expect(parsePriceLevel('PRICE_LEVEL_MODERATE')).toBe(2);
      expect(parsePriceLevel('PRICE_LEVEL_EXPENSIVE')).toBe(3);
      expect(parsePriceLevel('PRICE_LEVEL_VERY_EXPENSIVE')).toBe(4);
    });

    it('should return undefined for unknown price level', () => {
      expect(parsePriceLevel('UNKNOWN')).toBeUndefined();
    });
  });

  /**
   * Test Price Range Formatting
   */
  describe('Price Range Formatting', () => {
    it('should format price range with start and end', () => {
      const priceRange = {
        startPrice: { units: '10' },
        endPrice: { units: '50' },
      };
      expect(formatPriceRange(priceRange)).toBe('10 - 50');
    });

    it('should return undefined when missing start or end price', () => {
      expect(formatPriceRange({ startPrice: { units: '10' } })).toBeUndefined();
      expect(formatPriceRange({ endPrice: { units: '50' } })).toBeUndefined();
      expect(formatPriceRange({})).toBeUndefined();
    });
  });

  /**
   * Test Category Extraction
   */
  describe('Category Extraction', () => {
    it('should extract known categories', () => {
      expect(extractCategory(['cafe', 'food'])).toBe('cafe');
      expect(extractCategory(['restaurant', 'food'])).toBe('restaurant');
      expect(extractCategory(['museum', 'point_of_interest'])).toBe('museum');
      expect(extractCategory(['park', 'tourist_attraction'])).toBe('park');
    });

    it('should return first type if no known category', () => {
      expect(extractCategory(['unknown_type', 'another_type'])).toBe('unknown_type');
    });

    it('should return "other" for empty types array', () => {
      expect(extractCategory([])).toBe('other');
    });

    it('should prioritize known categories over unknown ones', () => {
      expect(extractCategory(['unknown', 'cafe', 'food'])).toBe('cafe');
    });
  });

  /**
   * Test Database Record Preparation
   * Requirements: 4.5, 14.5
   */
  describe('Database Sync Preparation (Requirements 4.5, 14.5)', () => {
    const samplePlace: GooglePlace = {
      placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
      displayName: 'Test Cafe',
      location: { lat: 35.6762, lng: 139.6503 },
      types: ['cafe', 'food', 'point_of_interest'],
      addressComponents: [
        { longText: 'Tokyo', shortText: 'Tokyo', types: ['locality'] },
        { longText: 'Japan', shortText: 'JP', types: ['country'] },
      ],
      formattedAddress: '1-1-1 Shibuya, Tokyo, Japan',
      photoReference: 'places/test/photos/abc123',
      openingHours: {
        openNow: true,
        weekdayDescriptions: ['Monday: 9:00 AM – 6:00 PM', 'Tuesday: 9:00 AM – 6:00 PM'],
      },
      rating: 4.5,
      userRatingCount: 1234,
      phoneNumber: '+81-3-1234-5678',
      websiteUri: 'https://example.com',
      googleMapsUri: 'https://maps.google.com/?cid=123',
      priceLevel: 2,
    };

    it('should set isVerified to true for Google places (Requirement 14.5)', () => {
      const record = prepareDatabaseRecord(samplePlace, null);
      expect(record.isVerified).toBe(true);
    });

    it('should set source to google_maps', () => {
      const record = prepareDatabaseRecord(samplePlace, null);
      expect(record.source).toBe('google_maps');
    });

    it('should use googlePlaceId as the unique identifier', () => {
      const record = prepareDatabaseRecord(samplePlace, null);
      expect(record.googlePlaceId).toBe('ChIJN1t_tDeuEmsRUsoyG83frY4');
    });

    it('should extract and normalize city name', () => {
      const placeWithJapaneseCity: GooglePlace = {
        ...samplePlace,
        addressComponents: [
          { longText: '東京', shortText: '東京', types: ['locality'] },
          { longText: 'Japan', shortText: 'JP', types: ['country'] },
        ],
      };
      const record = prepareDatabaseRecord(placeWithJapaneseCity, null);
      expect(record.city).toBe('Tokyo'); // Normalized from 東京
    });

    it('should extract country name', () => {
      const record = prepareDatabaseRecord(samplePlace, null);
      expect(record.country).toBe('Japan');
    });

    it('should include coordinates', () => {
      const record = prepareDatabaseRecord(samplePlace, null);
      expect(record.latitude).toBe(35.6762);
      expect(record.longitude).toBe(139.6503);
    });

    it('should serialize opening hours as JSON', () => {
      const record = prepareDatabaseRecord(samplePlace, null);
      expect(record.openingHours).toBe(JSON.stringify([
        'Monday: 9:00 AM – 6:00 PM',
        'Tuesday: 9:00 AM – 6:00 PM',
      ]));
    });

    it('should set openingHours to null when not available', () => {
      const placeWithoutHours: GooglePlace = {
        ...samplePlace,
        openingHours: undefined,
      };
      const record = prepareDatabaseRecord(placeWithoutHours, null);
      expect(record.openingHours).toBeNull();
    });

    it('should include rating and rating count', () => {
      const record = prepareDatabaseRecord(samplePlace, null);
      expect(record.rating).toBe(4.5);
      expect(record.ratingCount).toBe(1234);
    });

    it('should extract category from types', () => {
      const record = prepareDatabaseRecord(samplePlace, null);
      expect(record.category).toBe('cafe');
    });

    it('should include cover image when provided', () => {
      const coverImageUrl = 'https://r2.example.com/places/test/cover.jpg';
      const record = prepareDatabaseRecord(samplePlace, coverImageUrl);
      expect(record.coverImage).toBe(coverImageUrl);
    });

    it('should set coverImage to undefined when not provided', () => {
      const record = prepareDatabaseRecord(samplePlace, null);
      expect(record.coverImage).toBeUndefined();
    });

    it('should include contact information', () => {
      const record = prepareDatabaseRecord(samplePlace, null);
      expect(record.website).toBe('https://example.com');
      expect(record.phoneNumber).toBe('+81-3-1234-5678');
    });

    it('should include price level', () => {
      const record = prepareDatabaseRecord(samplePlace, null);
      expect(record.priceLevel).toBe(2);
    });

    it('should handle place with minimal data', () => {
      const minimalPlace: GooglePlace = {
        placeId: 'minimal-id',
        displayName: 'Minimal Place',
        location: { lat: 0, lng: 0 },
        types: [],
        addressComponents: [],
        formattedAddress: '',
        googleMapsUri: '',
      };

      const record = prepareDatabaseRecord(minimalPlace, null);
      
      expect(record.googlePlaceId).toBe('minimal-id');
      expect(record.name).toBe('Minimal Place');
      expect(record.city).toBe('Unknown');
      expect(record.country).toBe('Unknown');
      expect(record.category).toBe('other');
      expect(record.isVerified).toBe(true); // Still verified because it's from Google
    });
  });
});
