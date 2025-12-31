/**
 * Test Kouri Responses API with Web Search
 */
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function testKouriWebSearch() {
  const apiKey = process.env.KOURI_API_KEY;
  const baseUrl = process.env.KOURI_BASE_URL?.replace('/v1', ''); // Remove /v1 for responses endpoint

  console.log('=== Kouri Responses API + Web Search 测试 ===\n');
  console.log(`Base URL: ${baseUrl}`);
  console.log(`API Key: ${apiKey?.substring(0, 20)}...`);
  console.log('');

  if (!apiKey || !baseUrl) {
    console.error('❌ 缺少配置');
    process.exit(1);
  }

  // Test 1: Basic Responses API
  console.log('📤 测试 1: 基础 Responses API...\n');
  
  try {
    const response = await axios.post(
      `${baseUrl}/v1/responses`,
      {
        model: 'gpt-4o-mini',
        input: 'What is the capital of France?',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        timeout: 30000,
      }
    );

    console.log('✅ Responses API 可用!');
    console.log('响应:', JSON.stringify(response.data, null, 2).substring(0, 500));
    console.log('');
  } catch (error: any) {
    console.error('❌ Responses API 失败:', error.response?.data || error.message);
  }

  // Test 2: Web Search Tool
  console.log('📤 测试 2: Web Search Tool...\n');
  
  try {
    const response = await axios.post(
      `${baseUrl}/v1/responses`,
      {
        model: 'gpt-4o-mini',
        tools: [
          {
            type: 'web_search',
          }
        ],
        input: 'Find a real image URL for Park Güell in Barcelona from Wikipedia',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        timeout: 60000,
      }
    );

    console.log('✅ Web Search 可用!');
    console.log('响应:', JSON.stringify(response.data, null, 2).substring(0, 1000));
  } catch (error: any) {
    console.error('❌ Web Search 失败:', error.response?.data || error.message);
    
    // Try alternative: gpt-4o-mini-search-preview model
    console.log('\n📤 测试 3: 尝试 search-preview 模型...\n');
    
    try {
      const response2 = await axios.post(
        `${baseUrl}/v1/chat/completions`,
        {
          model: 'gpt-4o-mini-search-preview',
          messages: [
            {
              role: 'user',
              content: 'Find a real Wikipedia image URL for Park Güell in Barcelona',
            }
          ],
          max_tokens: 500,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          timeout: 60000,
        }
      );

      console.log('✅ search-preview 模型可用!');
      console.log('响应:', JSON.stringify(response2.data, null, 2).substring(0, 1000));
    } catch (error2: any) {
      console.error('❌ search-preview 模型也失败:', error2.response?.data || error2.message);
    }
  }
}

testKouriWebSearch();
