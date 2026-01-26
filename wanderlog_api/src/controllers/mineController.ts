import { Request, Response } from 'express';
import prisma from '../config/database';
import { logger } from '../utils/logger';

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
        p.category,
        p.tags,
        p.ai_tags,
        p.cover_image
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
    const result = visitedSpots.map((row: any) => ({
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
        tags: row.tags || [],
        aiTags: row.ai_tags || [],
        coverImage: row.cover_image,
      },
    }));
    
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
