/**
 * Test Kouri API Service using OpenAI SDK
 */
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

import OpenAI from 'openai';

async function testKouri() {
  const apiKey = process.env.KOURI_API_KEY;
  const baseUrl = process.env.KOURI_BASE_URL;
  const model = process.env.KOURI_CHAT_MODEL || 'gpt-4o-mini';

  console.log('=== Kouri API 测试 (OpenAI SDK) ===\n');
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Model: ${model}`);
  console.log(`API Key: ${apiKey?.substring(0, 20)}...`);
  console.log('');

  if (!apiKey || !baseUrl) {
    console.error('❌ 缺少 KOURI_API_KEY 或 KOURI_BASE_URL 配置');
    process.exit(1);
  }

  // 使用 OpenAI SDK，指向 Kouri 的 base URL
  const openai = new OpenAI({
    apiKey: apiKey,
    baseURL: baseUrl,
  });

  try {
    console.log('📤 发送测试请求 (OpenAI SDK)...\n');
    
    const response = await openai.chat.completions.create({
      model: model,
      messages: [
        {
          role: 'user',
          content: '你好，请用一句话介绍一下巴黎埃菲尔铁塔。',
        },
      ],
      max_tokens: 200,
      temperature: 0.7,
    });

    console.log('✅ 请求成功!\n');
    console.log('响应内容:');
    console.log(response.choices[0]?.message?.content);
    console.log('');
    console.log('Token 使用:');
    console.log(`  - Prompt: ${response.usage?.prompt_tokens}`);
    console.log(`  - Completion: ${response.usage?.completion_tokens}`);
    console.log(`  - Total: ${response.usage?.total_tokens}`);
    
  } catch (error: any) {
    console.error('❌ 请求失败!\n');
    console.error(`错误类型: ${error.constructor.name}`);
    console.error(`错误信息: ${error.message}`);
    if (error.status) {
      console.error(`状态码: ${error.status}`);
    }
    if (error.error) {
      console.error(`详细错误: ${JSON.stringify(error.error, null, 2)}`);
    }
    process.exit(1);
  }
}

testKouri();
