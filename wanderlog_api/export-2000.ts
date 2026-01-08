import prisma from './src/config/database';
import * as fs from 'fs';

async function export2000() {
  console.log('🔍 正在从数据库获取 2000 个地点...\n');
  
  const places = await prisma.place.findMany({
    where: { source: 'wikidata' },
    skip: 2100,
    take: 2000,
    orderBy: { id: 'asc' }
  });
  
  console.log(`✅ 获取到 ${places.length} 个地点\n`);
  
  // 转换为 CSV
  const headers = ['name', 'latitude', 'longitude', 'description', 'city', 'country', 'category', 'address', 'phone', 'website'];
  const rows = [headers.join(',')];
  
  for (const place of places) {
    const placeAny = place as any;
    const description = [
      place.description || '',
      place.rating ? `Rating: ${place.rating}/5 (0 reviews)` : '',
      place.openingHours ? `Hours: ${JSON.stringify(place.openingHours)}` : '',
      place.googlePlaceId ? `Place ID: ${place.googlePlaceId}` : ''
    ].filter(Boolean).join(' | ');
    
    const row = [
      `"${(place.name || '').replace(/"/g, '""')}"`,
      place.latitude,
      place.longitude,
      `"${description.replace(/"/g, '""')}"`,
      place.city || '',
      place.country || '',
      placeAny.categorySlug || '',
      `"${(place.address || '').replace(/"/g, '""')}"`,
      place.phoneNumber || '',
      place.website || ''
    ];
    
    rows.push(row.join(','));
  }
  
  const csv = rows.join('\n');
  fs.writeFileSync('wikidata-batch-5.csv', csv);
  
  console.log('✅ 已保存到: wikidata-batch-5.csv');
  console.log(`📊 总共 ${places.length} 个地点\n`);
  
  // 统计
  const countries = new Set(places.map(p => p.country).filter(Boolean));
  const cities = new Set(places.map(p => p.city).filter(Boolean));
  const withRating = places.filter(p => p.rating).length;
  const withImage = places.filter(p => p.coverImage).length;
  
  console.log('📊 统计信息：');
  console.log(`   国家数: ${countries.size}`);
  console.log(`   城市数: ${cities.size}`);
  console.log(`   有评分: ${withRating} (${((withRating / places.length) * 100).toFixed(1)}%)`);
  console.log(`   有图片: ${withImage} (${((withImage / places.length) * 100).toFixed(1)}%)`);
  
  await prisma.$disconnect();
}

export2000().catch(console.error);
