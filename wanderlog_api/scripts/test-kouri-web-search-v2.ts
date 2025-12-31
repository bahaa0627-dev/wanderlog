/**
 * Test Kouri Web Search - 验证全网搜能力
 */
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function testWebSearch(query: string) {
  const apiKey = process.env.KOURI_API_KEY;
  const baseUrl = process.env.KOURI_BASE_URL?.replace('/v1', '');

  console.log(`\n🔍 查询: "${query}"`);
  console.log('─'.repeat(50));

  try {
    const response = await axios.post(
      `${baseUrl}/v1/responses`,
      {
        model: 'gpt-4o-mini',
        tools: [{ type: 'web_search' }],
        input: query,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        timeout: 60000,
      }
    );

    // 解析响应
    let searchQueries: string[] = [];
    let responseText = '';
    let citations: any[] = [];

    for (const output of response.data.output) {
      if (output.type === 'web_search_call' && output.action?.query) {
        searchQueries.push(output.action.query);
      }
      if (output.type === 'message' && output.content) {
        for (const content of output.content) {
          if (content.type === 'output_text') {
            responseText = content.text || '';
            citations = content.annotations || [];
          }
        }
      }
    }

    console.log('📡 搜索查询:', searchQueries.join(', ') || '无');
    console.log('📝 响应:', responseText.substring(0, 300) + (responseText.length > 300 ? '...' : ''));
    console.log('🔗 引用数量:', citations.length);
    
    if (citations.length > 0) {
      console.log('引用来源:');
      citations.slice(0, 3).forEach((c, i) => {
        console.log(`  ${i + 1}. ${c.title || 'N/A'} - ${c.url?.substring(0, 50) || 'N/A'}...`);
      });
    }

    return { success: true, searchQueries, responseText, citations };
  } catch (error: any) {
    console.error('❌ 失败:', error.response?.data?.error?.message || error.message);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('=== Kouri Web Search 全网搜能力测试 ===');
  console.log(`API: ${process.env.KOURI_BASE_URL}`);

  // 测试 1: 实时信息查询
  await testWebSearch('What is the current weather in Barcelona today?');

  // 测试 2: 最新新闻
  await testWebSearch('Latest news about Barcelona tourism December 2025');

  // 测试 3: 地点图片搜索
  await testWebSearch('Find the official Wikipedia image URL for Sagrada Familia Barcelona');

  // 测试 4: 餐厅推荐（需要实时数据）
  await testWebSearch('Best rated restaurants in Barcelona Gothic Quarter 2025');

  // 测试 5: 营业时间查询
  await testWebSearch('Park Güell Barcelona opening hours and ticket prices 2025');

  console.log('\n=== 测试完成 ===');
}

main();
