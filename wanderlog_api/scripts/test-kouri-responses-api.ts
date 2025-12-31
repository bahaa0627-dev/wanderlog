/**
 * Test Kouri Responses API with web search
 * 
 * Tests:
 * 1. generateText with web_search_preview
 * 2. searchPlaceImage for image search
 */

import dotenv from 'dotenv';
dotenv.config();

import { KouriProvider } from '../src/services/aiProviders/KouriProvider';

async function testKouriResponsesAPI() {
  console.log('='.repeat(60));
  console.log('Testing Kouri Responses API');
  console.log('='.repeat(60));
  
  const provider = new KouriProvider();
  
  if (!provider.isAvailable()) {
    console.error('❌ Kouri provider is not available. Check your .env configuration.');
    process.exit(1);
  }
  
  console.log('✅ Kouri provider is available\n');
  
  // Test 1: generateText with web search
  console.log('Test 1: generateText with web search');
  console.log('-'.repeat(40));
  
  try {
    const prompt = 'Recommend 3 popular cafes in Paris. Return as JSON with name, summary, latitude, longitude.';
    console.log(`Prompt: ${prompt}\n`);
    
    const startTime = Date.now();
    const result = await provider.generateText(prompt);
    const duration = Date.now() - startTime;
    
    console.log(`Response (${duration}ms):`);
    console.log(result.substring(0, 500) + (result.length > 500 ? '...' : ''));
    console.log('\n✅ generateText succeeded\n');
  } catch (error) {
    console.error('❌ generateText failed:', error);
  }
  
  // Test 2: searchPlaceImage
  console.log('Test 2: searchPlaceImage');
  console.log('-'.repeat(40));
  
  try {
    const placeName = 'Café de Flore';
    const city = 'Paris';
    console.log(`Searching image for: ${placeName}, ${city}\n`);
    
    const startTime = Date.now();
    const imageUrl = await provider.searchPlaceImage(placeName, city);
    const duration = Date.now() - startTime;
    
    if (imageUrl) {
      console.log(`✅ Found image (${duration}ms): ${imageUrl}`);
    } else {
      console.log(`⚠️ No image found (${duration}ms)`);
    }
  } catch (error) {
    console.error('❌ searchPlaceImage failed:', error);
  }
  
  // Test 3: searchPlaceImage for a landmark
  console.log('\nTest 3: searchPlaceImage for landmark');
  console.log('-'.repeat(40));
  
  try {
    const placeName = 'Eiffel Tower';
    const city = 'Paris';
    console.log(`Searching image for: ${placeName}, ${city}\n`);
    
    const startTime = Date.now();
    const imageUrl = await provider.searchPlaceImage(placeName, city);
    const duration = Date.now() - startTime;
    
    if (imageUrl) {
      console.log(`✅ Found image (${duration}ms): ${imageUrl}`);
    } else {
      console.log(`⚠️ No image found (${duration}ms)`);
    }
  } catch (error) {
    console.error('❌ searchPlaceImage failed:', error);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('Tests completed');
  console.log('='.repeat(60));
}

testKouriResponsesAPI().catch(console.error);
