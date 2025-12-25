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
    userPhotos: row.user_photos || [],
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
    
    const trips = await prismaAny.$queryRaw`
      SELECT t.*, 
             COALESCE((SELECT COUNT(*) FROM trip_spots ts WHERE ts.trip_id = t.id), 0) as spot_count
      FROM trips t
      WHERE t.user_id = ${userId}::uuid
      ORDER BY t.updated_at DESC
    `;

    const result = trips.map((t: any) => ({
      ...toCamelCase(t),
      _count: { tripSpots: Number(t.spot_count) || 0 },
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

    // Get trip spots
    const tripSpots = await prismaAny.$queryRaw`
      SELECT * FROM trip_spots 
      WHERE trip_id = ${id}::uuid
      ORDER BY created_at DESC
    `;
    
    logger.info(`getTripById: found ${tripSpots?.length || 0} trip_spots`);

    // Load places for each trip spot (use raw SQL to avoid DateTime issues)
    const normalizedTripSpots = await Promise.all(
      (tripSpots as any[]).map(async (ts: any) => {
        const placeId = ts.place_id;
        let normalizedPlace = null;
        
        if (placeId) {
          const places = await prismaAny.$queryRaw`
            SELECT * FROM places WHERE id = ${placeId}::uuid LIMIT 1
          `;
          if (places && places.length > 0) {
            normalizedPlace = normalizePlace(places[0]);
          }
        }
        
        const tripSpotData = tripSpotToCamelCase(ts);

        return {
          ...tripSpotData,
          place: normalizedPlace,
          spot: normalizedPlace,
        };
      }),
    );

    return res.json({
      ...toCamelCase(trip),
      tripSpots: normalizedTripSpots,
    });
  } catch (error) {
    logger.error('Get Trip error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const manageTripSpot = async (req: Request, res: Response) => {
  const prismaAny = prisma as any;
  try {
    const { id } = req.params; // Trip ID
    const { spotId, placeId, status, priority, visitDate, userRating, userNotes, spot, remove } =
      req.body;
    const userId = req.user.id;
    const targetPlaceId: string | undefined = placeId || spotId;

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

    // Delete spot if requested
    if (remove === true) {
      await prismaAny.$executeRaw`
        DELETE FROM trip_spots WHERE trip_id = ${id}::uuid AND place_id = ${targetPlaceId}::uuid
      `;
      return res.json({ success: true, removed: true, spotId: targetPlaceId });
    }

    // Ensure place exists (use raw SQL to avoid DateTime conversion issues)
    const existingPlaces = await prismaAny.$queryRaw`
      SELECT * FROM places WHERE id = ${targetPlaceId}::uuid LIMIT 1
    `;
    const existingPlace = existingPlaces && existingPlaces.length > 0 ? existingPlaces[0] : null;
    
    if (!existingPlace) {
      if (!spot || !spot.name || !spot.city || spot.latitude === undefined || spot.longitude === undefined) {
        return res.status(400).json({ message: 'Place not found and insufficient data to create' });
      }
      // Create place using raw SQL to avoid DateTime issues
      const tagsJson = spot.tags ? JSON.stringify(spot.tags) : '[]';
      const imagesJson = spot.images ? JSON.stringify(spot.images) : '[]';
      
      await prismaAny.$executeRaw`
        INSERT INTO places (id, name, city, country, latitude, longitude, address, description, opening_hours, rating, rating_count, category, ai_summary, tags, cover_image, images, price_level, website, phone_number, source, created_at, updated_at)
        VALUES (
          ${targetPlaceId}::uuid, 
          ${spot.name}, 
          ${spot.city}, 
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
          ${spot.source ?? 'user_import'},
          NOW(),
          NOW()
        )
      `;
    }

    // Check if trip spot exists
    const existing = await prismaAny.$queryRaw`
      SELECT * FROM trip_spots WHERE trip_id = ${id}::uuid AND place_id = ${targetPlaceId}::uuid LIMIT 1
    `;

    let tripSpot;
    const visitDateStr = visitDate ? new Date(visitDate).toISOString() : null;

    if (existing && existing.length > 0) {
      // Update existing
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
      const results = await prismaAny.$queryRaw`
        SELECT * FROM trip_spots WHERE trip_id = ${id}::uuid AND place_id = ${targetPlaceId}::uuid LIMIT 1
      `;
      tripSpot = results[0];
    } else {
      // Create new
      const results = await prismaAny.$queryRaw`
        INSERT INTO trip_spots (trip_id, place_id, status, priority, visit_date, user_rating, user_notes)
        VALUES (${id}::uuid, ${targetPlaceId}::uuid, ${status || 'WISHLIST'}, ${normalizedPriority || 'OPTIONAL'}, ${visitDateStr}::timestamp, ${userRating || null}::int, ${userNotes || null})
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
  const parsedTags: string[] = (() => {
    if (dbPlace.tags) {
      try {
        const value = typeof dbPlace.tags === 'string' ? JSON.parse(dbPlace.tags) : dbPlace.tags;
        return Array.isArray(value) ? value : [];
      } catch (_) {
        return [];
      }
    }
    return [];
  })();

  const parsedAiTags: string[] = (() => {
    if (dbPlace.aiTags) {
      try {
        const value = typeof dbPlace.aiTags === 'string' ? JSON.parse(dbPlace.aiTags) : dbPlace.aiTags;
        return Array.isArray(value) ? value : [];
      } catch (_) {
        return [];
      }
    }
    return [];
  })();

  const mergedTags = parsedTags.length > 0 ? parsedTags : parsedAiTags;

  const parsedImages = (() => {
    if (dbPlace.images) {
      try {
        return typeof dbPlace.images === 'string' ? JSON.parse(dbPlace.images) : dbPlace.images;
      } catch (_) {
        return [];
      }
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
    openingHours: dbPlace.openingHours || dbPlace.opening_hours,
    rating: dbPlace.rating != null ? Number(dbPlace.rating) : null,
    ratingCount: dbPlace.ratingCount != null ? Number(dbPlace.ratingCount) : (dbPlace.rating_count != null ? Number(dbPlace.rating_count) : null),
    category: dbPlace.category,
    aiSummary: dbPlace.aiSummary || dbPlace.ai_summary,
    aiDescription: dbPlace.aiDescription || dbPlace.ai_description,
    tags: mergedTags,
    aiTags: parsedAiTags,
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
