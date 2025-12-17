import { PrismaClient } from '@prisma/client';
import googleMapsService from './googleMapsService';

const prisma = new PrismaClient();

export interface PublicPlaceData {
  placeId: string;
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  city?: string;
  country?: string;
  category?: string;
  coverImage?: string;
  images?: string[];
  rating?: number;
  ratingCount?: number;
  priceLevel?: number;
  openingHours?: any;
  website?: string;
  phoneNumber?: string;
  aiTags?: string[];
  aiSummary?: string;
  aiDescription?: string;
  source: 'google_maps_link' | 'ai_image' | 'ai_chat' | 'manual';
  sourceDetails?: any;
}

class PublicPlaceService {
  /**
   * 根据 place_id 创建或更新公共地点
   * 自动去重：如果 place_id 已存在，则更新；否则创建新记录
   */
  async upsertPlace(data: PublicPlaceData): Promise<any> {
    try {
      // 检查是否已存在
      const existing = await prisma.publicPlace.findUnique({
        where: { placeId: data.placeId }
      });

      const placeData = {
        placeId: data.placeId,
        name: data.name,
        latitude: data.latitude,
        longitude: data.longitude,
        address: data.address,
        city: data.city,
        country: data.country,
        category: data.category,
        coverImage: data.coverImage,
        images: data.images ? JSON.stringify(data.images) : null,
        rating: data.rating,
        ratingCount: data.ratingCount,
        priceLevel: data.priceLevel,
        openingHours: data.openingHours ? JSON.stringify(data.openingHours) : null,
        website: data.website,
        phoneNumber: data.phoneNumber,
        aiTags: data.aiTags ? JSON.stringify(data.aiTags) : null,
        aiSummary: data.aiSummary,
        aiDescription: data.aiDescription,
        source: data.source,
        sourceDetails: data.sourceDetails ? JSON.stringify(data.sourceDetails) : null,
        lastSyncedAt: new Date(),
      };

      if (existing) {
        // 更新现有记录
        console.log(`Updating existing place: ${data.name} (${data.placeId})`);
        return await prisma.publicPlace.update({
          where: { placeId: data.placeId },
          data: placeData
        });
      } else {
        // 创建新记录
        console.log(`Creating new place: ${data.name} (${data.placeId})`);
        return await prisma.publicPlace.create({
          data: placeData
        });
      }
    } catch (error) {
      console.error('Error upserting place:', error);
      throw error;
    }
  }

  /**
   * 通过 Google Place ID 直接添加地点
   */
  async addByPlaceId(
    placeId: string, 
    source: PublicPlaceData['source'] = 'manual',
    sourceDetails?: any
  ): Promise<any> {
    try {
      // 先获取 Google Maps 数据
      const placeDetails = await googleMapsService.getPlaceDetails(placeId);
      
      if (!placeDetails) {
        throw new Error('Failed to fetch place details from Google Maps');
      }

      // 转换为公共地点数据格式
      const publicPlaceData: PublicPlaceData = {
        placeId: placeDetails.googlePlaceId,
        name: placeDetails.name,
        latitude: placeDetails.latitude,
        longitude: placeDetails.longitude,
        address: placeDetails.address,
        city: placeDetails.city,
        country: placeDetails.country,
        category: placeDetails.category,
        coverImage: placeDetails.coverImage,
        // images 和 openingHours 已经是 JSON 字符串，需要先解析再传递
        images: placeDetails.images ? JSON.parse(placeDetails.images) : undefined,
        rating: placeDetails.rating,
        ratingCount: placeDetails.ratingCount,
        priceLevel: placeDetails.priceLevel,
        openingHours: placeDetails.openingHours ? JSON.parse(placeDetails.openingHours) : undefined,
        website: placeDetails.website,
        phoneNumber: placeDetails.phoneNumber,
        source,
        sourceDetails,
      };

      return await this.upsertPlace(publicPlaceData);
    } catch (error: any) {
      console.error('Error adding place by place_id:', error);
      // 打印更详细的错误信息
      if (error.response) {
        console.error('API Response Error:', error.response.data);
      }
      throw error;
    }
  }

  /**
   * 批量添加地点（通过 place_id 数组）
   */
  async batchAddByPlaceIds(
    placeIds: string[], 
    source: PublicPlaceData['source'] = 'google_maps_link',
    sourceDetails?: any
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const placeId of placeIds) {
      try {
        await this.addByPlaceId(placeId, source, sourceDetails);
        success++;
      } catch (error: any) {
        failed++;
        errors.push(`${placeId}: ${error.message}`);
      }
    }

    return { success, failed, errors };
  }

  /**
   * 获取所有公共地点（支持分页和筛选）
   */
  async getAllPlaces(options?: {
    page?: number;
    limit?: number;
    city?: string;
    country?: string;
    category?: string;
    source?: string;
    search?: string;
    minRating?: number;
    maxRating?: number;
  }) {
    const page = options?.page || 1;
    const limit = options?.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = {};
    
    // 基础筛选
    if (options?.city) where.city = options.city;
    if (options?.country) where.country = options.country;
    if (options?.category) where.category = options.category;
    if (options?.source) where.source = options.source;

    // 名称搜索（模糊匹配）
    if (options?.search) {
      where.OR = [
        { name: { contains: options.search } },
        { address: { contains: options.search } }
      ];
    }

    // 评分区间筛选
    if (options?.minRating !== undefined || options?.maxRating !== undefined) {
      where.rating = {};
      if (options?.minRating !== undefined) {
        where.rating.gte = options.minRating;
      }
      if (options?.maxRating !== undefined) {
        where.rating.lte = options.maxRating;
      }
    }

    const [places, total] = await Promise.all([
      prisma.publicPlace.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.publicPlace.count({ where })
    ]);

    return {
      places,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * 根据 place_id 获取地点详情
   */
  async getPlaceByPlaceId(placeId: string) {
    return await prisma.publicPlace.findUnique({
      where: { placeId }
    });
  }

  /**
   * 根据数据库 ID 获取地点详情
   */
  async getPlaceById(id: string) {
    return await prisma.publicPlace.findUnique({
      where: { id }
    });
  }

  /**
   * 更新地点信息（支持手动编辑）
   */
  async updatePlace(placeId: string, updates: Partial<PublicPlaceData>) {
    const updateData: any = {};
    
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.latitude !== undefined) updateData.latitude = updates.latitude;
    if (updates.longitude !== undefined) updateData.longitude = updates.longitude;
    if (updates.address !== undefined) updateData.address = updates.address;
    if (updates.city !== undefined) updateData.city = updates.city;
    if (updates.country !== undefined) updateData.country = updates.country;
    if (updates.category !== undefined) updateData.category = updates.category;
    if (updates.coverImage !== undefined) updateData.coverImage = updates.coverImage;
    if (updates.images !== undefined) updateData.images = JSON.stringify(updates.images);
    if (updates.rating !== undefined) updateData.rating = updates.rating;
    if (updates.ratingCount !== undefined) updateData.ratingCount = updates.ratingCount;
    if (updates.priceLevel !== undefined) updateData.priceLevel = updates.priceLevel;
    if (updates.openingHours !== undefined) updateData.openingHours = JSON.stringify(updates.openingHours);
    if (updates.website !== undefined) updateData.website = updates.website;
    if (updates.phoneNumber !== undefined) updateData.phoneNumber = updates.phoneNumber;
    if (updates.aiTags !== undefined) updateData.aiTags = JSON.stringify(updates.aiTags);
    if (updates.aiSummary !== undefined) updateData.aiSummary = updates.aiSummary;
    if (updates.aiDescription !== undefined) updateData.aiDescription = updates.aiDescription;

    return await prisma.publicPlace.update({
      where: { placeId },
      data: updateData
    });
  }

  /**
   * 删除地点
   */
  async deletePlace(placeId: string) {
    return await prisma.publicPlace.delete({
      where: { placeId }
    });
  }

  /**
   * 同步更新地点的 Google Maps 数据
   */
  async syncPlaceFromGoogle(placeId: string) {
    try {
      const placeDetails = await googleMapsService.getPlaceDetails(placeId);
      
      if (!placeDetails) {
        throw new Error('Failed to fetch place details from Google Maps');
      }

      // 只更新 Google Maps 的数据，保留 AI 数据
      return await prisma.publicPlace.update({
        where: { placeId },
        data: {
          name: placeDetails.name,
          latitude: placeDetails.latitude,
          longitude: placeDetails.longitude,
          address: placeDetails.address,
          city: placeDetails.city,
          country: placeDetails.country,
          category: placeDetails.category,
          coverImage: placeDetails.coverImage,
          images: placeDetails.images ? JSON.stringify(JSON.parse(placeDetails.images)) : null,
          rating: placeDetails.rating,
          ratingCount: placeDetails.ratingCount,
          priceLevel: placeDetails.priceLevel,
          openingHours: placeDetails.openingHours,
          website: placeDetails.website,
          phoneNumber: placeDetails.phoneNumber,
          lastSyncedAt: new Date(),
        }
      });
    } catch (error) {
      console.error('Error syncing place from Google:', error);
      throw error;
    }
  }

  /**
   * 搜索地点
   */
  async searchPlaces(query: string) {
    return await prisma.publicPlace.findMany({
      where: {
        OR: [
          { name: { contains: query } },
          { city: { contains: query } },
          { country: { contains: query } },
          { address: { contains: query } },
          { category: { contains: query } },
        ]
      },
      take: 20,
      orderBy: { rating: 'desc' }
    });
  }

  /**
   * 获取城市列表（去重，用于添加 trip）
   */
  async getCities(query?: string) {
    /**
     * 需要兼容无空格输入（如 "ChiangMai"）匹配含空格城市（如 "Chiang Mai"）。
     * 先取较大的 distinct 列表，再在内存里做“去空格/连字符”匹配。
     */
    // 注意：当前城市数据存储在 Place 表，而非 publicPlace
    const places = await prisma.place.findMany({
      select: { city: true },
      distinct: ['city'],
      orderBy: { city: 'asc' },
      take: 200,
    });

    const normalize = (value: string) =>
      value
        .toLowerCase()
        .replace(/[\s-]+/g, ''); // 去掉空格/连字符，便于宽松匹配

    const cities = places
      .map(p => p.city)
      .filter((city): city is string => city !== null && city.trim() !== '');

    if (!query || !query.trim()) {
      return cities;
    }

    const normalizedQuery = normalize(query.trim());

    return cities.filter(city => normalize(city).includes(normalizedQuery));
  }

  /**
   * 获取统计信息
   */
  async getStats() {
    const [total, bySource, byCategory, byCountry] = await Promise.all([
      prisma.publicPlace.count(),
      prisma.publicPlace.groupBy({
        by: ['source'],
        _count: true
      }),
      prisma.publicPlace.groupBy({
        by: ['category'],
        _count: true,
        orderBy: { _count: { category: 'desc' } },
        take: 10
      }),
      prisma.publicPlace.groupBy({
        by: ['country'],
        _count: true,
        orderBy: { _count: { country: 'desc' } },
        take: 10
      })
    ]);

    return {
      total,
      bySource,
      topCategories: byCategory,
      topCountries: byCountry
    };
  }
}

export default new PublicPlaceService();
