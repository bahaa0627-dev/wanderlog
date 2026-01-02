import prisma from '../src/config/database';

// AI 返回的坐标（从日志推测，需要实际测试）
const AI_COORDS: Record<string, { lat: number; lng: number }> = {
  'Le Meurice': { lat: 48.8651, lng: 2.3281 },
  'Le Train Bleu': { lat: 48.8448, lng: 2.3735 },
  'La Tour d\'Argent': { lat: 48.8503, lng: 2.3544 },
  'Epicure': { lat: 48.8708, lng: 2.3167 },
  'Chez Janou': { lat: 48.8573, lng: 2.3656 },
};

async function check() {
  console.log('\n--- Coordinate comparison ---');
  for (const [name, aiCoord] of Object.entries(AI_COORDS)) {
    const place = await prisma.place.findFirst({
      where: { name: { contains: name, mode: 'insensitive' } },
      select: { name: true, latitude: true, longitude: true },
    });
    if (place) {
      const latDiff = Math.abs(aiCoord.lat - place.latitude);
      const lngDiff = Math.abs(aiCoord.lng - place.longitude);
      const isNearby = latDiff < 0.01 && lngDiff < 0.01;
      console.log(`${name}:`);
      console.log(`  AI:  (${aiCoord.lat}, ${aiCoord.lng})`);
      console.log(`  DB:  (${place.latitude}, ${place.longitude})`);
      console.log(`  Diff: lat=${latDiff.toFixed(4)}, lng=${lngDiff.toFixed(4)}`);
      console.log(`  Match: ${isNearby ? '✅' : '❌'}`);
    }
  }
  
  await prisma.$disconnect();
}
check();
