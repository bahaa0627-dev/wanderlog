/**
 * 标签类型分类器
 * 根据标签前缀或内容，将标签分类到不同的类型
 */

export interface TagTypeInfo {
  key: string;
  label: string;
  labelZh: string;
  prefixes: string[];
}

export const TAG_TYPES: Record<string, TagTypeInfo> = {
  architect: {
    key: 'architect',
    label: 'Architect',
    labelZh: '建筑师',
    prefixes: ['architect:'],
  },
  style: {
    key: 'style',
    label: 'Style',
    labelZh: '风格',
    prefixes: ['style:'],
  },
  theme: {
    key: 'theme',
    label: 'Theme',
    labelZh: '主题',
    prefixes: ['theme:'],
  },
  award: {
    key: 'award',
    label: 'Award',
    labelZh: '奖项',
    prefixes: ['pritzker', 'pritzker_year:'],
  },
  domain: {
    key: 'domain',
    label: 'Domain',
    labelZh: '领域',
    prefixes: ['domain:'],
  },
  meal: {
    key: 'meal',
    label: 'Meal',
    labelZh: '餐饮',
    prefixes: ['meal:'],
  },
  shop: {
    key: 'shop',
    label: 'Shop',
    labelZh: '商店',
    prefixes: ['shop:'],
  },
  type: {
    key: 'type',
    label: 'Type',
    labelZh: '类型',
    prefixes: ['type:'],
  },
  other: {
    key: 'other',
    label: 'Other',
    labelZh: '其他',
    prefixes: [],
  },
};

/**
 * 根据标签名称判断其类型
 */
export function classifyTag(tag: string): string {
  const lowerTag = tag.toLowerCase();
  
  for (const [typeKey, typeInfo] of Object.entries(TAG_TYPES)) {
    if (typeKey === 'other') continue; // 跳过 other，作为默认值
    
    for (const prefix of typeInfo.prefixes) {
      if (lowerTag.startsWith(prefix.toLowerCase())) {
        return typeKey;
      }
    }
  }
  
  return 'other';
}

/**
 * 从标签中提取显示名称（去掉前缀）
 */
export function getTagDisplayName(tag: string): string {
  const lowerTag = tag.toLowerCase();
  
  for (const typeInfo of Object.values(TAG_TYPES)) {
    for (const prefix of typeInfo.prefixes) {
      if (lowerTag.startsWith(prefix.toLowerCase())) {
        return tag.substring(prefix.length);
      }
    }
  }
  
  return tag;
}

/**
 * 按类型分组标签
 */
export interface TagWithType {
  name: string;
  displayName: string;
  type: string;
  count: number;
}

export interface TagsByType {
  [typeKey: string]: TagWithType[];
}

export function groupTagsByType(tags: { name: string; count: number }[]): TagsByType {
  const grouped: TagsByType = {};
  
  // 初始化所有类型
  for (const typeKey of Object.keys(TAG_TYPES)) {
    grouped[typeKey] = [];
  }
  
  // 分类标签
  for (const tag of tags) {
    const type = classifyTag(tag.name);
    const displayName = getTagDisplayName(tag.name);
    
    grouped[type].push({
      name: tag.name,
      displayName,
      type,
      count: tag.count,
    });
  }
  
  // 按显示名称排序
  for (const typeKey of Object.keys(grouped)) {
    grouped[typeKey].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
  
  return grouped;
}

/**
 * 获取标签类型的统计信息
 */
export interface TagTypeStats {
  type: string;
  label: string;
  labelZh: string;
  count: number;
  tags: TagWithType[];
}

export function getTagTypeStats(tags: { name: string; count: number }[]): TagTypeStats[] {
  const grouped = groupTagsByType(tags);
  
  return Object.entries(TAG_TYPES)
    .filter(([typeKey]) => typeKey !== 'other' || grouped[typeKey].length > 0) // 只有当 other 有标签时才显示
    .map(([typeKey, typeInfo]) => ({
      type: typeKey,
      label: typeInfo.label,
      labelZh: typeInfo.labelZh,
      count: grouped[typeKey].reduce((sum, tag) => sum + tag.count, 0),
      tags: grouped[typeKey],
    }))
    .filter(stat => stat.count > 0) // 只返回有标签的类型
    .sort((a, b) => b.count - a.count); // 按数量降序
}
