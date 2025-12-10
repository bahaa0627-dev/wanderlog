import { Request, Response } from 'express';
import prisma from '../config/database';
import { logger } from '../utils/logger';

export const importSpot = async (req: Request, res: Response) => {
  // TODO: Integrate with Google Places API
  // For now, this is a stub that creates a mock spot or returns an existing one
  try {
    const { googlePlaceId, name, latitude, longitude, address, category } = req.body;

    // Check if exists
    let spot = await prisma.spot.findUnique({
      where: { googlePlaceId },
    });

    if (!spot) {
      spot = await prisma.spot.create({
        data: {
          googlePlaceId,
          name,
          latitude,
          longitude,
          address,
          category,
          tags: JSON.stringify([]),
          openingHours: JSON.stringify({}),
          images: JSON.stringify([]),
        },
      });
    }

    res.json(spot);
  } catch (error) {
    logger.error('Import Spot error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getSpots = async (req: Request, res: Response) => {
  try {
    const { city, category } = req.query;
    
    // Build filter
    const where: any = {};
    if (category) {
      where.category = String(category);
    }
    // Note: City filtering is tricky without a "city" field on Spot or spatial search.
    // For now, we assume frontend filters or we add a basic string match on address
    if (city) {
        where.address = {
            contains: String(city),
            mode: 'insensitive'
        };
    }

    const spots = await prisma.spot.findMany({
      where,
      take: 50,
    });
    res.json(spots);
  } catch (error) {
    logger.error('Get Spots error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getSpotById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const spot = await prisma.spot.findUnique({
      where: { id },
    });
    if (!spot) {
      return res.status(404).json({ message: 'Spot not found' });
    }
    res.json(spot);
  } catch (error) {
    logger.error('Get Spot error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};


