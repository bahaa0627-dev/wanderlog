import { Client } from '@googlemaps/google-maps-services-js';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

const client = new Client({ timeout: 30000 }); // 增加超时到30秒
const apiKey = process.env.GOOGLE_MAPS_API_KEY || '';

async function testAPI() {
  console.log('🔑 API Key:', apiKey.substring(0, 20) + '...');
  console.log('🧪 Testing Place ID: ChIJLU7jZClu5kcR4PcOOO6p3I0');
  console.log('⏱️  Timeout set to 30s');
  
  try {
    console.log('\n📡 Sending request to Google Maps API...');
    const startTime = Date.now();
    
    const response = await client.placeDetails({
      params: {
        place_id: 'ChIJLU7jZClu5kcR4PcOOO6p3I0',
        key: apiKey,
        fields: ['place_id', 'name', 'formatted_address', 'geometry']
      }
    });

    const duration = Date.now() - startTime;
    console.log(`⏱️  Request took ${duration}ms`);
    console.log('\n✅ Response Status:', response.data.status);
    console.log('📍 Place Name:', response.data.result?.name);
    console.log('📮 Address:', response.data.result?.formatted_address);
    console.log('🌐 Location:', response.data.result?.geometry?.location);
    
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    if (error.code) {
      console.error('Error code:', error.code);
    }
  }
}

testAPI();
