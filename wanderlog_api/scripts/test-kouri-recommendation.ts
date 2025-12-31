/**
 * Test Kouri API for AI Recommendations - Debug JSON parsing
 */
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

import OpenAI from 'openai';

async function testKouriRecommendation() {
  const apiKey = process.env.KOURI_API_KEY;
  const baseUrl = process.env.KOURI_BASE_URL;
  const model = process.env.KOURI_CHAT_MODEL || 'gpt-4o-mini';

  console.log('=== Kouri AI Recommendation 测试 ===\n');

  const openai = new OpenAI({
    apiKey: apiKey!,
    baseURL: baseUrl!,
  });

  const systemPrompt = `You are a travel expert with web search capability. Return recommendations as JSON only.

IMPORTANT: Provide ACCURATE coordinates and REAL image URLs.

Format:
{
  "acknowledgment": "brief response",
  "places": [
    {
      "name": "Place Name",
      "summary": "Brief description (max 60 chars)",
      "latitude": 48.8584,
      "longitude": 2.2945,
      "city": "Paris",
      "country": "France",
      "coverImageUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/...",
      "tags": ["tag1", "tag2"],
      "recommendationPhrase": "Why visit"
    }
  ]
}

Rules:
1. Use PRECISE coordinates (exact location)
2. coverImageUrl: Provide REAL Wikipedia Commons image URL
3. Return ONLY valid JSON, no markdown`;

  const userPrompt = 'Find 5 coffee shops in Barcelona';

  try {
    console.log('📤 发送请求...\n');
    
    const response = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 2000,
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content || '';
    
    console.log('✅ 请求成功!\n');
    console.log('=== 原始响应内容 ===');
    console.log(content);
    console.log('\n=== 响应长度 ===');
    console.log(`${content.length} 字符`);
    
    console.log('\n=== 尝试解析 JSON ===');
    
    // 尝试提取 JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('❌ 未找到 JSON 对象');
      return;
    }
    
    console.log(`JSON 匹配长度: ${jsonMatch[0].length} 字符`);
    
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log('✅ JSON 解析成功!');
      console.log(`地点数量: ${parsed.places?.length || 0}`);
      console.log('地点名称:', parsed.places?.map((p: any) => p.name).join(', '));
    } catch (parseError: any) {
      console.error('❌ JSON 解析失败:', parseError.message);
      console.log('\n=== 错误位置分析 ===');
      
      // 找到错误位置
      const posMatch = parseError.message.match(/position (\d+)/);
      if (posMatch) {
        const pos = parseInt(posMatch[1]);
        console.log(`错误位置: ${pos}`);
        console.log(`错误前后内容: ...${jsonMatch[0].substring(Math.max(0, pos - 50), pos)}<<<ERROR>>>${jsonMatch[0].substring(pos, pos + 50)}...`);
      }
    }
    
    console.log('\n=== Token 使用 ===');
    console.log(`Total: ${response.usage?.total_tokens}`);
    
  } catch (error: any) {
    console.error('❌ 请求失败:', error.message);
  }
}

testKouriRecommendation();
