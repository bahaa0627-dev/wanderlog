/**
 * 测试 SearchV2 API 返回的数据是否包含详情字段
 */

import axios from 'axios';

async function main() {
  try {
    const response = await axios.post('http://localhost:3000/api/places/ai/search-v2', {
      query: 'Barcelona landmarks',
    });
    
    console.log('Response success:', response.data.success);
    console.log('Places count:', response.data.places?.length);
    
    if (response.data.places?.length > 0) {
      const place = response.data.places[0];
      console.log('\nFirst place details:');
      console.log('  name:', place.name);
      console.log('  id:', place.id);
      console.log('  address:', place.address);
      console.log('  phoneNumber:', place.phoneNumber);
      console.log('  website:', place.website);
      console.log('  openingHours:', place.openingHours);
      console.log('  coverImage:', place.coverImage ? 'YES' : 'NO');
      console.log('  rating:', place.rating);
    }
  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

main();
