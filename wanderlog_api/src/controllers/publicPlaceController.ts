import { Request, Response } from 'express';
import publicPlaceService from '../services/publicPlaceService';
import apifyService from '../services/apifyService';
import aiService from '../services/aiService';
import googleMapsFavoritesService from '../services/googleMapsFavoritesService';
import displayTagsService from '../services/displayTagsService';
import { AITagElement } from '../services/aiTagsGeneratorService';
import { ApifyImportService } from '../services/apifyImportService';

// 解析 JSON 字符串字段，确保返回数组
function parseJsonField(value: any): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

// 格式化 category
function formatCategory(category: string | null): string | null {
  if (!category) return category;
  // 首字母大写
  return category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
}

/**
 * 验证并解析 ai_tags 数组
 * 确保返回有效的 AITagElement[] 格式
 * 
 * Requirements: 8.2, 8.5
 */
function parseAiTags(value: any): AITagElement[] {
  if (!value) return [];
  
  const rawArray = parseJsonField(value);
  
  // 过滤并验证每个元素
  return rawArray.filter((element): element is AITagElement => {
    if (typeof element !== 'object' || element === null) {
      return false;
    }
    
    const e = element as Record<string, unknown>;
    
    return (
      typeof e.kind === 'string' &&
      ['facet', 'person', 'architect'].includes(e.kind) &&
      typeof e.id === 'string' &&
      typeof e.en === 'string' &&
      typeof e.zh === 'string' &&
      (typeof e.priority === 'number' || e.priority === undefined)
    );
  });
}

/**
 * 转换 place 对象为 API 响应格式
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 * 
 * - 返回 category_en 和 category_zh 字段
 * - 返回 ai_tags 作为对象数组 {kind, id, en, zh, priority}
 * - 返回计算的 display_tags_en 和 display_tags_zh
 * - 不返回内部 tags 字段给 C 端用户
 */
function transformPlace(place: any): any {
  if (!place) return place;
  const images = parseJsonField(place.images);
  const coverImage = place.coverImage || (images.length > 0 ? images[0] : null);
  
  // 处理分类字段：优先使用 categorySlug/categoryEn，向后兼容 category
  const categorySlug = place.categorySlug || null;
  const categoryEn = place.categoryEn || null;
  const categoryZh = place.categoryZh || null;
  // 如果有 categoryEn 但没有 category，用 categoryEn 填充 category（向后兼容）
  const category = place.category 
    ? formatCategory(place.category) 
    : (categoryEn || null);
  
  // 解析 ai_tags 为对象数组格式 (Requirements: 8.2, 8.5)
  const aiTags = parseAiTags(place.aiTags);
  
  // 计算 display_tags (Requirements: 8.3)
  const { display_tags_en, display_tags_zh } = displayTagsService.computeDisplayTagsBilingual(
    categoryEn,
    categoryZh,
    aiTags
  );
  
  // 构建响应对象，移除内部 tags 字段 (Requirements: 8.4)
  const { tags: _internalTags, ...placeWithoutTags } = place;
  
  return {
    ...placeWithoutTags,
    // 确保 placeId 不为空，优先使用 placeId，其次 googlePlaceId，最后 id
    placeId: place.placeId || place.googlePlaceId || place.id,
    images,
    coverImage,
    // 分类字段 (Requirements: 8.1)
    category,
    categorySlug,
    categoryEn,
    categoryZh,
    // AI Tags 对象数组 (Requirements: 8.2, 8.5)
    aiTags,
    // 计算的展示标签 (Requirements: 8.3)
    display_tags_en,
    display_tags_zh,
  };
}

class PublicPlaceController {
  /**
   * 获取所有公共地点（支持分页和筛选）
   * GET /api/public-places
   */
  async getAllPlaces(req: Request, res: Response): Promise<void> {
    try {
      const { page, limit, city, country, category, source, search, minRating, maxRating, tag, sortBy, sortOrder } = req.query;

      const result = await publicPlaceService.getAllPlaces({
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        city: city as string,
        country: country as string,
        category: category as string,
        source: source as string,
        search: search as string,
        minRating: minRating ? parseFloat(minRating as string) : undefined,
        maxRating: maxRating ? parseFloat(maxRating as string) : undefined,
        tag: tag as string,
        sortBy: sortBy as 'rating' | 'ratingCount' | 'createdAt' | undefined,
        sortOrder: sortOrder as 'asc' | 'desc' | undefined,
      });

      res.json({
        success: true,
        data: result.places.map(transformPlace),
        pagination: result.pagination,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * 根据 place_id 获取地点详情
   * GET /api/public-places/:placeId
   */
  async getPlaceByPlaceId(req: Request, res: Response): Promise<void> {
    try {
      const { placeId } = req.params;
      const place = await publicPlaceService.getPlaceByPlaceId(placeId);

      if (!place) {
        return res.status(404).json({
          success: false,
          error: 'Place not found',
        });
      }

      res.json({
        success: true,
        data: transformPlace(place),
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * 搜索地点
   * GET /api/public-places/search?q=query
   */
  async searchPlaces(req: Request, res: Response): Promise<void> {
    try {
      const { q } = req.query;

      if (!q) {
        return res.status(400).json({
          success: false,
          error: 'Search query is required',
        });
      }

      const places = await publicPlaceService.searchPlaces(q as string);

      res.json({
        success: true,
        data: places.map(transformPlace),
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * 获取城市列表（用于添加 trip）
   * GET /api/public-places/cities?q=query
   */
  async getCities(req: Request, res: Response): Promise<void> {
    try {
      const { q } = req.query;

      const cities = await publicPlaceService.getCities(q as string);

      res.json({
        success: true,
        data: cities,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * 通过 Google Place ID 手动添加地点
   * POST /api/public-places/add-by-place-id
   * Body: { placeId: string }
   */
  async addByPlaceId(req: Request, res: Response): Promise<void> {
    try {
      const { placeId } = req.body;

      if (!placeId) {
        return res.status(400).json({
          success: false,
          error: 'placeId is required',
        });
      }

      const place = await publicPlaceService.addByPlaceId(placeId, 'manual');

      res.json({
        success: true,
        data: place,
        message: 'Place added successfully',
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * 从 Google Maps 收藏链接导入地点
   * POST /api/public-places/import-from-link
   * Body: { url: string, listName?: string, listDescription?: string, useApify?: boolean }
   */
  async importFromGoogleMapsLink(req: Request, res: Response): Promise<void> {
    try {
      const { url, listName, listDescription, useApify } = req.body;

      if (!url) {
        return res.status(400).json({
          success: false,
          error: 'Google Maps URL is required',
        });
      }

      console.log(`📥 Importing from Google Maps link: ${url}`);
      console.log(`🔧 Using Apify: ${useApify !== false ? 'YES' : 'NO'}`);

      let result;

      // 默认使用 Apify（除非明确设置 useApify: false）
      if (useApify !== false) {
        console.log('🕷️ Using Apify scraper...');
        const apifyResult = await apifyService.importFromGoogleMapsLink(url);
        
        result = {
          success: apifyResult.success,
          failed: apifyResult.failed,
          skipped: 0, // Apify 结果中没有 skipped，去重在 batchAddByPlaceIds 中处理
          errors: apifyResult.errors,
          placeIds: [] // Apify 不返回 placeIds
        };
      } else {
        console.log('🔍 Using direct URL parser...');
        result = await googleMapsFavoritesService.importFromLink(url, {
          listName,
          listDescription
        });
      }

      res.json({
        success: true,
        data: result,
        message: `Successfully imported ${result.success} new places. ${result.skipped || 0} places already existed and were skipped.`,
      });
    } catch (error: any) {
      console.error('❌ Error importing from Google Maps link:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * 批量导入 Place IDs
   * POST /api/public-places/import-by-place-ids
   * Body: { placeIds: string[], sourceDetails?: any }
   */
  async importByPlaceIds(req: Request, res: Response): Promise<void> {
    try {
      const { placeIds, sourceDetails } = req.body;

      if (!placeIds || !Array.isArray(placeIds) || placeIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'placeIds array is required and must not be empty',
        });
      }

      console.log(`📥 Importing ${placeIds.length} place IDs...`);

      const result = await googleMapsFavoritesService.importByPlaceIds(
        placeIds,
        sourceDetails
      );

      res.json({
        success: true,
        data: result,
        message: `Successfully imported ${result.success} new places. ${result.skipped} places already existed and were skipped.`,
      });
    } catch (error: any) {
      console.error('❌ Error importing place IDs:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * 从图片识别并导入地点
   * POST /api/public-places/import-from-image
   * Body: { imageUrl: string }
   */
  async importFromImage(req: Request, res: Response): Promise<void> {
    try {
      const { imageUrl } = req.body;

      if (!imageUrl) {
        return res.status(400).json({
          success: false,
          error: 'Image URL is required',
        });
      }

      const place = await aiService.importFromImage(imageUrl);

      res.json({
        success: true,
        data: place,
        message: 'Place identified and imported successfully',
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * 通过对话获取地点推荐并导入
   * POST /api/public-places/import-from-chat
   * Body: { message: string, city?: string, country?: string }
   */
  async importFromChat(req: Request, res: Response): Promise<void> {
    try {
      const { message, city, country } = req.body;

      if (!message) {
        return res.status(400).json({
          success: false,
          error: 'Message is required',
        });
      }

      const result = await aiService.importFromChat(message, { city, country });

      res.json({
        success: true,
        data: result,
        message: `Successfully imported ${result.success} places`,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * 更新地点信息
   * PUT /api/public-places/:placeId
   */
  async updatePlace(req: Request, res: Response): Promise<void> {
    try {
      const { placeId } = req.params;
      const updates = req.body;

      const place = await publicPlaceService.updatePlace(placeId, updates);

      res.json({
        success: true,
        data: place,
        message: 'Place updated successfully',
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * 删除地点
   * DELETE /api/public-places/:placeId
   */
  async deletePlace(req: Request, res: Response): Promise<void> {
    try {
      const { placeId } = req.params;

      await publicPlaceService.deletePlace(placeId);

      res.json({
        success: true,
        message: 'Place deleted successfully',
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * 同步地点的 Google Maps 数据
   * POST /api/public-places/:placeId/sync
   */
  async syncPlace(req: Request, res: Response): Promise<void> {
    try {
      const { placeId } = req.params;

      const place = await publicPlaceService.syncPlaceFromGoogle(placeId);

      res.json({
        success: true,
        data: place,
        message: 'Place synced successfully',
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * 为地点生成 AI 标签和描述
   * POST /api/public-places/:placeId/generate-tags
   */
  async generateTags(req: Request, res: Response): Promise<void> {
    try {
      const { placeId } = req.params;

      // 获取地点信息
      const place = await publicPlaceService.getPlaceByPlaceId(placeId);

      if (!place) {
        return res.status(404).json({
          success: false,
          error: 'Place not found',
        });
      }

      // 生成 AI 标签
      const aiData = await aiService.generatePlaceTags({
        name: place.name,
        category: place.category || undefined,
        description: place.aiDescription || undefined,
        city: place.city || undefined,
        country: place.country || undefined,
      });

      // 更新地点
      const updatedPlace = await publicPlaceService.updatePlace(placeId, {
        aiTags: aiData.tags,
        aiSummary: aiData.summary,
        aiDescription: aiData.description,
      } as any);

      res.json({
        success: true,
        data: updatedPlace,
        message: 'AI tags generated successfully',
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * 获取统计信息
   * GET /api/public-places/stats
   */
  async getStats(_req: Request, res: Response): Promise<void> {
    try {
      const stats = await publicPlaceService.getStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * 获取国家和城市列表（按国家分组）
   * GET /api/public-places/countries-cities
   */
  async getCountriesAndCities(_req: Request, res: Response): Promise<void> {
    try {
      const data = await publicPlaceService.getCountriesAndCities();

      res.json({
        success: true,
        data,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * 获取筛选选项（国家、城市、分类及其数量）
   * GET /api/public-places/filter-options
   */
  async getFilterOptions(_req: Request, res: Response): Promise<void> {
    try {
      const data = await publicPlaceService.getFilterOptions();

      res.json({
        success: true,
        data,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * 按城市和标签筛选地点
   * GET /api/public-places/search-by-filters
   */
  async searchByFilters(req: Request, res: Response): Promise<void> {
    try {
      const { city, country, tags, limit } = req.query;

      if (!city || !country) {
        res.status(400).json({
          success: false,
          error: 'city and country are required',
        });
        return;
      }

      const tagsArray = tags 
        ? (tags as string).split(',').map(t => t.trim()).filter(Boolean)
        : undefined;

      const result = await publicPlaceService.searchByFilters({
        city: city as string,
        country: country as string,
        tags: tagsArray,
        limit: limit ? parseInt(limit as string) : 50,
      });

      res.json({
        success: true,
        data: result.places.map(transformPlace),
        total: result.total,
        isAiGenerated: result.isAiGenerated,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * 使用 AI 生成地点
   * POST /api/public-places/ai-generate
   */
  async aiGeneratePlaces(req: Request, res: Response): Promise<void> {
    try {
      const { city, country, tags, maxPerCategory } = req.body;

      if (!city || !country || !tags || !Array.isArray(tags)) {
        res.status(400).json({
          success: false,
          error: 'city, country, and tags array are required',
        });
        return;
      }

      console.log(`🤖 AI generating places for ${city}, ${country} with tags: ${tags.join(', ')}`);

      const places = await aiService.generatePlacesForCity({
        city,
        country,
        tags,
        maxPerCategory: maxPerCategory || 10,
      });

      res.json({
        success: true,
        data: places.map(transformPlace),
        total: places.length,
        isAiGenerated: true,
      });
    } catch (error: any) {
      console.error('Error generating places with AI:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
  
  /**
   * 手动创建地点
   * POST /api/public-places
   */
  async createPlace(req: Request, res: Response): Promise<void> {
    try {
      const { name, latitude, longitude } = req.body;
      
      // 校验必填字段
      if (!name || latitude === undefined || longitude === undefined) {
        return res.status(400).json({
          success: false,
          error: 'name, latitude, longitude 是必填字段',
        });
      }
      
      const place = await publicPlaceService.createPlace(req.body);

      res.json({
        success: true,
        data: place,
        message: 'Place created successfully',
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * 从 Apify Dataset 导入地点数据
   * POST /api/public-places/import-from-apify
   * Body: { 
   *   datasetId: string,           // Apify Dataset ID (必填)
   *   batchSize?: number,          // 批量大小，默认 100
   *   delayMs?: number,            // 批次间延迟(ms)，默认 100
   *   dryRun?: boolean,            // 仅验证不写入，默认 false
   *   skipImages?: boolean         // 跳过图片处理，默认 false
   * }
   */
  async importFromApifyDataset(req: Request, res: Response): Promise<void> {
    try {
      const { datasetId, batchSize, delayMs, dryRun, skipImages } = req.body;

      if (!datasetId) {
        res.status(400).json({
          success: false,
          error: 'datasetId is required',
        });
        return;
      }

      console.log(`📥 Starting Apify Dataset import: ${datasetId}`);
      console.log(`   Options: batchSize=${batchSize || 100}, dryRun=${dryRun || false}, skipImages=${skipImages || false}`);

      const apifyImportService = new ApifyImportService();
      
      const result = await apifyImportService.importFromDataset(datasetId, {
        batchSize: batchSize || 100,
        delayMs: delayMs || 100,
        dryRun: dryRun || false,
        skipImages: skipImages || false,
      });

      res.json({
        success: true,
        data: {
          total: result.total,
          inserted: result.inserted,
          updated: result.updated,
          skipped: result.skipped,
          failed: result.failed,
          stats: result.stats,
          errors: result.errors.slice(0, 20), // 只返回前20个错误
        },
        message: `Import complete: ${result.inserted} inserted, ${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed`,
      });
    } catch (error: any) {
      console.error('❌ Error importing from Apify Dataset:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * 从 Apify Dataset 预览数据（dry-run 模式）
   * POST /api/public-places/preview-apify-import
   * Body: { datasetId: string }
   */
  async previewApifyImport(req: Request, res: Response): Promise<void> {
    try {
      const { datasetId } = req.body;

      if (!datasetId) {
        res.status(400).json({
          success: false,
          error: 'datasetId is required',
        });
        return;
      }

      console.log(`🔍 Previewing Apify Dataset: ${datasetId}`);

      const apifyImportService = new ApifyImportService();
      
      // 使用 dry-run 模式预览
      const result = await apifyImportService.importFromDataset(datasetId, {
        dryRun: true,
        skipImages: true,
      });

      res.json({
        success: true,
        data: {
          total: result.total,
          wouldInsert: result.inserted,
          wouldUpdate: result.updated,
          wouldSkip: result.skipped,
          wouldFail: result.failed,
          stats: result.stats,
          sampleErrors: result.errors.slice(0, 10),
        },
        message: `Preview complete: ${result.total} items found`,
      });
    } catch (error: any) {
      console.error('❌ Error previewing Apify Dataset:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Apify Webhook 处理器 - Actor 运行完成后自动触发导入
   * POST /api/public-places/apify-webhook
   * 
   * Apify 会发送类似这样的 payload:
   * {
   *   "eventType": "ACTOR.RUN.SUCCEEDED",
   *   "eventData": {
   *     "actorId": "xxx",
   *     "actorRunId": "xxx",
   *     "defaultDatasetId": "xxx"  // 这是我们需要的 Dataset ID
   *   }
   * }
   */
  async handleApifyWebhook(req: Request, res: Response): Promise<void> {
    try {
      const { eventType, eventData, resource } = req.body;
      
      console.log(`🔔 Apify Webhook received: ${eventType}`);
      console.log(`   Payload:`, JSON.stringify(req.body, null, 2));

      // 验证 webhook secret（可选，增加安全性）
      const webhookSecret = process.env.APIFY_WEBHOOK_SECRET;
      const receivedSecret = req.headers['x-apify-webhook-secret'] || req.query.secret;
      
      if (webhookSecret && receivedSecret !== webhookSecret) {
        console.warn('⚠️ Invalid webhook secret');
        res.status(401).json({
          success: false,
          error: 'Invalid webhook secret',
        });
        return;
      }

      // 只处理成功完成的 Actor 运行
      if (eventType !== 'ACTOR.RUN.SUCCEEDED') {
        console.log(`ℹ️ Ignoring event type: ${eventType}`);
        res.json({
          success: true,
          message: `Event type ${eventType} ignored`,
        });
        return;
      }

      // 获取 Dataset ID
      // Apify webhook payload 结构可能有两种格式
      const datasetId = eventData?.defaultDatasetId || resource?.defaultDatasetId;
      
      if (!datasetId) {
        console.error('❌ No datasetId found in webhook payload');
        res.status(400).json({
          success: false,
          error: 'No datasetId found in webhook payload',
        });
        return;
      }

      console.log(`📥 Auto-importing from Dataset: ${datasetId}`);

      // 异步执行导入（不阻塞 webhook 响应）
      const apifyImportService = new ApifyImportService();
      
      // 先快速响应 webhook
      res.json({
        success: true,
        message: `Import started for dataset: ${datasetId}`,
        datasetId,
      });

      // 然后在后台执行导入
      try {
        const result = await apifyImportService.importFromDataset(datasetId, {
          batchSize: 100,
          delayMs: 100,
          dryRun: false,
          skipImages: false,
        });

        console.log(`✅ Auto-import complete for ${datasetId}:`);
        console.log(`   Inserted: ${result.inserted}, Updated: ${result.updated}, Skipped: ${result.skipped}, Failed: ${result.failed}`);
      } catch (importError: any) {
        console.error(`❌ Auto-import failed for ${datasetId}:`, importError.message);
      }
    } catch (error: any) {
      console.error('❌ Error handling Apify webhook:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}

export default new PublicPlaceController();
