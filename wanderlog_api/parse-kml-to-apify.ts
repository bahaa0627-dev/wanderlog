/**
 * KML to Apify Format Parser
 * 
 * Parses Google My Maps KML files and converts them to Apify-compatible format
 * for import into the database.
 * 
 * Usage:
 *   1. Download KML from Google My Maps:
 *      - Open your map
 *      - Click menu (3 dots) → Export to KML/KMZ
 *      - Download the KML file
 *   
 *   2. Run this script:
 *      npx tsx parse-kml-to-apify.ts <kml-file-path>
 *   
 *   3. Import the generated JSON:
 *      npx tsx scripts/import-apify-places.ts --file <output-json>
 */

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

interface KMLPlacemark {
  name: string;
  description?: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  placeId?: string;
  address?: string;
}

interface ApifyPlaceItem {
  title: string;
  placeId?: string;
  location: {
    lat: number;
    lng: number;
  };
  address?: string;
  city?: string;
  countryCode?: string;
  description?: string;
  // Fields to be filled by Google Places API
  categoryName?: string;
  categories?: string[];
  totalScore?: number;
  reviewsCount?: number;
  website?: string;
  phone?: string;
  phoneUnformatted?: string;
  openingHours?: Array<{ day: string; hours: string }>;
  imageUrl?: string;
  price?: string;
  scrapedAt?: string;
}

/**
 * Parse KML file and extract placemarks
 */
function parseKML(kmlContent: string): KMLPlacemark[] {
  const placemarks: KMLPlacemark[] = [];
  
  // Simple regex-based parsing (for basic KML structure)
  // For complex KML, consider using xml2js library
  
  // Match all <Placemark> blocks
  const placemarkRegex = /<Placemark>([\s\S]*?)<\/Placemark>/g;
  let match;
  
  while ((match = placemarkRegex.exec(kmlContent)) !== null) {
    const placemarkContent = match[1];
    
    // Extract name
    const nameMatch = placemarkContent.match(/<name>(.*?)<\/name>/);
    const name = nameMatch ? nameMatch[1].trim() : '';
    
    // Extract description
    const descMatch = placemarkContent.match(/<description>(.*?)<\/description>/s);
    const description = descMatch ? descMatch[1].trim().replace(/<[^>]*>/g, '') : '';
    
    // Extract coordinates
    const coordMatch = placemarkContent.match(/<coordinates>(.*?)<\/coordinates>/);
    if (coordMatch) {
      const coords = coordMatch[1].trim().split(',');
      if (coords.length >= 2) {
        const lng = parseFloat(coords[0]);
        const lat = parseFloat(coords[1]);
        
        if (!isNaN(lat) && !isNaN(lng)) {
          // Try to extract Place ID from description or name
          let placeId: string | undefined;
          const placeIdMatch = description.match(/ChIJ[A-Za-z0-9_-]+/);
          if (placeIdMatch) {
            placeId = placeIdMatch[0];
          }
          
          // Try to extract address
          let address: string | undefined;
          const addressMatch = description.match(/Address[:\s]+([^\n<]+)/i);
          if (addressMatch) {
            address = addressMatch[1].trim();
          }
          
          placemarks.push({
            name,
            description: description || undefined,
            coordinates: { lat, lng },
            placeId,
            address,
          });
        }
      }
    }
  }
  
  return placemarks;
}

/**
 * Enrich place data using Google Places API
 */
async function enrichWithGooglePlaces(placemark: KMLPlacemark): Promise<ApifyPlaceItem> {
  const baseItem: ApifyPlaceItem = {
    title: placemark.name,
    location: placemark.coordinates,
    description: placemark.description,
    scrapedAt: new Date().toISOString(),
  };
  
  if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === 'your_google_maps_api_key') {
    console.log(`   ⚠️  No Google Maps API key, using basic data for: ${placemark.name}`);
    return baseItem;
  }
  
  try {
    // If we have a Place ID, use Place Details API
    if (placemark.placeId) {
      const response = await axios.get(
        'https://maps.googleapis.com/maps/api/place/details/json',
        {
          params: {
            place_id: placemark.placeId,
            fields: 'name,place_id,formatted_address,geometry,rating,user_ratings_total,types,website,formatted_phone_number,international_phone_number,opening_hours,photos,price_level,address_components',
            key: GOOGLE_MAPS_API_KEY,
          },
        }
      );
      
      if (response.data.status === 'OK') {
        const place = response.data.result;
        
        // Extract city and country from address components
        let city: string | undefined;
        let countryCode: string | undefined;
        
        if (place.address_components) {
          for (const component of place.address_components) {
            if (component.types.includes('locality')) {
              city = component.long_name;
            }
            if (component.types.includes('country')) {
              countryCode = component.short_name;
            }
          }
        }
        
        // Map opening hours
        let openingHours: Array<{ day: string; hours: string }> | undefined;
        if (place.opening_hours?.weekday_text) {
          openingHours = place.opening_hours.weekday_text.map((text: string) => {
            const [day, ...hoursParts] = text.split(': ');
            return {
              day: day.trim(),
              hours: hoursParts.join(': ').trim(),
            };
          });
        }
        
        // Get first photo URL
        let imageUrl: string | undefined;
        if (place.photos && place.photos.length > 0) {
          const photoReference = place.photos[0].photo_reference;
          imageUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1600&photoreference=${photoReference}&key=${GOOGLE_MAPS_API_KEY}`;
        }
        
        // Map price level to text
        let price: string | undefined;
        if (place.price_level !== undefined) {
          const priceMap: Record<number, string> = {
            0: 'Free',
            1: '$',
            2: '$$',
            3: '$$$',
            4: '$$$$',
          };
          price = priceMap[place.price_level];
        }
        
        return {
          ...baseItem,
          title: place.name || baseItem.title,
          placeId: place.place_id,
          address: place.formatted_address,
          city,
          countryCode,
          location: {
            lat: place.geometry.location.lat,
            lng: place.geometry.location.lng,
          },
          categoryName: place.types?.[0]?.replace(/_/g, ' '),
          categories: place.types?.map((t: string) => t.replace(/_/g, ' ')),
          totalScore: place.rating,
          reviewsCount: place.user_ratings_total,
          website: place.website,
          phone: place.formatted_phone_number,
          phoneUnformatted: place.international_phone_number,
          openingHours,
          imageUrl,
          price,
        };
      }
    } else {
      // No Place ID, try to find place by coordinates and name
      const response = await axios.get(
        'https://maps.googleapis.com/maps/api/place/nearbysearch/json',
        {
          params: {
            location: `${placemark.coordinates.lat},${placemark.coordinates.lng}`,
            radius: 50, // 50 meters
            keyword: placemark.name,
            key: GOOGLE_MAPS_API_KEY,
          },
        }
      );
      
      if (response.data.status === 'OK' && response.data.results.length > 0) {
        const place = response.data.results[0];
        
        // Now get full details with the Place ID
        const enriched = await enrichWithGooglePlaces({
          ...placemark,
          placeId: place.place_id,
        });
        
        return enriched;
      }
    }
  } catch (error: any) {
    console.log(`   ⚠️  Error enriching ${placemark.name}: ${error.message}`);
  }
  
  return baseItem;
}

/**
 * Main function
 */
async function main() {
  const kmlFilePath = process.argv[2];
  
  if (!kmlFilePath) {
    console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                     KML TO APIFY FORMAT PARSER                                ║
╚══════════════════════════════════════════════════════════════════════════════╝

USAGE:
  npx tsx parse-kml-to-apify.ts <kml-file-path>

STEPS:
  1. Download KML from Google My Maps:
     - Open your map at https://www.google.com/maps/d/
     - Click menu (⋮) → Export to KML/KMZ
     - Download the KML file (not KMZ)
  
  2. Run this script:
     npx tsx parse-kml-to-apify.ts ./my-map.kml
  
  3. Import the generated JSON:
     npx tsx scripts/import-apify-places.ts --file ./my-map-apify.json

FEATURES:
  ✅ Extracts place names, coordinates, descriptions
  ✅ Enriches with Google Places API data (if API key configured)
  ✅ Gets full details: ratings, photos, hours, phone, website
  ✅ Outputs Apify-compatible JSON format
  ✅ Ready for direct import to database

REQUIREMENTS:
  - GOOGLE_MAPS_API_KEY in .env (optional but recommended)
  - Places API enabled in Google Cloud Console
`);
    process.exit(0);
  }
  
  // Check if file exists
  if (!fs.existsSync(kmlFilePath)) {
    console.error(`❌ Error: File not found: ${kmlFilePath}`);
    process.exit(1);
  }
  
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                     KML TO APIFY FORMAT PARSER                                ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
  
  console.log(`📂 Reading KML file: ${kmlFilePath}`);
  const kmlContent = fs.readFileSync(kmlFilePath, 'utf-8');
  
  console.log('🔍 Parsing KML...');
  const placemarks = parseKML(kmlContent);
  
  console.log(`✅ Found ${placemarks.length} places in KML\n`);
  
  if (placemarks.length === 0) {
    console.log('⚠️  No places found in KML file. Please check the file format.');
    process.exit(0);
  }
  
  // Show sample
  console.log('📋 Sample places:');
  placemarks.slice(0, 3).forEach((p, i) => {
    console.log(`   ${i + 1}. ${p.name} (${p.coordinates.lat}, ${p.coordinates.lng})`);
    if (p.placeId) console.log(`      Place ID: ${p.placeId}`);
  });
  console.log('');
  
  // Enrich with Google Places API
  if (GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY !== 'your_google_maps_api_key') {
    console.log('🌐 Enriching with Google Places API...');
    console.log('   This may take a while for large datasets...\n');
  } else {
    console.log('⚠️  GOOGLE_MAPS_API_KEY not configured');
    console.log('   Will use basic data from KML only');
    console.log('   To get full details, set GOOGLE_MAPS_API_KEY in .env\n');
  }
  
  const enrichedPlaces: ApifyPlaceItem[] = [];
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < placemarks.length; i++) {
    const placemark = placemarks[i];
    process.stdout.write(`\r   Processing ${i + 1}/${placemarks.length}: ${placemark.name.substring(0, 40).padEnd(40)}`);
    
    try {
      const enriched = await enrichWithGooglePlaces(placemark);
      enrichedPlaces.push(enriched);
      
      if (enriched.placeId && enriched.city && enriched.countryCode) {
        successCount++;
      } else {
        failCount++;
      }
      
      // Rate limiting: wait 100ms between requests
      if (GOOGLE_MAPS_API_KEY && i < placemarks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error: any) {
      console.log(`\n   ❌ Error processing ${placemark.name}: ${error.message}`);
      failCount++;
      
      // Add basic data even if enrichment fails
      enrichedPlaces.push({
        title: placemark.name,
        location: placemark.coordinates,
        description: placemark.description,
        scrapedAt: new Date().toISOString(),
      });
    }
  }
  
  console.log('\n');
  console.log(`✅ Processing complete!`);
  console.log(`   Fully enriched: ${successCount}`);
  console.log(`   Partial data: ${failCount}`);
  console.log('');
  
  // Save to JSON file
  const outputPath = kmlFilePath.replace(/\.kml$/i, '-apify.json');
  fs.writeFileSync(outputPath, JSON.stringify(enrichedPlaces, null, 2));
  
  console.log(`💾 Saved to: ${outputPath}`);
  console.log('');
  
  // Show statistics
  console.log('📊 Data Quality:');
  console.log('─'.repeat(80));
  
  const stats = {
    withPlaceId: enrichedPlaces.filter(p => p.placeId).length,
    withCity: enrichedPlaces.filter(p => p.city).length,
    withCountry: enrichedPlaces.filter(p => p.countryCode).length,
    withRating: enrichedPlaces.filter(p => p.totalScore).length,
    withImage: enrichedPlaces.filter(p => p.imageUrl).length,
    withHours: enrichedPlaces.filter(p => p.openingHours).length,
    withPhone: enrichedPlaces.filter(p => p.phoneUnformatted || p.phone).length,
    withWebsite: enrichedPlaces.filter(p => p.website).length,
  };
  
  const total = enrichedPlaces.length;
  Object.entries(stats).forEach(([key, count]) => {
    const percentage = ((count / total) * 100).toFixed(1);
    const label = key.replace(/^with/, '').padEnd(15);
    const status = count === total ? '✅' : count > total * 0.5 ? '⚠️ ' : '❌';
    console.log(`   ${status} ${label}: ${count}/${total} (${percentage}%)`);
  });
  
  console.log('');
  console.log('💡 Next Steps:');
  console.log(`   1. Review the generated file: ${outputPath}`);
  console.log(`   2. Import to database:`);
  console.log(`      npx tsx scripts/import-apify-places.ts --file ${outputPath}`);
  console.log('');
  console.log(`   3. Or dry-run first:`);
  console.log(`      npx tsx scripts/import-apify-places.ts --file ${outputPath} --dry-run`);
  console.log('');
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  process.exit(1);
});
