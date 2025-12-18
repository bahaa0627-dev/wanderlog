import { Request, Response } from 'express';
import prisma from '../config/database';
import { logger } from '../utils/logger';
import googleMapsService from '../services/googleMapsService';

/**
 * 批量导入 Google Maps 地点
 * POST /api/places/import
 * Body: { placeIds: string[] }
 */
export const importSpots = async (req: Request, res: Response) => {
  try {
    const { placeIds } = req.body;

    if (!Array.isArray(placeIds) || placeIds.length === 0) {
      return res.status(400).json({ message: 'placeIds array is required' });
    }

    logger.info(`Starting import of ${placeIds.length} places`);
    const result = await googleMapsService.importSpots(placeIds);

    return res.json({
      message: 'Import completed',
      ...result,
    });
  } catch (error) {
    logger.error('Import Places error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * 导入单个地点
 * POST /api/places/import-one
 * Body: { placeId: string }
 */
export const importSpot = async (req: Request, res: Response) => {
  try {
    const { placeId } = req.body;

    if (!placeId) {
      return res.status(400).json({ message: 'placeId is required' });
    }

    const placeData = await googleMapsService.getPlaceDetails(placeId);

    if (!placeData) {
      return res.status(404).json({ message: 'Place not found' });
    }

    // 重复检查：按 googlePlaceId
    const existing = await prisma.place.findUnique({
      where: { googlePlaceId: placeData.googlePlaceId },
    });
    if (existing) {
      return res.json({
        message: 'Place already exists',
        place: existing,
        isDuplicate: true,
      });
    }

    const place = await prisma.place.create({
      data: {
        googlePlaceId: placeData.googlePlaceId,
        name: placeData.name,
        city: placeData.city,
        country: placeData.country,
        latitude: placeData.latitude,
        longitude: placeData.longitude,
        address: placeData.address,
        description: placeData.description,
        openingHours: placeData.openingHours,
        rating: placeData.rating,
        ratingCount: placeData.ratingCount,
        category: placeData.category,
        tags: placeData.tags,
        coverImage: placeData.coverImage,
        images: placeData.images,
        priceLevel: placeData.priceLevel,
        website: placeData.website,
        phoneNumber: placeData.phoneNumber,
        source: 'user_import',
        lastSyncedAt: new Date(),
      },
    });

    return res.json({
      message: 'Place imported successfully',
      place,
      isDuplicate: false,
    });
  } catch (error) {
    logger.error('Import Place error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * 获取地点列表（支持筛选）
 * GET /api/places
 * Query params: city, category, tags, search, lat, lng, radius, limit
 */
export const getPlaces = async (req: Request, res: Response) => {
  try {
    const {
      city,
      category,
      tags,
      search,
      lat,
      lng,
      radius = '5000',
      limit = '30',
    } = req.query;

    const where: any = {};

    if (city) {
      where.city = String(city);
    }

    if (category) {
      where.category = String(category);
    }

    if (tags) {
      const tagArray = String(tags).split(',');
      where.tags = {
        contains: tagArray[0],
      };
    }

    if (search) {
      where.OR = [
        { name: { contains: String(search) } },
        { address: { contains: String(search) } },
        { description: { contains: String(search) } },
      ];
    }

    // 经纬度筛选（简易边界框）
    if (lat && lng) {
      const latitude = parseFloat(String(lat));
      const longitude = parseFloat(String(lng));
      const radiusNum = parseInt(String(radius));

      const latDelta = radiusNum / 111000;
      const lngDelta =
        radiusNum / (111000 * Math.cos(latitude * Math.PI / 180));

      where.latitude = {
        gte: latitude - latDelta,
        lte: latitude + latDelta,
      };
      where.longitude = {
        gte: longitude - lngDelta,
        lte: longitude + lngDelta,
      };
    }

    const places = await prisma.place.findMany({
      where,
      take: parseInt(String(limit)),
      orderBy: { rating: 'desc' },
    });

    return res.json({ count: places.length, places });
  } catch (error) {
    logger.error('Get Places error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * 根据 ID 获取地点详情
 * GET /api/places/:id
 */
export const getPlaceById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const place = await prisma.place.findUnique({ where: { id } });
    if (!place) {
      return res.status(404).json({ message: 'Place not found' });
    }
    // 解析 JSON 字段，前端期望数组而不是字符串
    const normalizedPlace = {
      ...place,
      tags: place.tags ? JSON.parse(place.tags) : [],
      images: place.images ? JSON.parse(place.images) : [],
    };
    return res.json(normalizedPlace);
  } catch (error) {
    logger.error('Get Place error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * 获取城市中心的默认地点（30个）
 * GET /api/places/city-center/:city
 */
export const getCityCenterPlaces = async (req: Request, res: Response) => {
  try {
    const { city } = req.params;

    const cityCoordinates: { [key: string]: { lat: number; lng: number } } = {
      copenhagen: { lat: 55.6761, lng: 12.5683 },
      porto: { lat: 41.1579, lng: -8.6291 },
      paris: { lat: 48.8566, lng: 2.3522 },
      tokyo: { lat: 35.6762, lng: 139.6503 },
      barcelona: { lat: 41.3874, lng: 2.1686 },
      amsterdam: { lat: 52.3676, lng: 4.9041 },
    };

    const coords = cityCoordinates[city.toLowerCase()];
    if (!coords) {
      return res.status(404).json({ message: 'City not found' });
    }

    const places = await prisma.place.findMany({
      where: {
        city,
      },
      orderBy: [
        { rating: 'desc' },
        { ratingCount: 'desc' },
      ],
      take: 30,
    });

    return res.json({ city, center: coords, count: places.length, places });
  } catch (error) {
    logger.error('Get City Center Places error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * 从 publicPlace ID 获取或创建 Place
 * POST /api/places/from-public-place
 * Body: { publicPlaceId: string }
 */
export const getOrCreatePlaceFromPublicPlace = async (req: Request, res: Response) => {
  try {
    const { publicPlaceId } = req.body;

    if (!publicPlaceId) {
      return res.status(400).json({ message: 'publicPlaceId is required' });
    }

    const publicPlace = await prisma.place.findUnique({
      where: { id: publicPlaceId },
    });

    if (!publicPlace) {
      return res.status(404).json({ message: 'PublicPlace not found' });
    }

    if (publicPlace.placeId) {
      const existingPlace = await prisma.place.findFirst({
        where: { googlePlaceId: publicPlace.placeId },
        select: { id: true, name: true, city: true, address: true },
      });

      if (existingPlace) {
        return res.json({
          success: true,
          place: existingPlace,
        });
      }
    }

    const placeData: any = {
      googlePlaceId: publicPlace.placeId || null,
      name: publicPlace.name || 'Unnamed Place',
      city: publicPlace.city || 'Unknown',
      country: publicPlace.country || 'Unknown',
      latitude: publicPlace.latitude,
      longitude: publicPlace.longitude,
      source: 'public_place_import',
      lastSyncedAt: new Date(),
    };

    if (publicPlace.address) placeData.address = publicPlace.address;
    if (publicPlace.category) placeData.category = publicPlace.category;
    if (publicPlace.rating != null) placeData.rating = publicPlace.rating;
    if (publicPlace.ratingCount != null) placeData.ratingCount = publicPlace.ratingCount;
    if (publicPlace.priceLevel != null) placeData.priceLevel = publicPlace.priceLevel;
    if (publicPlace.coverImage) placeData.coverImage = publicPlace.coverImage;
    if (publicPlace.images) placeData.images = publicPlace.images;
    if (publicPlace.website) placeData.website = publicPlace.website;
    if (publicPlace.phoneNumber) placeData.phoneNumber = publicPlace.phoneNumber;
    if (publicPlace.openingHours) placeData.openingHours = publicPlace.openingHours;
    if (publicPlace.aiTags) placeData.aiTags = publicPlace.aiTags;
    if (publicPlace.aiSummary) placeData.aiSummary = publicPlace.aiSummary;
    if (publicPlace.aiDescription) placeData.aiDescription = publicPlace.aiDescription;

    const newPlace = await prisma.place.create({
      data: placeData,
      select: { id: true, name: true, city: true, address: true },
    });

    return res.json({
      success: true,
      place: newPlace,
    });
  } catch (error) {
    logger.error('Get or create Place from PublicPlace error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * 批量从 publicPlace IDs 获取或创建 Place 列表
 * POST /api/places/from-public-places
 * Body: { publicPlaceIds: string[] }
 */
export const getOrCreatePlacesFromPublicPlaces = async (req: Request, res: Response) => {
  try {
    const { publicPlaceIds } = req.body;

    if (!Array.isArray(publicPlaceIds) || publicPlaceIds.length === 0) {
      return res.status(400).json({ message: 'publicPlaceIds array is required' });
    }

    const results = [];

    for (const id of publicPlaceIds) {
      const publicPlace = await prisma.place.findUnique({ where: { id } });
      if (!publicPlace) {
        results.push({ id, error: 'PublicPlace not found' });
        continue;
      }

      // googlePlaceId 查重
      if (publicPlace.placeId) {
        const existing = await prisma.place.findFirst({
          where: { googlePlaceId: publicPlace.placeId },
          select: { id: true, name: true, city: true, address: true },
        });
        if (existing) {
          results.push({ id: existing.id, place: existing });
          continue;
        }
      }

      const placeData: any = {
        googlePlaceId: publicPlace.placeId || null,
        name: publicPlace.name || 'Unnamed Place',
        city: publicPlace.city || 'Unknown',
        country: publicPlace.country || 'Unknown',
        latitude: publicPlace.latitude,
        longitude: publicPlace.longitude,
        source: 'public_place_import',
        lastSyncedAt: new Date(),
      };

      if (publicPlace.address) placeData.address = publicPlace.address;
      if (publicPlace.category) placeData.category = publicPlace.category;
      if (publicPlace.rating != null) placeData.rating = publicPlace.rating;
      if (publicPlace.ratingCount != null) placeData.ratingCount = publicPlace.ratingCount;
      if (publicPlace.priceLevel != null) placeData.priceLevel = publicPlace.priceLevel;
      if (publicPlace.coverImage) placeData.coverImage = publicPlace.coverImage;
      if (publicPlace.images) placeData.images = publicPlace.images;
      if (publicPlace.website) placeData.website = publicPlace.website;
      if (publicPlace.phoneNumber) placeData.phoneNumber = publicPlace.phoneNumber;
      if (publicPlace.openingHours) placeData.openingHours = publicPlace.openingHours;
      if (publicPlace.aiTags) placeData.aiTags = publicPlace.aiTags;
      if (publicPlace.aiSummary) placeData.aiSummary = publicPlace.aiSummary;
      if (publicPlace.aiDescription) placeData.aiDescription = publicPlace.aiDescription;

      const newPlace = await prisma.place.create({
        data: placeData,
        select: { id: true, name: true, city: true, address: true },
      });

      results.push({ id: newPlace.id, place: newPlace });
    }

    return res.json({
      success: true,
      results,
    });
  } catch (error) {
    logger.error('Get or create Places from PublicPlaces error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * 同步地点数据（按需实现）
 * POST /api/places/sync
 */
export const syncPlaceData = async (_req: Request, res: Response) => {
  try {
    // TODO: 实现同步逻辑
    return res.json({ message: 'Sync not implemented yet' });
  } catch (error) {
    logger.error('Sync Place error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

