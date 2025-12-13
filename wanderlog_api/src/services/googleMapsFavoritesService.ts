import axios from 'axios';
import * as cheerio from 'cheerio';
import publicPlaceService from './publicPlaceService';

/**
 * Google Maps 收藏夹链接处理服务
 * 用于从 Google Maps 收藏夹/列表链接中提取地点信息
 */
class GoogleMapsFavoritesService {
  /**
   * 从 Google Maps 链接中提取 Place IDs
   * 支持的链接格式：
   * 1. Google Maps 列表分享链接：https://maps.app.goo.gl/xxxxx
   * 2. Google Maps 收藏夹链接：https://www.google.com/maps/d/xxxxx
   * 3. Google Maps 搜索结果链接：包含多个地点
   */
  async extractPlaceIdsFromLink(url: string): Promise<string[]> {
    try {
      console.log(`📍 Extracting place IDs from URL: ${url}`);

      // 方法 1: 尝试从 URL 中直接提取 Place IDs（适用于短链接）
      const directPlaceIds = await this.extractPlaceIdsFromUrl(url);
      if (directPlaceIds.length > 0) {
        console.log(`✅ Found ${directPlaceIds.length} place IDs from URL directly`);
        return directPlaceIds;
      }

      // 方法 2: 尝试解析网页内容（适用于列表页面）
      const webPagePlaceIds = await this.extractPlaceIdsFromWebPage(url);
      if (webPagePlaceIds.length > 0) {
        console.log(`✅ Found ${webPagePlaceIds.length} place IDs from web page`);
        return webPagePlaceIds;
      }

      console.warn('⚠️ No place IDs found from the provided URL');
      return [];
    } catch (error: any) {
      console.error('❌ Error extracting place IDs:', error.message);
      throw new Error(`Failed to extract place IDs: ${error.message}`);
    }
  }

  /**
   * 从 URL 中直接提取 Place IDs
   * 处理短链接重定向并从目标 URL 中提取
   */
  private async extractPlaceIdsFromUrl(url: string): Promise<string[]> {
    try {
      // 先处理短链接，获取重定向后的完整 URL
      const fullUrl = await this.resolveShortUrl(url);
      console.log(`🔗 Resolved URL: ${fullUrl}`);

      const placeIds: string[] = [];

      // 方法 1: 匹配标准的 Place ID 格式（ChIJ 开头）
      const standardPlaceIdRegex = /(ChIJ[A-Za-z0-9_-]{23,})/g;
      let match;
      while ((match = standardPlaceIdRegex.exec(fullUrl)) !== null) {
        placeIds.push(match[1]);
      }

      // 方法 2: 匹配 place/ 后面的 Place ID
      const placeIdRegex = /place\/[^\/]+\/([A-Za-z0-9_-]{20,})/g;
      while ((match = placeIdRegex.exec(fullUrl)) !== null) {
        placeIds.push(match[1]);
      }

      // 方法 3: 匹配 ftid= 参数（Feature ID，hex 格式）
      const ftidRegex = /ftid=(0x[a-f0-9]+:[a-f0-9x]+)/gi;
      while ((match = ftidRegex.exec(fullUrl)) !== null) {
        // 尝试从 hex feature ID 转换
        const hexId = match[1];
        console.log(`Found hex ftid: ${hexId} - attempting conversion...`);
        const convertedId = await this.convertHexFeatureIdToPlaceId(hexId);
        if (convertedId) {
          placeIds.push(convertedId);
        }
      }

      // 方法 4: 匹配 1s 参数（可能包含 Place ID）
      const onesRegex = /1s([A-Za-z0-9_-]{20,})/g;
      while ((match = onesRegex.exec(fullUrl)) !== null) {
        const potentialId = match[1];
        if (potentialId.startsWith('ChIJ')) {
          placeIds.push(potentialId);
        }
      }

      // 方法 5: 如果 URL 包含 /maps/place/ 直接提取地点名称进行搜索
      if (placeIds.length === 0 && fullUrl.includes('/maps/place/')) {
        const placeNameMatch = fullUrl.match(/\/maps\/place\/([^\/]+)/);
        if (placeNameMatch) {
          const placeName = decodeURIComponent(placeNameMatch[1].replace(/\+/g, ' '));
          console.log(`🔍 Found place name: ${placeName}, searching...`);
          const searchedId = await this.searchPlaceByName(placeName, fullUrl);
          if (searchedId) {
            placeIds.push(searchedId);
          }
        }
      }

      return [...new Set(placeIds)]; // 去重
    } catch (error: any) {
      console.error('Error extracting place IDs from URL:', error.message);
      return [];
    }
  }

  /**
   * 解析短链接，获取重定向后的完整 URL
   */
  private async resolveShortUrl(url: string): Promise<string> {
    try {
      // 配置代理
      const proxyUrl = process.env.https_proxy || process.env.http_proxy;
      const axiosConfig: any = {
        timeout: 10000,
        maxRedirects: 10,
        validateStatus: () => true, // 接受所有状态码
      };

      if (proxyUrl) {
        const { HttpsProxyAgent } = require('https-proxy-agent');
        axiosConfig.httpsAgent = new HttpsProxyAgent(proxyUrl);
        axiosConfig.proxy = false;
      }

      const response = await axios.get(url, axiosConfig);
      
      // 返回最终的 URL（可能经过重定向）
      return response.request?.res?.responseUrl || url;
    } catch (error: any) {
      console.warn('Failed to resolve short URL, using original:', error.message);
      return url;
    }
  }

  /**
   * 从网页内容中提取 Place IDs
   * 适用于 Google Maps 列表页面
   */
  private async extractPlaceIdsFromWebPage(url: string): Promise<string[]> {
    try {
      // 配置代理
      const proxyUrl = process.env.https_proxy || process.env.http_proxy;
      const axiosConfig: any = {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      };

      if (proxyUrl) {
        const { HttpsProxyAgent } = require('https-proxy-agent');
        axiosConfig.httpsAgent = new HttpsProxyAgent(proxyUrl);
        axiosConfig.proxy = false;
      }

      const response = await axios.get(url, axiosConfig);
      const html = response.data;

      // 使用 cheerio 解析 HTML
      const $ = cheerio.load(html);
      const placeIds: string[] = [];

      // 方法 1: 从链接中提取
      $('a[href*="/maps/place/"]').each((_, element) => {
        const href = $(element).attr('href');
        if (href) {
          const match = href.match(/\/maps\/place\/[^\/]+\/([A-Za-z0-9_-]+)/);
          if (match) {
            placeIds.push(match[1]);
          }
        }
      });

      // 方法 2: 从 data 属性中提取
      $('[data-place-id]').each((_, element) => {
        const placeId = $(element).attr('data-place-id');
        if (placeId) {
          placeIds.push(placeId);
        }
      });

      // 方法 3: 从 JavaScript 代码中提取
      const scriptText = html;
      const placeIdRegex = /"([A-Za-z0-9_-]{27})"/g; // Google Place ID 通常是 27 字符
      let match;
      while ((match = placeIdRegex.exec(scriptText)) !== null) {
        const potentialPlaceId = match[1];
        // 简单验证：Place ID 通常包含大小写字母和数字
        if (/[A-Z]/.test(potentialPlaceId) && /[a-z]/.test(potentialPlaceId) && /[0-9]/.test(potentialPlaceId)) {
          placeIds.push(potentialPlaceId);
        }
      }

      return [...new Set(placeIds)]; // 去重
    } catch (error: any) {
      console.error('Error extracting place IDs from web page:', error.message);
      return [];
    }
  }

  /**
   * 从 Google Maps 链接批量导入地点到公共地点库
   * 包含 Place ID 去重逻辑
   */
  async importFromLink(
    url: string,
    sourceDetails?: { listName?: string; listDescription?: string }
  ): Promise<{
    success: number;
    failed: number;
    skipped: number;
    errors: string[];
    placeIds: string[];
  }> {
    try {
      console.log(`🚀 Starting import from Google Maps link...`);
      console.log(`🔗 URL: ${url}`);

      // 1. 提取 Place IDs
      const placeIds = await this.extractPlaceIdsFromLink(url);
      
      if (placeIds.length === 0) {
        throw new Error('No place IDs found in the provided URL. Please check if the link is valid.');
      }

      console.log(`📋 Found ${placeIds.length} place IDs`);
      console.log(`Place IDs:`, placeIds);

      // 2. 去重：检查哪些 Place ID 已经存在
      const existingPlaceIds = await this.checkExistingPlaceIds(placeIds);
      const newPlaceIds = placeIds.filter(id => !existingPlaceIds.includes(id));

      console.log(`✅ ${existingPlaceIds.length} places already exist (will skip)`);
      console.log(`🆕 ${newPlaceIds.length} new places to import`);

      // 3. 批量导入新地点
      const result = await publicPlaceService.batchAddByPlaceIds(
        newPlaceIds,
        'google_maps_link',
        {
          url,
          ...sourceDetails,
          importedAt: new Date().toISOString()
        }
      );

      return {
        success: result.success,
        failed: result.failed,
        skipped: existingPlaceIds.length,
        errors: result.errors,
        placeIds: placeIds
      };
    } catch (error: any) {
      console.error('❌ Error importing from link:', error.message);
      throw error;
    }
  }

  /**
   * 检查哪些 Place IDs 已经存在于数据库中
   */
  private async checkExistingPlaceIds(placeIds: string[]): Promise<string[]> {
    try {
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();

      const existingPlaces = await prisma.publicPlace.findMany({
        where: {
          placeId: {
            in: placeIds
          }
        },
        select: {
          placeId: true
        }
      });

      await prisma.$disconnect();

      return existingPlaces.map((p: any) => p.placeId);
    } catch (error: any) {
      console.error('Error checking existing place IDs:', error.message);
      return [];
    }
  }

  /**
   * 手动输入 Place IDs 进行导入（用于测试或手动导入）
   */
  async importByPlaceIds(
    placeIds: string[],
    sourceDetails?: any
  ): Promise<{
    success: number;
    failed: number;
    skipped: number;
    errors: string[];
  }> {
    try {
      console.log(`🚀 Starting import of ${placeIds.length} place IDs...`);

      // 去重
      const existingPlaceIds = await this.checkExistingPlaceIds(placeIds);
      const newPlaceIds = placeIds.filter(id => !existingPlaceIds.includes(id));

      console.log(`✅ ${existingPlaceIds.length} places already exist (will skip)`);
      console.log(`🆕 ${newPlaceIds.length} new places to import`);

      // 批量导入
      const result = await publicPlaceService.batchAddByPlaceIds(
        newPlaceIds,
        'manual',
        sourceDetails
      );

      return {
        success: result.success,
        failed: result.failed,
        skipped: existingPlaceIds.length,
        errors: result.errors
      };
    } catch (error: any) {
      console.error('❌ Error importing place IDs:', error.message);
      throw error;
    }
  }

  /**
   * 尝试将 hex feature ID 转换为 Place ID
   */
  private async convertHexFeatureIdToPlaceId(hexId: string): Promise<string | null> {
    // Hex feature ID 通常无法直接转换，需要通过搜索来获取 Place ID
    // 这里暂时返回 null，可以在后续添加更复杂的转换逻辑
    console.log(`⚠️ Hex feature ID conversion not yet supported: ${hexId}`);
    return null;
  }

  /**
   * 通过地点名称搜索 Place ID
   */
  private async searchPlaceByName(placeName: string, url: string): Promise<string | null> {
    try {
      // 从 URL 中提取坐标（如果有）
      const latMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      let location;
      if (latMatch) {
        location = {
          lat: parseFloat(latMatch[1]),
          lng: parseFloat(latMatch[2])
        };
      }

      // 使用 Google Maps API 搜索
      const googleMapsService = require('./googleMapsService').default;
      const results = await googleMapsService.textSearch(placeName, location);
      
      if (results && results.length > 0) {
        const placeId = results[0].place_id;
        console.log(`✅ Found place ID from search: ${placeId}`);
        return placeId;
      }

      return null;
    } catch (error: any) {
      console.error('Error searching place by name:', error.message);
      return null;
    }
  }
}

export default new GoogleMapsFavoritesService();
