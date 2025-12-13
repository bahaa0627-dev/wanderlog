/**
 * 修复数据库中现有地点的城市和分类信息
 */

import { PrismaClient } from '@prisma/client';
import { Client } from '@googlemaps/google-maps-services-js';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '.env') });

const prisma = new PrismaClient();

// 配置代理
const proxyUrl = process.env.https_proxy || process.env.http_proxy;
const clientConfig: any = { timeout: 30000 };

if (proxyUrl) {
  console.log(`🌐 Using proxy: ${proxyUrl}`);
  clientConfig.axiosInstance = require('axios').create({
    httpsAgent: new HttpsProxyAgent(proxyUrl),
    proxy: false
  });
}

const client = new Client(clientConfig);
const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// 分类映射（中文 -> 英文）
const categoryTranslation: { [key: string]: string } = {
  '博物馆': 'museum',
  '艺术馆': 'art_gallery',
  '咖啡馆': 'cafe',
  '餐厅': 'restaurant',
  '酒吧': 'bar',
  '教堂': 'church',
  '公园': 'park',
  '购物中心': 'shopping_mall',
  '商店': 'store',
  '面包店': 'bakery',
  '图书馆': 'library',
  '景点': 'tourist_attraction',
  '住宿': 'lodging',
  '夜店': 'night_club',
  '其他': 'other'
};

/**
 * 从地址组件中提取城市
 */
function extractCity(addressComponents: any[]): string | null {
  for (const component of addressComponents) {
    if (component.types.includes('locality')) {
      return component.long_name;
    }
  }
  
  // 如果找不到 locality，尝试其他类型
  for (const component of addressComponents) {
    if (component.types.includes('administrative_area_level_2')) {
      return component.long_name;
    }
  }
  
  for (const component of addressComponents) {
    if (component.types.includes('administrative_area_level_1')) {
      return component.long_name;
    }
  }
  
  return null;
}

/**
 * 从分类映射中翻译分类
 */
function translateCategory(category: string): string {
  return categoryTranslation[category] || category;
}

async function fixPlaceData() {
  try {
    console.log('🔧 开始修复地点数据...\n');

    // 获取所有来自 google_maps_link 的地点
    const places = await prisma.publicPlace.findMany({
      where: {
        source: 'google_maps_link'
      }
    });

    console.log(`📊 找到 ${places.length} 个需要修复的地点\n`);

    let fixed = 0;
    let failed = 0;

    for (let i = 0; i < places.length; i++) {
      const place = places[i];
      console.log(`[${i + 1}/${places.length}] 处理: ${place.name}`);
      
      try {
        // 重新获取地点详情
        const response = await client.placeDetails({
          params: {
            place_id: place.placeId,
            key: GOOGLE_API_KEY!,
            language: 'en',
            fields: ['address_components', 'types']
          }
        });

        if (response.data.status === 'OK') {
          const details = response.data.result;
          
          // 提取城市
          const addressComponents = details.address_components || [];
          const city = extractCity(addressComponents);
          
          // 翻译分类
          const category = place.category ? translateCategory(place.category) : null;
          
          // 更新数据
          await prisma.publicPlace.update({
            where: { id: place.id },
            data: {
              city: city || place.city,
              category: category
            }
          });
          
          console.log(`  ✅ 已修复: city="${city || place.city}", category="${category}"`);
          fixed++;
        } else {
          console.log(`  ⚠️  API 返回状态: ${response.data.status}`);
          
          // 至少翻译分类
          if (place.category) {
            const category = translateCategory(place.category);
            await prisma.publicPlace.update({
              where: { id: place.id },
              data: { category }
            });
            console.log(`  ✅ 已翻译分类: "${category}"`);
            fixed++;
          }
        }
        
        // 延迟以避免 API 限制
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error: any) {
        console.log(`  ❌ 失败: ${error.message}`);
        
        // 至少尝试翻译分类
        try {
          if (place.category) {
            const category = translateCategory(place.category);
            await prisma.publicPlace.update({
              where: { id: place.id },
              data: { category }
            });
            console.log(`  ✅ 已翻译分类: "${category}"`);
            fixed++;
          }
        } catch (e) {
          failed++;
        }
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log('📊 修复完成！');
    console.log('='.repeat(70));
    console.log(`✅ 成功: ${fixed}`);
    console.log(`❌ 失败: ${failed}`);
    console.log('='.repeat(70));

  } catch (error: any) {
    console.error('❌ 错误:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

fixPlaceData();
