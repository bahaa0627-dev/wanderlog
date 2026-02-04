import { Request, Response } from 'express';
import prisma from '../config/database';

console.log('📦 Loading CollectionRecommendationController...');

class CollectionRecommendationController {
  /**
   * 创建合集推荐
   * Body: { name, collectionIds: string[] }
   */
  async create(req: Request, res: Response) {
    try {
      const { name, collectionIds } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({ success: false, message: '推荐名称必填' });
      }

      if (!Array.isArray(collectionIds) || collectionIds.length === 0) {
        return res.status(400).json({ success: false, message: '至少需要选择一个合集' });
      }

      // 验证所有合集是否存在
      const collections = await prisma.collection.findMany({
        where: { id: { in: collectionIds } },
        select: { id: true },
      });

      if (collections.length !== collectionIds.length) {
        return res.status(400).json({ success: false, message: '部分合集ID无效' });
      }

      // 获取当前最大的sortOrder值，新推荐放在最后
      const maxOrder = await prisma.collectionRecommendation.aggregate({
        _max: { sortOrder: true },
      });
      const newOrder = (maxOrder._max.sortOrder ?? -1) + 1;

      // 创建推荐
      const recommendation = await prisma.collectionRecommendation.create({
        data: {
          name: name.trim(),
          sortOrder: newOrder,
          items: {
            create: collectionIds.map((collectionId, index) => ({
              collectionId,
              sortOrder: index,
            })),
          },
        },
        include: {
          items: {
            include: {
              collection: {
                select: {
                  id: true,
                  name: true,
                  coverImage: true,
                  description: true,
                  isPublished: true,
                },
              },
            },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });

      return res.status(201).json({ success: true, data: recommendation });
    } catch (error: any) {
      console.error('创建合集推荐错误:', error);
      return res.status(500).json({ success: false, message: error.message || '创建失败' });
    }
  }

  /**
   * 获取合集推荐列表
   */
  async list(req: Request, res: Response) {
    try {
      console.log('📋 CollectionRecommendationController.list called');
      
      // 第一步：只查询推荐基本信息（快速）
      const recommendations = await prisma.collectionRecommendation.findMany({
        select: {
          id: true,
          name: true,
          sortOrder: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { sortOrder: 'asc' },
      });

      const recommendationIds = recommendations.map(r => r.id);

      // 第二步：并行加载关联数据
      const [itemCounts, items] = await Promise.all([
        // 获取每个推荐的项目数量
        prisma.collectionRecommendationItem.groupBy({
          by: ['recommendationId'],
          where: { recommendationId: { in: recommendationIds } },
          _count: true,
        }),
        // 获取所有推荐项目及其合集信息
        prisma.collectionRecommendationItem.findMany({
          where: { recommendationId: { in: recommendationIds } },
          select: {
            id: true,
            recommendationId: true,
            sortOrder: true,
            collectionId: true,
            collection: {
              select: {
                id: true,
                name: true,
                coverImage: true,
                description: true,
                isPublished: true,
              }
            }
          },
          orderBy: { sortOrder: 'asc' },
        }),
      ]);

      // 获取合集的地点数量
      const collectionIds = [...new Set(items.map(i => i.collectionId))];
      const spotCounts = await prisma.collectionSpot.groupBy({
        by: ['collectionId'],
        where: { collectionId: { in: collectionIds } },
        _count: true,
      });

      // 获取每个合集的地点数据（用于计算主要城市，包含 ratingCount 用于平局处理）
      const collectionSpots = await prisma.collectionSpot.findMany({
        where: { collectionId: { in: collectionIds } },
        include: {
          place: {
            select: {
              city: true,
              country: true,
              ratingCount: true,
            }
          }
        }
      });

      // 计算每个合集的主要城市
      // 规则：
      // 1. 选择地点数量最多的城市
      // 2. 如果有多个城市地点数相同，选择其中评价人数（ratingCount）最多的地点所对应的城市
      const mainCityMap = new Map<string, string>();
      collectionIds.forEach(collectionId => {
        const spots = collectionSpots.filter(s => s.collectionId === collectionId);
        
        // 统计每个城市的地点数量和最高评价数
        const cityStats = new Map<string, { count: number; maxRatingCount: number }>();
        
        spots.forEach(spot => {
          const city = spot.place?.city;
          const ratingCount = spot.place?.ratingCount ?? 0;
          if (city) {
            const existing = cityStats.get(city) || { count: 0, maxRatingCount: 0 };
            cityStats.set(city, {
              count: existing.count + 1,
              maxRatingCount: Math.max(existing.maxRatingCount, ratingCount),
            });
          }
        });

        if (cityStats.size > 0) {
          // 找出地点数量最多的城市（可能有多个）
          let maxCount = 0;
          cityStats.forEach((stats) => {
            if (stats.count > maxCount) {
              maxCount = stats.count;
            }
          });

          // 筛选出所有地点数量等于最大值的城市
          const topCities: { city: string; maxRatingCount: number }[] = [];
          cityStats.forEach((stats, city) => {
            if (stats.count === maxCount) {
              topCities.push({ city, maxRatingCount: stats.maxRatingCount });
            }
          });

          // 如果只有一个城市，直接使用；如果有多个，按最高评价数排序
          if (topCities.length === 1) {
            mainCityMap.set(collectionId, topCities[0].city);
          } else {
            // 平局时，选择评价人数最多的地点所在的城市
            topCities.sort((a, b) => b.maxRatingCount - a.maxRatingCount);
            mainCityMap.set(collectionId, topCities[0].city);
          }
        }
      });

      // 构建查找映射
      const itemCountMap = new Map(itemCounts.map(i => [i.recommendationId, i._count]));
      const spotCountMap = new Map(spotCounts.map(s => [s.collectionId, s._count]));
      const itemsMap = new Map<string, any[]>();
      items.forEach(item => {
        if (!itemsMap.has(item.recommendationId)) {
          itemsMap.set(item.recommendationId, []);
        }
        itemsMap.get(item.recommendationId)!.push({
          ...item,
          collection: {
            ...item.collection,
            spotCount: spotCountMap.get(item.collectionId) || 0,
            mainCity: mainCityMap.get(item.collectionId) || null,
          }
        });
      });

      // 格式化返回数据
      const formatted = recommendations.map(r => ({
        ...r,
        itemCount: itemCountMap.get(r.id) || 0,
        items: itemsMap.get(r.id) || [],
      }));

      console.log(`✅ Found ${recommendations.length} recommendations`);
      return res.json({ success: true, data: formatted });
    } catch (error: any) {
      console.error('获取合集推荐列表错误:', error);
      return res.status(500).json({ success: false, message: error.message || '获取失败' });
    }
  }

  /**
   * 获取合集推荐详情
   * 优化版本：只加载编辑表单所需的基本信息，不加载 collectionSpots 数据
   */
  async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const recommendation = await prisma.collectionRecommendation.findUnique({
        where: { id },
        include: {
          items: {
            include: {
              collection: {
                select: {
                  id: true,
                  name: true,
                  coverImage: true,
                  description: true,
                  isPublished: true,
                },
              },
            },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });

      if (!recommendation) {
        return res.status(404).json({ success: false, message: '推荐不存在' });
      }

      return res.json({ success: true, data: recommendation });
    } catch (error: any) {
      console.error('获取合集推荐详情错误:', error);
      return res.status(500).json({ success: false, message: error.message || '获取失败' });
    }
  }

  /**
   * 更新合集推荐
   * Body: { name?, collectionIds?: string[] }
   */
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, collectionIds } = req.body;

      const recommendation = await prisma.collectionRecommendation.findUnique({
        where: { id },
      });

      if (!recommendation) {
        return res.status(404).json({ success: false, message: '推荐不存在' });
      }

      const updateData: any = {};

      if (name !== undefined) {
        if (!name || !name.trim()) {
          return res.status(400).json({ success: false, message: '推荐名称不能为空' });
        }
        updateData.name = name.trim();
      }

      // 如果提供了collectionIds，更新合集列表
      if (Array.isArray(collectionIds)) {
        if (collectionIds.length === 0) {
          return res.status(400).json({ success: false, message: '至少需要保留一个合集' });
        }

        // 验证所有合集是否存在
        const collections = await prisma.collection.findMany({
          where: { id: { in: collectionIds } },
          select: { id: true },
        });

        if (collections.length !== collectionIds.length) {
          return res.status(400).json({ success: false, message: '部分合集ID无效' });
        }

        // 删除旧的项目并创建新的
        await prisma.collectionRecommendationItem.deleteMany({
          where: { recommendationId: id },
        });

        updateData.items = {
          create: collectionIds.map((collectionId, index) => ({
            collectionId,
            sortOrder: index,
          })),
        };
      }

      const updated = await prisma.collectionRecommendation.update({
        where: { id },
        data: updateData,
        include: {
          items: {
            include: {
              collection: {
                select: {
                  id: true,
                  name: true,
                  coverImage: true,
                  description: true,
                  isPublished: true,
                },
              },
            },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });

      return res.json({ success: true, data: updated });
    } catch (error: any) {
      console.error('更新合集推荐错误:', error);
      return res.status(500).json({ success: false, message: error.message || '更新失败' });
    }
  }

  /**
   * 更新推荐列表顺序
   * Body: { recommendationIds: string[] } - 按新顺序排列的推荐ID数组
   */
  async updateRecommendationsOrder(req: Request, res: Response) {
    try {
      console.log('🟢 updateRecommendationsOrder 函数被调用');
      console.log('🟢 req.body:', JSON.stringify(req.body));
      const { recommendationIds } = req.body;
      console.log('🟢 提取的 recommendationIds:', recommendationIds);

      if (!Array.isArray(recommendationIds) || recommendationIds.length === 0) {
        return res.status(400).json({ success: false, message: 'recommendationIds必填且不能为空' });
      }

      // 验证所有推荐ID是否都存在
      const recommendations = await prisma.collectionRecommendation.findMany({
        where: { id: { in: recommendationIds } },
        select: { id: true, name: true, sortOrder: true },
      });

      console.log('找到的推荐:', recommendations);

      if (recommendations.length !== recommendationIds.length) {
        const foundIds = new Set(recommendations.map((r: any) => r.id));
        const missingIds = recommendationIds.filter((id: string) => !foundIds.has(id));
        console.error('部分推荐ID无效:', { 
          requested: recommendationIds.length, 
          found: recommendations.length, 
          missing: missingIds 
        });
        return res.status(400).json({ 
          success: false, 
          message: `部分推荐ID无效或不存在: ${missingIds.slice(0, 3).join(', ')}${missingIds.length > 3 ? '...' : ''}` 
        });
      }

      // 批量更新顺序 - 使用事务确保原子性
      console.log('开始更新推荐顺序:', recommendationIds.map((id, idx) => ({ id, sortOrder: idx })));
      
      for (let index = 0; index < recommendationIds.length; index++) {
        const recommendationId = recommendationIds[index];
        try {
          const before = await prisma.collectionRecommendation.findUnique({
            where: { id: recommendationId },
            select: { id: true, name: true, sortOrder: true },
          });
          console.log(`更新前 - 推荐 ${recommendationId}:`, before);

          const result = await prisma.collectionRecommendation.update({
            where: { id: recommendationId },
            data: { sortOrder: index },
          });
          
          console.log(`✅ 更新成功 - 推荐 ${recommendationId} (${result.name}) 的sortOrder从 ${before?.sortOrder} 更新为 ${index}`);
        } catch (error: any) {
          // 如果推荐不存在，记录详细错误
          if (error.code === 'P2025') {
            console.error(`❌ 推荐不存在: ${recommendationId}`);
            throw new Error(`推荐不存在: ${recommendationId}`);
          }
          console.error(`❌ 更新推荐 ${recommendationId} 失败:`, error);
          throw error;
        }
      }
      
      console.log('✅ 所有推荐顺序已更新完成');

      // 返回更新后的列表
      const updated = await prisma.collectionRecommendation.findMany({
        include: {
          items: {
            include: {
              collection: {
                select: {
                  id: true,
                  name: true,
                  coverImage: true,
                  description: true,
                  isPublished: true,
                },
              },
            },
            orderBy: { sortOrder: 'asc' },
          },
        },
        orderBy: { sortOrder: 'asc' },
      });

      return res.json({ success: true, data: updated });
    } catch (error: any) {
      console.error('更新推荐顺序错误:', error);
      return res.status(500).json({ success: false, message: error.message || '更新失败' });
    }
  }

  /**
   * 更新合集顺序（推荐内的合集顺序）
   * Body: { collectionIds: string[] } - 按新顺序排列的合集ID数组
   */
  async updateOrder(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { collectionIds } = req.body;

      if (!Array.isArray(collectionIds) || collectionIds.length === 0) {
        return res.status(400).json({ success: false, message: 'collectionIds必填且不能为空' });
      }

      const recommendation = await prisma.collectionRecommendation.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!recommendation) {
        return res.status(404).json({ success: false, message: '推荐不存在' });
      }

      // 验证所有合集ID是否都存在
      const existingItemIds = new Set(recommendation.items.map((item) => item.collectionId));
      const providedIds = new Set(collectionIds);

      if (existingItemIds.size !== providedIds.size || ![...providedIds].every((id) => existingItemIds.has(id))) {
        return res.status(400).json({ success: false, message: '合集ID列表不匹配' });
      }

      // 批量更新顺序
      await Promise.all(
        collectionIds.map((collectionId, index) =>
          prisma.collectionRecommendationItem.updateMany({
            where: {
              recommendationId: id,
              collectionId,
            },
            data: {
              sortOrder: index,
            },
          })
        )
      );

      // 返回更新后的数据
      const updated = await prisma.collectionRecommendation.findUnique({
        where: { id },
        include: {
          items: {
            include: {
              collection: {
                include: {
                  collectionSpots: {
                    include: {
                      place: true,
                    },
                  },
                },
              },
            },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });

      return res.json({ success: true, data: updated });
    } catch (error: any) {
      console.error('更新合集顺序错误:', error);
      return res.status(500).json({ success: false, message: error.message || '更新失败' });
    }
  }

  /**
   * 删除合集推荐
   */
  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const recommendation = await prisma.collectionRecommendation.findUnique({
        where: { id },
      });

      if (!recommendation) {
        return res.status(404).json({ success: false, message: '推荐不存在' });
      }

      await prisma.collectionRecommendation.delete({
        where: { id },
      });

      return res.json({ success: true, message: '删除成功' });
    } catch (error: any) {
      console.error('删除合集推荐错误:', error);
      return res.status(500).json({ success: false, message: error.message || '删除失败' });
    }
  }

  /**
   * 搜索合集（用于编辑页面的模糊搜索）
   * Query: { q: string }
   */
  async searchCollections(req: Request, res: Response) {
    try {
      const { q } = req.query;

      if (!q || typeof q !== 'string') {
        return res.status(400).json({ success: false, message: '搜索关键词必填' });
      }

      const searchTerm = q.trim();
      
      // 获取所有合集，然后在内存中过滤（因为 SQLite 的 contains 是大小写敏感的）
      // 移除数量限制，确保能搜索到所有合集（包括新增的）
      const allCollections = await prisma.collection.findMany({
        select: {
          id: true,
          name: true,
          coverImage: true,
          description: true,
          isPublished: true,
        },
        orderBy: { createdAt: 'desc' },
        // 移除 take 限制，确保能搜索到所有合集
      });

      // 在内存中进行大小写不敏感的模糊搜索
      const searchLower = searchTerm.toLowerCase();
      const filteredCollections = allCollections
        .filter((c) => c.name.toLowerCase().includes(searchLower))
        .slice(0, 20); // 限制返回20个结果
      
      console.log(`🔍 搜索合集: "${searchTerm}", 找到 ${filteredCollections.length} 个结果`);

      return res.json({ success: true, data: filteredCollections });
    } catch (error: any) {
      console.error('搜索合集错误:', error);
      return res.status(500).json({ success: false, message: error.message || '搜索失败' });
    }
  }
}

const controller = new CollectionRecommendationController();
console.log('✅ CollectionRecommendationController loaded successfully');
export default controller;

