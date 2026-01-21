/**
 * Translate non-English place names to English using Kouri API (OpenAI compatible)
 */

import axios from 'axios';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const KOURI_API_KEY = process.env.KOURI_API_KEY;
const KOURI_BASE_URL = process.env.KOURI_BASE_URL || 'https://api.kourichat.com/v1';
const BATCH_SIZE = 10;
const DELAY_MS = 2000;

// Check if text contains non-ASCII characters
function isNonEnglish(text: string): boolean {
  if (!text) return false;
  return /[^\x00-\x7F]/.test(text);
}

async function translateBatch(names: string[]): Promise<Record<string, string>> {
  const prompt = `Translate the following place names to English. These are real place names from various countries (Japan, Italy, France, Germany, Austria, etc.).

Rules:
1. Keep well-known English names (e.g., "新宿駅" → "Shinjuku Station")
2. For Japanese places, use romanization + English descriptor (e.g., "代々木公園" → "Yoyogi Park")
3. For European places with special characters, just romanize/anglicize (e.g., "Caffè Gilli" → "Caffe Gilli")
4. Keep brand names as-is if commonly used

Place names to translate:
${names.map((n, i) => `${i + 1}. ${n}`).join('\n')}

Return ONLY a valid JSON object (no markdown, no explanation):
{"original name": "English translation", ...}`;

  try {
    const response = await axios.post(
      `${KOURI_BASE_URL}/chat/completions`,
      {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 2000,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${KOURI_API_KEY}`,
        },
        timeout: 60000,
      }
    );

    const content = response.data.choices[0]?.message?.content?.trim();
    if (!content) {
      console.error('Empty response from API');
      return {};
    }

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    console.error('Failed to parse response:', content.substring(0, 200));
    return {};
  } catch (error: any) {
    console.error('Translation error:', error.response?.data?.error?.message || error.message);
    return {};
  }
}

async function main() {
  if (!KOURI_API_KEY) {
    console.error('❌ KOURI_API_KEY not configured');
    process.exit(1);
  }
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials');
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const dryRun = process.argv.includes('--dry-run');
  
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                   TRANSLATE PLACE NAMES                                       ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
  
  // Get all mocation places with non-English names
  const { data: places } = await supabase
    .from('places')
    .select('id, name, i18n, country')
    .eq('source', 'mocation');
  
  const toTranslate = places?.filter(p => isNonEnglish(p.name)) || [];
  
  console.log(`📊 Found ${toTranslate.length} places with non-English names`);
  console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'TRANSLATE & UPDATE'}`);
  console.log('');
  
  if (toTranslate.length === 0) {
    console.log('✅ All place names are already in English!');
    return;
  }
  
  // Process in batches
  let translated = 0;
  let failed = 0;
  
  for (let i = 0; i < toTranslate.length; i += BATCH_SIZE) {
    const batch = toTranslate.slice(i, i + BATCH_SIZE);
    const names = batch.map(p => p.name);
    
    console.log(`\n📦 Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(toTranslate.length / BATCH_SIZE)}`);
    console.log(`   Translating ${names.length} names...`);
    
    const translations = await translateBatch(names);
    
    for (const place of batch) {
      const englishName = translations[place.name];
      
      if (!englishName) {
        console.log(`   ⚠️  No translation for: ${place.name}`);
        failed++;
        continue;
      }
      
      console.log(`   ✅ ${place.name} → ${englishName}`);
      
      if (!dryRun) {
        // Update the place
        const newI18n = {
          ...place.i18n,
          name_original: place.name, // Keep original name
          name_en: englishName,
        };
        
        const { error } = await supabase
          .from('places')
          .update({ 
            name: englishName,
            i18n: newI18n,
          })
          .eq('id', place.id);
        
        if (error) {
          console.log(`   ❌ Update failed: ${error.message}`);
          failed++;
        } else {
          translated++;
        }
      } else {
        translated++;
      }
    }
    
    // Delay between batches
    if (i + BATCH_SIZE < toTranslate.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }
  
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                        TRANSLATION COMPLETE                                   ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
  
  console.log('📊 Summary:');
  console.log(`   Translated: ${translated}`);
  console.log(`   Failed: ${failed}`);
  console.log('');
}

main().catch(console.error);
