/**
 * 检查最近半小时内有 photoReference 但没有 coverImage 的地点
 */

import prisma from '../src/config/database';
import 'dotenv/config';

async function main() {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  
  console.log(`🔍 查找 ${thirtyMinutesAgo.toISOString()} 之后创建的地点...`);
  
  // 查找最近半小时内有 photoReference 但没有 coverImage 的地点
  const places = await prisma.place.findMany({
    where: {
      createdAt: { gte: thirtyMinutesAgo },
      photoReference: { not: null },
      OR: [
        { coverImage: null },
        { coverImage: '' },
      ],
    },
    select: {
      id: true,
      name: true,
      city: true,
      source: true,
      photoReference: true,
      coverImage: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  
  console.log(`\n📊 结果: 找到 ${places.length} 个有 photoReference 但没有 coverImage 的地点\n`);
  
  if (places.length > 0) {
    console.log('地点列表:');
    places.forEach((p, i) => {
      console.log(`${i + 1}. ${p.name} (${p.city}) - source: ${p.source}`);
      console.log(`   photoRef: ${p.photoReference?.substring(0, 50)}...`);
      console.log(`   created: ${p.createdAt}`);
    });
    
    console.log(`\n💰 如果用 Google Photo API 补下载: $${(places.length * 0.007).toFixed(3)}`);
  }
  
  // 也查一下总共有多少
  const totalMissing = await prisma.place.count({
    where: {
      photoReference: { not: null },
      OR: [
        { coverImage: null },
        { coverImage: '' },
      ],
    },
  });
  
  console.log(`\n📈 数据库总共有 ${totalMissing} 个有 photoReference 但没有 coverImage 的地点`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
