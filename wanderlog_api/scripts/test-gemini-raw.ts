import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

const apiKey = process.env.GEMINI_API_KEY || 'AIzaSyCHg2fu3ukEbbkI5thNiqGyhIxgGPtBMYg';
const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const proxyUrl = process.env.HTTPS_PROXY || 'http://127.0.0.1:7893';

const SYSTEM_PROMPT = `You are a travel expert. Recommend 5 places.
Return ONLY valid JSON (no markdown, no extra text):
{
  "requestedCount": 5,
  "exceededLimit": false,
  "acknowledgment": "Here are my recommendations...",
  "places": [
    {
      "name": "Place Name",
      "summary": "Brief description (max 100 chars)",
      "latitude": 35.6762,
      "longitude": 139.6503,
      "city": "Tokyo",
      "country": "Japan",
      "coverImageUrl": "https://example.com/image.jpg",
      "tags": ["tag1", "tag2"],
      "recommendationPhrase": "local favorite"
    }
  ]
}`;

async function test() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const proxyAgent = new HttpsProxyAgent(proxyUrl);
  
  const requestBody = {
    contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\nUser query: Tokyo ramen shops` }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 3000,
      responseMimeType: 'application/json',
    },
  };

  console.log('Testing Gemini raw response...');
  const start = Date.now();
  
  try {
    const response = await axios.post(url, requestBody, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
      httpsAgent: proxyAgent,
    });
    
    const content = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log('\n=== RAW RESPONSE ===');
    console.log(content);
    console.log('\n=== PARSE TEST ===');
    
    try {
      const parsed = JSON.parse(content);
      console.log('Parse SUCCESS');
      console.log('Places:', parsed.places?.length);
    } catch (e: any) {
      console.log('Parse FAILED:', e.message);
      
      // Try to find and fix common issues
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        console.log('\n=== EXTRACTED JSON ===');
        console.log(jsonMatch[0].substring(0, 500) + '...');
      }
    }
    
    console.log(`\nTime: ${Date.now() - start}ms`);
  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

test();
