/**
 * 将中文城市名改为英文，并处理重复地点（保留内容更全的）
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// 中文城市名 -> 英文城市名映射
const CITY_MAPPING: Record<string, string> = {
  '哥本哈根': 'Copenhagen',
  '东京': 'Tokyo',
  '巴黎': 'Paris',
  '伦敦': 'London',
  '柏林': 'Berlin',
  '维也纳': 'Vienna',
  '悉尼': 'Sydney',
  '墨尔本': 'Melbourne',
  '清迈': 'Chiang Mai',
  '札幌': 'Sapporo',
  '奥胡斯': 'Aarhus',
};

// 计算地点内容完整度分数
function calculateCompleteness(place: any): number {
  let score = 0;
  if (place.name) score += 1;
  if (place.address) score += 1;
  if (place.description) score += 2;
  if (place.aiSummary) score += 2;
  if (place.coverImage) score += 1;
  if (place.images && place.images.length > 0) score += place.images.length;
  if (place.rating) score += 1;
  if (place.ratingCount) score += 1;
  if (place.website) score += 1;
  if (place.phoneNumber) score += 1;
  if (place.openingHours) score += 1;
  if (place.tags && place.tags.length > 0) score += place.tags.length;
  if (place.wikidataId) score += 2;
  return score;
}

async function main() {
  console.log('修复中文城市名并处理重复...\n');

  // 1. 先查找所有中文城市名的记录
  const chineseCities = Object.keys(CITY_MAPPING);
  
  for (const chineseCity of chineseCities) {
    const englishCity = CITY_MAPPING[chineseCity];
    
    const { data: chinesePlaces, error } = await supabase
      .from('places')
      .select('*')
      .eq('city', chineseCity);

    if (error) {
      console.log(`查询 ${chineseCity} 失败:`, error.message);
      continue;
    }

    if (!chinesePlaces || chinesePlaces.length === 0) {
      continue;
    }

    console.log(`\n找到 ${chinesePlaces.length} 条 "${chineseCity}" 记录，将改为 "${englishCity}"`);

    // 2. 对每个中文地点，检查是否有英文重复
    for (const chinesePlace of chinesePlaces) {
      // 通过坐标查找可能的重复（100米范围内）
      const { data: nearbyPlaces } = await supabase
        .from('places')
        .select('*')
        .eq('city', englishCity)
        .gte('latitude', chinesePlace.latitude - 0.001)
        .lte('latitude', chinesePlace.latitude + 0.001)
        .gte('longitude', chinesePlace.longitude - 0.001)
        .lte('longitude', chinesePlace.longitude + 0.001);

      if (nearbyPlaces && nearbyPlaces.length > 0) {
        // 找到重复，比较完整度
        const chineseScore = calculateCompleteness(chinesePlace);
        
        for (const englishPlace of nearbyPlaces) {
          const englishScore = calculateCompleteness(englishPlace);
          
          console.log(`  重复: "${chinesePlace.name}" vs "${englishPlace.name}"`);
          console.log(`    中文分数: ${chineseScore}, 英文分数: ${englishScore}`);
          
          if (chineseScore > englishScore) {
            // 中文版本更完整，更新中文版本的城市名，删除英文版本
            console.log(`    → 保留中文版本，删除英文版本`);
            
            await supabase.from('places').delete().eq('id', englishPlace.id);
            await supabase.from('places').update({ city: englishCity }).eq('id', chinesePlace.id);
          } else {
            // 英文版本更完整或相同，删除中文版本
            console.log(`    → 保留英文版本，删除中文版本`);
            await supabase.from('places').delete().eq('id', chinesePlace.id);
          }
        }
      } else {
        // 没有重复，直接更新城市名
        console.log(`  更新: "${chinesePlace.name}" → city: ${englishCity}`);
        await supabase.from('places').update({ city: englishCity }).eq('id', chinesePlace.id);
      }
    }
  }

  console.log('\n✓ 完成');
}

main().catch(console.error);
