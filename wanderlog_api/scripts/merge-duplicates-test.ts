/**
 * 合并重复数据测试脚本
 * 
 * 策略：保留 Apify 记录（有 google_place_id），将 Wikidata 的独有数据合并进去
 * 
 * Wikidata 独有的字段：
 * - source_detail (Wikidata QID)
 * - tags (结构化标签)
 * - custom_fields (包含 architect, dataType, wikidataUrls 等)
 * - cover_image (如果 Apify 没有的话)
 * - images (合并)
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

interface MergeResult {
  wikidataId: string;
  apifyId: string;
  wikidataName: string;
  apifyName: string;
  mergedFields: string[];
  success: boolean;
  error?: string;
}

async function getPlaceDetails(id: string) {
  const { data, error } = await supabase
    .from('places')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) throw new Error(`Failed to get place ${id}: ${error.message}`);
  return data;
}

function mergeJsonObjects(apifyObj: any, wikidataObj: any): any {
  if (!wikidataObj) return apifyObj;
  if (!apifyObj) return wikidataObj;
  
  // 深度合并
  const result = { ...apifyObj };
  for (const key of Object.keys(wikidataObj)) {
    if (!(key in result) || result[key] === null || result[key] === undefined) {
      result[key] = wikidataObj[key];
    } else if (typeof result[key] === 'object' && typeof wikidataObj[key] === 'object') {
      if (Array.isArray(result[key]) && Array.isArray(wikidataObj[key])) {
        // 合并数组，去重
        result[key] = [...new Set([...result[key], ...wikidataObj[key]])];
      } else if (!Array.isArray(result[key]) && !Array.isArray(wikidataObj[key])) {
        // 递归合并对象
        result[key] = mergeJsonObjects(result[key], wikidataObj[key]);
      }
    }
  }
  return result;
}

function normalizeImageUrl(url: string): string {
  // 标准化 URL 用于比较
  // 1. 解码 URL 编码
  // 2. 将下划线和空格统一
  // 3. 转小写
  try {
    let normalized = decodeURIComponent(url);
    normalized = normalized.replace(/_/g, ' ').toLowerCase();
    return normalized;
  } catch {
    return url.toLowerCase();
  }
}

function mergeImages(apifyImages: any, wikidataImages: any, wikidataCoverImage?: string, apifyCoverImage?: string): any[] {
  const apifyArr = Array.isArray(apifyImages) ? apifyImages : [];
  const wikiArr = Array.isArray(wikidataImages) ? wikidataImages : [];
  
  // 用标准化 URL 去重
  const normalizedUrlSet = new Set<string>();
  const result: any[] = [];
  
  // 辅助函数：添加图片并去重
  const addImage = (img: any, source?: string) => {
    const url = typeof img === 'string' ? img : img?.url;
    if (!url) return false;
    
    const normalizedUrl = normalizeImageUrl(url);
    if (normalizedUrlSet.has(normalizedUrl)) {
      return false; // 已存在，跳过
    }
    
    normalizedUrlSet.add(normalizedUrl);
    if (typeof img === 'string') {
      result.push({ url: img, source: source || 'unknown' });
    } else {
      result.push({ ...img, source: img.source || source || 'unknown' });
    }
    return true;
  };
  
  // 先添加 Apify 的 cover_image（如果有）
  if (apifyCoverImage) {
    addImage(apifyCoverImage, 'apify');
  }
  
  // 添加 Apify 的 images
  for (const img of apifyArr) {
    addImage(img, 'apify');
  }
  
  // 添加 Wikidata 的 images
  for (const img of wikiArr) {
    addImage(img, 'wikidata');
  }
  
  // 添加 Wikidata 的 cover_image
  if (wikidataCoverImage) {
    addImage(wikidataCoverImage, 'wikidata');
  }
  
  return result;
}

async function mergeDuplicate(wikidataId: string, apifyId: string, dryRun: boolean = true): Promise<MergeResult> {
  const result: MergeResult = {
    wikidataId,
    apifyId,
    wikidataName: '',
    apifyName: '',
    mergedFields: [],
    success: false,
  };

  try {
    // 获取两条记录的完整数据
    const wikidata = await getPlaceDetails(wikidataId);
    const apify = await getPlaceDetails(apifyId);

    result.wikidataName = wikidata.name;
    result.apifyName = apify.name;

    console.log('\n' + '='.repeat(80));
    console.log(`📋 合并: "${wikidata.name}" (Wikidata) -> "${apify.name}" (Apify)`);
    console.log('='.repeat(80));

    // 准备更新数据
    const updateData: Record<string, any> = {};

    // 1. source_detail (Wikidata QID) - 添加到 Apify
    if (wikidata.source_detail && !apify.source_detail) {
      updateData.source_detail = wikidata.source_detail;
      result.mergedFields.push('source_detail');
      console.log(`   ✅ source_detail: ${wikidata.source_detail}`);
    }

    // 2. tags - 合并
    const mergedTags = mergeJsonObjects(apify.tags, wikidata.tags);
    if (JSON.stringify(mergedTags) !== JSON.stringify(apify.tags)) {
      updateData.tags = mergedTags;
      result.mergedFields.push('tags');
      console.log(`   ✅ tags 合并:`);
      console.log(`      Apify:    ${JSON.stringify(apify.tags)}`);
      console.log(`      Wikidata: ${JSON.stringify(wikidata.tags)}`);
      console.log(`      合并后:   ${JSON.stringify(mergedTags)}`);
    }

    // 3. custom_fields - 合并
    const mergedCustomFields = mergeJsonObjects(apify.custom_fields, wikidata.custom_fields);
    if (JSON.stringify(mergedCustomFields) !== JSON.stringify(apify.custom_fields)) {
      updateData.custom_fields = mergedCustomFields;
      result.mergedFields.push('custom_fields');
      console.log(`   ✅ custom_fields 合并:`);
      console.log(`      Wikidata 独有: ${JSON.stringify(wikidata.custom_fields)}`);
    }

    // 4. cover_image - 如果 Apify 没有，用 Wikidata 的
    if (!apify.cover_image && wikidata.cover_image) {
      updateData.cover_image = wikidata.cover_image;
      result.mergedFields.push('cover_image');
      console.log(`   ✅ cover_image: ${wikidata.cover_image}`);
    }

    // 5. images - 合并（包括 Wikidata 的 cover_image，智能去重）
    const mergedImages = mergeImages(apify.images, wikidata.images, wikidata.cover_image, apify.cover_image);
    const apifyImageCount = (apify.images?.length || 0) + (apify.cover_image ? 1 : 0);
    if (mergedImages.length > 0) {
      updateData.images = mergedImages;
      result.mergedFields.push('images');
      console.log(`   ✅ images: ${apify.images?.length || 0} -> ${mergedImages.length} (去重后)`);
      for (const img of mergedImages) {
        const url = typeof img === 'string' ? img : img?.url;
        console.log(`      - ${img.source || 'unknown'}: ${url?.substring(0, 60)}...`);
      }
    }

    // 6. ai_tags - 如果 Apify 没有，用 Wikidata 的
    if ((!apify.ai_tags || apify.ai_tags.length === 0) && wikidata.ai_tags && wikidata.ai_tags.length > 0) {
      updateData.ai_tags = wikidata.ai_tags;
      result.mergedFields.push('ai_tags');
      console.log(`   ✅ ai_tags: ${JSON.stringify(wikidata.ai_tags)}`);
    }

    // 7. category_slug/category_en/category_zh - 如果 Apify 没有
    if (!apify.category_slug && wikidata.category_slug) {
      updateData.category_slug = wikidata.category_slug;
      updateData.category_en = wikidata.category_en;
      updateData.category_zh = wikidata.category_zh;
      result.mergedFields.push('category');
      console.log(`   ✅ category: ${wikidata.category_slug}`);
    }

    // 8. description - 如果 Apify 没有
    if (!apify.description && wikidata.description) {
      updateData.description = wikidata.description;
      result.mergedFields.push('description');
      console.log(`   ✅ description: ${wikidata.description?.substring(0, 50)}...`);
    }

    if (Object.keys(updateData).length === 0) {
      console.log('   ⚠️ 没有需要合并的字段');
      result.success = true;
      return result;
    }

    console.log(`\n   📝 将更新 ${Object.keys(updateData).length} 个字段到 Apify 记录`);

    if (dryRun) {
      console.log('   🔍 [DRY RUN] 不执行实际更新');
      result.success = true;
      return result;
    }

    // 执行更新
    const { error: updateError } = await supabase
      .from('places')
      .update(updateData)
      .eq('id', apifyId);

    if (updateError) {
      throw new Error(`Update failed: ${updateError.message}`);
    }

    console.log('   ✅ Apify 记录已更新');

    // 删除 Wikidata 记录
    const { error: deleteError } = await supabase
      .from('places')
      .delete()
      .eq('id', wikidataId);

    if (deleteError) {
      throw new Error(`Delete failed: ${deleteError.message}`);
    }

    console.log('   ✅ Wikidata 记录已删除');
    result.success = true;

  } catch (error: any) {
    result.error = error.message;
    console.log(`   ❌ 错误: ${error.message}`);
  }

  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');

  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                     合并重复数据测试                                          ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  if (dryRun) {
    console.log('🔍 DRY RUN 模式 - 不会执行实际更新');
    console.log('   使用 --execute 参数执行实际合并\n');
  } else {
    console.log('⚠️  执行模式 - 将实际更新数据库!\n');
  }

  // 测试用例：Alabama State Capitol
  // 从截图中可以看到这是一个典型的重复案例
  
  // 先查找这两条记录
  const { data: wikidataRecord } = await supabase
    .from('places')
    .select('id, name')
    .eq('source', 'wikidata')
    .ilike('name', 'Alabama State Capitol')
    .single();

  const { data: apifyRecord } = await supabase
    .from('places')
    .select('id, name')
    .eq('source', 'apify_google_places')
    .ilike('name', 'Alabama State Capitol')
    .single();

  if (!wikidataRecord || !apifyRecord) {
    console.log('❌ 找不到测试记录 "Alabama State Capitol"');
    
    // 尝试另一个测试用例
    console.log('\n尝试查找其他测试用例...');
    
    const { data: testWiki } = await supabase
      .from('places')
      .select('id, name')
      .eq('source', 'wikidata')
      .ilike('name', 'Ainola')
      .single();

    const { data: testApify } = await supabase
      .from('places')
      .select('id, name')
      .eq('source', 'apify_google_places')
      .ilike('name', 'Ainola')
      .single();

    if (testWiki && testApify) {
      console.log(`\n找到测试用例: "${testWiki.name}"`);
      await mergeDuplicate(testWiki.id, testApify.id, dryRun);
    } else {
      console.log('❌ 找不到合适的测试用例');
    }
    return;
  }

  console.log(`\n找到测试用例: "${wikidataRecord.name}"`);
  await mergeDuplicate(wikidataRecord.id, apifyRecord.id, dryRun);

  // 再测试一个
  const { data: wiki2 } = await supabase
    .from('places')
    .select('id, name')
    .eq('source', 'wikidata')
    .ilike('name', '10 Downing Street')
    .single();

  const { data: apify2 } = await supabase
    .from('places')
    .select('id, name')
    .eq('source', 'apify_google_places')
    .ilike('name', '10 Downing St%')
    .limit(1)
    .single();

  if (wiki2 && apify2) {
    await mergeDuplicate(wiki2.id, apify2.id, dryRun);
  }
}

main().catch(console.error);
