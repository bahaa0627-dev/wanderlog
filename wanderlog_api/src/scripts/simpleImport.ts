/**
 * Simple import script using known Copenhagen Place IDs
 * This bypasses the search API and directly imports specific places
 */

import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// 哥本哈根知名景点的 Place IDs
const COPENHAGEN_PLACES = [
  'ChIJIz2AXDxTUkYRuGeU5t1-3QQ', // Design Museum Denmark
  'ChIJ28kkvItTUkYR3kNUmy4vj_w', // Nyhavn
  'ChIJa2FMlYZTUkYRZ5hVqhEP5qM', // Torvehallerne
  'ChIJFdN7xZxTUkYRSKjBt8S6IT4', // Church of Our Saviour
  'ChIJkx1BYotTUkYR8OkKiG7dTQY', // Tivoli Gardens
  'ChIJ28kkvItTUkYR3kNUmy4vj_w', // Amalienborg Palace
  'ChIJAWkl95JTUkYRVRY5yE6P4OE', // Rosenborg Castle
  'ChIJ-RkWVolTUkYRKmKhYLrfB7w', // Round Tower
  'ChIJAbWcLYlTUkYRD9MqmrqbnAY', // National Museum of Denmark
  'ChIJb8Jg9pVTUkYRGhHsOh5Ydzo', // The Coffee Collective
];

interface SpotData {
  googlePlaceId: string;
  name: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  address?: string;
  description?: string;
  openingHours?: string;
  rating?: number;
  ratingCount?: number;
  category?: string;
  tags?: string;
  coverImage?: string;
  images?: string;
  priceLevel?: number;
  website?: string;
  phoneNumber?: string;
}

async function getPlaceDetails(placeId: string): Promise<SpotData | null> {
  try {
    console.log(`   Fetching details for ${placeId}...`);
    
    const response = await axios.get(
      'https://maps.googleapis.com/maps/api/place/details/json',
      {
        params: {
          place_id: placeId,
          key: GOOGLE_API_KEY,
          fields: 'name,formatted_address,geometry,rating,user_ratings_total,price_level,types,photos,website,formatted_phone_number',
        },
        timeout: 10000, // 10 second timeout
      }
    );

    if (response.data.status !== 'OK') {
      console.log(`   ⚠️  Status: ${response.data.status}`);
      return null;
    }

    const place = response.data.result;
    
    // Extract city and country
    let city = 'Copenhagen';
    let country = 'Denmark';
    
    // Extract category
    const types = place.types || [];
    const categoryMap: { [key: string]: string } = {
      'museum': '博物馆',
      'art_gallery': '艺术馆',
      'cafe': '咖啡馆',
      'restaurant': '餐厅',
      'bar': '酒吧',
      'church': '教堂',
      'park': '公园',
      'tourist_attraction': '景点',
      'shopping_mall': '购物中心',
    };
    
    let category = '景点';
    for (const type of types) {
      if (categoryMap[type]) {
        category = categoryMap[type];
        break;
      }
    }

    // Extract tags
    const tags: string[] = [];
    if (types.includes('cafe')) tags.push('coffee');
    if (types.includes('restaurant')) tags.push('food');
    if (types.includes('museum')) tags.push('culture');
    if (types.includes('park')) tags.push('outdoor');
    if (place.rating && place.rating >= 4.5) tags.push('highly-rated');

    // Get cover image
    let coverImage: string | undefined;
    if (place.photos && place.photos.length > 0) {
      const photoRef = place.photos[0].photo_reference;
      coverImage = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photoRef}&key=${GOOGLE_API_KEY}`;
    }

    console.log(`   ✓ ${place.name}`);

    return {
      googlePlaceId: placeId,
      name: place.name || '',
      city,
      country,
      latitude: place.geometry?.location?.lat || 0,
      longitude: place.geometry?.location?.lng || 0,
      address: place.formatted_address,
      rating: place.rating,
      ratingCount: place.user_ratings_total,
      category,
      tags: tags.length > 0 ? JSON.stringify(tags) : undefined,
      coverImage,
      priceLevel: place.price_level,
      website: place.website,
      phoneNumber: place.formatted_phone_number,
    };
  } catch (error: any) {
    if (error.code === 'ETIMEDOUT') {
      console.log(`   ⚠️  Timeout - skipping`);
    } else {
      console.log(`   ❌ Error: ${error.message}`);
    }
    return null;
  }
}

async function checkDuplicate(name: string, address: string): Promise<boolean> {
  const existing = await prisma.spot.findFirst({
    where: {
      name: name,
      address: address,
    }
  });
  return existing !== null;
}

async function main() {
  console.log('🚀 Importing Copenhagen spots...\n');
  console.log(`📍 Will import ${COPENHAGEN_PLACES.length} known places\n`);

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const placeId of COPENHAGEN_PLACES) {
    try {
      const spotData = await getPlaceDetails(placeId);
      
      if (!spotData) {
        errors++;
        continue;
      }

      // Check for duplicates
      const isDuplicate = await checkDuplicate(spotData.name, spotData.address || '');
      
      if (isDuplicate) {
        console.log(`   ⏭️  Skipped (duplicate): ${spotData.name}`);
        skipped++;
        continue;
      }

      // Import to database
      await prisma.spot.create({
        data: {
          ...spotData,
          source: 'google_maps',
          lastSyncedAt: new Date(),
        }
      });

      imported++;
      console.log(`   ✅ Imported: ${spotData.name}`);

    } catch (error: any) {
      console.log(`   ❌ Error: ${error.message}`);
      errors++;
    }

    // Add delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n📊 Import Summary:');
  console.log(`   ✅ Imported: ${imported}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   ❌ Errors: ${errors}`);

  // Show what we have
  const allSpots = await prisma.spot.findMany({
    orderBy: { rating: 'desc' }
  });

  console.log(`\n🗺️  Total spots in database: ${allSpots.length}\n`);
  
  if (allSpots.length > 0) {
    console.log('Top spots:');
    allSpots.slice(0, 5).forEach((spot, i) => {
      console.log(`   ${i + 1}. ${spot.name} - ${spot.rating}⭐ (${spot.ratingCount || 0} reviews)`);
    });
  }

  await prisma.$disconnect();
  console.log('\n✨ Done!\n');
}

main().catch(console.error);
