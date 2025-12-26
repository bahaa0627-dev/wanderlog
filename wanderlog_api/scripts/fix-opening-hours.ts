/**
 * 修复 opening_hours 数据
 * 从 Google Places API 重新获取完整的 weekday_text + periods
 */

import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();
const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

async function getOpeningHours(placeId: string): Promise<any> {
  const url = `https://maps.googleapis.com/maps/api/place/details/json`;
  const response = await axios.get(url, {
    params: {
      place_id: placeId,
      fields: 'opening_hours',
      key: GOOGLE_API_KEY,
    },
  });

  if (response.data.status !== 'OK') {
    throw new Error(`API error: ${response.data.status}`);
  }

  return response.data.result?.opening_hours;
}

async function main() {
  // 找到只有 weekday_text 数组的记录（被改坏的）
  const places = await prisma.$queryRaw`
    SELECT id, name, google_place_id, opening_hours
    FROM places 
    WHERE opening_hours IS NOT NULL
    AND opening_hours::text LIKE '["%'
    AND google_place_id IS NOT NULL
  ` as any[];

  console.log(`找到 ${places.length} 条需要修复的记录\n`);

  let fixed = 0;
  let failed = 0;

  for (const place of places) {
    try {
      console.log(`处理: ${place.name}`);
      
      const openingHours = await getOpeningHours(place.google_place_id);
      
      if (openingHours) {
        const newData = JSON.stringify({
          weekday_text: openingHours.weekday_text,
          periods: openingHours.periods,
        });

        await prisma.place.update({
          where: { id: place.id },
          data: { openingHours: newData },
        });

        console.log(`  ✅ 修复成功`);
        fixed++;
      } else {
        console.log(`  ⚠️ 无营业时间数据`);
      }
    } catch (e: any) {
      console.log(`  ❌ 失败: ${e.message}`);
      failed++;
    }

    // 避免 API 限流
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n修复完成: ${fixed} 成功, ${failed} 失败`);
  await prisma.$disconnect();
}

main();
