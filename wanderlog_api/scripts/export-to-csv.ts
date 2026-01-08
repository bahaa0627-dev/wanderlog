/**
 * Export Places to CSV for Google My Maps Import
 * 
 * Exports places from database to CSV format that Google My Maps can import.
 * CSV format is more reliable than GeoJSON for Google My Maps.
 * 
 * Usage:
 *   npx tsx scripts/export-to-csv.ts [options]
 * 
 * Options:
 *   --country <code>     Filter by country code (e.g., IT, FR, US)
 *   --city <name>        Filter by city name
 *   --category <slug>    Filter by category slug
 *   --verified           Only export verified places
 *   --source <name>      Filter by source (e.g., wikidata, apify)
 *   --starts-with <letter> Filter by first letter of name
 *   --limit <number>     Limit number of places (default: 1000)
 *   --output <file>      Output file path (default: ./export-TIMESTAMP.csv)
 * 
 * Examples:
 *   # Export Wikidata places starting with A
 *   npx tsx scripts/export-to-csv.ts --source wikidata --starts-with A --limit 100
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
  offset?: number;
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
      case '--offset':
        options.offset = parseInt(args[++i]);
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
  
  if (options.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 1000) - 1);
  } else if (options.limit) {
    query = query.limit(options.limit);
  }
  
  const { data, error } = await query;
  
  if (error) {
    throw new Error(`Failed to fetch places: ${error.message}`);
  }
  
  return data || [];
}

/**
 * Escape CSV field
 */
function escapeCsvField(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }
  
  const str = String(value);
  
  // If contains comma, quote, or newline, wrap in quotes and escape quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  
  return str;
}

/**
 * Convert places to CSV
 */
function convertToCSV(places: any[]): string {
  // CSV headers - Google My Maps requires specific column names
  const headers = [
    'name',
    'latitude',
    'longitude',
    'description',
    'city',
    'country',
    'category',
    'address',
    'phone',
    'website',
  ];
  
  const rows: string[] = [headers.join(',')];
  
  for (const place of places) {
    // Build description with all available info
    const descParts: string[] = [];
    
    if (place.description) {
      descParts.push(place.description);
    }
    
    if (place.rating) {
      descParts.push(`Rating: ${place.rating}/5 (${place.user_ratings_total || 0} reviews)`);
    }
    
    if (place.opening_hours) {
      descParts.push(`Hours: ${place.opening_hours}`);
    }
    
    if (place.price_level) {
      descParts.push(`Price: ${'$'.repeat(place.price_level)}`);
    }
    
    if (place.wikidata_id) {
      descParts.push(`Wikidata: ${place.wikidata_id}`);
    }
    
    if (place.google_place_id) {
      descParts.push(`Place ID: ${place.google_place_id}`);
    }
    
    const row = [
      escapeCsvField(place.name),
      escapeCsvField(place.latitude),
      escapeCsvField(place.longitude),
      escapeCsvField(descParts.join(' | ')),
      escapeCsvField(place.city),
      escapeCsvField(place.country),
      escapeCsvField(place.category_slug),
      escapeCsvField(place.address),
      escapeCsvField(place.phone),
      escapeCsvField(place.website),
    ];
    
    rows.push(row.join(','));
  }
  
  return rows.join('\n');
}

/**
 * Main function
 */
async function main() {
  const options = parseArgs();
  
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                     EXPORT PLACES TO CSV                                      ║');
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
  
  // Convert to CSV
  console.log('🔄 Converting to CSV...');
  const csv = convertToCSV(places);
  
  // Generate output filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const outputPath = options.output || `./export-${timestamp}.csv`;
  
  // Save to file
  fs.writeFileSync(outputPath, csv);
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
  console.log('   5. Google will auto-detect columns:');
  console.log('      - Position columns: latitude, longitude');
  console.log('      - Marker title: name');
  console.log('   6. Click "Finish"');
  console.log('');
  console.log('✨ Your places will appear on Google My Maps!');
  console.log('');
}

main().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
