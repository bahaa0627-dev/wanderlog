import prisma from '../src/config/database';

async function checkOldUrls() {
  const places = await prisma.place.findMany({
    where: {
      coverImage: { not: null }
    },
    select: {
      id: true,
      name: true,
      coverImage: true,
      customFields: true
    }
  });
  
  const newCdnUrl = places.filter(p => p.coverImage?.startsWith('https://img.vago.to'));
  const workerUrl = places.filter(p => p.coverImage?.includes('workers.dev'));
  const googleUrl = places.filter(p => p.coverImage?.includes('googleusercontent.com'));
  const otherUrl = places.filter(p => 
    p.coverImage && 
    !p.coverImage.startsWith('https://img.vago.to') &&
    !p.coverImage.includes('workers.dev') &&
    !p.coverImage.includes('googleusercontent.com')
  );
  
  console.log('📊 图片 URL 分布:');
  console.log('新 CDN URL (img.vago.to):', newCdnUrl.length);
  console.log('Worker URL (workers.dev):', workerUrl.length);
  console.log('Google URL (googleusercontent):', googleUrl.length);
  console.log('其他 URL:', otherUrl.length);
  
  if (workerUrl.length > 0) {
    console.log('\n📋 Worker URL 示例 (前5个):');
    workerUrl.slice(0, 5).forEach(p => {
      console.log(`  - ${p.name}: ${p.coverImage}`);
      const cf = p.customFields as any;
      if (cf?.r2Key) console.log(`    r2Key: ${cf.r2Key}`);
    });
  }
  
  if (googleUrl.length > 0) {
    console.log('\n📋 Google URL 示例 (前5个):');
    googleUrl.slice(0, 5).forEach(p => {
      console.log(`  - ${p.name}: ${p.coverImage?.substring(0, 80)}...`);
    });
  }
  
  await prisma.$disconnect();
}

checkOldUrls();
