/**
 * AI Facet Dictionary Service
 * 
 * 管理 ai_facet_dictionary 字典表的服务
 * 提供 facet 定义查询、分类校验等功能
 * 
 * Requirements: 3.2, 3.4
 */

import prisma from '../config/database';

// ============================================
// 类型定义
// ============================================

export interface FacetDefinition {
  id: string;
  en: string;
  zh: string;
  priority: number;
  allowedCategories: string[] | null;
  deriveFrom: DeriveRule | null;
}

export interface DeriveRule {
  source: string;  // e.g. "tags:style:Brutalist*"
}

// 内存缓存
let facetCache: Map<string, FacetDefinition> | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ============================================
// AI Facet Dictionary Service
// ============================================

class AIFacetDictionaryService {
  /**
   * 获取单个 facet 定义
   * @param facetId - facet ID (e.g. 'Brutalist', 'Pritzker')
   * @returns FacetDefinition 或 null
   */
  async getFacetDefinition(facetId: string): Promise<FacetDefinition | null> {
    const cache = await this.ensureCache();
    return cache.get(facetId) || null;
  }

  /**
   * 检查 facet 是否允许用于指定分类
   * @param facetId - facet ID
   * @param categorySlug - 分类 slug (e.g. 'restaurant', 'cafe')
   * @returns boolean
   */
  async isFacetAllowedForCategory(facetId: string, categorySlug: string): Promise<boolean> {
    const facet = await this.getFacetDefinition(facetId);
    
    if (!facet) {
      return false;
    }
    
    // 如果 allowedCategories 为空或 null，表示适用于所有分类
    if (!facet.allowedCategories || facet.allowedCategories.length === 0) {
      return true;
    }
    
    // 检查分类是否在允许列表中
    return facet.allowedCategories.includes(categorySlug);
  }

  /**
   * 获取所有 facet 定义
   * @returns FacetDefinition 数组，按 priority 降序排列
   */
  async getAllFacets(): Promise<FacetDefinition[]> {
    const cache = await this.ensureCache();
    const facets = Array.from(cache.values());
    
    // 按 priority 降序排列
    return facets.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 获取指定分类允许的所有 facet
   * @param categorySlug - 分类 slug
   * @returns FacetDefinition 数组，按 priority 降序排列
   */
  async getFacetsForCategory(categorySlug: string): Promise<FacetDefinition[]> {
    const allFacets = await this.getAllFacets();
    
    return allFacets.filter(facet => {
      // 如果 allowedCategories 为空或 null，表示适用于所有分类
      if (!facet.allowedCategories || facet.allowedCategories.length === 0) {
        return true;
      }
      return facet.allowedCategories.includes(categorySlug);
    });
  }

  /**
   * 根据 derive_from 规则匹配 facet
   * @param tags - 结构化 tags 对象
   * @param categorySlug - 分类 slug
   * @returns 匹配的 FacetDefinition 数组
   */
  async matchFacetsByTags(
    tags: Record<string, string[]>,
    categorySlug: string
  ): Promise<FacetDefinition[]> {
    const allowedFacets = await this.getFacetsForCategory(categorySlug);
    const matchedFacets: FacetDefinition[] = [];

    for (const facet of allowedFacets) {
      if (!facet.deriveFrom?.source) continue;

      const isMatch = this.matchDeriveRule(facet.deriveFrom.source, tags);
      if (isMatch) {
        matchedFacets.push(facet);
      }
    }

    return matchedFacets;
  }

  /**
   * 清除缓存（用于测试或强制刷新）
   */
  clearCache(): void {
    facetCache = null;
    cacheTimestamp = 0;
  }

  // ============================================
  // 私有方法
  // ============================================

  /**
   * 确保缓存已加载且未过期
   */
  private async ensureCache(): Promise<Map<string, FacetDefinition>> {
    const now = Date.now();
    
    if (facetCache && (now - cacheTimestamp) < CACHE_TTL_MS) {
      return facetCache;
    }

    // 从数据库加载
    await this.loadCache();
    return facetCache!;
  }

  /**
   * 从数据库加载 facet 字典到缓存
   */
  private async loadCache(): Promise<void> {
    try {
      // 使用原生 SQL 查询，避免 Prisma 客户端未生成的问题
      const records = await prisma.$queryRaw<Array<{
        id: string;
        en: string;
        zh: string;
        priority: number;
        allowed_categories: string[] | null;
        derive_from: DeriveRule | null;
      }>>`
        SELECT id, en, zh, priority, allowed_categories, derive_from
        FROM ai_facet_dictionary
        ORDER BY priority DESC
      `;
      
      facetCache = new Map();
      
      for (const record of records) {
        const facet: FacetDefinition = {
          id: record.id,
          en: record.en,
          zh: record.zh,
          priority: record.priority,
          allowedCategories: record.allowed_categories && record.allowed_categories.length > 0 
            ? record.allowed_categories 
            : null,
          deriveFrom: record.derive_from,
        };
        facetCache.set(record.id, facet);
      }
      
      cacheTimestamp = Date.now();
    } catch (error) {
      console.error('Failed to load AI Facet Dictionary:', error);
      // 如果加载失败，使用空缓存
      facetCache = new Map();
      cacheTimestamp = Date.now();
    }
  }

  /**
   * 匹配 derive_from 规则
   * 支持的格式:
   * - "tags:pritzker" - 检查 tags.award 包含 'pritzker'
   * - "tags:style:Brutalist*" - 检查 tags.style 包含以 'Brutalist' 开头的值
   * - "tags:meal:brunch" - 检查 tags.meal 包含 'brunch'
   * - "tags:cuisine:Japanese" - 检查 tags.cuisine 包含 'Japanese'
   * - "tags:theme:feminism" - 检查 tags.theme 包含 'feminism'
   * - 多规则用分号分隔: "tags:style:Brutalist*;keywords:brutalist"
   */
  private matchDeriveRule(rule: string, tags: Record<string, string[]>): boolean {
    // 分号分隔的多规则，任一匹配即可
    const rules = rule.split(';');
    
    for (const singleRule of rules) {
      const trimmedRule = singleRule.trim();
      if (!trimmedRule) continue;
      
      // 只处理 tags: 开头的规则
      if (trimmedRule.startsWith('tags:')) {
        const tagRule = trimmedRule.substring(5); // 去掉 "tags:"
        
        // 特殊处理: "pritzker" -> 检查 award 数组
        if (tagRule === 'pritzker') {
          if (tags.award?.some(v => v.toLowerCase() === 'pritzker')) {
            return true;
          }
          continue;
        }
        
        // 解析 "key:value" 或 "key:value*" 格式
        const colonIndex = tagRule.indexOf(':');
        if (colonIndex === -1) continue;
        
        const tagKey = tagRule.substring(0, colonIndex);
        let tagValue = tagRule.substring(colonIndex + 1);
        
        // 检查是否是前缀匹配 (以 * 结尾)
        const isPrefixMatch = tagValue.endsWith('*');
        if (isPrefixMatch) {
          tagValue = tagValue.slice(0, -1);
        }
        
        // 获取对应的 tags 数组
        const tagArray = tags[tagKey];
        if (!tagArray || !Array.isArray(tagArray)) continue;
        
        // 匹配检查
        const isMatch = tagArray.some(v => {
          const normalizedV = v.toLowerCase();
          const normalizedTarget = tagValue.toLowerCase();
          
          if (isPrefixMatch) {
            return normalizedV.startsWith(normalizedTarget);
          }
          return normalizedV === normalizedTarget;
        });
        
        if (isMatch) {
          return true;
        }
      }
      
      // 其他规则类型 (keywords, signals 等) 暂不处理
      // 这些需要额外的上下文信息
    }
    
    return false;
  }
}

// 导出单例
export const aiFacetDictionaryService = new AIFacetDictionaryService();
export default aiFacetDictionaryService;
