/**
 * 测试 Google Maps 链接处理
 * 使用 Apify 抓取，调用 Google Maps API，并存储到公共地点库
 */

import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '.env') });

const GOOGLE_MAPS_URL = 'https://maps.app.goo.gl/pJpgevR4efjKicFz8';
const API_BASE_URL = 'http://localhost:3000';

interface ApifyConfig {
  apiToken: string;
  actorId: string;
}

class GoogleMapsLinkProcessor {
  private apifyConfig: ApifyConfig;
  private apifyBaseUrl = 'https://api.apify.com/v2';

  constructor() {
    this.apifyConfig = {
      apiToken: process.env.APIFY_API_TOKEN || '',
      actorId: process.env.APIFY_ACTOR_ID || 'compass/google-maps-scraper',
    };

    if (!this.apifyConfig.apiToken) {
      throw new Error('APIFY_API_TOKEN not set in environment variables');
    }
  }

  /**
   * Step 1: 展开短链接
   */
  async expandShortUrl(shortUrl: string): Promise<string> {
    try {
      console.log('🔗 Step 1: Expanding short URL...');
      console.log('   Input:', shortUrl);
      
      const response = await axios.get(shortUrl, {
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400,
      });

      const location = response.headers.location;
      if (location) {
        console.log('   ✅ Expanded:', location);
        return location;
      }

      return shortUrl;
    } catch (error: any) {
      if (error.response && error.response.headers.location) {
        const expandedUrl = error.response.headers.location;
        console.log('   ✅ Expanded:', expandedUrl);
        return expandedUrl;
      }
      
      console.log('   ⚠️  Using original URL');
      return shortUrl;
    }
  }

  /**
   * Step 2: 从 URL 提取 Place ID
   */
  extractPlaceIdFromUrl(url: string): string | null {
    console.log('🔍 Step 2: Extracting Place ID from URL...');
    console.log('   Analyzing:', url);

    // 方法 1: place_id 参数
    const placeIdMatch = url.match(/place_id=([A-Za-z0-9_-]+)/);
    if (placeIdMatch) {
      console.log('   ✅ Found Place ID (from parameter):', placeIdMatch[1]);
      return placeIdMatch[1];
    }

    // 方法 2: ChIJ 格式
    const chIJMatch = url.match(/ChIJ[A-Za-z0-9_-]+/);
    if (chIJMatch) {
      console.log('   ✅ Found Place ID (ChIJ format):', chIJMatch[0]);
      return chIJMatch[0];
    }

    // 方法 3: 从路径中提取 (某些 Google Maps URL 格式)
    const pathMatch = url.match(/\/place\/[^\/]+\/data=[^\/]+/);
    if (pathMatch) {
      console.log('   ℹ️  Found place path, needs further parsing');
    }

    console.log('   ⚠️  No Place ID found directly in URL');
    return null;
  }

  /**
   * Step 3: 使用 Apify 爬取地点详情
   */
  async scrapeWithApify(url: string): Promise<any[]> {
    console.log('🕷️  Step 3: Scraping with Apify...');
    
    const input = {
      startUrls: [{ url }],
      maxCrawledPlaces: 50,
      language: 'zh-CN',
      deeperCityScrape: false,
      scrapeDirectories: false,
      scrapeReviewsPersonalData: false,
      scrapePhotosFromBusinessPage: true,
      maxImages: 5,
      exportPlaceUrls: true,
      includeBusinessStatus: true,
    };

    console.log('   📋 Starting Apify Actor:', this.apifyConfig.actorId);

    // 启动爬取任务
    const runResponse = await axios.post(
      `${this.apifyBaseUrl}/acts/${this.apifyConfig.actorId}/runs?token=${this.apifyConfig.apiToken}`,
      input,
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const runId = runResponse.data.data.id;
    console.log('   ✅ Run ID:', runId);
    console.log('   ⏳ Waiting for completion...');

    // 等待完成
    const results = await this.waitForRunCompletion(runId);
    console.log(`   ✅ Scraped ${results.length} places`);
    
    // Debug: 打印完整结果
    if (results.length > 0) {
      console.log('   📋 First result:', JSON.stringify(results[0], null, 2));
    } else {
      console.log('   ⚠️  Empty results from Apify');
    }
    
    return results;
  }

  /**
   * 等待 Apify 任务完成
   */
  async waitForRunCompletion(runId: string): Promise<any[]> {
    const maxWaitTime = 120000; // 2 minutes
    const pollInterval = 3000; // 3 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const statusResponse = await axios.get(
        `${this.apifyBaseUrl}/actor-runs/${runId}?token=${this.apifyConfig.apiToken}`
      );

      const status = statusResponse.data.data.status;
      console.log(`   ⏳ Status: ${status}`);

      if (status === 'SUCCEEDED') {
        // 获取结果
        const datasetId = statusResponse.data.data.defaultDatasetId;
        const resultsResponse = await axios.get(
          `${this.apifyBaseUrl}/datasets/${datasetId}/items?token=${this.apifyConfig.apiToken}`
        );

        return resultsResponse.data;
      } else if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
        throw new Error(`Apify run ${status}`);
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('Apify run timeout');
  }

  /**
   * Step 4: 调用 Google Maps API 获取详细信息
   */
  async getPlaceDetails(placeId: string): Promise<any> {
    console.log('🗺️  Step 4: Fetching details from Google Maps API...');
    console.log('   Place ID:', placeId);

    try {
      // 这里可以直接调用你的后端 API
      const response = await axios.get(
        `https://maps.googleapis.com/maps/api/place/details/json`,
        {
          params: {
            place_id: placeId,
            key: process.env.GOOGLE_MAPS_API_KEY,
            language: 'zh-CN',
            fields: 'name,formatted_address,geometry,photos,rating,user_ratings_total,types,website,formatted_phone_number,opening_hours,price_level,reviews',
          },
        }
      );

      if (response.data.status === 'OK') {
        console.log('   ✅ Got place details:', response.data.result.name);
        return response.data.result;
      } else {
        throw new Error(`Google Maps API error: ${response.data.status}`);
      }
    } catch (error: any) {
      console.error('   ❌ Error fetching details:', error.message);
      throw error;
    }
  }

  /**
   * Step 5: 存储到公共地点库
   */
  async saveToDatabase(placeId: string): Promise<any> {
    console.log('💾 Step 5: Saving to public places library...');
    console.log('   API Endpoint:', `${API_BASE_URL}/api/public-places/add-by-place-id`);

    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/public-places/add-by-place-id`,
        { placeId },
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );

      console.log('   ✅ Saved successfully!');
      console.log('   Database ID:', response.data.id);
      console.log('   Place Name:', response.data.name);
      
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 409) {
        console.log('   ℹ️  Place already exists in database');
        return error.response.data;
      }
      console.error('   ❌ Error saving:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * 完整处理流程
   */
  async process(googleMapsUrl: string): Promise<void> {
    console.log('🚀 Starting Google Maps Link Processing');
    console.log('=' .repeat(60));
    console.log('');

    try {
      // Step 1: 展开短链接
      const expandedUrl = await this.expandShortUrl(googleMapsUrl);
      console.log('');

      // Step 2: 尝试直接提取 Place ID
      let placeId = this.extractPlaceIdFromUrl(expandedUrl);
      console.log('');

      // 如果直接提取失败，使用 Apify 爬取
      if (!placeId) {
        console.log('⚠️  Could not extract Place ID directly, using Apify scraper...');
        const scrapedPlaces = await this.scrapeWithApify(expandedUrl);
        
        if (scrapedPlaces.length === 0) {
          throw new Error('No places found by Apify scraper');
        }

        // 从爬取结果中提取 Place ID
        const firstPlace = scrapedPlaces[0];
        placeId = firstPlace.placeId || firstPlace.place_id;
        
        if (!placeId && firstPlace.url) {
          placeId = this.extractPlaceIdFromUrl(firstPlace.url);
        }

        if (!placeId) {
          console.error('Scraped data:', JSON.stringify(firstPlace, null, 2));
          throw new Error('Could not extract Place ID from Apify results');
        }

        console.log('✅ Extracted Place ID from Apify:', placeId);
        console.log('');
      }

      // Step 4 & 5: 获取详情并存储 (我们的 API 会自动调用 Google Maps API)
      const savedPlace = await this.saveToDatabase(placeId);
      console.log('');

      // 显示最终结果
      console.log('=' .repeat(60));
      console.log('✅ Processing Complete!');
      console.log('=' .repeat(60));
      console.log('Place Details:');
      console.log('  - ID:', savedPlace.id);
      console.log('  - Name:', savedPlace.name);
      console.log('  - Place ID:', savedPlace.placeId);
      console.log('  - Address:', savedPlace.address);
      console.log('  - Rating:', savedPlace.rating || 'N/A');
      console.log('  - Category:', savedPlace.category || 'N/A');
      console.log('');

      console.log('🎉 Successfully added to public places library!');
      
    } catch (error: any) {
      console.error('');
      console.error('=' .repeat(60));
      console.error('❌ Processing Failed');
      console.error('=' .repeat(60));
      console.error('Error:', error.message);
      if (error.response) {
        console.error('Response:', JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }
}

// 主函数
async function main() {
  const processor = new GoogleMapsLinkProcessor();
  await processor.process(GOOGLE_MAPS_URL);
}

// 运行
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
