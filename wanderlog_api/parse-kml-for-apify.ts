/**
 * KML Parser for Apify Import
 * 
 * Extracts Place IDs from Google My Maps KML files, then uses Apify to scrape
 * full details. This avoids direct Google Places API calls.
 * 
 * Workflow:
 *   1. Parse KML to extract place names and coordinates
 *   2. Try to extract Place IDs from KML (if available)
 *   3. For places without Place IDs, create search URLs
 *   4. Use Apify to scrape all places with full details
 * 
 * Usage:
 *   npx tsx parse-kml-for-apify.ts <kml-file-path>
 */

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;
const APIFY_ACTOR_ID = 'compass/crawler-google-places';
const APIFY_BASE_URL = 'https://api.apify.com/v2';

interface KMLPlace {
  name: string;
  description?: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  placeId?: string;
  url?: string;
}

/**
 * Parse KML file and extract places
 */
function parseKML(kmlContent: string): KMLPlace[] {
  const places: KMLPlace[] = [];
  
  // Match all <Placemark> blocks
  const placemarkRegex = /<Placemark>([\s\S]*?)<\/Placemark>/g;
  let match;
  
  while ((match = placemarkRegex.exec(kmlContent)) !== null) {
    const placemarkContent = match[1];
    
    // Skip if this is a LineString (route), we only want Points (places)
    if (placemarkContent.includes('<LineString>')) {
      continue;
    }
    
    // Extract name
    const nameMatch = placemarkContent.match(/<name><!\[CDATA\[(.*?)\]\]><\/name>|<name>(.*?)<\/name>/);
    const name = nameMatch ? (nameMatch[1] || nameMatch[2]).trim() : '';
    
    // Extract description
    const descMatch = placemarkContent.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>|<description>([\s\S]*?)<\/description>/);
    const description = descMatch ? (descMatch[1] || descMatch[2]).trim() : '';
    
    // Extract coordinates from Point
    const coordMatch = placemarkContent.match(/<Point>[\s\S]*?<coordinates>\s*([\d.,\s-]+)\s*<\/coordinates>[\s\S]*?<\/Point>/);
    if (coordMatch && name) {
      const coords = coordMatch[1].trim().split(',');
      if (coords.length >= 2) {
        const lng = parseFloat(coords[0]);
        const lat = parseFloat(coords[1]);
        
        if (!isNaN(lat) && !isNaN(lng)) {
          // Try to extract Place ID from description
          let placeId: string | undefined;
          let url: string | undefined;
          
          // Look for Place ID in various formats
          const placeIdMatch = description.match(/ChIJ[A-Za-z0-9_-]+/);
          if (placeIdMatch) {
            placeId = placeIdMatch[0];
          }
          
          // Look for Google Maps URL
          const urlMatch = description.match(/https?:\/\/(?:www\.)?google\.com\/maps\/[^\s"<]+/);
          if (urlMatch) {
            url = urlMatch[0];
            // Try to extract Place ID from URL
            const urlPlaceIdMatch = url.match(/place_id=([A-Za-z0-9_-]+)/);
            if (urlPlaceIdMatch) {
              placeId = urlPlaceIdMatch[1];
            }
          }
          
          places.push({
            name,
            description: description || undefined,
            coordinates: { lat, lng },
            placeId,
            url,
          });
        }
      }
    }
  }
  
  return places;
}

/**
 * Generate Google Maps search URLs for places without Place IDs
 */
function generateSearchUrls(places: KMLPlace[]): string[] {
  const urls: string[] = [];
  
  for (const place of places) {
    if (place.placeId) {
      // Use Place ID URL
      urls.push(`https://www.google.com/maps/place/?q=place_id:${place.placeId}`);
    } else if (place.url) {
      // Use existing URL
      urls.push(place.url);
    } else {
      // Create search URL with coordinates
      const query = encodeURIComponent(place.name);
      urls.push(`https://www.google.com/maps/search/${query}/@${place.coordinates.lat},${place.coordinates.lng},17z`);
    }
  }
  
  return urls;
}

/**
 * Use Apify to scrape places
 */
async function scrapeWithApify(urls: string[]): Promise<any> {
  if (!APIFY_API_TOKEN) {
    throw new Error('APIFY_API_TOKEN not configured in .env');
  }
  
  console.log(`\n🕷️  Starting Apify scraper for ${urls.length} places...`);
  
  // Configure Apify input
  const input = {
    startUrls: urls.map(url => ({ url })),
    maxCrawledPlaces: urls.length,
    maxCrawledPlacesPerSearch: 1, // Only get the exact place, not nearby
    language: 'en',
    
    // ⭐ Enable place detail page scraping
    scrapePlaceDetailPage: true,
    
    // Don't set maxImages - default includes 1 free image
    // Setting maxImages explicitly triggers the image scraping add-on
    
    // Disable extra features
    includeWebResults: false,
    deeperCityScrape: false,
    scrapeDirectories: false,
    
    // Proxy configuration
    proxyConfiguration: {
      useApifyProxy: true,
    },
  };
  
  console.log('📋 Apify configuration:');
  console.log(`   Places to scrape: ${urls.length}`);
  console.log(`   Place detail page: enabled ($0.002/place)`);
  console.log(`   Images: default (1 free per place)`);
  console.log('');
  
  // Start Actor run
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
  console.log(`✅ Apify run started: ${runId}`);
  console.log(`🔗 View run: https://console.apify.com/actors/runs/${runId}`);
  console.log('');
  
  // Wait for completion
  console.log('⏳ Waiting for scraper to complete...');
  const results = await waitForCompletion(runId);
  
  return {
    runId,
    datasetId: runResponse.data.data.defaultDatasetId,
    results,
  };
}

/**
 * Wait for Apify run to complete
 */
async function waitForCompletion(runId: string, maxWaitTime: number = 600000): Promise<any[]> {
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
        console.log(''); // New line
        
        const datasetId = statusResponse.data.data.defaultDatasetId;
        const resultsResponse = await axios.get(
          `${APIFY_BASE_URL}/datasets/${datasetId}/items?token=${APIFY_API_TOKEN}`
        );
        
        return resultsResponse.data;
      } else if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
        console.log(''); // New line
        throw new Error(`Apify run ${status.toLowerCase()}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    } catch (error: any) {
      if (error.message.includes('Apify run')) {
        throw error;
      }
      console.error('\nError checking status:', error.message);
      throw error;
    }
  }
  
  throw new Error('Apify run timed out');
}

/**
 * Main function
 */
async function main() {
  const kmlFilePath = process.argv[2];
  
  if (!kmlFilePath) {
    console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                     KML PARSER FOR APIFY IMPORT                               ║
╚══════════════════════════════════════════════════════════════════════════════╝

USAGE:
  npx tsx parse-kml-for-apify.ts <kml-file-path>

WORKFLOW:
  1. Parse KML to extract place names, coordinates, Place IDs
  2. Generate Google Maps URLs for Apify scraping
  3. Use Apify to scrape full details (ratings, photos, hours, etc.)
  4. Save results in Apify format for direct import

ADVANTAGES:
  ✅ No direct Google Places API calls
  ✅ Uses Apify credits instead
  ✅ Gets all fields: ratings, photos, hours, phone, website
  ✅ Apify cost: ~$0.002/place (place detail page add-on)
  ✅ Output ready for direct import

STEPS:
  1. Download KML from Google My Maps
  2. Run: npx tsx parse-kml-for-apify.ts ./my-map.kml
  3. Wait for Apify to scrape (may take several minutes)
  4. Import: npx tsx scripts/import-apify-places.ts --file ./my-map-apify.json

REQUIREMENTS:
  - APIFY_API_TOKEN in .env
  - Apify account with credits
`);
    process.exit(0);
  }
  
  // Check if file exists
  if (!fs.existsSync(kmlFilePath)) {
    console.error(`❌ Error: File not found: ${kmlFilePath}`);
    process.exit(1);
  }
  
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                     KML PARSER FOR APIFY IMPORT                               ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
  
  console.log(`📂 Reading KML file: ${kmlFilePath}`);
  const kmlContent = fs.readFileSync(kmlFilePath, 'utf-8');
  
  console.log('🔍 Parsing KML...');
  const places = parseKML(kmlContent);
  
  console.log(`✅ Found ${places.length} places in KML\n`);
  
  if (places.length === 0) {
    console.log('⚠️  No places found in KML file. Please check the file format.');
    process.exit(0);
  }
  
  // Show statistics
  const withPlaceId = places.filter(p => p.placeId).length;
  const withUrl = places.filter(p => p.url).length;
  const needsSearch = places.length - withPlaceId - withUrl;
  
  console.log('📊 KML Analysis:');
  console.log(`   Total places: ${places.length}`);
  console.log(`   With Place ID: ${withPlaceId}`);
  console.log(`   With URL: ${withUrl}`);
  console.log(`   Needs search: ${needsSearch}`);
  console.log('');
  
  // Show sample
  console.log('📋 Sample places:');
  places.slice(0, 3).forEach((p, i) => {
    console.log(`   ${i + 1}. ${p.name}`);
    console.log(`      Location: ${p.coordinates.lat}, ${p.coordinates.lng}`);
    if (p.placeId) console.log(`      Place ID: ${p.placeId}`);
  });
  console.log('');
  
  // Generate URLs for Apify
  console.log('🔗 Generating Google Maps URLs...');
  const urls = generateSearchUrls(places);
  console.log(`✅ Generated ${urls.length} URLs\n`);
  
  // Scrape with Apify
  try {
    const { runId, datasetId, results } = await scrapeWithApify(urls);
    
    console.log(`\n✅ Scraping complete!`);
    console.log(`   Places scraped: ${results.length}/${places.length}`);
    console.log(`   Dataset ID: ${datasetId}`);
    console.log('');
    
    // Save results
    const outputPath = kmlFilePath.replace(/\.kml$/i, '-apify.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    
    console.log(`💾 Saved to: ${outputPath}`);
    console.log('');
    
    // Show data quality
    console.log('📊 Data Quality:');
    console.log('─'.repeat(80));
    
    const stats = {
      withPlaceId: results.filter((r: any) => r.placeId).length,
      withCity: results.filter((r: any) => r.city).length,
      withCountry: results.filter((r: any) => r.countryCode).length,
      withRating: results.filter((r: any) => r.totalScore).length,
      withImage: results.filter((r: any) => r.imageUrl).length,
      withHours: results.filter((r: any) => r.openingHours).length,
      withPhone: results.filter((r: any) => r.phoneUnformatted || r.phone).length,
      withWebsite: results.filter((r: any) => r.website).length,
    };
    
    const total = results.length;
    Object.entries(stats).forEach(([key, count]) => {
      const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
      const label = key.replace(/^with/, '').padEnd(15);
      const status = count === total ? '✅' : count > total * 0.5 ? '⚠️ ' : '❌';
      console.log(`   ${status} ${label}: ${count}/${total} (${percentage}%)`);
    });
    
    console.log('');
    console.log('💰 Estimated Cost:');
    console.log(`   Apify place details: ${results.length} × $0.002 = $${(results.length * 0.002).toFixed(2)}`);
    console.log(`   Compute units: Check Apify console for exact cost`);
    console.log('');
    
    console.log('💡 Next Steps:');
    console.log(`   1. Review the generated file: ${outputPath}`);
    console.log(`   2. Import to database:`);
    console.log(`      npx tsx scripts/import-apify-places.ts --file ${outputPath}`);
    console.log('');
    console.log(`   3. Or dry-run first:`);
    console.log(`      npx tsx scripts/import-apify-places.ts --file ${outputPath} --dry-run`);
    console.log('');
    
  } catch (error: any) {
    console.error('\n❌ Error during Apify scraping:', error.message);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  process.exit(1);
});
