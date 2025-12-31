/**
 * Debug Kouri Responses API response format
 */

import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';

async function debugKouriResponses() {
  const apiKey = process.env.KOURI_API_KEY;
  const baseUrl = process.env.KOURI_BASE_URL;
  
  console.log('API Key:', apiKey?.substring(0, 20) + '...');
  console.log('Base URL:', baseUrl);
  
  const url = `${baseUrl}/responses`;
  
  const requestBody = {
    model: 'gpt-4o-mini',
    input: 'What is the capital of France? Answer in one word.',
    tools: [{ type: 'web_search_preview' }],
    tool_choice: 'auto',
  };
  
  console.log('\nRequest URL:', url);
  console.log('Request body:', JSON.stringify(requestBody, null, 2));
  
  try {
    const response = await axios.post(url, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      timeout: 30000,
    });
    
    console.log('\n=== Response ===');
    console.log('Status:', response.status);
    console.log('Data:', JSON.stringify(response.data, null, 2));
  } catch (error: any) {
    console.error('\n=== Error ===');
    console.error('Status:', error.response?.status);
    console.error('Data:', JSON.stringify(error.response?.data, null, 2));
    console.error('Message:', error.message);
  }
}

debugKouriResponses().catch(console.error);
