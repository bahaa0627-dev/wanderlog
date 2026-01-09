/**
 * 批量合并重复数据
 * 
 * 策略：保留 Apify 记录（有 google_place_id），将 Wikidata 的独有数据合并进去
 * 
 * 处理范围：exact_match (227条) + similar_match (251条) = 478条
 * 已测试：2条 (Alabama State Capitol, 10 Downing St)
 * 剩余：476条
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// R2 配置
const R2_WORKER_URL = process.env.R2_WORKER_URL || 'https://wanderlog-images.blcubahaa0627.workers.dev';
const R2_AUTH_KEY = process.env.R2_AUTH_KEY;

interface DuplicateRecord {
  wikidataId: string;
  wikidataName: string;
  apifyId: string;
  apifyName: string;
  matchType: string;
  distance: number;
}

interface MergeResult {
  wikidataId: string;
  apifyId: string;
  wikidataName: string;
  apifyName: string;
  mergedFields: string[];
  success: boolean;
  error?: string;
}

// 读取 CSV 文件获取重复记录
function loadDuplicatesFromCSV(): DuplicateRecord[] {
  const csvPath = './duplicates-detailed.csv';
  if (!fs.existsSync(csvPath)) {
    throw new Error('duplicates-detailed.csv not found');
  }
  
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').slice(1); // 跳过标题行
  
  const duplicates: DuplicateRecord[] = [];
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    // CSV 解析（处理引号内的逗号）
    const parts: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        parts.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    parts.push(current.trim());
    
    // CSV 格式: match_type,wikidata_name,apify_name,wikidata_qid,wikidata_city,wikidata_country,apify_city,apify_country,apify_rating,distance_meters,wikidata_id,apify_id
    if (parts.length >= 12) {
      const matchType = parts[0].replace(/^"|"$/g, '');
      // 只处理 exact_name 和 similar_name
      if (matchType === 'exact_name' || matchType === 'similar_name') {
        duplicates.push({
          wikidataId: parts[10].replace(/^"|"$/g, ''),
          wikidataName: parts[1].replace(/^"|"$/g, ''),
          apifyId: parts[11].replace(/^"|"$/g, ''),
          apifyName: parts[2].replace(/^"|"$/g, ''),
          matchType: matchType,
          distance: parseFloat(parts[9]) || 0,
        });
      }
    }
  }
  
  return duplicates;
}

async function getPlaceDetails(id: string) {
  const { data, error } = await supabase
    .from('places')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) return null;
  return data;
}

function mergeJsonObjects(apifyObj: any, wikidataObj: any): any {
  if (!wikidataObj) return apifyObj;
  if (!apifyObj) return wikidataObj;
  
  const result = { ...apifyObj };
  for (const key of Object.keys(wikidataObj)) {
    if (!(key in result) || result[key] === null || result[key] === undefined) {
      result[key] = wikidataObj[key];
    } else if (typeof result[key] === 'object' && typeof wikidataObj[key] === 'object') {
      if (Array.isArray(result[key]) && Array.isArray(wikidataObj[key])) {
        const combined = [...result[key], ...wikidataObj[key]];
        result[key] = combined.filter((v: any, i: number, a: any[]) => a.indexOf(v) === i);
      } else if (!Array.isArray(result[key]) && !Array.isArray(wikidataObj[key])) {
        result[key] = mergeJsonObjects(result[key], wikidataObj[key]);
      }
    }
  }
  return result;
}

function normalizeImageUrl(url: string): string {
  try {
    let normalized = decodeURIComponent(url);
    normalized = normalized.replace(/_/g, ' ').toLowerCase();
    return normalized;
  } catch {
    return url.toLowerCase();
  }
}

async function uploadToR2(imageUrl: string, placeId: string): Promise<string | null> {
  try {
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'WanderlogBot/1.0 (https://wanderlog.app; contact@wanderlog.app)'
      },
    });
    
    if (!response.ok) return null;
    
    const buffer = await response.buffer();
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    
    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const r2Key = `places/images/${placeId}/${uuidv4()}.${ext}`;
    
    const uploadResponse = await fetch(`${R2_WORKER_URL}/${r2Key}`, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'X-Custom-Auth-Key': R2_AUTH_KEY || '',
      },
      body: buffer,
    });
    
    if (!uploadResponse.ok) return null;
    
    return `${R2_WORKER_URL}/${r2Key}`;
  } catch {
    return null;
  }
}

async function processWikidataImages(
  wikidataImages: any[],
  wikidataCoverImage: string | null,
  apifyImages: any[],
  apifyCoverImage: string | null,
  placeId: string
): Promise<string[]> {
  const normalizedUrlSet = new Set<string>();
  const result: string[] = [];
  
  // 添加 Apify 图片
  if (apifyCoverImage) {
    const normalized = normalizeImageUrl(apifyCoverImage);
    if (!normalizedUrlSet.has(normalized)) {
      normalizedUrlSet.add(normalized);
      // 如果是 R2 URL，直接使用；否则需要上传
      if (apifyCoverImage.includes('wanderlog-images') || apifyCoverImage.includes('workers.dev')) {
        result.push(apifyCoverImage);
      }
    }
  }
  
  for (const img of apifyImages || []) {
    const url = typeof img === 'string' ? img : img?.url;
    if (!url) continue;
    const normalized = normalizeImageUrl(url);
    if (!normalizedUrlSet.has(normalized)) {
      normalizedUrlSet.add(normalized);
      if (url.includes('wanderlog-images') || url.includes('workers.dev')) {
        result.push(url);
      }
    }
  }
  
  // 处理 Wikidata 图片（需要上传到 R2）
  const wikidataUrls: string[] = [];
  
  for (const img of wikidataImages || []) {
    const url = typeof img === 'string' ? img : img?.url;
    if (url) wikidataUrls.push(url);
  }
  
  if (wikidataCoverImage) {
    wikidataUrls.push(wikidataCoverImage);
  }
  
  for (const url of wikidataUrls) {
    const normalized = normalizeImageUrl(url);
    if (normalizedUrlSet.has(normalized)) continue;
    normalizedUrlSet.add(normalized);
    
    // 如果已经是 R2 URL，直接使用
    if (url.includes('wanderlog-images') || url.includes('workers.dev')) {
      result.push(url);
      continue;
    }
    
    // 需要上传到 R2
    if (url.includes('wikimedia') || url.includes('wikipedia')) {
      const r2Url = await uploadToR2(url, placeId);
      if (r2Url) {
        result.push(r2Url);
      }
    }
  }
  
  return result;
}

async function mergeDuplicate(dup: DuplicateRecord): Promise<MergeResult> {
  const result: MergeResult = {
    wikidataId: dup.wikidataId,
    apifyId: dup.apifyId,
    wikidataName: dup.wikidataName,
    apifyName: dup.apifyName,
    mergedFields: [],
    success: false,
  };

  try {
    const wikidata = await getPlaceDetails(dup.wikidataId);
    const apify = await getPlaceDetails(dup.apifyId);

    if (!wikidata) {
      result.error = 'Wikidata record not found (already merged?)';
      result.success = true; // 已经合并过了
      return result;
    }

    if (!apify) {
      result.error = 'Apify record not found';
      return result;
    }

    const updateData: Record<string, any> = {};

    // 1. source_detail (Wikidata QID)
    if (wikidata.source_detail && !apify.source_detail) {
      updateData.source_detail = wikidata.source_detail;
      result.mergedFields.push('source_detail');
    }

    // 2. tags - 合并
    const mergedTags = mergeJsonObjects(apify.tags, wikidata.tags);
    if (JSON.stringify(mergedTags) !== JSON.stringify(apify.tags)) {
      updateData.tags = mergedTags;
      result.mergedFields.push('tags');
    }

    // 3. custom_fields - 合并
    const mergedCustomFields = mergeJsonObjects(apify.custom_fields, wikidata.custom_fields);
    if (JSON.stringify(mergedCustomFields) !== JSON.stringify(apify.custom_fields)) {
      updateData.custom_fields = mergedCustomFields;
      result.mergedFields.push('custom_fields');
    }

    // 4. images - 合并并上传到 R2
    const mergedImages = await processWikidataImages(
      wikidata.images || [],
      wikidata.cover_image,
      apify.images || [],
      apify.cover_image,
      apify.id
    );
    
    if (mergedImages.length > 0) {
      updateData.images = mergedImages;
      // 如果 Apify 没有 cover_image，使用合并后的第一张
      if (!apify.cover_image || !apify.cover_image.includes('wanderlog-images')) {
        updateData.cover_image = mergedImages[0];
      }
      result.mergedFields.push('images');
    }

    // 5. ai_tags
    if ((!apify.ai_tags || apify.ai_tags.length === 0) && wikidata.ai_tags && wikidata.ai_tags.length > 0) {
      updateData.ai_tags = wikidata.ai_tags;
      result.mergedFields.push('ai_tags');
    }

    // 6. category
    if (!apify.category_slug && wikidata.category_slug) {
      updateData.category_slug = wikidata.category_slug;
      updateData.category_en = wikidata.category_en;
      updateData.category_zh = wikidata.category_zh;
      result.mergedFields.push('category');
    }

    // 7. description
    if (!apify.description && wikidata.description) {
      updateData.description = wikidata.description;
      result.mergedFields.push('description');
    }

    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabase
        .from('places')
        .update(updateData)
        .eq('id', dup.apifyId);

      if (updateError) {
        throw new Error(`Update failed: ${updateError.message}`);
      }
    }

    // 删除 Wikidata 记录
    const { error: deleteError } = await supabase
      .from('places')
      .delete()
      .eq('id', dup.wikidataId);

    if (deleteError) {
      throw new Error(`Delete failed: ${deleteError.message}`);
    }

    result.success = true;

  } catch (error: any) {
    result.error = error.message;
  }

  return result;
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                     批量合并重复数据                                          ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  // 加载重复记录
  const duplicates = loadDuplicatesFromCSV();
  console.log(`📊 从 CSV 加载了 ${duplicates.length} 条重复记录\n`);

  // 统计
  const exactMatch = duplicates.filter(d => d.matchType === 'exact_match');
  const similarMatch = duplicates.filter(d => d.matchType === 'similar_match');
  console.log(`   - exact_match: ${exactMatch.length} 条`);
  console.log(`   - similar_match: ${similarMatch.length} 条\n`);

  // 开始处理
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;
  const errors: MergeResult[] = [];

  const startTime = Date.now();

  for (let i = 0; i < duplicates.length; i++) {
    const dup = duplicates[i];
    const progress = `[${i + 1}/${duplicates.length}]`;
    
    process.stdout.write(`\r${progress} 处理: ${dup.wikidataName.substring(0, 40).padEnd(40)}...`);
    
    const result = await mergeDuplicate(dup);
    
    if (result.success) {
      if (result.error?.includes('already merged')) {
        skipCount++;
      } else {
        successCount++;
      }
    } else {
      errorCount++;
      errors.push(result);
    }

    // 每 50 条输出一次进度
    if ((i + 1) % 50 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = (i + 1) / elapsed;
      const remaining = (duplicates.length - i - 1) / rate;
      console.log(`\n   ⏱️ 已处理 ${i + 1} 条，成功 ${successCount}，跳过 ${skipCount}，失败 ${errorCount}`);
      console.log(`   📈 速度: ${rate.toFixed(1)} 条/秒，预计剩余: ${Math.ceil(remaining)} 秒`);
    }
  }

  console.log('\n\n' + '='.repeat(80));
  console.log('📊 合并完成！');
  console.log('='.repeat(80));
  console.log(`   ✅ 成功: ${successCount} 条`);
  console.log(`   ⏭️ 跳过: ${skipCount} 条 (已合并)`);
  console.log(`   ❌ 失败: ${errorCount} 条`);
  console.log(`   ⏱️ 总耗时: ${((Date.now() - startTime) / 1000).toFixed(1)} 秒`);

  if (errors.length > 0) {
    console.log('\n❌ 失败记录:');
    for (const err of errors.slice(0, 10)) {
      console.log(`   - ${err.wikidataName}: ${err.error}`);
    }
    if (errors.length > 10) {
      console.log(`   ... 还有 ${errors.length - 10} 条失败记录`);
    }
  }
}

main().catch(console.error);
