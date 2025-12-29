/**
 * 翻译非英文地点名为英文
 * 使用 OpenAI API 进行翻译
 */
import prisma from '../src/config/database';
import axios from 'axios';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// 检测可能是非英文的名称
function needsTranslation(name: string): boolean {
  const nonEnglishPatterns = [
    // 西班牙语/加泰罗尼亚语
    /[áéíóúüñ]/i,
    /\b(el|la|los|las|del|de|y|en|con|para|por|un|una)\b/i,
    /\b(calle|plaza|paseo|avenida|carrer|plaça|carretera)\b/i,
    /\b(restaurante|cafetería|tienda|mercado|museo|iglesia|parque|jardín|mirador|biblioteca)\b/i,
    /\b(sant|santa|san)\b/i,
    // 意大利语
    /\b(via|piazza|palazzo|chiesa|museo|giardino|ponte|fontana|villa)\b/i,
    /\b(il|lo|la|gli|le|di|da|in|su|per|tra|fra)\b/i,
    // 法语
    /[àâäçèéêëîïôùûü]/i,
    /\b(rue|place|avenue|boulevard|jardin|musée|église|pont|château)\b/i,
    /\b(le|la|les|du|de|des|un|une|et|ou|dans|sur|pour)\b/i,
    // 德语
    /[äöüß]/i,
    /\b(straße|platz|kirche|museum|garten|brücke|schloss|haus)\b/i,
    // 日语/韩语/中文（已经是非ASCII）
    /[\u3000-\u9fff\uac00-\ud7af]/,
  ];
  
  return nonEnglishPatterns.some(pattern => pattern.test(name));
}

// 批量翻译
async function translateBatch(names: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  
  if (names.length === 0) return result;
  
  const prompt = `Translate the following place names to English. Keep proper nouns (brand names, personal names) unchanged. Return ONLY a JSON object mapping original names to translations.

Place names:
${names.map((n, i) => `${i + 1}. ${n}`).join('\n')}

Return format: {"original name": "English translation", ...}`;

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    const content = response.data.choices[0]?.message?.content;
    if (content) {
      const translations = JSON.parse(content);
      for (const [original, translated] of Object.entries(translations)) {
        result.set(original, translated as string);
      }
    }
  } catch (e: any) {
    console.error('Translation error:', e.message);
  }
  
  return result;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const cityFilter = process.argv.find(a => a.startsWith('--city='))?.split('=')[1];
  
  console.log(`🌐 开始翻译地点名 (dry-run: ${dryRun})`);
  if (cityFilter) console.log(`   只处理城市: ${cityFilter}`);
  
  // 获取需要翻译的地点
  const where: any = {};
  if (cityFilter) where.city = cityFilter;
  
  const places = await prisma.place.findMany({
    where,
    select: { id: true, name: true, city: true }
  });
  
  // 筛选需要翻译的
  const toTranslate = places.filter(p => needsTranslation(p.name));
  console.log(`\n找到 ${toTranslate.length}/${places.length} 个地点需要翻译\n`);
  
  if (toTranslate.length === 0) {
    console.log('没有需要翻译的地点');
    return;
  }
  
  // 按批次处理（每批10个，避免 rate limit）
  const batchSize = 10;
  let translated = 0;
  let skipped = 0;
  
  for (let i = 0; i < toTranslate.length; i += batchSize) {
    const batch = toTranslate.slice(i, i + batchSize);
    const names = batch.map(p => p.name);
    
    console.log(`\n📦 处理批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(toTranslate.length / batchSize)}`);
    
    const translations = await translateBatch(names);
    
    for (const place of batch) {
      const newName = translations.get(place.name);
      
      if (newName && newName !== place.name) {
        console.log(`  ✅ ${place.name} -> ${newName}`);
        
        if (!dryRun) {
          await prisma.place.update({
            where: { id: place.id },
            data: { name: newName }
          });
        }
        translated++;
      } else {
        skipped++;
      }
    }
    
    // 避免 rate limit - 等待更长时间
    if (i + batchSize < toTranslate.length) {
      console.log('  ⏳ 等待 5 秒...');
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  
  console.log(`\n=== 完成 ===`);
  console.log(`翻译: ${translated}`);
  console.log(`跳过: ${skipped}`);
  
  await prisma.$disconnect();
}

main().catch(console.error);
