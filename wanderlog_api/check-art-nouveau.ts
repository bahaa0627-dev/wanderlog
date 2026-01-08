import { PrismaClient, Prisma } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
  // 检查所有建筑风格
  const allPlaces = await prisma.place.findMany({
    where: {
      source: 'wikidata',
      tags: {
        not: Prisma.DbNull
      }
    },
    select: {
      id: true,
      name: true,
      tags: true,
      customFields: true
    }
  });
  
  console.log('总地点数:', allPlaces.length);
  
  const styles = new Map<string, number>();
  const artNouveauPlaces: Array<{ name: string; style: string }> = [];
  
  allPlaces.forEach(p => {
    if (p.tags && typeof p.tags === 'object') {
      const tags = p.tags as any;
      if (tags.style && Array.isArray(tags.style)) {
        tags.style.forEach((s: string) => {
          styles.set(s, (styles.get(s) || 0) + 1);
          if (s.toLowerCase().includes('nouveau') || s.toLowerCase().includes('art nouveau')) {
            artNouveauPlaces.push({ name: p.name, style: s });
          }
        });
      }
    }
  });
  
  console.log('\nArt Nouveau 相关建筑数量:', artNouveauPlaces.length);
  console.log('前 10 个:');
  artNouveauPlaces.slice(0, 10).forEach(p => console.log('  -', p.name, ':', p.style));
  
  console.log('\n所有建筑风格 (前 20):');
  Array.from(styles.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([style, count]) => console.log(`  - ${style}: ${count}`));
  
  // 检查 customFields 中的 display_tags_en
  const withDisplayTags = allPlaces.filter(p => {
    if (p.customFields && typeof p.customFields === 'object') {
      const cf = p.customFields as any;
      return cf.display_tags_en && Array.isArray(cf.display_tags_en) && cf.display_tags_en.length > 0;
    }
    return false;
  });
  
  console.log('\n有 display_tags_en 的地点数:', withDisplayTags.length);
  
  if (withDisplayTags.length > 0) {
    console.log('示例:');
    console.log(withDisplayTags[0].name, ':', (withDisplayTags[0].customFields as any).display_tags_en);
  }
  
  await prisma.$disconnect();
}

check();
