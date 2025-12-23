import Database from 'better-sqlite3';
import { PrismaClient } from '@prisma/client';

const LEGACY_USER_ID = 'cmj5opyfh0000133rkbv5xdw4';
const SUPABASE_USER_ID = '0d028f9d-dee5-460b-9952-da9e2687df2e';

async function migrate() {
  const localDb = new Database('./prisma/dev.db', { readonly: true });
  const supabase = new PrismaClient();

  try {
    // 1. 获取本地 trips
    const trips = localDb.prepare(`
      SELECT * FROM Trip WHERE userId = ?
    `).all(LEGACY_USER_ID) as any[];
    
    console.log('Found', trips.length, 'trips to migrate');
    
    // 2. 获取本地 trip_spots
    const tripSpots = localDb.prepare(`
      SELECT ts.*, t.city as tripCity
      FROM TripSpot ts
      JOIN Trip t ON ts.tripId = t.id
      WHERE t.userId = ?
    `).all(LEGACY_USER_ID) as any[];
    
    console.log('Found', tripSpots.length, 'trip spots to migrate');
    
    // 3. 获取相关的 places
    const placeIds = [...new Set(tripSpots.map((ts: any) => ts.placeId))];
    console.log('Need to check', placeIds.length, 'places');
    
    // 迁移 places - 需要将非 UUID 的 ID 转换为 UUID
    const placeIdMap = new Map<string, string>(); // old id -> new uuid
    const { v4: uuidv4 } = await import('uuid');
    
    for (const placeId of placeIds) {
      const localPlace = localDb.prepare('SELECT * FROM Place WHERE id = ?').get(placeId) as any;
      if (!localPlace) {
        console.log('Place not found locally:', placeId);
        continue;
      }
      
      // 检查是否是有效的 UUID
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(placeId);
      const newPlaceId = isUuid ? placeId : uuidv4();
      placeIdMap.set(placeId, newPlaceId);
      
      // 检查 Supabase 中是否已存在（用 googlePlaceId 或 name+city 匹配）
      let existing = null;
      if (localPlace.googlePlaceId) {
        existing = await supabase.place.findFirst({ 
          where: { googlePlaceId: localPlace.googlePlaceId } 
        });
      }
      if (!existing && localPlace.name && localPlace.city) {
        existing = await supabase.place.findFirst({ 
          where: { 
            name: localPlace.name,
            city: localPlace.city,
          } 
        });
      }
      
      if (existing) {
        placeIdMap.set(placeId, existing.id);
        console.log('Place already exists:', localPlace.name, '-> using', existing.id);
        continue;
      }
      
      // 创建 place
      try {
        await supabase.place.create({
          data: {
            id: newPlaceId,
            name: localPlace.name,
            city: localPlace.city,
            country: localPlace.country || 'Unknown',
            latitude: localPlace.latitude,
            longitude: localPlace.longitude,
            address: localPlace.address,
            description: localPlace.description,
            openingHours: localPlace.openingHours,
            rating: localPlace.rating,
            ratingCount: localPlace.ratingCount,
            category: localPlace.category,
            aiSummary: localPlace.aiSummary,
            tags: localPlace.tags,
            aiTags: localPlace.aiTags,
            coverImage: localPlace.coverImage,
            images: localPlace.images,
            priceLevel: localPlace.priceLevel,
            website: localPlace.website,
            phoneNumber: localPlace.phoneNumber,
            googlePlaceId: localPlace.googlePlaceId,
            source: localPlace.source || 'migration',
          },
        });
        console.log('Created place:', localPlace.name, '-> new id:', newPlaceId);
      } catch (e: any) {
        console.error('Error creating place:', localPlace.name, e.message);
      }
    }
    
    // 4. 创建 trips
    const tripIdMap = new Map<string, string>(); // old id -> new id
    for (const trip of trips) {
      try {
        // 检查是否已存在
        const existing = await (supabase as any).$queryRaw`
          SELECT id FROM trips WHERE user_id = ${SUPABASE_USER_ID}::uuid AND city = ${trip.city} LIMIT 1
        `;
        
        if (existing && (existing as any[]).length > 0) {
          tripIdMap.set(trip.id, (existing as any[])[0].id);
          console.log('Trip already exists:', trip.city);
          continue;
        }
        
        const result = await (supabase as any).$queryRaw`
          INSERT INTO trips (user_id, name, city, status, created_at, updated_at)
          VALUES (${SUPABASE_USER_ID}::uuid, ${trip.name}, ${trip.city}, ${trip.status || 'PLANNING'}, NOW(), NOW())
          RETURNING id
        `;
        
        if (result && (result as any[]).length > 0) {
          tripIdMap.set(trip.id, (result as any[])[0].id);
          console.log('Created trip:', trip.city);
        }
      } catch (e: any) {
        console.error('Error creating trip:', trip.city, e.message);
      }
    }
    
    // 5. 创建 trip_spots
    for (const ts of tripSpots) {
      const newTripId = tripIdMap.get(ts.tripId);
      const newPlaceId = placeIdMap.get(ts.placeId);
      
      if (!newTripId) {
        console.log('Trip not found for spot:', ts.placeId);
        continue;
      }
      if (!newPlaceId) {
        console.log('Place ID mapping not found for:', ts.placeId);
        continue;
      }
      
      try {
        // 检查是否已存在
        const existing = await (supabase as any).$queryRaw`
          SELECT id FROM trip_spots WHERE trip_id = ${newTripId}::uuid AND place_id = ${newPlaceId}::uuid LIMIT 1
        `;
        
        if (existing && (existing as any[]).length > 0) {
          console.log('Trip spot already exists for:', ts.placeId);
          continue;
        }
        
        await (supabase as any).$queryRaw`
          INSERT INTO trip_spots (trip_id, place_id, status, priority, created_at, updated_at)
          VALUES (${newTripId}::uuid, ${newPlaceId}::uuid, ${ts.status || 'WISHLIST'}, ${ts.priority || 'OPTIONAL'}, NOW(), NOW())
        `;
        console.log('Created trip spot for:', ts.placeId, '-> place:', newPlaceId);
      } catch (e: any) {
        console.error('Error creating trip spot:', ts.placeId, e.message);
      }
    }
    
    console.log('\n✅ Migration complete!');
    
    // 验证结果
    const finalTrips = await (supabase as any).$queryRaw`
      SELECT COUNT(*) as count FROM trips WHERE user_id = ${SUPABASE_USER_ID}::uuid
    `;
    const finalSpots = await (supabase as any).$queryRaw`
      SELECT COUNT(*) as count FROM trip_spots ts
      JOIN trips t ON ts.trip_id = t.id
      WHERE t.user_id = ${SUPABASE_USER_ID}::uuid
    `;
    
    console.log('Final trips count:', (finalTrips as any[])[0].count);
    console.log('Final spots count:', (finalSpots as any[])[0].count);
    
  } finally {
    localDb.close();
    await supabase.$disconnect();
  }
}

migrate().catch(console.error);
