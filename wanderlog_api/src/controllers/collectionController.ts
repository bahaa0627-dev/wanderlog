import { Request, Response } from 'express';
import prisma from '../config/database';

class CollectionController {
  /**
   * 创建合集（管理后台）
   * Body: { name, coverImage, description?, people?, works?, spotIds: string[] }
   */
  async create(req: Request, res: Response) {
    try {
      const { name, coverImage, description, people, works, spotIds, placeQueries } = req.body;

      if (!name || !coverImage) {
        return res.status(400).json({ success: false, message: 'name and coverImage are required' });
      }

      const inputSpotIds: string[] = Array.isArray(spotIds) ? spotIds.filter(Boolean) : [];
      const inputPlaceQueries: any[] = Array.isArray(placeQueries) ? placeQueries : [];

      // Resolve placeQueries to spotIds (fuzzy by name, or nearby lat/lng)
      const resolvedSpotIds: string[] = [...inputSpotIds];

      for (const q of inputPlaceQueries) {
        if (!q) continue;
        const { name: qName, lat, lng } = q as { name?: string; lat?: number; lng?: number };

        let foundId: string | null = null;

        if (qName && typeof qName === 'string') {
          const spot = await prisma.spot.findFirst({
            where: {
              name: { contains: qName, mode: 'insensitive' },
            },
            orderBy: { rating: 'desc' },
            select: { id: true },
          });
          if (spot) foundId = spot.id;
        }

        if (!foundId && typeof lat === 'number' && typeof lng === 'number') {
          const delta = 0.01; // ~1km
          const spot = await prisma.spot.findFirst({
            where: {
              latitude: { gte: lat - delta, lte: lat + delta },
              longitude: { gte: lng - delta, lte: lng + delta },
            },
            orderBy: { rating: 'desc' },
            select: { id: true },
          });
          if (spot) foundId = spot.id;
        }

        if (foundId) {
          resolvedSpotIds.push(foundId);
        }
      }

      // dedupe
      const uniqueSpotIds = Array.from(new Set(resolvedSpotIds));

      if (uniqueSpotIds.length === 0) {
        return res.status(400).json({ success: false, message: 'No valid spots found (spotIds or placeQueries required)' });
      }

      const spots = await prisma.spot.findMany({
        where: { id: { in: uniqueSpotIds } },
        select: { id: true, city: true },
      });

      const missing = uniqueSpotIds.filter(id => !spots.some(s => s.id === id));
      if (missing.length > 0) {
        return res.status(400).json({ success: false, message: `Invalid spotIds: ${missing.join(',')}` });
      }

      const collection = await prisma.collection.create({
        data: {
          name,
          coverImage,
          description,
          people,
          works,
          collectionSpots: {
            create: spots.map(s => ({
              spotId: s.id,
              city: s.city ?? undefined,
            })),
          },
        },
        include: {
          collectionSpots: true,
        },
      });

      return res.status(201).json({ success: true, data: collection });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * 获取合集列表
   */
  async list(req: Request, res: Response) {
    try {
      const collections = await prisma.collection.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          collectionSpots: {
            include: {
              spot: true,
            },
          },
        },
      });

      const normalized = collections.map((c) => ({
        ...c,
        people: c.people ? JSON.parse(c.people) : [],
        works: c.works ? JSON.parse(c.works) : [],
        collectionSpots: c.collectionSpots.map((cs) => ({
          ...cs,
          spot: cs.spot
            ? {
                ...cs.spot,
                tags: cs.spot.tags ? JSON.parse(cs.spot.tags) : [],
                images: cs.spot.images ? JSON.parse(cs.spot.images) : [],
              }
            : null,
        })),
      }));

      return res.json({ success: true, data: normalized });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * 获取合集详情
   */
  async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const collection = await prisma.collection.findUnique({
        where: { id },
        include: {
          collectionSpots: {
            include: { spot: true },
          },
        },
      });

      if (!collection) {
        return res.status(404).json({ success: false, message: 'Collection not found' });
      }

      return res.json({ success: true, data: collection });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * 收藏合集
   */
  async favorite(req: Request, res: Response) {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      await prisma.userCollection.upsert({
        where: { userId_collectionId: { userId, collectionId: id } },
        update: {},
        create: {
          userId,
          collectionId: id,
        },
      });

      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * 取消收藏合集
   */
  async unfavorite(req: Request, res: Response) {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      await prisma.userCollection.delete({
        where: { userId_collectionId: { userId, collectionId: id } },
      });

      return res.json({ success: true });
    } catch (error: any) {
      if (error.code === 'P2025') {
        return res.json({ success: true });
      }
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}

export default new CollectionController();

