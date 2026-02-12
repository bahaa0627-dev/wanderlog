import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import { randomUUID } from 'crypto';

dotenv.config();

const prisma = new PrismaClient();

interface PlaceData {
  name: string;
  nameZh: string;
  address: string;
  latitude: number;
  longitude: number;
  rating?: number;
  ratingCount?: number;
  category_slug: string;
  website?: string;
  phone?: string;
  openingHours?: Record<string, string>;
  description?: string;
  city: string;
  country: string;
}

const places: PlaceData[] = [
  {
    name: "Westminster Quaker Meeting House",
    nameZh: "威斯敏斯特贵格会堂",
    address: "52 St Martin's Ln, London WC2N 4EA, United Kingdom",
    latitude: 51.5107702,
    longitude: -0.1294124,
    rating: 4.7,
    ratingCount: 38,
    category_slug: "church",
    website: "https://westminsterquakers.org.uk",
    phone: "+44 20 7836 7204",
    openingHours: {
      "Monday": "Closed",
      "Tuesday": "1–1:30 PM",
      "Wednesday": "6:15–7 PM",
      "Thursday": "Closed",
      "Friday": "Closed",
      "Saturday": "Closed",
      "Sunday": "11 AM–12 PM"
    },
    city: "London",
    country: "United Kingdom"
  },
  {
    name: "Belle Tout Lighthouse",
    nameZh: "贝尔图特灯塔",
    address: "Beachy Head Rd, Eastbourne BN20 0AE, United Kingdom",
    latitude: 50.7382505,
    longitude: 0.2120325,
    rating: 4.7,
    ratingCount: 1140,
    category_slug: "hotel",
    website: "https://belletout.co.uk",
    phone: "+44 1323 423185",
    city: "Eastbourne",
    country: "United Kingdom"
  },
  {
    name: "National Trust - Birling Gap and the Seven Sisters",
    nameZh: "国家信托 - 伯灵峡和七姐妹",
    address: "Beachy Head Rd, Eastbourne BN20 0AB, United Kingdom",
    latitude: 50.7382912,
    longitude: 0.2120325,
    rating: 4.8,
    ratingCount: 13450,
    category_slug: "landmark",
    website: "https://nationaltrust.org.uk",
    phone: "+44 1323 423197",
    openingHours: {
      "Monday": "10 AM–5 PM",
      "Tuesday": "10 AM–5 PM",
      "Wednesday": "10 AM–5 PM",
      "Thursday": "10 AM–5 PM",
      "Friday": "10 AM–5 PM",
      "Saturday": "10 AM–5 PM",
      "Sunday": "10 AM–5 PM"
    },
    description: "A scenic spot on the Seven Sisters chalk cliffs with a modern cafe and a National Trust info centre.",
    city: "Eastbourne",
    country: "United Kingdom"
  },
  {
    name: "Birling Gap and the Seven Sisters Car Park",
    nameZh: "伯灵峡和七姐妹停车场",
    address: "Beachy Head Rd, Eastbourne BN20 0AD, United Kingdom",
    latitude: 50.7429496,
    longitude: 0.1971336,
    rating: 4.7,
    ratingCount: 344,
    category_slug: "others",
    website: "https://nationaltrust.org.uk",
    phone: "+44 1323 423197",
    city: "Eastbourne",
    country: "United Kingdom"
  },
  {
    name: "South Hill Barn Car Park",
    nameZh: "南山谷仓停车场",
    address: "Chyngton Ln N, Seaford BN25 4JQ, United Kingdom",
    latitude: 50.7626996,
    longitude: 0.1288352,
    rating: 4.6,
    ratingCount: 416,
    category_slug: "others",
    website: "https://lewes-eastbourne.gov.uk",
    phone: "+44 1273 471600",
    openingHours: {
      "Monday": "Open 24 hours",
      "Tuesday": "Open 24 hours",
      "Wednesday": "Open 24 hours",
      "Thursday": "Open 24 hours",
      "Friday": "Open 24 hours",
      "Saturday": "Open 24 hours",
      "Sunday": "Open 24 hours"
    },
    city: "Seaford",
    country: "United Kingdom"
  },
  {
    name: "Seven Sisters Cliffs",
    nameZh: "七姐妹悬崖",
    address: "Exceat, Seaford BN25 4AD, United Kingdom",
    latitude: 50.7563969,
    longitude: 0.154948,
    rating: 4.9,
    ratingCount: 2042,
    category_slug: "landmark",
    website: "https://sevensisters.org.uk",
    openingHours: {
      "Monday": "Open 24 hours",
      "Tuesday": "Open 24 hours",
      "Wednesday": "Open 24 hours",
      "Thursday": "Open 24 hours",
      "Friday": "Open 24 hours",
      "Saturday": "Open 24 hours",
      "Sunday": "Open 24 hours"
    },
    city: "Seaford",
    country: "United Kingdom"
  },
  {
    name: "Uplands Roast",
    nameZh: "Uplands Roast咖啡",
    address: "University of, Edinburgh EH8 9LD, United Kingdom",
    latitude: 55.9425356,
    longitude: -3.1926155,
    rating: 4.7,
    ratingCount: 672,
    category_slug: "cafe",
    website: "https://uplandsroast.com",
    openingHours: {
      "Monday": "8 AM–8 PM",
      "Tuesday": "8 AM–8 PM",
      "Wednesday": "8 AM–8 PM",
      "Thursday": "8 AM–8 PM",
      "Friday": "8 AM–8 PM",
      "Saturday": "8 AM–8 PM",
      "Sunday": "8 AM–8 PM"
    },
    description: "Simple coffee trailer specializing in artisan brews, as well as fancy hot chocolate.",
    city: "Edinburgh",
    country: "United Kingdom"
  },
  {
    name: "Holyrood parkrun",
    nameZh: "荷里路德公园跑",
    address: "42 Meadowfield Dr, Edinburgh EH8 7LX, United Kingdom",
    latitude: 55.9522342,
    longitude: -3.1654844,
    rating: 4.5,
    ratingCount: 11,
    category_slug: "park",
    website: "https://parkrun.org.uk",
    city: "Edinburgh",
    country: "United Kingdom"
  },
  {
    name: "Papii",
    nameZh: "Papii餐厅",
    address: "101 Hanover St, Edinburgh EH2 1DJ, United Kingdom",
    latitude: 55.9545893,
    longitude: -3.2001477,
    rating: 4.6,
    ratingCount: 1342,
    category_slug: "restaurant",
    website: "https://papii.co.uk",
    phone: "+44 131 466 2033",
    openingHours: {
      "Monday": "Closed",
      "Tuesday": "9 AM–4 PM",
      "Wednesday": "9 AM–4 PM",
      "Thursday": "9 AM–4 PM",
      "Friday": "9 AM–4 PM",
      "Saturday": "9 AM–5 PM",
      "Sunday": "9 AM–4 PM"
    },
    description: "Unfussy venue serving a menu of sweet and savoury breakfasts plus snacky meals and coffee.",
    city: "Edinburgh",
    country: "United Kingdom"
  },
  {
    name: "Alby's Southside",
    nameZh: "Alby's Southside三明治店",
    address: "94 Buccleuch St, Edinburgh EH8 9NH, United Kingdom",
    latitude: 55.9416985,
    longitude: -3.1864449,
    rating: 4.7,
    ratingCount: 176,
    category_slug: "cafe",
    website: "https://albysleith.co.uk",
    phone: "+44 131 202 2172",
    openingHours: {
      "Monday": "Closed",
      "Tuesday": "11 AM–4 PM",
      "Wednesday": "11 AM–4 PM",
      "Thursday": "11 AM–4 PM",
      "Friday": "11 AM–4 PM",
      "Saturday": "11 AM–4 PM",
      "Sunday": "11 AM–4 PM"
    },
    city: "Edinburgh",
    country: "United Kingdom"
  },
  {
    name: "Twelve Triangles",
    nameZh: "十二三角面包店",
    address: "90 Brunswick St, Edinburgh EH7 5HU, United Kingdom",
    latitude: 55.9606895,
    longitude: -3.1835578,
    rating: 4.6,
    ratingCount: 471,
    category_slug: "bakery",
    website: "https://twelvetriangles.co.uk",
    phone: "+44 131 629 4664",
    openingHours: {
      "Monday": "7 AM–2 PM",
      "Tuesday": "7 AM–2 PM",
      "Wednesday": "7 AM–2 PM",
      "Thursday": "7 AM–2 PM",
      "Friday": "7 AM–2 PM",
      "Saturday": "7 AM–2 PM",
      "Sunday": "7 AM–2 PM"
    },
    description: "Tiny café in a cheerful atmosphere offering espresso drinks & donuts, plus sweet & savoury pastries.",
    city: "Edinburgh",
    country: "United Kingdom"
  },
  {
    name: "L'Angelou",
    nameZh: "L'Angelou面包店",
    address: "88 Northfield Broadway, Edinburgh EH8 7RU, United Kingdom",
    latitude: 55.955141,
    longitude: -3.143007,
    rating: 4.9,
    ratingCount: 205,
    category_slug: "bakery",
    website: "https://angeloupatisserie.com",
    phone: "+44 7548 956821",
    openingHours: {
      "Monday": "Closed",
      "Tuesday": "Closed",
      "Wednesday": "8:30 AM–2 PM",
      "Thursday": "8:30 AM–2 PM",
      "Friday": "8:30 AM–2 PM",
      "Saturday": "9 AM–12:30 PM",
      "Sunday": "9 AM–12:30 PM"
    },
    city: "Edinburgh",
    country: "United Kingdom"
  },
  {
    name: "101 Bakery",
    nameZh: "101面包店",
    address: "101 Newington Rd, Edinburgh EH9 1QW, United Kingdom",
    latitude: 55.9376749,
    longitude: -3.1805406,
    rating: 4.8,
    ratingCount: 184,
    category_slug: "bakery",
    website: "https://101bakery.com",
    openingHours: {
      "Monday": "Closed",
      "Tuesday": "10 AM–4 PM",
      "Wednesday": "10 AM–4 PM",
      "Thursday": "10 AM–4 PM",
      "Friday": "10 AM–4 PM",
      "Saturday": "10 AM–4 PM",
      "Sunday": "Closed"
    },
    city: "Edinburgh",
    country: "United Kingdom"
  }
];

// Category mapping
const categoryMap: Record<string, { name: string; nameZh: string }> = {
  landmark: { name: "Landmark", nameZh: "地标" },
  museum: { name: "Museum", nameZh: "博物馆" },
  art_gallery: { name: "Art Gallery", nameZh: "美术馆" },
  cafe: { name: "Cafe", nameZh: "咖啡馆" },
  bakery: { name: "Bakery", nameZh: "面包店" },
  restaurant: { name: "Restaurant", nameZh: "餐厅" },
  bar: { name: "Bar", nameZh: "酒吧" },
  hotel: { name: "Hotel", nameZh: "酒店" },
  church: { name: "Church", nameZh: "教堂" },
  park: { name: "Park", nameZh: "公园" },
  others: { name: "Others", nameZh: "其他" }
};

async function importPlaces() {
  console.log(`\n🚀 Starting batch import of ${places.length} places...\n`);
  
  const results = {
    created: [] as string[],
    updated: [] as string[],
    failed: [] as string[]
  };

  for (const place of places) {
    try {
      // Generate UUID
      const placeId = randomUUID();
      
      // Check if exists by name
      const existing = await prisma.place.findFirst({
        where: { name: place.name }
      });

      const categoryInfo = categoryMap[place.category_slug] || categoryMap.others;

      const placeData = {
        name: place.name,
        address: place.address,
        latitude: place.latitude,
        longitude: place.longitude,
        rating: place.rating || null,
        ratingCount: place.ratingCount || null,
        category: categoryInfo.name,
        categoryZh: categoryInfo.nameZh,
        categorySlug: place.category_slug,
        website: place.website || null,
        phoneNumber: place.phone || null,
        openingHours: place.openingHours ? JSON.stringify(place.openingHours) : null,
        description: place.description || null,
        city: place.city,
        country: place.country,
        source: 'manual_import',
        updatedAt: new Date()
      };

      if (existing) {
        await prisma.place.update({
          where: { id: existing.id },
          data: placeData
        });
        results.updated.push(place.name);
        console.log(`✅ Updated: ${place.name}`);
      } else {
        await prisma.place.create({
          data: {
            id: placeId,
            ...placeData,
            createdAt: new Date()
          }
        });
        results.created.push(place.name);
        console.log(`✅ Created: ${place.name}`);
      }
    } catch (error) {
      results.failed.push(place.name);
      console.error(`❌ Failed: ${place.name}`, error);
    }
  }

  console.log('\n========== Import Summary ==========');
  console.log(`✅ Created: ${results.created.length}`);
  console.log(`🔄 Updated: ${results.updated.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  
  if (results.created.length > 0) {
    console.log('\nCreated places:');
    results.created.forEach(n => console.log(`  - ${n}`));
  }
  if (results.updated.length > 0) {
    console.log('\nUpdated places:');
    results.updated.forEach(n => console.log(`  - ${n}`));
  }
  if (results.failed.length > 0) {
    console.log('\nFailed places:');
    results.failed.forEach(n => console.log(`  - ${n}`));
  }
}

importPlaces()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
