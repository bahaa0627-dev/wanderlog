import { Request, Response } from 'express';
import prisma from '../config/database';
import { logger } from '../utils/logger';

export const createTrip = async (req: Request, res: Response) => {
  try {
    const { name, city, startDate, endDate } = req.body;
    const userId = req.user.id;

    const trip = await prisma.trip.create({
      data: {
        userId,
        name,
        city,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        status: 'PLANNING',
      },
    });

    return res.status(201).json(trip);
  } catch (error) {
    logger.error('Create Trip error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getMyTrips = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const trips = await prisma.trip.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: { tripSpots: true },
        },
      },
    });
    return res.json(trips);
  } catch (error) {
    logger.error('Get Trips error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getTripById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const trip = await prisma.trip.findUnique({
      where: { id },
      include: {
        tripSpots: {
          orderBy: {
            createdAt: 'desc', // 新添加的地点出现在最前面
          },
        },
      },
    });

    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    if (trip.userId !== userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const normalizedTripSpots = await Promise.all(
      trip.tripSpots.map(async (ts) => {
        const dbPlace = await prisma.place.findUnique({ where: { id: ts.placeId } });
        const normalizedPlace = dbPlace
          ? {
              ...dbPlace,
              tags: dbPlace.tags ? JSON.parse(dbPlace.tags) : [],
              images: dbPlace.images ? JSON.parse(dbPlace.images) : [],
            }
          : null;

        return {
          ...ts,
          spotId: ts.placeId,
          userPhotos: ts.userPhotos ? JSON.parse(ts.userPhotos as unknown as string) : [],
          place: normalizedPlace,
          spot: normalizedPlace, // 前端 TripSpot.spot 期望地点数据
        };
      }),
    );

    return res.json({
      ...trip,
      tripSpots: normalizedTripSpots,
    });
  } catch (error) {
    logger.error('Get Trip error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const manageTripSpot = async (req: Request, res: Response) => {
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
    const trip = await prisma.trip.findUnique({
      where: { id },
    });

    if (!trip || trip.userId !== userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // 删除收藏/计划
    if (remove === true) {
      await prisma.tripSpot.deleteMany({
        where: {
          tripId: id,
          placeId: targetPlaceId,
        },
      });
      return res.json({ success: true, removed: true, spotId: targetPlaceId });
    }

    // Ensure place exists (allow creating on the fly if payload provided)
    const existingPlace = await prisma.place.findUnique({ where: { id: targetPlaceId } });
    if (!existingPlace) {
      if (!spot || !spot.name || !spot.city || spot.latitude === undefined || spot.longitude === undefined) {
        return res.status(400).json({ message: 'Place not found and insufficient data to create' });
      }
      await prisma.place.create({
        data: {
          id: targetPlaceId,
          name: spot.name,
          city: spot.city,
          country: spot.country ?? 'Unknown',
          latitude: spot.latitude,
          longitude: spot.longitude,
          address: spot.address,
          description: spot.description,
          openingHours: spot.openingHours,
          rating: spot.rating,
          ratingCount: spot.ratingCount,
          category: spot.category,
          aiSummary: spot.aiSummary,
          tags: spot.tags != null ? JSON.stringify(spot.tags) : undefined,
          coverImage: spot.coverImage,
          images: spot.images != null ? JSON.stringify(spot.images) : undefined,
          priceLevel: spot.priceLevel,
          website: spot.website,
          phoneNumber: spot.phoneNumber,
          source: spot.source ?? 'user_import',
        },
      });
    }

    // Upsert TripSpot (placeId)
    // 检查是否已存在记录
    const existing = await prisma.tripSpot.findUnique({
      where: {
        tripId_placeId: {
          tripId: id,
          placeId: targetPlaceId,
        },
      },
    });

    let tripSpot;
    if (existing) {
      // 更新已存在的记录
      tripSpot = await prisma.tripSpot.update({
        where: {
          tripId_placeId: {
            tripId: id,
            placeId: targetPlaceId,
          },
        },
        data: {
          status,
          priority: normalizedPriority,
          visitDate: visitDate ? new Date(visitDate) : undefined,
          userRating,
          userNotes,
        },
      });
    } else {
      // 创建新记录 - 使用 $executeRaw 以避免 Prisma DateTime 问题
      const newId = `cmj${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      const nowIso = new Date().toISOString();
      await prisma.$executeRaw`
        INSERT INTO TripSpot (id, tripId, placeId, status, priority, visitDate, createdAt, updatedAt)
        VALUES (${newId}, ${id}, ${targetPlaceId}, ${status || 'WISHLIST'}, ${normalizedPriority || 'OPTIONAL'}, ${visitDate || null}, ${nowIso}, ${nowIso})
      `;
      tripSpot = await prisma.tripSpot.findUnique({
        where: { tripId_placeId: { tripId: id, placeId: targetPlaceId } },
      });
    }

    // Load place for payload
    const dbPlace = await prisma.place.findUnique({ where: { id: targetPlaceId } });
    const normalizedPlace = dbPlace
      ? {
          ...dbPlace,
          tags: dbPlace.tags ? JSON.parse(dbPlace.tags) : [],
          images: dbPlace.images ? JSON.parse(dbPlace.images) : [],
        }
      : null;

    const normalizedTripSpot = {
      ...tripSpot,
      spotId: tripSpot.placeId, // 前端期望 spotId
      priority: normalizePriority(tripSpot.priority) || tripSpot.priority,
      userPhotos: tripSpot.userPhotos
        ? JSON.parse(tripSpot.userPhotos as unknown as string)
        : [],
      place: normalizedPlace,
      spot: normalizedPlace, // 前端也可能使用 spot 而不是 place
    };

    return res.json(normalizedTripSpot);
  } catch (error) {
    logger.error('Manage TripSpot error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

const normalizePriority = (value?: string) => {
  if (!value) return undefined;
  const upper = value.toString().toUpperCase();
  if (upper === 'MUST_GO' || upper === 'MUSTGO') return 'MUST_GO';
  if (upper === 'OPTIONAL') return 'OPTIONAL';
  return undefined;
};




