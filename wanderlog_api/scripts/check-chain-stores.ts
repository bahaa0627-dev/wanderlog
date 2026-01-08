import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface Place {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  city?: string;
  country?: string;
  source?: string;
  google_place_id?: string;
}

// 标准化名称
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fa5]/g, '')
    .replace(/\s+/g, '');
}

// 计算两个坐标点之间的距离（米）
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

async function checkChainStores() {
  console.log('🔍 检查连锁店地点...\n');

  // 获取所有地点（分页）
  console.log('📥 正在获取所有地点数据...');
  let allPlaces: Place[] = [];
  let page = 0;
  const pageSize = 1000;
  
  while (true) {
    const { data: places, error } = await supabase
      .from('places')
      .select('id, name, latitude, longitude, city, country, source, google_place_id')
      .order('created_at', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('❌ 获取地点数据失败:', error);
      return;
    }

    if (!places || places.length === 0) {
      break;
    }

    allPlaces = allPlaces.concat(places);
    
    if (places.length < pageSize) {
      break;
    }
    
    page++;
  }

  console.log(`✅ 获取了 ${allPlaces.length} 个地点\n`);

  // 按名称+城市+国家分组
  const sameName = new Map<string, Place[]>();
  
  for (const place of allPlaces) {
    const key = `${normalizeName(place.name)}_${place.city || ''}_${place.country || ''}`;
    if (!sameName.has(key)) {
      sameName.set(key, []);
    }
    sameName.get(key)!.push(place);
  }

  // 找出连锁店（同名但距离较远）
  const chainStores: Array<{ name: string; locations: Place[]; distances: number[] }> = [];
  
  for (const [_key, group] of sameName.entries()) {
    if (group.length > 1) {
      // 检查是否有距离较远的
      let hasFarDistance = false;
      const distances: number[] = [];
      
      for (let i = 1; i < group.length; i++) {
        const distance = calculateDistance(
          group[0].latitude,
          group[0].longitude,
          group[i].latitude,
          group[i].longitude
        );
        distances.push(distance);
        
        if (distance > 50) {
          hasFarDistance = true;
        }
      }
      
      if (hasFarDistance) {
        chainStores.push({
          name: group[0].name,
          locations: group,
          distances
        });
      }
    }
  }

  // 按位置数量排序
  chainStores.sort((a, b) => b.locations.length - a.locations.length);

  console.log(`📊 找到 ${chainStores.length} 个连锁店\n`);
  console.log('=' .repeat(100));
  console.log('前 10 个连锁店详情：\n');

  for (let i = 0; i < Math.min(10, chainStores.length); i++) {
    const chain = chainStores[i];
    console.log(`\n${i + 1}. ${chain.name} (${chain.locations.length} 个位置)`);
    console.log('-'.repeat(100));
    
    for (let j = 0; j < chain.locations.length; j++) {
      const loc = chain.locations[j];
      const distance = j > 0 ? chain.distances[j - 1].toFixed(0) : 'N/A';
      
      console.log(`   位置 ${j + 1}:`);
      console.log(`      ID: ${loc.id}`);
      console.log(`      城市: ${loc.city || 'N/A'}, ${loc.country || 'N/A'}`);
      console.log(`      坐标: (${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)})`);
      console.log(`      来源: ${loc.source || 'N/A'}`);
      console.log(`      Google ID: ${loc.google_place_id || 'N/A'}`);
      if (j > 0) {
        console.log(`      距离位置1: ${distance} 米`);
      }
    }
  }

  console.log('\n' + '='.repeat(100));
  console.log('\n💡 提示：这些是被识别为连锁店的地点（同名但距离超过50米）');
  console.log('   如果你认为某些应该被删除，可以修改清理脚本的规则。\n');
}

checkChainStores().catch(console.error);
