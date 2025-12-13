import { Request, Response } from 'express';
import publicPlaceService from '../services/publicPlaceService';
import apifyService from '../services/apifyService';
import aiService from '../services/aiService';

class PublicPlaceController {
  /**
   * 获取所有公共地点（支持分页和筛选）
   * GET /api/public-places
   */
  async getAllPlaces(req: Request, res: Response): Promise<void> {
    try {
      const { page, limit, city, country, category, source } = req.query;

      const result = await publicPlaceService.getAllPlaces({
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        city: city as string,
        country: country as string,
        category: category as string,
        source: source as string,
      });

      res.json({
        success: true,
        data: result.places,
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
        data: place,
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
        data: places,
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
   * Body: { url: string }
   */
  async importFromGoogleMapsLink(req: Request, res: Response): Promise<void> {
    try {
      const { url } = req.body;

      if (!url) {
        return res.status(400).json({
          success: false,
          error: 'Google Maps URL is required',
        });
      }

      // 使用 Apify 提取并导入
      const result = await apifyService.importFromGoogleMapsLink(url);

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
}

export default new PublicPlaceController();
