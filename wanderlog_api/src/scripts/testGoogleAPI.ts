/**
 * Simple test script to verify Google Maps API is working
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

async function testAPI() {
  console.log('Testing Google Maps API...\n');
  console.log(`API Key: ${GOOGLE_API_KEY?.substring(0, 10)}...`);
  
  try {
    // Test 1: Text Search
    console.log('\n1️⃣ Testing Text Search API...');
    const textSearchResponse = await axios.get(
      'https://maps.googleapis.com/maps/api/place/textsearch/json',
      {
        params: {
          query: 'Design Museum Copenhagen',
          key: GOOGLE_API_KEY,
        },
      }
    );
    
    console.log(`   Status: ${textSearchResponse.data.status}`);
    if (textSearchResponse.data.status === 'OK') {
      console.log(`   ✅ Found ${textSearchResponse.data.results.length} results`);
      if (textSearchResponse.data.results.length > 0) {
        const place = textSearchResponse.data.results[0];
        console.log(`   First result: ${place.name}`);
        console.log(`   Place ID: ${place.place_id}`);
        console.log(`   Rating: ${place.rating || 'N/A'}`);
      }
    } else {
      console.log(`   ❌ Error: ${textSearchResponse.data.status}`);
      if (textSearchResponse.data.error_message) {
        console.log(`   Error message: ${textSearchResponse.data.error_message}`);
      }
    }

    // Test 2: Place Details
    if (textSearchResponse.data.results.length > 0) {
      const placeId = textSearchResponse.data.results[0].place_id;
      console.log('\n2️⃣ Testing Place Details API...');
      console.log(`   Getting details for Place ID: ${placeId}`);
      
      const detailsResponse = await axios.get(
        'https://maps.googleapis.com/maps/api/place/details/json',
        {
          params: {
            place_id: placeId,
            key: GOOGLE_API_KEY,
            fields: 'name,formatted_address,rating,user_ratings_total,types'
          },
        }
      );
      
      console.log(`   Status: ${detailsResponse.data.status}`);
      if (detailsResponse.data.status === 'OK') {
        const place = detailsResponse.data.result;
        console.log(`   ✅ Success!`);
        console.log(`   Name: ${place.name}`);
        console.log(`   Address: ${place.formatted_address}`);
        console.log(`   Rating: ${place.rating} (${place.user_ratings_total} reviews)`);
      } else {
        console.log(`   ❌ Error: ${detailsResponse.data.status}`);
      }
    }

    console.log('\n✅ API test completed successfully!');
    
  } catch (error: any) {
    console.error('\n❌ API test failed:');
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data:`, error.response.data);
    } else {
      console.error(`   Error: ${error.message}`);
    }
  }
}

testAPI();
