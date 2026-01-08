import prisma from './src/config/database';

interface DuplicateGroup {
  places: Array<{
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    city: string | null;
    country: string | null;
    categorySlug: string | null;
    googlePlaceId: string | null;
    source: string;
  }>;
  reason: string;
}

async function checkDuplicates() {
  console.log('🔍 正在检查重复地点...\n');

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
    },
  });

  console.log(`📊 总地点数: ${allPlaces.length}\n`);

  const duplicateGroups: DuplicateGroup[] = [];
  const processed = new Set<string>();

  // 检查每个地点
  for (let i = 0; i < allPlaces.length; i++) {
    const place1 = allPlaces[i];
    
    if (processed.has(place1.id)) continue;

    const similarPlaces = [place1];
    processed.add(place1.id);

    // 与其他地点比较
    for (let j = i + 1; j < allPlaces.length; j++) {
      const place2 = allPlaces[j];
      
      if (processed.has(place2.id)) continue;

      // 计算相似度
      const similarity = calculateSimilarity(place1, place2);
      
      if (similarity.isDuplicate) {
        similarPlaces.push(place2);
        processed.add(place2.id);
      }
    }

    // 如果找到重复
    if (similarPlaces.length > 1) {
      duplicateGroups.push({
        places: similarPlaces,
        reason: `相似地点组 (${similarPlaces.length} 个)`,
      });
    }
  }

  // 输出结果
  console.log(`\n📊 去重检查结果：`);
  console.log(`   总地点数: ${allPlaces.length}`);
  console.log(`   重复组数: ${duplicateGroups.length}`);
  
  let totalDuplicates = 0;
  for (const group of duplicateGroups) {
    totalDuplicates += group.places.length - 1; // 减去保留的那个
  }
  console.log(`   重复地点数: ${totalDuplicates}`);
  console.log(`   去重率: ${((totalDuplicates / allPlaces.length) * 100).toFixed(2)}%\n`);

  // 显示前 20 个重复组
  if (duplicateGroups.length > 0) {
    console.log('🔍 重复地点详情（前 20 组）：\n');
    
    for (let i = 0; i < Math.min(20, duplicateGroups.length); i++) {
      const group = duplicateGroups[i];
      console.log(`组 ${i + 1}: ${group.places[0].name} (${group.places.length} 个重复)`);
      
      for (const place of group.places) {
        const distance = group.places[0] === place ? 0 : 
          calculateDistance(
            group.places[0].latitude, 
            group.places[0].longitude,
            place.latitude,
            place.longitude
          );
        
        console.log(`   - ${place.name}`);
        console.log(`     位置: (${place.latitude.toFixed(6)}, ${place.longitude.toFixed(6)})`);
        console.log(`     城市: ${place.city || 'N/A'}, ${place.country || 'N/A'}`);
        console.log(`     分类: ${place.categorySlug || 'N/A'}`);
        console.log(`     来源: ${place.source}`);
        console.log(`     Google ID: ${place.googlePlaceId || 'N/A'}`);
        if (distance > 0) {
          console.log(`     距离: ${distance.toFixed(0)}m`);
        }
      }
      console.log('');
    }
  }

  await prisma.$disconnect();
}

function calculateSimilarity(place1: any, place2: any): { isDuplicate: boolean; score: number } {
  const COORDINATE_THRESHOLD = 0.0005; // ~55 meters
  
  // 1. 检查坐标距离
  const latDiff = Math.abs(place1.latitude - place2.latitude);
  const lngDiff = Math.abs(place1.longitude - place2.longitude);
  const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
  
  if (distance > COORDINATE_THRESHOLD) {
    return { isDuplicate: false, score: 0 };
  }
  
  // 2. 计算名称相似度
  const name1 = place1.name.toLowerCase().trim();
  const name2 = place2.name.toLowerCase().trim();
  const nameSimilarity = calculateNameSimilarity(name1, name2);
  
  // 3. 检查分类
  const categorySame = place1.categorySlug === place2.categorySlug;
  
  // 4. 检查城市和国家
  const citySame = place1.city === place2.city;
  const countrySame = place1.country === place2.country;
  
  // 5. 综合判断
  const distanceScore = Math.max(0, 1 - (distance / COORDINATE_THRESHOLD));
  const categoryScore = categorySame ? 1 : 0;
  const locationScore = (citySame ? 0.5 : 0) + (countrySame ? 0.5 : 0);
  
  // 加权评分
  const totalScore = 
    distanceScore * 0.4 + 
    nameSimilarity * 0.3 + 
    categoryScore * 0.2 + 
    locationScore * 0.1;
  
  // 判断是否为重复
  const isDuplicate = 
    distance < COORDINATE_THRESHOLD && 
    (nameSimilarity > 0.6 || (categorySame && nameSimilarity > 0.3));
  
  return { isDuplicate, score: totalScore };
}

function calculateNameSimilarity(name1: string, name2: string): number {
  // 完全相同
  if (name1 === name2) return 1.0;
  
  // 包含关系
  if (name1.includes(name2) || name2.includes(name1)) {
    const longer = Math.max(name1.length, name2.length);
    const shorter = Math.min(name1.length, name2.length);
    return shorter / longer;
  }
  
  // Levenshtein 距离
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

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // 地球半径（米）
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

checkDuplicates().catch(console.error);
