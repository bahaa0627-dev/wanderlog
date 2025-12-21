import { Request, Response } from 'express';
import prisma from '../config/database';
import { logger } from '../utils/logger';

export const createTrip = async (req: Request, res: Response) => {
  // prisma client typed as any here to be resilient to schema drift in local dev
  const prismaAny = prisma as any;
  try {
    const { name, city, startDate, endDate } = req.body;
    const userId = req.user.id;

    const trip = await prismaAny.trip.create({
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
  const prismaAny = prisma as any;
  try {
    const userId = req.user.id;
    const trips = await prismaAny.trip.findMany({
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
  const prismaAny = prisma as any;
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const trip = await prismaAny.trip.findUnique({
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
      (trip.tripSpots as any[]).map(async (ts: any) => {
        const placeId = (ts as any).placeId ?? (ts as any).spotId;
        const dbPlace = placeId
          ? await prismaAny.place.findUnique({ where: { id: placeId } })
          : null;
        const normalizedPlace = dbPlace
          ? (() => {
              const parsedTags: string[] = (() => {
                if (dbPlace.tags) {
                  try {
                    const value = JSON.parse(dbPlace.tags);
                    return Array.isArray(value) ? value : [];
                  } catch (_) {
                    return [];
                  }
                }
                return [];
              })();

              // 补充 AI 生成的标签作为兜底
              const parsedAiTags: string[] = (() => {
                if (dbPlace.aiTags) {
                  try {
                    const value = JSON.parse(dbPlace.aiTags);
                    return Array.isArray(value) ? value : [];
                  } catch (_) {
                    return [];
                  }
                }
                return [];
              })();

              const mergedTags =
                parsedTags.length > 0 ? parsedTags : parsedAiTags;

              return {
                ...dbPlace,
                tags: mergedTags,
                images: dbPlace.images ? JSON.parse(dbPlace.images) : [],
                openingHours: dbPlace.openingHours
                  ? JSON.parse(dbPlace.openingHours)
                  : undefined,
              };
            })()
          : null;

        return {
          ...ts,
          spotId: placeId,
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
    const trip = await prismaAny.trip.findUnique({
      where: { id },
    });

    if (!trip || trip.userId !== userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // 删除收藏/计划
    if (remove === true) {
      await prismaAny.tripSpot.deleteMany({
        where: {
          tripId: id,
          placeId: targetPlaceId,
        },
      });
      return res.json({ success: true, removed: true, spotId: targetPlaceId });
    }

    // Ensure place exists (allow creating on the fly if payload provided)
    const existingPlace = await prismaAny.place.findUnique({ where: { id: targetPlaceId } });
    if (!existingPlace) {
      if (!spot || !spot.name || !spot.city || spot.latitude === undefined || spot.longitude === undefined) {
        return res.status(400).json({ message: 'Place not found and insufficient data to create' });
      }
      const now = new Date().toISOString();
      // 使用原生 SQL 创建，确保时间戳格式正确
      await prismaAny.$executeRaw`
        INSERT INTO Place (id, name, city, country, latitude, longitude, address, description, openingHours, rating, ratingCount, category, aiSummary, tags, coverImage, images, priceLevel, website, phoneNumber, source, createdAt, updatedAt)
        VALUES (${targetPlaceId}, ${spot.name}, ${spot.city}, ${spot.country ?? 'Unknown'}, ${spot.latitude}, ${spot.longitude}, ${spot.address || null}, ${spot.description || null}, ${spot.openingHours || null}, ${spot.rating || null}, ${spot.ratingCount || null}, ${spot.category || null}, ${spot.aiSummary || null}, ${spot.tags != null ? JSON.stringify(spot.tags) : null}, ${spot.coverImage || null}, ${spot.images != null ? JSON.stringify(spot.images) : null}, ${spot.priceLevel || null}, ${spot.website || null}, ${spot.phoneNumber || null}, ${spot.source ?? 'user_import'}, ${now}, ${now})
      `;
    }

    // Upsert TripSpot (placeId)
    // 检查是否已存在记录
    const existing = await prismaAny.tripSpot.findFirst({
      where: {
        tripId: id,
        placeId: targetPlaceId,
      },
    });

    let tripSpot;
    const now = new Date().toISOString();
    const { createId } = await import('@paralleldrive/cuid2');
    
    if (existing) {
      // 更新已存在的记录 - 使用原生 SQL
      const visitDateStr = visitDate ? new Date(visitDate).toISOString() : null;
      await prismaAny.$executeRaw`
        UPDATE TripSpot SET 
          status = COALESCE(${status}, status),
          priority = COALESCE(${normalizedPriority}, priority),
          visitDate = ${visitDateStr},
          userRating = COALESCE(${userRating}, userRating),
          userNotes = COALESCE(${userNotes}, userNotes),
          updatedAt = ${now}
        WHERE tripId = ${id} AND placeId = ${targetPlaceId}
      `;
      // 重新加载记录
      const results = await prismaAny.$queryRaw`SELECT * FROM TripSpot WHERE tripId = ${id} AND placeId = ${targetPlaceId} LIMIT 1`;
      tripSpot = results[0];
    } else {
      // 创建新记录 - 使用原生 SQL
      const tripSpotId = createId();
      const visitDateStr = visitDate ? new Date(visitDate).toISOString() : null;
      await prismaAny.$executeRaw`
        INSERT INTO TripSpot (id, tripId, placeId, status, priority, visitDate, userRating, userNotes, createdAt, updatedAt)
        VALUES (${tripSpotId}, ${id}, ${targetPlaceId}, ${status || 'WISHLIST'}, ${normalizedPriority || 'OPTIONAL'}, ${visitDateStr}, ${userRating || null}, ${userNotes || null}, ${now}, ${now})
      `;
      const results = await prismaAny.$queryRaw`SELECT * FROM TripSpot WHERE id = ${tripSpotId}`;
      tripSpot = results[0];
    }

    // Load place for payload
    const dbPlace = await prismaAny.place.findUnique({ where: { id: targetPlaceId } });
    const normalizedPlace = dbPlace
      ? (() => {
          // 解析 tags，若为空则回落到 aiTags
          const parsedTags: string[] = (() => {
            if (dbPlace.tags) {
              try {
                const val = JSON.parse(dbPlace.tags);
                return Array.isArray(val) ? val : [];
              } catch (_) {
                return [];
              }
            }
            return [];
          })();
          const parsedAiTags: string[] = (() => {
            if (dbPlace.aiTags) {
              try {
                const val = JSON.parse(dbPlace.aiTags);
                return Array.isArray(val) ? val : [];
              } catch (_) {
                return [];
              }
            }
            return [];
          })();
          const mergedTags = parsedTags.length > 0 ? parsedTags : parsedAiTags;
          return {
            ...dbPlace,
            tags: mergedTags,
            images: dbPlace.images ? JSON.parse(dbPlace.images) : [],
            openingHours: dbPlace.openingHours
              ? JSON.parse(dbPlace.openingHours)
              : undefined,
          };
        })()
      : null;

    const normalizedTripSpot = tripSpot
      ? {
      ...tripSpot,
        spotId: (tripSpot as any).placeId, // 前端期望 spotId
        priority: normalizePriority(tripSpot.priority) || tripSpot.priority,
        userPhotos: tripSpot.userPhotos
          ? JSON.parse(tripSpot.userPhotos as unknown as string)
          : [],
        place: normalizedPlace,
        spot: normalizedPlace, // 前端也可能使用 spot 而不是 place
      }
      : null;

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




