/**
 * 从 Google Maps URL 提取 Place ID 的工具
 * 支持多种 URL 格式
 */
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

interface PlaceInfo {
  name: string;
  url: string;
  placeId?: string;
  error?: string;
}

const places: PlaceInfo[] = [
  {
    name: 'MacCulloch & Wallis Ltd',
    url: 'https://www.google.com/maps/place/MacCulloch+%26+Wallis+Ltd/@51.5153089,-0.1399827'
  },
  {
    name: 'Loop',
    url: 'https://www.google.com/maps/place/Loop/@51.5347663,-0.1066256'
  },
  {
    name: 'Lannan Bakery & Pantry',
    url: 'https://www.google.com/maps/place/Lannan+Bakery+%26+Pantry/@55.9597946,-3.2093113'
  },
  {
    name: 'Hobbycraft Greenwich',
    url: 'https://www.google.com/maps/place/Hobbycraft+Greenwich/@51.4891559,0.0222923'
  }
];

async function extractPlaceIdFromUrl(url: string): Promise<string | null> {
  try {
    // 设置代理
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || 'http://127.0.0.1:7893';
    
    const response = await axios.get(url, {
      httpsAgent: new HttpsProxyAgent(proxyUrl),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      maxRedirects: 5,
      timeout: 10000
    });

    const html = response.data;
    
    // 尝试多种正则表达式来提取 Place ID
    const patterns = [
      /ChIJ[a-zA-Z0-9_-]+/g,  // 标准 Place ID 格式
      /"ludocid":"(\d+)"/,     // Ludocid 格式
      /data=.*?1s(ChIJ[a-zA-Z0-9_-]+)/,  // 从 data 参数中提取
    ];

    for (const pattern of patterns) {
      const matches = html.match(pattern);
      if (matches && matches.length > 0) {
        const placeId = matches[0].replace(/^"|"$|^1s/g, '');
        if (placeId.startsWith('ChIJ')) {
          return placeId;
        }
      }
    }

    return null;
  } catch (error: any) {
    console.error(`Error fetching URL: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('🔍 正在从 Google Maps URL 提取 Place ID...\n');

  for (const place of places) {
    console.log(`📍 ${place.name}`);
    console.log(`   URL: ${place.url}`);
    
    const placeId = await extractPlaceIdFromUrl(place.url);
    
    if (placeId) {
      place.placeId = placeId;
      console.log(`   ✅ Place ID: ${placeId}`);
    } else {
      place.error = 'Could not extract Place ID';
      console.log(`   ❌ 未能提取 Place ID`);
    }
    console.log('');
  }

  // 打印导入命令
  console.log('\n📋 导入命令：\n');
  
  const successfulPlaces = places.filter(p => p.placeId);
  
  if (successfulPlaces.length > 0) {
    console.log('# 单个导入：');
    successfulPlaces.forEach(place => {
      console.log(`\ncurl -X POST http://localhost:3000/api/public-places/add-by-place-id \\
  -H "Content-Type: application/json" \\
  -d '{"placeId": "${place.placeId}"}'`);
    });

    console.log('\n\n# 批量导入：');
    const placeIds = successfulPlaces.map(p => `"${p.placeId}"`).join(', ');
    console.log(`\ncurl -X POST http://localhost:3000/api/public-places/import-by-place-ids \\
  -H "Content-Type: application/json" \\
  -d '{
    "placeIds": [${placeIds}]
  }'`);
  }

  // 保存结果到文件
  const fs = require('fs');
  fs.writeFileSync(
    'extracted_place_ids.json',
    JSON.stringify(places, null, 2)
  );
  console.log('\n💾 结果已保存到 extracted_place_ids.json');
}

main().catch(console.error);
