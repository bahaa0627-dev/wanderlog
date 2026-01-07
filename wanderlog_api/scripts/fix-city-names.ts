/**
 * Migration Script: Fix City Names
 * 
 * This script normalizes city names by removing district/arrondissement prefixes
 * and converting them to the main city name in English.
 * 
 * Examples:
 * - "14th arrondissement of Paris" → "Paris"
 * - "5th arrondissement of Lyon" → "Lyon"
 * - "2nd arrondissement of Marseille" → "Marseille"
 * - "Shibuya City" → "Tokyo"
 * - "Westminster" → "London"
 * 
 * Usage:
 *   npx ts-node scripts/fix-city-names.ts [--dry-run]
 */

import prisma from '../src/config/database';

/**
 * Patterns to extract city name from district names
 */
const CITY_EXTRACTION_PATTERNS: Array<{ pattern: RegExp; replacement: string | null }> = [
  // French arrondissements: "Xth arrondissement of City" → "City"
  { pattern: /^\d+(?:st|nd|rd|th)\s+arrondissement\s+of\s+(.+)$/i, replacement: null },
  
  // French arrondissements in French: "Xe arrondissement de Paris" → "Paris"
  { pattern: /^\d+e?\s+arrondissement\s+de\s+(.+)$/i, replacement: null },
  
  // Tokyo 23 special wards and neighborhoods
  { pattern: /^(Shibuya|Minato|Shinjuku|Chiyoda|Taito|Chuo|Meguro|Setagaya|Nakano|Toshima|Sumida|Koto|Shinagawa|Ota|Bunkyo|Arakawa|Nerima|Suginami|Itabashi|Katsushika|Edogawa|Adachi|Kita)(\s+City)?$/i, replacement: 'Tokyo' },
  // Tokyo neighborhoods and areas
  { pattern: /^(Ginza|Marunouchi|Roppongi|Akihabara|Ueno|Asakusa|Ikebukuro|Shimbashi|Shinbashi|Odaiba|Daiba|Ariake|Azabudai|Jingūmae|Jinnan|Sendagaya|Harajuku|Omotesando|Ebisu|Daikanyama|Nakameguro|Shimokitazawa|Kichijoji|Nishi-Shinjuku|Higashi-Shinjuku|Kabukicho|Yoyogi|Akasaka|Toranomon|Nihonbashi|Otemachi|Yurakucho|Yūrakuchō|Hibiya|Tsukiji|Tsukishima|Kanda|Kanda-Surugadai|Ochanomizu|Jimbocho|Iidabashi|Korakuen|Kōraku|Kasuga|Hongo|Yanaka|Nezu|Ueno-kōen|Aoyama|Minami-Aoyama|Kita-Aoyama|Oshiage|Ryogoku|Kinshicho|Monzen-nakacho|Toyosu|Shiodome|Higashi-Shinbashi|Hamamatsucho|Tamachi|Shinagawa|Gotanda|Osaki|Meguro|Nakano|Koenji|Asagaya|Ogikubo|Nishi-Ogikubo|Mitaka|Musashino|Chofu|Fuchu|Tachikawa|Hachioji|Machida|Higashi-Ikebukuro|Minami-Ikebukuro|Otsuka|Sugamo|Komagome|Tabata|Nippori|Uguisudani|Okachimachi|Ameyoko|Sekiguchi|Nagatachō|Kioichō|Sanbanchō|Shirokanedai|Takanawa|Mita|Azabu|Hiroo|Nishi-Azabu|Kamezawa)$/i, replacement: 'Tokyo' },
  // Tokyo with -ku suffix
  { pattern: /^(Bunkyō-ku|Shibuya-ku|Shinjuku-ku|Minato-ku|Chiyoda-ku|Chuo-ku|Taito-ku|Sumida-ku|Koto-ku|Shinagawa-ku|Meguro-ku|Ota-ku|Setagaya-ku|Nakano-ku|Suginami-ku|Toshima-ku|Kita-ku|Arakawa-ku|Itabashi-ku|Nerima-ku|Adachi-ku|Katsushika-ku|Edogawa-ku)$/i, replacement: 'Tokyo' },
  // Tokyo suburbs and nearby cities (within Greater Tokyo Area)
  { pattern: /^(Yokosuka|Fussa|Kawagoe|Mihama-ku|Nagabusamachi|Maeharachō)$/i, replacement: 'Tokyo' },
  
  // Osaka wards and neighborhoods
  { pattern: /^(Namba|Umeda|Shinsaibashi|Dotonbori|Tennoji|Kita-ku|Chuo-ku|Nipponbashi|Shinsekai|Abeno|Tsuruhashi|Nakanoshima|Yodoyabashi|Honmachi|Nishi-Umeda|Higashi-Umeda|Temma|Tenjinbashi|Sumiyoshi-ku|Sakai-ku)$/i, replacement: 'Osaka' },
  // Osaka suburbs and nearby cities
  { pattern: /^(Ibaraki|Sakai|Takarazuka|Hatahara|Hatobachō|Fujiidera|Kanan|Wakamatsudai|Ōyamazaki-chō)$/i, replacement: 'Osaka' },
  
  // Kyoto wards and neighborhoods
  { pattern: /^(Sakyō-ku|Nakagyō Ward|Nakagyō-ku|Shimogyō-ku|Kamigyō-ku|Ukyō-ku|Fushimi-ku|Yamashina-ku|Nishikyō-ku|Kita-ku|Minami-ku|Higashiyama-ku|Gion|Arashiyama|Kinkakuji|Ginkakuji|Fushimi|Nijo|Sanjo|Shijo|Kawaramachi|Pontocho|Kiyomizu)$/i, replacement: 'Kyoto' },
  // Kyoto suburbs
  { pattern: /^(Otsu)$/i, replacement: 'Kyoto' },
  
  // Kobe neighborhoods
  { pattern: /^(Sannomiya|Motomachi|Harborland|Meriken Park|Kitano|Kitano-chō|Yamamoto-dōri|Rokkōsanchō|Tarumi-ku|Wakinohama Kaigandōri|Kaigandori)$/i, replacement: 'Kobe' },
  // Kobe suburbs
  { pattern: /^(Awaji)$/i, replacement: 'Kobe' },
  
  // Yokohama neighborhoods
  { pattern: /^(Minatomirai|Kannai|Chinatown|Yamashita|Motomachi|Sakuragicho|Shin-Yokohama|Tsurumi|Kohoku|Totsuka|Isogo|Kanazawa-ku)$/i, replacement: 'Yokohama' },
  
  // Fukuoka neighborhoods
  { pattern: /^(Hakata|Tenjin|Nakasu|Daimyo|Ohori|Momochi|Haruyoshi)$/i, replacement: 'Fukuoka' },
  
  // Nagoya neighborhoods
  { pattern: /^(Sakae|Nagoya Station|Osu|Kanayama|Fushimi|Daikō Minami 1-chōme)$/i, replacement: 'Nagoya' },
  // Nagoya suburbs
  { pattern: /^(Toyota|Gifu|Tajimi)$/i, replacement: 'Nagoya' },
  
  // Kitakyushu wards
  { pattern: /^(Moji-ku|Tobata-ku|Kokura|Yahata|Wakamatsu)$/i, replacement: 'Kitakyushu' },
  
  // London boroughs
  { pattern: /^(Westminster|Camden|Kensington|Chelsea|Shoreditch|Soho|Covent Garden|Notting Hill|Brixton|Greenwich|City of London)$/i, replacement: 'London' },
  
  // New York boroughs
  { pattern: /^(Manhattan|Brooklyn|Queens|Bronx|Staten Island)$/i, replacement: 'New York' },
  
  // Sydney districts
  { pattern: /^(North Sydney|Surry Hills|Haymarket|Pyrmont|Darlinghurst|Paddington|Newtown|Bondi|Manly|Parramatta|Chatswood|Circular Quay|The Rocks|Barangaroo|Ultimo|Redfern|Glebe|Chippendale|Alexandria|Waterloo)$/i, replacement: 'Sydney' },
  
  // Singapore districts
  { pattern: /^(Orchard|Marina Bay|Chinatown|Little India|Sentosa)$/i, replacement: 'Singapore' },
  
  // Hong Kong districts
  { pattern: /^(Central|Wan Chai|Causeway Bay|Tsim Sha Tsui|Mong Kok|Kowloon)$/i, replacement: 'Hong Kong' },
];

/**
 * Direct city name mappings (localized names to English)
 */
const CITY_NAME_MAPPINGS: Record<string, string> = {
  // Typos and variations
  'Tokio': 'Tokyo',
  
  // Danish
  'København': 'Copenhagen',
  'Kobenhavn': 'Copenhagen',
  
  // Japanese
  '東京': 'Tokyo',
  '東京都': 'Tokyo',
  '大阪': 'Osaka',
  '大阪市': 'Osaka',
  '京都': 'Kyoto',
  '京都市': 'Kyoto',
  '札幌': 'Sapporo',
  '札幌市': 'Sapporo',
  
  // Thai
  'กรุงเทพมหานคร': 'Bangkok',
  'เชียงใหม่': 'Chiang Mai',
  
  // German
  'München': 'Munich',
  'Köln': 'Cologne',
  
  // Austrian
  'Wien': 'Vienna',
  
  // Italian
  'Roma': 'Rome',
  'Milano': 'Milan',
  'Firenze': 'Florence',
  'Venezia': 'Venice',
  'Napoli': 'Naples',
  
  // Spanish
  'Sevilla': 'Seville',
  
  // Chinese
  '北京': 'Beijing',
  '上海': 'Shanghai',
  '香港': 'Hong Kong',
  
  // Korean
  '서울': 'Seoul',
  '부산': 'Busan',
};

/**
 * Normalize a city name
 */
function normalizeCity(city: string | null): string | null {
  if (!city) return null;
  
  const trimmed = city.trim();
  if (!trimmed) return null;
  
  // Check direct mappings first
  if (CITY_NAME_MAPPINGS[trimmed]) {
    return CITY_NAME_MAPPINGS[trimmed];
  }
  
  // Check extraction patterns
  for (const { pattern, replacement } of CITY_EXTRACTION_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      // If replacement is specified, use it; otherwise use captured group
      return replacement || match[1];
    }
  }
  
  return trimmed;
}

interface PlaceRecord {
  id: string;
  name: string;
  city: string | null;
}

async function fixCityNames(dryRun: boolean = false): Promise<void> {
  console.log('🔧 Fix City Names Migration');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  console.log('');

  // Find all records with city values (all sources)
  const records = await prisma.place.findMany({
    where: {
      city: { not: null },
    },
    select: {
      id: true,
      name: true,
      city: true,
    },
  }) as PlaceRecord[];

  console.log(`📊 Found ${records.length} records with city values`);
  console.log('');

  // Statistics
  const stats = {
    total: records.length,
    changed: 0,
    unchanged: 0,
    changes: {} as Record<string, { newCity: string; count: number }>,
  };

  // Process each record
  for (const record of records) {
    const originalCity = record.city;
    const normalizedCity = normalizeCity(originalCity);
    
    if (normalizedCity !== originalCity) {
      stats.changed++;
      
      // Track changes
      const key = `${originalCity} → ${normalizedCity}`;
      if (!stats.changes[key]) {
        stats.changes[key] = { newCity: normalizedCity || '', count: 0 };
      }
      stats.changes[key].count++;
      
      // Log changes for dry run (limit output)
      if (dryRun && stats.changed <= 50) {
        console.log(`📝 "${record.name}": ${originalCity} → ${normalizedCity}`);
      }
      
      // Update the record if not dry run
      if (!dryRun) {
        await prisma.place.update({
          where: { id: record.id },
          data: { city: normalizedCity },
        });
      }
    } else {
      stats.unchanged++;
    }
  }

  // Print summary
  console.log('');
  console.log('📊 Summary');
  console.log('==========');
  console.log(`Total records: ${stats.total}`);
  console.log(`Changed: ${stats.changed}`);
  console.log(`Unchanged: ${stats.unchanged}`);
  console.log('');
  
  if (Object.keys(stats.changes).length > 0) {
    console.log('City name changes:');
    
    // Sort by count descending
    const sortedChanges = Object.entries(stats.changes)
      .sort((a, b) => b[1].count - a[1].count);
    
    for (const [change, { count }] of sortedChanges) {
      console.log(`  ${change}: ${count} records`);
    }
  }

  if (dryRun) {
    console.log('');
    console.log('⚠️  This was a dry run. No changes were made.');
    console.log('   Run without --dry-run to apply changes.');
  } else {
    console.log('');
    console.log('✅ Migration complete!');
  }
}

// Main execution
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

fixCityNames(dryRun)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });
