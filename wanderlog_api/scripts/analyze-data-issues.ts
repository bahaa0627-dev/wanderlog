/**
 * Analyze data issues in wikidata records
 */

import prisma from '../src/config/database';

async function main() {
  // 1. 查找名称是 Qxxx 格式的记录
  const qidNames = await prisma.place.findMany({
    where: {
      source: 'wikidata',
      name: { startsWith: 'Q' },
    },
    select: {
      id: true,
      name: true,
      sourceDetail: true,
    },
  });
  
  const actualQidNames = qidNames.filter(r => /^Q\d+$/.test(r.name));
  console.log('=== Records with QID as name ===');
  console.log(`Total: ${actualQidNames.length}`);
  for (const r of actualQidNames.slice(0, 10)) {
    console.log(`  ${r.name} (sourceDetail: ${r.sourceDetail})`);
  }
  
  // 2. 查找 landmark 分类中可能需要重新分类的记录
  const landmarks = await prisma.place.findMany({
    where: {
      source: 'wikidata',
      categorySlug: 'landmark',
    },
    select: {
      id: true,
      name: true,
    },
  });
  
  // 检测可能的分类
  const categoryKeywords: Record<string, RegExp> = {
    museum: /\b(museum|musée|museo|muzeum|gallery|galleria|galerie)\b/i,
    hotel: /\b(hotel|inn|resort|hostel|motel|ryokan)\b/i,
    cafe: /\b(cafe|café|coffee|coffeehouse)\b/i,
    restaurant: /\b(restaurant|bistro|brasserie|trattoria|ristorante)\b/i,
    bar: /\b(bar|pub|tavern|lounge)\b/i,
    church: /\b(church|cathedral|basilica|chapel|abbey|monastery|priory|minster)\b/i,
    temple: /\b(temple|shrine|mosque|synagogue|pagoda)\b/i,
    castle: /\b(castle|palace|château|chateau|schloss|palacio|palazzo|fort|fortress)\b/i,
    library: /\b(library|bibliothèque|biblioteca)\b/i,
    university: /\b(university|college|school|academy|institute)\b/i,
    park: /\b(park|garden|botanical)\b/i,
  };
  
  const reclassify: Record<string, string[]> = {};
  
  for (const r of landmarks) {
    for (const [category, pattern] of Object.entries(categoryKeywords)) {
      if (pattern.test(r.name)) {
        if (!reclassify[category]) reclassify[category] = [];
        if (reclassify[category].length < 5) {
          reclassify[category].push(r.name);
        } else if (reclassify[category].length === 5) {
          reclassify[category].push('...');
        }
        break;
      }
    }
  }
  
  console.log('\n=== Landmarks that could be reclassified ===');
  for (const [category, names] of Object.entries(reclassify)) {
    console.log(`\n${category}:`);
    for (const name of names) {
      console.log(`  - ${name}`);
    }
  }
  
  // 统计
  let totalToReclassify = 0;
  for (const r of landmarks) {
    for (const pattern of Object.values(categoryKeywords)) {
      if (pattern.test(r.name)) {
        totalToReclassify++;
        break;
      }
    }
  }
  console.log(`\nTotal landmarks to reclassify: ${totalToReclassify} / ${landmarks.length}`);
  
  // 3. 查找非英文名称
  const nonEnglishPattern = /[^\x00-\x7F]/;
  const nonEnglishNames = landmarks.filter(r => nonEnglishPattern.test(r.name));
  
  console.log('\n=== Non-English names (sample) ===');
  console.log(`Total: ${nonEnglishNames.length}`);
  for (const r of nonEnglishNames.slice(0, 15)) {
    console.log(`  - ${r.name}`);
  }
}

main().then(() => process.exit(0)).catch(console.error);
