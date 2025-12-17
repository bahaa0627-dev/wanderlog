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
      const resolvedSpotIds: string[] = [];

      // First, try to resolve inputSpotIds (could be spot ids or publicPlace ids)
      const unresolvedIds: string[] = [];
      
      for (const id of inputSpotIds) {
        // Try as spot id first
        const spot = await prisma.spot.findUnique({
          where: { id },
          select: { id: true },
        });
        if (spot) {
          resolvedSpotIds.push(spot.id);
          continue;
        }

        // Try as publicPlace id, then find or create corresponding spot
        const publicPlace = await prisma.publicPlace.findUnique({
          where: { id },
        });
        
        if (publicPlace) {
          // First, try to find existing spot by googlePlaceId
          let spotByPlaceId = await prisma.spot.findFirst({
            where: { googlePlaceId: publicPlace.placeId },
            select: { id: true },
          });
          
          if (spotByPlaceId) {
            resolvedSpotIds.push(spotByPlaceId.id);
            continue;
          }
          
          // If no spot found, create one from publicPlace
          try {
            // Check if googlePlaceId already exists (might be from a different spot)
            if (publicPlace.placeId) {
              const existingSpotWithPlaceId = await prisma.spot.findFirst({
                where: { googlePlaceId: publicPlace.placeId },
                select: { id: true },
              });
              if (existingSpotWithPlaceId) {
                console.log(`✅ Found existing spot ${existingSpotWithPlaceId.id} for placeId ${publicPlace.placeId}`);
                resolvedSpotIds.push(existingSpotWithPlaceId.id);
                continue;
              }
            }
            
            // Prepare spot data, ensuring all required fields are present
            const spotData: any = {
                googlePlaceId: publicPlace.placeId || null,
                name: publicPlace.name || 'Unnamed Place',
                city: publicPlace.city || 'Unknown',
                country: publicPlace.country || 'Unknown',
                latitude: publicPlace.latitude,
                longitude: publicPlace.longitude,
                source: 'public_place_import',
                lastSyncedAt: new Date(),
            };
            
            // Add optional fields only if they exist
            if (publicPlace.address) spotData.address = publicPlace.address;
            if (publicPlace.category) spotData.category = publicPlace.category;
            if (publicPlace.rating !== null && publicPlace.rating !== undefined) spotData.rating = publicPlace.rating;
            if (publicPlace.ratingCount !== null && publicPlace.ratingCount !== undefined) spotData.ratingCount = publicPlace.ratingCount;
            if (publicPlace.priceLevel !== null && publicPlace.priceLevel !== undefined) spotData.priceLevel = publicPlace.priceLevel;
            if (publicPlace.coverImage) spotData.coverImage = publicPlace.coverImage;
            if (publicPlace.images) {
                // images in publicPlace is already a JSON string, use it directly
                spotData.images = publicPlace.images;
            }
            if (publicPlace.website) spotData.website = publicPlace.website;
            if (publicPlace.phoneNumber) spotData.phoneNumber = publicPlace.phoneNumber;
            if (publicPlace.openingHours) {
                // openingHours in publicPlace is already a JSON string, use it directly
                spotData.openingHours = publicPlace.openingHours;
            }
            
            const newSpot = await prisma.spot.create({
              data: spotData,
              select: { id: true },
            });
            console.log(`✅ Created spot ${newSpot.id} from publicPlace ${id} (${publicPlace.name})`);
            resolvedSpotIds.push(newSpot.id);
            continue;
          } catch (createError: any) {
            console.error(`❌ Failed to create spot from publicPlace ${id} (${publicPlace.name}):`, {
              error: createError.message,
              code: createError.code,
              meta: createError.meta,
            });
            unresolvedIds.push(id);
          }
        } else {
          // Not a spot id and not a publicPlace id
          unresolvedIds.push(id);
        }
      }
      
      // Log unresolved IDs for debugging
      if (unresolvedIds.length > 0) {
        console.error(`⚠️  Unresolved IDs (${unresolvedIds.length}):`, unresolvedIds);
        // Try to get more info about these IDs
        for (const id of unresolvedIds.slice(0, 3)) {
          const testPublicPlace = await prisma.publicPlace.findUnique({
            where: { id },
            select: { id: true, name: true, placeId: true },
          });
          if (testPublicPlace) {
            console.log(`  - ${id}: Found publicPlace "${testPublicPlace.name}" (placeId: ${testPublicPlace.placeId})`);
          } else {
            console.log(`  - ${id}: Not found in publicPlace table`);
          }
        }
      }

      // Resolve placeQueries
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
        console.error('无法解析任何spotIds:', { 
          inputSpotIds, 
          inputPlaceQueries,
          unresolvedIds 
        });
        const errorMsg = unresolvedIds.length > 0 
          ? `无法找到有效的地点。以下ID无法解析: ${unresolvedIds.slice(0, 5).join(', ')}${unresolvedIds.length > 5 ? '...' : ''}。请确保选择的地点存在于系统中。`
          : '无法找到有效的地点。请确保选择的地点存在于系统中，或者地点ID格式正确。';
        return res.status(400).json({ 
          success: false, 
          message: errorMsg 
        });
      }

      const spots = await prisma.spot.findMany({
        where: { id: { in: uniqueSpotIds } },
        select: { id: true, city: true },
      });

      const missing = uniqueSpotIds.filter(id => !spots.some(s => s.id === id));
      if (missing.length > 0) {
        console.error('部分spotIds无效:', missing);
        return res.status(400).json({ 
          success: false, 
          message: `部分地点ID无效: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '...' : ''}。请刷新页面后重试。` 
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
            create: spots.map(s => ({
              spotId: s.id,
              city: s.city ?? undefined,
            })),
          },
          isPublished: false,
        },
        include: {
          collectionSpots: true,
        },
      });

      return res.status(201).json({ success: true, data: collection });
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
          // 只返回用户收藏的已发布合集
          whereClause = {
            isPublished: true,
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

      const collections = await prisma.collection.findMany({
        where: includeAll ? undefined : whereClause,
        orderBy: { createdAt: 'desc' },
        include: {
          collectionSpots: {
            include: {
              spot: true,
            },
          },
          userCollections: userId
            ? {
                where: { userId },
                select: { id: true },
              }
            : false,
        },
      });

      const normalized = collections.map((c) => ({
        ...c,
        isFavorited: !!(userId && (c as any).userCollections && (c as any).userCollections.length > 0),
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

      const inputSpotIds: string[] = Array.isArray(spotIds) ? spotIds.filter(Boolean) : [];
      if (inputSpotIds.length === 0) {
        return res.status(400).json({ success: false, message: 'spotIds is required and must contain at least one item' });
      }

      const spots = await prisma.spot.findMany({
        where: { id: { in: inputSpotIds } },
        select: { id: true, city: true },
      });

      const missing = inputSpotIds.filter(id => !spots.some(s => s.id === id));
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
            create: spots.map(s => ({
              spotId: s.id,
              city: s.city ?? undefined,
            })),
          },
        },
        include: {
          collectionSpots: {
            include: { spot: true },
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
            include: { spot: true },
          },
          userCollections: userId
            ? {
                where: { userId },
                select: { id: true },
              }
            : false,
        },
      });

      if (!collection) {
        return res.status(404).json({ success: false, message: 'Collection not found' });
      }

      // 检查是否已收藏
      const isFavorited = userId && collection.userCollections && (collection.userCollections as any[]).length > 0;

      // 规范化数据格式，与 list 方法保持一致
      const normalized = {
        ...collection,
        isFavorited: !!isFavorited,
        people: collection.people ? JSON.parse(collection.people) : [],
        works: collection.works ? JSON.parse(collection.works) : [],
        collectionSpots: collection.collectionSpots.map((cs) => ({
          ...cs,
          spot: cs.spot
            ? {
                ...cs.spot,
                tags: cs.spot.tags ? (typeof cs.spot.tags === 'string' ? JSON.parse(cs.spot.tags) : cs.spot.tags) : [],
                images: cs.spot.images ? (typeof cs.spot.images === 'string' ? JSON.parse(cs.spot.images) : cs.spot.images) : [],
              }
            : null,
        })),
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

