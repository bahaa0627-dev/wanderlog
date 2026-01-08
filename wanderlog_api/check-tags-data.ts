import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
  const places = await prisma.place.findMany({
    where: { source: 'wikidata' },
    take: 5,
    select: {
      id: true,
      name: true,
      tags: true,
      aiTags: true,
      category: true,
      categorySlug: true,
      categoryEn: true,
      categoryZh: true
    }
  });
  
  console.log('=== 数据库中的标签数据 ===');
  places.forEach(p => {
    console.log('\n地点:', p.name);
    console.log('category:', p.category);
    console.log('categorySlug:', p.categorySlug);
    console.log('categoryEn:', p.categoryEn);
    console.log('categoryZh:', p.categoryZh);
    console.log('tags:', typeof p.tags, JSON.stringify(p.tags));
    console.log('aiTags:', typeof p.aiTags, JSON.stringify(p.aiTags));
  });
  
  await prisma.$disconnect();
}

check();
