import axios from 'axios';
import googleMapsService from './googleMapsService';
import publicPlaceService from './publicPlaceService';

interface AIConfig {
  openaiApiKey?: string;
  geminiApiKey?: string;
  preferredModel: 'openai' | 'gemini';
}

interface PlaceIdentificationResult {
  placeName: string;
  city?: string;
  country?: string;
  confidence: number;
  description?: string;
  suggestedTags?: string[];
}

class AIService {
  private config: AIConfig;

  constructor() {
    this.config = {
      openaiApiKey: process.env.OPENAI_API_KEY,
      geminiApiKey: process.env.GEMINI_API_KEY,
      preferredModel: (process.env.PREFERRED_AI_MODEL as 'openai' | 'gemini') || 'openai',
    };

    if (!this.config.openaiApiKey && !this.config.geminiApiKey) {
      console.warn('Warning: Neither OPENAI_API_KEY nor GEMINI_API_KEY is set');
    }
  }

  /**
   * 从图片识别地点
   * @param imageUrl 图片URL或base64编码
   * @returns 识别出的地点信息
   */
  async identifyPlaceFromImage(imageUrl: string): Promise<PlaceIdentificationResult> {
    if (this.config.preferredModel === 'openai' && this.config.openaiApiKey) {
      return await this.identifyWithOpenAI(imageUrl);
    } else if (this.config.geminiApiKey) {
      return await this.identifyWithGemini(imageUrl);
    } else {
      throw new Error('No AI API key configured');
    }
  }

  /**
   * 使用 OpenAI GPT-4 Vision 识别图片中的地点
   */
  private async identifyWithOpenAI(imageUrl: string): Promise<PlaceIdentificationResult> {
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o', // 支持视觉的模型
          messages: [
            {
              role: 'system',
              content: `You are a travel expert specializing in identifying famous landmarks, restaurants, cafes, museums, and tourist attractions from images. 
              Please identify the place in the image and return ONLY a JSON object with this exact structure:
              {
                "placeName": "exact name of the place",
                "city": "city name",
                "country": "country name",
                "confidence": 0.0-1.0,
                "description": "brief description",
                "suggestedTags": ["tag1", "tag2", "tag3"]
              }
              If you cannot identify the place with reasonable confidence, set confidence to 0 and provide your best guess.`
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'What place is shown in this image? Please identify it and return the JSON response.'
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: imageUrl
                  }
                }
              ]
            }
          ],
          max_tokens: 500,
          temperature: 0.2,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.openaiApiKey}`,
          },
        }
      );

      const content = response.data.choices[0].message.content;
      
      // 解析 JSON 响应
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Failed to parse AI response');
      }

      const result = JSON.parse(jsonMatch[0]);
      return result;
    } catch (error: any) {
      console.error('OpenAI identification error:', error.response?.data || error.message);
      throw new Error('Failed to identify place with OpenAI');
    }
  }

  /**
   * 使用 Google Gemini 识别图片中的地点
   */
  private async identifyWithGemini(imageUrl: string): Promise<PlaceIdentificationResult> {
    try {
      // 如果是URL，先下载图片并转换为base64
      let imageBase64 = imageUrl;
      if (imageUrl.startsWith('http')) {
        const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        imageBase64 = Buffer.from(imageResponse.data).toString('base64');
      }

      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.config.geminiApiKey}`,
        {
          contents: [
            {
              parts: [
                {
                  text: `You are a travel expert. Identify the place shown in this image. Return ONLY a JSON object with: placeName, city, country, confidence (0-1), description, and suggestedTags array. If unsure, set confidence low.`
                },
                {
                  inline_data: {
                    mime_type: 'image/jpeg',
                    data: imageBase64
                  }
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 500,
          }
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const content = response.data.candidates[0].content.parts[0].text;
      
      // 解析 JSON 响应
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Failed to parse AI response');
      }

      const result = JSON.parse(jsonMatch[0]);
      return result;
    } catch (error: any) {
      console.error('Gemini identification error:', error.response?.data || error.message);
      throw new Error('Failed to identify place with Gemini');
    }
  }

  /**
   * 从图片识别地点并添加到公共地点库
   */
  async importFromImage(imageUrl: string): Promise<any> {
    try {
      // 步骤1：AI 识别图片中的地点
      console.log('Identifying place from image...');
      const identification = await this.identifyPlaceFromImage(imageUrl);

      if (identification.confidence < 0.5) {
        throw new Error('Place identification confidence too low');
      }

      // 步骤2：通过地点名称搜索 Google Maps 获取 place_id
      console.log(`Searching Google Maps for: ${identification.placeName}`);
      const placeId = await googleMapsService.textSearch(identification.placeName);

      if (!placeId || placeId.length === 0) {
        throw new Error('Place not found in Google Maps');
      }

      // 使用第一个搜索结果
      const firstPlace = placeId[0];
      const googlePlaceId = firstPlace.place_id;

      if (!googlePlaceId) {
        throw new Error('No place_id found');
      }

      // 步骤3：添加到公共地点库
      console.log(`Adding place to library with place_id: ${googlePlaceId}`);
      const place = await publicPlaceService.addByPlaceId(
        googlePlaceId,
        'ai_image',
        {
          imageUrl,
          aiModel: this.config.preferredModel,
          identification,
          timestamp: new Date(),
        }
      );

      // 步骤4：使用 AI 生成的标签更新地点
      if (identification.suggestedTags && identification.suggestedTags.length > 0) {
        await publicPlaceService.updatePlace(googlePlaceId, {
          aiTags: identification.suggestedTags,
          aiDescription: identification.description,
        } as any);
      }

      return place;
    } catch (error: any) {
      console.error('Error importing from image:', error);
      throw error;
    }
  }

  /**
   * 通过对话获取地点推荐
   * @param userMessage 用户的消息/需求
   * @param context 对话上下文（可选）
   */
  async getPlaceRecommendations(
    userMessage: string,
    context?: { city?: string; country?: string; preferences?: string[] }
  ): Promise<string[]> {
    try {
      const systemPrompt = `You are a travel advisor helping users discover places. 
      Based on the user's message, suggest specific place names that match their interests.
      Return ONLY a JSON array of place names, like: ["Place Name 1", "Place Name 2", "Place Name 3"]
      Maximum 5 suggestions. Be specific with actual place names, not generic categories.`;

      let userPrompt = userMessage;
      if (context?.city) {
        userPrompt += ` (in ${context.city}${context.country ? ', ' + context.country : ''})`;
      }

      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: 300,
          temperature: 0.7,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.openaiApiKey}`,
          },
        }
      );

      const content = response.data.choices[0].message.content;
      
      // 解析 JSON 数组
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('Failed to parse AI recommendations');
      }

      const placeNames = JSON.parse(jsonMatch[0]);
      return placeNames;
    } catch (error: any) {
      console.error('Error getting AI recommendations:', error.response?.data || error.message);
      throw new Error('Failed to get place recommendations');
    }
  }

  /**
   * 通过对话导入地点到公共地点库
   */
  async importFromChat(
    userMessage: string,
    context?: { city?: string; country?: string }
  ): Promise<{ success: number; failed: number; places: any[] }> {
    try {
      // 步骤1：获取 AI 推荐的地点名称
      console.log('Getting AI recommendations...');
      const placeNames = await this.getPlaceRecommendations(userMessage, context);

      const results: any[] = [];
      let success = 0;
      let failed = 0;

      // 步骤2：逐个搜索并添加
      for (const placeName of placeNames) {
        try {
          console.log(`Processing: ${placeName}`);
          
          // 搜索 Google Maps
          const searchResults = await googleMapsService.textSearch(
            placeName,
            context?.city ? { lat: 0, lng: 0 } : undefined // 可以改进为具体坐标
          );

          if (!searchResults || searchResults.length === 0) {
            console.warn(`Place not found: ${placeName}`);
            failed++;
            continue;
          }

          const googlePlaceId = searchResults[0].place_id;
          
          if (!googlePlaceId) {
            failed++;
            continue;
          }

          // 添加到公共地点库
          const place = await publicPlaceService.addByPlaceId(
            googlePlaceId,
            'ai_chat',
            {
              userMessage,
              aiRecommendation: placeName,
              context,
              timestamp: new Date(),
            }
          );

          results.push(place);
          success++;
        } catch (error) {
          console.error(`Error processing ${placeName}:`, error);
          failed++;
        }
      }

      return { success, failed, places: results };
    } catch (error: any) {
      console.error('Error importing from chat:', error);
      throw error;
    }
  }

  /**
   * 为地点生成 AI 标签和描述
   */
  async generatePlaceTags(placeData: {
    name: string;
    category?: string;
    description?: string;
    city?: string;
    country?: string;
  }): Promise<{ tags: string[]; summary: string; description: string }> {
    try {
      const prompt = `Given this place information:
      Name: ${placeData.name}
      Category: ${placeData.category || 'Unknown'}
      Location: ${placeData.city || ''}, ${placeData.country || ''}
      Description: ${placeData.description || 'None'}
      
      Generate:
      1. 5-8 style tags (like "romantic", "instagram-worthy", "family-friendly", "cozy", "historical", etc.)
      2. A one-sentence summary
      3. A brief 2-3 sentence description highlighting what makes this place special
      
      Return ONLY a JSON object: { "tags": [], "summary": "", "description": "" }`;

      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You are a travel content writer specializing in creating engaging place descriptions.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 300,
          temperature: 0.7,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.openaiApiKey}`,
          },
        }
      );

      const content = response.data.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        throw new Error('Failed to parse AI response');
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error: any) {
      console.error('Error generating tags:', error.response?.data || error.message);
      throw new Error('Failed to generate AI tags');
    }
  }
}

export default new AIService();
