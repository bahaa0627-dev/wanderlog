import { Request, Response } from 'express';
import prisma from '../config/database';
import { logger } from '../utils/logger';

// Helper to convert snake_case to camelCase for frontend compatibility
const toCamelCase = (row: any) => {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    city: row.city,
    startDate: row.start_date ? new Date(row.start_date).toISOString() : null,
    endDate: row.end_date ? new Date(row.end_date).toISOString() : null,
    status: row.status,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    spotCount: row.spot_count || 0,
  };
};

const tripSpotToCamelCase = (row: any) => {
  if (!row) return null;
  
  // Ensure userPhotos is always an array
  let userPhotos: string[] = [];
  if (row.user_photos) {
    if (Array.isArray(row.user_photos)) {
      userPhotos = row.user_photos;
    } else if (typeof row.user_photos === 'string') {
      try {
        const parsed = JSON.parse(row.user_photos);
        userPhotos = Array.isArray(parsed) ? parsed : [];
      } catch {
        userPhotos = [];
      }
    }
  }
  
  // 兼容新旧字段：优先使用新的布尔字段，回退到旧的 status/priority
  const isSaved = row.is_saved ?? true;
  const isVisited = row.is_visited ?? (row.status === 'VISITED');
  const isMustGo = row.is_must_go ?? (row.priority === 'MUST_GO');
  const isTodaysPlan = row.is_todays_plan ?? (row.status === 'TODAYS_PLAN');
  
  return {
    id: row.id,
    tripId: row.trip_id,
    placeId: row.place_id,
    spotId: row.place_id, // Frontend expects spotId
    // 新的布尔字段
    isSaved,
    isVisited,
    isMustGo,
    isTodaysPlan,
    // 保留旧字段用于兼容（将被废弃）
    status: row.status,
    priority: row.priority,
    visitDate: row.visit_date ? new Date(row.visit_date).toISOString() : null,
    userRating: row.user_rating,
    userNotes: row.user_notes,
    userPhotos,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
};

export const createTrip = async (req: Request, res: Response) => {
  const prismaAny = prisma as any;
  try {
    const { name, city, startDate, endDate } = req.body;
    const userId = req.user.id;

    const startDateStr = startDate ? new Date(startDate).toISOString() : null;
    const endDateStr = endDate ? new Date(endDate).toISOString() : null;

    const results = await prismaAny.$queryRaw`
      INSERT INTO trips (user_id, name, city, start_date, end_date, status)
      VALUES (${userId}::uuid, ${name}, ${city}, ${startDateStr}::timestamp, ${endDateStr}::timestamp, 'PLANNING')
      RETURNING *
    `;

    const trip = toCamelCase(results[0]);
    return res.status(201).json(trip);
  } catch (error) {
    logger.error('Create Trip error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getMyTrips = async (req: Request, res: Response) => {
  const prismaAny = prisma as any;
  try {
    const userId = req.user.id;
    const startTime = Date.now();
    
    // Step 1: Get all trips with spot count in a single query
    const step1Start = Date.now();
    const trips = await prismaAny.$queryRaw`
      SELECT t.*, 
             COALESCE((SELECT COUNT(*) FROM trip_spots ts WHERE ts.trip_id = t.id), 0) as spot_count
      FROM trips t
      WHERE t.user_id = ${userId}::uuid
      ORDER BY t.updated_at DESC
    `;
    logger.info(`⏱️  [getMyTrips] Step 1 (Get trips): ${Date.now() - step1Start}ms`);

    if (!trips || trips.length === 0) {
      logger.info(`⏱️  [getMyTrips] No trips found, total: ${Date.now() - startTime}ms`);
      return res.json([]);
    }
    
    logger.info(`⏱️  [getMyTrips] Found ${trips.length} trips, proceeding to Step 2...`);

    // Step 2: Get all trip IDs
    const tripIds = trips.map((t: any) => t.id);
    
    // Step 3: Get all trip_spots for all trips in a single query
    const step3Start = Date.now();
    const allTripSpots = await prismaAny.$queryRaw`
      SELECT ts.*, p.*,
             ts.id as trip_spot_id,
             ts.trip_id as ts_trip_id,
             ts.place_id as ts_place_id,
             ts.is_saved as is_saved,
             ts.is_visited as is_visited,
             ts.is_must_go as is_must_go,
             ts.is_todays_plan as is_todays_plan,
             ts.status as ts_status,
             ts.priority as ts_priority,
             ts.visit_date as ts_visit_date,
             ts.user_rating as ts_user_rating,
             ts.user_notes as ts_user_notes,
             ts.user_photos as ts_user_photos,
             ts.created_at as ts_created_at,
             ts.updated_at as ts_updated_at,
             p.id as place_id,
             p.name as place_name
      FROM trip_spots ts
      LEFT JOIN places p ON ts.place_id = p.id
      WHERE ts.trip_id = ANY(${tripIds}::uuid[])
      ORDER BY ts.created_at DESC
    `;
    logger.info(`⏱️  [getMyTrips] Step 3 (Get trip_spots): ${Date.now() - step3Start}ms, count: ${allTripSpots.length}`);

    // Step 4: Group trip_spots by trip_id
    const step4Start = Date.now();
    const tripSpotsMap = new Map<string, any[]>();
    for (const ts of allTripSpots as any[]) {
      const tripId = ts.ts_trip_id;
      if (!tripSpotsMap.has(tripId)) {
        tripSpotsMap.set(tripId, []);
      }
      
      // Extract place data
      let normalizedPlace = null;
      if (ts.place_id) {
        normalizedPlace = normalizePlace({
          id: ts.place_id,
          name: ts.place_name || ts.name,
          city: ts.city,
          country: ts.country,
          latitude: ts.latitude,
          longitude: ts.longitude,
          address: ts.address,
          description: ts.description,
          opening_hours: ts.opening_hours,
          rating: ts.rating,
          rating_count: ts.rating_count,
          category: ts.category,
          category_slug: ts.category_slug,
          category_en: ts.category_en,
          category_zh: ts.category_zh,
          ai_summary: ts.ai_summary,
          ai_description: ts.ai_description,
          tags: ts.tags,
          ai_tags: ts.ai_tags,
          cover_image: ts.cover_image,
          images: ts.images,
          price: ts.price,
          price_level: ts.price_level,
          website: ts.website,
          phone_number: ts.phone_number,
          google_place_id: ts.google_place_id,
          source: ts.source,
          custom_fields: ts.custom_fields,
        });
      }
      
      // Extract trip_spot data - 包含新的布尔字段
      const tripSpotData = tripSpotToCamelCase({
        id: ts.trip_spot_id,
        trip_id: ts.ts_trip_id,
        place_id: ts.ts_place_id,
        // 新的布尔字段
        is_saved: ts.is_saved,
        is_visited: ts.is_visited,
        is_must_go: ts.is_must_go,
        is_todays_plan: ts.is_todays_plan,
        // 旧字段（兼容）
        status: ts.ts_status,
        priority: ts.ts_priority,
        visit_date: ts.ts_visit_date,
        user_rating: ts.ts_user_rating,
        user_notes: ts.ts_user_notes,
        user_photos: ts.ts_user_photos,
        created_at: ts.ts_created_at,
        updated_at: ts.ts_updated_at,
      });
      
      tripSpotsMap.get(tripId)!.push({
        ...tripSpotData,
        place: normalizedPlace,
        spot: normalizedPlace,
      });
    }
    logger.info(`⏱️  [getMyTrips] Step 4 (Group & normalize): ${Date.now() - step4Start}ms`);

    // Step 5: Build result
    const step5Start = Date.now();
    const result = trips.map((t: any) => ({
      ...toCamelCase(t),
      _count: { tripSpots: Number(t.spot_count) || 0 },
      tripSpots: tripSpotsMap.get(t.id) || [],
    }));
    logger.info(`⏱️  [getMyTrips] Step 5 (Build result): ${Date.now() - step5Start}ms`);

    const totalTime = Date.now() - startTime;
    logger.info(`⏱️  [getMyTrips] ✅ TOTAL TIME: ${totalTime}ms (${trips.length} trips, ${allTripSpots.length} spots)`);

    return res.json(JSON.parse(JSON.stringify(result, (_, v) => typeof v === 'bigint' ? Number(v) : v)));
  } catch (error) {
    logger.error('Get Trips error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getTripById = async (req: Request, res: Response) => {
  const prismaAny = prisma as any;
  try {
    const { id } = req.params;
    const userId = req.user.id;

    logger.info(`getTripById: tripId=${id}, userId=${userId}`);

    // Get trip
    const trips = await prismaAny.$queryRaw`
      SELECT * FROM trips WHERE id = ${id}::uuid LIMIT 1
    `;

    logger.info(`getTripById: found ${trips?.length || 0} trips`);

    if (!trips || trips.length === 0) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    const trip = trips[0];
    logger.info(`getTripById: trip.user_id=${trip.user_id}, userId=${userId}`);
    
    if (trip.user_id !== userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Get trip spots with places in a single JOIN query
    const tripSpotsWithPlaces = await prismaAny.$queryRaw`
      SELECT ts.*, p.*,
             ts.id as trip_spot_id,
             ts.trip_id as ts_trip_id,
             ts.place_id as ts_place_id,
             ts.is_saved as is_saved,
             ts.is_visited as is_visited,
             ts.is_must_go as is_must_go,
             ts.is_todays_plan as is_todays_plan,
             ts.status as ts_status,
             ts.priority as ts_priority,
             ts.visit_date as ts_visit_date,
             ts.user_rating as ts_user_rating,
             ts.user_notes as ts_user_notes,
             ts.user_photos as ts_user_photos,
             ts.created_at as ts_created_at,
             ts.updated_at as ts_updated_at,
             p.id as place_id,
             p.name as place_name
      FROM trip_spots ts
      LEFT JOIN places p ON ts.place_id = p.id
      WHERE ts.trip_id = ${id}::uuid
      ORDER BY ts.created_at DESC
    `;
    
    logger.info(`getTripById: found ${tripSpotsWithPlaces?.length || 0} trip_spots`);

    // Process trip spots
    const normalizedTripSpots = (tripSpotsWithPlaces as any[]).map((ts: any) => {
      let normalizedPlace = null;
      if (ts.place_id) {
        normalizedPlace = normalizePlace({
          id: ts.place_id,
          name: ts.place_name || ts.name,
          city: ts.city,
          country: ts.country,
          latitude: ts.latitude,
          longitude: ts.longitude,
          address: ts.address,
          description: ts.description,
          opening_hours: ts.opening_hours,
          rating: ts.rating,
          rating_count: ts.rating_count,
          category: ts.category,
          category_slug: ts.category_slug,
          category_en: ts.category_en,
          category_zh: ts.category_zh,
          ai_summary: ts.ai_summary,
          ai_description: ts.ai_description,
          tags: ts.tags,
          ai_tags: ts.ai_tags,
          cover_image: ts.cover_image,
          images: ts.images,
          price: ts.price,
          price_level: ts.price_level,
          website: ts.website,
          phone_number: ts.phone_number,
          google_place_id: ts.google_place_id,
          source: ts.source,
          custom_fields: ts.custom_fields,
        });
      }
      
      const tripSpotData = tripSpotToCamelCase({
        id: ts.trip_spot_id,
        trip_id: ts.ts_trip_id,
        place_id: ts.ts_place_id,
        // 新的布尔字段
        is_saved: ts.is_saved,
        is_visited: ts.is_visited,
        is_must_go: ts.is_must_go,
        is_todays_plan: ts.is_todays_plan,
        // 旧字段（兼容）
        status: ts.ts_status,
        priority: ts.ts_priority,
        visit_date: ts.ts_visit_date,
        user_rating: ts.ts_user_rating,
        user_notes: ts.ts_user_notes,
        user_photos: ts.ts_user_photos,
        created_at: ts.ts_created_at,
        updated_at: ts.ts_updated_at,
      });

      return {
        ...tripSpotData,
        place: normalizedPlace,
        spot: normalizedPlace,
      };
    });

    return res.json({
      ...toCamelCase(trip),
      tripSpots: normalizedTripSpots,
    });
  } catch (error) {
    logger.error('Get Trip error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Helper to check if a string is a valid UUID
const isValidUUID = (str: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
};

export const manageTripSpot = async (req: Request, res: Response) => {
  const prismaAny = prisma as any;
  try {
    const { id } = req.params; // Trip ID
    const { 
      spotId, placeId, 
      // 新的布尔字段
      isSaved, isVisited, isMustGo, isTodaysPlan,
      // 旧字段（兼容）
      status, priority, 
      visitDate, userRating, userNotes, userPhotos, spot, remove,
      // 清除 check-in 数据（保留收藏、mustGo、todaysPlan）
      clearCheckIn
    } = req.body;
    const userId = req.user.id;
    let targetPlaceId: string | undefined = placeId || spotId;

    if (!targetPlaceId) {
      return res.status(400).json({ message: 'placeId is required' });
    }

    const normalizedPriority = normalizePriority(priority);

    // Verify trip ownership
    const trips = await prismaAny.$queryRaw`
      SELECT * FROM trips WHERE id = ${id}::uuid LIMIT 1
    `;

    if (!trips || trips.length === 0 || trips[0].user_id !== userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Check if targetPlaceId is a valid UUID
    const isUUID = isValidUUID(targetPlaceId);
    logger.info(`[manageTripSpot] targetPlaceId="${targetPlaceId}", isUUID=${isUUID}`);

    // Delete spot if requested
    if (remove === true) {
      if (isUUID) {
        await prismaAny.$executeRaw`
          DELETE FROM trip_spots WHERE trip_id = ${id}::uuid AND place_id = ${targetPlaceId}::uuid
        `;
      }
      return res.json({ success: true, removed: true, spotId: targetPlaceId });
    }

    // 清除 check-in 数据（保留收藏、mustGo、todaysPlan 等状态）
    if (clearCheckIn === true && isUUID) {
      const result = await prismaAny.$queryRaw`
        UPDATE trip_spots SET 
          is_visited = false,
          status = CASE WHEN is_todays_plan = true THEN 'TODAYS_PLAN' ELSE 'WISHLIST' END,
          visit_date = NULL,
          user_rating = NULL,
          user_notes = NULL,
          user_photos = NULL,
          updated_at = NOW()
        WHERE trip_id = ${id}::uuid AND place_id = ${targetPlaceId}::uuid
        RETURNING *
      `;
      if (result && result.length > 0) {
        const tripSpot = result[0];
        // Load place for response
        const dbPlaces = await prismaAny.$queryRaw`
          SELECT * FROM places WHERE id = ${targetPlaceId}::uuid LIMIT 1
        `;
        const normalizedPlace = dbPlaces && dbPlaces.length > 0 ? normalizePlace(dbPlaces[0]) : null;
        const tripSpotData = tripSpotToCamelCase(tripSpot);
        logger.info(`[manageTripSpot] clearCheckIn success: is_saved=${tripSpot.is_saved}, is_must_go=${tripSpot.is_must_go}, is_todays_plan=${tripSpot.is_todays_plan}`);
        return res.json({
          ...tripSpotData,
          place: normalizedPlace,
          spot: normalizedPlace,
        });
      }
      return res.json({ success: true, cleared: true, spotId: targetPlaceId });
    }

    // 查找已有的 place - 用户只能对已有的 place 进行操作
    let existingPlace = null;
    
    if (isUUID) {
      // 通过 UUID 查找
      const existingPlaces = await prismaAny.$queryRaw`
        SELECT * FROM places WHERE id = ${targetPlaceId}::uuid LIMIT 1
      `;
      existingPlace = existingPlaces && existingPlaces.length > 0 ? existingPlaces[0] : null;
    }
    
    // 如果不是 UUID，尝试通过 google_place_id 查找
    if (!existingPlace) {
      const googlePlaceId = spot?.googlePlaceId || targetPlaceId;
      if (googlePlaceId) {
        const placesByGoogleId = await prismaAny.$queryRaw`
          SELECT * FROM places WHERE google_place_id = ${googlePlaceId} LIMIT 1
        `;
        if (placesByGoogleId && placesByGoogleId.length > 0) {
          existingPlace = placesByGoogleId[0];
          targetPlaceId = existingPlace.id;
          logger.info(`[manageTripSpot] Found place by google_place_id: ${googlePlaceId}, id=${targetPlaceId}`);
        }
      }
    }
    
    // 如果还没找到，尝试通过名称+坐标查找（100m 范围内）
    if (!existingPlace && spot?.name && spot?.latitude !== undefined && spot?.longitude !== undefined) {
      const placesByNameAndLocation = await prismaAny.$queryRaw`
        SELECT * FROM places 
        WHERE name = ${spot.name} 
          AND ABS(latitude - ${spot.latitude}::float) < 0.001 
          AND ABS(longitude - ${spot.longitude}::float) < 0.001
        LIMIT 1
      `;
      if (placesByNameAndLocation && placesByNameAndLocation.length > 0) {
        existingPlace = placesByNameAndLocation[0];
        targetPlaceId = existingPlace.id;
        logger.info(`[manageTripSpot] Found place by name+location: "${spot.name}", id=${targetPlaceId}`);
      }
    }
    
    // 如果找不到 place，返回错误 - 不创建新的 place
    if (!existingPlace) {
      logger.warn(`[manageTripSpot] Place not found: targetPlaceId=${targetPlaceId}, googlePlaceId=${spot?.googlePlaceId}, name=${spot?.name}`);
      return res.status(404).json({ message: 'Place not found' });
    }

    // Check if trip spot exists
    const existing = await prismaAny.$queryRaw`
      SELECT * FROM trip_spots WHERE trip_id = ${id}::uuid AND place_id = ${targetPlaceId}::uuid LIMIT 1
    `;
    
    logger.info(`[manageTripSpot] Checking trip_spot: tripId=${id}, placeId=${targetPlaceId}, found=${existing?.length > 0}`);

    let tripSpot;
    const visitDateStr = visitDate ? new Date(visitDate).toISOString() : null;
    const userPhotosJson = userPhotos ? JSON.stringify(userPhotos) : null;
    
    // 计算新的布尔值（兼容旧的 status/priority 参数）
    const computeIsSaved = isSaved ?? true;
    const computeIsVisited = isVisited ?? (status === 'VISITED' ? true : undefined);
    const computeIsMustGo = isMustGo ?? (priority === 'MUST_GO' ? true : undefined);
    const computeIsTodaysPlan = isTodaysPlan ?? (status === 'TODAYS_PLAN' ? true : undefined);
    
    logger.info(`[manageTripSpot] Input: isSaved=${isSaved}, isTodaysPlan=${isTodaysPlan}, isVisited=${isVisited}, status=${status}`);
    logger.info(`[manageTripSpot] Computed: computeIsSaved=${computeIsSaved}, computeIsTodaysPlan=${computeIsTodaysPlan}, computeIsVisited=${computeIsVisited}`);
    
    // 兼容旧的 status/priority（用于旧版本客户端）
    const computeStatus = status || (computeIsVisited ? 'VISITED' : (computeIsTodaysPlan ? 'TODAYS_PLAN' : 'WISHLIST'));
    const computePriority = normalizedPriority || (computeIsMustGo ? 'MUST_GO' : 'OPTIONAL');

    if (existing && existing.length > 0) {
      // Update existing - 使用新的布尔字段
      // 注意：只更新明确传入的字段，undefined 的字段保持原值
      await prismaAny.$executeRaw`
        UPDATE trip_spots SET 
          is_saved = COALESCE(${computeIsSaved !== undefined ? computeIsSaved : null}::boolean, is_saved),
          is_visited = COALESCE(${computeIsVisited !== undefined ? computeIsVisited : null}::boolean, is_visited),
          is_must_go = COALESCE(${computeIsMustGo !== undefined ? computeIsMustGo : null}::boolean, is_must_go),
          is_todays_plan = COALESCE(${computeIsTodaysPlan !== undefined ? computeIsTodaysPlan : null}::boolean, is_todays_plan),
          status = COALESCE(${computeStatus}, status),
          priority = COALESCE(${computePriority}, priority),
          visit_date = COALESCE(${visitDateStr}::timestamp, visit_date),
          user_rating = COALESCE(${userRating}::int, user_rating),
          user_notes = COALESCE(${userNotes}, user_notes),
          user_photos = COALESCE(${userPhotosJson}::jsonb, user_photos),
          updated_at = NOW()
        WHERE trip_id = ${id}::uuid AND place_id = ${targetPlaceId}::uuid
      `;
      const results = await prismaAny.$queryRaw`
        SELECT * FROM trip_spots WHERE trip_id = ${id}::uuid AND place_id = ${targetPlaceId}::uuid LIMIT 1
      `;
      tripSpot = results[0];
      logger.info(`[manageTripSpot] After update: is_saved=${tripSpot?.is_saved}, is_todays_plan=${tripSpot?.is_todays_plan}, is_visited=${tripSpot?.is_visited}`);
    } else {
      // Create new - 使用新的布尔字段
      const results = await prismaAny.$queryRaw`
        INSERT INTO trip_spots (
          trip_id, place_id, 
          is_saved, is_visited, is_must_go, is_todays_plan,
          status, priority, 
          visit_date, user_rating, user_notes, user_photos
        )
        VALUES (
          ${id}::uuid, ${targetPlaceId}::uuid, 
          ${computeIsSaved ?? true}::boolean, 
          ${computeIsVisited ?? false}::boolean, 
          ${computeIsMustGo ?? false}::boolean, 
          ${computeIsTodaysPlan ?? false}::boolean,
          ${computeStatus}, 
          ${computePriority}, 
          ${visitDateStr}::timestamp, 
          ${userRating || null}::int, 
          ${userNotes || null}, 
          ${userPhotosJson}::jsonb
        )
        RETURNING *
      `;
      tripSpot = results[0];
    }

    // Load place for response (use raw SQL to avoid DateTime issues)
    const dbPlaces = await prismaAny.$queryRaw`
      SELECT * FROM places WHERE id = ${targetPlaceId}::uuid LIMIT 1
    `;
    const normalizedPlace = dbPlaces && dbPlaces.length > 0 ? normalizePlace(dbPlaces[0]) : null;
    const tripSpotData = tripSpotToCamelCase(tripSpot);

    return res.json({
      ...tripSpotData,
      place: normalizedPlace,
      spot: normalizedPlace,
    });
  } catch (error) {
    logger.error('Manage TripSpot error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Helper to normalize place data
const normalizePlace = (dbPlace: any) => {
  // 解析 tags（结构化对象格式）
  const parsedTags: string[] = (() => {
    if (dbPlace.tags) {
      try {
        const value = typeof dbPlace.tags === 'string' ? JSON.parse(dbPlace.tags) : dbPlace.tags;
        // 如果是对象格式（新格式），提取所有值
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const result: string[] = [];
          for (const [, val] of Object.entries(value)) {
            if (typeof val === 'string' && val.trim()) {
              result.push(val.trim());
            } else if (Array.isArray(val)) {
              for (const v of val) {
                if (typeof v === 'string' && v.trim()) {
                  result.push(v.trim());
                }
              }
            }
          }
          return result;
        }
        return Array.isArray(value) ? value : [];
      } catch (_) {
        return [];
      }
    }
    return [];
  })();

  // 解析 aiTags（对象数组格式 [{en, zh, kind, ...}]）
  const parsedAiTags: any[] = (() => {
    if (dbPlace.ai_tags || dbPlace.aiTags) {
      try {
        const raw = dbPlace.ai_tags || dbPlace.aiTags;
        const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(value) ? value : [];
      } catch (_) {
        return [];
      }
    }
    return [];
  })();

  // 计算 display_tags_en：category + tags 值 + aiTags.en，最多 4 个
  const displayTagsEn: string[] = [];
  const seen = new Set<string>();
  
  // 1. 先添加 category
  const category = dbPlace.category_en || dbPlace.categoryEn || dbPlace.category;
  if (category && typeof category === 'string' && category.trim()) {
    const cat = category.trim();
    if (!seen.has(cat.toLowerCase())) {
      displayTagsEn.push(cat);
      seen.add(cat.toLowerCase());
    }
  }
  
  // 2. 添加 tags 的值
  for (const tag of parsedTags) {
    if (displayTagsEn.length >= 4) break;
    if (typeof tag === 'string' && tag.trim() && !seen.has(tag.toLowerCase())) {
      displayTagsEn.push(tag.trim());
      seen.add(tag.toLowerCase());
    }
  }
  
  // 3. 添加 aiTags 的 en 值
  for (const tag of parsedAiTags) {
    if (displayTagsEn.length >= 4) break;
    const tagEn = typeof tag === 'object' && tag.en ? String(tag.en).trim() : (typeof tag === 'string' ? tag.trim() : '');
    if (tagEn && !seen.has(tagEn.toLowerCase())) {
      displayTagsEn.push(tagEn);
      seen.add(tagEn.toLowerCase());
    }
  }

  // 解析 openingHours，处理特殊字符串格式
  const parsedOpeningHours = (() => {
    const raw = dbPlace.openingHours || dbPlace.opening_hours;
    if (!raw) return null;
    
    // 如果已经是对象格式，直接返回
    if (typeof raw === 'object') return raw;
    
    // 如果是字符串，尝试解析
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      
      // 尝试 JSON 解析
      try {
        return JSON.parse(trimmed);
      } catch (_) {
        // JSON 解析失败，尝试解析特殊格式
      }
      
      // 处理 "Day, hours: X AM to Y PM}" 格式
      const cleaned = trimmed.endsWith('}') ? trimmed.substring(0, trimmed.length - 1).trim() : trimmed;
      const hoursMatch = /(\w+),?\s*hours?:\s*(\d{1,2})\s*(AM|PM)\s*to\s*(\d{1,2})\s*(AM|PM)/i.exec(cleaned);
      
      if (hoursMatch) {
        const openHour = hoursMatch[2];
        const openPeriod = hoursMatch[3].toUpperCase();
        const closeHour = hoursMatch[4];
        const closePeriod = hoursMatch[5].toUpperCase();
        
        const hoursText = `${openHour}:00 ${openPeriod} – ${closeHour}:00 ${closePeriod}`;
        
        return {
          weekday_text: [
            `Monday: ${hoursText}`,
            `Tuesday: ${hoursText}`,
            `Wednesday: ${hoursText}`,
            `Thursday: ${hoursText}`,
            `Friday: ${hoursText}`,
            `Saturday: ${hoursText}`,
            `Sunday: ${hoursText}`,
          ]
        };
      }
      
      // 无法解析，返回 null
      return null;
    }
    
    return null;
  })();

  const parsedImages = (() => {
    // 首先尝试解析 images 字段
    if (dbPlace.images) {
      try {
        const value = typeof dbPlace.images === 'string' ? JSON.parse(dbPlace.images) : dbPlace.images;
        if (Array.isArray(value) && value.length > 0) {
          return value;
        }
      } catch (_) {
        // 忽略解析错误
      }
    }
    
    // 如果 images 为空，尝试使用 cover_image
    const coverImage = dbPlace.coverImage || dbPlace.cover_image;
    if (coverImage && typeof coverImage === 'string' && coverImage.trim()) {
      return [coverImage.trim()];
    }
    
    return [];
  })();

  return {
    id: dbPlace.id,
    name: dbPlace.name,
    city: dbPlace.city,
    country: dbPlace.country,
    latitude: dbPlace.latitude != null ? Number(dbPlace.latitude) : null,
    longitude: dbPlace.longitude != null ? Number(dbPlace.longitude) : null,
    address: dbPlace.address,
    description: dbPlace.description,
    openingHours: parsedOpeningHours,
    rating: dbPlace.rating != null ? Number(dbPlace.rating) : null,
    ratingCount: dbPlace.ratingCount != null ? Number(dbPlace.ratingCount) : (dbPlace.rating_count != null ? Number(dbPlace.rating_count) : null),
    category: dbPlace.category,
    categoryEn: dbPlace.category_en || dbPlace.categoryEn,
    aiSummary: dbPlace.aiSummary || dbPlace.ai_summary,
    aiDescription: dbPlace.aiDescription || dbPlace.ai_description,
    tags: parsedTags,
    aiTags: parsedAiTags,
    display_tags_en: displayTagsEn,
    coverImage: dbPlace.coverImage || dbPlace.cover_image,
    images: parsedImages,
    priceLevel: dbPlace.priceLevel != null ? Number(dbPlace.priceLevel) : (dbPlace.price_level != null ? Number(dbPlace.price_level) : null),
    website: dbPlace.website,
    phoneNumber: dbPlace.phoneNumber || dbPlace.phone_number,
    googlePlaceId: dbPlace.googlePlaceId || dbPlace.google_place_id,
    source: dbPlace.source,
    custom_fields: filterHiddenStillsFromCustomFields(upgradeStillUrls(dbPlace.custom_fields || dbPlace.customFields)),
    createdAt: dbPlace.created_at ? new Date(dbPlace.created_at).toISOString() : null,
    updatedAt: dbPlace.updated_at ? new Date(dbPlace.updated_at).toISOString() : null,
  };
};

/**
 * 将剧照中的 http:// URL 升级为 https://
 * 避免 HTTPS 页面加载 HTTP 图片时被浏览器阻止（混合内容）
 */
const upgradeStillUrls = (customFields: any): any => {
  if (!customFields) return customFields;

  let parsed: any;
  try {
    parsed = typeof customFields === 'string' ? JSON.parse(customFields) : customFields;
  } catch {
    return customFields;
  }

  if (!parsed || typeof parsed !== 'object') return parsed;
  if (!parsed.stills || !Array.isArray(parsed.stills)) return parsed;

  const upgraded = parsed.stills.map((still: any) => {
    if (typeof still === 'string' && still.startsWith('http://')) {
      return still.replace('http://', 'https://');
    }
    if (typeof still === 'object' && still.url && still.url.startsWith('http://')) {
      return { ...still, url: still.url.replace('http://', 'https://') };
    }
    return still;
  });

  return { ...parsed, stills: upgraded };
};

/**
 * 过滤 custom_fields 中隐藏的剧照 (isHidden === true)
 */
const filterHiddenStillsFromCustomFields = (customFields: any): any => {
  if (!customFields) return null;
  
  // 解析 customFields
  let parsed: any;
  try {
    parsed = typeof customFields === 'string' ? JSON.parse(customFields) : customFields;
  } catch {
    return customFields;
  }
  
  if (!parsed || typeof parsed !== 'object') {
    return parsed;
  }
  
  // 如果没有 stills 数组，直接返回
  if (!parsed.stills || !Array.isArray(parsed.stills)) {
    return parsed;
  }
  
  // Debug: 打印过滤信息
  const originalCount = parsed.stills.length;
  console.log(`[filterHiddenStills-trip] 开始过滤, 剧照数量: ${originalCount}`);
  
  const hiddenStills = parsed.stills.filter((still: any) => still.isHidden === true);
  
  // 过滤掉隐藏的剧照 (isHidden === true)
  const visibleStills = parsed.stills.filter((still: any) => still.isHidden !== true);
  
  console.log(`[filterHiddenStills-trip] 结果: 原始=${originalCount}, 隐藏=${hiddenStills.length}, 可见=${visibleStills.length}`);
  
  return {
    ...parsed,
    stills: visibleStills,
  };
};

const normalizePriority = (value?: string) => {
  if (!value) return undefined;
  const upper = value.toString().toUpperCase();
  if (upper === 'MUST_GO' || upper === 'MUSTGO') return 'MUST_GO';
  if (upper === 'OPTIONAL') return 'OPTIONAL';
  return undefined;
};
