import { Request, Response } from 'express';
import prisma from '../config/database';
import { logger } from '../utils/logger';
import googleMapsService from '../services/googleMapsService';

/**
 * 批量导入Google Maps地点
 * POST /api/spots/import
 * Body: { placeIds: string[] }
 */
export const importSpots = async (req: Request, res: Response) => {
  try {
    const { placeIds } = req.body;

    if (!Array.isArray(placeIds) || placeIds.length === 0) {
      return res.status(400).json({ message: 'placeIds array is required' });
    }

    logger.info(`Starting import of ${placeIds.length} spots`);
    const result = await googleMapsService.importSpots(placeIds);

    res.json({
      message: 'Import completed',
      ...result
    });
  } catch (error) {
    logger.error('Import Spots error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * 导入单个地点
 * POST /api/spots/import-one
 * Body: { placeId: string }
 */
export const importSpot = async (req: Request, res: Response) => {
  try {
    const { placeId } = req.body;

    if (!placeId) {
      return res.status(400).json({ message: 'placeId is required' });
    }

    const spotData = await googleMapsService.getPlaceDetails(placeId);
    
    if (!spotData) {
      return res.status(404).json({ message: 'Place not found' });
    }

    // 检查是否重复
    const isDuplicate = await googleMapsService.checkDuplicate(spotData.name, spotData.address || '');
    
    if (isDuplicate) {
      const existing = await prisma.spot.findFirst({
        where: {
          name: spotData.name,
          address: spotData.address
        }
      });
      return res.json({ 
        message: 'Spot already exists', 
        spot: existing,
        isDuplicate: true
      });
    }

    // 创建新地点
    const spot = await prisma.spot.create({
      data: {
        ...spotData,
        source: 'user_import',
        lastSyncedAt: new Date()
      }
    });

    res.json({ 
      message: 'Spot imported successfully', 
      spot,
      isDuplicate: false
    });
  } catch (error) {
    logger.error('Import Spot error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * 获取地点列表（支持筛选）
 * GET /api/spots
 * Query params: city, category, tags, search, lat, lng, radius, limit
 */
export const getSpots = async (req: Request, res: Response) => {
  try {
    const { 
      city, 
      category, 
      tags, 
      search, 
      lat, 
      lng, 
      radius = '5000',
      limit = '30'
    } = req.query;
    
    // 构建查询条件
    const where: any = {};
    
    if (city) {
      where.city = {
        equals: String(city),
        mode: 'insensitive'
      };
    }

    if (category) {
      where.category = {
        equals: String(category),
        mode: 'insensitive'
      };
    }

    if (tags) {
      // tags是JSON string，需要使用JSON查询
      const tagArray = String(tags).split(',');
      where.tags = {
        contains: tagArray[0] // 简化处理，实际应该用JSON查询
      };
    }

    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: 'insensitive' } },
        { address: { contains: String(search), mode: 'insensitive' } },
        { description: { contains: String(search), mode: 'insensitive' } }
      ];
    }

    // 如果提供了经纬度，按距离排序（简化版，实际需要PostGIS或计算距离）
    let spots;
    if (lat && lng) {
      const latitude = parseFloat(String(lat));
      const longitude = parseFloat(String(lng));
      const radiusNum = parseInt(String(radius));
      
      // 简单的边界框查询（实际应该用Haversine公式）
      const latDelta = radiusNum / 111000; // 约111km per degree
      const lngDelta = radiusNum / (111000 * Math.cos(latitude * Math.PI / 180));
      
      where.latitude = {
        gte: latitude - latDelta,
        lte: latitude + latDelta
      };
      where.longitude = {
        gte: longitude - lngDelta,
        lte: longitude + lngDelta
      };
    }

    spots = await prisma.spot.findMany({
      where,
      take: parseInt(String(limit)),
      orderBy: {
        rating: 'desc'
      }
    });

    res.json({
      count: spots.length,
      spots
    });
  } catch (error) {
    logger.error('Get Spots error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * 获取单个地点详情
 * GET /api/spots/:id
 */
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

/**
 * 获取城市中心的默认地点（30个）
 * GET /api/spots/city-center/:city
 */
export const getCityCenterSpots = async (req: Request, res: Response) => {
  try {
    const { city } = req.params;
    
    // 城市中心坐标（可以配置化）
    const cityCoordinates: { [key: string]: { lat: number; lng: number } } = {
      'copenhagen': { lat: 55.6761, lng: 12.5683 },
      'porto': { lat: 41.1579, lng: -8.6291 },
      'paris': { lat: 48.8566, lng: 2.3522 },
      'tokyo': { lat: 35.6762, lng: 139.6503 },
      'barcelona': { lat: 41.3874, lng: 2.1686 },
      'amsterdam': { lat: 52.3676, lng: 4.9041 }
    };

    const coords = cityCoordinates[city.toLowerCase()];
    
    if (!coords) {
      return res.status(404).json({ message: 'City not found' });
    }

    // 获取该城市的top 30个地点
    const spots = await prisma.spot.findMany({
      where: {
        city: {
          equals: city,
          mode: 'insensitive'
        }
      },
      orderBy: [
        { rating: 'desc' },
        { ratingCount: 'desc' }
      ],
      take: 30
    });

    res.json({
      city,
      center: coords,
      count: spots.length,
      spots
    });
  } catch (error) {
    logger.error('Get City Center Spots error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * 更新地点评分数据（定时任务用）
 * POST /api/spots/sync
 */
export const syncSpotData = async (req: Request, res: Response) => {
  try {
    // 获取所有有googlePlaceId的地点
    const spots = await prisma.spot.findMany({
      where: {
        googlePlaceId: {
          not: null
        }
      }
    });

    let updated = 0;
    let errors = 0;

    for (const spot of spots) {
      try {
        if (!spot.googlePlaceId) continue;
        
        const newData = await googleMapsService.getPlaceDetails(spot.googlePlaceId);
        
        if (newData) {
          await prisma.spot.update({
            where: { id: spot.id },
            data: {
              rating: newData.rating,
              ratingCount: newData.ratingCount,
              openingHours: newData.openingHours,
              lastSyncedAt: new Date()
            }
          });
          updated++;
        }
      } catch (error) {
        logger.error(`Error syncing spot ${spot.id}:`, error);
        errors++;
      }
    }

    res.json({
      message: 'Sync completed',
      updated,
      errors
    });
  } catch (error) {
    logger.error('Sync Spot Data error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};





