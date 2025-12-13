/**
 * 测试不同的 Apify Actor 来处理 Google Maps 列表
 */

import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '.env') });

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
const BASE_URL = 'https://api.apify.com/v2';

// 测试多个可能的 Actor
const ACTORS = [
  {
    id: 'compass/google-maps-scraper',
    name: 'Compass Google Maps Scraper',
  },
  {
    id: 'nwua9Gu5YrADL7ZDj',
    name: 'Google Maps Reviews Scraper',
  },
  {
    id: 'drobnikj/crawler-google-places',
    name: 'Google Places Crawler',
  },
];

async function testApifyActor(actorId: string, actorName: string, url: string) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Testing: ${actorName}`);
  console.log(`Actor ID: ${actorId}`);
  console.log('='.repeat(70));

  try {
    // 尝试不同的配置
    const configs = [
      {
        name: 'Config 1: Direct URL',
        input: {
          startUrls: [{ url }],
          maxCrawledPlaces: 50,
          language: 'zh-CN',
        },
      },
      {
        name: 'Config 2: With search mode',
        input: {
          startUrls: [{ url }],
          maxCrawledPlaces: 50,
          language: 'zh-CN',
          searchMode: 'list',
        },
      },
      {
        name: 'Config 3: Extended fields',
        input: {
          startUrls: [{ url }],
          maxCrawledPlaces: 50,
          language: 'zh-CN',
          includeWebResults: true,
          exportPlaceUrls: true,
          scrapeDirectories: true,
        },
      },
    ];

    for (const config of configs) {
      console.log(`\n  📋 ${config.name}...`);
      
      try {
        const runResponse = await axios.post(
          `${BASE_URL}/acts/${actorId}/runs?token=${APIFY_TOKEN}`,
          config.input,
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 5000,
          }
        );

        const runId = runResponse.data.data.id;
        console.log(`  ✅ Started: ${runId}`);
        
        // 等待一段时间
        await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds

        // 检查状态
        const statusResponse = await axios.get(
          `${BASE_URL}/actor-runs/${runId}?token=${APIFY_TOKEN}`
        );

        const status = statusResponse.data.data.status;
        console.log(`  📊 Status: ${status}`);

        if (status === 'SUCCEEDED') {
          const datasetId = statusResponse.data.data.defaultDatasetId;
          const resultsResponse = await axios.get(
            `${BASE_URL}/datasets/${datasetId}/items?token=${APIFY_TOKEN}`
          );

          const results = resultsResponse.data;
          console.log(`  🎉 SUCCESS! Found ${results.length} items`);
          
          if (results.length > 0) {
            console.log(`  📋 Sample keys:`, Object.keys(results[0]).slice(0, 10));
            
            // 检查是否有 placeId
            const placeIds = results
              .map((r: any) => r.placeId || r.place_id || null)
              .filter(Boolean);
            
            console.log(`  🆔 Place IDs found: ${placeIds.length}`);
            if (placeIds.length > 0) {
              console.log(`  📍 Sample Place IDs:`, placeIds.slice(0, 3));
            }
          }
          
          return { success: true, count: results.length };
        } else {
          console.log(`  ⏳ Still running: ${status}`);
        }
      } catch (error: any) {
        console.log(`  ❌ Failed: ${error.message}`);
      }
    }
  } catch (error: any) {
    console.log(`\n❌ Actor test failed: ${error.message}`);
  }

  return { success: false, count: 0 };
}

async function main() {
  const testUrl = 'https://maps.app.goo.gl/pJpgevR4efjKicFz8';
  
  console.log('🚀 Testing Different Apify Actors for Google Maps Lists');
  console.log('URL:', testUrl);
  console.log('='.repeat(70));

  if (!APIFY_TOKEN) {
    console.error('❌ APIFY_API_TOKEN not found in environment');
    process.exit(1);
  }

  console.log('✅ Apify Token:', APIFY_TOKEN.substring(0, 20) + '...');

  for (const actor of ACTORS) {
    await testApifyActor(actor.id, actor.name, testUrl);
  }

  console.log('\n' + '='.repeat(70));
  console.log('Testing Complete');
  console.log('='.repeat(70));
}

main().catch(console.error);
