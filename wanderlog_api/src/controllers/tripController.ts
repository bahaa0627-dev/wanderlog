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

    res.status(201).json(trip);
  } catch (error) {
    logger.error('Create Trip error:', error);
    res.status(500).json({ message: 'Server error' });
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
    res.json(trips);
  } catch (error) {
    logger.error('Get Trips error:', error);
    res.status(500).json({ message: 'Server error' });
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
          include: {
            spot: true,
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

    res.json(trip);
  } catch (error) {
    logger.error('Get Trip error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const manageTripSpot = async (req: Request, res: Response) => {
  try {
    const { id } = req.params; // Trip ID
    const { spotId, status, priority, visitDate, userRating, userNotes, spot } = req.body;
    const userId = req.user.id;

    // Verify trip ownership
    const trip = await prisma.trip.findUnique({
      where: { id },
    });

    if (!trip || trip.userId !== userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Ensure spot exists (allow creating on the fly if payload provided)
    const existingSpot = await prisma.spot.findUnique({ where: { id: spotId } });
    if (!existingSpot) {
      if (!spot || !spot.name || !spot.city || spot.latitude === undefined || spot.longitude === undefined) {
        return res.status(400).json({ message: 'Spot not found and insufficient data to create' });
      }
      await prisma.spot.create({
        data: {
          id: spotId,
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

    // Upsert TripSpot
    const tripSpot = await prisma.tripSpot.upsert({
      where: {
        tripId_spotId: {
          tripId: id,
          spotId,
        },
      },
      update: {
        status,
        priority,
        visitDate: visitDate ? new Date(visitDate) : undefined,
        userRating,
        userNotes,
      },
      create: {
        tripId: id,
        spotId,
        status: status || 'WISHLIST',
        priority: priority || 'OPTIONAL',
        visitDate: visitDate ? new Date(visitDate) : null,
      },
    });

    // Load spot for payload
    const dbSpot = await prisma.spot.findUnique({ where: { id: spotId } });
    const normalizedSpot = dbSpot
      ? {
          ...dbSpot,
          tags: dbSpot.tags ? JSON.parse(dbSpot.tags) : [],
          images: dbSpot.images ? JSON.parse(dbSpot.images) : [],
        }
      : null;

    const normalizedTripSpot = {
      ...tripSpot,
      userPhotos: tripSpot.userPhotos
        ? JSON.parse(tripSpot.userPhotos as unknown as string)
        : [],
      spot: normalizedSpot,
    };

    res.json(normalizedTripSpot);
  } catch (error) {
    logger.error('Manage TripSpot error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};




