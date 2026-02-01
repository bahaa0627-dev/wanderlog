/**
 * Test OpenRouter Provider
 * 
 * Tests the OpenRouter API integration with web search capability.
 * Run with: npx ts-node scripts/test-openrouter.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';

interface OpenRouterResponsesResponse {
  id: string;
  object: string;
  created_at: number;
  status: string;
  model: string;
  output: Array<{
    id: string;
    type: string;
    status: string;
    content?: Array<{
      type: string;
      text?: string;
      annotations?: Array<any>;
    }>;
    role?: string;
  }>;
  usage?: {
    input_tokens: number;
    output_tokens?: number;
    total_tokens?: number;
  };
}

async function testGenerateText() {
  console.log('\n=== Test 1: Generate Text with Web Search ===\n');
  
  const url = `${OPENROUTER_BASE_URL}/responses`;
  
  const prompt = `Please recommend 3 popular tourist attractions in Paris, France. 
For each attraction, provide:
- Name
- Brief description (1-2 sentences)
- Why it's worth visiting

Use web search to get the latest information.`;

  const requestBody = {
    model: OPENROUTER_MODEL,
    input: prompt,
    tools: [{ 
      type: 'web_search_preview',
      search_context_size: 'medium',
    }],
    tool_choice: 'auto',
  };

  try {
    console.log(`Sending request to: ${url}`);
    console.log(`Model: ${OPENROUTER_MODEL}`);
    console.log('Request body:', JSON.stringify(requestBody, null, 2));
    
    const response = await axios.post<OpenRouterResponsesResponse>(url, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://wanderlog.app',
        'X-Title': 'WanderLog',
      },
      timeout: 90000,
    });

    console.log('\n--- Response ---');
    console.log('Status:', response.data.status);
    console.log('Model:', response.data.model);
    
    // Extract text content
    const output = response.data.output;
    let content = '';
    
    for (const item of output) {
      if (item.type === 'message' && item.content) {
        for (const contentItem of item.content) {
          if (contentItem.type === 'output_text' && contentItem.text) {
            content = contentItem.text;
            break;
          }
        }
      }
    }

    console.log('\n--- Generated Text ---');
    console.log(content);
    
    console.log('\n--- Usage ---');
    console.log(`Input tokens: ${response.data.usage?.input_tokens || 'N/A'}`);
    console.log(`Output tokens: ${response.data.usage?.output_tokens || 'N/A'}`);
    
    return true;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Request failed:', error.response?.status);
      console.error('Error data:', JSON.stringify(error.response?.data, null, 2));
    } else {
      console.error('Error:', error);
    }
    return false;
  }
}

async function testImageSearch() {
  console.log('\n=== Test 2: Image Search with Web Search ===\n');
  
  const url = `${OPENROUTER_BASE_URL}/responses`;
  
  const searchQuery = 'Eiffel Tower Paris';
  const prompt = `Search the web for a photo of "${searchQuery}" and find a direct image URL.

I need a direct link to an image file (URL must contain .jpg, .jpeg, .png, .webp, or .gif).
Prefer images from Wikipedia, Wikimedia Commons, or official tourism websites.
Do NOT use stock photo sites like Getty, Alamy, Shutterstock.

Return ONLY this JSON:
{"imageUrl": "https://example.com/image.jpg", "source": "website"}

If no direct image URL found, return:
{"imageUrl": null, "source": null}`;

  const requestBody = {
    model: OPENROUTER_MODEL,
    input: prompt,
    tools: [{ 
      type: 'web_search_preview',
      search_context_size: 'medium',
    }],
    tool_choice: 'auto',
  };

  try {
    console.log(`Searching image for: ${searchQuery}`);
    
    const response = await axios.post<OpenRouterResponsesResponse>(url, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://wanderlog.app',
        'X-Title': 'WanderLog',
      },
      timeout: 45000,
    });

    // Extract text content
    const output = response.data.output;
    let content = '';
    
    for (const item of output) {
      if (item.type === 'message' && item.content) {
        for (const contentItem of item.content) {
          if (contentItem.type === 'output_text' && contentItem.text) {
            content = contentItem.text;
            break;
          }
        }
      }
    }

    console.log('\n--- Raw Response ---');
    console.log(content);

    // Parse JSON
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonMatch = content.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      console.log('\n--- Parsed Result ---');
      console.log('Image URL:', result.imageUrl);
      console.log('Source:', result.source);
      
      if (result.imageUrl) {
        // Validate image URL
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
        const urlLower = result.imageUrl.toLowerCase();
        const isDirectImage = imageExtensions.some(ext => urlLower.includes(ext));
        console.log('Is direct image URL:', isDirectImage);
      }
    }
    
    return true;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Request failed:', error.response?.status);
      console.error('Error data:', JSON.stringify(error.response?.data, null, 2));
    } else {
      console.error('Error:', error);
    }
    return false;
  }
}

async function testChatCompletions() {
  console.log('\n=== Test 3: Chat Completions (No Web Search) ===\n');
  
  const url = `${OPENROUTER_BASE_URL}/chat/completions`;
  
  const requestBody = {
    model: OPENROUTER_MODEL,
    messages: [
      { role: 'system', content: 'You are a helpful travel assistant.' },
      { role: 'user', content: 'What are 3 must-visit places in Tokyo?' },
    ],
    max_tokens: 500,
    temperature: 0.3,
  };

  try {
    console.log(`Sending request to: ${url}`);
    
    const response = await axios.post(url, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://wanderlog.app',
        'X-Title': 'WanderLog',
      },
      timeout: 45000,
    });

    console.log('\n--- Response ---');
    const content = response.data.choices[0]?.message?.content;
    console.log(content);
    
    console.log('\n--- Usage ---');
    console.log(`Prompt tokens: ${response.data.usage?.prompt_tokens || 'N/A'}`);
    console.log(`Completion tokens: ${response.data.usage?.completion_tokens || 'N/A'}`);
    
    return true;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Request failed:', error.response?.status);
      console.error('Error data:', JSON.stringify(error.response?.data, null, 2));
    } else {
      console.error('Error:', error);
    }
    return false;
  }
}

async function main() {
  console.log('===========================================');
  console.log('   OpenRouter Provider Test');
  console.log('===========================================');
  
  if (!OPENROUTER_API_KEY) {
    console.error('Error: OPENROUTER_API_KEY not set in environment');
    process.exit(1);
  }

  console.log(`\nConfiguration:`);
  console.log(`- API Key: ${OPENROUTER_API_KEY.substring(0, 20)}...`);
  console.log(`- Base URL: ${OPENROUTER_BASE_URL}`);
  console.log(`- Model: ${OPENROUTER_MODEL}`);

  const results: { test: string; passed: boolean }[] = [];

  // Test 1: Generate Text with Web Search
  results.push({
    test: 'Generate Text with Web Search',
    passed: await testGenerateText(),
  });

  // Test 2: Image Search
  results.push({
    test: 'Image Search with Web Search',
    passed: await testImageSearch(),
  });

  // Test 3: Chat Completions (No Web Search)
  results.push({
    test: 'Chat Completions (No Web Search)',
    passed: await testChatCompletions(),
  });

  // Summary
  console.log('\n===========================================');
  console.log('   Test Results Summary');
  console.log('===========================================\n');
  
  for (const result of results) {
    const status = result.passed ? '✅ PASSED' : '❌ FAILED';
    console.log(`${status} - ${result.test}`);
  }

  const passedCount = results.filter(r => r.passed).length;
  console.log(`\nTotal: ${passedCount}/${results.length} tests passed`);
  
  process.exit(passedCount === results.length ? 0 : 1);
}

main().catch(console.error);
