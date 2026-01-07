import prisma from '../src/config/database';

async function main() {
  // 获取所有日本的记录
  const records = await prisma.place.findMany({
    where: {
      country: 'Japan',
    },
    select: {
      name: true,
      city: true,
      latitude: true,
      longitude: true,
    },
  });
  
  // 大城市的坐标范围 (lat, lng, radius in degrees ~= km/111)
  const majorCities: Record<string, { lat: number; lng: number; radius: number }> = {
    'Tokyo': { lat: 35.6762, lng: 139.6503, radius: 0.5 },     // ~55km
    'Osaka': { lat: 34.6937, lng: 135.5023, radius: 0.35 },    // ~39km
    'Kyoto': { lat: 35.0116, lng: 135.7681, radius: 0.25 },    // ~28km
    'Yokohama': { lat: 35.4437, lng: 139.6380, radius: 0.25 }, // ~28km
    'Kobe': { lat: 34.6901, lng: 135.1956, radius: 0.25 },     // ~28km
    'Nagoya': { lat: 35.1815, lng: 136.9066, radius: 0.3 },    // ~33km
    'Fukuoka': { lat: 33.5904, lng: 130.4017, radius: 0.25 },  // ~28km
    'Sapporo': { lat: 43.0618, lng: 141.3545, radius: 0.3 },   // ~33km
  };
  
  // 已知的大城市，不需要检查
  const knownMajorCities = ['Tokyo', 'Osaka', 'Kyoto', 'Yokohama', 'Kobe', 'Nagoya', 'Fukuoka', 'Sapporo', 'Hiroshima', 'Nara', 'Sendai', 'Kitakyushu'];
  
  // 检查每个非大城市的记录
  const cityMapping: Record<string, { shouldBe: string; count: number; samples: string[] }> = {};
  
  for (const r of records) {
    const city = r.city || '(null)';
    
    // 跳过已知的大城市
    if (knownMajorCities.includes(city)) {
      continue;
    }
    
    // 检查是否在某个大城市范围内
    for (const [majorCity, coords] of Object.entries(majorCities)) {
      const distance = Math.sqrt(
        Math.pow(r.latitude - coords.lat, 2) + 
        Math.pow(r.longitude - coords.lng, 2)
      );
      if (distance < coords.radius) {
        const key = `${city} → ${majorCity}`;
        if (!cityMapping[key]) {
          cityMapping[key] = { shouldBe: majorCity, count: 0, samples: [] };
        }
        cityMapping[key].count++;
        if (cityMapping[key].samples.length < 2) {
          cityMapping[key].samples.push(r.name);
        }
        break;
      }
    }
  }
  
  // 输出需要修复的城市
  console.log('Cities that should be remapped:\n');
  const sorted = Object.entries(cityMapping).sort((a, b) => b[1].count - a[1].count);
  
  for (const [mapping, data] of sorted) {
    console.log(`${mapping}: ${data.count} records`);
    for (const sample of data.samples) {
      console.log(`  - ${sample}`);
    }
  }
  
  // 按目标城市汇总
  console.log('\n\nSummary by target city:');
  const byTarget: Record<string, number> = {};
  for (const [, data] of sorted) {
    byTarget[data.shouldBe] = (byTarget[data.shouldBe] || 0) + data.count;
  }
  for (const [city, count] of Object.entries(byTarget).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${city}: ${count} records to add`);
  }
}

main().then(() => process.exit(0)).catch(console.error);
