/**
 * 规范化 ai_tags 和 tags 字段的大小写
 * 
 * 规则：
 * 1. 所有标签首字母大写（如 architecture -> Architecture）
 * 2. 合并大小写不同的重复标签（如 architecture + Architecture -> Architecture）
 * 
 * 使用方法：
 * npx tsx scripts/normalize-tags-case.ts --dry-run   # 预览模式
 * npx tsx scripts/normalize-tags-case.ts             # 执行更新
 */

import prisma from '../src/config/database';

interface AITagElement {
  kind?: string;
  id: string;
  en: string;
  zh: string;
  priority?: number;
}

/**
 * 首字母大写
 */
function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * 规范化 aiTags 数组
 */
function normalizeAiTags(aiTags: any): { normalized: AITagElement[]; changed: boolean } {
  if (!aiTags || !Array.isArray(aiTags)) {
    return { normalized: [], changed: false };
  }
  
  let changed = false;
  const normalized: AITagElement[] = [];
  const seenIds = new Set<string>();
  
  for (const tag of aiTags) {
    if (typeof tag === 'string') {
      // Legacy string format - convert to object
      const capitalizedTag = capitalize(tag);
      if (tag !== capitalizedTag) {
        changed = true;
      }
      const id = capitalizedTag.toLowerCase();
      if (!seenIds.has(id)) {
        seenIds.add(id);
        normalized.push({
          kind: 'facet',
          id: id,
          en: capitalizedTag,
          zh: capitalizedTag,
          priority: 50,
        });
      }
    } else if (typeof tag === 'object' && tag !== null) {
      // Object format
      const en = tag.en || tag.id || '';
      const zh = tag.zh || en;
      const id = (tag.id || en).toLowerCase();
      
      const capitalizedEn = capitalize(en);
      const capitalizedZh = zh; // 不改变中文
      
      if (en !== capitalizedEn) {
        changed = true;
      }
      
      if (!seenIds.has(id)) {
        seenIds.add(id);
        normalized.push({
          kind: tag.kind || 'facet',
          id: id,
          en: capitalizedEn,
          zh: capitalizedZh,
          priority: tag.priority || 50,
        });
      }
    }
  }
  
  return { normalized, changed };
}

/**
 * 规范化 tags 对象（结构化标签）
 */
function normalizeTags(tags: any): { normalized: Record<string, string[]>; changed: boolean } {
  if (!tags || typeof tags !== 'object' || Array.isArray(tags)) {
    return { normalized: {}, changed: false };
  }
  
  let changed = false;
  const normalized: Record<string, string[]> = {};
  
  for (const [key, values] of Object.entries(tags)) {
    if (!Array.isArray(values)) continue;
    
    const normalizedValues: string[] = [];
    const seenLower = new Set<string>();
    
    for (const value of values) {
      if (typeof value !== 'string') continue;
      
      const capitalizedValue = capitalize(value);
      const lowerValue = value.toLowerCase();
      
      if (value !== capitalizedValue) {
        changed = true;
      }
      
      // 去重（忽略大小写）
      if (!seenLower.has(lowerValue)) {
        seenLower.add(lowerValue);
        normalizedValues.push(capitalizedValue);
      }
    }
    
    if (normalizedValues.length > 0) {
      normalized[key] = normalizedValues;
    }
  }
  
  return { normalized, changed };
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  
  console.log('🚀 Normalizing tags case...');
  console.log(`📋 Mode: ${isDryRun ? 'DRY RUN (no changes)' : 'LIVE (will update database)'}`);
  console.log('');

  try {
    // 获取所有地点
    const places = await prisma.place.findMany({
      select: {
        id: true,
        name: true,
        aiTags: true,
        tags: true,
      },
    });

    console.log(`📊 Found ${places.length} places to check`);
    console.log('');

    let aiTagsUpdated = 0;
    let tagsUpdated = 0;
    let totalUpdated = 0;
    const aiTagChanges: { name: string; before: any; after: any }[] = [];
    const tagChanges: { name: string; before: any; after: any }[] = [];

    for (const place of places) {
      const updates: any = {};
      let needsUpdate = false;

      // 规范化 aiTags
      const { normalized: normalizedAiTags, changed: aiTagsChanged } = normalizeAiTags(place.aiTags);
      if (aiTagsChanged && normalizedAiTags.length > 0) {
        updates.aiTags = normalizedAiTags;
        needsUpdate = true;
        aiTagsUpdated++;
        if (aiTagChanges.length < 10) {
          aiTagChanges.push({
            name: place.name,
            before: place.aiTags,
            after: normalizedAiTags,
          });
        }
      }

      // 规范化 tags
      const { normalized: normalizedTags, changed: tagsChanged } = normalizeTags(place.tags);
      if (tagsChanged && Object.keys(normalizedTags).length > 0) {
        updates.tags = normalizedTags;
        needsUpdate = true;
        tagsUpdated++;
        if (tagChanges.length < 10) {
          tagChanges.push({
            name: place.name,
            before: place.tags,
            after: normalizedTags,
          });
        }
      }

      // 执行更新
      if (needsUpdate) {
        if (!isDryRun) {
          await prisma.place.update({
            where: { id: place.id },
            data: updates,
          });
        }
        totalUpdated++;
      }
    }

    // 打印变更示例
    if (aiTagChanges.length > 0) {
      console.log('\n📋 aiTags 变更示例 (前 10 条):');
      for (const change of aiTagChanges) {
        console.log(`  ${change.name}:`);
        console.log(`    Before: ${JSON.stringify(change.before)}`);
        console.log(`    After:  ${JSON.stringify(change.after)}`);
      }
    }

    if (tagChanges.length > 0) {
      console.log('\n📋 tags 变更示例 (前 10 条):');
      for (const change of tagChanges) {
        console.log(`  ${change.name}:`);
        console.log(`    Before: ${JSON.stringify(change.before)}`);
        console.log(`    After:  ${JSON.stringify(change.after)}`);
      }
    }

    console.log('');
    console.log('='.repeat(50));
    console.log('📊 Summary:');
    console.log(`   Total places checked: ${places.length}`);
    console.log(`   aiTags normalized: ${aiTagsUpdated}`);
    console.log(`   tags normalized: ${tagsUpdated}`);
    console.log(`   Total places updated: ${totalUpdated}`);
    console.log('');
    
    if (isDryRun) {
      console.log('⚠️  DRY RUN - No changes were made. Run without --dry-run to apply changes.');
    } else {
      console.log('✅ Normalization completed!');
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
