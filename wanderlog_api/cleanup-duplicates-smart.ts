import prisma from './src/config/database';

interface PlaceRecord {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  city: string | null;
  country: string | null;
  categorySlug: string | null;
  googlePlaceId: string | null;
  source: string;
  rating: number | null;
  ratingCount: number | null;
  coverImage: string | null;
  openingHours: any;
  createdAt: Date;
  updatedAt: Date;
}

async function cleanupDuplicates() {
  console.log('🧹 开始智能清理重复地点...\n');

  // 获取所有地点
  const allPlaces = await prisma.place.findMany({
    select: {
      id: true,
      name: true,
      latitude: true,
      longitude: true,
      city: true,
      country: true,
      categorySlug: true,
      googlePlaceId: true,
      source: true,
      rating: true,
      ratingCount: true,
      coverImage: true,
      openingHours: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  console.log(`📊 总地点数: ${allPlaces.length}\n`);

  const toDelete: string[] = [];
  const processed = new Set<string>();

  // 检查每个地点
  for (let i = 0; i < allPlaces.length; i++) {
    const place1 = allPlaces[i] as PlaceRecord;
    
    if (processed.has(place1.id)) continue;

    const duplicates: PlaceRecord[] = [place1];
    processed.add(place1.id);

    // 查找重复
    for (let j = i + 1; j < allPlaces.length; j++) {
      const place2 = allPlaces[j] as PlaceRecord;
      
      if (processed.has(place2.id)) continue;

      if (isDuplicate(place1, place2)) {
        duplicates.push(place2);
        processed.add(place2.id);
      }
    }

    // 如果找到重复，选择最好的保留
    if (duplicates.length > 1) {
      const best = selectBestPlace(duplicates);
      const toDeleteInGroup = duplicates.filter(p => p.id !== best.id).map(p => p.id);
      toDelete.push(...toDeleteInGroup);
      
      console.log(`🔍 发现重复组: ${best.name} (${duplicates.length} 个)`);
      console.log(`   ✅ 保留: ${best.name} (${best.source}, Google ID: ${best.googlePlaceId || 'N/A'})`);
      for (const dup of duplicates) {
        if (dup.id !== best.id) {
          console.log(`   ❌ 删除: ${dup.name} (${dup.source}, Google ID: ${dup.googlePlaceId || 'N/A'})`);
        }
      }
      console.log('');
    }
  }

  console.log(`\n📊 清理统计：`);
  console.log(`   总地点数: ${allPlaces.length}`);
  console.log(`   待删除: ${toDelete.length}`);
  console.log(`   保留: ${allPlaces.length - toDelete.length}`);
  console.log(`   清理率: ${((toDelete.length / allPlaces.length) * 100).toFixed(2)}%\n`);

  if (toDelete.length > 0) {
    console.log('⚠️  准备删除重复地点...');
    console.log('   按 Ctrl+C 取消，或等待 5 秒后自动执行...\n');
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('🗑️  开始删除...\n');
    
    // 分批删除
    const batchSize = 100;
    for (let i = 0; i < toDelete.length; i += batchSize) {
      const batch = toDelete.slice(i, i + batchSize);
      await prisma.place.deleteMany({
        where: {
          id: { in: batch }
        }
      });
      console.log(`   已删除 ${Math.min(i + batchSize, toDelete.length)}/${toDelete.length}`);
    }
    
    console.log('\n✅ 清理完成！');
  } else {
    console.log('✅ 没有发现需要清理的重复地点！');
  }

  await prisma.$disconnect();
}

function isDuplicate(place1: PlaceRecord, place2: PlaceRecord): boolean {
  const COORDINATE_THRESHOLD = 0.0005; // ~55 meters
  
  // 1. 检查坐标距离
  const latDiff = Math.abs(place1.latitude - place2.latitude);
  const lngDiff = Math.abs(place1.longitude - place2.longitude);
  const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
  
  if (distance > COORDINATE_THRESHOLD) {
    return false;
  }
  
  // 2. 计算名称相似度
  const name1 = place1.name.toLowerCase().trim();
  const name2 = place2.name.toLowerCase().trim();
  const nameSimilarity = calculateNameSimilarity(name1, name2);
  
  // 3. 检查分类
  const categorySame = place1.categorySlug === place2.categorySlug;
  
  // 4. 严格的重复判断标准
  // 必须满足以下条件之一：
  // - 距离很近 (< 10m) 且名称非常相似 (> 0.8)
  // - 距离较近 (< 30m) 且名称完全相同
  // - 距离很近 (< 20m) 且名称相似 (> 0.7) 且分类相同
  
  const veryClose = distance < 0.0001; // ~10m
  const close = distance < 0.0003; // ~30m
  const mediumClose = distance < 0.0002; // ~20m
  
  if (veryClose && nameSimilarity > 0.8) return true;
  if (close && nameSimilarity === 1.0) return true;
  if (mediumClose && nameSimilarity > 0.7 && categorySame) return true;
  
  return false;
}

function selectBestPlace(places: PlaceRecord[]): PlaceRecord {
  // 评分标准：
  // 1. 有 Google Place ID (+100)
  // 2. 有评分 (+50)
  // 3. 有营业时间 (+30)
  // 4. 有封面图 (+20)
  // 5. 来源优先级: apify_google_places > google_maps > wikidata > others
  // 6. 更新时间越新越好
  
  let best = places[0];
  let bestScore = calculatePlaceScore(best);
  
  for (let i = 1; i < places.length; i++) {
    const score = calculatePlaceScore(places[i]);
    if (score > bestScore) {
      best = places[i];
      bestScore = score;
    }
  }
  
  return best;
}

function calculatePlaceScore(place: PlaceRecord): number {
  let score = 0;
  
  // Google Place ID
  if (place.googlePlaceId) score += 100;
  
  // 评分
  if (place.rating) score += 50;
  if (place.ratingCount && place.ratingCount > 0) score += Math.min(place.ratingCount / 10, 50);
  
  // 营业时间
  if (place.openingHours) score += 30;
  
  // 封面图
  if (place.coverImage) score += 20;
  
  // 来源优先级
  const sourceScores: Record<string, number> = {
    'apify_google_places': 100,
    'google_maps': 80,
    'google_maps_link': 70,
    'wikidata': 50,
    'mock_data': 10,
    'ai_search': 5,
  };
  score += sourceScores[place.source] || 0;
  
  // 更新时间（越新越好）
  const daysSinceUpdate = (Date.now() - place.updatedAt.getTime()) / (1000 * 60 * 60 * 24);
  score += Math.max(0, 50 - daysSinceUpdate);
  
  return score;
}

function calculateNameSimilarity(name1: string, name2: string): number {
  if (name1 === name2) return 1.0;
  
  if (name1.includes(name2) || name2.includes(name1)) {
    const longer = Math.max(name1.length, name2.length);
    const shorter = Math.min(name1.length, name2.length);
    return shorter / longer;
  }
  
  const distance = levenshteinDistance(name1, name2);
  const maxLength = Math.max(name1.length, name2.length);
  return Math.max(0, 1 - (distance / maxLength));
}

function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[len1][len2];
}

cleanupDuplicates().catch(console.error);
