/**
 * Test Apify Scraper with Place Details Add-on
 * 
 * This script tests the Apify Google Places scraper with the following configuration:
 * - Scrape place detail page enabled ($0.002 per result)
 * - Extract all required fields including images, opening hours, etc.
 * - Set isVerified = true for all imported places
 */

import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;
const APIFY_ACTOR_ID = 'compass/crawler-google-places'; // Official Google Places scraper
const APIFY_BASE_URL = 'https://api.apify.com/v2';

interface ApifyRunConfig {
  startUrls: Array<{ url: string }>;
  maxCrawledPlaces?: number;
  language?: string;
  // Add-on: Scrape place detail page
  scrapePlaceDetailPage?: boolean;
  // Image settings
  maxImages?: number;
  // Other settings
  includeWebResults?: boolean;
  deeperCityScrape?: boolean;
  scrapeDirectories?: boolean;
  proxyConfiguration?: {
    useApifyProxy: boolean;
  };
}

async function testApifyScraper(googleMapsUrl: string) {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                     APIFY SCRAPER TEST                                        ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  console.log('📋 Configuration:');
  console.log(`   API Token: ${APIFY_API_TOKEN?.substring(0, 20)}...`);
  console.log(`   Actor ID: ${APIFY_ACTOR_ID}`);
  console.log(`   URL: ${googleMapsUrl}`);
  console.log('');

  if (!APIFY_API_TOKEN) {
    console.error('❌ Error: APIFY_API_TOKEN not set in environment');
    process.exit(1);
  }

  try {
    // Configure scraper input with place details add-on enabled
    const input: ApifyRunConfig = {
      startUrls: [{ url: googleMapsUrl }],
      maxCrawledPlaces: 10, // Limit for testing
      language: 'en',
      
      // ⭐ Enable place detail page scraping (add-on: $0.002/result)
      scrapePlaceDetailPage: true,
      
      // Image settings (1 image is free)
      maxImages: 1,
      
      // Disable extra features to save costs
      includeWebResults: false,
      deeperCityScrape: false,
      scrapeDirectories: false,
      
      // Proxy configuration
      proxyConfiguration: {
        useApifyProxy: true,
      },
    };

    console.log('🚀 Starting Apify Actor...');
    console.log('📋 Input configuration:', JSON.stringify(input, null, 2));

    // Start the Actor run
    const runResponse = await axios.post(
      `${APIFY_BASE_URL}/acts/${encodeURIComponent(APIFY_ACTOR_ID)}/runs?token=${APIFY_API_TOKEN}`,
      input,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const runId = runResponse.data.data.id;
    console.log(`✅ Actor run started: ${runId}`);
    console.log(`🔗 View run: https://console.apify.com/actors/runs/${runId}`);
    console.log('');

    // Wait for completion
    console.log('⏳ Waiting for scraper to complete...');
    const results = await waitForCompletion(runId);

    console.log(`\n✅ Scraping complete! Found ${results.length} places`);
    console.log('');

    // Analyze results
    if (results.length > 0) {
      console.log('📊 Sample Result Analysis:');
      console.log('─'.repeat(80));
      
      const sample = results[0];
      console.log(`\n📍 Place: ${sample.title || 'N/A'}`);
      console.log(`   Place ID: ${sample.placeId || 'N/A'}`);
      console.log(`   City: ${sample.city || 'N/A'}`);
      console.log(`   Country: ${sample.countryCode || 'N/A'}`);
      console.log(`   Location: ${sample.location?.lat}, ${sample.location?.lng}`);
      console.log(`   Rating: ${sample.totalScore || 'N/A'} (${sample.reviewsCount || 0} reviews)`);
      console.log(`   Category: ${sample.categoryName || 'N/A'}`);
      console.log(`   Categories: ${sample.categories?.join(', ') || 'N/A'}`);
      console.log(`   Address: ${sample.address || 'N/A'}`);
      console.log(`   Phone: ${sample.phoneUnformatted || sample.phone || 'N/A'}`);
      console.log(`   Website: ${sample.website || 'N/A'}`);
      console.log(`   Price: ${sample.price || 'N/A'}`);
      console.log(`   Image URL: ${sample.imageUrl ? 'Yes' : 'No'}`);
      console.log(`   Opening Hours: ${sample.openingHours?.length || 0} entries`);
      console.log(`   Description: ${sample.description ? 'Yes' : 'No'}`);
      console.log('');

      // Field coverage analysis
      console.log('📈 Field Coverage:');
      console.log('─'.repeat(80));
      
      const fields = {
        'Place ID': 'placeId',
        'Name': 'title',
        'City': 'city',
        'Country': 'countryCode',
        'Latitude': 'location.lat',
        'Longitude': 'location.lng',
        'Image': 'imageUrl',
        'Category': 'categoryName',
        'Opening Hours': 'openingHours',
        'Address': 'address',
        'Phone': 'phoneUnformatted',
        'Website': 'website',
        'Description': 'description',
        'Rating': 'totalScore',
        'Review Count': 'reviewsCount',
        'Price': 'price',
      };

      for (const [label, field] of Object.entries(fields)) {
        const count = results.filter(r => {
          if (field.includes('.')) {
            const [parent, child] = field.split('.');
            return r[parent]?.[child] !== undefined && r[parent]?.[child] !== null;
          }
          return r[field] !== undefined && r[field] !== null && r[field] !== '';
        }).length;
        const percentage = ((count / results.length) * 100).toFixed(1);
        const status = count === results.length ? '✅' : count > 0 ? '⚠️ ' : '❌';
        console.log(`   ${status} ${label.padEnd(15)}: ${count}/${results.length} (${percentage}%)`);
      }

      console.log('');
      console.log('💡 Next Steps:');
      console.log('   1. If field coverage looks good, proceed with full import');
      console.log('   2. Use: npx tsx scripts/import-apify-places.ts --dataset <dataset-id>');
      console.log(`   3. Dataset ID: ${runResponse.data.data.defaultDatasetId}`);
    }

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

async function waitForCompletion(runId: string, maxWaitTime: number = 300000): Promise<any[]> {
  const startTime = Date.now();
  const pollInterval = 5000;

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const statusResponse = await axios.get(
        `${APIFY_BASE_URL}/actor-runs/${runId}?token=${APIFY_API_TOKEN}`
      );

      const status = statusResponse.data.data.status;
      const stats = statusResponse.data.data.stats;
      
      process.stdout.write(`\r   Status: ${status} | Compute units: ${stats?.computeUnits?.toFixed(4) || '0'}`);

      if (status === 'SUCCEEDED') {
        console.log(''); // New line after status updates
        
        const datasetId = statusResponse.data.data.defaultDatasetId;
        const resultsResponse = await axios.get(
          `${APIFY_BASE_URL}/datasets/${datasetId}/items?token=${APIFY_API_TOKEN}`
        );

        return resultsResponse.data;
      } else if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
        console.log(''); // New line
        throw new Error(`Actor run ${status.toLowerCase()}`);
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    } catch (error: any) {
      if (error.message.includes('Actor run')) {
        throw error;
      }
      console.error('\nError checking status:', error.message);
      throw error;
    }
  }

  throw new Error('Actor run timed out');
}

// Main execution
const testUrl = process.argv[2] || 'https://www.google.com/maps/search/coffee+in+paris';

testApifyScraper(testUrl).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
