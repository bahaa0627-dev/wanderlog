import prisma from '../src/config/database';

// 复制后端的筛选逻辑进行测试
const tagTypeKeyMap: Record<string, string[]> = {
  'type': ['type'],
  'style': ['style'],
  'architect': ['architect'],
  'award': ['award'],
  'theme': ['theme'],
  'meal': ['meal', 'cuisine'],
  'cuisine': ['cuisine'],
  'shop': ['shop'],
  'other': ['other'],
};

const tagTypeKeywords: Record<string, string[]> = {
  'type': [
    'architecture', 'museum', 'gallery', 'church', 'temple', 'palace', 'castle',
    'tower', 'bridge', 'park', 'garden', 'cemetery', 'memorial', 'monument',
    'library', 'theater', 'theatre', 'stadium', 'station', 'airport', 'hotel',
    'restaurant', 'cafe', 'bar', 'shop', 'market', 'school', 'university',
    'hospital', 'office', 'residential', 'apartment', 'house', 'villa',
    'pavilion', 'chapel', 'cathedral', 'mosque', 'synagogue', 'shrine',
    'skyscraper', 'building', 'complex', 'center', 'centre', 'hall', 'arena'
  ],
  'style': [
    'brutalism', 'brutalist', 'modernism', 'modernist', 'postmodernism', 'postmodernist',
    'minimalism', 'minimalist', 'baroque', 'gothic', 'renaissance', 'romanesque',
    'art nouveau', 'art deco', 'expressionism', 'expressionist', 'futurism', 'futurist',
    'constructivism', 'constructivist', 'deconstructivism', 'deconstructivist',
    'neoclassicism', 'neoclassical', 'classical', 'contemporary',
    'industrial', 'organic', 'parametric', 'high-tech', 'metabolism', 'metabolist',
    'international style', 'bauhaus', 'prairie school', 'arts and crafts',
    'victorian', 'edwardian', 'georgian', 'colonial', 'federal',
    'beaux-arts', 'chicago school', 'streamline moderne', 'googie'
  ],
  'theme': [
    'feminism', 'feminist', 'sustainability', 'ecology', 'social',
    'musician', 'artist', 'scientist', 'writer', 'poet', 'composer',
    'painter', 'sculptor', 'philosopher', 'politician', 'actor', 'actress',
    'director', 'filmmaker', 'photographer', 'journalist', 'historian',
    'mathematician', 'physicist', 'chemist', 'biologist', 'inventor',
    'explorer', 'military', 'general', 'admiral', 'revolutionary',
    'religious', 'saint', 'martyr', 'nobel', 'laureate'
  ],
  'award': ['pritzker', 'prize', 'award'],
  'meal': ['brunch', 'breakfast', 'lunch', 'dinner', 'cafe', 'coffee', 'restaurant'],
  'shop': ['secondhand', 'thrift', 'boutique', 'vintage'],
  'domain': ['science', 'wissenschaft']
};

const guessTagTypeFromContent = (tagStr: string): string => {
  const lowerTag = tagStr.toLowerCase();
  
  // 检查前缀
  if (lowerTag.startsWith('architect:')) return 'architect';
  if (lowerTag.startsWith('style:')) return 'style';
  if (lowerTag.startsWith('theme:')) return 'theme';
  if (lowerTag.startsWith('domain:')) return 'domain';
  if (lowerTag.startsWith('meal:')) return 'meal';
  if (lowerTag.startsWith('shop:')) return 'shop';
  if (lowerTag.startsWith('type:')) return 'type';
  
  // 检查类型关键词（精确匹配）
  for (const keyword of tagTypeKeywords['type']) {
    if (lowerTag === keyword) return 'type';
  }
  
  // 检查奖项
  if (lowerTag === 'pritzker' || lowerTag.startsWith('pritzker_year:') || lowerTag.startsWith('pritzker ')) {
    return 'award';
  }
  
  // 检查风格关键词
  for (const keyword of tagTypeKeywords['style']) {
    if (lowerTag.includes(keyword)) return 'style';
  }
  
  // 检查主题关键词
  for (const keyword of tagTypeKeywords['theme']) {
    if (lowerTag.includes(keyword)) return 'theme';
  }
  
  // 检查餐饮关键词
  for (const keyword of tagTypeKeywords['meal']) {
    if (lowerTag.includes(keyword)) return 'meal';
  }
  
  // 检查领域关键词
  for (const keyword of tagTypeKeywords['domain']) {
    if (lowerTag.includes(keyword)) return 'domain';
  }
  
  // 检查商店关键词
  for (const keyword of tagTypeKeywords['shop']) {
    if (lowerTag.includes(keyword)) return 'shop';
  }
  
  return 'other';
};

async function testTagFilter() {
  console.log('=== 测试标签类型筛选逻辑 ===\n');
  
  // 获取所有地点
  const allPlaces = await prisma.place.findMany({
    take: 15000,
    select: {
      id: true,
      name: true,
      tags: true,
      aiTags: true,
      categoryEn: true,
      category: true
    }
  });
  
  console.log(`总共 ${allPlaces.length} 个地点\n`);
  
  // 测试各种标签类型筛选
  const testTypes = ['theme', 'award', 'architect', 'style', 'type'];
  
  for (const tagTypeFilter of testTypes) {
    const tagKeys = tagTypeKeyMap[tagTypeFilter] || [tagTypeFilter];
    let matchedPlaces: any[] = [];
    
    for (const place of allPlaces) {
      let hasTagOfType = false;
      
      // 首先检查 tags 对象中对应键是否有值
      if (place.tags && typeof place.tags === 'object') {
        const tagsObj = place.tags as any;
        for (const key of tagKeys) {
          const value = tagsObj[key];
          if (value) {
            if (Array.isArray(value) && value.length > 0) {
              hasTagOfType = true;
              break;
            } else if (typeof value === 'string' && value.trim() !== '') {
              hasTagOfType = true;
              break;
            }
          }
        }
        
        // 如果没找到，遍历所有标签并根据内容判断类型
        if (!hasTagOfType) {
          for (const key of Object.keys(tagsObj)) {
            const value = tagsObj[key];
            const tagsArray = Array.isArray(value) ? value : (typeof value === 'string' ? [value] : []);
            for (const tagItem of tagsArray) {
              if (typeof tagItem === 'string' && guessTagTypeFromContent(tagItem) === tagTypeFilter) {
                hasTagOfType = true;
                break;
              }
            }
            if (hasTagOfType) break;
          }
        }
      }
      
      // 也检查 aiTags
      if (!hasTagOfType && place.aiTags && Array.isArray(place.aiTags)) {
        for (const tag of place.aiTags as any[]) {
          const tagStr = typeof tag === 'object' && tag.en ? tag.en : (typeof tag === 'string' ? tag : '');
          if (tagStr && guessTagTypeFromContent(tagStr) === tagTypeFilter) {
            hasTagOfType = true;
            break;
          }
        }
      }
      
      if (hasTagOfType) {
        matchedPlaces.push(place);
      }
    }
    
    console.log(`\n${tagTypeFilter.toUpperCase()} 类型: 找到 ${matchedPlaces.length} 个地点`);
    console.log('前5个地点:');
    for (const place of matchedPlaces.slice(0, 5)) {
      const tagsObj = place.tags as any;
      const relevantTags = tagKeys.map(k => tagsObj?.[k]).filter(Boolean);
      console.log(`  - ${place.name}`);
      console.log(`    tags.${tagKeys.join('/')}: ${JSON.stringify(relevantTags)}`);
    }
  }
}

testTagFilter().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
