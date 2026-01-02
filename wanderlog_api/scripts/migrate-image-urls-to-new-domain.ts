/**
 * 迁移图片 URL 到新域名
 * 
 * 将 wanderlog-images.blcubahaa0627.workers.dev 替换为 img.vago.to
 */

import prisma from '../src/config/database';

const OLD_DOMAIN = 'wanderlog-images.blcubahaa0627.workers.dev';
const NEW_DOMAIN = 'img.vago.to';

async function migrateImageUrls() {
  console.log('🔄 Starting image URL migration...');
  console.log(`   Old domain: ${OLD_DOMAIN}`);
  console.log(`   New domain: ${NEW_DOMAIN}`);
  
  // 查找所有使用旧域名的地点
  const places = await prisma.place.findMany({
    where: { coverImage: { contains: OLD_DOMAIN } },
    select: { id: true, name: true, coverImage: true }
  });
  
  console.log(`\n📊 Found ${places.length} places with old domain URLs`);
  
  if (places.length === 0) {
    console.log('✅ No migration needed');
    return;
  }
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const place of places) {
    try {
      const oldUrl = place.coverImage!;
      const newUrl = oldUrl.replace(OLD_DOMAIN, NEW_DOMAIN);
      
      await prisma.place.update({
        where: { id: place.id },
        data: { coverImage: newUrl }
      });
      
      successCount++;
      console.log(`✅ [${successCount}/${places.length}] ${place.name}`);
      console.log(`   Old: ${oldUrl}`);
      console.log(`   New: ${newUrl}`);
    } catch (error) {
      errorCount++;
      console.error(`❌ Failed to update ${place.name}: ${error}`);
    }
  }
  
  console.log('\n📊 Migration complete:');
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);
}

migrateImageUrls()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
