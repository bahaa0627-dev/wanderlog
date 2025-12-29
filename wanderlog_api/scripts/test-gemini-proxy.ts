import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

const apiKey = process.env.GEMINI_API_KEY || 'AIzaSyCHg2fu3ukEbbkI5thNiqGyhIxgGPtBMYg';
const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const proxyUrl = process.env.HTTPS_PROXY || 'http://127.0.0.1:7893';

async function test() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const proxyAgent = new HttpsProxyAgent(proxyUrl);
  
  const requestBody = {
    contents: [{ parts: [{ text: 'Recommend 3 ramen shops in Tokyo. Return JSON: {"places": [{"name": "...", "city": "Tokyo"}]}' }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 500,
      responseMimeType: 'application/json',
    },
  };

  console.log('Testing Gemini with proxy...');
  console.log(`Proxy: ${proxyUrl}`);
  console.log(`Model: ${model}`);
  const start = Date.now();
  
  try {
    const response = await axios.post(url, requestBody, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
      httpsAgent: proxyAgent,
    });
    
    const content = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log('Response:', content);
    console.log(`Time: ${Date.now() - start}ms`);
  } catch (error: any) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

test();
