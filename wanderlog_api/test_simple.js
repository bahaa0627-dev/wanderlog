#!/usr/bin/env node

const https = require('https');

const apiKey = 'AIzaSyAFrsDUcA9JqNDT52646JKwGPBu5BdvyW0';
const placeId = 'ChIJLU7jZClu5kcR4PcOOO6p3I0';

const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${apiKey}&fields=place_id,name,formatted_address,geometry`;

console.log('🧪 Testing Google Maps API directly...');
console.log('🔗 URL:', url.replace(apiKey, apiKey.substring(0, 20) + '...'));

https.get(url, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('\n✅ Response Status:', json.status);
      
      if (json.status === 'OK') {
        console.log('📍 Place Name:', json.result.name);
        console.log('📮 Address:', json.result.formatted_address);
        console.log('🌐 Location:', json.result.geometry.location);
      } else {
        console.log('❌ Error:', json.error_message || json.status);
      }
    } catch (error) {
      console.error('❌ Parse error:', error.message);
      console.log('Raw response:', data);
    }
  });
}).on('error', (error) => {
  console.error('❌ Request error:', error.message);
});
