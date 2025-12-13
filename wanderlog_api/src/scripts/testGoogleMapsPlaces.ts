import dotenv from 'dotenv';
import googleMapsService from '../services/googleMapsService';

dotenv.config();

async function testGoogleMapsAPI() {
  console.log('🧪 测试 Google Maps API...\n');

  const testPlaceId = 'ChIJLU7jZClu5kcR4PcOOO6p3I0'; // 埃菲尔铁塔

  console.log(`📍 测试地点 ID: ${testPlaceId}`);
  console.log(`🔑 API Key: ${process.env.GOOGLE_MAPS_API_KEY?.substring(0, 20)}...`);
  console.log('');

  try {
    console.log('⏳ 正在获取地点详情...');
    const placeDetails = await googleMapsService.getPlaceDetails(testPlaceId);

    if (placeDetails) {
      console.log('✅ 成功获取地点详情！\n');
      console.log('📊 地点信息：');
      console.log('-----------------------------------');
      console.log(`名称: ${placeDetails.name}`);
      console.log(`Place ID: ${placeDetails.googlePlaceId}`);
      console.log(`城市: ${placeDetails.city}`);
      console.log(`国家: ${placeDetails.country}`);
      console.log(`地址: ${placeDetails.address}`);
      console.log(`坐标: ${placeDetails.latitude}, ${placeDetails.longitude}`);
      console.log(`分类: ${placeDetails.category}`);
      console.log(`评分: ${placeDetails.rating} (${placeDetails.ratingCount} 条评价)`);
      console.log(`价格等级: ${placeDetails.priceLevel}`);
      console.log(`网站: ${placeDetails.website}`);
      console.log(`电话: ${placeDetails.phoneNumber}`);
      console.log(`封面图: ${placeDetails.coverImage ? '有' : '无'}`);
      console.log(`其他图片: ${placeDetails.images ? JSON.parse(placeDetails.images).length + ' 张' : '无'}`);
      console.log('-----------------------------------\n');
      console.log('🎉 测试成功！Google Maps API 工作正常。');
    } else {
      console.log('❌ 无法获取地点详情');
      console.log('可能的原因：');
      console.log('1. API Key 无效或过期');
      console.log('2. API Key 没有启用 Places API');
      console.log('3. API 配额已用尽');
      console.log('4. Place ID 无效');
    }
  } catch (error: any) {
    console.error('❌ 错误：', error.message);
    if (error.response) {
      console.error('API 响应：', error.response.data);
    }
  }
}

testGoogleMapsAPI();
