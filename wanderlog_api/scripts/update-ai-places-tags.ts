/**
 * 更新 google_maps_ai 来源的地点数据
 * 
 * 规则：
 * 1. ai_summary 内容移动到 description（如果 description 为空）
 * 2. ai_tags 限定在允许的标签列表内，最多 3 个，且不能与 category 重复
 * 3. 清空 ai_summary 字段
 * 
 * 使用方法：
 * npx tsx scripts/update-ai-places-tags.ts
 */

import prisma from '../src/config/database';

// 允许的 ai_tags 列表
const ALLOWED_TAGS = [
  'Museum', 'Attractions', 'Park', 'Cemetery', 'Hiking',
  'Cafe', 'Bakery', 'Vintage', 'Secondhand', 'Store',
  'Brunch', 'Restaurant', 'Knitting', 'Art', 'Architecture',
  'Historical', 'Landmark', 'Vegetarian', 'Buddhism', 'Church',
  'Temple', 'Shopping', 'Poet', 'Musician', 'Philosopher', 'Entertainment',
];

// 允许标签的小写版本（用于匹配）
const ALLOWED_TAGS_LOWER = ALLOWED_TAGS.map(t => t.toLowerCase());

/**
 * 过滤 ai_tags：只保留允许的标签，最多 3 个，且不能与 category 重复
 */
function filterAiTags(rawTags: any, category: string): string[] {
  if (!rawTags || !Array.isArray(rawTags)) return [];
  
  const categoryLower = category.toLowerCase();
  const result: string[] = [];
  
  for (const tag of rawTags) {
    if (result.length >= 3) break;
    
    const tagStr = String(tag);
    const tagLower = tagStr.toLowerCase();
    
    // 查找匹配的允许标签
    const matchIndex = ALLOWED_TAGS_LOWER.indexOf(tagLower);
    if (matchIndex >= 0) {
      const matchedTag = ALLOWED_TAGS[matchIndex];
      
      // 检查是否与 category 重复
      if (matchedTag.toLowerCase() !== categoryLower &&
          !categoryLower.includes(matchedTag.toLowerCase()) &&
          !matchedTag.toLowerCase().includes(categoryLower)) {
        result.push(matchedTag);
      }
    }
  }
  
  return result;
}

async function main() {
  console.log('🚀 Updating google_maps_ai places...');
  console.log(`📋 Allowed tags: ${ALLOWED_TAGS.join(', ')}`);
  console.log('');

  try {
    // 获取所有 google_maps_ai 来源的地点
    const places = await prisma.place.findMany({
      where: {
        source: 'google_maps_ai',
      },
      select: {
        id: true,
        name: true,
        category: true,
        description: true,
        aiSummary: true,
        aiTags: true,
      },
    });

    console.log(`📊 Found ${places.length} places to update`);
    console.log('');

    let updated = 0;
    let skipped = 0;

    for (const place of places) {
      const updates: any = {};
      let needsUpdate = false;

      // 1. 如果 description 为空但 aiSummary 有值，移动过去
      if (!place.description && place.aiSummary) {
        updates.description = place.aiSummary;
        needsUpdate = true;
        console.log(`  📝 ${place.name}: Moving ai_summary to description`);
      }

      // 2. 清空 ai_summary
      if (place.aiSummary) {
        updates.aiSummary = null;
        needsUpdate = true;
      }

      // 3. 过滤 ai_tags
      const category = place.category || 'Place';
      let currentTags: string[] = [];
      
      if (place.aiTags) {
        if (typeof place.aiTags === 'string') {
          try {
            currentTags = JSON.parse(place.aiTags);
          } catch {
            currentTags = [];
          }
        } else if (Array.isArray(place.aiTags)) {
          currentTags = place.aiTags as string[];
        }
      }

      const filteredTags = filterAiTags(currentTags, category);
      
      // 检查 tags 是否有变化
      const tagsChanged = JSON.stringify(currentTags.sort()) !== JSON.stringify(filteredTags.sort());
      
      if (tagsChanged) {
        updates.aiTags = filteredTags;
        needsUpdate = true;
        console.log(`  🏷️ ${place.name}: Tags ${JSON.stringify(currentTags)} → ${JSON.stringify(filteredTags)}`);
      }

      // 执行更新
      if (needsUpdate) {
        await prisma.place.update({
          where: { id: place.id },
          data: updates,
        });
        updated++;
      } else {
        skipped++;
      }
    }

    console.log('');
    console.log('='.repeat(50));
    console.log('📊 Summary:');
    console.log(`   Total places: ${places.length}`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Skipped (no changes): ${skipped}`);
    console.log('');
    console.log('✅ Update completed!');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
