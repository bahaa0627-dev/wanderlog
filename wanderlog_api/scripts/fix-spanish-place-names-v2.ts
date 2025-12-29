/**
 * 修复西班牙语/加泰罗尼亚语/意大利语地点名 - V2
 * 只翻译开头的通用词，保留专有名词
 */
import prisma from '../src/config/database';

// 只翻译开头的词（场所类型）
const PREFIX_TRANSLATIONS: Record<string, string> = {
  // 西班牙语
  'Restaurante': 'Restaurant',
  'Cafetería': 'Cafe',
  'Tienda': 'Shop',
  'Mercado': 'Market',
  'Museo': 'Museum',
  'Iglesia': 'Church',
  'Parque': 'Park',
  'Jardín': 'Garden',
  'Jardines': 'Gardens',
  'Plaza': 'Square',
  'Mirador': 'Viewpoint',
  'Biblioteca': 'Library',
  'Palacio': 'Palace',
  'Castillo': 'Castle',
  'Puente': 'Bridge',
  'Fuente': 'Fountain',
  'Torre': 'Tower',
  'Puerta': 'Gate',
  'Basílica': 'Basilica',
  'Catedral': 'Cathedral',
  'Capilla': 'Chapel',
  'Cementerio': 'Cemetery',
  
  // 加泰罗尼亚语
  'Plaça': 'Square',
  'Carrer': 'Street',
  'Passeig': 'Promenade',
  'Parc': 'Park',
  'Jardí': 'Garden',
  'Mercat': 'Market',
  'Museu': 'Museum',
  'Església': 'Church',
  'Palau': 'Palace',
  'Castell': 'Castle',
  'Pont': 'Bridge',
  'Font': 'Fountain',
  'Capella': 'Chapel',
  
  // 意大利语
  'Piazza': 'Square',
  'Piazzale': 'Square',
  'Palazzo': 'Palace',
  'Chiesa': 'Church',
  'Basilica': 'Basilica',
  'Giardino': 'Garden',
  'Giardini': 'Gardens',
  'Ponte': 'Bridge',
  'Fontana': 'Fountain',
  'Castello': 'Castle',
  'Galleria': 'Gallery',
  'Teatro': 'Theater',
  'Porta': 'Gate',
};

function translateName(name: string): string {
  // 跳过已经是英文的名称
  if (/^(Restaurant|Cafe|Shop|Market|Museum|Church|Park|Garden|Square|Viewpoint|Library|Palace|Castle|Bridge|Fountain|Tower|Gate|Basilica|Cathedral|Chapel|Cemetery|Street|Promenade|Gallery|Theater)\b/i.test(name)) {
    return name;
  }
  
  // 只翻译开头的词
  for (const [original, replacement] of Object.entries(PREFIX_TRANSLATIONS)) {
    // 检查是否以该词开头（后面跟空格或标点）
    const regex = new RegExp(`^${original}\\b`, 'i');
    if (regex.test(name)) {
      return name.replace(regex, replacement);
    }
  }
  
  return name;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  
  console.log(`🌐 开始修复地点名 V2 (dry-run: ${dryRun})\n`);
  
  // 获取西班牙/意大利城市的地点
  const cities = ['Madrid', 'Barcelona', 'Rome', 'Milan', 'Florence', 'Venice', 'Seville'];
  
  let totalUpdated = 0;
  
  for (const city of cities) {
    const places = await prisma.place.findMany({
      where: { city },
      select: { id: true, name: true }
    });
    
    let cityUpdated = 0;
    
    for (const place of places) {
      const newName = translateName(place.name);
      
      if (newName !== place.name) {
        console.log(`[${city}] ${place.name} -> ${newName}`);
        
        if (!dryRun) {
          await prisma.place.update({
            where: { id: place.id },
            data: { name: newName }
          });
        }
        cityUpdated++;
      }
    }
    
    if (cityUpdated > 0) {
      console.log(`\n${city}: 更新 ${cityUpdated} 条\n`);
      totalUpdated += cityUpdated;
    }
  }
  
  console.log(`\n=== 完成 ===`);
  console.log(`总共更新: ${totalUpdated} 条`);
  
  await prisma.$disconnect();
}

main().catch(console.error);
