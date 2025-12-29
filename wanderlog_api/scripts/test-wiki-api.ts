import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

async function test() {
  const proxyUrl = process.env.HTTPS_PROXY || 'http://127.0.0.1:7893';
  const agent = new HttpsProxyAgent(proxyUrl);
  
  console.log('Testing Wikipedia API with proxy:', proxyUrl);
  
  const places = ['Sagrada_Familia', 'Park_Güell', 'Eiffel_Tower'];
  
  for (const place of places) {
    try {
      const response = await axios.get(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${place}`,
        {
          timeout: 10000,
          httpsAgent: agent,
          headers: { 'User-Agent': 'WanderlogApp/1.0' }
        }
      );
      
      console.log(`✅ ${place}:`);
      console.log(`   Title: ${response.data.title}`);
      console.log(`   Image: ${response.data.thumbnail?.source ? 'YES' : 'NO'}`);
    } catch (e: any) {
      console.error(`❌ ${place}: ${e.message}`);
    }
  }
}

test();
