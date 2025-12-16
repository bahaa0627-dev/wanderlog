import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 埃菲尔铁塔的真实 openingHours 数据（你之前提供的）
const eiffelTowerOpeningHours = {
  "open_now": true,
  "periods": [
    {
      "close": { "day": 0, "time": "2345" },
      "open": { "day": 0, "time": "0930" }
    },
    {
      "close": { "day": 1, "time": "2345" },
      "open": { "day": 1, "time": "0930" }
    },
    {
      "close": { "day": 2, "time": "2345" },
      "open": { "day": 2, "time": "0930" }
    },
    {
      "close": { "day": 3, "time": "2345" },
      "open": { "day": 3, "time": "0930" }
    },
    {
      "close": { "day": 4, "time": "2345" },
      "open": { "day": 4, "time": "0930" }
    },
    {
      "close": { "day": 5, "time": "2345" },
      "open": { "day": 5, "time": "0930" }
    },
    {
      "close": { "day": 6, "time": "2345" },
      "open": { "day": 6, "time": "0930" }
    }
  ],
  "weekday_text": [
    "Monday: 9:30 AM – 11:45 PM",
    "Tuesday: 9:30 AM – 11:45 PM",
    "Wednesday: 9:30 AM – 11:45 PM",
    "Thursday: 9:30 AM – 11:45 PM",
    "Friday: 9:30 AM – 11:45 PM",
    "Saturday: 9:30 AM – 11:45 PM",
    "Sunday: 9:30 AM – 11:45 PM"
  ]
};

async function main() {
  console.log('🌱 开始添加测试数据...\n');

  // 添加埃菲尔铁塔
  const eiffelTower = await prisma.publicPlace.upsert({
    where: { placeId: 'ChIJLU7jZClu5kcR4PcOOO6p3I0' },
    update: {
      openingHours: JSON.stringify(eiffelTowerOpeningHours),
      lastSyncedAt: new Date()
    },
    create: {
      placeId: 'ChIJLU7jZClu5kcR4PcOOO6p3I0',
      name: 'Eiffel Tower',
      latitude: 48.8584,
      longitude: 2.2945,
      address: 'Champ de Mars, 5 Avenue Anatole France, 75007 Paris, France',
      city: 'Paris',
      country: 'France',
      category: 'tourist_attraction',
      coverImage: 'https://images.unsplash.com/photo-1511739001486-6bfe10ce785f?w=800',
      rating: 4.6,
      ratingCount: 368590,
      priceLevel: 2,
      openingHours: JSON.stringify(eiffelTowerOpeningHours),
      website: 'https://www.toureiffel.paris/',
      source: 'manual',
      lastSyncedAt: new Date()
    }
  });

  console.log('✅ 埃菲尔铁塔:', eiffelTower.name);
  console.log('   营业时间:', eiffelTower.openingHours ? 'YES' : 'NO');

  // 添加卢浮宫（周二闭馆）
  const louvreOpeningHours = {
    "open_now": true,
    "periods": [
      {
        "close": { "day": 0, "time": "1800" },
        "open": { "day": 0, "time": "0900" }
      },
      {
        "close": { "day": 1, "time": "1800" },
        "open": { "day": 1, "time": "0900" }
      },
      // 周二闭馆，没有 period
      {
        "close": { "day": 3, "time": "2145" },
        "open": { "day": 3, "time": "0900" }
      },
      {
        "close": { "day": 4, "time": "1800" },
        "open": { "day": 4, "time": "0900" }
      },
      {
        "close": { "day": 5, "time": "2145" },
        "open": { "day": 5, "time": "0900" }
      },
      {
        "close": { "day": 6, "time": "1800" },
        "open": { "day": 6, "time": "0900" }
      }
    ],
    "weekday_text": [
      "Monday: 9:00 AM – 6:00 PM",
      "Tuesday: Closed",
      "Wednesday: 9:00 AM – 9:45 PM",
      "Thursday: 9:00 AM – 6:00 PM",
      "Friday: 9:00 AM – 9:45 PM",
      "Saturday: 9:00 AM – 6:00 PM",
      "Sunday: 9:00 AM – 6:00 PM"
    ]
  };

  const louvre = await prisma.publicPlace.upsert({
    where: { placeId: 'ChIJD3uTd9hx5kcR1IQvGfr8dbk' },
    update: {
      openingHours: JSON.stringify(louvreOpeningHours),
      lastSyncedAt: new Date()
    },
    create: {
      placeId: 'ChIJD3uTd9hx5kcR1IQvGfr8dbk',
      name: 'Louvre Museum',
      latitude: 48.8606,
      longitude: 2.3376,
      address: 'Rue de Rivoli, 75001 Paris, France',
      city: 'Paris',
      country: 'France',
      category: 'museum',
      coverImage: 'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=800',
      rating: 4.7,
      ratingCount: 156789,
      priceLevel: 3,
      openingHours: JSON.stringify(louvreOpeningHours),
      website: 'https://www.louvre.fr/',
      source: 'manual',
      lastSyncedAt: new Date()
    }
  });

  console.log('✅ 卢浮宫:', louvre.name);
  console.log('   营业时间:', louvre.openingHours ? 'YES' : 'NO');

  console.log('\n🎉 测试数据添加完成！');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
