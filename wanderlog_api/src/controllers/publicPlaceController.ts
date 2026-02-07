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
 * 从结构化 tags 对象中提取标签列表
 * tags 格式: { meal: ['breakfast', 'brunch'], style: ['cozy'] }
 * 返回: ['breakfast', 'brunch', 'cozy']
 */
function extractTagsFromStructured(tags: Record<string, string[]> | null): string[] {
  if (!tags || typeof tags !== 'object') return [];
  
  const result: string[] = [];
  for (const key of Object.keys(tags)) {
    const values = tags[key];
    if (Array.isArray(values)) {
      for (const v of values) {
        if (typeof v === 'string' && v.trim()) {
          result.push(v.trim());
        }
      }
    }
  }
  return result;
}

// 需要过滤的旧标签（不再使用的通用标签）
const FILTERED_TAGS = new Set(['place', 'landmark']);

/**
 * 计算 display_tags，合并 aiTags 和 tags 的并集
 * 优先级: aiTags (按 priority) > tags
 * 最多 3 个标签
 * 注意：不包含 category，因为 category 已经有单独的列显示
 */
function computeDisplayTagsWithUnion(
  categoryEn: string | null | undefined,
  categoryZh: string | null | undefined,
  aiTags: AITagElement[],
  tagsFromStructured: string[]
): { display_tags_en: string[]; display_tags_zh: string[] } {
  const MAX_TAGS = 3;
  const resultEn: string[] = [];
  const resultZh: string[] = [];
  const seenEn = new Set<string>();
  const seenZh = new Set<string>();
  
  // 记录 category 用于去重（不添加到结果中，但要避免重复）
  if (categoryEn && categoryEn.trim()) {
    seenEn.add(categoryEn.trim().toLowerCase());
  }
  if (categoryZh && categoryZh.trim()) {
    seenZh.add(categoryZh.trim().toLowerCase());
  }
  
  // 1. 添加 aiTags（按 priority 降序）
  const sortedAiTags = [...aiTags].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  for (const tag of sortedAiTags) {
    if (resultEn.length >= MAX_TAGS) break;
    
    const enValue = tag.en?.trim();
    const zhValue = tag.zh?.trim();
    
    // 过滤掉旧的通用标签（如 "place", "landmark"）
    if (enValue && !seenEn.has(enValue.toLowerCase()) && !FILTERED_TAGS.has(enValue.toLowerCase())) {
      resultEn.push(enValue);
      seenEn.add(enValue.toLowerCase());
    }
    if (zhValue && !seenZh.has(zhValue.toLowerCase()) && resultZh.length < MAX_TAGS) {
      resultZh.push(zhValue);
      seenZh.add(zhValue.toLowerCase());
    }
  }
  
  // 2. 添加 tags 中的标签（补充到 3 个）
  for (const tag of tagsFromStructured) {
    if (resultEn.length >= MAX_TAGS) break;
    
    const tagLower = tag.toLowerCase();
    // 过滤掉旧的通用标签（如 "place", "landmark"）
    if (!seenEn.has(tagLower) && !FILTERED_TAGS.has(tagLower)) {
      // 首字母大写
      const formatted = tag.charAt(0).toUpperCase() + tag.slice(1);
      resultEn.push(formatted);
      seenEn.add(tagLower);
      
      // 中文也添加（暂时用英文，因为 tags 没有中文翻译）
      if (resultZh.length < MAX_TAGS && !seenZh.has(tagLower)) {
        resultZh.push(formatted);
        seenZh.add(tagLower);
      }
    }
  }
  
  return {
    display_tags_en: resultEn,
    display_tags_zh: resultZh,
  };
}

/**
 * 将剧照中的 http:// URL 升级为 https://
 * 避免 HTTPS 页面加载 HTTP 图片时被浏览器阻止（混合内容）
 */
function upgradeStillUrls(customFields: any): any {
  if (!customFields) return customFields;

  let parsed: any;
  try {
    parsed = typeof customFields === 'string' ? JSON.parse(customFields) : customFields;
  } catch {
    return customFields;
  }

  if (!parsed || typeof parsed !== 'object') return parsed;
  if (!parsed.stills || !Array.isArray(parsed.stills)) return parsed;

  const upgraded = parsed.stills.map((still: any) => {
    if (typeof still === 'string' && still.startsWith('http://')) {
      return still.replace('http://', 'https://');
    }
    if (typeof still === 'object' && still.url && still.url.startsWith('http://')) {
      return { ...still, url: still.url.replace('http://', 'https://') };
    }
    return still;
  });

  return { ...parsed, stills: upgraded };
}

/**
 * 过滤隐藏的剧照
 * 仅返回 isHidden !== true 的剧照
 */
function filterHiddenStills(customFields: any): any {
  if (!customFields) return customFields;
  
  // 解析 customFields
  let parsed: any;
  try {
    parsed = typeof customFields === 'string' ? JSON.parse(customFields) : customFields;
  } catch {
    return customFields;
  }
  
  if (!parsed || typeof parsed !== 'object') {
    return parsed;
  }
  
  // 如果没有 stills 数组，直接返回解析后的对象
  if (!parsed.stills || !Array.isArray(parsed.stills)) {
    return parsed;
  }
  
  // Debug: 打印每个剧照的 isHidden 状态
  const originalCount = parsed.stills.length;
  console.log(`[filterHiddenStills-publicPlace] 开始过滤, 剧照数量: ${originalCount}`);
  
  const hiddenStills = parsed.stills.filter((still: any) => still.isHidden === true);
  
  // 过滤掉隐藏的剧照 (isHidden === true)
  const visibleStills = parsed.stills.filter((still: any) => {
    // 默认显示 (isHidden 为 false、undefined 或不存在时都显示)
    return still.isHidden !== true;
  });
  
  console.log(`[filterHiddenStills-publicPlace] 结果: 原始=${originalCount}, 隐藏=${hiddenStills.length}, 可见=${visibleStills.length}`);
  
  return {
    ...parsed,
    stills: visibleStills,
  };
}

/**
 * 转换 place 对象为 API 响应格式
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 * 
 * - 返回 category_en 和 category_zh 字段
 * - 返回 ai_tags 作为对象数组 {kind, id, en, zh, priority}
 * - 返回计算的 display_tags_en 和 display_tags_zh
 * - 不返回内部 tags 字段给 C 端用户（除非 includeInternalTags=true）
 * - C端过滤隐藏的剧照（isHidden: true）
 */
function transformPlace(place: any, includeInternalTags: boolean = false): any {
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
  
  // 解析 tags 字段（结构化标签，如 { meal: ['breakfast'], style: ['cozy'] }）
  let parsedTags: Record<string, string[]> | null = null;
  if (place.tags) {
    if (typeof place.tags === 'string') {
      try {
        parsedTags = JSON.parse(place.tags);
      } catch {
        parsedTags = null;
      }
    } else if (typeof place.tags === 'object') {
      parsedTags = place.tags;
    }
  }
  
  // 从 tags 字段提取标签用于 display_tags（取 tags 和 aiTags 的并集）
  const tagsFromStructured = extractTagsFromStructured(parsedTags);
  
  // 计算 display_tags (Requirements: 8.3) - 合并 aiTags 和 tags 的并集
  const { display_tags_en, display_tags_zh } = computeDisplayTagsWithUnion(
    categoryEn,
    categoryZh,
    aiTags,
    tagsFromStructured
  );
  
  // 构建响应对象
  let result: any;
  
  // 合集封面图（返回原始值，让前端决定是否使用 fallback）
  const collectionCoverImage = place.collectionCoverImage || null;
  
  if (includeInternalTags) {
    // 后台管理：保留 tags 字段
    result = {
      ...place,
      placeId: place.id, // 始终使用 UUID
      images,
      coverImage,
      collectionCoverImage,
      category,
      categorySlug,
      categoryEn,
      categoryZh,
      aiTags,
      display_tags_en,
      display_tags_zh,
      tags: parsedTags,
      customFields: upgradeStillUrls(place.customFields) || null,
    };
  } else {
    // C 端：移除内部 tags 字段 (Requirements: 8.4)
    // 并过滤隐藏的剧照 (isHidden: true)
    const { tags: _internalTags, ...placeWithoutTags } = place;
    
    result = {
      ...placeWithoutTags,
      placeId: place.id, // 始终使用 UUID
      images,
      coverImage,
      collectionCoverImage,
      category,
      categorySlug,
      categoryEn,
      categoryZh,
      aiTags,
      display_tags_en,
      display_tags_zh,
      customFields: filterHiddenStills(upgradeStillUrls(place.customFields)),
    };
  }
  
  return result;
}

class PublicPlaceController {
  /**
   * 获取所有公共地点（支持分页和筛选）
   * GET /api/public-places
   */
  async getAllPlaces(req: Request, res: Response): Promise<void> {
    const startTime = Date.now();
    try {
      console.log(`[getAllPlaces] Request received:`, {
        query: req.query,
        timestamp: new Date().toISOString(),
      });

      const { page, limit, city, country, category, source, search, minRating, maxRating, tag, tagType, hasCoverImage, sortBy, sortOrder, includeInternalTags } = req.query;

      // 检查数据库连接
      try {
        await publicPlaceService.getStats(); // 简单的数据库连接测试
      } catch (dbError: any) {
        console.error('❌ [getAllPlaces] Database connection error:', dbError);
        res.status(503).json({
          success: false,
          error: 'Database connection failed',
          details: process.env.NODE_ENV === 'development' ? dbError.message : undefined,
        });
        return;
      }

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
        tagType: tagType as string,
        hasCoverImage: hasCoverImage === 'true' ? true : (hasCoverImage === 'false' ? false : undefined),
        sortBy: sortBy as 'rating' | 'ratingCount' | 'createdAt' | undefined,
        sortOrder: sortOrder as 'asc' | 'desc' | undefined,
      });

      // 如果请求包含 includeInternalTags=true，则不移除 tags 字段（用于后台管理）
      const shouldIncludeInternalTags = includeInternalTags === 'true';

      // 显式设置 Content-Type 为 application/json
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      
      const responseData = {
        success: true,
        data: result.places.map(place => transformPlace(place, shouldIncludeInternalTags)),
        pagination: result.pagination,
      };
      
      const duration = Date.now() - startTime;
      console.log(`✅ [getAllPlaces] Success: ${responseData.data.length} places, pagination:`, responseData.pagination, `(${duration}ms)`);
      
      res.json(responseData);
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`❌ [getAllPlaces] Error after ${duration}ms:`, {
        message: error.message,
        stack: error.stack,
        name: error.name,
        code: error.code,
      });
      
      // 检查是否是数据库相关错误
      if (error.code === 'P1001' || error.code === 'P1002' || error.code === 'P1003') {
        res.status(503).json({
          success: false,
          error: 'Database connection error',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
      } else {
        res.status(500).json({
          success: false,
          error: error.message || 'Internal server error',
          details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        });
      }
    }
  }

  /**
   * 根据 place_id 获取地点详情
   * GET /api/public-places/:placeId
   */
  async getPlaceByPlaceId(req: Request, res: Response): Promise<void> {
    try {
      const { placeId } = req.params;
      const includeInternalTags = req.query.includeInternalTags === 'true';
      const place = await publicPlaceService.getPlaceByPlaceId(placeId);

      if (!place) {
        return res.status(404).json({
          success: false,
          error: 'Place not found',
        });
      }

      res.json({
        success: true,
        data: transformPlace(place, includeInternalTags),
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
   * GET /api/public-places/search?q=query&city=Paris&country=France&limit=20
   * 
   * 支持的搜索场景：
   * 1. 具体地点名：query 完全匹配则直接出现对应结果（如 "Eiffel Tower"）
   * 2. 模糊搜索地点名：部分匹配（如 "tower"）
   * 3. 搜索类型：匹配 category、tags、ai_tags（如 "church", "cafe", "architecture"）
   * 4. 具体标签：如建筑师名字（如 "zaha"）匹配 tags 中的 architect 等字段
   * 5. 搜索城市：匹配城市名
   * 
   * 默认返回评价人数多且评分高的前 20 个地点
   */
  async searchPlaces(req: Request, res: Response): Promise<void> {
    try {
      const { q, city, country, limit } = req.query;

      if (!q) {
        return res.status(400).json({
          success: false,
          error: 'Search query is required',
        });
      }

      const places = await publicPlaceService.searchPlaces(
        q as string,
        city as string | undefined,
        country as string | undefined,
        limit ? parseInt(limit as string) : 20
      );

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
   * 获取国家和城市列表（带地点数量统计，用于地图首页下拉）
   * GET /api/public-places/countries-cities-stats
   * 
   * Query params:
   * - minCountryPlaces: 国家最小地点数（默认 100）
   * - minCityPlaces: 城市最小地点数（默认 5，少于此数量的城市不显示）
   */
  async getCountriesAndCitiesWithStats(req: Request, res: Response): Promise<void> {
    try {
      const { minCountryPlaces, minCityPlaces, minCitiesPerCountry } = req.query;

      const data = await publicPlaceService.getCountriesAndCitiesWithStats({
        minCountryPlaces: minCountryPlaces ? parseInt(minCountryPlaces as string) : undefined,
        minCityPlaces: minCityPlaces ? parseInt(minCityPlaces as string) : undefined,
        minCitiesPerCountry: minCitiesPerCountry ? parseInt(minCitiesPerCountry as string) : undefined,
      });

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
   * 获取城市 Top N 评分人数最多的地点
   * GET /api/public-places/top-by-city
   * 
   * Query params:
   * - city: 城市名称（必填）
   * - country: 国家名称（可选）
   * - limit: 返回数量（默认 20）
   */
  async getTopPlacesByCity(req: Request, res: Response): Promise<void> {
    try {
      const { city, country, limit } = req.query;

      if (!city) {
        return res.status(400).json({
          success: false,
          error: 'city is required',
        });
      }

      const places = await publicPlaceService.getTopPlacesByCity({
        city: city as string,
        country: country as string | undefined,
        limit: limit ? parseInt(limit as string) : undefined,
      });

      res.json({
        success: true,
        data: places.map(place => transformPlace(place)),
        pagination: {
          total: places.length,
          page: 1,
          limit: limit ? parseInt(limit as string) : 20,
          totalPages: 1,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * 获取城市的 Top N 标签统计
   * GET /api/public-places/city-tag-stats
   * 
   * Query params:
   * - city: 城市名称（必填）
   * - country: 国家名称（可选）
   * - limit: 返回数量（默认 10）
   */
  async getCityTagStats(req: Request, res: Response): Promise<void> {
    try {
      const { city, country, limit } = req.query;

      if (!city) {
        return res.status(400).json({
          success: false,
          error: 'city is required',
        });
      }

      const result = await publicPlaceService.getCityTagStats({
        city: city as string,
        country: country as string | undefined,
        limit: limit ? parseInt(limit as string) : undefined,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * 按城市和单个标签筛选地点
   * GET /api/public-places/places-by-tag
   * 
   * Query params:
   * - city: 城市名称（必填）
   * - country: 国家名称（可选）
   * - tag: 标签名称（必填）
   * - limit: 返回数量（默认 50）
   */
  async getPlacesByCityAndTag(req: Request, res: Response): Promise<void> {
    try {
      const { city, country, tag, limit } = req.query;

      if (!city || !tag) {
        return res.status(400).json({
          success: false,
          error: 'city and tag are required',
        });
      }

      const places = await publicPlaceService.getPlacesByCityAndTag({
        city: city as string,
        country: country as string | undefined,
        tag: tag as string,
        limit: limit ? parseInt(limit as string) : undefined,
      });

      res.json({
        success: true,
        data: places.map(place => transformPlace(place)),
        pagination: {
          total: places.length,
          page: 1,
          limit: limit ? parseInt(limit as string) : 50,
          totalPages: 1,
        },
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
   * 获取标签类型列表（按类型分组的标签）
   * GET /api/public-places/tag-types
   */
  async getTagTypes(req: Request, res: Response): Promise<void> {
    try {
      const { country, category } = req.query;
      const data = await publicPlaceService.getTagTypes({
        country: country as string | undefined,
        category: category as string | undefined,
      });

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
      const { city, country, tags, categories, limit } = req.query;

      if (!city || !country) {
        res.status(400).json({
          success: false,
          error: 'city and country are required',
        });
        return;
      }

      // 解析 tags 参数（匹配 tags 或 ai_tags 字段）
      const tagsArray = tags 
        ? (tags as string).split(',').map(t => t.trim()).filter(Boolean)
        : undefined;

      // 解析 categories 参数（匹配 category 字段）
      const categoriesArray = categories
        ? (categories as string).split(',').map(c => c.trim()).filter(Boolean)
        : undefined;

      const result = await publicPlaceService.searchByFilters({
        city: city as string,
        country: country as string,
        tags: tagsArray,
        categories: categoriesArray,
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

  /**
   * 更新剧照的 canCompare 字段
   * PUT /api/public-places/:placeId/stills
   * Body: { 
   *   updates: Array<{ index: number, canCompare: boolean }>
   * }
   * 
   * Example:
   * {
   *   "updates": [
   *     { "index": 0, "canCompare": true },
   *     { "index": 1, "canCompare": true },
   *     { "index": 5, "canCompare": false }
   *   ]
   * }
   */
  async updateStillsCompare(req: Request, res: Response): Promise<void> {
    try {
      const { placeId } = req.params;
      const { updates } = req.body;

      if (!updates || !Array.isArray(updates)) {
        res.status(400).json({
          success: false,
          error: 'updates array is required',
        });
        return;
      }

      // Get the place
      const place = await publicPlaceService.getPlaceByPlaceId(placeId);
      if (!place) {
        res.status(404).json({
          success: false,
          error: 'Place not found',
        });
        return;
      }

      const customFields = (place.customFields as any) || {};
      const stills = customFields.stills || [];

      if (stills.length === 0) {
        res.status(400).json({
          success: false,
          error: 'No stills found for this place',
        });
        return;
      }

      // Apply updates
      let updatedCount = 0;
      for (const update of updates) {
        const { index, canCompare } = update;
        if (typeof index === 'number' && index >= 0 && index < stills.length) {
          stills[index].canCompare = canCompare === true;
          updatedCount++;
        }
      }

      // Save back
      await publicPlaceService.updatePlace(placeId, {
        customFields: {
          ...customFields,
          stills,
        },
      });

      res.json({
        success: true,
        data: {
          placeId,
          updatedCount,
          totalStills: stills.length,
          stills: stills.map((s: any, i: number) => ({
            index: i,
            movieNameEn: s.movieNameEn,
            movieNameCn: s.movieNameCn,
            canCompare: s.canCompare || false,
            url: s.url,
          })),
        },
        message: `Updated ${updatedCount} stills`,
      });
    } catch (error: any) {
      console.error('❌ Error updating stills compare:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * 获取所有不同的标签值，按类型分组（用于自动完成）
   * GET /api/public-places/distinct-tags
   */
  async getDistinctTags(req: Request, res: Response): Promise<void> {
    try {
      const data = await publicPlaceService.getDistinctTagsByType();

      res.json({
        success: true,
        data,
      });
    } catch (error: any) {
      console.error('❌ Error getting distinct tags:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}

export default new PublicPlaceController();
