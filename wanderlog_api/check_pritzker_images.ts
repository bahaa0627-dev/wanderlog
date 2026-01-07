import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 统计 wikidata 来源中有图片的地点总数
  const totalWithImages = await prisma.place.count({
    where: {
      source: 'wikidata',
      NOT: {
        images: {
          equals: []
        }
      }
    }
  });
  
  // 统计 wikidata 来源中有封面图的地点总数
  const totalWithCover = await prisma.place.count({
    where: {
      source: 'wikidata',
      coverImage: {
        not: null
      }
    }
  });
  
  console.log('=== Wikidata 建筑数据图片统计 ===');
  console.log(`有 images 数组的地点: ${totalWithImages}`);
  console.log(`有 coverImage 的地点: ${totalWithCover}`);
  console.log('');
  
  // 查找有图片的地点列表
  const places = await prisma.place.findMany({
    where: {
      source: 'wikidata',
      coverImage: {
        not: null
      }
    },
    select: {
      id: true,
      name: true,
      images: true,
      coverImage: true,
      city: true,
      country: true
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: 50
  });
  
  console.log('有封面图的地点列表:');
  console.log('');
  
  for (let i = 0; i < places.length; i++) {
    const p = places[i];
    const imgs = p.images as string[] || [];
    console.log(`${i + 1}. ${p.name}`);
    console.log(`   位置: ${p.city || '未知'}, ${p.country || '未知'}`);
    console.log(`   图片数量: ${imgs.length}`);
    console.log('');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
