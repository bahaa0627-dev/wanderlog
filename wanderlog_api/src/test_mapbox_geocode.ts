/**
 * Test script for Mapbox Geocoding integration
 * 运行方式：npx ts-node src/test_mapbox_geocode.ts
 */

// 必须先加载 dotenv，再 import 其他模块
import dotenv from 'dotenv';
dotenv.config();

import { MapboxGeocodeService } from './services/mapboxGeocodeService';
import { ReverseGeocodeService } from './services/reverseGeocodeService';

// 创建新实例以确保使用最新的环境变量
const mapboxGeocodeService = new MapboxGeocodeService();
const geocodeService = new ReverseGeocodeService();

const testAddresses = [
  // 东京
  { address: '一蘭 渋谷店, 東京', expected: 'Tokyo' },
  { address: 'Ichiran Shibuya, Tokyo, Japan', expected: 'Tokyo' },
  // 巴黎
  { address: 'Tour Eiffel, Paris, France', expected: 'Paris' },
  { address: '埃菲尔铁塔, 巴黎', expected: 'Paris' },
  // 伦敦
  { address: 'Shoryu Ramen, 9 Regent Street, London', expected: 'London' },
  { address: '33 Cranbourn St, London WC2H 7AD', expected: 'London' },
  // 中文地址
  { address: '上海市静安区南京西路', expected: 'Shanghai' },
  { address: '北京市朝阳区三里屯', expected: 'Beijing' },
];

async function testMapboxDirect() {
  console.log('\n=== Testing Mapbox Geocoding Service Directly ===\n');
  
  if (!mapboxGeocodeService.isAvailable()) {
    console.log('❌ Mapbox service is not available (MAPBOX_ACCESS_TOKEN not configured)');
    return;
  }
  
  console.log('✅ Mapbox service is available\n');
  
  for (const test of testAddresses) {
    try {
      const result = await mapboxGeocodeService.forwardGeocode(test.address, {
        language: 'zh,en',
      });
      
      if (result) {
        console.log(`✅ "${test.address}"`);
        console.log(`   → Lat: ${result.lat}, Lon: ${result.lon}`);
        console.log(`   → Address: ${result.address}`);
        console.log(`   → City: ${result.city}, Country: ${result.country}`);
      } else {
        console.log(`❌ "${test.address}" - No result`);
      }
    } catch (error) {
      console.log(`❌ "${test.address}" - Error: ${error}`);
    }
    console.log('');
  }
}

async function testIntegrated() {
  console.log('\n=== Testing Integrated Geocode Service (Mapbox + Nominatim fallback) ===\n');
  
  for (const test of testAddresses.slice(0, 3)) { // 只测试前3个以节省时间
    try {
      const result = await geocodeService.forwardGeocode(test.address, {
        language: 'zh,en',
      });
      
      if (result) {
        console.log(`✅ "${test.address}"`);
        console.log(`   → Lat: ${result.lat}, Lon: ${result.lon}`);
      } else {
        console.log(`❌ "${test.address}" - No result`);
      }
    } catch (error) {
      console.log(`❌ "${test.address}" - Error: ${error}`);
    }
    console.log('');
  }
}

async function main() {
  console.log('Mapbox Geocoding Integration Test');
  console.log('==================================');
  console.log(`MAPBOX_ACCESS_TOKEN configured: ${!!process.env.MAPBOX_ACCESS_TOKEN}`);
  console.log(`Token value (first 20 chars): ${process.env.MAPBOX_ACCESS_TOKEN?.substring(0, 20)}...`);
  console.log(`Service isAvailable: ${mapboxGeocodeService.isAvailable()}`);
  
  await testMapboxDirect();
  await testIntegrated();
  
  console.log('\n=== Test Complete ===\n');
}

main().catch(console.error);
