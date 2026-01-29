import { Request, Response } from 'express';
import prisma from '../config/database';
import { logger } from '../utils/logger';

// 解析 JSON 字段为数组
function parseJsonArray(value: any): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

// 解析 JSON 字段为对象
function parseJsonObject(value: any): Record<string, any> | null {
  if (!value) return null;
  if (typeof value === 'object') return value as Record<string, any>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, any>)
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

// 从结构化 tags 对象中提取标签列表
function extractTagsFromStructured(tags: Record<string, any> | null): string[] {
  if (!tags || typeof tags !== 'object') return [];

  const result: string[] = [];
  for (const key of Object.keys(tags)) {
    const values = tags[key];
    if (Array.isArray(values)) {
      for (const v of values) {
        if (typeof v === 'string' && v.trim()) {
          result.push(v.trim());
        }
      }
    }
  }
  return result;
}

/**
 * 获取 Mine 页面摘要数据
 * 只返回已访问的地点和必要字段，优化性能
 */
export const getMineSummary = async (req: Request, res: Response) => {
  const prismaAny = prisma as any;
  try {
    const userId = req.user?.id;
    const startTime = Date.now();
    
    logger.info(`🏠 [getMineSummary] Starting for user ${userId}`);
    
    if (!userId) {
      logger.error('❌ [getMineSummary] No user ID found in request');
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    // 直接查询已访问的地点，只选择必要字段
    // 兼容旧数据：is_visited = true 或 status = 'VISITED'
    logger.info(`🏠 [getMineSummary] Executing query for user ${userId}...`);
    const visitedSpots = await prismaAny.$queryRaw`
      SELECT 
        ts.id as trip_spot_id,
        ts.visit_date,
        ts.user_photos,
        ts.user_notes,
        ts.user_rating,
        ts.updated_at,
        p.id as place_id,
        p.name,
        p.city,
        p.country,
        p.latitude,
        p.longitude,
        p.address,
        p.description,
        p.ai_summary,
        p.opening_hours,
        p.rating,
        p.rating_count,
        p.category,
        p.category_en,
        p.category_zh,
        p.tags,
        p.ai_tags,
        p.cover_image,
        p.images,
        p.website,
        p.phone_number,
        p.google_place_id,
        p.is_verified,
        p.custom_fields,
        p.price_level
      FROM trip_spots ts
      INNER JOIN places p ON ts.place_id = p.id
      INNER JOIN trips t ON ts.trip_id = t.id
      WHERE t.user_id = ${userId}::uuid 
        AND (ts.is_visited = true OR ts.status = 'VISITED')
      ORDER BY COALESCE(ts.visit_date, ts.updated_at) DESC
    `;
    
    const queryTime = Date.now() - startTime;
    logger.info(`🏠 [getMineSummary] Query completed in ${queryTime}ms, found ${visitedSpots.length} visited spots`);
    
    if (visitedSpots.length === 0) {
      logger.info('⚠️ [getMineSummary] No visited spots found, returning empty array');
      return res.json([]);
    }
    
    // 打印第一条数据的结构
    logger.info(`🔍 [getMineSummary] First spot sample:`, {
      trip_spot_id: visitedSpots[0].trip_spot_id,
      place_id: visitedSpots[0].place_id,
      name: visitedSpots[0].name,
      has_visit_date: !!visitedSpots[0].visit_date,
      has_user_photos: Array.isArray(visitedSpots[0].user_photos) && visitedSpots[0].user_photos.length > 0,
    });
    
    // 转换数据格式
    const processStart = Date.now();
    const result = visitedSpots.map((row: any) => {
      const images = parseJsonArray(row.images);
      const structuredTags = parseJsonObject(row.tags);
      const tags = extractTagsFromStructured(structuredTags);
      const aiTags = parseJsonArray(row.ai_tags);
      const customFields = parseJsonObject(row.custom_fields);

      return {
      id: row.trip_spot_id,
      visitDate: row.visit_date ? new Date(row.visit_date).toISOString() : null,
      userPhotos: Array.isArray(row.user_photos) ? row.user_photos : [],
      userNotes: row.user_notes,
      userRating: row.user_rating,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      place: {
        id: row.place_id,
        name: row.name,
        city: row.city,
        country: row.country,
        latitude: row.latitude,
        longitude: row.longitude,
        category: row.category || 'other',
        categoryEn: row.category_en,
        categoryZh: row.category_zh,
        tags,
        aiTags,
        coverImage: row.cover_image,
        images,
        address: row.address,
        description: row.description,
        aiSummary: row.ai_summary,
        openingHours: row.opening_hours,
        rating: row.rating,
        ratingCount: row.rating_count,
        website: row.website,
        phoneNumber: row.phone_number,
        googlePlaceId: row.google_place_id,
        isVerified: row.is_verified,
        customFields,
        priceLevel: row.price_level,
      },
    };
    });
    
    const processTime = Date.now() - processStart;
    const totalTime = Date.now() - startTime;
    
    logger.info(`🏠 [getMineSummary] Processing completed in ${processTime}ms`);
    logger.info(`🏠 [getMineSummary] ✅ TOTAL TIME: ${totalTime}ms (${result.length} spots)`);
    
    // 打印第一条处理后的数据
    if (result.length > 0) {
      logger.info('🔍 [getMineSummary] First result sample:', {
        id: result[0].id,
        hasPlace: !!result[0].place,
        placeName: result[0].place?.name,
        userPhotosCount: result[0].userPhotos?.length || 0,
      });
    }
    
    logger.info(`🏠 [getMineSummary] Returning ${result.length} spots`);
    return res.json(result);
  } catch (error) {
    logger.error('Get Mine Summary error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
