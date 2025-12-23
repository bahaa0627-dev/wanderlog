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
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
    visitDate: row.visit_date,
    userRating: row.user_rating,
    userNotes: row.user_notes,
    userPhotos: row.user_photos || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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

    // Get trip
    const trips = await prismaAny.$queryRaw`
      SELECT * FROM trips WHERE id = ${id}::uuid LIMIT 1
    `;

    if (!trips || trips.length === 0) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    const trip = trips[0];
    if (trip.user_id !== userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Get trip spots
    const tripSpots = await prismaAny.$queryRaw`
      SELECT * FROM trip_spots 
      WHERE trip_id = ${id}::uuid
      ORDER BY created_at DESC
    `;

    // Load places for each trip spot
    const normalizedTripSpots = await Promise.all(
      (tripSpots as any[]).map(async (ts: any) => {
        const placeId = ts.place_id;
        const dbPlace = placeId
          ? await prismaAny.place.findUnique({ where: { id: placeId } })
          : null;
        
        const normalizedPlace = dbPlace ? normalizePlace(dbPlace) : null;
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

    // Ensure place exists
    const existingPlace = await prismaAny.place.findUnique({ where: { id: targetPlaceId } });
    if (!existingPlace) {
      if (!spot || !spot.name || !spot.city || spot.latitude === undefined || spot.longitude === undefined) {
        return res.status(400).json({ message: 'Place not found and insufficient data to create' });
      }
      // Create place using Prisma (places table uses Prisma schema)
      await prismaAny.place.create({
        data: {
          id: targetPlaceId,
          name: spot.name,
          city: spot.city,
          country: spot.country ?? 'Unknown',
          latitude: spot.latitude,
          longitude: spot.longitude,
          address: spot.address || null,
          description: spot.description || null,
          openingHours: spot.openingHours || null,
          rating: spot.rating || null,
          ratingCount: spot.ratingCount || null,
          category: spot.category || null,
          aiSummary: spot.aiSummary || null,
          tags: spot.tags ? JSON.stringify(spot.tags) : null,
          coverImage: spot.coverImage || null,
          images: spot.images ? JSON.stringify(spot.images) : null,
          priceLevel: spot.priceLevel || null,
          website: spot.website || null,
          phoneNumber: spot.phoneNumber || null,
          source: spot.source ?? 'user_import',
        },
      });
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

    // Load place for response
    const dbPlace = await prismaAny.place.findUnique({ where: { id: targetPlaceId } });
    const normalizedPlace = dbPlace ? normalizePlace(dbPlace) : null;
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
    latitude: dbPlace.latitude,
    longitude: dbPlace.longitude,
    address: dbPlace.address,
    description: dbPlace.description,
    openingHours: dbPlace.openingHours,
    rating: dbPlace.rating,
    ratingCount: dbPlace.ratingCount,
    category: dbPlace.category,
    aiSummary: dbPlace.aiSummary,
    aiDescription: dbPlace.aiDescription,
    tags: mergedTags,
    aiTags: parsedAiTags,
    coverImage: dbPlace.coverImage,
    images: parsedImages,
    priceLevel: dbPlace.priceLevel,
    website: dbPlace.website,
    phoneNumber: dbPlace.phoneNumber,
    googlePlaceId: dbPlace.googlePlaceId,
    source: dbPlace.source,
  };
};

const normalizePriority = (value?: string) => {
  if (!value) return undefined;
  const upper = value.toString().toUpperCase();
  if (upper === 'MUST_GO' || upper === 'MUSTGO') return 'MUST_GO';
  if (upper === 'OPTIONAL') return 'OPTIONAL';
  return undefined;
};
