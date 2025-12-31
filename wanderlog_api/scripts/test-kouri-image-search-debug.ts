/**
 * Debug Kouri image search
 */

import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';

async function debugKouriImageSearch() {
  const apiKey = process.env.KOURI_API_KEY;
  const baseUrl = process.env.KOURI_BASE_URL;
  
  const url = `${baseUrl}/responses`;
  
  const prompt = `Search for an official or high-quality image of "Eiffel Tower Paris". 
Return ONLY a JSON object with this exact format:
{
  "imageUrl": "direct URL to the image file (must end with .jpg, .jpeg, .png, or .webp)",
  "source": "source website name"
}

Requirements:
- The URL must be a direct link to an image file, not a webpage
- Prefer official sources like Wikipedia, official websites, or travel sites
- If no suitable image found, return {"imageUrl": null, "source": null}`;

  // Test 1: with tool_choice: 'auto'
  console.log('Test 1: tool_choice: auto');
  console.log('-'.repeat(40));
  
  try {
    const response = await axios.post(url, {
      model: 'gpt-4o-mini',
      input: prompt,
      tools: [{ type: 'web_search_preview' }],
      tool_choice: 'auto',
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      timeout: 60000,
    });
    
    console.log('Status:', response.status);
    console.log('Output:', JSON.stringify(response.data.output, null, 2));
  } catch (error: any) {
    console.error('Error:', error.response?.status, error.response?.data || error.message);
  }
  
  // Test 2: with tool_choice: 'required'
  console.log('\nTest 2: tool_choice: required');
  console.log('-'.repeat(40));
  
  try {
    const response = await axios.post(url, {
      model: 'gpt-4o-mini',
      input: prompt,
      tools: [{ type: 'web_search_preview' }],
      tool_choice: 'required',
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      timeout: 60000,
    });
    
    console.log('Status:', response.status);
    console.log('Output:', JSON.stringify(response.data.output, null, 2));
  } catch (error: any) {
    console.error('Error:', error.response?.status, error.response?.data || error.message);
  }
}

debugKouriImageSearch().catch(console.error);
