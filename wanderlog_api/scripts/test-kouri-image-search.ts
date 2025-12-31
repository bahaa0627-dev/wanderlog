/**
 * Test Kouri Web Search for Place Images
 */
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';

dotenv.config({ path: path.join(__dirname, '../.env') });

interface WebSearchResponse {
  id: string;
  object: string;
  status: string;
  output: Array<{
    type: string;
    content?: Array<{
      type: string;
      text?: string;
      annotations?: Array<{
        type: string;
        url?: string;
        title?: string;
      }>;
    }>;
  }>;
}

async function searchPlaceImage(placeName: string, city: string): Promise<string | null> {
  const apiKey = process.env.KOURI_API_KEY;
  const baseUrl = process.env.KOURI_BASE_URL?.replace('/v1', '');

  try {
    const response = await axios.post<WebSearchResponse>(
      `${baseUrl}/v1/responses`,
      {
        model: 'gpt-4o-mini',
        tools: [{ type: 'web_search' }],
        input: `Search Wikipedia for "${placeName}" in ${city} and give me the direct URL to the main image file on Wikimedia Commons. The URL should start with https://upload.wikimedia.org/wikipedia/commons/ and end with .jpg or .png. Return ONLY the URL, nothing else.`,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        timeout: 30000,
      }
    );

    // Debug: print full response
    console.log('  Response:', JSON.stringify(response.data.output, null, 2).substring(0, 800));

    // Extract text from response
    for (const output of response.data.output) {
      if (output.type === 'message' && output.content) {
        for (const content of output.content) {
          if (content.type === 'output_text' && content.text) {
            // Try to extract Wikipedia Commons URL
            const urlMatch = content.text.match(/https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/[^\s\)\]"'<>]+\.(jpg|jpeg|png|gif|svg)/i);
            if (urlMatch) {
              return urlMatch[0];
            }
          }
        }
      }
    }
    
    return null;
  } catch (error: any) {
    console.error(`Error searching for ${placeName}:`, error.message);
    return null;
  }
}

async function main() {
  console.log('=== Kouri Web Search 图片测试 ===\n');

  const places = [
    { name: 'Park Güell', city: 'Barcelona' },
    { name: 'La Rambla', city: 'Barcelona' },
    { name: 'Sagrada Familia', city: 'Barcelona' },
    { name: 'Eiffel Tower', city: 'Paris' },
    { name: 'Colosseum', city: 'Rome' },
  ];

  for (const place of places) {
    console.log(`🔍 搜索: ${place.name}, ${place.city}`);
    const imageUrl = await searchPlaceImage(place.name, place.city);
    
    if (imageUrl) {
      console.log(`✅ 找到图片: ${imageUrl.substring(0, 80)}...`);
      
      // Verify URL is valid
      try {
        const check = await axios.head(imageUrl, { timeout: 5000 });
        console.log(`   状态: ${check.status} (${check.headers['content-type']})`);
      } catch (e: any) {
        console.log(`   ⚠️ URL 验证失败: ${e.message}`);
      }
    } else {
      console.log(`❌ 未找到图片`);
    }
    console.log('');
  }
}

main();
