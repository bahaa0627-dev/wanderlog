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
    // If it's an object (Map), ignore it and use empty array
  }
  
  return {
    id: row.id,
    tripId: row.trip_id,
    placeId: row.place_id,
    spotId: row.place_id, // Frontend expects spotId
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
    
    // Step 1: Get all trips with spot count in a single query
    const trips = await prismaAny.$queryRaw`
      SELECT t.*, 
             COALESCE((SELECT COUNT(*) FROM trip_spots ts WHERE ts.trip_id = t.id), 0) as spot_count
      FROM trips t
      WHERE t.user_id = ${userId}::uuid
      ORDER BY t.updated_at DESC
    `;

    if (!trips || trips.length === 0) {
      return res.json([]);
    }

    // Step 2: Get all trip IDs
    const tripIds = trips.map((t: any) => t.id);
    
    // Step 3: Get all trip_spots for all trips in a single query
    const allTripSpots = await prismaAny.$queryRaw`
      SELECT ts.*, p.*,
             ts.id as trip_spot_id,
             ts.trip_id as ts_trip_id,
             ts.place_id as ts_place_id,
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

    // Step 4: Group trip_spots by trip_id
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
        });
      }
      
      // Extract trip_spot data
      const tripSpotData = tripSpotToCamelCase({
        id: ts.trip_spot_id,
        trip_id: ts.ts_trip_id,
        place_id: ts.ts_place_id,
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

    // Step 5: Build result
    const result = trips.map((t: any) => ({
      ...toCamelCase(t),
      _count: { tripSpots: Number(t.spot_count) || 0 },
      tripSpots: tripSpotsMap.get(t.id) || [],
    }));

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
        });
      }
      
      const tripSpotData = tripSpotToCamelCase({
        id: ts.trip_spot_id,
        trip_id: ts.ts_trip_id,
        place_id: ts.ts_place_id,
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
    const { spotId, placeId, status, priority, visitDate, userRating, userNotes, userPhotos, spot, remove } =
      req.body;
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

    // If targetPlaceId is not a UUID (e.g., it's a place name from AI), we need to create a new place
    let existingPlace = null;
    
    if (isUUID) {
      // Try to find existing place by UUID
      const existingPlaces = await prismaAny.$queryRaw`
        SELECT * FROM places WHERE id = ${targetPlaceId}::uuid LIMIT 1
      `;
      existingPlace = existingPlaces && existingPlaces.length > 0 ? existingPlaces[0] : null;
    }
    
    if (!existingPlace) {
      // Place doesn't exist or targetPlaceId is not a UUID
      // We need spot data to create a new place
      if (!spot || !spot.name || spot.latitude === undefined || spot.longitude === undefined) {
        return res.status(400).json({ message: 'Place not found and insufficient data to create' });
      }
      
      // Generate a new UUID for the place if targetPlaceId is not a valid UUID
      const { randomUUID } = await import('crypto');
      const newPlaceId = isUUID ? targetPlaceId : randomUUID();
      
      // Create place using raw SQL to avoid DateTime issues
      const tagsJson = spot.tags ? JSON.stringify(spot.tags) : '[]';
      const imagesJson = spot.images ? JSON.stringify(spot.images) : '[]';
      
      await prismaAny.$executeRaw`
        INSERT INTO places (id, name, city, country, latitude, longitude, address, description, opening_hours, rating, rating_count, category, ai_summary, tags, cover_image, images, price_level, website, phone_number, source, created_at, updated_at)
        VALUES (
          ${newPlaceId}::uuid, 
          ${spot.name}, 
          ${spot.city || 'Unknown'}, 
          ${spot.country ?? 'Unknown'}, 
          ${spot.latitude}::float, 
          ${spot.longitude}::float, 
          ${spot.address || null}, 
          ${spot.description || null}, 
          ${spot.openingHours || null}, 
          ${spot.rating || null}::float, 
          ${spot.ratingCount || null}::int, 
          ${spot.category || null}, 
          ${spot.aiSummary || null}, 
          ${tagsJson}::jsonb, 
          ${spot.coverImage || null}, 
          ${imagesJson}::jsonb, 
          ${spot.priceLevel || null}::int, 
          ${spot.website || null}, 
          ${spot.phoneNumber || null}, 
          ${spot.source ?? 'ai_search'},
          NOW(),
          NOW()
        )
      `;
      
      // Update targetPlaceId to the new UUID
      targetPlaceId = newPlaceId;
      logger.info(`[manageTripSpot] Created new place with id=${newPlaceId} for "${spot.name}"`);
    }

    // Check if trip spot exists
    const existing = await prismaAny.$queryRaw`
      SELECT * FROM trip_spots WHERE trip_id = ${id}::uuid AND place_id = ${targetPlaceId}::uuid LIMIT 1
    `;

    let tripSpot;
    const visitDateStr = visitDate ? new Date(visitDate).toISOString() : null;
    const userPhotosJson = userPhotos ? JSON.stringify(userPhotos) : null;

    if (existing && existing.length > 0) {
      // Update existing
      if (userPhotosJson) {
        await prismaAny.$executeRaw`
          UPDATE trip_spots SET 
            status = COALESCE(${status}, status),
            priority = COALESCE(${normalizedPriority}, priority),
            visit_date = ${visitDateStr}::timestamp,
            user_rating = COALESCE(${userRating}::int, user_rating),
            user_notes = COALESCE(${userNotes}, user_notes),
            user_photos = ${userPhotosJson}::jsonb,
            updated_at = NOW()
          WHERE trip_id = ${id}::uuid AND place_id = ${targetPlaceId}::uuid
        `;
      } else {
        await prismaAny.$executeRaw`
          UPDATE trip_spots SET 
            status = COALESCE(${status}, status),
            priority = COALESCE(${normalizedPriority}, priority),
            visit_date = ${visitDateStr}::timestamp,
            user_rating = COALESCE(${userRating}::int, user_rating),
            user_notes = COALESCE(${userNotes}, user_notes),
            updated_at = NOW()
          WHERE trip_id = ${id}::uuid AND place_id = ${targetPlaceId}::uuid
        `;
      }
      const results = await prismaAny.$queryRaw`
        SELECT * FROM trip_spots WHERE trip_id = ${id}::uuid AND place_id = ${targetPlaceId}::uuid LIMIT 1
      `;
      tripSpot = results[0];
    } else {
      // Create new
      const results = await prismaAny.$queryRaw`
        INSERT INTO trip_spots (trip_id, place_id, status, priority, visit_date, user_rating, user_notes, user_photos)
        VALUES (${id}::uuid, ${targetPlaceId}::uuid, ${status || 'WISHLIST'}, ${normalizedPriority || 'OPTIONAL'}, ${visitDateStr}::timestamp, ${userRating || null}::int, ${userNotes || null}, ${userPhotosJson}::jsonb)
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
          for (const [key, val] of Object.entries(value)) {
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
    createdAt: dbPlace.created_at ? new Date(dbPlace.created_at).toISOString() : null,
    updatedAt: dbPlace.updated_at ? new Date(dbPlace.updated_at).toISOString() : null,
  };
};

const normalizePriority = (value?: string) => {
  if (!value) return undefined;
  const upper = value.toString().toUpperCase();
  if (upper === 'MUST_GO' || upper === 'MUSTGO') return 'MUST_GO';
  if (upper === 'OPTIONAL') return 'OPTIONAL';
  return undefined;
};
