/**
 * Google Places Enterprise Service
 * 
 * 使用 Google Maps Text Search (New) API - Enterprise 版本
 * 实现并行搜索架构中的 Google 搜索部分
 * 
 * 成本估算:
 * - Text Search Enterprise: ~$0.035 per request (20 places)
 * - Photo fetch: ~$0.007 per photo
 */

import axios, { AxiosInstance } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import prisma from '../config/database';

// ============================================
// Types and Interfaces
// ============================================

export interface GooglePlace {
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

export interface AddressComponent {
  longText: string;
  shortText: string;
  types: string[];
}

export interface OpeningHours {
  openNow?: boolean;
  weekdayDescriptions?: string[];
}

interface TextSearchResponse {
  places?: RawGooglePlace[];
  nextPageToken?: string;
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
// Field Mask Configuration - Cost Control
// ============================================

/**
 * Field Mask 配置 - 控制 API 成本
 * 只请求需要的字段，避免不必要的费用
 * 
 * 成本: ~$0.035 per request (Enterprise tier)
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
].join(',');

// ============================================
// City Name Mapping & District to City Mapping
// ============================================

/**
 * Map localized city names to English
 */
const cityNameMapping: Record<string, string> = {
  // 丹麦
  'København': 'Copenhagen',
  'Kobenhavn': 'Copenhagen',
  // 日本
  '東京': 'Tokyo',
  '東京都': 'Tokyo',
  '大阪': 'Osaka',
  '大阪市': 'Osaka',
  '京都': 'Kyoto',
  '京都市': 'Kyoto',
  '札幌': 'Sapporo',
  '札幌市': 'Sapporo',
  // 泰国
  'กรุงเทพมหานคร': 'Bangkok',
  'เชียงใหม่': 'Chiang Mai',
  // 德国
  'München': 'Munich',
  'Köln': 'Cologne',
  // 奥地利
  'Wien': 'Vienna',
  // 意大利
  'Roma': 'Rome',
  'Milano': 'Milan',
  'Firenze': 'Florence',
  'Venezia': 'Venice',
  'Napoli': 'Naples',
  // 西班牙
  'Sevilla': 'Seville',
  // 中国
  '北京': 'Beijing',
  '上海': 'Shanghai',
  '香港': 'Hong Kong',
  // 韩国
  '서울': 'Seoul',
  '부산': 'Busan',
};

/**
 * Map district/ward names to their parent city
 * Key: district name, Value: parent city name
 */
const districtToCityMapping: Record<string, string> = {
  // Tokyo districts (23 special wards + common areas)
  'Minato City': 'Tokyo',
  'Minato': 'Tokyo',
  'Shibuya': 'Tokyo',
  'Shibuya City': 'Tokyo',
  'Shinjuku': 'Tokyo',
  'Shinjuku City': 'Tokyo',
  'Chiyoda': 'Tokyo',
  'Chiyoda City': 'Tokyo',
  'Taito': 'Tokyo',
  'Taito City': 'Tokyo',
  'Chuo': 'Tokyo',
  'Chuo City': 'Tokyo',
  'Meguro': 'Tokyo',
  'Meguro City': 'Tokyo',
  'Setagaya': 'Tokyo',
  'Setagaya City': 'Tokyo',
  'Nakano': 'Tokyo',
  'Nakano City': 'Tokyo',
  'Toshima': 'Tokyo',
  'Toshima City': 'Tokyo',
  'Sumida': 'Tokyo',
  'Sumida City': 'Tokyo',
  'Koto': 'Tokyo',
  'Koto City': 'Tokyo',
  'Shinagawa': 'Tokyo',
  'Shinagawa City': 'Tokyo',
  'Ota': 'Tokyo',
  'Ota City': 'Tokyo',
  'Bunkyo': 'Tokyo',
  'Bunkyo City': 'Tokyo',
  'Arakawa': 'Tokyo',
  'Arakawa City': 'Tokyo',
  'Nerima': 'Tokyo',
  'Nerima City': 'Tokyo',
  'Suginami': 'Tokyo',
  'Suginami City': 'Tokyo',
  'Itabashi': 'Tokyo',
  'Itabashi City': 'Tokyo',
  'Katsushika': 'Tokyo',
  'Katsushika City': 'Tokyo',
  'Edogawa': 'Tokyo',
  'Edogawa City': 'Tokyo',
  'Adachi': 'Tokyo',
  'Adachi City': 'Tokyo',
  'Kita': 'Tokyo',
  'Kita City': 'Tokyo',
  
  // Sydney districts
  'North Sydney': 'Sydney',
  'Surry Hills': 'Sydney',
  'Haymarket': 'Sydney',
  'Pyrmont': 'Sydney',
  'Darlinghurst': 'Sydney',
  'Paddington': 'Sydney',
  'Newtown': 'Sydney',
  'Bondi': 'Sydney',
  'Manly': 'Sydney',
  'Parramatta': 'Sydney',
  'Chatswood': 'Sydney',
  'Circular Quay': 'Sydney',
  'The Rocks': 'Sydney',
  'Barangaroo': 'Sydney',
  'Ultimo': 'Sydney',
  'Redfern': 'Sydney',
  'Glebe': 'Sydney',
  'Chippendale': 'Sydney',
  'Alexandria': 'Sydney',
  'Waterloo': 'Sydney',
  
  // Osaka districts
  'Namba': 'Osaka',
  'Umeda': 'Osaka',
  'Shinsaibashi': 'Osaka',
  'Dotonbori': 'Osaka',
  'Tennoji': 'Osaka',
  'Kita-ku': 'Osaka',
  'Chuo-ku': 'Osaka',
  
  // London districts
  'Westminster': 'London',
  'Camden': 'London',
  'Kensington': 'London',
  'Chelsea': 'London',
  'Shoreditch': 'London',
  'Soho': 'London',
  'Covent Garden': 'London',
  'Notting Hill': 'London',
  'Brixton': 'London',
  'Greenwich': 'London',
  
  // New York districts
  'Manhattan': 'New York',
  'Brooklyn': 'New York',
  'Queens': 'New York',
  'Bronx': 'New York',
  'Staten Island': 'New York',
  
  // Paris districts (arrondissements)
  '1er Arrondissement': 'Paris',
  '2e Arrondissement': 'Paris',
  '3e Arrondissement': 'Paris',
  '4e Arrondissement': 'Paris',
  '5e Arrondissement': 'Paris',
  '6e Arrondissement': 'Paris',
  '7e Arrondissement': 'Paris',
  '8e Arrondissement': 'Paris',
  'Le Marais': 'Paris',
  'Montmartre': 'Paris',
  'Saint-Germain-des-Prés': 'Paris',
  
  // Singapore districts
  'Orchard': 'Singapore',
  'Marina Bay': 'Singapore',
  'Chinatown': 'Singapore',
  'Little India': 'Singapore',
  'Sentosa': 'Singapore',
  
  // Hong Kong districts
  'Central': 'Hong Kong',
  'Wan Chai': 'Hong Kong',
  'Causeway Bay': 'Hong Kong',
  'Tsim Sha Tsui': 'Hong Kong',
  'Mong Kok': 'Hong Kong',
  'Kowloon': 'Hong Kong',
};

/**
 * Normalize city name - handles both localization and district mapping
 */
function normalizeCity(city: string): string {
  if (!city) return city;
  
  // First check district mapping
  if (districtToCityMapping[city]) {
    return districtToCityMapping[city];
  }
  
  // Then check localization mapping
  if (cityNameMapping[city]) {
    return cityNameMapping[city];
  }
  
  return city;
}

// ============================================
// GooglePlacesEnterpriseService Class
// ============================================

class GooglePlacesEnterpriseService {
  private apiKey: string;
  private axiosInstance: AxiosInstance;
  private r2WorkerUrl: string;
  private r2UploadSecret: string;

  constructor() {
    this.apiKey = process.env.GOOGLE_MAPS_API_KEY || '';
    this.r2WorkerUrl = process.env.R2_PUBLIC_URL || 'https://wanderlog-images.blcubahaa0627.workers.dev';
    this.r2UploadSecret = process.env.R2_UPLOAD_SECRET || '';

    if (!this.apiKey) {
      console.warn('⚠️ GOOGLE_MAPS_API_KEY not found in environment variables');
    }

    // Create axios instance with proxy support
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;
    const axiosConfig: any = { timeout: 5000 }; // 5 second timeout as per requirements

    if (proxyUrl) {
      console.log(`🌐 Google Places Enterprise using proxy: ${proxyUrl}`);
      axiosConfig.httpsAgent = new HttpsProxyAgent(proxyUrl);
      axiosConfig.proxy = false;
    }

    this.axiosInstance = axios.create(axiosConfig);
  }

  /**
   * Text Search Enterprise - 返回 20 个地点
   * 
   * 使用 Google Maps Text Search (New) API
   * 成本: ~$0.035 per request
   * 
   * @param query - 搜索查询
   * @returns 20 个地点的数组
   * 
   * Requirements: 4.1, 4.2, 4.3
   */
  async textSearchEnterprise(query: string): Promise<GooglePlace[]> {
    try {
      console.log(`🔍 [Enterprise] Text search: "${query}"`);

      const response = await this.axiosInstance.post<TextSearchResponse>(
        'https://places.googleapis.com/v1/places:searchText',
        {
          textQuery: query,
          maxResultCount: 20, // Return exactly 20 places
          languageCode: 'en', // Use English for consistency
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.apiKey,
            'X-Goog-FieldMask': ENTERPRISE_FIELD_MASK,
          },
        }
      );

      const rawPlaces = response.data.places || [];
      console.log(`📍 [Enterprise] Found ${rawPlaces.length} places`);

      // Transform raw response to our interface
      const places: GooglePlace[] = rawPlaces.map(place => this.transformPlace(place));

      return places;
    } catch (error: any) {
      console.error('❌ [Enterprise] Text search error:', error.message);
      if (error.response?.data) {
        console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }

  /**
   * Transform raw Google API response to our interface
   */
  private transformPlace(raw: RawGooglePlace): GooglePlace {
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
      priceLevel: raw.priceLevel ? this.parsePriceLevel(raw.priceLevel) : undefined,
      priceRange: raw.priceRange ? this.formatPriceRange(raw.priceRange) : undefined,
    };
  }

  /**
   * Extract city and country from address components
   */
  private extractCityCountry(components: RawAddressComponent[]): { city: string; country: string } {
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
  private parsePriceLevel(priceLevel: string): number | undefined {
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
  private formatPriceRange(priceRange: { startPrice?: { units: string }; endPrice?: { units: string } }): string | undefined {
    if (priceRange.startPrice && priceRange.endPrice) {
      return `$${priceRange.startPrice.units} - $${priceRange.endPrice.units}`;
    }
    return undefined;
  }

  /**
   * Upload photo to R2
   * 
   * 下载 Google Places 图片并上传到 Cloudflare R2
   * 只上传第一张图片
   * 成本: ~$0.007 per photo
   * 
   * @param photoReference - Google photo reference (name field from API)
   * @param placeId - Place ID for organizing in R2
   * @returns R2 URL
   * 
   * Requirements: 4.4, 4.6
   */
  async uploadPhotoToR2(photoReference: string, placeId: string): Promise<string | null> {
    if (!photoReference) {
      console.log('⚠️ No photo reference provided');
      return null;
    }

    if (!this.r2UploadSecret) {
      console.warn('⚠️ R2_UPLOAD_SECRET not configured, skipping photo upload');
      return null;
    }

    try {
      // Download photo from Google Places API (New)
      // Photo reference format: places/{place_id}/photos/{photo_id}
      const photoUrl = `https://places.googleapis.com/v1/${photoReference}/media?maxWidthPx=800&key=${this.apiKey}`;
      
      console.log(`📷 Downloading photo for place: ${placeId}`);
      
      const imageBuffer = await this.downloadImage(photoUrl);
      
      if (!imageBuffer || imageBuffer.length === 0) {
        console.log('⚠️ Failed to download image');
        return null;
      }

      // Upload to R2
      const r2Path = `places/${placeId}/cover.jpg`;
      const r2Url = await this.uploadBufferToR2(imageBuffer, r2Path);

      if (r2Url) {
        console.log(`✅ Photo uploaded to R2: ${r2Url}`);
      }

      return r2Url;
    } catch (error: any) {
      console.error(`❌ Photo upload error: ${error.message}`);
      return null;
    }
  }

  /**
   * Download image as Buffer (with proxy support)
   */
  private async downloadImage(url: string): Promise<Buffer> {
    try {
      // Use axios with proxy support instead of native https
      const response = await this.axiosInstance.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        maxRedirects: 5,
      });
      
      return Buffer.from(response.data);
    } catch (error: any) {
      console.error(`❌ Image download error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Upload buffer to R2 (with proxy support)
   */
  private async uploadBufferToR2(imageBuffer: Buffer, path: string): Promise<string | null> {
    try {
      const url = `${this.r2WorkerUrl}/${path}`;
      
      const response = await this.axiosInstance.put(url, imageBuffer, {
        headers: {
          'Authorization': `Bearer ${this.r2UploadSecret}`,
          'Content-Type': 'image/jpeg',
        },
        timeout: 30000,
      });
      
      if (response.status === 200) {
        return url;
      } else {
        console.log(`⚠️ R2 upload failed: ${response.status}`);
        return null;
      }
    } catch (error: any) {
      console.log(`⚠️ R2 error: ${error.message}`);
      return null;
    }
  }

  /**
   * Sync places to database
   * 
   * 将 Google Places 数据同步到 Supabase 数据库
   * 使用 upsert 避免重复
   * 设置 is_verified = true
   * 
   * 优化策略：
   * - 一次性取 20 条落库（$0.035/request）
   * - 只给展示的地点调取图片（$0.007/photo）
   * - 未展示的地点保存 photoReference，方便后续提取
   * 
   * 字段规范：
   * - 使用 categorySlug, categoryEn, categoryZh 而不是 category
   * - 图片使用 R2 URL 格式
   * 
   * @param places - Google Places 数组
   * @param displayPlaceIds - 需要展示的地点 ID 列表（只有这些才下载图片）
   * 
   * Requirements: 4.5, 14.5
   */
  async syncPlacesToDatabase(places: GooglePlace[], displayPlaceIds?: string[]): Promise<void> {
    console.log(`💾 Syncing ${places.length} places to database...`);
    const displaySet = new Set(displayPlaceIds || []);
    const shouldFetchPhotos = displaySet.size > 0;

    let synced = 0;
    let errors = 0;
    let photosDownloaded = 0;

    for (const place of places) {
      try {
        // Extract city and country
        const { city, country } = this.extractCityCountry(place.addressComponents);

        // Only upload photo for displayed places to save costs ($0.007/photo)
        let coverImage: string | null = null;
        const shouldDownloadPhoto = shouldFetchPhotos 
          ? displaySet.has(place.placeId) 
          : true; // If no displayPlaceIds provided, download all (backward compatibility)
        
        if (place.photoReference && shouldDownloadPhoto) {
          coverImage = await this.uploadPhotoToR2(place.photoReference, place.placeId);
          if (coverImage) photosDownloaded++;
        }

        // Extract category using new schema (categorySlug, categoryEn, categoryZh)
        const { categorySlug, categoryEn, categoryZh } = this.extractCategoryNew(place.types);

        // Format opening hours
        const openingHours = place.openingHours?.weekdayDescriptions
          ? JSON.stringify(place.openingHours.weekdayDescriptions)
          : null;

        // Upsert to database - save photoReference for future use
        await prisma.place.upsert({
          where: {
            googlePlaceId: place.placeId,
          },
          update: {
            name: place.displayName,
            city: city,
            country: country,
            latitude: place.location.lat,
            longitude: place.location.lng,
            address: place.formattedAddress,
            openingHours: openingHours,
            rating: place.rating,
            ratingCount: place.userRatingCount,
            // 使用新的分类字段
            categorySlug: categorySlug,
            categoryEn: categoryEn,
            categoryZh: categoryZh,
            coverImage: coverImage || undefined,
            photoReference: place.photoReference || undefined, // Save for future photo extraction
            priceLevel: place.priceLevel,
            website: place.websiteUri,
            phoneNumber: place.phoneNumber,
            isVerified: true, // Google places are verified
            source: 'google_maps',
            lastSyncedAt: new Date(),
            updatedAt: new Date(),
          },
          create: {
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
            // 使用新的分类字段
            categorySlug: categorySlug,
            categoryEn: categoryEn,
            categoryZh: categoryZh,
            coverImage: coverImage || undefined,
            photoReference: place.photoReference || undefined, // Save for future photo extraction
            priceLevel: place.priceLevel,
            website: place.websiteUri,
            phoneNumber: place.phoneNumber,
            isVerified: true, // Google places are verified
            source: 'google_maps',
            lastSyncedAt: new Date(),
          },
        });

        synced++;
      } catch (error: any) {
        console.error(`❌ Error syncing place ${place.displayName}: ${error.message}`);
        errors++;
      }
    }

    console.log(`✅ Synced ${synced} places, ${errors} errors, ${photosDownloaded} photos downloaded`);
  }

  /**
   * Extract category from Google place types - 使用新的分类 schema
   * 返回 categorySlug, categoryEn, categoryZh
   */
  private extractCategoryNew(types: string[]): { categorySlug: string; categoryEn: string; categoryZh: string } {
    // Google type -> categorySlug 映射
    const typeToSlugMap: Record<string, string> = {
      'museum': 'museum',
      'art_gallery': 'art_gallery',
      'cafe': 'cafe',
      'coffee_shop': 'cafe',
      'restaurant': 'restaurant',
      'bar': 'bar',
      'wine_bar': 'bar',
      'cocktail_bar': 'bar',
      'church': 'church',
      'park': 'park',
      'shopping_mall': 'shopping_mall',
      'department_store': 'shopping_mall',
      'store': 'shop',
      'bakery': 'bakery',
      'library': 'library',
      'book_store': 'bookstore',
      'tourist_attraction': 'landmark',
      'cultural_landmark': 'landmark',
      'historical_landmark': 'landmark',
      'lodging': 'hotel',
      'hotel': 'hotel',
      'night_club': 'bar',
      'market': 'market',
      'farmers_market': 'market',
      'cemetery': 'cemetery',
      'university': 'university',
      'hindu_temple': 'temple',
      'buddhist_temple': 'temple',
      'place_of_worship': 'temple',
      'zoo': 'zoo',
      'aquarium': 'zoo',
    };

    // slug -> 英文/中文名映射
    const slugToNames: Record<string, { en: string; zh: string }> = {
      'landmark': { en: 'Landmark', zh: '地标' },
      'museum': { en: 'Museum', zh: '博物馆' },
      'art_gallery': { en: 'Gallery', zh: '美术馆' },
      'shopping_mall': { en: 'Shopping', zh: '商场' },
      'cafe': { en: 'Cafe', zh: '咖啡店' },
      'bakery': { en: 'Bakery', zh: '面包店' },
      'restaurant': { en: 'Restaurant', zh: '餐馆' },
      'bar': { en: 'Bar', zh: '酒吧' },
      'hotel': { en: 'Hotel', zh: '酒店' },
      'church': { en: 'Church', zh: '教堂' },
      'library': { en: 'Library', zh: '图书馆' },
      'bookstore': { en: 'Bookstore', zh: '书店' },
      'cemetery': { en: 'Cemetery', zh: '墓园' },
      'park': { en: 'Park', zh: '公园' },
      'castle': { en: 'Castle', zh: '城堡' },
      'market': { en: 'Market', zh: '市集' },
      'shop': { en: 'Shop', zh: '商店' },
      'university': { en: 'University', zh: '大学' },
      'temple': { en: 'Temple', zh: '寺庙' },
      'zoo': { en: 'Zoo', zh: '动物园' },
    };

    // 查找匹配的 slug
    let categorySlug = 'landmark'; // 默认
    for (const type of types) {
      if (typeToSlugMap[type]) {
        categorySlug = typeToSlugMap[type];
        break;
      }
    }

    const names = slugToNames[categorySlug] || { en: 'Landmark', zh: '地标' };
    
    return {
      categorySlug,
      categoryEn: names.en,
      categoryZh: names.zh,
    };
  }

  /**
   * Search and sync - convenience method
   * 
   * 执行搜索并同步到数据库
   * 
   * @param query - 搜索查询
   * @returns 同步后的地点数组
   */
  async searchAndSync(query: string): Promise<GooglePlace[]> {
    const places = await this.textSearchEnterprise(query);
    
    if (places.length > 0) {
      await this.syncPlacesToDatabase(places);
    }

    return places;
  }

  /**
   * Get places from database by google place IDs
   * 
   * 从数据库获取已同步的地点
   */
  async getPlacesFromDatabase(googlePlaceIds: string[]): Promise<any[]> {
    return prisma.place.findMany({
      where: {
        googlePlaceId: {
          in: googlePlaceIds,
        },
      },
    });
  }
}

// Export singleton instance
const googlePlacesEnterpriseService = new GooglePlacesEnterpriseService();
export default googlePlacesEnterpriseService;
export { GooglePlacesEnterpriseService };
