import { Request, Response } from 'express';
import prisma from '../config/database';
import { logger } from '../utils/logger';

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

      // 使用 Prisma ORM 创建合集
      const collection = await prisma.collection.create({
        data: {
          name,
          coverImage,
          description: description || null,
          people: people || null,
          works: works || null,
          isPublished: false,
          collectionSpots: {
            create: places.map((place) => ({
              placeId: place.id,
              city: place.city ?? undefined,
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

      const normalized = {
        ...collection,
        people: safeParseJson(collection.people, []),
        works: safeParseJson(collection.works, []),
        collectionSpots: collection.collectionSpots.map((cs) => ({
          ...cs,
          place: normalizePlace(cs.place),
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
      let userId = (req as any).user?.id;

      console.log('[Collections.list] includeAll:', includeAll);
      console.log('[Collections.list] userId from req.user:', userId);

      // 验证 userId 是否为有效的 UUID 格式
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (userId && !uuidRegex.test(userId)) {
        console.warn('Invalid userId format, ignoring:', userId);
        userId = undefined;
      }

      // 如果用户已登录且不是查看全部，则只返回用户收藏的合集
      let whereClause: any = {};
      if (!includeAll) {
        if (userId) {
          // 返回用户收藏的合集（无论是否发布，用户收藏了就应该能在 MyLand 看到）
          console.log('[Collections.list] Filtering by user favorites for userId:', userId);
          whereClause = {
            userCollectionFavorites: {
              some: {
                userId: userId,
              },
            },
          };
        } else {
          // 未登录用户在 MyLand 页面（includeAll=false）应该看到空列表
          // 这样可以提示用户登录后才能看到收藏的合集
          console.log('[Collections.list] No userId and includeAll=false, returning empty array for MyLand');
          return res.json({ success: true, data: [] });
        }
      } else {
        // includeAll=true 时返回所有已发布的合集（用于 explore 页面）
        console.log('[Collections.list] includeAll=true, returning all published collections');
        whereClause = { isPublished: true };
      }

      // 优化查询：分两步加载，先加载基本信息，再并行加载关联数据
      // 第一步：只查询合集基本信息（快速）
      const collections = await prisma.collection.findMany({
        where: includeAll ? undefined : whereClause,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          coverImage: true,
          description: true,
          people: true,
          works: true,
          source: true,
          sortOrder: true,
          isPublished: true,
          publishedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      // 第二步：并行加载关联数据
      const collectionIds = collections.map(c => c.id);
      
      const [spotCounts, collectionSpots, userFavorites] = await Promise.all([
        // 获取每个合集的地点数量
        prisma.collectionSpot.groupBy({
          by: ['collectionId'],
          where: { collectionId: { in: collectionIds } },
          _count: true,
        }),
        // 获取每个合集的前5个地点（简化查询）
        prisma.collectionSpot.findMany({
          where: { collectionId: { in: collectionIds } },
          select: {
            id: true,
            collectionId: true,
            placeId: true,
            city: true,
            sortOrder: true,
            place: {
              select: {
                id: true,
                name: true,
                city: true,
                country: true,
                latitude: true,
                longitude: true,
                coverImage: true,
                rating: true,
                category: true,
              }
            }
          },
          orderBy: { sortOrder: 'asc' },
        }),
        // 获取用户收藏状态
        userId ? prisma.userCollectionFavorite.findMany({
          where: { userId, collectionId: { in: collectionIds } },
          select: { collectionId: true },
        }) : Promise.resolve([]),
      ]);

      // 构建查找映射
      const spotCountMap = new Map(spotCounts.map(s => [s.collectionId, s._count]));
      const spotsMap = new Map<string, any[]>();
      collectionSpots.forEach(cs => {
        if (!spotsMap.has(cs.collectionId)) {
          spotsMap.set(cs.collectionId, []);
        }
        const spots = spotsMap.get(cs.collectionId)!;
        if (spots.length < 10) { // 只保留前10个
          spots.push(cs);
        }
      });
      const favoritedSet = new Set(userFavorites.map(f => f.collectionId));

      const normalized = collections.map((c) => ({
        ...c,
        spotCount: spotCountMap.get(c.id) || 0,
        isFavorited: favoritedSet.has(c.id),
        people: safeParseJson(c.people, []),
        works: safeParseJson(c.works, []),
        collectionSpots: (spotsMap.get(c.id) || []).map((cs: any) => {
          const place = normalizePlace(cs.place);
          return {
            ...cs,
            place,
            spotId: cs.placeId,
            spot: place,
          };
        }),
      }));

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

      // 处理 people 和 works - 即使为空数组也要保存
      const normalizedPeople = people !== undefined ? JSON.stringify(people) : null;
      const normalizedWorks = works !== undefined ? JSON.stringify(works) : null;

      // Use transaction to ensure atomicity
      const updated = await prisma.$transaction(async (tx) => {
        // First, delete all existing collection spots
        await tx.collectionSpot.deleteMany({
          where: { collectionId: id },
        });

        // Then update the collection and create new spots
        return tx.collection.update({
          where: { id },
          data: {
            name,
            coverImage,
            description: description || null,
            people: normalizedPeople,
            works: normalizedWorks,
            collectionSpots: {
              create: places.map((p, index) => ({
                placeId: p.id,
                city: p.city ?? undefined,
                sortOrder: index,
              })),
            },
          },
          include: {
            collectionSpots: {
              include: {
                place: true,
              },
              orderBy: { sortOrder: 'asc' },
            },
          },
        });
      });

      const normalized = {
        ...updated,
        people: safeParseJson(updated.people, []),
        works: safeParseJson(updated.works, []),
        collectionSpots: updated.collectionSpots.map((cs: any) => ({
          ...cs,
          place: normalizePlace(cs.place),
        })),
      };

      return res.json({ success: true, data: normalized });
    } catch (error: any) {
      console.error('更新合集错误:', error);
      const errorMessage = error?.message || (typeof error === 'string' ? error : 'Unknown error');
      return res.status(500).json({ success: false, message: errorMessage });
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
   * 获取推荐合集（已发布的合集）
   */
  async getFeatured(req: Request, res: Response) {
    try {
      let userId = (req as any).user?.id;
      const limit = parseInt(req.query.limit as string) || 10;

      // 验证 userId 是否为有效的 UUID 格式
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (userId && !uuidRegex.test(userId)) {
        console.warn('Invalid userId format in getFeatured, ignoring:', userId);
        userId = undefined;
      }

      const includeConfig: any = {
        collectionSpots: {
          include: {
            place: true,
          },
        },
      };

      if (userId) {
        includeConfig.userCollectionFavorites = {
          where: { userId },
          select: { id: true },
        };
      }

      const collections = await prisma.collection.findMany({
        where: { isPublished: true },
        orderBy: { publishedAt: 'desc' },
        take: limit,
        include: includeConfig,
      });

      const normalized = (collections as any[]).map((c) => ({
        ...c,
        isFavorited: !!(userId && c.userCollectionFavorites && c.userCollectionFavorites.length > 0),
        people: safeParseJson(c.people, []),
        works: safeParseJson(c.works, []),
        collectionSpots: (c.collectionSpots as any[]).map((cs: any) => {
          const place = normalizePlace(cs.place);
          return {
            ...cs,
            place,
            spotId: cs.placeId,
            spot: place,
          };
        }),
      }));

      // 移除 userCollectionFavorites，避免返回多余字段
      normalized.forEach((item: any) => delete item.userCollectionFavorites);

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
      let userId = (req as any).user?.id;

      // 验证 userId 是否为有效的 UUID 格式
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (userId && !uuidRegex.test(userId)) {
        console.warn('Invalid userId format in getById, ignoring:', userId);
        userId = undefined;
      }

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
                userCollectionFavorites: {
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
      const userCollectionFavorites = (collection as any).userCollectionFavorites || [];
      const isFavorited = userId && userCollectionFavorites.length > 0;

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

      // 移除 userCollectionFavorites 字段，因为已经提取到 isFavorited
      delete (normalized as any).userCollectionFavorites;

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

      // 确保用户的 Profile 存在
      await prisma.profile.upsert({
        where: { id: userId },
        update: {},
        create: {
          id: userId,
          name: req.user.email?.split('@')[0] || null,
        },
      });

      await prisma.userCollectionFavorite.upsert({
        where: { userId_collectionId: { userId, collectionId: id } },
        update: {},
        create: {
          userId,
          collectionId: id,
        },
      });

      return res.json({ isFavorited: true });
    } catch (error: any) {
      logger.error('Favorite collection error:', error);
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

      await prisma.userCollectionFavorite.delete({
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

