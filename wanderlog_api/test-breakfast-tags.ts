import prisma from './src/config/database';

async function testBreakfastTags() {
  console.log('测试 breakfast 标签筛选逻辑...\n');
  
  const tagFilter = 'breakfast';
  const tagLower = tagFilter.toLowerCase();
  
  // 获取前10个地点
  const places = await prisma.place.findMany({
    take: 10,
    select: {
      id: true,
      name: true,
      aiTags: true,
      tags: true,
    }
  });
  
  console.log(`测试前 ${places.length} 个地点\n`);
  
  for (const place of places) {
    let matched = false;
    let reason = '';
    
    // 复制后端的筛选逻辑
    // 检查 aiTags
    if (place.aiTags && Array.isArray(place.aiTags)) {
      for (const tag of place.aiTags as any[]) {
        const tagEn = typeof tag === 'object' && tag.en ? tag.en : (typeof tag === 'string' ? tag : '');
        console.log(`  检查 aiTag: "${tagEn}" (type: ${typeof tagEn})`);
        if (tagEn.toLowerCase().includes(tagLower)) {
          matched = true;
          reason = `aiTags 匹配: "${tagEn}"`;
          break;
        }
      }
    }
    
    // 检查 tags 字段
    if (!matched && place.tags && typeof place.tags === 'object') {
      const tagsObj = place.tags as any;
      for (const key of Object.keys(tagsObj)) {
        const value = tagsObj[key];
        if (Array.isArray(value)) {
          for (const item of value) {
            if (typeof item === 'string' && item.toLowerCase().includes(tagLower)) {
              matched = true;
              reason = `tags.${key} 匹配: "${item}"`;
              break;
            }
          }
        } else if (typeof value === 'string' && value.toLowerCase().includes(tagLower)) {
          matched = true;
          reason = `tags.${key} 匹配: "${value}"`;
          break;
        }
        if (matched) break;
      }
    }
    
    console.log(`${place.name}: ${matched ? '✅ 匹配' : '❌ 不匹配'} ${reason}\n`);
  }
  
  await prisma.$disconnect();
}

testBreakfastTags().catch(console.error);
