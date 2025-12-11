/**
 * Copenhagen Spots Import Script
 * 
 * This script uses Google Maps API to discover and import popular spots in Copenhagen.
 * No need to manually collect Place IDs - the script will find them automatically!
 * 
 * The script will:
 * 1. Search for popular spots by category (museums, cafes, restaurants, etc.)
 * 2. Use Text Search API to find highly-rated places
 * 3. Automatically import them to the database with deduplication
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const AUTH_TOKEN = process.env.AUTH_TOKEN || ''; // Optional - will use direct DB access if not provided

if (!GOOGLE_API_KEY) {
  console.error('❌ GOOGLE_MAPS_API_KEY not found in .env file');
  process.exit(1);
}

// Copenhagen coordinates
const COPENHAGEN = {
  lat: 55.6761,
  lng: 12.5683,
  name: 'Copenhagen'
};

// Categories to search (这些都是热门景点分类)
const SEARCH_QUERIES = [
  // 博物馆和文化
  'museums in Copenhagen',
  'art galleries in Copenhagen',
  'historic sites in Copenhagen',
  
  // 咖啡和餐饮
  'best cafes in Copenhagen',
  'best coffee in Copenhagen',
  'restaurants in Copenhagen',
  'bakeries in Copenhagen',
  
  // 建筑和教堂
  'churches in Copenhagen',
  'architecture in Copenhagen',
  
  // 休闲和公园
  'parks in Copenhagen',
  'gardens in Copenhagen',
  
  // 购物
  'shopping in Copenhagen',
  'markets in Copenhagen'
];

interface ImportResult {
  message: string;
  imported: number;
  skipped: number;
  errors: number;
}

/**
 * Search places using Text Search API
 * This finds popular spots based on search queries
 */
async function searchPlacesByText(query: string): Promise<string[]> {
  try {
    const response = await axios.get(
      'https://maps.googleapis.com/maps/api/place/textsearch/json',
      {
        params: {
          query,
          key: GOOGLE_API_KEY,
        },
      }
    );

    if (response.data.status === 'OK' && response.data.results) {
      return response.data.results
        .filter((place: any) => place.rating && place.rating >= 4.0) // Only high-rated places
        .map((place: any) => place.place_id);
    }
    
    return [];
  } catch (error) {
    console.error(`Error searching for "${query}":`, error);
    return [];
  }
}

/**
 * Search nearby places using Nearby Search API
 */
async function searchNearbyPlaces(lat: number, lng: number, type?: string): Promise<string[]> {
  try {
    const response = await axios.get(
      'https://maps.googleapis.com/maps/api/place/nearbysearch/json',
      {
        params: {
          location: `${lat},${lng}`,
          radius: 5000,
          type,
          key: GOOGLE_API_KEY,
        },
      }
    );

    if (response.data.status === 'OK' && response.data.results) {
      return response.data.results
        .filter((place: any) => place.rating && place.rating >= 4.0) // Only high-rated places
        .map((place: any) => place.place_id);
    }
    
    return [];
  } catch (error) {
    console.error('Error searching nearby places:', error);
    return [];
  }
}

/**
 * Import spots directly using Google Maps Service (bypasses API endpoint)
 */
async function importSpotsDirectly(placeIds: string[]): Promise<ImportResult> {
  // Import the service directly
  const googleMapsService = require('../services/googleMapsService').default;
  
  console.log(`   Importing ${placeIds.length} spots...`);
  const result = await googleMapsService.importSpots(placeIds);
  
  return result;
}

/**
 * Get all spots for a city from database
 */
async function getCitySpots(city: string) {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/spots/city-center/${city}`);
    return response.data;
  } catch (error) {
    console.error('Error getting city spots:', error);
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Starting Copenhagen spots discovery and import...\n');
  console.log('📍 This script will automatically find popular spots in Copenhagen\n');

  const allPlaceIds: string[] = [];

  // Method 1: Text Search for specific queries
  console.log('🔍 Searching for spots using Text Search API...\n');
  
  for (const query of SEARCH_QUERIES) {
    console.log(`   Searching: ${query}...`);
    const placeIds = await searchPlacesByText(query);
    allPlaceIds.push(...placeIds);
    console.log(`   ✓ Found ${placeIds.length} places`);
    
    // Add delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Method 2: Nearby Search for specific types
  console.log('\n🔍 Searching nearby places by type...\n');
  
  const types = ['museum', 'cafe', 'restaurant', 'tourist_attraction', 'church', 'park'];
  
  for (const type of types) {
    console.log(`   Searching: ${type}...`);
    const placeIds = await searchNearbyPlaces(COPENHAGEN.lat, COPENHAGEN.lng, type);
    allPlaceIds.push(...placeIds);
    console.log(`   ✓ Found ${placeIds.length} places`);
    
    // Add delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Remove duplicates
  const uniquePlaceIds = [...new Set(allPlaceIds)];
  console.log(`\n📦 Total unique places discovered: ${uniquePlaceIds.length}\n`);

  if (uniquePlaceIds.length === 0) {
    console.log('❌ No places found. Please check your API key and try again.');
    return;
  }

  // Import to database
  console.log('💾 Importing spots to database...\n');
  
  try {
    // Import in batches of 20 to avoid overwhelming the API
    const batchSize = 20;
    let totalImported = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    for (let i = 0; i < uniquePlaceIds.length; i += batchSize) {
      const batch = uniquePlaceIds.slice(i, i + batchSize);
      console.log(`   Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(uniquePlaceIds.length / batchSize)} (${batch.length} spots)...`);
      
      const result = await importSpotsDirectly(batch);
      totalImported += result.imported;
      totalSkipped += result.skipped;
      totalErrors += result.errors;
      
      console.log(`   ✓ Imported: ${result.imported}, Skipped: ${result.skipped}, Errors: ${result.errors}`);
      
      // Add delay between batches
      if (i + batchSize < uniquePlaceIds.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log('\n✅ Import completed:');
    console.log(`   - Total Imported: ${totalImported}`);
    console.log(`   - Total Skipped (duplicates): ${totalSkipped}`);
    console.log(`   - Total Errors: ${totalErrors}\n`);
  } catch (error) {
    console.error('❌ Failed to import spots:', error);
  }

  // Verify the import
  console.log('📊 Fetching Copenhagen spots from database...\n');
  try {
    const cityData = await getCitySpots('copenhagen');
    console.log(`✅ Database now has ${cityData.count} spots for Copenhagen\n`);
    console.log('Sample spots:');
    cityData.spots.slice(0, 10).forEach((spot: any, index: number) => {
      console.log(`   ${index + 1}. ${spot.name}`);
      console.log(`      Category: ${spot.category || 'N/A'} | Rating: ${spot.rating || 'N/A'} (${spot.ratingCount || 0} reviews)`);
    });
  } catch (error) {
    console.error('❌ Failed to fetch city spots');
  }

  console.log('\n✨ Import process complete!');
  console.log('💡 You can now view these spots in the Flutter app by clicking the Map tab\n');
}

// Run the script
if (require.main === module) {
  main().catch(console.error);
}

export { searchPlacesByText, searchNearbyPlaces, getCitySpots };
