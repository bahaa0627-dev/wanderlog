import { Request, Response } from 'express';
import prisma from '../config/database';

/**
 * Safely parse JSON-like fields that may already be objects/arrays or invalid JSON strings.
 * Falls back to the provided default value instead of throwing.
 */
const safeParseJson = <T>(value: any, fallback: T): T => {
  if (value === null || value === undefined) return fallback;
  if (Array.isArray(value)) return value as unknown as T;
  if (typeof value === 'object') return value as T;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch (e) {
      console.warn('Failed to parse JSON field, returning fallback:', e);
      return fallback;
    }
  }
  return fallback;
};

const normalizePlace = (place: any) =>
  place
    ? {
        ...place,
        tags: safeParseJson(place.tags, []),
        images: safeParseJson(place.images, []),
      }
    : null;

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

      const inputPlaceIds: string[] = Array.isArray(spotIds) ? spotIds.filter(Boolean) : [];
      const inputPlaceQueries: any[] = Array.isArray(placeQueries) ? placeQueries : [];

      const resolvedPlaceIds = new Set<string>(inputPlaceIds);

      // Resolve placeQueries against Place table (by name or nearby lat/lng)
      for (const q of inputPlaceQueries) {
        if (!q) continue;
        const { name: qName, lat, lng } = q as { name?: string; lat?: number; lng?: number };

        let foundId: string | null = null;

        if (qName && typeof qName === 'string') {
          const place = await prisma.place.findFirst({
            where: {
              name: { contains: qName },
            },
            orderBy: { rating: 'desc' },
            select: { id: true },
          });
          if (place) foundId = place.id;
        }

        if (!foundId && typeof lat === 'number' && typeof lng === 'number') {
          const delta = 0.01; // ~1km
          const place = await prisma.place.findFirst({
            where: {
              latitude: { gte: lat - delta, lte: lat + delta },
              longitude: { gte: lng - delta, lte: lng + delta },
            },
            orderBy: { rating: 'desc' },
            select: { id: true },
          });
          if (place) foundId = place.id;
        }

        if (foundId) {
          resolvedPlaceIds.add(foundId);
        }
      }

      const uniquePlaceIds = Array.from(resolvedPlaceIds);

      if (uniquePlaceIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: '无法找到有效的地点。请确认已选择的地点存在于系统中。',
        });
      }

      const places = await prisma.place.findMany({
        where: { id: { in: uniquePlaceIds } },
        select: { id: true, city: true, tags: true, images: true },
      });

      const missing = uniquePlaceIds.filter((id) => !places.some((s) => s.id === id));
      if (missing.length > 0) {
        return res.status(400).json({
          success: false,
          message: `部分地点ID无效: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '...' : ''}。请刷新页面后重试。`,
        });
      }

      const collection = await prisma.collection.create({
        data: {
          name,
          coverImage,
          description,
          people: people ? JSON.stringify(people) : undefined,
          works: works ? JSON.stringify(works) : undefined,
          collectionSpots: {
            create: places.map((p) => ({
              placeId: p.id,
              city: p.city ?? undefined,
            })),
          },
          isPublished: false,
        },
        include: {
          collectionSpots: {
            include: {
              place: true,
            },
          },
        },
      });

      const normalized = {
        ...collection,
        people: collection.people ? JSON.parse(collection.people) : [],
        works: collection.works ? JSON.parse(collection.works) : [],
        collectionSpots: collection.collectionSpots.map((cs) => ({
          ...cs,
          place: cs.place
            ? {
                ...cs.place,
                tags: cs.place.tags ? JSON.parse(cs.place.tags) : [],
                images: cs.place.images ? JSON.parse(cs.place.images) : [],
              }
            : null,
        })),
      };

      return res.status(201).json({ success: true, data: normalized });
    } catch (error: any) {
      console.error('创建合集错误:', error);
      const errorMessage = error?.message || (typeof error === 'string' ? error : 'Unknown error');
      return res.status(500).json({ success: false, message: errorMessage });
    }
  }

  /**
   * 获取合集列表
   */
  async list(req: Request, res: Response) {
    try {
      const includeAll = req.query.includeAll === 'true' || req.query.all === 'true';
      const userId = (req as any).user?.id;

      // 如果用户已登录且不是查看全部，则只返回用户收藏的合集
      let whereClause: any = {};
      if (!includeAll) {
        if (userId) {
          // 返回用户收藏的合集（无论是否发布，用户收藏了就应该能在 MyLand 看到）
          whereClause = {
            userCollections: {
              some: {
                userId: userId,
              },
            },
          };
        } else {
          // 未登录用户只看到已发布的合集（但不包括收藏关系）
          whereClause = { isPublished: true };
        }
      }

      const includeConfig: any = {
        collectionSpots: {
          include: {
            place: true,
          },
        },
      };

      if (userId) {
        includeConfig.userCollections = {
          where: { userId },
          select: { id: true },
        };
      }

      const collections = await prisma.collection.findMany({
        where: includeAll ? undefined : whereClause,
        orderBy: { createdAt: 'desc' },
        include: includeConfig,
      });

      const normalized = (collections as any[]).map((c) => ({
        ...c,
        isFavorited: !!(userId && c.userCollections && c.userCollections.length > 0),
        people: safeParseJson(c.people, []),
        works: safeParseJson(c.works, []),
        collectionSpots: (c.collectionSpots as any[]).map((cs: any) => {
          const place = normalizePlace(cs.place);
          return {
            ...cs,
            place,
            // 兼容前端旧字段：把 place 映射为 spot/spotId，避免前端解析失败
            spotId: cs.placeId,
            spot: place,
          };
        }),
      }));
      // 移除 userCollections，避免返回多余字段
      normalized.forEach((item: any) => delete item.userCollections);

      return res.json({ success: true, data: normalized });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * 更新合集（仅未上线状态可编辑）
   */
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, coverImage, description, people, works, spotIds } = req.body;

      const collection = await prisma.collection.findUnique({
        where: { id },
        include: { collectionSpots: true },
      });

      if (!collection) {
        return res.status(404).json({ success: false, message: 'Collection not found' });
      }

      if (collection.isPublished) {
        return res.status(400).json({ success: false, message: 'Collection is published and cannot be edited. Please unpublish first.' });
      }

      const inputPlaceIds: string[] = Array.isArray(spotIds) ? spotIds.filter(Boolean) : [];
      if (inputPlaceIds.length === 0) {
        return res.status(400).json({ success: false, message: 'spotIds is required and must contain at least one item' });
      }

      const places = await prisma.place.findMany({
        where: { id: { in: inputPlaceIds } },
        select: { id: true, city: true },
      });

      const missing = inputPlaceIds.filter(id => !places.some(s => s.id === id));
      if (missing.length > 0) {
        return res.status(400).json({ success: false, message: `Invalid spotIds: ${missing.join(',')}` });
      }

      const normalizedPeople = people ? JSON.stringify(people) : undefined;
      const normalizedWorks = works ? JSON.stringify(works) : undefined;

      const updated = await prisma.collection.update({
        where: { id },
        data: {
          name,
          coverImage,
          description,
          people: normalizedPeople,
          works: normalizedWorks,
          collectionSpots: {
            deleteMany: {}, // remove old links
            create: places.map((p) => ({
              placeId: p.id,
              city: p.city ?? undefined,
            })),
          },
        },
        include: {
          collectionSpots: {
            include: {
              place: true,
            },
          },
        },
      });

      return res.json({ success: true, data: updated });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * 上线合集
   */
  async publish(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const collection = await prisma.collection.findUnique({ where: { id } });
      if (!collection) return res.status(404).json({ success: false, message: 'Collection not found' });

      await prisma.collection.update({
        where: { id },
        data: { isPublished: true, publishedAt: new Date() },
      });

      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * 下线合集
   */
  async unpublish(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const collection = await prisma.collection.findUnique({ where: { id } });
      if (!collection) return res.status(404).json({ success: false, message: 'Collection not found' });

      await prisma.collection.update({
        where: { id },
        data: { isPublished: false },
      });

      return res.json({ success: true });
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
      const userId = (req as any).user?.id;

      const collection = await prisma.collection.findUnique({
        where: { id },
        include: {
          collectionSpots: {
            include: {
              place: true,
            },
          },
          ...(userId
            ? {
                userCollections: {
                  where: { userId },
                  select: { id: true },
                },
              }
            : {}),
        },
      });

      if (!collection) {
        return res.status(404).json({ success: false, message: 'Collection not found' });
      }

      // 检查是否已收藏
      const userCollections = (collection as any).userCollections || [];
      const isFavorited = userId && userCollections.length > 0;

      // 规范化数据格式，与 list 方法保持一致
      const normalized = {
        ...collection,
        isFavorited: !!isFavorited,
        people: safeParseJson(collection.people, []),
        works: safeParseJson(collection.works, []),
        collectionSpots: collection.collectionSpots.map((cs) => {
          const place = normalizePlace(cs.place);
          return {
            ...cs,
            place,
            spotId: cs.placeId,
            spot: place,
          };
        }),
      };

      // 移除 userCollections 字段，因为已经提取到 isFavorited
      delete (normalized as any).userCollections;

      return res.json({ success: true, data: normalized });
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

      return res.json({ isFavorited: true });
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

      return res.json({ isFavorited: false });
    } catch (error: any) {
      if (error.code === 'P2025') {
        return res.json({ isFavorited: false });
      }
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}

export default new CollectionController();

