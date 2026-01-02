/**
 * 回滚图片 URL 迁移
 */

import prisma from '../src/config/database';

const OLD_DOMAIN = 'wanderlog-images.blcubahaa0627.workers.dev';
const NEW_DOMAIN = 'img.vago.to';

async function rollback() {
  console.log('🔄 Rolling back image URL migration...');
  
  // 查找所有被错误迁移的地点（使用 img.vago.to/places/ChIJ 格式）
  const places = await prisma.place.findMany({
    where: { 
      coverImage: { 
        startsWith: 'https://img.vago.to/places/ChIJ'
      }
    },
    select: { id: true, name: true, coverImage: true }
  });
  
  console.log(`Found ${places.length} places to rollback`);
  
  let count = 0;
  for (const place of places) {
    const oldUrl = place.coverImage!.replace(NEW_DOMAIN, OLD_DOMAIN);
    await prisma.place.update({
      where: { id: place.id },
      data: { coverImage: oldUrl }
    });
    count++;
    if (count % 50 === 0) {
      console.log(`Rolled back ${count}/${places.length}`);
    }
  }
  
  console.log(`✅ Rolled back ${count} places`);
}

rollback()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Rollback failed:', error);
    process.exit(1);
  });
