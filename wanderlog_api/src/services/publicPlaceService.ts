import prisma from '../config/database';
import googleMapsService from './googleMapsService';
import { normalizationService, NormalizationInput, StructuredTags } from './normalizationService';
import { mergePolicyService, SourceData } from './mergePolicyService';

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
   * 自动归一化：使用 normalizationService 确定 category_slug 和 tags
   * 自动合并：使用 mergePolicyService 合并多源数据
   * 
   * Updated for AI Tags Optimization:
   * - tags is now a structured jsonb object
   * - ai_tags is now an array of AITagElement objects
   * 
   * Requirements: 1.4, 8.4
   */
  async upsertPlace(data: PublicPlaceData): Promise<any> {
    try {
      // 检查是否已存在
      const existing = await prisma.place.findUnique({
        where: { googlePlaceId: data.placeId }
      });

      // 准备归一化输入
      const normInput: NormalizationInput = {
        name: data.name,
        description: data.aiDescription,
        googleTypes: data.sourceDetails?.types || [],
        googleKeywords: data.category ? [data.category] : [],
        existingCategory: data.category,
        existingTags: data.aiTags,
      };
      
      // 执行归一化 (now async to generate ai_tags)
      const normalized = await normalizationService.normalize(normInput);

      // 准备新数据
      const newPlaceData = {
        googlePlaceId: data.placeId,
        name: data.name,
        latitude: data.latitude,
        longitude: data.longitude,
        address: data.address,
        city: data.city,
        country: data.country,
        category: data.category,
        categorySlug: normalized.categorySlug,
        categoryEn: normalized.categoryEn,
        categoryZh: normalized.categoryZh,
        coverImage: data.coverImage,
        images: data.images || [],
        rating: data.rating,
        ratingCount: data.ratingCount,
        priceLevel: data.priceLevel,
        openingHours: data.openingHours,
        website: data.website,
        phoneNumber: data.phoneNumber,
        tags: normalized.tags,  // Now structured jsonb
        aiTags: normalized.aiTags,  // Now AITagElement[]
        aiSummary: data.aiSummary,
        aiDescription: data.aiDescription,
        description: data.aiDescription,
        source: data.source,
        sourceDetails: data.sourceDetails,
        customFields: normalized.customFields,
        lastSyncedAt: new Date(),
      };

      if (existing) {
        // 更新现有记录 - 使用合并策略
        console.log(`Updating existing place with merge policy: ${data.name} (${data.placeId})`);
        
        // 构建多源数据
        const sources: SourceData = {
          google: {
            openingHours: newPlaceData.openingHours,
            address: newPlaceData.address,
            rating: newPlaceData.rating,
            ratingCount: newPlaceData.ratingCount,
            photos: newPlaceData.images,
            coverImage: newPlaceData.coverImage,
            website: newPlaceData.website,
            phoneNumber: newPlaceData.phoneNumber,
            description: newPlaceData.description,
            tags: newPlaceData.tags,
            images: newPlaceData.images,
          },
        };
        
        // 如果现有数据有其他来源的信息，也加入合并
        if (existing.customFields && typeof existing.customFields === 'object') {
          const existingCustomFields = existing.customFields as Record<string, any>;
          if (existingCustomFields.raw) {
            for (const [source, sourceData] of Object.entries(existingCustomFields.raw)) {
              if (source !== 'google' && sourceData) {
                (sources as any)[source] = sourceData;
              }
            }
          }
        }
        
        // 执行合并
        const merged = mergePolicyService.mergeMultiSourceData(sources);
        
        // 合并 tags（结构化格式）
        const existingTags = (existing.tags && typeof existing.tags === 'object' && !Array.isArray(existing.tags)) 
          ? existing.tags as StructuredTags 
          : {};
        const mergedTags = this.mergeStructuredTags(existingTags, normalized.tags);
        
        // 合并 images
        const existingImages = Array.isArray(existing.images) ? existing.images : [];
        const mergedImages = [...new Set([...existingImages, ...merged.images])];
        
        // 合并 customFields
        const existingCustomFields = (existing.customFields && typeof existing.customFields === 'object') 
          ? existing.customFields as Record<string, any>
          : {};
        const mergedCustomFields = {
          ...existingCustomFields,
          ...normalized.customFields,
          raw: {
            ...(existingCustomFields.raw || {}),
            ...merged.customFields.raw,
          },
        };
        
        // 使用合并后的数据更新
        const updateData = {
          name: newPlaceData.name,
          latitude: newPlaceData.latitude,
          longitude: newPlaceData.longitude,
          address: merged.address || newPlaceData.address,
          city: newPlaceData.city,
          country: newPlaceData.country,
          category: newPlaceData.category,
          categorySlug: newPlaceData.categorySlug,
          categoryEn: newPlaceData.categoryEn,
          categoryZh: newPlaceData.categoryZh,
          coverImage: merged.coverImage || newPlaceData.coverImage,
          images: mergedImages,
          rating: merged.rating ?? newPlaceData.rating,
          ratingCount: merged.ratingCount ?? newPlaceData.ratingCount,
          priceLevel: newPlaceData.priceLevel,
          openingHours: merged.openingHours ? JSON.stringify(merged.openingHours) : (newPlaceData.openingHours ? JSON.stringify(newPlaceData.openingHours) : null),
          website: merged.website || newPlaceData.website,
          phoneNumber: merged.phoneNumber || newPlaceData.phoneNumber,
          tags: mergedTags as object,  // Cast to satisfy Prisma Json type
          aiTags: newPlaceData.aiTags as object[],  // Cast to satisfy Prisma Json type
          aiSummary: newPlaceData.aiSummary,
          aiDescription: merged.description || newPlaceData.aiDescription,
          description: merged.description || newPlaceData.description,
          source: newPlaceData.source,
          customFields: mergedCustomFields,
          lastSyncedAt: new Date(),
        };
        
        return await prisma.place.update({
          where: { googlePlaceId: data.placeId },
          data: updateData
        });
      } else {
        // 创建新记录
        console.log(`Creating new place: ${data.name} (${data.placeId})`);
        
        const createData = {
          googlePlaceId: newPlaceData.googlePlaceId,
          name: newPlaceData.name,
          latitude: newPlaceData.latitude,
          longitude: newPlaceData.longitude,
          address: newPlaceData.address,
          city: newPlaceData.city,
          country: newPlaceData.country,
          category: newPlaceData.category,
          categorySlug: newPlaceData.categorySlug,
          categoryEn: newPlaceData.categoryEn,
          categoryZh: newPlaceData.categoryZh,
          coverImage: newPlaceData.coverImage,
          images: newPlaceData.images,
          rating: newPlaceData.rating,
          ratingCount: newPlaceData.ratingCount,
          priceLevel: newPlaceData.priceLevel,
          openingHours: newPlaceData.openingHours ? JSON.stringify(newPlaceData.openingHours) : null,
          website: newPlaceData.website,
          phoneNumber: newPlaceData.phoneNumber,
          tags: newPlaceData.tags as object,  // Cast to satisfy Prisma Json type
          aiTags: newPlaceData.aiTags as object[],  // Cast to satisfy Prisma Json type
          aiSummary: newPlaceData.aiSummary,
          aiDescription: newPlaceData.aiDescription,
          description: newPlaceData.description,
          source: newPlaceData.source,
          customFields: newPlaceData.customFields,
          lastSyncedAt: newPlaceData.lastSyncedAt,
        };
        
        return await prisma.place.create({
          data: createData
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

      // 解析 tags 以获取 Google types
      const parsedTags = placeDetails.tags ? JSON.parse(placeDetails.tags) : [];
      
      // 合并 sourceDetails，确保包含 Google types
      const mergedSourceDetails = {
        ...sourceDetails,
        types: parsedTags, // Google types 用于归一化
        originalCategory: placeDetails.category,
      };

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
        // priceLevel removed from PlaceData interface
        openingHours: placeDetails.openingHours ? JSON.parse(placeDetails.openingHours) : undefined,
        website: placeDetails.website,
        phoneNumber: placeDetails.phoneNumber,
        aiDescription: placeDetails.description,
        source,
        sourceDetails: mergedSourceDetails,
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
    const limit = Math.min(options?.limit || 50, 100); // 限制最大100条
    const skip = (page - 1) * limit;

    const where: any = {};
    
    // 基础筛选
    if (options?.city) where.city = options.city;
    if (options?.country) where.country = options.country;
    if (options?.category) where.categoryEn = options.category; // 使用 categoryEn 筛选
    if (options?.source) where.source = options.source;

    // 名称搜索（模糊匹配）- 使用 mode: 'insensitive' 提高兼容性
    if (options?.search) {
      where.OR = [
        { name: { contains: options.search, mode: 'insensitive' } },
        { address: { contains: options.search, mode: 'insensitive' } }
      ];
    }

    // 标签筛选 - aiTags 是 JSON 数组，需要特殊处理
    // 由于 Prisma 对 JSON 数组的查询支持有限，我们在查询后在内存中过滤
    const tagFilter = options?.tag;

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

    // 并行执行查询和计数，只选择必要字段提高性能
    // 如果有标签筛选，需要获取所有数据然后在内存中过滤
    let queryLimit = limit;
    let querySkip = skip;
    
    if (tagFilter) {
      // 获取所有数据以便过滤
      queryLimit = 2000; // 获取足够多的数据
      querySkip = 0;
    }

    const [rawPlaces, rawTotal] = await Promise.all([
      prisma.place.findMany({
        where,
        skip: querySkip,
        take: queryLimit,
        orderBy: { createdAt: 'desc' }, // 按创建时间倒序，最新的在前面
        select: {
          id: true,
          name: true,
          city: true,
          country: true,
          latitude: true,
          longitude: true,
          address: true,
          description: true,
          openingHours: true,
          rating: true,
          ratingCount: true,
          category: true,
          categoryEn: true,
          categoryZh: true,
          aiSummary: true,
          aiDescription: true,
          tags: true,
          aiTags: true,
          coverImage: true,
          images: true,
          priceLevel: true,
          website: true,
          phoneNumber: true,
          googlePlaceId: true,
          source: true,
          createdAt: true,
        }
      }),
      prisma.place.count({ where })
    ]);

    // 如果有标签筛选，在内存中过滤
    let places = rawPlaces;
    let total = rawTotal;
    
    if (tagFilter) {
      const tagLower = tagFilter.toLowerCase();
      places = rawPlaces.filter(place => {
        // 检查 aiTags
        if (place.aiTags && Array.isArray(place.aiTags)) {
          for (const tag of place.aiTags as any[]) {
            const tagEn = typeof tag === 'object' && tag.en ? tag.en : (typeof tag === 'string' ? tag : '');
            if (tagEn.toLowerCase().includes(tagLower)) {
              return true;
            }
          }
        }
        return false;
      });
      
      total = places.length;
      // 应用分页
      places = places.slice(skip, skip + limit);
    }

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
    console.log('[updatePlace] placeId:', placeId);
    console.log('[updatePlace] updates:', JSON.stringify(updates, null, 2));
    
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
    if (updates.aiSummary !== undefined) updateData.aiSummary = updates.aiSummary || null;
    if (updates.aiDescription !== undefined) updateData.aiDescription = updates.aiDescription || null;
    if (updates.description !== undefined) updateData.description = updates.description || null;
    if (updates.customFields !== undefined) {
      updateData.customFields = updates.customFields ? (typeof updates.customFields === 'string' ? JSON.parse(updates.customFields) : updates.customFields) : null;
    }
    
    // 如果更新了 category 或 aiTags，需要重新归一化
    const needsNormalization = updates.category !== undefined || updates.aiTags !== undefined;
    console.log('[updatePlace] needsNormalization:', needsNormalization);
    
    if (needsNormalization) {
      // 获取现有地点数据用于归一化
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(placeId);
      let existingPlace = null;
      
      if (isUUID) {
        existingPlace = await prisma.place.findUnique({ where: { id: placeId } });
      }
      if (!existingPlace) {
        existingPlace = await prisma.place.findUnique({ where: { googlePlaceId: placeId } });
      }
      
      // 准备归一化输入
      const normInput: NormalizationInput = {
        name: updates.name || existingPlace?.name || '',
        description: updates.description || existingPlace?.description || existingPlace?.aiDescription || '',
        googleKeywords: updates.category ? [updates.category] : (existingPlace?.category ? [existingPlace.category] : []),
        existingCategory: updates.category || existingPlace?.category || undefined,
        existingTags: updates.aiTags 
          ? (typeof updates.aiTags === 'string' ? JSON.parse(updates.aiTags) : updates.aiTags) 
          : (existingPlace?.aiTags as string[] || []),
      };
      
      // 执行归一化
      const normalized = await normalizationService.normalize(normInput);
      console.log('[updatePlace] normalized:', JSON.stringify(normalized, null, 2));
      
      // 更新归一化字段
      updateData.category = updates.category || existingPlace?.category || null;
      updateData.categorySlug = normalized.categorySlug;
      updateData.categoryEn = normalized.categoryEn;
      updateData.categoryZh = normalized.categoryZh;
      updateData.tags = normalized.tags;
      updateData.aiTags = normalized.aiTags;
      
      // 合并 customFields
      if (normalized.customFields) {
        const existingCustomFields = updateData.customFields || existingPlace?.customFields || {};
        updateData.customFields = { ...existingCustomFields, ...normalized.customFields };
      }
    }
    
    // 检查 placeId 是否是 UUID 格式（用于数据库 ID）还是 Google Place ID
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(placeId);
    console.log('[updatePlace] isUUID:', isUUID);
    console.log('[updatePlace] updateData:', JSON.stringify(updateData, null, 2));
    
    if (isUUID) {
      // 按数据库 ID 更新
      const existingById = await prisma.place.findUnique({ where: { id: placeId } });
      if (existingById) {
        return await prisma.place.update({
          where: { id: placeId },
          data: updateData,
        });
      }
    }
    
    // 按 googlePlaceId 更新
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
    // 检查 placeId 是否是 UUID 格式
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(placeId);
    
    if (isUUID) {
      const existingById = await prisma.place.findUnique({ where: { id: placeId } });
      if (existingById) {
        return await prisma.place.delete({
          where: { id: placeId }
        });
      }
    }
    
    return await prisma.place.delete({
      where: { googlePlaceId: placeId }
    });
  }
  
  /**
   * 手动创建新地点
   * 自动归一化：使用 normalizationService 确定 category_slug 和 tags
   * 
   * Updated for AI Tags Optimization:
   * - tags is now a structured jsonb object
   * - ai_tags is now an array of AITagElement objects
   * 
   * Requirements: 1.4, 8.4
   */
  async createPlace(data: any) {
    // 准备归一化输入
    const normInput: NormalizationInput = {
      name: data.name,
      description: data.description || data.aiDescription,
      googleKeywords: data.category ? [data.category] : [],
      existingCategory: data.category,
      existingTags: data.aiTags ? (typeof data.aiTags === 'string' ? JSON.parse(data.aiTags) : data.aiTags) : [],
    };
    
    // 执行归一化 (now async to generate ai_tags)
    const normalized = await normalizationService.normalize(normInput);
    
    // 准备数据
    const createData: any = {
      name: data.name,
      latitude: parseFloat(data.latitude),
      longitude: parseFloat(data.longitude),
      city: data.city || null,
      country: data.country || null,
      address: data.address || null,
      category: data.category || null,
      categorySlug: normalized.categorySlug,
      categoryEn: normalized.categoryEn,
      categoryZh: normalized.categoryZh,
      coverImage: data.coverImage || null,
      images: data.images ? (typeof data.images === 'string' ? JSON.parse(data.images) : data.images) : [],
      rating: data.rating !== undefined && data.rating !== null && data.rating !== '' ? parseFloat(data.rating) : null,
      ratingCount: data.ratingCount !== undefined && data.ratingCount !== null && data.ratingCount !== '' ? parseInt(data.ratingCount) : null,
      priceLevel: data.priceLevel !== undefined && data.priceLevel !== null && data.priceLevel !== '' ? parseInt(data.priceLevel) : null,
      openingHours: data.openingHours || null,
      website: data.website || null,
      phoneNumber: data.phoneNumber || null,
      tags: normalized.tags,  // Now structured jsonb
      aiTags: normalized.aiTags,  // Now AITagElement[] from normalization
      aiSummary: data.aiSummary || null,
      aiDescription: data.aiDescription || null,
      description: data.description || null,
      customFields: normalized.customFields,
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
          images: placeDetails.images ? JSON.stringify(JSON.parse(placeDetails.images)) : undefined,
          rating: placeDetails.rating,
          ratingCount: placeDetails.ratingCount,
          // priceLevel removed from PlaceData interface
          openingHours: placeDetails.openingHours || undefined,
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

  /**
   * 获取筛选选项（国家、城市、分类、标签及其数量）
   * 用于后台管理的筛选器
   */
  async getFilterOptions() {
    // 获取所有地点的 aiTags
    const placesWithTags = await prisma.place.findMany({
      select: {
        country: true,
        city: true,
        categoryEn: true,
        aiTags: true,
      },
      where: {
        OR: [
          { country: { not: null } },
          { city: { not: null } },
          { categoryEn: { not: null } },
        ]
      }
    });

    // 统计国家
    const countryMap: Record<string, number> = {};
    // 统计城市（按国家分组）
    const citiesByCountry: Record<string, Record<string, number>> = {};
    // 统计分类
    const categoryMap: Record<string, number> = {};
    // 统计标签（按国家分组）
    const tagsByCountry: Record<string, Record<string, number>> = {};
    // 全局标签统计
    const globalTagMap: Record<string, number> = {};

    for (const place of placesWithTags) {
      const country = place.country;
      const city = place.city;
      const categoryEn = place.categoryEn;
      
      // 统计国家
      if (country) {
        countryMap[country] = (countryMap[country] || 0) + 1;
      }
      
      // 统计城市
      if (country && city) {
        if (!citiesByCountry[country]) {
          citiesByCountry[country] = {};
        }
        citiesByCountry[country][city] = (citiesByCountry[country][city] || 0) + 1;
      }
      
      // 统计分类
      if (categoryEn) {
        categoryMap[categoryEn] = (categoryMap[categoryEn] || 0) + 1;
      }
      
      // 统计标签
      if (place.aiTags && Array.isArray(place.aiTags)) {
        for (const tag of place.aiTags as any[]) {
          const tagEn = typeof tag === 'object' && tag.en ? tag.en : (typeof tag === 'string' ? tag : null);
          if (tagEn) {
            // 全局标签
            globalTagMap[tagEn] = (globalTagMap[tagEn] || 0) + 1;
            
            // 按国家分组的标签
            if (country) {
              if (!tagsByCountry[country]) {
                tagsByCountry[country] = {};
              }
              tagsByCountry[country][tagEn] = (tagsByCountry[country][tagEn] || 0) + 1;
            }
          }
        }
      }
    }

    // 格式化国家数据
    const countries = Object.entries(countryMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // 格式化城市数据
    const formattedCitiesByCountry: Record<string, { name: string; count: number }[]> = {};
    for (const [country, cities] of Object.entries(citiesByCountry)) {
      formattedCitiesByCountry[country] = Object.entries(cities)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    // 格式化分类数据
    const categories = Object.entries(categoryMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // 格式化标签数据（全局）
    const tags = Object.entries(globalTagMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count); // 按数量降序

    // 格式化标签数据（按国家分组）
    const formattedTagsByCountry: Record<string, { name: string; count: number }[]> = {};
    for (const [country, tagMap] of Object.entries(tagsByCountry)) {
      formattedTagsByCountry[country] = Object.entries(tagMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
    }

    return {
      countries,
      citiesByCountry: formattedCitiesByCountry,
      categories,
      tags,
      tagsByCountry: formattedTagsByCountry
    };
  }

  /**
   * 获取国家和城市列表（按国家分组，按字母排序）
   * 返回数据库中实际存在的国家和城市（保留原始大小写）
   */
  async getCountriesAndCities() {
    const places = await prisma.place.findMany({
      select: { country: true, city: true },
      distinct: ['country', 'city'],
    });

    // 已知的有效国家列表（不区分大小写匹配）
    const validCountriesLower = new Set([
      'japan', 'thailand', 'denmark', 'france', 'austria', 
      'germany', 'indonesia', 'italy', 'spain', 'united kingdom',
      'south korea', 'taiwan', 'china', 'vietnam', 'singapore',
      'malaysia', 'philippines', 'australia', 'new zealand'
    ]);

    // 按国家分组，保留原始大小写
    const countryCityMap: Record<string, Set<string>> = {};
    // 用于存储国家的规范化名称到原始名称的映射
    const countryNameMap: Record<string, string> = {};
    
    for (const place of places) {
      if (!place.country || !place.city) continue;
      const country = place.country.trim();
      const city = place.city.trim();
      if (!country || !city) continue;
      
      const countryLower = country.toLowerCase();
      
      // 只接受有效的国家，跳过城市被误标为国家的情况
      if (!validCountriesLower.has(countryLower)) continue;
      
      // 跳过国家和城市相同的情况（不区分大小写）
      if (countryLower === city.toLowerCase()) continue;
      
      // 使用小写作为 key，但保留第一次遇到的原始大小写
      if (!countryNameMap[countryLower]) {
        countryNameMap[countryLower] = country;
        countryCityMap[countryLower] = new Set();
      }
      countryCityMap[countryLower].add(city);
    }

    // 转换为排序后的结果，使用原始大小写
    const result: Record<string, string[]> = {};
    const sortedCountryKeys = Object.keys(countryCityMap).sort();
    
    for (const countryKey of sortedCountryKeys) {
      const originalCountryName = countryNameMap[countryKey];
      result[originalCountryName] = Array.from(countryCityMap[countryKey]).sort();
    }

    return result;
  }

  /**
   * 按城市和标签筛选地点（不区分大小写）
   */
  async searchByFilters(options: {
    city: string;
    country: string;
    tags?: string[];
    limit?: number;
  }) {
    const { city, country, tags, limit = 50 } = options;

    // 城市和国家使用不区分大小写的匹配
    const where: any = {
      city: { equals: city, mode: 'insensitive' },
      country: { equals: country, mode: 'insensitive' },
    };

    // 如果有标签，先不在数据库层面过滤，而是取出所有该城市的地点
    // 然后在内存中进行标签匹配（因为 aiTags 是 JSON 数组，Prisma 不支持直接查询）

    const places = await prisma.place.findMany({
      where,
      take: limit * 4, // 取更多以便内存过滤后仍有足够数据
      orderBy: [
        { rating: 'desc' },
        { ratingCount: 'desc' },
      ],
      select: {
        id: true,
        name: true,
        city: true,
        country: true,
        latitude: true,
        longitude: true,
        address: true,
        rating: true,
        ratingCount: true,
        category: true,
        aiSummary: true,
        aiTags: true,
        tags: true,
        coverImage: true,
        images: true,
      },
    });

    // 如果有标签，在内存中过滤 category、aiTags 和 tags 字段（不区分大小写）
    let filteredPlaces = places;
    if (tags && tags.length > 0) {
      const tagsLower = tags.map(t => t.toLowerCase());
      
      filteredPlaces = places.filter(place => {
        // 检查 category（不区分大小写）
        if (place.category) {
          const categoryLower = place.category.toLowerCase();
          if (tagsLower.some(tag => categoryLower.includes(tag))) {
            return true;
          }
        }
        
        // 检查 aiTags (now array of AITagElement objects)
        if (place.aiTags) {
          const aiTagsArray = Array.isArray(place.aiTags) ? place.aiTags : [];
          if (aiTagsArray.some((aiTag: any) => {
            // aiTag is now an object with en/zh fields
            if (typeof aiTag === 'object' && aiTag !== null) {
              const enLower = (aiTag.en || '').toLowerCase();
              const zhLower = (aiTag.zh || '').toLowerCase();
              return tagsLower.some(tag => enLower.includes(tag) || zhLower.includes(tag));
            }
            // Fallback for old string format
            if (typeof aiTag === 'string') {
              return tagsLower.some(tag => aiTag.toLowerCase().includes(tag));
            }
            return false;
          })) {
            return true;
          }
        }
        
        // 检查 tags (now structured jsonb object)
        if (place.tags && typeof place.tags === 'object' && !Array.isArray(place.tags)) {
          const structuredTags = place.tags as Record<string, unknown>;
          // Check all values in the structured tags object
          for (const values of Object.values(structuredTags)) {
            if (Array.isArray(values)) {
              if (values.some((v: unknown) => {
                if (typeof v === 'string') {
                  return tagsLower.some(tag => v.toLowerCase().includes(tag));
                }
                return false;
              })) {
                return true;
              }
            }
          }
        }
        
        return false;
      });
    }

    return {
      places: filteredPlaces.slice(0, limit),
      total: filteredPlaces.length,
      isAiGenerated: false,
    };
  }
  
  /**
   * 合并两个结构化 tags 对象
   * 将两个 StructuredTags 对象合并，去重
   */
  private mergeStructuredTags(existing: StructuredTags, newTags: StructuredTags): StructuredTags {
    const result: StructuredTags = { ...existing };
    
    for (const [key, values] of Object.entries(newTags)) {
      if (!values || !Array.isArray(values)) continue;
      
      if (!result[key]) {
        result[key] = [];
      }
      
      for (const value of values) {
        if (!result[key]!.includes(value)) {
          result[key]!.push(value);
        }
      }
    }
    
    return result;
  }
}

export default new PublicPlaceService();
