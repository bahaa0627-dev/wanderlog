import prisma from '../src/config/database';

async function checkTags() {
  // 获取几个有标签的地点
  const places = await prisma.place.findMany({
    take: 10,
    where: {
      OR: [
        { tags: { not: {} } },
        { aiTags: { not: [] } }
      ]
    },
    select: {
      id: true,
      name: true,
      tags: true,
      aiTags: true
    }
  });
  
  console.log('=== 标签数据结构示例 ===');
  for (const place of places) {
    console.log('\n地点:', place.name);
    console.log('tags 类型:', typeof place.tags);
    console.log('tags 内容:', JSON.stringify(place.tags, null, 2));
    console.log('aiTags 类型:', Array.isArray(place.aiTags) ? 'array' : typeof place.aiTags);
    console.log('aiTags 内容:', JSON.stringify(place.aiTags, null, 2));
  }
  
  // 查找有 theme 相关标签的地点
  console.log('\n\n=== 查找包含 theme 关键词的标签 ===');
  const allPlaces = await prisma.place.findMany({
    take: 5000,
    select: {
      id: true,
      name: true,
      tags: true,
      aiTags: true
    }
  });
  
  const themeKeywords = ['musician', 'artist', 'scientist', 'writer', 'poet', 'composer', 'painter', 'sculptor'];
  let foundCount = 0;
  
  for (const place of allPlaces) {
    let hasTheme = false;
    let matchedTag = '';
    
    // 检查 tags
    if (place.tags && typeof place.tags === 'object') {
      const tagsObj = place.tags as any;
      for (const key of Object.keys(tagsObj)) {
        const value = tagsObj[key];
        const tagsArray = Array.isArray(value) ? value : (typeof value === 'string' ? [value] : []);
        for (const tag of tagsArray) {
          if (typeof tag === 'string') {
            const lowerTag = tag.toLowerCase();
            for (const keyword of themeKeywords) {
              if (lowerTag.includes(keyword)) {
                hasTheme = true;
                matchedTag = `tags.${key}: ${tag}`;
                break;
              }
            }
          }
          if (hasTheme) break;
        }
        if (hasTheme) break;
      }
    }
    
    // 检查 aiTags
    if (!hasTheme && place.aiTags && Array.isArray(place.aiTags)) {
      for (const tag of place.aiTags as any[]) {
        const tagStr = typeof tag === 'object' && tag.en ? tag.en : (typeof tag === 'string' ? tag : '');
        if (tagStr) {
          const lowerTag = tagStr.toLowerCase();
          for (const keyword of themeKeywords) {
            if (lowerTag.includes(keyword)) {
              hasTheme = true;
              matchedTag = `aiTags: ${tagStr}`;
              break;
            }
          }
        }
        if (hasTheme) break;
      }
    }
    
    if (hasTheme && foundCount < 10) {
      console.log(`\n找到: ${place.name}`);
      console.log(`匹配: ${matchedTag}`);
      console.log('tags:', JSON.stringify(place.tags, null, 2));
      foundCount++;
    }
  }
  
  console.log(`\n总共找到 ${foundCount} 个包含 theme 关键词的地点（显示前10个）`);
}

checkTags().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
