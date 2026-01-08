/**
 * Export Places to GeoJSON for Google My Maps Import
 * 
 * Exports places from database to GeoJSON format that can be imported
 * into Google My Maps.
 * 
 * Usage:
 *   npx tsx scripts/export-to-geojson.ts [options]
 * 
 * Options:
 *   --country <code>     Filter by country code (e.g., IT, FR, US)
 *   --city <name>        Filter by city name
 *   --category <slug>    Filter by category slug
 *   --verified           Only export verified places
 *   --limit <number>     Limit number of places (default: 1000)
 *   --output <file>      Output file path (default: ./export-TIMESTAMP.geojson)
 * 
 * Examples:
 *   # Export all verified places in Rome
 *   npx tsx scripts/export-to-geojson.ts --city Rome --verified
 * 
 *   # Export all architecture in Italy
 *   npx tsx scripts/export-to-geojson.ts --country IT --category architecture
 * 
 *   # Export first 500 places
 *   npx tsx scripts/export-to-geojson.ts --limit 500
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface ExportOptions {
  country?: string;
  city?: string;
  category?: string;
  verified?: boolean;
  limit?: number;
  output?: string;
  source?: string;
  startsWith?: string;
}

/**
 * Parse command line arguments
 */
function parseArgs(): ExportOptions {
  const args = process.argv.slice(2);
  const options: ExportOptions = {
    limit: 1000,
  };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--country':
        options.country = args[++i];
        break;
      case '--city':
        options.city = args[++i];
        break;
      case '--category':
        options.category = args[++i];
        break;
      case '--verified':
        options.verified = true;
        break;
      case '--limit':
        options.limit = parseInt(args[++i]);
        break;
      case '--output':
        options.output = args[++i];
        break;
      case '--source':
        options.source = args[++i];
        break;
      case '--starts-with':
        options.startsWith = args[++i];
        break;
    }
  }
  
  return options;
}

/**
 * Fetch places from database
 */
async function fetchPlaces(options: ExportOptions): Promise<any[]> {
  let query = supabase
    .from('places')
    .select('*')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);
  
  if (options.country) {
    query = query.eq('country', options.country);
  }
  
  if (options.city) {
    query = query.ilike('city', `%${options.city}%`);
  }
  
  if (options.category) {
    query = query.eq('category_slug', options.category);
  }
  
  if (options.verified) {
    query = query.eq('is_verified', true);
  }
  
  if (options.source) {
    query = query.eq('source', options.source);
  }
  
  if (options.startsWith) {
    const letter = options.startsWith.toUpperCase();
    query = query.ilike('name', `${letter}%`);
  }
  
  // Order by name for consistent results
  query = query.order('name', { ascending: true });
  
  if (options.limit) {
    query = query.limit(options.limit);
  }
  
  const { data, error } = await query;
  
  if (error) {
    throw new Error(`Failed to fetch places: ${error.message}`);
  }
  
  return data || [];
}

/**
 * Convert places to GeoJSON
 */
function convertToGeoJSON(places: any[]): any {
  const features = places.map(place => {
    // Build description with all available info
    const descParts: string[] = [];
    
    if (place.description) {
      descParts.push(place.description);
    }
    
    if (place.address) {
      descParts.push(`📍 ${place.address}`);
    }
    
    if (place.phone) {
      descParts.push(`📞 ${place.phone}`);
    }
    
    if (place.website) {
      descParts.push(`🌐 ${place.website}`);
    }
    
    if (place.rating) {
      descParts.push(`⭐ ${place.rating}/5 (${place.user_ratings_total || 0} reviews)`);
    }
    
    if (place.opening_hours) {
      descParts.push(`🕐 ${place.opening_hours}`);
    }
    
    if (place.price_level) {
      descParts.push(`💰 ${'$'.repeat(place.price_level)}`);
    }
    
    if (place.category_slug) {
      descParts.push(`🏷️ ${place.category_slug}`);
    }
    
    // Add metadata
    if (place.wikidata_id) {
      descParts.push(`Wikidata: ${place.wikidata_id}`);
    }
    
    if (place.google_place_id) {
      descParts.push(`Place ID: ${place.google_place_id}`);
    }
    
    return {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [place.longitude, place.latitude],
      },
      properties: {
        name: place.name,
        description: descParts.join('\n\n'),
        // Additional properties for reference
        city: place.city,
        country: place.country,
        category: place.category_slug,
        verified: place.is_verified,
        rating: place.rating,
        place_id: place.google_place_id,
        wikidata_id: place.wikidata_id,
      },
    };
  });
  
  return {
    type: 'FeatureCollection',
    features,
  };
}

/**
 * Main function
 */
async function main() {
  const options = parseArgs();
  
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                     EXPORT PLACES TO GEOJSON                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
  
  // Show filters
  console.log('📋 Export filters:');
  if (options.source) console.log(`   Source: ${options.source}`);
  if (options.startsWith) console.log(`   Starts with: ${options.startsWith}`);
  if (options.country) console.log(`   Country: ${options.country}`);
  if (options.city) console.log(`   City: ${options.city}`);
  if (options.category) console.log(`   Category: ${options.category}`);
  if (options.verified) console.log(`   Verified only: Yes`);
  console.log(`   Limit: ${options.limit}`);
  console.log('');
  
  // Fetch places
  console.log('🔍 Fetching places from database...');
  const places = await fetchPlaces(options);
  console.log(`✅ Found ${places.length} places\n`);
  
  if (places.length === 0) {
    console.log('⚠️  No places found matching the filters.');
    process.exit(0);
  }
  
  // Show statistics
  const stats = {
    countries: new Set(places.map(p => p.country).filter(Boolean)).size,
    cities: new Set(places.map(p => p.city).filter(Boolean)).size,
    categories: new Set(places.map(p => p.category_slug).filter(Boolean)).size,
    verified: places.filter(p => p.is_verified).length,
    withRating: places.filter(p => p.rating).length,
    withImage: places.filter(p => p.cover_image).length,
  };
  
  console.log('📊 Export statistics:');
  console.log(`   Total places: ${places.length}`);
  console.log(`   Countries: ${stats.countries}`);
  console.log(`   Cities: ${stats.cities}`);
  console.log(`   Categories: ${stats.categories}`);
  console.log(`   Verified: ${stats.verified} (${((stats.verified / places.length) * 100).toFixed(1)}%)`);
  console.log(`   With rating: ${stats.withRating} (${((stats.withRating / places.length) * 100).toFixed(1)}%)`);
  console.log(`   With image: ${stats.withImage} (${((stats.withImage / places.length) * 100).toFixed(1)}%)`);
  console.log('');
  
  // Convert to GeoJSON
  console.log('🔄 Converting to GeoJSON...');
  const geojson = convertToGeoJSON(places);
  
  // Generate output filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const outputPath = options.output || `./export-${timestamp}.geojson`;
  
  // Save to file
  fs.writeFileSync(outputPath, JSON.stringify(geojson, null, 2));
  console.log(`✅ Saved to: ${outputPath}\n`);
  
  // Show sample
  console.log('📋 Sample places:');
  places.slice(0, 3).forEach((p, i) => {
    console.log(`   ${i + 1}. ${p.name}`);
    console.log(`      ${p.city}, ${p.country}`);
    console.log(`      ${p.latitude}, ${p.longitude}`);
    if (p.rating) console.log(`      ⭐ ${p.rating}/5`);
  });
  console.log('');
  
  console.log('💡 Next steps:');
  console.log('   1. Go to https://www.google.com/mymaps');
  console.log('   2. Create a new map or open existing one');
  console.log('   3. Click "Import" in the left panel');
  console.log(`   4. Upload the file: ${outputPath}`);
  console.log('   5. Select "latitude" and "longitude" as coordinates');
  console.log('   6. Select "name" as the marker title');
  console.log('');
  console.log('✨ Your places will appear on Google My Maps!');
  console.log('');
}

main().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
