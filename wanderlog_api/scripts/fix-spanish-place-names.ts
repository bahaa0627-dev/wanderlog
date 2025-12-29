/**
 * 修复西班牙语/加泰罗尼亚语/意大利语地点名
 * 使用预定义的翻译规则
 */
import prisma from '../src/config/database';

// 常见词汇翻译映射（按语言分组避免重复）
const SPANISH_WORDS: Record<string, string> = {
  'Restaurante': 'Restaurant',
  'Cafetería': 'Cafe',
  'Tienda': 'Shop',
  'Mercado': 'Market',
  'Iglesia': 'Church',
  'Parque': 'Park',
  'Jardín': 'Garden',
  'Jardines': 'Gardens',
  'Plaza': 'Square',
  'Calle': 'Street',
  'Avenida': 'Avenue',
  'Paseo': 'Promenade',
  'Mirador': 'Viewpoint',
  'Biblioteca': 'Library',
  'Palacio': 'Palace',
  'Castillo': 'Castle',
  'Puente': 'Bridge',
  'Fuente': 'Fountain',
  'Torre': 'Tower',
  'Puerta': 'Gate',
  'Muralla': 'Wall',
  'Basílica': 'Basilica',
  'Catedral': 'Cathedral',
  'Capilla': 'Chapel',
  'Monasterio': 'Monastery',
  'Convento': 'Convent',
  'Cementerio': 'Cemetery',
  'Estación': 'Station',
  'Puerto': 'Port',
  'Playa': 'Beach',
  'Montaña': 'Mountain',
  'Colina': 'Hill',
  'Río': 'River',
  'Lago': 'Lake',
  'Bosque': 'Forest',
  'Nacional': 'National',
  'Real': 'Royal',
  'Antiguo': 'Old',
  'Nuevo': 'New',
  'Grande': 'Big',
  'Pequeño': 'Small',
  'Alto': 'High',
  'Bajo': 'Low',
  'Norte': 'North',
  'Sur': 'South',
  'Este': 'East',
  'Oeste': 'West',
  'Centro': 'Center',
  'Viejo': 'Old',
  'Museo': 'Museum',
};

const CATALAN_WORDS: Record<string, string> = {
  'Plaça': 'Square',
  'Carrer': 'Street',
  'Passeig': 'Promenade',
  'Avinguda': 'Avenue',
  'Parc': 'Park',
  'Jardí': 'Garden',
  'Mercat': 'Market',
  'Museu': 'Museum',
  'Església': 'Church',
  'Palau': 'Palace',
  'Castell': 'Castle',
  'Pont': 'Bridge',
  'Font': 'Fountain',
  'Porta': 'Gate',
  'Mur': 'Wall',
  'Platja': 'Beach',
  'Muntanya': 'Mountain',
  'Riu': 'River',
  'Llac': 'Lake',
  'Bosc': 'Forest',
  'Antic': 'Old',
  'Nou': 'New',
  'Gran': 'Big',
  'Petit': 'Small',
  'Vell': 'Old',
  'Sant': 'Saint',
  'Fossar': 'Cemetery',
  'Jaciment': 'Archaeological Site',
  'Porxos': 'Arcades',
  'Capella': 'Chapel',
  'Mural': 'Mural',
};

const ITALIAN_WORDS: Record<string, string> = {
  'Via': 'Street',
  'Piazza': 'Square',
  'Piazzale': 'Square',
  'Palazzo': 'Palace',
  'Chiesa': 'Church',
  'Basilica': 'Basilica',
  'Duomo': 'Cathedral',
  'Giardino': 'Garden',
  'Giardini': 'Gardens',
  'Ponte': 'Bridge',
  'Fontana': 'Fountain',
  'Villa': 'Villa',
  'Castello': 'Castle',
  'Galleria': 'Gallery',
  'Teatro': 'Theater',
  'Stazione': 'Station',
  'Porto': 'Port',
  'Monte': 'Mount',
  'Vecchio': 'Old',
  'Nuovo': 'New',
  'Piccolo': 'Small',
  'Basso': 'Low',
  'San': 'Saint',
  'Santa': 'Saint',
  'Santi': 'Saints',
};

// 合并所有词汇
const WORD_TRANSLATIONS: Record<string, string> = {
  ...SPANISH_WORDS,
  ...CATALAN_WORDS,
  ...ITALIAN_WORDS,
  'Café': 'Cafe',
};

// 完整名称翻译（特殊情况）
const FULL_NAME_TRANSLATIONS: Record<string, string> = {
  'Biblioteca Nacional de España': 'National Library of Spain',
  'Basílica de Santa Maria del Mar': 'Basilica of Santa Maria del Mar',
  'Fossar de la Pedrera': 'Cemetery of the Quarry',
  'Jaciment del Born': 'Born Archaeological Site',
  "Porxos d'en Xifré": 'Xifré Arcades',
  'Muralla de Santa Madrona': 'Santa Madrona Wall',
  'El palmerar': 'The Palm Grove',
  'La Cabana': 'The Cabin',
  'Mirador de Miramar': 'Miramar Viewpoint',
  "Plaça de l'Armada": 'Armada Square',
  'Pont del Bisbe': "Bishop's Bridge",
  'Capella de Santa Llúcia': 'Chapel of Saint Lucy',
  'Mirador de Montjuïc': 'Montjuïc Viewpoint',
  'Figuera de Can Climent': 'Can Climent Fig Tree',
  'Parque de los Alcornoques': 'Cork Oak Park',
  'La chimenea de San Cristóbal': 'San Cristóbal Chimney',
  'Puerta de Almaján': 'Almaján Gate',
};

function translateName(name: string): string {
  // 先检查完整名称翻译
  if (FULL_NAME_TRANSLATIONS[name]) {
    return FULL_NAME_TRANSLATIONS[name];
  }
  
  let translated = name;
  
  // 替换常见词汇
  for (const [original, replacement] of Object.entries(WORD_TRANSLATIONS)) {
    // 使用单词边界匹配（大小写不敏感）
    const regex = new RegExp(`\\b${original}\\b`, 'gi');
    translated = translated.replace(regex, replacement);
  }
  
  // 处理连接词
  translated = translated
    .replace(/\bde la\b/gi, 'of the')
    .replace(/\bdel\b/gi, 'of the')
    .replace(/\bde los\b/gi, 'of the')
    .replace(/\bde las\b/gi, 'of the')
    .replace(/\bde\b/gi, 'of')
    .replace(/\bd'en\b/gi, 'of')
    .replace(/\bd'/gi, 'of ')
    .replace(/\bl'/gi, 'the ')
    .replace(/\bel\b/gi, 'the')
    .replace(/\bla\b/gi, 'the')
    .replace(/\blos\b/gi, 'the')
    .replace(/\blas\b/gi, 'the')
    .replace(/\bels\b/gi, 'the')
    .replace(/\bles\b/gi, 'the')
    .replace(/\bil\b/gi, 'the')
    .replace(/\blo\b/gi, 'the')
    .replace(/\bgli\b/gi, 'the')
    .replace(/\by\b/gi, 'and');
  
  // 清理多余空格和 "the the" 等
  translated = translated
    .replace(/\bthe the\b/gi, 'the')
    .replace(/\s+/g, ' ')
    .trim();
  
  return translated;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  
  console.log(`🌐 开始修复地点名 (dry-run: ${dryRun})\n`);
  
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
