/**
 * Add mock Copenhagen spots data directly to database
 * This bypasses Google API completely
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MOCK_SPOTS = [
  {
    googlePlaceId: 'mock-1',
    name: 'Design Museum Denmark',
    city: 'Copenhagen',
    country: 'Denmark',
    latitude: 55.6841,
    longitude: 12.5934,
    address: 'Bredgade 68, 1260 København',
    description: 'Museum showcasing Danish and international design',
    rating: 4.6,
    ratingCount: 295,
    category: '博物馆',
    tags: JSON.stringify(['museum', 'art', 'design']),
    coverImage: 'https://images.unsplash.com/photo-1565967511849-76a60a516170?w=800',
    source: 'mock_data',
  },
  {
    googlePlaceId: 'mock-2',
    name: 'Nyhavn',
    city: 'Copenhagen',
    country: 'Denmark',
    latitude: 55.6798,
    longitude: 12.5912,
    address: 'Nyhavn, Copenhagen',
    description: '17th-century waterfront with colorful townhouses',
    rating: 4.7,
    ratingCount: 1250,
    category: '景点',
    tags: JSON.stringify(['waterfront', 'photography', 'restaurants']),
    coverImage: 'https://images.unsplash.com/photo-1513622470522-26c3c8a854bc?w=800',
    source: 'mock_data',
  },
  {
    googlePlaceId: 'mock-3',
    name: 'Torvehallerne',
    city: 'Copenhagen',
    country: 'Denmark',
    latitude: 55.6839,
    longitude: 12.5702,
    address: 'Frederiksborggade 21, 1360 København',
    description: 'Popular food market with local and international cuisine',
    rating: 4.5,
    ratingCount: 412,
    category: '市场',
    tags: JSON.stringify(['food', 'market', 'local']),
    coverImage: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800',
    source: 'mock_data',
  },
  {
    googlePlaceId: 'mock-4',
    name: 'The Coffee Collective',
    city: 'Copenhagen',
    country: 'Denmark',
    latitude: 55.6819,
    longitude: 12.5778,
    address: 'Jægersborggade 10, 2200 København',
    description: 'Specialty coffee roastery and cafe',
    rating: 4.7,
    ratingCount: 189,
    category: '咖啡馆',
    tags: JSON.stringify(['coffee', 'specialty', 'cozy']),
    coverImage: 'https://images.unsplash.com/photo-1442512595331-e89e73853f31?w=800',
    source: 'mock_data',
  },
  {
    googlePlaceId: 'mock-5',
    name: 'Church of Our Saviour',
    city: 'Copenhagen',
    country: 'Denmark',
    latitude: 55.6728,
    longitude: 12.5941,
    address: 'Sankt Annæ Gade 29, 1416 København',
    description: 'Baroque church with famous spiral tower',
    rating: 4.8,
    ratingCount: 521,
    category: '教堂',
    tags: JSON.stringify(['church', 'architecture', 'view']),
    coverImage: 'https://images.unsplash.com/photo-1605106715994-18d3fecffb98?w=800',
    source: 'mock_data',
  },
  {
    googlePlaceId: 'mock-6',
    name: 'Tivoli Gardens',
    city: 'Copenhagen',
    country: 'Denmark',
    latitude: 55.6738,
    longitude: 12.5681,
    address: 'Vesterbrogade 3, 1630 København',
    description: 'Historic amusement park and pleasure garden',
    rating: 4.6,
    ratingCount: 2843,
    category: '公园',
    tags: JSON.stringify(['park', 'entertainment', 'family']),
    coverImage: 'https://images.unsplash.com/photo-1583422409516-2895a77efded?w=800',
    source: 'mock_data',
  },
];

async function addMockData() {
  console.log('🎨 Adding mock Copenhagen spots data...\n');

  for (const spot of MOCK_SPOTS) {
    try {
      // Check if already exists
      const existing = await prisma.spot.findFirst({
        where: { googlePlaceId: spot.googlePlaceId }
      });

      if (existing) {
        console.log(`   ⏭️  Skipped: ${spot.name} (already exists)`);
        continue;
      }

      await prisma.spot.create({
        data: {
          ...spot,
          lastSyncedAt: new Date(),
        }
      });

      console.log(`   ✅ Added: ${spot.name}`);
    } catch (error: any) {
      console.log(`   ❌ Error adding ${spot.name}: ${error.message}`);
    }
  }

  const total = await prisma.spot.count();
  console.log(`\n✨ Done! Total spots in database: ${total}\n`);

  // Show all spots
  const allSpots = await prisma.spot.findMany({
    orderBy: { rating: 'desc' }
  });

  console.log('All spots:');
  allSpots.forEach((spot, i) => {
    console.log(`   ${i + 1}. ${spot.name} - ${spot.rating}⭐ (${spot.ratingCount} reviews)`);
    console.log(`      ${spot.category} | ${spot.city}`);
  });

  await prisma.$disconnect();
}

addMockData().catch(console.error);
