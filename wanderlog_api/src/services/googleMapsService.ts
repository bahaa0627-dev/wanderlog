import { Client, AddressType, GeocodingAddressComponentType, PlaceInputType } from '@googlemaps/google-maps-services-js';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { createId } from '@paralleldrive/cuid2';
import prisma from '../config/database';
import axios from 'axios';

// 创建带代理的 Google Maps 客户端
function createGoogleMapsClient(): Client {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;
  const clientConfig: any = { timeout: 30000 };

  if (proxyUrl) {
    console.log(`🌐 Google Maps client using proxy: ${proxyUrl}`);
    clientConfig.axiosInstance = axios.create({
      httpsAgent: new HttpsProxyAgent(proxyUrl),
      proxy: false // 禁用 axios 自己的 proxy 配置
    });
  }

  return new Client(clientConfig);
}

// 延迟初始化客户端
let _client: Client | null = null;
function getClient(): Client {
  if (!_client) {
    _client = createGoogleMapsClient();
  }
  return _client;
}

// 城市名称映射：当地语言 -> 英文
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

// 转换城市名称为英文
function normalizeCity(city: string): string {
  if (!city) return city;
  return cityNameMapping[city] || city;
}

interface PlaceData {
  googlePlaceId: string;
  name: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  address?: string;
  description?: string;
  openingHours?: string;
  rating?: number;
  ratingCount?: number;
  category?: string;
  tags?: string;
  coverImage?: string;
  images?: string;
  // priceLevel?: number; // 移除，省钱
  website?: string;
  phoneNumber?: string;
  aiSummary?: string; // 保留字段，但不从 Google reviews 生成
}

class GoogleMapsService {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.GOOGLE_MAPS_API_KEY || '';
    if (!this.apiKey) {
      console.warn('GOOGLE_MAPS_API_KEY not found in environment variables');
    }
  }

  /**
   * 从Google Place ID获取详细信息（用于详情页）
   * ⚠️ 已禁用：全面禁止使用 Google Places API，改用 Kouri/OpenRouter 联网搜索
   */
  async getPlaceDetails(placeId: string): Promise<PlaceData | null> {
    console.warn(`⚠️ [GoogleMapsService] getPlaceDetails 已禁用，请使用 AI 联网搜索代替. PlaceId: "${placeId}"`);
    return null;
  }

  /**
   * 搜索附近的地点
   * ⚠️ 已禁用：全面禁止使用 Google Places API，改用 Kouri/OpenRouter 联网搜索
   */
  async searchNearby(
    latitude: number,
    longitude: number,
    radius: number = 5000,
    type?: string
  ) {
    console.warn(`⚠️ [GoogleMapsService] searchNearby 已禁用，请使用 AI 联网搜索代替.`);
    return [];
  }

  /**
   * 文本搜索地点
   * ⚠️ 已禁用：全面禁止使用 Google Places API，改用 Kouri/OpenRouter 联网搜索
   */
  async textSearch(query: string, location?: { lat: number; lng: number }) {
    console.warn(`⚠️ [GoogleMapsService] textSearch 已禁用，请使用 AI 联网搜索代替. Query: "${query}"`);
    return [];
  }

  /**
   * 提取分类（英文）
   */
  private extractCategory(types: string[]): string {
    const categoryMap: { [key: string]: string } = {
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
      'point_of_interest': 'point_of_interest'
    };

    for (const type of types) {
      if (categoryMap[type]) {
        return categoryMap[type];
      }
    }

    // 返回第一个类型，如果没有则返回 'other'
    return types[0] || 'other';
  }

  /**
   * 提取标签
   */
  private extractTags(place: any): string[] {
    const tags: string[] = [];
    
    // 基于类型添加标签
    const types = place.types || [];
    if (types.includes('cafe')) tags.push('coffee');
    if (types.includes('bar')) tags.push('drinks');
    if (types.includes('restaurant')) tags.push('food');
    if (types.includes('museum') || types.includes('art_gallery')) tags.push('culture');
    if (types.includes('park')) tags.push('outdoor');
    if (types.includes('church')) tags.push('architecture');
    
    // 基于价格等级
    if (place.price_level !== undefined) {
      if (place.price_level <= 1) tags.push('budget-friendly');
      if (place.price_level >= 3) tags.push('upscale');
    }

    // 基于评分
    if (place.rating >= 4.5) tags.push('highly-rated');

    return tags.slice(0, 5); // 最多5个标签
  }

  /**
   * 提取图片URLs
   */
  private async extractImages(photos: any[]): Promise<{ coverImage?: string; images?: string[] }> {
    if (!photos || photos.length === 0) {
      return {};
    }

    const imageUrls: string[] = [];
    
    for (const photo of photos.slice(0, 5)) { // 最多5张图片
      if (photo.photo_reference) {
        const url = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photo.photo_reference}&key=${this.apiKey}`;
        imageUrls.push(url);
      }
    }

    return {
      coverImage: imageUrls[0],
      images: imageUrls.slice(1)
    };
  }

  /**
   * 检查地点是否已存在（去重）
   */
  async checkDuplicate(name: string, address: string): Promise<boolean> {
    const existing = await prisma.place.findFirst({
      where: {
        name: { equals: name },
        address: { equals: address },
      },
    });
    return existing !== null;
  }

  /**
   * 批量导入地点
   */
  async importSpots(placeIds: string[]): Promise<{ imported: number; skipped: number; errors: number }> {
    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (const placeId of placeIds) {
      try {
        const placeData = await this.getPlaceDetails(placeId);
        
        if (!placeData) {
          errors++;
          continue;
        }

        // 检查是否重复
        const isDuplicate = await this.checkDuplicate(placeData.name, placeData.address || '');
        if (isDuplicate) {
          console.log(`Skipping duplicate: ${placeData.name}`);
          skipped++;
          continue;
        }

        // 使用原生 SQL 创建，避免 DateTime 格式问题
        const id = createId();
        const now = new Date().toISOString();
        
        await prisma.$executeRaw`
          INSERT INTO Place (id, googlePlaceId, name, city, country, latitude, longitude, address, category, rating, ratingCount, coverImage, images, website, phoneNumber, openingHours, source, createdAt, updatedAt, lastSyncedAt)
          VALUES (${id}, ${placeData.googlePlaceId || null}, ${placeData.name}, ${placeData.city || null}, ${placeData.country || null}, ${placeData.latitude}, ${placeData.longitude}, ${placeData.address || null}, ${placeData.category || null}, ${placeData.rating || null}, ${placeData.ratingCount || null}, ${placeData.coverImage || null}, ${placeData.images || null}, ${placeData.website || null}, ${placeData.phoneNumber || null}, ${placeData.openingHours || null}, ${'google_maps'}, ${now}, ${now}, ${now})
        `;

        imported++;
        console.log(`Imported: ${placeData.name}`);
      } catch (error) {
        console.error(`Error importing place ${placeId}:`, error);
        errors++;
      }
    }

    return { imported, skipped, errors };
  }

  /**
   * 搜索地点 - 基础信息（省钱版，用于列表页）
   * 只获取：place_id, 名称, 经纬度, 城市, 国家, 封面图(1张), 评分, 评分人数
   * 成本：~$0.032 (Text Search Basic)
   */
  async searchPlaceBasic(query: string): Promise<PlaceBasicData | null> {
    try {
      console.log(`🔍 [Basic] Searching for: ${query}`);
      
      // 使用 findPlaceFromText 获取基础信息
      const response = await getClient().findPlaceFromText({
        params: {
          input: query,
          inputtype: PlaceInputType.textQuery,
          fields: ['place_id', 'name', 'formatted_address', 'geometry', 'rating', 'user_ratings_total', 'photos', 'types'],
          key: this.apiKey,
        }
      });

      if (response.data.status !== 'OK' || !response.data.candidates || response.data.candidates.length === 0) {
        console.log(`⚠️ No results found for: ${query}`);
        return null;
      }

      const place = response.data.candidates[0];
      if (!place.place_id) {
        return null;
      }

      console.log(`📍 [Basic] Found: ${place.name} (${place.place_id})`);
      
      // 提取城市和国家（从 formatted_address 简单解析）
      const addressParts = (place.formatted_address || '').split(', ');
      const country = addressParts.length > 0 ? addressParts[addressParts.length - 1] : 'Unknown';
      // 城市通常在倒数第二或第三个位置
      let city = 'Unknown';
      if (addressParts.length >= 2) {
        // 跳过邮编等，找到城市名
        for (let i = addressParts.length - 2; i >= 0; i--) {
          const part = addressParts[i];
          // 跳过纯数字（邮编）
          if (!/^\d+$/.test(part.trim())) {
            city = part.trim();
            break;
          }
        }
      }
      
      // 只获取第一张照片的 URL
      let coverImage: string | undefined;
      if (place.photos && place.photos.length > 0) {
        const photoRef = place.photos[0].photo_reference;
        if (photoRef) {
          coverImage = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photoRef}&key=${this.apiKey}`;
        }
      }

      // 提取分类
      const category = this.extractCategory(place.types || []);

      return {
        googlePlaceId: place.place_id,
        name: place.name || '',
        city: normalizeCity(city),
        country: country,
        latitude: place.geometry?.location?.lat || 0,
        longitude: place.geometry?.location?.lng || 0,
        rating: place.rating,
        ratingCount: place.user_ratings_total,
        coverImage,
        category,
      };
    } catch (error) {
      console.error(`❌ [Basic] Search error for "${query}":`, error);
      return null;
    }
  }

  /**
   * 搜索地点（通过文本查询）- 完整版
   * 注意：这个方法会调用 getPlaceDetails，成本较高
   */
  async searchPlace(query: string): Promise<PlaceData | null> {
    try {
      console.log(`🔍 Searching for: ${query}`);
      
      const response = await getClient().findPlaceFromText({
        params: {
          input: query,
          inputtype: PlaceInputType.textQuery,
          fields: ['place_id', 'name', 'formatted_address', 'geometry', 'rating', 'user_ratings_total', 'photos', 'types'],
          key: this.apiKey,
        }
      });

      if (response.data.status !== 'OK' || !response.data.candidates || response.data.candidates.length === 0) {
        console.log(`⚠️ No results found for: ${query}`);
        return null;
      }

      const placeId = response.data.candidates[0].place_id;
      if (!placeId) {
        return null;
      }

      console.log(`📍 Found place ID: ${placeId}`);
      
      // 获取完整详情
      return await this.getPlaceDetails(placeId);
    } catch (error) {
      console.error(`❌ Search error for "${query}":`, error);
      return null;
    }
  }
}

// 基础地点数据（列表页用）
interface PlaceBasicData {
  googlePlaceId: string;
  name: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  rating?: number;
  ratingCount?: number;
  coverImage?: string;
  category?: string;
}

export default new GoogleMapsService();
export type { PlaceData, PlaceBasicData };
