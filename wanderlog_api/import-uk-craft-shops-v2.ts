/**
 * 使用名称和坐标直接导入英国手工艺品店
 * 从Google Maps截图提取的信息
 */

import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000';

interface PlaceWithCoords {
  name: string;
  lat: number;
  lng: number;
  address: string;
  type: string;
}

// 从Google Maps截图中提取的地点信息（包含坐标）
const placesToImport: PlaceWithCoords[] = [
  {
    name: 'MacCulloch & Wallis Ltd',
    lat: 51.5153089,
    lng: -0.139982,
    address: '25-26 Poland St, London W1F 8QN, United Kingdom',
    type: 'Fabric store'
  },
  {
    name: 'Loop',
    lat: 51.5347663,
    lng: -0.1066256,
    address: '15 Camden Passage, London N1 8EA, United Kingdom',
    type: 'Yarn store'
  },
  {
    name: 'Lannan Bakery & Pantry',
    lat: 55.9597946,
    lng: -3.2093113,
    address: '29-35 Hamilton Pl, Edinburgh EH3 5BA, United Kingdom',
    type: 'Bakery'
  },
  {
    name: 'Hobbycraft Greenwich',
    lat: 51.4891559,
    lng: 0.0222923,
    address: 'Unit 8, Greenwich shopping Park, Bugsby\'s Wy, New Charlton, London SE7 7SR, United Kingdom',
    type: 'Craft store'
  }
];

/**
 * 使用坐标从Google Places API查找place_id
 */
async function findPlaceIdByCoords(place: PlaceWithCoords): Promise<string | null> {
  const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
  
  if (!GOOGLE_API_KEY) {
    console.log('⚠️  GOOGLE_MAPS_API_KEY not found, will try manual creation');
    return null;
  }

  try {
    // 使用 Nearby Search 通过坐标查找地点
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json`;
    const params = {
      location: `${place.lat},${place.lng}`,
      radius: 50, // 50米范围内
      keyword: place.name,
      key: GOOGLE_API_KEY
    };

    const httpProxy = process.env.http_proxy || process.env.HTTP_PROXY;
    const httpsProxy = process.env.https_proxy || process.env.HTTPS_PROXY;
    const proxy = httpsProxy || httpProxy;

    const axiosConfig: any = {};
    if (proxy) {
      const proxyUrl = new URL(proxy);
      axiosConfig.proxy = {
        host: proxyUrl.hostname,
        port: parseInt(proxyUrl.port),
        protocol: proxyUrl.protocol.replace(':', '')
      };
      console.log(`   🌐 使用代理: ${proxy}`);
    }

    const response = await axios.get(url, { params, ...axiosConfig });

    if (response.data.status === 'OK' && response.data.results.length > 0) {
      const firstResult = response.data.results[0];
      console.log(`   ✅ 找到 Place ID: ${firstResult.place_id}`);
      return firstResult.place_id;
    } else {
      console.log(`   ⚠️  未找到匹配的地点 (status: ${response.data.status})`);
      return null;
    }
  } catch (error: any) {
    console.error(`   ❌ Google API 错误:`, error.response?.data || error.message);
    return null;
  }
}

/**
 * 使用place_id导入地点
 */
async function importByPlaceId(placeId: string, placeName: string): Promise<boolean> {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/api/public-places/add-by-place-id`,
      { placeId }
    );

    if (response.data.success) {
      const place = response.data.data;
      console.log(`   ✅ 成功导入`);
      console.log(`      - 名称: ${place.name}`);
      console.log(`      - 地址: ${place.address}`);
      console.log(`      - 评分: ${place.rating} (${place.user_ratings_total} 评价)`);
      return true;
    } else {
      console.log(`   ❌ 导入失败: ${response.data.error}`);
      return false;
    }
  } catch (error: any) {
    const errorMsg = error.response?.data?.error || error.message;
    console.log(`   ❌ 导入错误: ${errorMsg}`);
    return false;
  }
}

/**
 * 手动创建地点（当无法从Google获取时）
 */
async function createManually(place: PlaceWithCoords): Promise<boolean> {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/api/public-places`,
      {
        name: place.name,
        address: place.address,
        latitude: place.lat,
        longitude: place.lng,
        category: place.type,
        source: 'manual_screenshot',
        metadata: {
          note: 'Imported from Google Maps screenshot',
          original_type: place.type
        }
      }
    );

    if (response.data.success) {
      console.log(`   ✅ 手动创建成功`);
      return true;
    } else {
      console.log(`   ❌ 创建失败: ${response.data.error}`);
      return false;
    }
  } catch (error: any) {
    console.log(`   ❌ 创建错误:`, error.response?.data?.error || error.message);
    return false;
  }
}

async function importPlace(place: PlaceWithCoords): Promise<boolean> {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📍 ${place.name}`);
  console.log(`   类型: ${place.type}`);
  console.log(`   地址: ${place.address}`);
  console.log(`   坐标: ${place.lat}, ${place.lng}`);

  // 步骤1: 尝试通过坐标查找 place_id
  console.log(`\n   🔍 步骤1: 查找 Google Place ID...`);
  const placeId = await findPlaceIdByCoords(place);

  if (placeId) {
    // 步骤2: 使用 place_id 导入
    console.log(`\n   📥 步骤2: 导入地点...`);
    const success = await importByPlaceId(placeId, place.name);
    return success;
  } else {
    // 备选方案: 手动创建
    console.log(`\n   ✍️  备选方案: 手动创建地点...`);
    const success = await createManually(place);
    return success;
  }
}

async function main() {
  console.log('🚀 开始批量导入英国手工艺品店（使用坐标）\n');
  console.log(`📊 总计: ${placesToImport.length} 个地点\n`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const results = {
    success: 0,
    failed: 0,
    total: placesToImport.length
  };

  for (let i = 0; i < placesToImport.length; i++) {
    const place = placesToImport[i];
    
    console.log(`\n[${i + 1}/${placesToImport.length}]`);
    
    const success = await importPlace(place);
    
    if (success) {
      results.success++;
    } else {
      results.failed++;
    }

    // 延迟避免请求过快
    if (i < placesToImport.length - 1) {
      console.log(`\n   ⏳ 等待 2 秒...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 导入完成！\n');
  console.log(`   ✅ 成功: ${results.success}`);
  console.log(`   ❌ 失败: ${results.failed}`);
  console.log(`   📈 成功率: ${((results.success / results.total) * 100).toFixed(1)}%`);
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch(console.error);
