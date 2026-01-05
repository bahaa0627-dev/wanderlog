/**
 * Wikipedia Image Service
 * 
 * 通过 Wikipedia API 获取地点图片
 * 完全免费，无限制
 * 
 * 适用于：景点、博物馆、历史建筑等有 Wikipedia 词条的地点
 * 不适用于：普通餐厅、咖啡馆等小众地点
 */

import axios, { AxiosInstance } from 'axios';

// ============================================
// Types
// ============================================

interface WikipediaSummary {
  title: string;
  thumbnail?: {
    source: string;
    width: number;
    height: number;
  };
  originalimage?: {
    source: string;
    width: number;
    height: number;
  };
}

interface WikipediaSearchResult {
  pages: Array<{
    id: number;
    key: string;
    title: string;
    thumbnail?: {
      url: string;
      width: number;
      height: number;
    };
  }>;
}

export interface WikiImageResult {
  imageUrl: string | null;
  source: 'wikipedia' | 'wikidata' | null;
  title?: string;
}

// ============================================
// Wikipedia Image Service
// ============================================

import { HttpsProxyAgent } from 'https-proxy-agent';

class WikipediaImageService {
  private axiosInstance: AxiosInstance;

  constructor() {
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    
    this.axiosInstance = axios.create({
      timeout: 8000,
      headers: {
        'User-Agent': 'WanderlogApp/1.0 (https://wanderlog.app; contact@wanderlog.app)',
      },
      ...(proxyUrl && { httpsAgent: new HttpsProxyAgent(proxyUrl) }),
    });
    
    if (proxyUrl) {
      console.log(`[Wikipedia] Using proxy: ${proxyUrl}`);
    }
  }

  /**
   * 通过地点名称获取 Wikipedia 图片
   * 
   * 策略：
   * 1. 先尝试精确匹配 Wikipedia 词条
   * 2. 如果失败，尝试搜索
   * 3. 优先返回高分辨率图片
   * 
   * @param placeName - 地点名称（英文效果最好）
   * @param city - 城市名（可选，用于消歧义）
   * @returns 图片 URL 或 null
   */
  async getImageForPlace(placeName: string, city?: string): Promise<WikiImageResult> {
    // 尝试多种查询方式
    const queries = this.generateSearchQueries(placeName, city);
    
    for (const query of queries) {
      try {
        // 方法1: 直接获取 Wikipedia 页面摘要（最快）
        const summaryResult = await this.getPageSummary(query);
        if (summaryResult.imageUrl) {
          console.log(`✅ [Wikipedia] Found image for "${placeName}" via summary: ${query}`);
          return summaryResult;
        }

        // 方法2: 搜索 Wikipedia
        const searchResult = await this.searchWikipedia(query);
        if (searchResult.imageUrl) {
          console.log(`✅ [Wikipedia] Found image for "${placeName}" via search: ${query}`);
          return searchResult;
        }
      } catch (error) {
        // 继续尝试下一个查询
        continue;
      }
    }

    console.log(`⚠️ [Wikipedia] No image found for: "${placeName}"`);
    return { imageUrl: null, source: null };
  }

  /**
   * 生成多种搜索查询
   */
  private generateSearchQueries(placeName: string, city?: string): string[] {
    const queries: string[] = [];
    
    // 原始名称
    queries.push(placeName);
    
    // 带城市名
    if (city) {
      queries.push(`${placeName} ${city}`);
      queries.push(`${placeName}, ${city}`);
    }
    
    // 去掉常见后缀
    const cleanName = placeName
      .replace(/\s+(cafe|coffee|restaurant|bar|museum|gallery|park|church|temple|shrine)$/i, '')
      .trim();
    if (cleanName !== placeName) {
      queries.push(cleanName);
    }
    
    // 替换空格为下划线（Wikipedia URL 格式）
    queries.push(placeName.replace(/\s+/g, '_'));
    
    return [...new Set(queries)]; // 去重
  }

  /**
   * 获取 Wikipedia 页面摘要（包含缩略图）
   * 
   * API: https://en.wikipedia.org/api/rest_v1/page/summary/{title}
   */
  private async getPageSummary(title: string): Promise<WikiImageResult> {
    try {
      const encodedTitle = encodeURIComponent(title.replace(/\s+/g, '_'));
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodedTitle}`;
      
      const response = await this.axiosInstance.get<WikipediaSummary>(url);
      
      // 优先使用原始图片，其次缩略图
      const imageUrl = response.data.originalimage?.source || response.data.thumbnail?.source;
      
      if (imageUrl) {
        // 获取有效的图片 URL（带回退机制）
        const validUrl = await this.getValidImageUrl(imageUrl);
        return {
          imageUrl: validUrl,
          source: 'wikipedia',
          title: response.data.title,
        };
      }
      
      return { imageUrl: null, source: null };
    } catch (error) {
      return { imageUrl: null, source: null };
    }
  }

  /**
   * 搜索 Wikipedia 并获取第一个结果的图片
   * 
   * API: https://en.wikipedia.org/w/rest.php/v1/search/page
   */
  private async searchWikipedia(query: string): Promise<WikiImageResult> {
    try {
      const url = `https://en.wikipedia.org/w/rest.php/v1/search/page`;
      
      const response = await this.axiosInstance.get<WikipediaSearchResult>(url, {
        params: {
          q: query,
          limit: 3, // 获取前3个结果
        },
      });
      
      const pages = response.data.pages || [];
      
      // 遍历结果，找到有图片的
      for (const page of pages) {
        if (page.thumbnail?.url) {
          // 搜索结果的缩略图 URL 格式不同，需要处理
          let imageUrl = page.thumbnail.url;
          if (imageUrl.startsWith('//')) {
            imageUrl = 'https:' + imageUrl;
          }
          
          // 获取有效的图片 URL（带回退机制）
          const validUrl = await this.getValidImageUrl(imageUrl);
          
          return {
            imageUrl: validUrl,
            source: 'wikipedia',
            title: page.title,
          };
        }
      }
      
      return { imageUrl: null, source: null };
    } catch (error) {
      return { imageUrl: null, source: null };
    }
  }

  /**
   * 尝试获取更大尺寸的图片 URL
   * 
   * Wikipedia 缩略图 URL 格式：
   * .../thumb/a/ab/Image.jpg/220px-Image.jpg
   * 
   * 原始图片 URL 格式：
   * .../commons/a/ab/Image.jpg
   * 
   * 只有缩略图 URL（包含 /thumb/）才能修改尺寸
   * 
   * 注意：不要请求过大的尺寸，可能导致 404
   * 使用 800px 作为安全的中等尺寸
   */
  private getLargerImageUrl(url: string): string {
    // 只处理缩略图 URL（必须包含 /thumb/ 路径）
    if (!url.includes('/thumb/')) {
      // 原始图片 URL，直接返回
      return url;
    }
    
    // 匹配缩略图 URL 中的尺寸部分
    const thumbMatch = url.match(/\/(\d+)px-[^/]+$/);
    if (thumbMatch) {
      const currentSize = parseInt(thumbMatch[1], 10);
      // 如果当前尺寸已经 >= 600px，保持原样避免 404
      if (currentSize >= 600) {
        return url;
      }
      // 使用 800px 作为安全的中等尺寸（避免 1280px 可能不存在）
      return url.replace(/\/\d+px-/, '/800px-');
    }
    return url;
  }

  /**
   * 验证图片 URL 是否可访问
   * 使用 HEAD 请求快速检查，避免下载整个图片
   */
  async validateImageUrl(url: string): Promise<boolean> {
    try {
      const response = await this.axiosInstance.head(url, {
        timeout: 3000,
        validateStatus: (status) => status < 400,
      });
      return response.status >= 200 && response.status < 400;
    } catch (error) {
      return false;
    }
  }

  /**
   * 获取有效的图片 URL，带回退机制
   * 如果大尺寸不可用，回退到原始尺寸
   */
  private async getValidImageUrl(originalUrl: string): Promise<string> {
    const largerUrl = this.getLargerImageUrl(originalUrl);
    
    // 如果 URL 没有变化，直接返回
    if (largerUrl === originalUrl) {
      return originalUrl;
    }
    
    // 验证大尺寸 URL 是否可用
    const isLargerValid = await this.validateImageUrl(largerUrl);
    if (isLargerValid) {
      return largerUrl;
    }
    
    console.log(`⚠️ [Wikipedia] Larger image not available, using original: ${originalUrl.substring(0, 80)}...`);
    return originalUrl;
  }

  /**
   * 批量获取多个地点的图片
   * 
   * @param places - 地点数组
   * @returns Map<placeName, imageUrl>
   */
  async batchGetImages(
    places: Array<{ name: string; city?: string }>
  ): Promise<Map<string, WikiImageResult>> {
    const results = new Map<string, WikiImageResult>();
    
    console.log(`📷 [Wikipedia] Fetching images for ${places.length} places...`);
    
    // 串行处理，避免请求过快
    for (const place of places) {
      const result = await this.getImageForPlace(place.name, place.city);
      results.set(place.name, result);
      
      // 小延迟，避免被限流
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    const successCount = Array.from(results.values()).filter(r => r.imageUrl).length;
    console.log(`✅ [Wikipedia] Found images for ${successCount}/${places.length} places`);
    
    return results;
  }
}

// Export singleton
export const wikipediaImageService = new WikipediaImageService();
export default wikipediaImageService;
