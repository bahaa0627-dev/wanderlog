/**
 * 智能 Google Maps 链接处理工具
 * 尝试多种方法来提取和导入地点
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '.env') });

const API_BASE_URL = 'http://localhost:3000';

interface ExtractResult {
  placeIds: string[];
  placesData: any[];
  method: string;
}

class SmartGoogleMapsExtractor {
  
  /**
   * 方法 1: 尝试从 HTML 中提取 Place ID
   */
  async extractFromHTML(url: string): Promise<ExtractResult> {
    console.log('🔍 Method 1: Extracting from HTML content...');
    
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      });

      const html = response.data;
      const $ = cheerio.load(html);
      
      // 尝试从各种可能的位置提取
      const placeIds: string[] = [];
      
      // 从 meta 标签提取
      $('meta').each((_, el) => {
        const content = $(el).attr('content') || '';
        const matches = content.match(/ChIJ[A-Za-z0-9_-]+/g);
        if (matches) {
          placeIds.push(...matches);
        }
      });
      
      // 从 script 标签提取
      $('script').each((_, el) => {
        const scriptContent = $(el).html() || '';
        const matches = scriptContent.match(/ChIJ[A-Za-z0-9_-]+/g);
        if (matches) {
          placeIds.push(...matches);
        }
      });
      
      // 从链接提取
      $('a[href*="place"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const match = href.match(/place_id=([A-Za-z0-9_-]+)/);
        if (match) {
          placeIds.push(match[1]);
        }
      });
      
      const uniquePlaceIds = [...new Set(placeIds)];
      console.log(`   Found ${uniquePlaceIds.length} Place IDs in HTML`);
      
      return {
        placeIds: uniquePlaceIds,
        placesData: [],
        method: 'HTML Parsing',
      };
    } catch (error: any) {
      console.log('   ❌ HTML extraction failed:', error.message);
      return { placeIds: [], placesData: [], method: 'HTML Parsing' };
    }
  }

  /**
   * 方法 2: 尝试从 URL 参数解码
   */
  extractFromURLParams(url: string): ExtractResult {
    console.log('🔍 Method 2: Decoding URL parameters...');
    
    const placeIds: string[] = [];
    
    try {
      // 解码 URL
      const decodedUrl = decodeURIComponent(url);
      console.log('   Decoded URL:', decodedUrl.substring(0, 200));
      
      // 提取所有可能的 ID
      const chIJMatches = decodedUrl.match(/ChIJ[A-Za-z0-9_-]+/g);
      if (chIJMatches) {
        placeIds.push(...chIJMatches);
      }
      
      // 尝试从 data 参数提取
      const dataMatch = url.match(/data=([^&]+)/);
      if (dataMatch) {
        const dataParam = decodeURIComponent(dataMatch[1]);
        console.log('   Data param:', dataParam.substring(0, 100));
        
        // 查找特殊格式的 ID
        const specialIds = dataParam.match(/2s([A-Za-z0-9_-]+)/g);
        if (specialIds) {
          console.log('   Found special IDs:', specialIds);
        }
      }
      
      const uniquePlaceIds = [...new Set(placeIds)];
      console.log(`   Found ${uniquePlaceIds.length} Place IDs in URL params`);
      
      return {
        placeIds: uniquePlaceIds,
        placesData: [],
        method: 'URL Parameter Decoding',
      };
    } catch (error: any) {
      console.log('   ❌ URL parsing failed:', error.message);
      return { placeIds: [], placesData: [], method: 'URL Parameter Decoding' };
    }
  }

  /**
   * 方法 3: 使用 Google Places API 的 findplacefromtext
   */
  async searchByText(searchQuery: string): Promise<ExtractResult> {
    console.log('🔍 Method 3: Searching by text...');
    console.log('   Query:', searchQuery);
    
    try {
      const response = await axios.get(
        'https://maps.googleapis.com/maps/api/place/findplacefromtext/json',
        {
          params: {
            input: searchQuery,
            inputtype: 'textquery',
            fields: 'place_id,name,formatted_address',
            key: process.env.GOOGLE_MAPS_API_KEY,
          },
        }
      );

      if (response.data.status === 'OK' && response.data.candidates.length > 0) {
        const placeIds = response.data.candidates.map((c: any) => c.place_id);
        console.log(`   Found ${placeIds.length} places by text search`);
        
        return {
          placeIds,
          placesData: response.data.candidates,
          method: 'Text Search',
        };
      }
      
      console.log('   ❌ No results from text search');
      return { placeIds: [], placesData: [], method: 'Text Search' };
    } catch (error: any) {
      console.log('   ❌ Text search failed:', error.message);
      return { placeIds: [], placesData: [], method: 'Text Search' };
    }
  }

  /**
   * 展开短链接
   */
  async expandUrl(url: string): Promise<string> {
    try {
      const response = await axios.get(url, {
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400,
      });
      return response.headers.location || url;
    } catch (error: any) {
      if (error.response?.headers.location) {
        return error.response.headers.location;
      }
      return url;
    }
  }

  /**
   * 存储到数据库
   */
  async savePlaces(placeIds: string[]): Promise<void> {
    console.log(`\n💾 Saving ${placeIds.length} places to database...`);
    
    for (let i = 0; i < placeIds.length; i++) {
      const placeId = placeIds[i];
      console.log(`\n[${i + 1}/${placeIds.length}] Processing: ${placeId}`);
      
      try {
        const response = await axios.post(
          `${API_BASE_URL}/api/public-places/add-by-place-id`,
          { placeId },
          { headers: { 'Content-Type': 'application/json' } }
        );
        
        console.log(`   ✅ Saved: ${response.data.name}`);
      } catch (error: any) {
        if (error.response?.status === 409) {
          console.log(`   ℹ️  Already exists`);
        } else {
          console.log(`   ❌ Failed: ${error.response?.data?.error || error.message}`);
        }
      }
      
      // 延迟避免 API 限制
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  /**
   * 主处理流程
   */
  async process(googleMapsUrl: string, searchQuery?: string): Promise<void> {
    console.log('🚀 Smart Google Maps Link Processing');
    console.log('=' .repeat(70));
    console.log('URL:', googleMapsUrl);
    if (searchQuery) {
      console.log('Search Query:', searchQuery);
    }
    console.log('=' .repeat(70));
    console.log('');

    try {
      // Step 1: 展开链接
      console.log('📍 Step 1: Expanding URL...');
      const expandedUrl = await this.expandUrl(googleMapsUrl);
      console.log('   Expanded:', expandedUrl);
      console.log('');

      // Step 2: 尝试多种方法提取 Place IDs
      const results: ExtractResult[] = [];

      // 方法 1: HTML 解析
      results.push(await this.extractFromHTML(expandedUrl));
      console.log('');

      // 方法 2: URL 参数解码
      results.push(this.extractFromURLParams(expandedUrl));
      console.log('');

      // 方法 3: 如果提供了搜索关键词，尝试文本搜索
      if (searchQuery) {
        results.push(await this.searchByText(searchQuery));
        console.log('');
      }

      // 合并所有结果
      const allPlaceIds = results.reduce((acc, r) => [...acc, ...r.placeIds], [] as string[]);
      const uniquePlaceIds = [...new Set(allPlaceIds)];

      console.log('=' .repeat(70));
      console.log('📊 Summary:');
      results.forEach(r => {
        console.log(`   ${r.method}: ${r.placeIds.length} Place IDs`);
      });
      console.log(`   Total unique: ${uniquePlaceIds.length}`);
      console.log('=' .repeat(70));
      console.log('');

      if (uniquePlaceIds.length === 0) {
        console.log('❌ No Place IDs found with any method.');
        console.log('');
        console.log('💡 Suggestions:');
        console.log('   1. Open the link in a browser and manually get place links');
        console.log('   2. If this is a list, click on individual places');
        console.log('   3. Provide a search query as the second parameter');
        console.log('');
        console.log('   Example: node test_smart_extraction.ts <url> "Paris France"');
        return;
      }

      // Step 3: 保存到数据库
      await this.savePlaces(uniquePlaceIds);

      console.log('');
      console.log('=' .repeat(70));
      console.log('✅ Processing Complete!');
      console.log('=' .repeat(70));

      // 显示统计
      const statsResponse = await axios.get(`${API_BASE_URL}/api/public-places/stats`);
      console.log('\n📊 Current Database Stats:');
      console.log(JSON.stringify(statsResponse.data.data, null, 2));

    } catch (error: any) {
      console.error('\n❌ Error:', error.message);
      throw error;
    }
  }
}

// 主函数
async function main() {
  const url = process.argv[2] || 'https://maps.app.goo.gl/pJpgevR4efjKicFz8';
  const searchQuery = process.argv[3];

  const extractor = new SmartGoogleMapsExtractor();
  await extractor.process(url, searchQuery);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
