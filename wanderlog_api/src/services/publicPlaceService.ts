import prisma from '../config/database';
import googleMapsService from './googleMapsService';
import { normalizationService, NormalizationInput, StructuredTags } from './normalizationService';
import { mergePolicyService, SourceData } from './mergePolicyService';
import { getTagTypeStats } from '../utils/tagTypeClassifier';
import { normalizeCountryName } from '../utils/countryNormalizer';

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
  collectionCoverImage?: string;  // 合集封面图（仅合集渠道展示）
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
    tagType?: string;
    hasCoverImage?: boolean;
    sortBy?: 'rating' | 'ratingCount' | 'createdAt' | 'updatedAt';
    sortOrder?: 'asc' | 'desc';
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

    // 是否有封面图筛选
    if (options?.hasCoverImage === true) {
      where.coverImage = { not: null };
      where.NOT = { coverImage: '' };
    } else if (options?.hasCoverImage === false) {
      where.OR = [
        { coverImage: null },
        { coverImage: '' },
      ];
    }

    // 名称搜索（模糊匹配）- 使用 mode: 'insensitive' 提高兼容性
    if (options?.search) {
      // 如果已经有 OR 条件（来自 hasCoverImage），需要用 AND 组合
      const searchCondition = {
        OR: [
          { name: { contains: options.search, mode: 'insensitive' } },
          { address: { contains: options.search, mode: 'insensitive' } }
        ]
      };
      if (where.OR) {
        // hasCoverImage=false 已经设置了 OR，需要用 AND 组合
        where.AND = [{ OR: where.OR }, searchCondition];
        delete where.OR;
      } else {
        where.OR = searchCondition.OR;
      }
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

    // 标签筛选 - 使用原生 SQL 在数据库层面过滤，避免加载大量数据
    const tagTypeFilter = options?.tagType;
    
    // 标签类型对应的 tags 对象键名映射
    const tagTypeKeyMap: Record<string, string[]> = {
      'type': ['type'],
      'style': ['style'],
      'architect': ['architect'],
      'award': ['award'],
      'theme': ['theme'],
      'meal': ['meal', 'cuisine'],
      'cuisine': ['cuisine'],
      'shop': ['shop'],
      'other': ['other'],
    };
    
    // 如果有标签筛选，使用原生 SQL 查询
    if (tagFilter || tagTypeFilter) {
      return await this.getAllPlacesWithTagFilter({
        ...options,
        tagFilter,
        tagTypeFilter,
        tagTypeKeyMap,
        where,
        page,
        limit,
        skip,
        sortBy: options?.sortBy,
        sortOrder: options?.sortOrder,
      });
    }

    // 构建排序条件，null 值放在最后
    let orderBy: any;
    if (options?.sortBy) {
      const sortDirection = options.sortOrder || 'desc';
      // 对于 rating 和 ratingCount，null 值应该放在最后
      if (options.sortBy === 'rating' || options.sortBy === 'ratingCount') {
        orderBy = {
          [options.sortBy]: { sort: sortDirection, nulls: 'last' }
        };
      } else {
        orderBy = { [options.sortBy]: sortDirection };
      }
    } else {
      orderBy = { createdAt: 'desc' }; // 默认按创建时间倒序
    }

    // 无标签筛选时，使用 Prisma 查询
    const queryStartTime = Date.now();
    console.log(`[getAllPlaces] Starting database query:`, {
      where,
      skip,
      take: limit,
      orderBy,
    });

    let places, total;
    try {
      [places, total] = await Promise.all([
        prisma.place.findMany({
          where,
          skip,
          take: limit,
          orderBy,
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
            price: true,
            priceLevel: true,
            website: true,
            phoneNumber: true,
            googlePlaceId: true,
            source: true,
            createdAt: true,
            customFields: true,
          }
        }),
        prisma.place.count({ where })
      ]);

      const queryDuration = Date.now() - queryStartTime;
      console.log(`✅ [getAllPlaces] Database query completed in ${queryDuration}ms:`, {
        placesCount: places.length,
        total,
      });
    } catch (dbError: any) {
      const queryDuration = Date.now() - queryStartTime;
      console.error(`❌ [getAllPlaces] Database query failed after ${queryDuration}ms:`, {
        error: dbError.message,
        code: dbError.code,
        name: dbError.name,
        meta: dbError.meta,
      });
      throw new Error(`Database query failed: ${dbError.message}`);
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
   * 使用原生 SQL 进行高效的标签筛选
   * 避免加载大量数据到内存中
   */
  private async getAllPlacesWithTagFilter(options: {
    tagFilter?: string;
    tagTypeFilter?: string;
    tagTypeKeyMap: Record<string, string[]>;
    where: any;
    page: number;
    limit: number;
    skip: number;
    sortBy?: string;
    sortOrder?: string;
    city?: string;
    country?: string;
    category?: string;
    source?: string;
    minRating?: number;
    maxRating?: number;
    hasCoverImage?: boolean;
  }) {
    const { tagFilter, tagTypeFilter, tagTypeKeyMap, page, limit, skip, sortBy, sortOrder } = options;
    
    // 构建 WHERE 条件
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;
    
    // 基础筛选条件
    if (options.city) {
      conditions.push(`city = $${paramIndex}`);
      params.push(options.city);
      paramIndex++;
    }
    if (options.country) {
      conditions.push(`country = $${paramIndex}`);
      params.push(options.country);
      paramIndex++;
    }
    if (options.category) {
      conditions.push(`category_en = $${paramIndex}`);
      params.push(options.category);
      paramIndex++;
    }
    if (options.source) {
      conditions.push(`source = $${paramIndex}`);
      params.push(options.source);
      paramIndex++;
    }
    if (options.minRating !== undefined) {
      conditions.push(`rating >= $${paramIndex}`);
      params.push(options.minRating);
      paramIndex++;
    }
    if (options.maxRating !== undefined) {
      conditions.push(`rating <= $${paramIndex}`);
      params.push(options.maxRating);
      paramIndex++;
    }
    if (options.hasCoverImage === true) {
      conditions.push(`cover_image IS NOT NULL AND cover_image != ''`);
    } else if (options.hasCoverImage === false) {
      conditions.push(`(cover_image IS NULL OR cover_image = '')`);
    }
    
    // 标签类型筛选 - 检查 tags JSON 对象中对应键是否有值
    if (tagTypeFilter) {
      const tagKeys = tagTypeKeyMap[tagTypeFilter] || [tagTypeFilter];
      const keyConditions = tagKeys.map(key => {
        // 检查 JSON 对象中的键是否存在且有值
        return `(tags->>'${key}' IS NOT NULL AND tags->>'${key}' != '' AND tags->>'${key}' != '[]')`;
      });
      conditions.push(`(${keyConditions.join(' OR ')})`);
    }
    
    // 标签值筛选 - 使用 ILIKE 搜索
    if (tagFilter) {
      const tagPattern = `%${tagFilter}%`;
      conditions.push(`(tags::text ILIKE $${paramIndex} OR ai_tags::text ILIKE $${paramIndex + 1})`);
      params.push(tagPattern, tagPattern);
      paramIndex += 2;
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // 构建排序条件
    let orderByClause = 'ORDER BY created_at DESC';
    if (sortBy) {
      const direction = sortOrder || 'desc';
      const sortColumn = sortBy === 'ratingCount' ? 'rating_count' : 
                         sortBy === 'createdAt' ? 'created_at' : 
                         sortBy === 'updatedAt' ? 'updated_at' : sortBy;
      orderByClause = `ORDER BY ${sortColumn} ${direction.toUpperCase()} NULLS LAST`;
    }
    
    // 执行查询
    const countQuery = `SELECT COUNT(*) as count FROM places ${whereClause}`;
    const dataQuery = `
      SELECT id, name, city, country, latitude, longitude, address, description,
             opening_hours as "openingHours", rating, rating_count as "ratingCount",
             category, category_en as "categoryEn", category_zh as "categoryZh",
             ai_summary as "aiSummary", ai_description as "aiDescription",
             tags, ai_tags as "aiTags", cover_image as "coverImage", images,
             price, price_level as "priceLevel", website, phone_number as "phoneNumber",
             google_place_id as "googlePlaceId", source, created_at as "createdAt",
             custom_fields as "customFields"
      FROM places
      ${whereClause}
      ${orderByClause}
      LIMIT ${limit} OFFSET ${skip}
    `;
    
    try {
      const startTime = Date.now();
      const [countResult, places] = await Promise.all([
        prisma.$queryRawUnsafe<[{ count: bigint }]>(countQuery, ...params),
        prisma.$queryRawUnsafe<any[]>(dataQuery, ...params),
      ]);
      
      const total = Number(countResult[0]?.count || 0);
      console.log(`📊 [getAllPlacesWithTagFilter] Query completed in ${Date.now() - startTime}ms, found ${total} places`);
      
      return {
        places,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('❌ [getAllPlacesWithTagFilter] SQL error:', error);
      throw error;
    }
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
    if (updates.collectionCoverImage !== undefined) updateData.collectionCoverImage = updates.collectionCoverImage || null;
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
    
    // 直接更新 tags 字段（结构化标签）
    if (updates.tags !== undefined) {
      updateData.tags = updates.tags ? (typeof updates.tags === 'string' ? JSON.parse(updates.tags) : updates.tags) : null;
    }
    
    // 直接更新 aiTags 字段（AI 展示标签）
    if (updates.aiTags !== undefined) {
      updateData.aiTags = updates.aiTags ? (typeof updates.aiTags === 'string' ? JSON.parse(updates.aiTags) : updates.aiTags) : null;
    }
    
    // 如果更新了 category，需要重新归一化分类字段
    const needsNormalization = updates.category !== undefined;
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
        existingTags: existingPlace?.aiTags as string[] || [],
      };
      
      // 执行归一化
      const normalized = await normalizationService.normalize(normInput);
      
      // 只更新分类相关字段，不覆盖手动设置的 tags 和 aiTags
      updateData.category = updates.category || existingPlace?.category || null;
      updateData.categorySlug = normalized.categorySlug;
      updateData.categoryEn = normalized.categoryEn;
      updateData.categoryZh = normalized.categoryZh;
      
      // 合并 customFields - 保留用户传入的 stills 等数据
      if (normalized.customFields) {
        // 获取现有的 customFields
        const existingCustomFields = (existingPlace?.customFields && typeof existingPlace.customFields === 'object') 
          ? existingPlace.customFields as Record<string, any>
          : {};
        // 获取用户传入的 customFields（可能包含 stills）
        const userCustomFields = (updateData.customFields && typeof updateData.customFields === 'object')
          ? updateData.customFields as Record<string, any>
          : {};
        // 合并顺序：existing -> normalized -> user（用户数据优先级最高）
        updateData.customFields = { 
          ...existingCustomFields, 
          ...normalized.customFields,
          ...userCustomFields,
          // 确保 stills 不被覆盖
          stills: userCustomFields.stills || existingCustomFields.stills,
        };
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
    
    // 处理 tags：如果请求中提供了 tags，优先使用；否则使用归一化的 tags
    let finalTags = normalized.tags;
    if (data.tags !== undefined && data.tags !== null) {
      // 如果提供了 tags，解析并使用
      if (typeof data.tags === 'string') {
        try {
          finalTags = JSON.parse(data.tags);
        } catch {
          // 如果解析失败，使用归一化的 tags
          finalTags = normalized.tags;
        }
      } else if (typeof data.tags === 'object') {
        // 如果已经是对象，直接使用
        finalTags = data.tags;
      }
    }
    
    // 处理 aiTags：如果请求中提供了 aiTags，优先使用；否则使用归一化的 aiTags
    let finalAiTags = normalized.aiTags;
    if (data.aiTags !== undefined && data.aiTags !== null) {
      // 如果提供了 aiTags，解析并使用
      if (typeof data.aiTags === 'string') {
        try {
          finalAiTags = JSON.parse(data.aiTags);
        } catch {
          // 如果解析失败，使用归一化的 aiTags
          finalAiTags = normalized.aiTags;
        }
      } else if (Array.isArray(data.aiTags)) {
        // 如果已经是数组，直接使用
        finalAiTags = data.aiTags;
      }
    }
    
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
      tags: finalTags,  // 使用处理后的 tags（优先使用手动提供的）
      aiTags: finalAiTags,  // 使用处理后的 aiTags（优先使用手动提供的）
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
   * 搜索地点 - 支持多种搜索场景（优化版：使用 PostgreSQL 原生 JSON 查询）
   * 
   * 搜索场景：
   * 1. 具体地点名：query 完全匹配则直接出现对应结果（如 "Eiffel Tower"）
   * 2. 模糊搜索地点名：部分匹配（如 "tower"）
   * 3. 搜索类型：匹配 category、tags、ai_tags（如 "church", "cafe", "architecture"）
   * 4. 具体标签：如建筑师名字（如 "zaha"）匹配 tags 中的 architect 等字段
   * 5. 搜索城市：匹配城市名
   * 
   * 默认返回评价人数多且评分高的前 20 个地点
   * 
   * 排序优先级：
   * 1. 完全匹配名称的地点
   * 2. 名称包含完整搜索词的地点
   * 3. 名称包含部分搜索词的地点
   * 4. 标签/分类匹配的地点
   */
  async searchPlaces(query: string, city?: string, country?: string, limit: number = 20) {
    const normalizedQuery = query.toLowerCase().trim();
    
    // 扩展搜索词：添加同义词
    const expandedQueries = this.expandTagsWithSynonyms([normalizedQuery]);
    console.log(`🔍 [searchPlaces] Query: "${query}" -> expanded: ${expandedQueries.join(', ')}`);

    const runSearch = async (requireImages: boolean) => {
      // === 基础图片过滤条件（放宽限制，只要有非空图片即可） ===
      const imageConditions: any[] = requireImages ? [
        { coverImage: { not: null } },
        { NOT: { coverImage: '' } },
      ] : [];
      
      // 城市/国家筛选条件
      const locationConditions: any[] = [];
      if (city) {
        locationConditions.push({ city: { equals: city, mode: 'insensitive' } });
      }
      if (country) {
        locationConditions.push({ country: { equals: country, mode: 'insensitive' } });
      }
      
      // === 场景 1：精确匹配地点名（最高优先级，放宽图片限制） ===
      const exactMatch = await prisma.place.findFirst({
        where: {
          AND: [
            { name: { equals: query, mode: 'insensitive' } },
            ...imageConditions,
            ...locationConditions,
          ]
        },
      });
      
      if (exactMatch) {
        console.log(`🔍 [searchPlaces] Exact match found: ${exactMatch.name}`);
        // 继续搜索更多相关结果，但把精确匹配放在最前面
      }
      
      // === 场景 2：名称包含完整搜索词的地点 ===
      const fullNameMatches = await prisma.place.findMany({
        where: {
          AND: [
            ...imageConditions,
            ...locationConditions,
            { name: { contains: query, mode: 'insensitive' } },
          ]
        },
        take: limit * 2,
        orderBy: [
          { ratingCount: 'desc' },
          { rating: 'desc' }
        ]
      });
      
      console.log(`🔍 [searchPlaces] Full name matches: ${fullNameMatches.length}`);
      
      // === 场景 3：模糊搜索（名称、分类、标签） ===
      // 搜索条件：名称、分类 模糊匹配（使用扩展词）
      const searchConditions: any[] = [];
      for (const q of expandedQueries) {
        searchConditions.push(
          { name: { contains: q, mode: 'insensitive' } },
          { category: { contains: q, mode: 'insensitive' } },
          { categoryEn: { contains: q, mode: 'insensitive' } },
          { categorySlug: { contains: q, mode: 'insensitive' } },
        );
      }
      
      // 通过名称和分类搜索
      const nameAndCategoryMatches = await prisma.place.findMany({
        where: {
          AND: [
            ...imageConditions,
            ...locationConditions,
            { OR: searchConditions },
          ]
        },
        take: limit * 3,
        orderBy: [
          { ratingCount: 'desc' },
          { rating: 'desc' }
        ]
      });
      
      console.log(`🔍 [searchPlaces] Name/category matches: ${nameAndCategoryMatches.length}`);
      
      // === 场景 4：使用 PostgreSQL 原生 JSON 查询搜索 tags 字段（优化性能）===
      let tagMatches: any[] = [];
      
      // 排除已匹配的地点 ID
      const matchedIds = new Set([
        ...(exactMatch ? [exactMatch.id] : []),
        ...fullNameMatches.map(p => p.id),
        ...nameAndCategoryMatches.map(p => p.id),
      ]);
      
      // 如果已经有足够结果，跳过 tags 搜索
      if (matchedIds.size >= limit) {
        console.log(`🔍 [searchPlaces] Skipping tags search, already have ${matchedIds.size} results`);
      } else {
        // 构建 PostgreSQL 原生查询来搜索 tags JSONB 字段
        // 使用扩展后的所有同义词进行搜索
        const params: any[] = [];
        let paramIndex = 1;
        
        // 为每个扩展词构建 OR 条件
        const tagConditions: string[] = [];
        for (const q of expandedQueries) {
          const pattern = `%${q}%`;
          tagConditions.push(`tags::text ILIKE $${paramIndex}`);
          params.push(pattern);
          paramIndex++;
          tagConditions.push(`ai_tags::text ILIKE $${paramIndex}`);
          params.push(pattern);
          paramIndex++;
        }
        const tagsSql = tagConditions.join(' OR ');
        
        // 构建位置条件
        let locationSql = '';
        if (city) {
          locationSql += ` AND LOWER(city) = LOWER($${paramIndex})`;
          params.push(city);
          paramIndex++;
        }
        if (country) {
          locationSql += ` AND LOWER(country) = LOWER($${paramIndex})`;
          params.push(country);
          paramIndex++;
        }
        
        // 构建图片条件
        const imageSql = requireImages ? ` AND cover_image IS NOT NULL AND cover_image != ''` : '';
        
        // 优化策略：直接使用单个查询，限制返回数量
        const rawQuery = `
          SELECT id, name, city, country, latitude, longitude, address,
                 rating, rating_count as "ratingCount", category, category_slug as "categorySlug",
                 category_en as "categoryEn", category_zh as "categoryZh",
                 ai_summary as "aiSummary", ai_tags as "aiTags", tags,
                 cover_image as "coverImage", images, custom_fields as "customFields"
          FROM places
          WHERE (${tagsSql})
          ${imageSql}
          ${locationSql}
          ORDER BY rating_count DESC NULLS LAST, rating DESC NULLS LAST
          LIMIT ${limit * 3}
        `;
        
        try {
          const startTime = Date.now();
          tagMatches = await prisma.$queryRawUnsafe(rawQuery, ...params) as any[];
          // 过滤掉已匹配的
          tagMatches = tagMatches.filter(p => !matchedIds.has(p.id));
          console.log(`🔍 [searchPlaces] Tag matches (raw SQL): ${tagMatches.length} in ${Date.now() - startTime}ms`);
        } catch (sqlError) {
          console.error(`❌ [searchPlaces] Raw SQL error:`, sqlError);
          tagMatches = [];
        }
      }
      
      // === 合并结果并按评分/人数排序 ===
      const allMatches: any[] = [];
      const seenIds = new Set<string>();
      let exactMatchPlace: any | null = null;
      
      // 计算相关性分数
      const calculateRelevanceScore = (place: any): number => {
        const nameLower = (place.name || '').toLowerCase();
        let score = 0;
        
        // 完全匹配名称：最高分
        if (nameLower === normalizedQuery) {
          score += 10000;
        }
        // 名称以搜索词开头
        else if (nameLower.startsWith(normalizedQuery)) {
          score += 5000;
        }
        // 名称包含完整搜索词
        else if (nameLower.includes(normalizedQuery)) {
          score += 1000;
        }
        // 名称只包含部分搜索词（如 "tower"）
        else {
          const queryWords = normalizedQuery.split(/\s+/);
          const matchedWords = queryWords.filter(w => nameLower.includes(w));
          score += matchedWords.length * 50;  // 降低部分匹配的分数
        }
        
        // 评分人数作为重要排序因素（评价越多，分数越高）
        // 使用对数函数使大数值不会过度影响
        const ratingCount = place.ratingCount || 0;
        if (ratingCount > 0) {
          score += Math.log10(ratingCount + 1) * 100;  // 1000评价 = 300分, 10000评价 = 400分
        }
        
        // 评分也作为排序因素
        const rating = place.rating || 0;
        if (rating > 0) {
          score += rating * 20;  // 5分 = 100分
        }
        
        return score;
      };
      
      // 先记录精确匹配（最终置顶）
      if (exactMatch && !seenIds.has(exactMatch.id)) {
        exactMatchPlace = { ...exactMatch, _relevanceScore: 100000 };
        seenIds.add(exactMatch.id);
      }
      
      // 添加完整名称匹配
      for (const place of fullNameMatches) {
        if (!seenIds.has(place.id)) {
          allMatches.push({ ...place, _relevanceScore: calculateRelevanceScore(place) });
          seenIds.add(place.id);
        }
      }
      
      // 添加名称/分类匹配
      for (const place of nameAndCategoryMatches) {
        if (!seenIds.has(place.id)) {
          allMatches.push({ ...place, _relevanceScore: calculateRelevanceScore(place) });
          seenIds.add(place.id);
        }
      }
      
      // 添加标签匹配
      for (const place of tagMatches) {
        if (!seenIds.has(place.id)) {
          allMatches.push({ ...place, _relevanceScore: calculateRelevanceScore(place) });
          seenIds.add(place.id);
        }
      }
      
      // 按评分人数优先排序，其次评分，再其次相关性
      allMatches.sort((a, b) => {
        const countA = a.ratingCount || 0;
        const countB = b.ratingCount || 0;
        if (countB !== countA) return countB - countA;
        const ratingA = a.rating || 0;
        const ratingB = b.rating || 0;
        if (ratingB !== ratingA) return ratingB - ratingA;
        const scoreA = a._relevanceScore || 0;
        const scoreB = b._relevanceScore || 0;
        return scoreB - scoreA;
      });
      
      // 精确匹配置顶，其余按排序结果
      const combinedMatches = exactMatchPlace
        ? [exactMatchPlace, ...allMatches]
        : allMatches;

      // 移除临时字段并返回结果
      const result = combinedMatches.slice(0, limit).map(p => {
        const { _relevanceScore, ...place } = p;
        return place;
      });
      
      console.log(`🔍 [searchPlaces] Found ${result.length} places (limit: ${limit})`);
      if (result.length > 0) {
        console.log(`🔍 [searchPlaces] Top results: ${result.slice(0, 3).map(p => p.name).join(', ')}`);
      }
      return result;
    };

    const withImages = await runSearch(true);
    if (withImages.length > 0) {
      return withImages;
    }

    console.log('🔍 [searchPlaces] No results with image filter, retrying without image filter');
    return await runSearch(false);
  }

  /**
   * 获取城市列表（去重，用于添加 trip）
   * 只返回有 10 个以上地点且有封面图的城市
   */
  async getCities(query?: string) {
    /**
     * 需要兼容无空格输入（如 "ChiangMai"）匹配含空格城市（如 "Chiang Mai"）。
     * 先统计每个城市的地点数量，过滤出有 10 个以上地点且有封面图的城市。
     */
    
    // 统计每个城市的地点数量
    const cityStats = await prisma.place.groupBy({
      by: ['city'],
      _count: { id: true },
      where: {
        city: { not: null },
      },
      having: {
        id: { _count: { gte: 10 } }
      },
      orderBy: { city: 'asc' },
    });

    // 获取有封面图的城市列表
    const citiesWithCover = await prisma.place.findMany({
      select: { city: true },
      distinct: ['city'],
      where: {
        city: { not: null },
        coverImage: { not: null },
      },
    });
    const citiesWithCoverSet = new Set(citiesWithCover.map(p => p.city));

    const normalize = (value: string) =>
      value
        .toLowerCase()
        .replace(/[\s-]+/g, ''); // 去掉空格/连字符，便于宽松匹配

    // 过滤：地点数 >= 10 且有封面图
    const cities = cityStats
      .map(stat => stat.city)
      .filter((city): city is string => 
        city !== null && 
        city.trim() !== '' && 
        citiesWithCoverSet.has(city)
      );

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
   * 获取筛选选项（国家、城市、分类、标签、来源及其数量）
   * 用于后台管理的筛选器
   */
  async getFilterOptions() {
    // 获取所有地点的 tags, aiTags 和 source
    const placesWithTags = await prisma.place.findMany({
      select: {
        country: true,
        city: true,
        categoryEn: true,
        tags: true,
        aiTags: true,
        source: true,
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
    // 统计分类（按国家分组）
    const categoriesByCountry: Record<string, Record<string, number>> = {};
    // 统计标签（按国家分组）
    const tagsByCountry: Record<string, Record<string, number>> = {};
    // 统计标签（按分类分组）
    const tagsByCategory: Record<string, Record<string, number>> = {};
    // 全局标签统计
    const globalTagMap: Record<string, number> = {};
    // 统计来源
    const sourceMap: Record<string, number> = {};
    // 按标签类型统计地点数量（每个地点只计一次）
    const tagTypePlaceCount: Record<string, Set<number>> = {
      type: new Set(),
      style: new Set(),
      architect: new Set(),
      award: new Set(),
      theme: new Set(),
      meal: new Set(),
      cuisine: new Set(),
      shop: new Set(),
      domain: new Set(),
      other: new Set(),
    };

    let placeIndex = 0;
    for (const place of placesWithTags) {
      // 将国家名称转换为英文
      const country = normalizeCountryName(place.country);
      const city = place.city;
      const categoryEn = place.categoryEn;
      const source = place.source;
      
      // 用于标记该地点有哪些标签类型
      const placeTagTypes = new Set<string>();
      
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
        
        // 按国家分组的分类
        if (country) {
          if (!categoriesByCountry[country]) {
            categoriesByCountry[country] = {};
          }
          categoriesByCountry[country][categoryEn] = (categoriesByCountry[country][categoryEn] || 0) + 1;
        }
      }
      
      // 统计来源
      if (source) {
        sourceMap[source] = (sourceMap[source] || 0) + 1;
      }
      
      // 统计标签
      // 检查 aiTags
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
            
            // 按分类分组的标签
            if (categoryEn) {
              if (!tagsByCategory[categoryEn]) {
                tagsByCategory[categoryEn] = {};
              }
              tagsByCategory[categoryEn][tagEn] = (tagsByCategory[categoryEn][tagEn] || 0) + 1;
            }
          }
        }
      }
      
      // 检查 tags 字段（JSON 对象格式）- 同时统计标签类型的地点数量
      if (place.tags && typeof place.tags === 'object') {
        const tagsObj = place.tags as any;
        // 遍历所有键（type, style, architect, theme 等）
        for (const key of Object.keys(tagsObj)) {
          const value = tagsObj[key];
          const hasValue = Array.isArray(value) ? value.length > 0 : (typeof value === 'string' && value.trim() !== '');
          
          // 记录该地点有这个标签类型
          if (hasValue) {
            placeTagTypes.add(key);
          }
          
          if (Array.isArray(value)) {
            // 如果值是数组，统计每个元素
            for (const item of value) {
              if (typeof item === 'string') {
                // 全局标签
                globalTagMap[item] = (globalTagMap[item] || 0) + 1;
                
                // 按国家分组的标签
                if (country) {
                  if (!tagsByCountry[country]) {
                    tagsByCountry[country] = {};
                  }
                  tagsByCountry[country][item] = (tagsByCountry[country][item] || 0) + 1;
                }
                
                // 按分类分组的标签
                if (categoryEn) {
                  if (!tagsByCategory[categoryEn]) {
                    tagsByCategory[categoryEn] = {};
                  }
                  tagsByCategory[categoryEn][item] = (tagsByCategory[categoryEn][item] || 0) + 1;
                }
              }
            }
          } else if (typeof value === 'string') {
            // 如果值是字符串，直接统计
            globalTagMap[value] = (globalTagMap[value] || 0) + 1;
            
            // 按国家分组的标签
            if (country) {
              if (!tagsByCountry[country]) {
                tagsByCountry[country] = {};
              }
              tagsByCountry[country][value] = (tagsByCountry[country][value] || 0) + 1;
            }
            
            // 按分类分组的标签
            if (categoryEn) {
              if (!tagsByCategory[categoryEn]) {
                tagsByCategory[categoryEn] = {};
              }
              tagsByCategory[categoryEn][value] = (tagsByCategory[categoryEn][value] || 0) + 1;
            }
          }
        }
      }
      
      // 记录每个标签类型有多少个地点
      for (const tagType of placeTagTypes) {
        if (tagTypePlaceCount[tagType]) {
          tagTypePlaceCount[tagType].add(placeIndex);
        }
      }
      placeIndex++;
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

    // 格式化来源数据
    const sources = Object.entries(sourceMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count); // 按数量降序

    // 格式化标签数据（全局）
    const tags = Object.entries(globalTagMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name)); // 按字母排序

    // 按类型分组标签
    const tagsByType = getTagTypeStats(tags);

    // 格式化标签数据（按国家分组）
    const formattedTagsByCountry: Record<string, { name: string; count: number }[]> = {};
    for (const [country, tagMap] of Object.entries(tagsByCountry)) {
      formattedTagsByCountry[country] = Object.entries(tagMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => a.name.localeCompare(b.name)); // 按字母排序
    }

    // 格式化分类数据（按国家分组）
    const formattedCategoriesByCountry: Record<string, { name: string; count: number }[]> = {};
    for (const [country, catMap] of Object.entries(categoriesByCountry)) {
      formattedCategoriesByCountry[country] = Object.entries(catMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    // 格式化标签数据（按分类分组）
    const formattedTagsByCategory: Record<string, { name: string; count: number }[]> = {};
    for (const [category, tagMap] of Object.entries(tagsByCategory)) {
      formattedTagsByCategory[category] = Object.entries(tagMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => a.name.localeCompare(b.name)); // 按字母排序
    }
    
    // 格式化标签类型地点数量
    const tagTypePlaceCounts: Record<string, number> = {};
    for (const [tagType, placeSet] of Object.entries(tagTypePlaceCount)) {
      tagTypePlaceCounts[tagType] = placeSet.size;
    }

    return {
      countries,
      citiesByCountry: formattedCitiesByCountry,
      categories,
      categoriesByCountry: formattedCategoriesByCountry,
      sources,
      tags,
      tagsByType, // 按类型分组的标签（标签使用次数）
      tagTypePlaceCounts, // 新增：按标签类型统计的地点数量
      tagsByCountry: formattedTagsByCountry,
      tagsByCategory: formattedTagsByCategory
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

  // 国家城市统计数据缓存（有效期 1 小时）
  private _countriesCitiesStatsCache: {
    data: Record<string, { placeCount: number; cities: { name: string; placeCount: number }[] }> | null;
    timestamp: number;
    ttl: number;
  } = {
    data: null,
    timestamp: 0,
    ttl: 60 * 60 * 1000, // 1 小时
  };

  /**
   * 获取国家和城市列表（带地点数量统计，用于地图首页下拉）
   * 使用内存缓存，有效期 1 小时
   * 
   * 筛选规则：
   * 1. 国家内地点数量 > 100 才显示该国家
   * 2. 城市内地点数量 > 10 才显示该城市
   * 3. 如果符合条件的城市不足 5 个，补齐按数量排列的 top 其他城市
   */
  async getCountriesAndCitiesWithStats(options?: {
    minCountryPlaces?: number;  // 国家最小地点数，默认 100
    minCityPlaces?: number;     // 城市最小地点数，默认 5
    minCitiesPerCountry?: number; // 每个国家最少显示城市数，默认 3 (reserved for future use)
  }) {
    // 检查缓存是否有效（使用默认参数时）
    const useDefaultParams = !options?.minCountryPlaces && !options?.minCityPlaces && !options?.minCitiesPerCountry;
    if (useDefaultParams && this._countriesCitiesStatsCache.data) {
      const now = Date.now();
      if (now - this._countriesCitiesStatsCache.timestamp < this._countriesCitiesStatsCache.ttl) {
        console.log('✅ [PublicPlaceService] 使用缓存的国家城市统计数据');
        return this._countriesCitiesStatsCache.data;
      }
    }

    console.log('📍 [PublicPlaceService] 重新计算国家城市统计数据...');
    const startTime = Date.now();

    const minCountryPlaces = options?.minCountryPlaces ?? 100;
    const minCityPlaces = options?.minCityPlaces ?? 5;  // 改为 5，少于 5 个地点的城市不显示
    void options?.minCitiesPerCountry; // Reserved for future use

    // 获取每个国家-城市组合的地点数量
    const placeCounts = await prisma.place.groupBy({
      by: ['country', 'city'],
      _count: { id: true },
      where: {
        country: { not: null },
        city: { not: null },
      },
    });

    // 已知的有效国家列表（不区分大小写匹配）
    const validCountriesLower = new Set([
      'japan', 'thailand', 'denmark', 'france', 'austria', 
      'germany', 'indonesia', 'italy', 'spain', 'united kingdom',
      'south korea', 'taiwan', 'china', 'vietnam', 'singapore',
      'malaysia', 'philippines', 'australia', 'new zealand',
      'netherlands', 'belgium', 'switzerland', 'portugal', 'greece',
      'turkey', 'india', 'canada', 'mexico', 'brazil', 'argentina',
      'united states', 'usa'
    ]);

    // 无效的城市名称（国家/地区的行政区划，不是城市）
    const invalidCityNamesLower = new Set([
      // UK 的行政区划（不是城市）
      'england', 'scotland', 'wales', 'northern ireland',
      // 其他可能被误用的非城市名称
      'united kingdom', 'great britain', 'britain',
      // 常见的错误数据
      'unknown', 'n/a', 'na', 'none', 'null', 'undefined', '',
    ]);

    // 按国家分组统计
    const countryStats: Record<string, {
      originalName: string;
      totalPlaces: number;
      cities: { name: string; count: number }[];
    }> = {};

    for (const row of placeCounts) {
      if (!row.country || !row.city) continue;
      const country = row.country.trim();
      const city = row.city.trim();
      if (!country || !city) continue;

      const countryLower = country.toLowerCase();
      const cityLower = city.toLowerCase();
      
      // 只接受有效的国家
      if (!validCountriesLower.has(countryLower)) continue;
      
      // 跳过国家和城市相同的情况
      if (countryLower === cityLower) continue;
      
      // 跳过无效的城市名称（行政区划等）
      if (invalidCityNamesLower.has(cityLower)) continue;

      if (!countryStats[countryLower]) {
        countryStats[countryLower] = {
          originalName: country,
          totalPlaces: 0,
          cities: [],
        };
      }

      countryStats[countryLower].totalPlaces += row._count.id;
      countryStats[countryLower].cities.push({
        name: city,
        count: row._count.id,
      });
    }

    // 构建结果
    const result: Record<string, {
      placeCount: number;
      cities: { name: string; placeCount: number }[];
    }> = {};

    for (const [, stats] of Object.entries(countryStats)) {
      // 规则1: 国家地点数量 > minCountryPlaces 才显示
      if (stats.totalPlaces < minCountryPlaces) continue;

      // 按地点数量降序排列城市
      const sortedCities = stats.cities.sort((a, b) => b.count - a.count);

      // 规则2: 城市地点数量 >= minCityPlaces 才显示
      const qualifiedCities = sortedCities.filter(c => c.count >= minCityPlaces);

      // 如果没有符合条件的城市，跳过这个国家
      if (qualifiedCities.length === 0) continue;

      // 直接使用符合条件的城市，不再补齐
      const finalCities = qualifiedCities.map(c => ({ name: c.name, placeCount: c.count }));

      // 按地点数量倒序排列（多的在前面）
      finalCities.sort((a, b) => b.placeCount - a.placeCount);

      result[stats.originalName] = {
        placeCount: stats.totalPlaces,
        cities: finalCities,
      };
    }

    // 按国家名称字母排序
    const sortedResult: typeof result = {};
    const sortedCountries = Object.keys(result).sort();
    for (const country of sortedCountries) {
      sortedResult[country] = result[country];
    }

    // 保存到缓存（仅当使用默认参数时）
    if (useDefaultParams) {
      this._countriesCitiesStatsCache = {
        data: sortedResult,
        timestamp: Date.now(),
        ttl: 60 * 60 * 1000, // 1 小时
      };
      const duration = Date.now() - startTime;
      console.log(`✅ [PublicPlaceService] 国家城市统计数据计算完成，耗时 ${duration}ms，已缓存 1 小时`);
    }

    return sortedResult;
  }

  /**
   * 获取城市 Top N 评分人数最多的地点
   */
  async getTopPlacesByCity(options: {
    city: string;
    country?: string;
    limit?: number;  // 默认 20
  }) {
    const { city, country, limit = 20 } = options;

    const where: any = {
      city: { equals: city, mode: 'insensitive' },
    };

    if (country) {
      where.country = { equals: country, mode: 'insensitive' };
    }

    const places = await prisma.place.findMany({
      where,
      orderBy: [
        { ratingCount: { sort: 'desc', nulls: 'last' } },
        { rating: { sort: 'desc', nulls: 'last' } },
      ],
      take: limit,
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
        price: true,
        priceLevel: true,
        website: true,
        phoneNumber: true,
        googlePlaceId: true,
        source: true,
        createdAt: true,
        customFields: true,  // 包含剧照等自定义数据
      },
    });

    return places;
  }

  /**
   * 标签同义词映射表
   * 用于模糊搜索：用户搜索 "bread" 时也会匹配 "bakery"
   */
  private static readonly TAG_SYNONYMS: Record<string, string[]> = {
    // 食物相关
    'bread': ['bakery', 'boulangerie', 'pastry'],
    'bakery': ['bread', 'boulangerie', 'pastry'],
    'coffee': ['cafe', 'café', 'coffeeshop', 'coffee shop'],
    'cafe': ['coffee', 'café', 'coffeeshop', 'coffee shop'],
    'café': ['coffee', 'cafe', 'coffeeshop'],
    'brunch': ['breakfast', 'cafe', 'restaurant'],
    'breakfast': ['brunch', 'cafe'],
    'ramen': ['restaurant', 'noodle', 'japanese'],
    'sushi': ['restaurant', 'japanese'],
    'pizza': ['restaurant', 'italian', 'pizzeria'],
    'burger': ['restaurant', 'fast food'],
    'french': ['french cuisine', 'bistro', 'brasserie'],
    'italian': ['italian cuisine', 'trattoria', 'ristorante'],
    'japanese': ['japanese cuisine', 'izakaya'],
    'chinese': ['chinese cuisine', 'dim sum'],
    'thai': ['thai cuisine'],
    'indian': ['indian cuisine', 'curry'],
    'mexican': ['mexican cuisine', 'taqueria'],
    'korean': ['korean cuisine', 'bbq'],
    'vietnamese': ['vietnamese cuisine', 'pho'],
    
    // 饮品相关
    'bar': ['pub', 'cocktail', 'wine bar', 'beer'],
    'pub': ['bar', 'beer', 'tavern'],
    'wine': ['wine bar', 'bar', 'vineyard'],
    'cocktail': ['bar', 'cocktail bar', 'speakeasy'],
    'beer': ['pub', 'bar', 'brewery', 'beer garden'],
    
    // 文化场所
    'museum': ['gallery', 'exhibition', 'art museum'],
    'gallery': ['art gallery', 'museum', 'exhibition'],
    'art': ['art gallery', 'gallery', 'museum'],
    'design': ['design museum'],  // design 只匹配 design museum，不扩展到所有 museum
    'history': ['historical', 'museum', 'heritage'],
    
    // 自然景观
    'park': ['garden', 'nature', 'green space'],
    'garden': ['park', 'botanical garden', 'nature'],
    'nature': ['park', 'garden', 'hiking', 'outdoor'],
    'hiking': ['trail', 'nature', 'outdoor', 'trekking'],
    'beach': ['seaside', 'coast', 'ocean'],
    
    // 宗教场所
    'temple': ['shrine', 'religious', 'buddhist'],
    'shrine': ['temple', 'religious', 'shinto'],
    'church': ['cathedral', 'religious', 'chapel'],
    'mosque': ['religious', 'islamic'],
    
    // 购物
    'shop': ['store', 'shopping', 'boutique', 'retail'],
    'store': ['shop', 'shopping', 'boutique'],
    'shopping': ['shop', 'store', 'mall', 'market'],
    'market': ['food market', 'flea market', 'bazaar', 'shopping'],
    'bookstore': ['book shop', 'books', 'library'],
    
    // 住宿
    'hotel': ['accommodation', 'lodging', 'inn'],
    'hostel': ['accommodation', 'budget hotel'],
    
    // 建筑
    'architecture': ['building', 'landmark', 'historic'],
    'landmark': ['monument', 'attraction', 'architecture'],
    
    // 建筑风格（处理 -ism/-ist 变体）
    'brutalism': ['brutalist', 'brutal'],
    'brutalist': ['brutalism', 'brutal'],
    'modernism': ['modernist', 'modern'],
    'modernist': ['modernism', 'modern'],
    'modern': ['modernism', 'modernist'],
    'postmodernism': ['postmodern', 'postmodernist', 'post-modern'],
    'postmodern': ['postmodernism', 'postmodernist', 'post-modern'],
    'postmodernist': ['postmodernism', 'postmodern'],
    'minimalism': ['minimalist', 'minimal'],
    'minimalist': ['minimalism', 'minimal'],
    'expressionism': ['expressionist'],
    'expressionist': ['expressionism'],
    'deconstructivism': ['deconstructivist', 'deconstructionism'],
    'deconstructivist': ['deconstructivism'],
    'neoclassical': ['neoclassicism', 'neo-classical', 'classical'],
    'neoclassicism': ['neoclassical', 'neo-classical'],
    'gothic': ['gothic revival', 'neo-gothic', 'gothic architecture'],
    'baroque': ['baroquist', 'baroque architecture'],
    'renaissance': ['renaissance architecture', 'renaissance style'],
    'art nouveau': ['art-nouveau', 'jugendstil', 'liberty style'],
    'art-nouveau': ['art nouveau', 'jugendstil'],
    'art deco': ['art-deco', 'artdeco'],
    'art-deco': ['art deco', 'artdeco'],
    'bauhaus': ['bauhaus style', 'bauhaus architecture'],
    'organic': ['organic architecture'],
    'high-tech': ['high tech', 'hightech', 'hi-tech'],
    'futurism': ['futurist', 'neo-futurism', 'neo-futurist'],
    'futurist': ['futurism', 'neo-futurism'],
    'neo-futurism': ['neo-futurist', 'futurism', 'futurist'],
    'structuralism': ['structuralist'],
    'structuralist': ['structuralism'],
    'metabolism': ['metabolist'],
    'metabolist': ['metabolism'],
    'rococo': ['rococo style'],
    'romanesque': ['romanesque architecture'],
    'colonial': ['colonial architecture', 'colonial style'],
    
    // 著名建筑师（名字变体）
    'zaha': ['zaha hadid', 'hadid'],
    'zaha hadid': ['zaha', 'hadid'],
    'hadid': ['zaha hadid', 'zaha'],
    'gehry': ['frank gehry', 'frank o. gehry'],
    'frank gehry': ['gehry'],
    'tadao': ['tadao ando', 'ando'],
    'tadao ando': ['tadao', 'ando'],
    'ando': ['tadao ando', 'tadao'],
    'corbusier': ['le corbusier'],
    'le corbusier': ['corbusier'],
    'gaudi': ['gaudí', 'antoni gaudi', 'antoni gaudí'],
    'gaudí': ['gaudi', 'antoni gaudi'],
    'mies': ['mies van der rohe', 'van der rohe'],
    'mies van der rohe': ['mies', 'van der rohe'],
    'wright': ['frank lloyd wright', 'lloyd wright'],
    'frank lloyd wright': ['wright', 'lloyd wright'],
    'kenzo': ['kenzo tange', 'tange'],
    'kenzo tange': ['kenzo', 'tange'],
    'renzo': ['renzo piano', 'piano'],
    'renzo piano': ['renzo', 'piano'],
    'norman foster': ['foster', 'foster + partners'],
    'foster': ['norman foster'],
    'bjarke': ['bjarke ingels', 'big', 'ingels'],
    'bjarke ingels': ['bjarke', 'big', 'ingels'],
    'kengo': ['kengo kuma', 'kuma'],
    'kengo kuma': ['kengo', 'kuma'],
    'pritzker': ['pritzker prize', 'pritzker winner', 'pritzker laureate'],
  };

  /**
   * 扩展标签：添加同义词
   * 例如：['bread'] -> ['bread', 'bakery', 'boulangerie', 'pastry']
   */
  private expandTagsWithSynonyms(tags: string[]): string[] {
    const expanded = new Set<string>();
    
    for (const tag of tags) {
      const tagLower = tag.toLowerCase();
      expanded.add(tagLower);
      
      // 添加同义词
      const synonyms = PublicPlaceService.TAG_SYNONYMS[tagLower];
      if (synonyms) {
        for (const synonym of synonyms) {
          expanded.add(synonym.toLowerCase());
        }
      }
      
      // 处理复合词搜索，如 "French restaurant"
      const words = tagLower.split(/\s+/);
      if (words.length > 1) {
        // 添加每个单词作为独立标签
        for (const word of words) {
          expanded.add(word);
          // 也添加单词的同义词
          const wordSynonyms = PublicPlaceService.TAG_SYNONYMS[word];
          if (wordSynonyms) {
            for (const synonym of wordSynonyms) {
              expanded.add(synonym.toLowerCase());
            }
          }
        }
      }
    }
    
    return Array.from(expanded);
  }

  /**
   * 按城市和标签筛选地点（不区分大小写）
   */
  async searchByFilters(options: {
    city: string;
    country: string;
    tags?: string[];
    categories?: string[];
    limit?: number;
  }) {
    const { city, country, tags, categories, limit = 50 } = options;

    // 城市和国家使用不区分大小写的匹配
    const where: any = {
      city: { equals: city, mode: 'insensitive' },
      country: { equals: country, mode: 'insensitive' },
    };

    // 如果有分类过滤，在数据库层面过滤 categorySlug
    if (categories && categories.length > 0) {
      where.categorySlug = { in: categories.map(c => c.toLowerCase()) };
    }

    // 如果有标签，先不在数据库层面过滤，而是取出所有该城市的地点
    // 然后在内存中进行标签匹配（因为 aiTags 是 JSON 数组，Prisma 不支持直接查询）

    const places = await prisma.place.findMany({
      where,
      // 当有标签筛选时，取更多数据以确保筛选后有足够结果
      take: tags && tags.length > 0 ? 1000 : limit * 4,
      orderBy: [
        { ratingCount: 'desc' }, // 按评价人数倒序
        { rating: 'desc' },
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
        categorySlug: true,
        categoryEn: true,
        aiSummary: true,
        aiTags: true,
        tags: true,
        coverImage: true,
        images: true,
        customFields: true,  // 包含剧照等自定义数据
      },
    });

    console.log(`🔍 [searchByFilters] Found ${places.length} places in ${city}, ${country}`);
    if (categories && categories.length > 0) {
      console.log(`🔍 [searchByFilters] Filtered by categories: ${categories.join(', ')}`);
    }
    
    // 打印前几个地点的详细信息用于调试
    if (places.length > 0) {
      console.log(`🔍 [searchByFilters] Sample places:`);
      for (const p of places.slice(0, 3)) {
        console.log(`  - ${p.name}: categorySlug=${p.categorySlug}, categoryEn=${p.categoryEn}, tags=${JSON.stringify(p.tags)}`);
      }
    }

    // 如果有标签，在内存中过滤 tags 和 aiTags 字段（不区分大小写）
    let filteredPlaces = places;
    if (tags && tags.length > 0) {
      // 扩展标签：添加同义词映射
      const expandedTags = this.expandTagsWithSynonyms(tags);
      const tagsLower = expandedTags.map(t => t.toLowerCase());
      
      console.log(`🔍 [searchByFilters] Filtering by tags: ${tags.join(', ')} -> expanded: ${expandedTags.join(', ')}`);
      
      filteredPlaces = places.filter(place => {
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
            console.log(`✅ [searchByFilters] Matched by aiTags: ${place.name}`);
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
                console.log(`✅ [searchByFilters] Matched by tags: ${place.name} (tags: ${JSON.stringify(place.tags)})`);
                return true;
              }
            }
          }
        }
        
        return false;
      });
    }
    
    // 过滤掉没有图片的地点
    filteredPlaces = filteredPlaces.filter(place => {
      if (!place.coverImage) return false;
      // 排除占位符图片
      if (place.coverImage.includes('placeholder')) return false;
      if (place.coverImage.includes('example.com')) return false;
      return true;
    });
    
    // 按评分人数倒序排序
    filteredPlaces.sort((a, b) => (b.ratingCount || 0) - (a.ratingCount || 0));

    console.log(`🔍 [searchByFilters] After filtering: ${filteredPlaces.length} places (returning ${Math.min(filteredPlaces.length, limit)})`);

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

  /**
   * 获取标签类型列表（按类型分组的标签）
   * 支持按国家和分类筛选
   */
  async getTagTypes(options?: {
    country?: string;
    category?: string;
  }) {
    // 构建查询条件
    const where: any = {};
    if (options?.country) {
      where.country = normalizeCountryName(options.country);
    }
    if (options?.category) {
      where.categoryEn = options.category;
    }

    // 获取所有地点的标签
    const placesWithTags = await prisma.place.findMany({
      select: {
        tags: true,
        aiTags: true,
      },
      where: Object.keys(where).length > 0 ? where : undefined,
    });

    // 统计标签
    const globalTagMap: Record<string, number> = {};

    for (const place of placesWithTags) {
      // 检查 aiTags
      if (place.aiTags && Array.isArray(place.aiTags)) {
        for (const tag of place.aiTags as any[]) {
          const tagEn = typeof tag === 'object' && tag.en ? tag.en : (typeof tag === 'string' ? tag : null);
          if (tagEn) {
            globalTagMap[tagEn] = (globalTagMap[tagEn] || 0) + 1;
          }
        }
      }

      // 检查 tags 字段（JSON 对象格式）
      if (place.tags && typeof place.tags === 'object') {
        const tagsObj = place.tags as any;
        for (const key of Object.keys(tagsObj)) {
          const value = tagsObj[key];
          if (Array.isArray(value)) {
            for (const item of value) {
              if (typeof item === 'string') {
                globalTagMap[item] = (globalTagMap[item] || 0) + 1;
              }
            }
          } else if (typeof value === 'string') {
            globalTagMap[value] = (globalTagMap[value] || 0) + 1;
          }
        }
      }
    }

    // 格式化标签数据
    const tags = Object.entries(globalTagMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // 按类型分组标签
    const tagsByType = getTagTypeStats(tags);

    return {
      tagsByType,
      totalTags: tags.length,
      totalCount: tags.reduce((sum, tag) => sum + tag.count, 0),
    };
  }

  /**
   * 获取城市的 Top N 标签统计
   * 统计 category_en + ai_tags + tags 的出现次数
   * 返回按出现次数排序的标签列表
   */
  async getCityTagStats(options: {
    city: string;
    country?: string;
    limit?: number;  // 默认 10
  }) {
    const { city, country, limit = 10 } = options;

    const where: any = {
      city: { equals: city, mode: 'insensitive' },
    };

    if (country) {
      where.country = { equals: country, mode: 'insensitive' };
    }

    // 获取该城市所有地点的标签相关字段
    const places = await prisma.place.findMany({
      where,
      select: {
        categoryEn: true,
        aiTags: true,
        tags: true,
      },
    });

    // 统计标签出现次数
    const tagCounts: Record<string, number> = {};

    for (const place of places) {
      // 1. 统计 categoryEn
      if (place.categoryEn && typeof place.categoryEn === 'string') {
        const category = place.categoryEn.trim();
        if (category) {
          // 首字母大写
          const normalized = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
          tagCounts[normalized] = (tagCounts[normalized] || 0) + 1;
        }
      }

      // 2. 统计 aiTags
      if (place.aiTags && Array.isArray(place.aiTags)) {
        for (const tag of place.aiTags as any[]) {
          const tagEn = typeof tag === 'object' && tag.en ? tag.en : (typeof tag === 'string' ? tag : null);
          if (tagEn && typeof tagEn === 'string') {
            const normalized = tagEn.charAt(0).toUpperCase() + tagEn.slice(1).toLowerCase();
            tagCounts[normalized] = (tagCounts[normalized] || 0) + 1;
          }
        }
      }

      // 3. 统计 tags（结构化标签）
      if (place.tags && typeof place.tags === 'object') {
        const tagsObj = place.tags as any;
        for (const key of Object.keys(tagsObj)) {
          const value = tagsObj[key];
          if (Array.isArray(value)) {
            for (const item of value) {
              if (typeof item === 'string' && item.trim()) {
                const normalized = item.charAt(0).toUpperCase() + item.slice(1).toLowerCase();
                tagCounts[normalized] = (tagCounts[normalized] || 0) + 1;
              }
            }
          }
        }
      }
    }

    // 按出现次数排序，取 Top N
    const sortedTags = Object.entries(tagCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    return {
      tags: sortedTags,
      totalPlaces: places.length,
    };
  }

  /**
   * 按城市和单个标签筛选地点
   * 用于标签点击后加载该标签的 Top 50 地点
   */
  async getPlacesByCityAndTag(options: {
    city: string;
    country?: string;
    tag: string;
    limit?: number;  // 默认 50
  }) {
    const { city, country, tag, limit = 50 } = options;

    const where: any = {
      city: { equals: city, mode: 'insensitive' },
    };

    if (country) {
      where.country = { equals: country, mode: 'insensitive' };
    }

    // 获取该城市所有地点
    const places = await prisma.place.findMany({
      where,
      orderBy: [
        { ratingCount: { sort: 'desc', nulls: 'last' } },
        { rating: { sort: 'desc', nulls: 'last' } },
      ],
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
        price: true,
        priceLevel: true,
        website: true,
        phoneNumber: true,
        googlePlaceId: true,
        source: true,
        createdAt: true,
        customFields: true,  // 包含剧照等自定义数据
      },
    });

    // 在内存中筛选匹配标签的地点
    const tagLower = tag.toLowerCase();
    const matchedPlaces = places.filter(place => {
      // 检查 categoryEn
      if (place.categoryEn && place.categoryEn.toLowerCase() === tagLower) {
        return true;
      }

      // 检查 aiTags
      if (place.aiTags && Array.isArray(place.aiTags)) {
        for (const t of place.aiTags as any[]) {
          const tagEn = typeof t === 'object' && t.en ? t.en : (typeof t === 'string' ? t : null);
          if (tagEn && tagEn.toLowerCase() === tagLower) {
            return true;
          }
        }
      }

      // 检查 tags（结构化标签）
      if (place.tags && typeof place.tags === 'object') {
        const tagsObj = place.tags as any;
        for (const key of Object.keys(tagsObj)) {
          const value = tagsObj[key];
          if (Array.isArray(value)) {
            for (const item of value) {
              if (typeof item === 'string' && item.toLowerCase() === tagLower) {
                return true;
              }
            }
          }
        }
      }

      return false;
    });

    return matchedPlaces.slice(0, limit);
  }

  /**
   * 获取所有不同的标签值，按类型分组（用于标签自动完成）
   * 返回每种类型下按字母顺序排序的唯一标签值
   */
  async getDistinctTagsByType(): Promise<{
    type: string[];
    style: string[];
    architect: string[];
    award: string[];
    theme: string[];
    meal: string[];
    cuisine: string[];
    others: string[];
    aiTags: string[];
  }> {
    // 获取所有地点的 tags 和 aiTags 字段
    const placesWithTags = await prisma.place.findMany({
      select: {
        tags: true,
        aiTags: true,
      },
    });

    // 使用 Set 来确保唯一性
    const tagsByType: Record<string, Set<string>> = {
      type: new Set(),
      style: new Set(),
      architect: new Set(),
      award: new Set(),
      theme: new Set(),
      meal: new Set(),
      cuisine: new Set(),
      others: new Set(),
      aiTags: new Set(),
    };

    for (const place of placesWithTags) {
      // 处理结构化 tags
      if (place.tags && typeof place.tags === 'object') {
        const tagsObj = place.tags as Record<string, unknown>;
        for (const [tagType, values] of Object.entries(tagsObj)) {
          const targetSet = tagsByType[tagType] || tagsByType.others;
          if (Array.isArray(values)) {
            for (const value of values) {
              if (typeof value === 'string' && value.trim()) {
                targetSet.add(value.trim());
              }
            }
          }
        }
      }

      // 处理 aiTags
      if (place.aiTags && Array.isArray(place.aiTags)) {
        for (const tag of place.aiTags as any[]) {
          const tagEn = typeof tag === 'object' && tag.en ? tag.en : (typeof tag === 'string' ? tag : null);
          if (tagEn && typeof tagEn === 'string' && tagEn.trim()) {
            tagsByType.aiTags.add(tagEn.trim());
          }
        }
      }
    }

    // 转换为排序后的数组
    return {
      type: Array.from(tagsByType.type).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })),
      style: Array.from(tagsByType.style).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })),
      architect: Array.from(tagsByType.architect).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })),
      award: Array.from(tagsByType.award).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })),
      theme: Array.from(tagsByType.theme).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })),
      meal: Array.from(tagsByType.meal).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })),
      cuisine: Array.from(tagsByType.cuisine).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })),
      others: Array.from(tagsByType.others).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })),
      aiTags: Array.from(tagsByType.aiTags).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })),
    };
  }
}

export default new PublicPlaceService();
