/**
 * 修复法语地点名 - 只翻译开头的通用词
 */
import prisma from '../src/config/database';

// 法语前缀翻译
const FRENCH_PREFIX_TRANSLATIONS: Record<string, string> = {
  // 场所类型
  'Rue': 'Street',
  'Place': 'Square',
  'Avenue': 'Avenue',
  'Boulevard': 'Boulevard',
  'Jardin': 'Garden',
  'Jardins': 'Gardens',
  'Parc': 'Park',
  'Musée': 'Museum',
  'Église': 'Church',
  'Château': 'Castle',
  'Pont': 'Bridge',
  'Fontaine': 'Fountain',
  'Palais': 'Palace',
  'Bibliothèque': 'Library',
  'Cimetière': 'Cemetery',
  'Boulangerie': 'Bakery',
  'Brasserie': 'Brasserie',
  'Café': 'Cafe',
  'Marché': 'Market',
  'Galerie': 'Gallery',
  'Tour': 'Tower',
  'Porte': 'Gate',
  'Belvédère': 'Viewpoint',
  'Hôtel': 'Hotel',
  'Maison': 'House',
  'Théâtre': 'Theater',
  'Opéra': 'Opera',
  'Gare': 'Station',
  'Quai': 'Quay',
  'Passage': 'Passage',
  'Cour': 'Courtyard',
  'Square': 'Square',
  'Impasse': 'Alley',
  'Allée': 'Path',
  'Esplanade': 'Esplanade',
  'Promenade': 'Promenade',
  'Colonne': 'Column',
  'Arc': 'Arch',
  'Beffroi': 'Belfry',
  'Chalet': 'Chalet',
  'Ancien': 'Old',
  'Ancienne': 'Old',
};

function translateName(name: string): string {
  // 跳过已经是英文的名称
  if (/^(Restaurant|Cafe|Shop|Market|Museum|Church|Park|Garden|Square|Viewpoint|Library|Palace|Castle|Bridge|Fountain|Tower|Gate|Basilica|Cathedral|Chapel|Cemetery|Street|Promenade|Gallery|Theater|Bakery|Hotel|House|Station|Column|Arch|Belfry|Old)\b/i.test(name)) {
    return name;
  }
  
  // 只翻译开头的词
  for (const [original, replacement] of Object.entries(FRENCH_PREFIX_TRANSLATIONS)) {
    const regex = new RegExp(`^${original}\\b`, 'i');
    if (regex.test(name)) {
      return name.replace(regex, replacement);
    }
  }
  
  return name;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  
  console.log(`🇫🇷 开始修复法语地点名 (dry-run: ${dryRun})\n`);
  
  // 获取巴黎的地点
  const places = await prisma.place.findMany({
    where: { city: 'Paris' },
    select: { id: true, name: true }
  });
  
  let updated = 0;
  
  for (const place of places) {
    const newName = translateName(place.name);
    
    if (newName !== place.name) {
      console.log(`${place.name} -> ${newName}`);
      
      if (!dryRun) {
        await prisma.place.update({
          where: { id: place.id },
          data: { name: newName }
        });
      }
      updated++;
    }
  }
  
  console.log(`\n=== 完成 ===`);
  console.log(`更新: ${updated} 条`);
  
  await prisma.$disconnect();
}

main().catch(console.error);
