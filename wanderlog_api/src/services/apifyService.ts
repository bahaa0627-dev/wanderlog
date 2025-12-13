import axios from 'axios';
import publicPlaceService from './publicPlaceService';

interface ApifyConfig {
  apiToken: string;
  actorId: string; // Apify Actor ID for Google Maps scraper
}

class ApifyService {
  private config: ApifyConfig;
  private baseUrl = 'https://api.apify.com/v2';

  constructor() {
    this.config = {
      apiToken: process.env.APIFY_API_TOKEN || '',
      actorId: process.env.APIFY_ACTOR_ID || 'compass/google-maps-scraper', // 默认使用这个 Actor
    };

    if (!this.config.apiToken) {
      console.warn('Warning: APIFY_API_TOKEN not set in environment variables');
    }
  }

  /**
   * 从 Google Maps 收藏链接中提取地点
   * 链接格式示例：https://www.google.com/maps/saved/xxx 或 https://maps.app.goo.gl/xxx
   */
  async extractPlacesFromLink(googleMapsUrl: string): Promise<string[]> {
    try {
      console.log('Starting Apify scraper for URL:', googleMapsUrl);

      // 启动 Apify Actor
      const runResponse = await axios.post(
        `${this.baseUrl}/acts/${this.config.actorId}/runs`,
        {
          startUrls: [{ url: googleMapsUrl }],
          maxCrawledPlaces: 100, // 最多爬取100个地点
          language: 'zh-CN',
          includeImages: true,
          includeReviews: false, // 不需要详细评论，减少数据量
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiToken}`,
          },
          params: {
            token: this.config.apiToken,
          },
        }
      );

      const runId = runResponse.data.data.id;
      console.log('Apify run started, ID:', runId);

      // 等待任务完成
      const results = await this.waitForRunCompletion(runId);

      // 提取 place_id
      const placeIds: string[] = [];
      for (const item of results) {
        if (item.placeId) {
          placeIds.push(item.placeId);
        }
      }

      console.log(`Extracted ${placeIds.length} place IDs from Apify`);
      return placeIds;
    } catch (error: any) {
      console.error('Error in Apify extraction:', error.response?.data || error.message);
      throw new Error('Failed to extract places from Google Maps link');
    }
  }

  /**
   * 等待 Apify 任务完成并获取结果
   */
  private async waitForRunCompletion(runId: string, maxWaitTime: number = 300000): Promise<any[]> {
    const startTime = Date.now();
    const pollInterval = 5000; // 每5秒检查一次

    while (Date.now() - startTime < maxWaitTime) {
      try {
        // 检查运行状态
        const statusResponse = await axios.get(
          `${this.baseUrl}/actor-runs/${runId}`,
          {
            params: { token: this.config.apiToken },
          }
        );

        const status = statusResponse.data.data.status;
        console.log('Apify run status:', status);

        if (status === 'SUCCEEDED') {
          // 获取结果
          const datasetId = statusResponse.data.data.defaultDatasetId;
          const resultsResponse = await axios.get(
            `${this.baseUrl}/datasets/${datasetId}/items`,
            {
              params: { token: this.config.apiToken },
            }
          );

          return resultsResponse.data;
        } else if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
          throw new Error(`Apify run ${status.toLowerCase()}`);
        }

        // 等待后继续检查
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      } catch (error) {
        console.error('Error checking Apify run status:', error);
        throw error;
      }
    }

    throw new Error('Apify run timed out');
  }

  /**
   * 从 Google Maps 链接导入地点到公共地点库
   */
  async importFromGoogleMapsLink(googleMapsUrl: string): Promise<{
    success: number;
    failed: number;
    errors: string[];
  }> {
    try {
      // 步骤1：从链接提取 place_id
      const placeIds = await this.extractPlacesFromLink(googleMapsUrl);

      if (placeIds.length === 0) {
        return { success: 0, failed: 0, errors: ['No places found in the link'] };
      }

      // 步骤2：批量添加到公共地点库
      const result = await publicPlaceService.batchAddByPlaceIds(
        placeIds,
        'google_maps_link',
        { originalUrl: googleMapsUrl, timestamp: new Date() }
      );

      return result;
    } catch (error: any) {
      console.error('Error importing from Google Maps link:', error);
      return {
        success: 0,
        failed: 0,
        errors: [error.message],
      };
    }
  }

  /**
   * 检查 Apify 配置是否正确
   */
  async checkConfiguration(): Promise<boolean> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/acts/${this.config.actorId}`,
        {
          params: { token: this.config.apiToken },
        }
      );

      return response.data.data !== null;
    } catch (error) {
      console.error('Apify configuration check failed:', error);
      return false;
    }
  }
}

export default new ApifyService();
