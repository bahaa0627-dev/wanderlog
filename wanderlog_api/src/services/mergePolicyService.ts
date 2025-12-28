/**
 * Merge Policy Service
 * 多源数据合并策略服务
 * 
 * 基于 Categories.csv 的 merge_policy 列定义
 * 负责合并来自不同数据源（Google Maps、OSM、Wikidata、Foursquare）的数据
 */

// ============================================
// 类型定义
// ============================================

export interface MergePolicy {
  field: string;
  strategy: 'prefer_google' | 'prefer_wikidata' | 'prefer_osm' | 'union' | 'keep_richer' | 'fallback_chain';
  fallbackSources?: string[];
}

export interface SourceData {
  google?: Record<string, any>;
  osm?: Record<string, any>;
  wikidata?: Record<string, any>;
  fsq?: Record<string, any>;
  apify?: Record<string, any>;
}

export interface MergedPlaceData {
  openingHours?: string;
  address?: string;
  rating?: number;
  ratingCount?: number;
  photos?: string[];
  coverImage?: string;
  description?: string;
  tags: string[];
  images: string[];
  website?: string;
  phoneNumber?: string;
  customFields: {
    raw: Record<string, any>;
    osm_opening_hours_raw?: string;
  };
}

// ============================================
// 合并策略配置
// ============================================

/**
 * 字段合并策略配置
 * 基于 Categories.csv 的 merge_policy 列
 */
export const MERGE_POLICIES: MergePolicy[] = [
  // 优先使用 Google 数据的字段
  { field: 'openingHours', strategy: 'prefer_google' },
  { field: 'address', strategy: 'prefer_google' },
  { field: 'rating', strategy: 'prefer_google' },
  { field: 'ratingCount', strategy: 'prefer_google' },
  { field: 'photos', strategy: 'prefer_google' },
  { field: 'phoneNumber', strategy: 'prefer_google' },
  { field: 'website', strategy: 'prefer_google' },
  
  // 封面图片：Google > Wikidata P18 > OSM
  { field: 'coverImage', strategy: 'fallback_chain', fallbackSources: ['google', 'wikidata', 'osm'] },
  
  // 描述：保留最丰富的
  { field: 'description', strategy: 'keep_richer' },
  
  // 标签和图片：合并所有来源
  { field: 'tags', strategy: 'union' },
  { field: 'images', strategy: 'union' },
];

// ============================================
// 合并策略服务
// ============================================

class MergePolicyService {
  
  /**
   * 合并多源数据
   * @param sources 各数据源的数据
   * @returns 合并后的数据
   */
  mergeMultiSourceData(sources: SourceData): MergedPlaceData {
    const result: MergedPlaceData = {
      tags: [],
      images: [],
      customFields: {
        raw: {},
      },
    };
    
    // 保存所有原始数据
    for (const [source, data] of Object.entries(sources)) {
      if (data && Object.keys(data).length > 0) {
        result.customFields.raw[source] = data;
      }
    }
    
    // 应用每个字段的合并策略
    for (const policy of MERGE_POLICIES) {
      const value = this.mergeField(policy, sources);
      if (value !== null && value !== undefined) {
        (result as any)[policy.field] = value;
      }
    }
    
    // 特殊处理：OSM opening_hours 保存
    if (!result.openingHours && sources.osm?.opening_hours) {
      result.customFields.osm_opening_hours_raw = sources.osm.opening_hours;
    }
    
    return result;
  }
  
  /**
   * 根据策略合并单个字段
   */
  private mergeField(policy: MergePolicy, sources: SourceData): any {
    switch (policy.strategy) {
      case 'prefer_google':
        return this.preferGoogle(policy.field, sources);
        
      case 'prefer_wikidata':
        return this.preferWikidata(policy.field, sources);
        
      case 'prefer_osm':
        return this.preferOsm(policy.field, sources);
        
      case 'union':
        return this.unionArrays(policy.field, sources);
        
      case 'keep_richer':
        return this.keepRicher(policy.field, sources);
        
      case 'fallback_chain':
        return this.fallbackChain(policy.field, sources, policy.fallbackSources || []);
        
      default:
        return null;
    }
  }
  
  /**
   * 优先使用 Google 数据
   */
  private preferGoogle(field: string, sources: SourceData): any {
    return sources.google?.[field] 
      ?? sources.osm?.[field] 
      ?? sources.wikidata?.[field]
      ?? sources.fsq?.[field]
      ?? sources.apify?.[field];
  }
  
  /**
   * 优先使用 Wikidata 数据
   */
  private preferWikidata(field: string, sources: SourceData): any {
    return sources.wikidata?.[field] 
      ?? sources.google?.[field] 
      ?? sources.osm?.[field]
      ?? sources.fsq?.[field]
      ?? sources.apify?.[field];
  }
  
  /**
   * 优先使用 OSM 数据
   */
  private preferOsm(field: string, sources: SourceData): any {
    return sources.osm?.[field] 
      ?? sources.google?.[field] 
      ?? sources.wikidata?.[field]
      ?? sources.fsq?.[field]
      ?? sources.apify?.[field];
  }
  
  /**
   * 合并所有来源的数组
   */
  private unionArrays(field: string, sources: SourceData): any[] {
    const arrays: any[][] = [];
    
    for (const source of Object.values(sources)) {
      if (source?.[field] && Array.isArray(source[field])) {
        arrays.push(source[field]);
      }
    }
    
    // 去重合并
    const merged = arrays.flat();
    return [...new Set(merged)];
  }
  
  /**
   * 保留最丰富（最长）的值
   */
  private keepRicher(field: string, sources: SourceData): any {
    const values: string[] = [];
    
    for (const source of Object.values(sources)) {
      if (source?.[field] && typeof source[field] === 'string') {
        values.push(source[field]);
      }
    }
    
    if (values.length === 0) return null;
    
    // 返回最长的字符串
    return values.sort((a, b) => b.length - a.length)[0];
  }
  
  /**
   * 按指定顺序回退
   */
  private fallbackChain(field: string, sources: SourceData, fallbackSources: string[]): any {
    for (const sourceName of fallbackSources) {
      const source = (sources as any)[sourceName];
      if (source?.[field]) {
        return source[field];
      }
    }
    
    // 如果指定的源都没有，尝试其他源
    for (const source of Object.values(sources)) {
      if (source?.[field]) {
        return source[field];
      }
    }
    
    return null;
  }
  
  /**
   * 合并两个 Place 对象
   * 用于更新现有 Place 时
   */
  mergePlaces(existing: Record<string, any>, newData: Record<string, any>, newSource: string): Record<string, any> {
    const result = { ...existing };
    
    // 确定数据源
    const existingSource = existing.source || 'unknown';
    
    // 构建 SourceData
    const sources: SourceData = {
      [existingSource]: existing,
      [newSource]: newData,
    } as any;
    
    // 应用合并策略
    const merged = this.mergeMultiSourceData(sources);
    
    // 更新结果
    for (const [key, value] of Object.entries(merged)) {
      if (value !== null && value !== undefined) {
        result[key] = value;
      }
    }
    
    return result;
  }
}

// 导出单例
export const mergePolicyService = new MergePolicyService();
export default mergePolicyService;
