import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import googleMapsService from './googleMapsService';

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
   * 根据 googlePlaceId 创建或更新地点
   * 自动去重：如果 googlePlaceId 已存在，则更新；否则创建新记录
   */
  async upsertPlace(data: PublicPlaceData): Promise<any> {
    try {
      // 检查是否已存在
      const existing = await prisma.place.findUnique({
        where: { googlePlaceId: data.placeId }
      });

      const placeData = {
        googlePlaceId: data.placeId,
        placeId: data.placeId, // 兼容旧字段
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
        return await prisma.place.update({
          where: { googlePlaceId: data.placeId },
          data: placeData
        });
      } else {
        // 创建新记录
        console.log(`Creating new place: ${data.name} (${data.placeId})`);
        return await prisma.place.create({
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
   * 使用 Place 模型（统一地点表）
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
    tag?: string;
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

    // 标签筛选（模糊匹配 aiTags 或 tags 字段）
    if (options?.tag) {
      where.OR = where.OR || [];
      where.OR.push(
        { aiTags: { contains: options.tag } },
        { tags: { contains: options.tag } }
      );
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
      prisma.place.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.place.count({ where })
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
   * 根据 googlePlaceId 获取地点详情
   */
  async getPlaceByPlaceId(placeId: string) {
    // 首先尝试按数据库 ID 查找
    let place = await prisma.place.findUnique({
      where: { id: placeId }
    });
    
    // 如果没找到，再尝试按 googlePlaceId 查找
    if (!place) {
      place = await prisma.place.findUnique({
        where: { googlePlaceId: placeId }
      });
    }
    
    return place;
  }

  /**
   * 根据数据库 ID 获取地点详情
   */
  async getPlaceById(id: string) {
    return await prisma.place.findUnique({
      where: { id }
    });
  }

  /**
   * 更新地点信息（支持手动编辑）
   * 支持通过数据库 ID 或 googlePlaceId 更新
   */
  async updatePlace(placeId: string, updates: any) {
    // 构建 Prisma 更新数据对象
    const updateData: any = {
      updatedAt: new Date(),
    };
    
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.latitude !== undefined) updateData.latitude = parseFloat(updates.latitude);
    if (updates.longitude !== undefined) updateData.longitude = parseFloat(updates.longitude);
    if (updates.address !== undefined) updateData.address = updates.address || null;
    if (updates.city !== undefined) updateData.city = updates.city || null;
    if (updates.country !== undefined) updateData.country = updates.country || null;
    if (updates.category !== undefined) updateData.category = updates.category || null;
    if (updates.coverImage !== undefined) updateData.coverImage = updates.coverImage || null;
    if (updates.images !== undefined) {
      updateData.images = updates.images ? (typeof updates.images === 'string' ? JSON.parse(updates.images) : updates.images) : [];
    }
    if (updates.rating !== undefined) {
      updateData.rating = updates.rating !== null && updates.rating !== '' ? parseFloat(updates.rating) : null;
    }
    if (updates.ratingCount !== undefined) {
      updateData.ratingCount = updates.ratingCount !== null && updates.ratingCount !== '' ? parseInt(updates.ratingCount) : null;
    }
    if (updates.priceLevel !== undefined) {
      updateData.priceLevel = updates.priceLevel !== null && updates.priceLevel !== '' ? parseInt(updates.priceLevel) : null;
    }
    if (updates.openingHours !== undefined) updateData.openingHours = updates.openingHours || null;
    if (updates.website !== undefined) updateData.website = updates.website || null;
    if (updates.phoneNumber !== undefined) updateData.phoneNumber = updates.phoneNumber || null;
    if (updates.aiTags !== undefined) {
      updateData.aiTags = updates.aiTags ? (typeof updates.aiTags === 'string' ? JSON.parse(updates.aiTags) : updates.aiTags) : [];
    }
    if (updates.aiSummary !== undefined) updateData.aiSummary = updates.aiSummary || null;
    if (updates.aiDescription !== undefined) updateData.aiDescription = updates.aiDescription || null;
    if (updates.description !== undefined) updateData.description = updates.description || null;
    if (updates.customFields !== undefined) {
      updateData.customFields = updates.customFields ? (typeof updates.customFields === 'string' ? JSON.parse(updates.customFields) : updates.customFields) : null;
    }
    
    // 先尝试按数据库 ID 更新
    const existingById = await prisma.place.findUnique({ where: { id: placeId } });
    if (existingById) {
      return await prisma.place.update({
        where: { id: placeId },
        data: updateData,
      });
    }
    
    // 如果按 ID 没找到，尝试按 googlePlaceId 更新
    return await prisma.place.update({
      where: { googlePlaceId: placeId },
      data: updateData,
    });
  }

  /**
   * 删除地点
   * 支持通过数据库 ID 或 googlePlaceId 删除
   */
  async deletePlace(placeId: string) {
    // 先尝试通过数据库 ID 查找，再尝试 googlePlaceId
    const existingById = await prisma.place.findUnique({ where: { id: placeId } });
    if (existingById) {
      return await prisma.place.delete({
        where: { id: placeId }
      });
    }
    
    return await prisma.place.delete({
      where: { googlePlaceId: placeId }
    });
  }
  
  /**
   * 手动创建新地点
   */
  async createPlace(data: any) {
    // 准备数据
    const createData: any = {
      name: data.name,
      latitude: parseFloat(data.latitude),
      longitude: parseFloat(data.longitude),
      city: data.city || null,
      country: data.country || null,
      address: data.address || null,
      category: data.category || null,
      coverImage: data.coverImage || null,
      images: data.images ? (typeof data.images === 'string' ? JSON.parse(data.images) : data.images) : [],
      rating: data.rating !== undefined && data.rating !== null && data.rating !== '' ? parseFloat(data.rating) : null,
      ratingCount: data.ratingCount !== undefined && data.ratingCount !== null && data.ratingCount !== '' ? parseInt(data.ratingCount) : null,
      priceLevel: data.priceLevel !== undefined && data.priceLevel !== null && data.priceLevel !== '' ? parseInt(data.priceLevel) : null,
      openingHours: data.openingHours || null,
      website: data.website || null,
      phoneNumber: data.phoneNumber || null,
      aiTags: data.aiTags ? (typeof data.aiTags === 'string' ? JSON.parse(data.aiTags) : data.aiTags) : [],
      aiSummary: data.aiSummary || null,
      aiDescription: data.aiDescription || null,
      description: data.description || null,
      customFields: data.customFields ? (typeof data.customFields === 'string' ? JSON.parse(data.customFields) : data.customFields) : null,
      source: data.source || 'manual',
    };

    // 使用 Prisma ORM 创建
    return await prisma.place.create({
      data: createData,
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
      return await prisma.place.update({
        where: { googlePlaceId: placeId },
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
    return await prisma.place.findMany({
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
      prisma.place.count(),
      prisma.place.groupBy({
        by: ['source'],
        _count: true
      }),
      prisma.place.groupBy({
        by: ['category'],
        _count: true,
        orderBy: { _count: { category: 'desc' } },
        take: 10
      }),
      prisma.place.groupBy({
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
