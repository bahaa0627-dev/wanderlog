/**
 * 修复城市名称 - 将区/郊区归并到主城市
 */
import prisma from '../src/config/database';

// 区/郊区 -> 主城市 映射
const CITY_MAPPING: Record<string, string> = {
  // New York 区域
  'Brooklyn': 'New York',
  'Bronx': 'New York',
  'Queens': 'New York',
  'Jersey City': 'New York',
  'Far Rockaway': 'New York',
  'Rockaway Park': 'New York',
  'Ridgewood': 'New York',
  'Jamaica': 'New York',
  'Elmhurst': 'New York',
  'Jackson Heights': 'New York',
  'Hoboken': 'New York',
  
  // Tokyo 区域
  'Shibuya': 'Tokyo',
  'Shinjuku City': 'Tokyo',
  'Nakano City': 'Tokyo',
  'Nerima City': 'Tokyo',
  'Toshima City': 'Tokyo',
  'Chiyoda City': 'Tokyo',
  'Suginami City': 'Tokyo',
  'Minato City': 'Tokyo',
  'Setagaya City': 'Tokyo',
  'Bunkyo City': 'Tokyo',
  'Chuo City': 'Tokyo',
  'Sumida City': 'Tokyo',
  'Itabashi City': 'Tokyo',
  'Adachi City': 'Tokyo',
  'Arakawa City': 'Tokyo',
  'Katsushika City': 'Tokyo',
  'Kita City': 'Tokyo',
  'Meguro City': 'Tokyo',
  'Shinagawa City': 'Tokyo',
  'Hachioji': 'Tokyo',
  'Chofu': 'Tokyo',
  'Machida': 'Tokyo',
  'Musashino': 'Tokyo',
  'Mitaka': 'Tokyo',
  'Koganei': 'Tokyo',
  'Kodaira': 'Tokyo',
  'Kokubunji': 'Tokyo',
  'Kunitachi': 'Tokyo',
  'Nishitokyo': 'Tokyo',
  'Higashikurume': 'Tokyo',
  'Niiza': 'Tokyo',
  
  // Seoul 区域
  'Jongno District': 'Seoul',
  'Yongsan District': 'Seoul',
  'Seodaemun-gu': 'Seoul',
  'Jung District': 'Seoul',
  'Mapo-gu': 'Seoul',
  'Eunpyeong District': 'Seoul',
  'Seongbuk District': 'Seoul',
  'Seongdong-gu': 'Seoul',
  
  // Los Angeles 区域
  'Pacific Palisades': 'Los Angeles',
  'Woodland Hills': 'Los Angeles',
  'Marina Del Rey': 'Los Angeles',
  'Playa Del Rey': 'Los Angeles',
  'North Hollywood': 'Los Angeles',
  'San Pedro': 'Los Angeles',
  'Playa Vista': 'Los Angeles',
  'Northridge': 'Los Angeles',
  'West Hills': 'Los Angeles',
  'Canoga Park': 'Los Angeles',
  'Granada Hills': 'Los Angeles',
  'Harbor City': 'Los Angeles',
  'Calabasas': 'Los Angeles',
  'Malibu': 'Los Angeles',
  'Santa Monica': 'Los Angeles',
  'Topanga': 'Los Angeles',
  'Torrance': 'Los Angeles',
  
  // Sydney 区域
  'Cronulla': 'Sydney',
  'Campbelltown': 'Sydney',
  'Parramatta': 'Sydney',
  'Caringbah': 'Sydney',
  'Miranda': 'Sydney',
  'Surry Hills': 'Sydney',
  'Newtown': 'Sydney',
  'Kirrawee': 'Sydney',
  'Woolooware': 'Sydney',
  'Auburn': 'Sydney',
  'Fairfield': 'Sydney',
  'Stanmore': 'Sydney',
  'Carlingford': 'Sydney',
  'Bradbury': 'Sydney',
  'Gregory Hills': 'Sydney',
  'Bondi Junction': 'Sydney',
  'Burraneer': 'Sydney',
  'Chippendale': 'Sydney',
  'Coogee': 'Sydney',
  'Elizabeth Bay': 'Sydney',
  'Forest Lodge': 'Sydney',
  'Grays Point': 'Sydney',
  'Gymea': 'Sydney',
  'Gymea Bay': 'Sydney',
  'Harris Park': 'Sydney',
  'Haymarket': 'Sydney',
  'Homebush West': 'Sydney',
  'Ingleburn': 'Sydney',
  'Kareela': 'Sydney',
  'Kurnell': 'Sydney',
  'Lidcombe': 'Sydney',
  'Liverpool': 'Sydney',
  'Macquarie Links': 'Sydney',
  'Marrickville': 'Sydney',
  'McMahons Point': 'Sydney',
  'Moorebank': 'Sydney',
  'Narellan': 'Sydney',
  'Neutral Bay': 'Sydney',
  'North Parramatta': 'Sydney',
  'Oatley': 'Sydney',
  'Penshurst': 'Sydney',
  'Potts Point': 'Sydney',
  'Seven Hills': 'Sydney',
  'Smithfield': 'Sydney',
  'St Leonards': 'Sydney',
  'Sydney Olympic Park': 'Sydney',
  'Sylvania': 'Sydney',
  'Sylvania Waters': 'Sydney',
  'Taren Point': 'Sydney',
  'The Rocks': 'Sydney',
  'Toongabbie': 'Sydney',
  'Westmead': 'Sydney',
  'Woolloomooloo': 'Sydney',
  'Rookwood': 'Sydney',
  'Cobbitty': 'Sydney',
  'Harrington Park': 'Sydney',
  'Horsley Park': 'Sydney',
  'Kentlyn': 'Sydney',
  'Kirkham': 'Sydney',
  'Minchinbury': 'Sydney',
  'Mulgoa': 'Sydney',
  'St Helens Park': 'Sydney',
  'Warragamba': 'Sydney',
  'Camden': 'Sydney',
  
  // Melbourne 区域
  'Werribee': 'Melbourne',
  'Cape Schanck': 'Melbourne',
  'Mitcham': 'Melbourne',
  'Manor Lakes': 'Melbourne',
  'Williamstown': 'Melbourne',
  'Wyndham Vale': 'Melbourne',
  'Healesville': 'Melbourne',
  'Ringwood': 'Melbourne',
  'Lilydale': 'Melbourne',
  'Flinders': 'Melbourne',
  'Wantirna South': 'Melbourne',
  'Warburton': 'Melbourne',
  'Rosebud': 'Melbourne',
  'Mulgrave': 'Melbourne',
  'Rye': 'Melbourne',
  'Yarra Junction': 'Melbourne',
  'Altona Meadows': 'Melbourne',
  'Altona North': 'Melbourne',
  'Altona': 'Melbourne',
  'Eynesbury': 'Melbourne',
  'Sorrento': 'Melbourne',
  'Nunawading': 'Melbourne',
  'Thomastown': 'Melbourne',
  'Len Waters Estate': 'Melbourne',
  'Tootgarook': 'Melbourne',
  'Footscray': 'Melbourne',
  'Warrandyte': 'Melbourne',
  'Main Ridge': 'Melbourne',
  'Boneo': 'Melbourne',
  'Mambourin': 'Melbourne',
  'West Footscray': 'Melbourne',
  'Williams Landing': 'Melbourne',
  'Ascot Vale': 'Melbourne',
  'Avondale Heights': 'Melbourne',
  'Avonsleigh': 'Melbourne',
  'Bayswater': 'Melbourne',
  'Bayswater North': 'Melbourne',
  'Belgrave': 'Melbourne',
  'Boronia': 'Melbourne',
  'Broadmeadows': 'Melbourne',
  'Bulla': 'Melbourne',
  'Bundoora': 'Melbourne',
  'Burwood': 'Melbourne',
  'Cockatoo': 'Melbourne',
  'Croydon': 'Melbourne',
  'Eltham': 'Melbourne',
  'Essendon Fields': 'Melbourne',
  'Exford': 'Melbourne',
  'Ferntree Gully': 'Melbourne',
  'Hoppers Crossing': 'Melbourne',
  'Keilor East': 'Melbourne',
  'Kensington': 'Melbourne',
  'Kilsyth': 'Melbourne',
  'Kilsyth South': 'Melbourne',
  'Launching Place': 'Melbourne',
  'Little River': 'Melbourne',
  'Macleod': 'Melbourne',
  'Monbulk': 'Melbourne',
  'Mount Evelyn': 'Melbourne',
  'Newport': 'Melbourne',
  'Niddrie': 'Melbourne',
  'Olinda': 'Melbourne',
  'Point Leo': 'Melbourne',
  'Port Melbourne': 'Melbourne',
  'Red Hill': 'Melbourne',
  'Ringwood East': 'Melbourne',
  'Rockbank': 'Melbourne',
  'Sassafras': 'Melbourne',
  'Seddon': 'Melbourne',
  'Shoreham': 'Melbourne',
  'Somers': 'Melbourne',
  'Southbank': 'Melbourne',
  'Tarneit': 'Melbourne',
  'The Basin': 'Melbourne',
  'Thornhill Park': 'Melbourne',
  'Wandin East': 'Melbourne',
  'Wandin North': 'Melbourne',
  'Weir Views': 'Melbourne',
  'Wesburn': 'Melbourne',
  'Yarraville': 'Melbourne',
  
  // London 区域
  'Upminster': 'London',
  'Romford': 'London',
  'Barnet': 'London',
  'Hornchurch': 'London',
  'Kingston upon Thames': 'London',
  'Twickenham': 'London',
  'Ruislip': 'London',
  'Harrow': 'London',
  'Bexleyheath': 'London',
  'Morden': 'London',
  'Pinner': 'London',
  'Isleworth': 'London',
  'Rainham': 'London',
  'Hounslow': 'London',
  'Southall': 'London',
  'Carshalton': 'London',
  'Welling': 'London',
  'Greenford': 'London',
  'Belvedere': 'London',
  'Bexley': 'London',
  'Chessington': 'London',
  'Dartford': 'London',
  'Edgware': 'London',
  'Erith': 'London',
  'Feltham': 'London',
  'Hayes': 'London',
  'New Malden': 'London',
  'Surbiton': 'London',
  'Sutton': 'London',
  'Uxbridge': 'London',
  'Wembley': 'London',
  'Woodford': 'London',
  'Worcester Park': 'London',
  'Greater London': 'London',
  'Essex': 'London',
  
  // Paris 区域
  'Vincennes': 'Paris',
  'Saint-Mandé': 'Paris',
  
  // Barcelona 区域
  'L\'Hospitalet de Llobregat': 'Barcelona',
  'Eixample': 'Barcelona',
  
  // Osaka 区域
  '大阪市西区': 'Osaka',
  '大阪市鶴見区': 'Osaka',
  'Moriguchi': 'Osaka',
  'Higashiosaka': 'Osaka',
  
  // Blue Mountains (Sydney 附近，但保持独立或归入 Sydney)
  'Katoomba': 'Sydney',
  'Wentworth Falls': 'Sydney',
  'Lawson': 'Sydney',
  'Leura': 'Sydney',
  'Hazelbrook': 'Sydney',
  
  // Sapporo 区域 (保持独立)
  'Otaru': 'Sapporo',
  
  // 其他
  'Richmond': 'Melbourne', // 假设是墨尔本的 Richmond
};

async function main() {
  console.log('🔍 开始修复城市名称...\n');
  
  let totalUpdated = 0;
  
  for (const [oldCity, newCity] of Object.entries(CITY_MAPPING)) {
    const result = await prisma.place.updateMany({
      where: { city: oldCity },
      data: { city: newCity }
    });
    
    if (result.count > 0) {
      console.log(`✅ ${oldCity} -> ${newCity}: ${result.count} 条记录`);
      totalUpdated += result.count;
    }
  }
  
  console.log(`\n=== 完成 ===`);
  console.log(`总共更新: ${totalUpdated} 条记录`);
  
  // 显示更新后的城市分布
  console.log('\n=== 更新后的城市分布 (前20) ===');
  const cities = await prisma.place.groupBy({
    by: ['city'],
    _count: true,
    orderBy: { _count: { city: 'desc' } },
    take: 20
  });
  
  for (const c of cities) {
    console.log(`${c.city || '(null)'}: ${c._count}`);
  }
  
  await prisma.$disconnect();
}

main().catch(console.error);
