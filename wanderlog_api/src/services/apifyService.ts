import axios from 'axios';
import publicPlaceService from './publicPlaceService';

interface ApifyConfig {
  apiToken: string;
  actorId: string;
}

class ApifyService {
  private config: ApifyConfig;
  private baseUrl = 'https://api.apify.com/v2';

  constructor() {
    this.config = {
      apiToken: process.env.APIFY_API_TOKEN || '',
      actorId: process.env.APIFY_ACTOR_ID || 'nwua9Gu5YrADL7ZDj',
    };

    if (!this.config.apiToken) {
      console.warn('Warning: APIFY_API_TOKEN not set in environment variables');
    }
  }

  /**
   * 展开短链接为完整 URL
   */
  private async expandShortUrl(shortUrl: string): Promise<string> {
    try {
      console.log('🔗 Expanding short URL:', shortUrl);
      
      // 使用 axios 跟踪重定向，但不自动跟随
      const response = await axios.get(shortUrl, {
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400,
      });

      // 如果是重定向，获取 Location header
      const location = response.headers.location;
      if (location) {
        console.log('✅ Expanded URL:', location);
        return location;
      }

      // 如果没有重定向，返回原 URL
      return shortUrl;
    } catch (error: any) {
      // 对于 3xx 重定向，axios 会抛出错误，从 error.response 中获取
      if (error.response && error.response.headers.location) {
        const expandedUrl = error.response.headers.location;
        console.log('✅ Expanded URL:', expandedUrl);
        return expandedUrl;
      }
      
      console.warn('⚠️  Could not expand URL, using original:', shortUrl);
      return shortUrl;
    }
  }

  /**
   * 从 URL 中提取所有可能的 Place IDs
   */
  private extractPlaceIdsFromUrl(url: string): string[] {
    const placeIds: string[] = [];
    
    // 方法 1: 提取 place_id 参数
    const placeIdMatch = url.match(/place_id=([A-Za-z0-9_-]+)/);
    if (placeIdMatch) {
      placeIds.push(placeIdMatch[1]);
    }

    // 方法 2: 提取 data= 后的 CID 格式
    const cidMatches = url.matchAll(/0x[0-9a-f]+:0x[0-9a-f]+/gi);
    for (const match of cidMatches) {
      // CID 需要转换，这里先记录
      console.log('Found CID:', match[0]);
    }

    // 方法 3: 提取 ChIJ 开头的标准 Place ID
    const chIJMatches = url.matchAll(/ChIJ[A-Za-z0-9_-]+/g);
    for (const match of chIJMatches) {
      placeIds.push(match[0]);
    }

    return placeIds;
  }

  /**
   * 从 Google Maps 收藏链接中提取地点
   * 自动处理短链接和完整 URL
   */
  async extractPlacesFromLink(googleMapsUrl: string): Promise<string[]> {
    try {
      console.log('🕷️ Starting place extraction for URL:', googleMapsUrl);
      
      // Step 1: 展开短链接
      let expandedUrl = googleMapsUrl;
      if (googleMapsUrl.includes('goo.gl') || googleMapsUrl.includes('maps.app.goo.gl')) {
        expandedUrl = await this.expandShortUrl(googleMapsUrl);
      }

      // Step 2: 尝试从 URL 直接提取 Place IDs
      const directPlaceIds = this.extractPlaceIdsFromUrl(expandedUrl);
      if (directPlaceIds.length > 0) {
        console.log(`✅ Found ${directPlaceIds.length} Place IDs directly from URL`);
        return directPlaceIds;
      }

      // Step 3: 如果是列表/收藏夹 URL，使用 Apify 爬取
      console.log('🕷️ Using Apify scraper for URL:', expandedUrl);
      console.log('🔑 Apify API Token:', this.config.apiToken ? `${this.config.apiToken.substring(0, 20)}...` : 'NOT SET');
      console.log('🎭 Apify Actor ID:', this.config.actorId);

      if (!this.config.apiToken || this.config.apiToken === 'your_apify_api_token') {
        throw new Error('Apify API token is not configured. Please set APIFY_API_TOKEN in .env file');
      }

      // 配置 scraper 输入 - 只爬取收藏夹中的地点
      const input = {
        startUrls: [{ url: expandedUrl }],
        maxCrawledPlaces: 200,
        maxCrawledPlacesPerSearch: 200,
        maxImages: 5,
        maxReviews: 5,
        language: 'en',
        // 爬取设置 - 关键：只爬取列表中的地点，不要额外搜索
        deeperCityScrape: false,          // 不要深度爬取城市
        scrapeDirectories: false,         // 不要爬取目录（会添加附近的地点）
        scrapeReviewsPersonalData: false,
        scrapePhotosFromBusinessPage: true,
        scrapeReviewerPhotos: false,
        scrapeQuestions: false,
        includeWebResults: false,         // 不要包含网页搜索结果
        // 导出格式
        exportPlaceUrls: true,
        includeBusinessStatus: true,
        // 高级设置
        proxyConfiguration: {
          useApifyProxy: true,
        },
      };
      
      console.log('📋 Scraper config:', JSON.stringify(input, null, 2));
      
      // URL 编码 Actor ID（处理 user/actor-name 格式）
      const encodedActorId = encodeURIComponent(this.config.actorId);
      
      // 启动 Apify Actor
      const runResponse = await axios.post(
        `${this.baseUrl}/acts/${encodedActorId}/runs?token=${this.config.apiToken}`,
        input,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const runId = runResponse.data.data.id;
      console.log('✅ Apify run started, ID:', runId);
      console.log('⏳ Waiting for scraper to complete...');
      
      // 等待任务完成
      const results = await this.waitForRunCompletion(runId);

      console.log(`📦 Received ${results.length} items from Apify`);
      if (results.length > 0) {
        console.log('📋 Sample result keys:', Object.keys(results[0]));
        console.log('📋 Sample result:', JSON.stringify(results[0], null, 2).substring(0, 500));
      }

      // 提取 place_id - 尝试多个可能的字段名和格式
      const placeIds: string[] = [];
      for (const item of results) {
        let placeId = null;

        // 尝试多种字段名
        placeId = item.placeId || item.place_id || item.id;

        // 如果有 URL，从中提取
        if (!placeId && item.url) {
          const extracted = this.extractPlaceIdsFromUrl(item.url);
          if (extracted.length > 0) {
            placeId = extracted[0];
          }
        }

        // 如果有 CID，转换为 Place ID (简化处理，实际可能需要 API 查询)
        if (!placeId && item.cid) {
          console.log('⚠️  Found CID but need conversion:', item.cid);
        }

        if (placeId && typeof placeId === 'string') {
          placeIds.push(placeId);
        }
      }

      // 去重
      const uniquePlaceIds = [...new Set(placeIds)];

      console.log(`✅ Extracted ${uniquePlaceIds.length} unique place IDs from Apify`);
      if (uniquePlaceIds.length > 0) {
        console.log('📋 Sample Place IDs:', uniquePlaceIds.slice(0, 3));
      }
      
      return uniquePlaceIds;
    } catch (error: any) {
      console.error('❌ Error in Apify extraction:', error.response?.data || error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      }
      throw new Error(`Failed to extract places from Google Maps link: ${error.message}`);
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
