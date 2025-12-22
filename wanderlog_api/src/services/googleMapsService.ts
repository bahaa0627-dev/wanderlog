import { Client, AddressType, GeocodingAddressComponentType } from '@googlemaps/google-maps-services-js';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { createId } from '@paralleldrive/cuid2';
import prisma from '../config/database';

// 配置代理
const proxyUrl = process.env.https_proxy || process.env.http_proxy;
const clientConfig: any = { timeout: 30000 };

if (proxyUrl) {
  console.log(`🌐 Using proxy: ${proxyUrl}`);
  clientConfig.axiosInstance = require('axios').create({
    httpsAgent: new HttpsProxyAgent(proxyUrl),
    proxy: false // 禁用 axios 自己的 proxy 配置
  });
}

const client = new Client(clientConfig);

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
  priceLevel?: number;
  website?: string;
  phoneNumber?: string;
  aiSummary?: string;
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
   * 从Google Place ID获取详细信息
   */
  async getPlaceDetails(placeId: string): Promise<PlaceData | null> {
    try {
      console.log(`🔍 Fetching details for place ID: ${placeId}`);
      console.log(`🔑 Using API key: ${this.apiKey.substring(0, 20)}...`);
      
      const response = await client.placeDetails({
        params: {
          place_id: placeId,
          key: this.apiKey,
          fields: [
            'place_id',
            'name',
            'formatted_address',
            'address_components',
            'geometry',
            'rating',
            'user_ratings_total',
            'price_level',
            'types',
            'opening_hours',
            'utc_offset_minutes',
            'website',
            'formatted_phone_number',
            'photos',
            'editorial_summary',
            'reviews'
          ]
        }
      });

      console.log(`✅ API Response Status: ${response.data.status}`);

      if (response.data.status !== 'OK' || !response.data.result) {
        console.error('❌ Place details error:', response.data.status);
        if (response.data.error_message) {
          console.error('Error message:', response.data.error_message);
        }
        return null;
      }

      const place = response.data.result;
      
      // 提取城市和国家
      const addressComponents = place.address_components || [];
      let city = '';
      let country = '';
      
      for (const component of addressComponents) {
        // 尝试多个可能的城市类型
        if (component.types.includes('locality' as AddressType)) {
          city = component.long_name;
        } else if (!city && component.types.includes('administrative_area_level_2' as GeocodingAddressComponentType)) {
          city = component.long_name;
        } else if (!city && component.types.includes('administrative_area_level_1' as GeocodingAddressComponentType)) {
          city = component.long_name;
        }
        
        if (component.types.includes('country' as AddressType)) {
          country = component.long_name;
        }
      }

      // 提取分类（使用第一个有意义的type）
      const category = this.extractCategory(place.types || []);

      // 提取标签
      const tags = this.extractTags(place);

      // 获取封面图和其他图片
      const { coverImage, images } = await this.extractImages(place.photos || []);

      // 生成AI总结（基于评论）
      const aiSummary = this.generateAISummary(place.reviews || []);

      const utcOffsetMinutes = (place as any).utc_offset_minutes ?? (place as any).utc_offset;
      const openingHoursPayload = place.opening_hours
        ? {
            ...place.opening_hours,
            ...(utcOffsetMinutes != null
                ? { utc_offset_minutes: utcOffsetMinutes }
                : {}),
          }
        : undefined;

      return {
        googlePlaceId: place.place_id || placeId,
        name: place.name || '',
        city: city || 'Unknown',
        country: country || 'Unknown',
        latitude: place.geometry?.location?.lat || 0,
        longitude: place.geometry?.location?.lng || 0,
        address: place.formatted_address,
        description: place.editorial_summary?.overview,
        openingHours: openingHoursPayload
          ? JSON.stringify(openingHoursPayload)
          : undefined,
        rating: place.rating,
        ratingCount: place.user_ratings_total,
        category,
        tags: tags ? JSON.stringify(tags) : undefined,
        coverImage,
        images: images ? JSON.stringify(images) : undefined,
        priceLevel: place.price_level,
        website: place.website,
        phoneNumber: place.formatted_phone_number,
        aiSummary,
      };
    } catch (error: any) {
      console.error('❌ Error fetching place details:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      if (error.code) {
        console.error('Error code:', error.code);
      }
      return null;
    }
  }

  /**
   * 搜索附近的地点
   */
  async searchNearby(
    latitude: number,
    longitude: number,
    radius: number = 5000,
    type?: string
  ) {
    try {
      const response = await client.placesNearby({
        params: {
          location: { lat: latitude, lng: longitude },
          radius,
          type,
          key: this.apiKey
        }
      });

      if (response.data.status !== 'OK') {
        console.error('Nearby search error:', response.data.status);
        return [];
      }

      return response.data.results || [];
    } catch (error) {
      console.error('Error searching nearby places:', error);
      return [];
    }
  }

  /**
   * 文本搜索地点
   */
  async textSearch(query: string, location?: { lat: number; lng: number }) {
    try {
      const response = await client.textSearch({
        params: {
          query,
          location,
          key: this.apiKey
        }
      });

      if (response.data.status !== 'OK') {
        console.error('Text search error:', response.data.status);
        return [];
      }

      return response.data.results || [];
    } catch (error) {
      console.error('Error in text search:', error);
      return [];
    }
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
   * 生成AI总结（基于评论）
   */
  private generateAISummary(reviews: any[]): string | undefined {
    if (!reviews || reviews.length === 0) {
      return undefined;
    }

    // 获取最高评分的评论（最多10条）
    const topReviews = reviews
      .filter(r => r.rating >= 4)
      .slice(0, 10);

    if (topReviews.length === 0) {
      return undefined;
    }

    // 简单的关键词提取（实际应用中可以使用AI API）
    const keywords: { [key: string]: number } = {};
    const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'is', 'was', 'are', 'were']);

    topReviews.forEach((review) => {
      const words = (review.text || '').toLowerCase().split(/\s+/);
      words.forEach((rawWord: string) => {
        const word = rawWord.replace(/[^\w]/g, '');
        if (word.length > 3 && !commonWords.has(word)) {
          keywords[word] = (keywords[word] || 0) + 1;
        }
      });
    });

    // 获取最常见的3个关键词
    const topKeywords = Object.entries(keywords)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([word]) => word);

    if (topKeywords.length > 0) {
      return `Visitors love the ${topKeywords.join(', ')}`;
    }

    return undefined;
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
          INSERT INTO Place (id, googlePlaceId, name, city, country, latitude, longitude, address, category, rating, ratingCount, coverImage, images, priceLevel, website, phoneNumber, openingHours, source, createdAt, updatedAt, lastSyncedAt)
          VALUES (${id}, ${placeData.googlePlaceId || null}, ${placeData.name}, ${placeData.city || null}, ${placeData.country || null}, ${placeData.latitude}, ${placeData.longitude}, ${placeData.address || null}, ${placeData.category || null}, ${placeData.rating || null}, ${placeData.ratingCount || null}, ${placeData.coverImage || null}, ${placeData.images || null}, ${placeData.priceLevel || null}, ${placeData.website || null}, ${placeData.phoneNumber || null}, ${placeData.openingHours || null}, ${'google_maps'}, ${now}, ${now}, ${now})
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
}

export default new GoogleMapsService();
