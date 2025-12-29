/**
 * Category & Tags Normalization Service
 * 分类和标签归一化服务
 * 
 * 负责将多源数据（Google Maps、OSM、Wikidata、Foursquare）
 * 归一化到统一的分类和标签体系
 * 
 * Updated for AI Tags Optimization:
 * - extractTags() now generates structured jsonb tags
 * - Integrates with AI Tags Generator for ai_tags generation
 * 
 * Requirements: 1.1, 1.2, 1.3, 4.1-4.8
 */

import {
  CATEGORIES,
  CATEGORY_PRIORITY,
  CATEGORY_DISPLAY_NAMES,
  CATEGORY_ZH_NAMES,
  getCategoryBySlug,
  getCategoryMappingPriority,
  shouldExcludeCategory,
  isValidCategorySlug,
} from '../constants/categories';

import { detectPritzkerTags } from '../constants/pritzkerArchitects';
import { aiTagsGeneratorService, StructuredTags, AITagElement } from './aiTagsGeneratorService';

// Re-export types for external use
export { StructuredTags, AITagElement };

// ============================================
// 类型定义
// ============================================

export interface NormalizationInput {
  // Google Maps 数据
  googleTypes?: string[];
  googleKeywords?: string[];
  
  // OSM 数据
  osmTags?: Record<string, string>;
  
  // Wikidata 数据
  wikidataP31?: string[];      // instance of (P31)
  wikidataP84?: string;        // architect
  wikidataP149?: string;       // architectural style
  wikidataQID?: string;        // Wikidata QID
  
  // Foursquare 数据
  fsqCategories?: string[];
  
  // 通用数据
  name: string;
  description?: string;
  existingCategory?: string;   // 现有分类（用于迁移）
  existingTags?: string[];     // 现有标签
}

export interface CategoryResult {
  categorySlug: string;
  categoryEn: string;
  categoryZh: string;
  confidence: number;          // 0-1 置信度
  matchedBy: 'google_types' | 'osm_tags' | 'wikidata_p31' | 'fsq_category' | 'keywords' | 'fallback' | 'manual';
  altCategories: string[];     // 备选分类
}

export interface NormalizedPlace {
  categorySlug: string;
  categoryEn: string;
  categoryZh: string;
  tags: StructuredTags;  // Changed from string[] to StructuredTags
  aiTags: AITagElement[];  // New: generated AI tags
  customFields: {
    raw?: Record<string, any>;
    originalCategory?: string;
    evidence?: Record<string, string>;  // 标签证据存储
    matchedBy?: string;
  };
}

// ============================================
// 归一化服务
// ============================================

class NormalizationService {
  
  /**
   * 完整归一化流程
   * Now async to support AI Tags generation
   */
  async normalize(input: NormalizationInput): Promise<NormalizedPlace> {
    // 1. 确定主分类
    const categoryResult = this.determineCategory(input);
    
    // 2. 提取结构化标签和证据
    const { tags, evidence } = this.extractStructuredTags(input, categoryResult);
    
    // 3. 添加备选分类标签
    for (const altCat of categoryResult.altCategories) {
      if (!tags.alt_category) {
        tags.alt_category = [];
      }
      if (!tags.alt_category.includes(altCat)) {
        tags.alt_category.push(altCat);
      }
    }
    
    // 4. 生成 AI Tags
    const aiTags = await aiTagsGeneratorService.generateAITags(
      tags,
      categoryResult.categorySlug,
      categoryResult.categoryEn
    );
    
    // 5. 构建 customFields
    const customFields: NormalizedPlace['customFields'] = {
      matchedBy: categoryResult.matchedBy,
    };
    
    // 保存原始数据
    if (input.googleTypes || input.osmTags || input.wikidataP31 || input.fsqCategories) {
      customFields.raw = {};
      if (input.googleTypes?.length) customFields.raw.googleTypes = input.googleTypes;
      if (input.osmTags && Object.keys(input.osmTags).length) customFields.raw.osmTags = input.osmTags;
      if (input.wikidataP31?.length) customFields.raw.wikidataP31 = input.wikidataP31;
      if (input.fsqCategories?.length) customFields.raw.fsqCategories = input.fsqCategories;
      if (input.wikidataQID) customFields.raw.wikidataQID = input.wikidataQID;
    }
    
    // 保存原始分类（用于迁移审计）
    if (input.existingCategory) {
      customFields.originalCategory = input.existingCategory;
    }
    
    // 保存标签证据
    if (Object.keys(evidence).length > 0) {
      customFields.evidence = evidence;
    }
    
    return {
      categorySlug: categoryResult.categorySlug,
      categoryEn: categoryResult.categoryEn,
      categoryZh: categoryResult.categoryZh,
      tags,
      aiTags,
      customFields,
    };
  }
  
  /**
   * 同步版本的归一化（不生成 AI Tags）
   * 用于向后兼容
   */
  normalizeSync(input: NormalizationInput): Omit<NormalizedPlace, 'aiTags'> & { tags: StructuredTags } {
    // 1. 确定主分类
    const categoryResult = this.determineCategory(input);
    
    // 2. 提取结构化标签和证据
    const { tags, evidence } = this.extractStructuredTags(input, categoryResult);
    
    // 3. 添加备选分类标签
    for (const altCat of categoryResult.altCategories) {
      if (!tags.alt_category) {
        tags.alt_category = [];
      }
      if (!tags.alt_category.includes(altCat)) {
        tags.alt_category.push(altCat);
      }
    }
    
    // 4. 构建 customFields
    const customFields: NormalizedPlace['customFields'] = {
      matchedBy: categoryResult.matchedBy,
    };
    
    // 保存原始数据
    if (input.googleTypes || input.osmTags || input.wikidataP31 || input.fsqCategories) {
      customFields.raw = {};
      if (input.googleTypes?.length) customFields.raw.googleTypes = input.googleTypes;
      if (input.osmTags && Object.keys(input.osmTags).length) customFields.raw.osmTags = input.osmTags;
      if (input.wikidataP31?.length) customFields.raw.wikidataP31 = input.wikidataP31;
      if (input.fsqCategories?.length) customFields.raw.fsqCategories = input.fsqCategories;
      if (input.wikidataQID) customFields.raw.wikidataQID = input.wikidataQID;
    }
    
    // 保存原始分类（用于迁移审计）
    if (input.existingCategory) {
      customFields.originalCategory = input.existingCategory;
    }
    
    // 保存标签证据
    if (Object.keys(evidence).length > 0) {
      customFields.evidence = evidence;
    }
    
    return {
      categorySlug: categoryResult.categorySlug,
      categoryEn: categoryResult.categoryEn,
      categoryZh: categoryResult.categoryZh,
      tags,
      customFields,
    };
  }
  
  /**
   * 确定主分类
   * 支持 per-category mapping_priority 和排除规则
   */
  determineCategory(input: NormalizationInput): CategoryResult {
    // 优先检查：如果 existingCategory 是一个有效的 category slug，直接使用它
    // 这支持后台手动编辑分类的场景
    if (input.existingCategory && isValidCategorySlug(input.existingCategory)) {
      return {
        categorySlug: input.existingCategory,
        categoryEn: CATEGORY_DISPLAY_NAMES[input.existingCategory],
        categoryZh: CATEGORY_ZH_NAMES[input.existingCategory],
        confidence: 1.0,
        matchedBy: 'manual',
        altCategories: [],
      };
    }
    
    // 第一步：收集所有匹配的分类（按各自的 mapping_priority）
    const allMatches = this.collectAllMatches(input);
    
    // 第二步：应用排除规则
    const filteredMatches = this.applyExclusionRules(allMatches);
    
    // 第三步：选择最佳匹配
    if (filteredMatches.length === 0) {
      // Fallback: 根据是否有旅游景点信号决定
      const hasLandmarkSignals = this.hasLandmarkSignals(input);
      const fallbackSlug = hasLandmarkSignals ? 'landmark' : 'shop';
      return {
        categorySlug: fallbackSlug,
        categoryEn: CATEGORY_DISPLAY_NAMES[fallbackSlug],
        categoryZh: CATEGORY_ZH_NAMES[fallbackSlug],
        confidence: 0.3,
        matchedBy: 'fallback',
        altCategories: [],
      };
    }
    
    // 按置信度和分类优先级排序
    const sortedMatches = this.sortMatchesByPriority(filteredMatches);
    
    const primary = sortedMatches[0];
    const altCategories = sortedMatches.slice(1).map(m => m.slug);
    
    return {
      categorySlug: primary.slug,
      categoryEn: CATEGORY_DISPLAY_NAMES[primary.slug],
      categoryZh: CATEGORY_ZH_NAMES[primary.slug],
      confidence: primary.confidence,
      matchedBy: primary.source,
      altCategories,
    };
  }
  
  /**
   * 收集所有匹配的分类
   * 每个分类使用自己的 mapping_priority 来确定匹配源的置信度
   */
  private collectAllMatches(input: NormalizationInput): Array<{ slug: string; source: CategoryResult['matchedBy']; confidence: number }> {
    const matchedCategories: Array<{ slug: string; source: CategoryResult['matchedBy']; confidence: number }> = [];
    
    for (const [slug, def] of Object.entries(CATEGORIES)) {
      const priority = getCategoryMappingPriority(slug);
      const match = this.findBestMatchForCategory(input, slug, def, priority);
      if (match) {
        matchedCategories.push(match);
      }
    }
    
    return matchedCategories;
  }
  
  /**
   * 为单个分类找到最佳匹配源
   */
  private findBestMatchForCategory(
    input: NormalizationInput,
    slug: string,
    def: typeof CATEGORIES[string],
    priority: Array<'google_types' | 'osm_tags' | 'wikidata_p31' | 'fsq_category' | 'keywords'>
  ): { slug: string; source: CategoryResult['matchedBy']; confidence: number } | null {
    // 按优先级顺序检查每个数据源
    for (let i = 0; i < priority.length; i++) {
      const source = priority[i];
      const confidence = this.getConfidenceByPriorityIndex(i);
      
      let matched = false;
      
      switch (source) {
        case 'google_types':
          if (input.googleTypes?.length) {
            matched = input.googleTypes.some(t => 
              def.googleTypes.some(gt => t.toLowerCase().includes(gt.toLowerCase()))
            );
          }
          break;
          
        case 'osm_tags':
          if (input.osmTags && Object.keys(input.osmTags).length) {
            matched = this.matchOsmTags(input.osmTags, def.osmTags);
          }
          break;
          
        case 'wikidata_p31':
          if (input.wikidataP31?.length) {
            matched = input.wikidataP31.some(p31 =>
              def.wikidataP31.some(wp => p31.toLowerCase().includes(wp.toLowerCase()))
            );
          }
          break;
          
        case 'fsq_category':
          if (input.fsqCategories?.length) {
            matched = input.fsqCategories.some(fc =>
              def.fsqKeywords.some(fk => fc.toLowerCase().includes(fk.toLowerCase()))
            );
          }
          break;
          
        case 'keywords':
          const keywords = this.extractKeywords(input);
          if (keywords.length) {
            matched = keywords.some(kw =>
              def.googleKeywords.some(gk => kw.toLowerCase().includes(gk.toLowerCase()))
            );
          }
          break;
      }
      
      if (matched) {
        return { slug, source, confidence };
      }
    }
    
    return null;
  }
  
  /**
   * 根据优先级索引获取置信度
   * 优先级越高（索引越小），置信度越高
   */
  private getConfidenceByPriorityIndex(index: number): number {
    const confidences = [0.95, 0.9, 0.85, 0.8, 0.7];
    return confidences[index] || 0.6;
  }
  
  /**
   * 应用排除规则
   * landmark 和 shop 在已有更具体分类时应被排除
   */
  private applyExclusionRules(
    matches: Array<{ slug: string; source: CategoryResult['matchedBy']; confidence: number }>
  ): Array<{ slug: string; source: CategoryResult['matchedBy']; confidence: number }> {
    const matchedSlugs = matches.map(m => m.slug);
    
    return matches.filter(match => {
      // 检查是否应该排除此分类
      if (shouldExcludeCategory(match.slug, matchedSlugs)) {
        return false;
      }
      return true;
    });
  }
  
  /**
   * 按置信度和分类优先级排序
   * 特殊处理：art_gallery 优先于 museum
   */
  private sortMatchesByPriority(
    matches: Array<{ slug: string; source: CategoryResult['matchedBy']; confidence: number }>
  ): Array<{ slug: string; source: CategoryResult['matchedBy']; confidence: number }> {
    // 按 slug 去重，保留最高置信度
    const slugMap = new Map<string, typeof matches[0]>();
    for (const match of matches) {
      const existing = slugMap.get(match.slug);
      if (!existing || match.confidence > existing.confidence) {
        slugMap.set(match.slug, match);
      }
    }
    
    const result = Array.from(slugMap.values());
    
    // 特殊处理：如果同时有 art_gallery 和 museum，art_gallery 优先
    const hasArtGallery = result.some(m => m.slug === 'art_gallery');
    const hasMuseum = result.some(m => m.slug === 'museum');
    
    result.sort((a, b) => {
      // 特殊规则：art_gallery 优先于 museum
      if (hasArtGallery && hasMuseum) {
        if (a.slug === 'art_gallery' && b.slug === 'museum') return -1;
        if (a.slug === 'museum' && b.slug === 'art_gallery') return 1;
      }
      
      // 先按置信度
      if (a.confidence !== b.confidence) {
        return b.confidence - a.confidence;
      }
      // 再按分类优先级
      const priorityA = CATEGORY_PRIORITY.indexOf(a.slug);
      const priorityB = CATEGORY_PRIORITY.indexOf(b.slug);
      return priorityA - priorityB;
    });
    
    return result;
  }
  
  /**
   * 提取标签
   * 包含条件性标签规则（secondary_tag_rules）
   */
  extractTags(input: NormalizationInput, categoryResult: CategoryResult): { tags: string[]; evidence: Record<string, string> } {
    const tags: string[] = [];
    const evidence: Record<string, string> = {};
    
    // 1. 添加分类默认标签
    const categoryDef = getCategoryBySlug(categoryResult.categorySlug);
    if (categoryDef?.defaultTags) {
      tags.push(...categoryDef.defaultTags);
    }
    
    // 2. 保留现有标签（去重）
    if (input.existingTags?.length) {
      for (const tag of input.existingTags) {
        if (!tags.includes(tag)) {
          tags.push(tag);
        }
      }
    }
    
    // 3. 应用 Secondary Tag Rules（条件性标签）
    this.applySecondaryTagRules(input, categoryResult.categorySlug, tags, evidence);
    
    return { tags, evidence };
  }
  
  /**
   * 应用条件性标签规则
   * 基于 Categories.csv 的 secondary_tag_rules 和 Tags.csv 的 apply_when
   */
  private applySecondaryTagRules(
    input: NormalizationInput,
    categorySlug: string,
    tags: string[],
    evidence: Record<string, string>
  ): void {
    // 3.1 检测建筑标签
    if (this.hasArchitectureSignals(input)) {
      if (!tags.includes('domain:architecture')) {
        tags.push('domain:architecture');
        evidence['domain:architecture'] = 'wikidata P84/P149 or osm architect:wikidata or keywords';
      }
      
      // 添加建筑师标签
      if (input.wikidataP84) {
        const architectTag = `architect:${input.wikidataP84}`;
        if (!tags.includes(architectTag)) {
          tags.push(architectTag);
        }
      }
      
      // 添加风格标签
      if (input.wikidataP149) {
        const styleTag = `style:${input.wikidataP149}`;
        if (!tags.includes(styleTag)) {
          tags.push(styleTag);
        }
      }
    }
    
    // 3.2 检测女性主义标签
    if (this.hasFeminismSignals(input)) {
      if (!tags.includes('theme:feminism')) {
        tags.push('theme:feminism');
        evidence['theme:feminism'] = 'keywords match feminist/women';
      }
    }
    
    // 3.3 检测 brunch 标签（适用于 cafe/restaurant/bakery）
    if (['cafe', 'restaurant', 'bakery'].includes(categorySlug) && this.hasBrunchSignals(input)) {
      if (!tags.includes('meal:brunch')) {
        tags.push('meal:brunch');
        evidence['meal:brunch'] = 'brunch signals detected';
      }
    }
    
    // 3.4 检测 vintage 标签
    if (this.hasVintageSignals(input)) {
      if (!tags.includes('style:vintage')) {
        tags.push('style:vintage');
        evidence['style:vintage'] = 'vintage keywords detected';
      }
    }
    
    // 3.5 检测二手店标签
    if (this.hasSecondhandSignals(input)) {
      if (!tags.includes('shop:secondhand')) {
        tags.push('shop:secondhand');
        evidence['shop:secondhand'] = 'secondhand signals detected';
      }
    }
    
    // 3.6 检测 hostel 标签（适用于 hotel）
    if (categorySlug === 'hotel' && this.hasHostelSignals(input)) {
      if (!tags.includes('lodging:hostel')) {
        tags.push('lodging:hostel');
        evidence['lodging:hostel'] = 'hostel signals detected';
      }
    }
    
    // 3.7 cafe + bakery 互斥处理
    if (categorySlug === 'cafe' && this.hasBakerySignals(input)) {
      if (!tags.includes('alt_category:bakery')) {
        tags.push('alt_category:bakery');
      }
    }
    if (categorySlug === 'bakery' && this.hasCafeSignals(input)) {
      if (!tags.includes('alt_category:cafe')) {
        tags.push('alt_category:cafe');
      }
    }
    
    // 3.8 bar + restaurant/cafe 互斥处理
    if (categorySlug === 'bar') {
      if (this.hasRestaurantSignals(input) && !tags.includes('alt_category:restaurant')) {
        tags.push('alt_category:restaurant');
      }
      if (this.hasCafeSignals(input) && !tags.includes('alt_category:cafe')) {
        tags.push('alt_category:cafe');
      }
    }
    
    // 3.9 park + viewpoint → alt_category:landmark
    if (categorySlug === 'park' && this.hasViewpointSignals(input)) {
      if (!tags.includes('alt_category:landmark')) {
        tags.push('alt_category:landmark');
      }
    }
    
    // 3.10 cemetery + landmark signals → alt_category:landmark + theme:memory
    if (categorySlug === 'cemetery' && this.hasLandmarkSignals(input)) {
      if (!tags.includes('alt_category:landmark')) {
        tags.push('alt_category:landmark');
      }
      // CSV: tags+=theme:memory (optional)
      if (!tags.includes('theme:memory')) {
        tags.push('theme:memory');
        evidence['theme:memory'] = 'cemetery with landmark signals';
      }
    }
    
    // 3.11 castle + architecture signals → domain:architecture + alt_category:landmark
    if (categorySlug === 'castle' && this.hasArchitectureSignals(input)) {
      if (!tags.includes('alt_category:landmark')) {
        tags.push('alt_category:landmark');
      }
    }
    
    // 3.12 market + shopping_mall signals → alt_category:shopping_mall
    if (categorySlug === 'market' && this.hasShoppingMallSignals(input)) {
      if (!tags.includes('alt_category:shopping_mall')) {
        tags.push('alt_category:shopping_mall');
      }
    }
    
    // 3.13 yarn_store: 如果只是通用 craft store → alt_category:shop
    if (categorySlug === 'yarn_store' && this.isGenericCraftStore(input)) {
      if (!tags.includes('alt_category:shop')) {
        tags.push('alt_category:shop');
        evidence['alt_category:shop'] = 'generic craft store detected';
      }
    }
    
    // 3.14 Pritzker Prize 检测
    if (input.wikidataP84) {
      const pritzkerTags = detectPritzkerTags(input.wikidataP84);
      for (const tag of pritzkerTags) {
        if (!tags.includes(tag)) {
          tags.push(tag);
          if (tag === 'pritzker') {
            evidence['pritzker'] = `architect ${input.wikidataP84} is Pritzker laureate`;
          }
        }
      }
    }
  }
  
  /**
   * 提取结构化标签 (新版本)
   * 生成 StructuredTags 对象格式
   * 
   * Requirements: 1.1, 1.2, 1.3
   */
  extractStructuredTags(input: NormalizationInput, categoryResult: CategoryResult): { tags: StructuredTags; evidence: Record<string, string> } {
    const tags: StructuredTags = {};
    const evidence: Record<string, string> = {};
    
    // 1. 处理现有标签（如果是旧格式 string[]，转换为结构化格式）
    if (input.existingTags?.length) {
      this.convertExistingTagsToStructured(input.existingTags, tags);
    }
    
    // 2. 检测建筑标签
    if (this.hasArchitectureSignals(input)) {
      // 添加建筑主题
      if (!tags.theme) tags.theme = [];
      if (!tags.theme.includes('architecture')) {
        tags.theme.push('architecture');
        evidence['theme:architecture'] = 'wikidata P84/P149 or osm architect:wikidata or keywords';
      }
      
      // 添加建筑师 QID
      if (input.wikidataP84) {
        if (!tags.architectQ) tags.architectQ = [];
        if (!tags.architectQ.includes(input.wikidataP84)) {
          tags.architectQ.push(input.wikidataP84);
        }
      }
      
      // 添加风格
      if (input.wikidataP149) {
        if (!tags.style) tags.style = [];
        if (!tags.style.includes(input.wikidataP149)) {
          tags.style.push(input.wikidataP149);
        }
      }
    }
    
    // 3. 检测女性主义标签
    if (this.hasFeminismSignals(input)) {
      if (!tags.theme) tags.theme = [];
      if (!tags.theme.includes('feminism')) {
        tags.theme.push('feminism');
        evidence['theme:feminism'] = 'keywords match feminist/women';
      }
    }
    
    // 4. 检测 brunch 标签（适用于 cafe/restaurant/bakery）
    if (['cafe', 'restaurant', 'bakery'].includes(categoryResult.categorySlug) && this.hasBrunchSignals(input)) {
      if (!tags.meal) tags.meal = [];
      if (!tags.meal.includes('brunch')) {
        tags.meal.push('brunch');
        evidence['meal:brunch'] = 'brunch signals detected';
      }
    }
    
    // 5. 检测 vintage 标签
    if (this.hasVintageSignals(input)) {
      if (!tags.style) tags.style = [];
      if (!tags.style.includes('vintage')) {
        tags.style.push('vintage');
        evidence['style:vintage'] = 'vintage keywords detected';
      }
    }
    
    // 6. 检测二手店标签
    if (this.hasSecondhandSignals(input)) {
      if (!tags.style) tags.style = [];
      if (!tags.style.includes('secondhand')) {
        tags.style.push('secondhand');
        evidence['style:secondhand'] = 'secondhand signals detected';
      }
    }
    
    // 7. 检测 hostel 标签（适用于 hotel）
    if (categoryResult.categorySlug === 'hotel' && this.hasHostelSignals(input)) {
      if (!tags.style) tags.style = [];
      if (!tags.style.includes('hostel')) {
        tags.style.push('hostel');
        evidence['style:hostel'] = 'hostel signals detected';
      }
    }
    
    // 8. cafe + bakery 互斥处理
    if (categoryResult.categorySlug === 'cafe' && this.hasBakerySignals(input)) {
      if (!tags.alt_category) tags.alt_category = [];
      if (!tags.alt_category.includes('bakery')) {
        tags.alt_category.push('bakery');
      }
    }
    if (categoryResult.categorySlug === 'bakery' && this.hasCafeSignals(input)) {
      if (!tags.alt_category) tags.alt_category = [];
      if (!tags.alt_category.includes('cafe')) {
        tags.alt_category.push('cafe');
      }
    }
    
    // 9. bar + restaurant/cafe 互斥处理
    if (categoryResult.categorySlug === 'bar') {
      if (this.hasRestaurantSignals(input)) {
        if (!tags.alt_category) tags.alt_category = [];
        if (!tags.alt_category.includes('restaurant')) {
          tags.alt_category.push('restaurant');
        }
      }
      if (this.hasCafeSignals(input)) {
        if (!tags.alt_category) tags.alt_category = [];
        if (!tags.alt_category.includes('cafe')) {
          tags.alt_category.push('cafe');
        }
      }
    }
    
    // 10. park + viewpoint → alt_category:landmark
    if (categoryResult.categorySlug === 'park' && this.hasViewpointSignals(input)) {
      if (!tags.alt_category) tags.alt_category = [];
      if (!tags.alt_category.includes('landmark')) {
        tags.alt_category.push('landmark');
      }
    }
    
    // 11. cemetery + landmark signals → alt_category:landmark + theme:memory
    if (categoryResult.categorySlug === 'cemetery' && this.hasLandmarkSignals(input)) {
      if (!tags.alt_category) tags.alt_category = [];
      if (!tags.alt_category.includes('landmark')) {
        tags.alt_category.push('landmark');
      }
      if (!tags.theme) tags.theme = [];
      if (!tags.theme.includes('memory')) {
        tags.theme.push('memory');
        evidence['theme:memory'] = 'cemetery with landmark signals';
      }
    }
    
    // 12. castle + architecture signals → alt_category:landmark
    if (categoryResult.categorySlug === 'castle' && this.hasArchitectureSignals(input)) {
      if (!tags.alt_category) tags.alt_category = [];
      if (!tags.alt_category.includes('landmark')) {
        tags.alt_category.push('landmark');
      }
    }
    
    // 13. market + shopping_mall signals → alt_category:shopping_mall
    if (categoryResult.categorySlug === 'market' && this.hasShoppingMallSignals(input)) {
      if (!tags.alt_category) tags.alt_category = [];
      if (!tags.alt_category.includes('shopping_mall')) {
        tags.alt_category.push('shopping_mall');
      }
    }
    
    // 14. yarn_store: 如果只是通用 craft store → alt_category:shop
    if (categoryResult.categorySlug === 'yarn_store' && this.isGenericCraftStore(input)) {
      if (!tags.alt_category) tags.alt_category = [];
      if (!tags.alt_category.includes('shop')) {
        tags.alt_category.push('shop');
        evidence['alt_category:shop'] = 'generic craft store detected';
      }
    }
    
    // 15. Pritzker Prize 检测
    if (input.wikidataP84) {
      const pritzkerTags = detectPritzkerTags(input.wikidataP84);
      if (pritzkerTags.includes('pritzker')) {
        if (!tags.award) tags.award = [];
        if (!tags.award.includes('pritzker')) {
          tags.award.push('pritzker');
          evidence['award:pritzker'] = `architect ${input.wikidataP84} is Pritzker laureate`;
        }
      }
    }
    
    // 16. 检测菜系（从 Google types 或关键词）
    this.detectCuisine(input, categoryResult.categorySlug, tags, evidence);
    
    return { tags, evidence };
  }
  
  /**
   * 将旧格式的 string[] tags 转换为结构化格式
   */
  private convertExistingTagsToStructured(existingTags: string[], tags: StructuredTags): void {
    const TAG_PREFIX_MAP: Record<string, keyof StructuredTags> = {
      'style': 'style',
      'theme': 'theme',
      'award': 'award',
      'meal': 'meal',
      'cuisine': 'cuisine',
      'architect': 'architectQ',
      'person': 'personQ',
      'alt_category': 'alt_category',
      'domain': 'theme',
      'shop': 'style',
      'lodging': 'style',
    };
    
    const SPECIAL_TAG_MAP: Record<string, { key: keyof StructuredTags; value: string }> = {
      'pritzker': { key: 'award', value: 'pritzker' },
      'brunch': { key: 'meal', value: 'brunch' },
      'vintage': { key: 'style', value: 'vintage' },
      'secondhand': { key: 'style', value: 'secondhand' },
      'feminist': { key: 'theme', value: 'feminism' },
      'feminism': { key: 'theme', value: 'feminism' },
      'architecture': { key: 'theme', value: 'architecture' },
    };
    
    for (const tag of existingTags) {
      if (typeof tag !== 'string') continue;
      
      const trimmedTag = tag.trim();
      if (!trimmedTag) continue;
      
      const colonIndex = trimmedTag.indexOf(':');
      
      if (colonIndex > 0) {
        const prefix = trimmedTag.substring(0, colonIndex).toLowerCase();
        const value = trimmedTag.substring(colonIndex + 1);
        
        const targetKey = TAG_PREFIX_MAP[prefix];
        
        if (targetKey) {
          if (!tags[targetKey]) {
            tags[targetKey] = [];
          }
          if (!tags[targetKey]!.includes(value)) {
            tags[targetKey]!.push(value);
          }
        }
      } else {
        const lowerTag = trimmedTag.toLowerCase();
        const specialMapping = SPECIAL_TAG_MAP[lowerTag];
        
        if (specialMapping) {
          if (!tags[specialMapping.key]) {
            tags[specialMapping.key] = [];
          }
          if (!tags[specialMapping.key]!.includes(specialMapping.value)) {
            tags[specialMapping.key]!.push(specialMapping.value);
          }
        }
      }
    }
  }
  
  /**
   * 检测菜系
   */
  private detectCuisine(
    input: NormalizationInput,
    categorySlug: string,
    tags: StructuredTags,
    evidence: Record<string, string>
  ): void {
    // 只对餐厅类分类检测菜系
    if (!['restaurant', 'cafe', 'bakery'].includes(categorySlug)) {
      return;
    }
    
    const cuisineKeywords: Record<string, string[]> = {
      'Japanese': ['japanese', 'sushi', 'ramen', 'izakaya', 'tempura', 'udon'],
      'Korean': ['korean', 'bbq', 'kimchi', 'bibimbap'],
      'Vietnamese': ['vietnamese', 'pho', 'banh mi'],
      'Thai': ['thai', 'pad thai', 'tom yum'],
      'Chinese': ['chinese', 'dim sum', 'cantonese', 'szechuan', 'sichuan'],
      'Italian': ['italian', 'pizza', 'pasta', 'trattoria', 'osteria'],
      'French': ['french', 'bistro', 'brasserie', 'patisserie'],
      'Spanish': ['spanish', 'tapas', 'paella'],
      'Indian': ['indian', 'curry', 'tandoori', 'masala'],
      'Mexican': ['mexican', 'taco', 'burrito', 'quesadilla'],
      'MiddleEastern': ['middle eastern', 'mediterranean', 'falafel', 'hummus', 'kebab'],
      'Seafood': ['seafood', 'fish', 'oyster', 'lobster', 'crab'],
    };
    
    const keywords = this.extractKeywords(input);
    const keywordsLower = keywords.map(k => k.toLowerCase());
    
    for (const [cuisine, patterns] of Object.entries(cuisineKeywords)) {
      const matched = patterns.some(pattern => 
        keywordsLower.some(kw => kw.includes(pattern))
      );
      
      if (matched) {
        if (!tags.cuisine) tags.cuisine = [];
        if (!tags.cuisine.includes(cuisine)) {
          tags.cuisine.push(cuisine);
          evidence[`cuisine:${cuisine}`] = 'keywords match';
        }
        break; // 只取第一个匹配的菜系
      }
    }
  }
  
  // ============================================
  // 信号检测方法
  // ============================================
  
  /**
   * 检测 hostel 信号
   */
  private hasHostelSignals(input: NormalizationInput): boolean {
    // Google types
    if (input.googleTypes?.some(t => t.toLowerCase().includes('hostel'))) {
      return true;
    }
    // OSM tags
    if (input.osmTags?.['tourism'] === 'hostel') {
      return true;
    }
    // Keywords
    const hostelKeywords = ['hostel', 'youth hostel', 'backpacker'];
    const keywords = this.extractKeywords(input);
    return keywords.some(kw =>
      hostelKeywords.some(hk => kw.toLowerCase().includes(hk))
    );
  }
  
  /**
   * 检测 bakery 信号
   */
  private hasBakerySignals(input: NormalizationInput): boolean {
    // Google types
    if (input.googleTypes?.some(t => t.toLowerCase().includes('bakery'))) {
      return true;
    }
    // OSM tags
    if (input.osmTags?.['shop'] === 'bakery' || input.osmTags?.['shop'] === 'pastry') {
      return true;
    }
    // Keywords
    const bakeryKeywords = ['bakery', 'patisserie', 'pastry', 'boulangerie'];
    const keywords = this.extractKeywords(input);
    return keywords.some(kw =>
      bakeryKeywords.some(bk => kw.toLowerCase().includes(bk))
    );
  }
  
  /**
   * 检测 cafe 信号
   */
  private hasCafeSignals(input: NormalizationInput): boolean {
    // Google types
    if (input.googleTypes?.some(t => t.toLowerCase().includes('cafe') || t.toLowerCase().includes('coffee'))) {
      return true;
    }
    // OSM tags
    if (input.osmTags?.['amenity'] === 'cafe') {
      return true;
    }
    // Keywords
    const cafeKeywords = ['cafe', 'coffee', 'espresso'];
    const keywords = this.extractKeywords(input);
    return keywords.some(kw =>
      cafeKeywords.some(ck => kw.toLowerCase().includes(ck))
    );
  }
  
  /**
   * 检测 restaurant 信号
   */
  private hasRestaurantSignals(input: NormalizationInput): boolean {
    // Google types
    if (input.googleTypes?.some(t => t.toLowerCase().includes('restaurant'))) {
      return true;
    }
    // OSM tags
    if (input.osmTags?.['amenity'] === 'restaurant') {
      return true;
    }
    // Keywords
    const restaurantKeywords = ['restaurant', 'dining', 'bistro', 'eatery'];
    const keywords = this.extractKeywords(input);
    return keywords.some(kw =>
      restaurantKeywords.some(rk => kw.toLowerCase().includes(rk))
    );
  }
  
  /**
   * 检测 viewpoint 信号
   */
  private hasViewpointSignals(input: NormalizationInput): boolean {
    // Google types
    if (input.googleTypes?.some(t => t.toLowerCase().includes('viewpoint'))) {
      return true;
    }
    // OSM tags
    if (input.osmTags?.['tourism'] === 'viewpoint') {
      return true;
    }
    // Keywords
    const viewpointKeywords = ['viewpoint', 'scenic', 'overlook', 'panorama'];
    const keywords = this.extractKeywords(input);
    return keywords.some(kw =>
      viewpointKeywords.some(vk => kw.toLowerCase().includes(vk))
    );
  }
  
  /**
   * 检测 shopping_mall 信号
   */
  private hasShoppingMallSignals(input: NormalizationInput): boolean {
    // Google types
    if (input.googleTypes?.some(t => 
      t.toLowerCase().includes('shopping_mall') || t.toLowerCase().includes('department_store')
    )) {
      return true;
    }
    // OSM tags
    if (input.osmTags?.['shop'] === 'mall' || input.osmTags?.['shop'] === 'department_store') {
      return true;
    }
    // Keywords
    const mallKeywords = ['shopping mall', 'mall', 'department store', 'shopping center'];
    const keywords = this.extractKeywords(input);
    return keywords.some(kw =>
      mallKeywords.some(mk => kw.toLowerCase().includes(mk))
    );
  }
  
  /**
   * 检测是否为通用 craft store（而非专门的 yarn store）
   * 用于 yarn_store 的 alt_category:shop 规则
   */
  private isGenericCraftStore(input: NormalizationInput): boolean {
    // 如果有明确的 yarn/wool/knitting 信号，则不是通用 craft store
    const yarnKeywords = ['yarn', 'wool', 'knitting', 'haberdashery', 'merceria'];
    const keywords = this.extractKeywords(input);
    const hasYarnSignals = keywords.some(kw =>
      yarnKeywords.some(yk => kw.toLowerCase().includes(yk))
    );
    
    // 如果没有明确的 yarn 信号，但有 craft store 信号，则是通用 craft store
    if (!hasYarnSignals) {
      const craftKeywords = ['craft store', 'craft shop', 'hobby store'];
      return keywords.some(kw =>
        craftKeywords.some(ck => kw.toLowerCase().includes(ck))
      );
    }
    
    return false;
  }
  
  // ============================================
  // 私有辅助方法
  // ============================================
  
  private matchOsmTags(osmTags: Record<string, string>, patterns: string[]): boolean {
    for (const pattern of patterns) {
      // 处理组合条件 (e.g., "amenity=place_of_worship+religion=christian")
      if (pattern.includes('+')) {
        const conditions = pattern.split('+');
        const allMatch = conditions.every(cond => {
          const [key, value] = cond.split('=');
          if (value === '*') {
            return key in osmTags;
          }
          return osmTags[key] === value;
        });
        if (allMatch) return true;
      } else {
        const [key, value] = pattern.split('=');
        if (value === '*') {
          // 通配符匹配
          if (key in osmTags) return true;
        } else {
          // 精确匹配
          if (osmTags[key] === value) return true;
        }
      }
    }
    return false;
  }
  
  private extractKeywords(input: NormalizationInput): string[] {
    const keywords: string[] = [];
    if (input.name) keywords.push(input.name);
    if (input.description) keywords.push(input.description);
    if (input.googleKeywords) keywords.push(...input.googleKeywords);
    return keywords;
  }
  
  private hasLandmarkSignals(input: NormalizationInput): boolean {
    const landmarkKeywords = ['landmark', 'attraction', 'viewpoint', 'scenic', 'monument'];
    const keywords = this.extractKeywords(input);
    return keywords.some(kw => 
      landmarkKeywords.some(lk => kw.toLowerCase().includes(lk))
    );
  }
  
  private hasArchitectureSignals(input: NormalizationInput): boolean {
    // Wikidata P84 (architect) 或 P149 (architectural style)
    if (input.wikidataP84 || input.wikidataP149) return true;
    
    // OSM architect:wikidata
    if (input.osmTags?.['architect:wikidata']) return true;
    
    // Keywords
    const archKeywords = ['architecture', 'brutalist', 'modernist', 'architect'];
    const keywords = this.extractKeywords(input);
    return keywords.some(kw =>
      archKeywords.some(ak => kw.toLowerCase().includes(ak))
    );
  }
  
  private hasFeminismSignals(input: NormalizationInput): boolean {
    const feminismKeywords = ['feminist', "women's", 'gender equality', "women's rights", 'feminist bookstore'];
    const keywords = this.extractKeywords(input);
    return keywords.some(kw =>
      feminismKeywords.some(fk => kw.toLowerCase().includes(fk.toLowerCase()))
    );
  }
  
  private hasBrunchSignals(input: NormalizationInput): boolean {
    // Google types
    if (input.googleTypes?.some(t => t.includes('brunch') || t.includes('breakfast'))) {
      return true;
    }
    // Keywords
    const brunchKeywords = ['brunch', 'all day breakfast'];
    const keywords = this.extractKeywords(input);
    return keywords.some(kw =>
      brunchKeywords.some(bk => kw.toLowerCase().includes(bk))
    );
  }
  
  private hasVintageSignals(input: NormalizationInput): boolean {
    const vintageKeywords = ['vintage', 'consignment', 'antique'];
    const keywords = this.extractKeywords(input);
    return keywords.some(kw =>
      vintageKeywords.some(vk => kw.toLowerCase().includes(vk))
    );
  }
  
  private hasSecondhandSignals(input: NormalizationInput): boolean {
    // OSM tags
    if (input.osmTags?.['shop'] === 'second_hand' || input.osmTags?.['second_hand']) {
      return true;
    }
    // Keywords
    const secondhandKeywords = ['second hand', 'secondhand', 'thrift', 'resale', 'charity shop'];
    const keywords = this.extractKeywords(input);
    return keywords.some(kw =>
      secondhandKeywords.some(sk => kw.toLowerCase().includes(sk))
    );
  }
  
  // ============================================
  // Apify Data Normalization Methods
  // ============================================
  
  /**
   * Apify 分类映射规则
   * 按优先级从高到低排列
   * 
   * Requirements: 4.1-4.9
   */
  private readonly APIFY_CATEGORY_MAPPINGS: Array<{
    patterns: string[];
    categorySlug: string;
    priority: number;
  }> = [
    // Requirement 4.3: Museum/Art museum → museum
    { patterns: ['museum', 'art museum', 'history museum', 'science museum'], categorySlug: 'museum', priority: 10 },
    // Requirement 4.4: Art gallery/Gallery → art_gallery
    { patterns: ['art gallery', 'gallery', 'contemporary art'], categorySlug: 'art_gallery', priority: 11 },
    // Requirement 4.5: Coffee shop/Cafe → cafe
    { patterns: ['coffee shop', 'cafe', 'café', 'coffee', 'espresso bar'], categorySlug: 'cafe', priority: 20 },
    // Requirement 4.6: Bakery/Patisserie → bakery
    { patterns: ['bakery', 'patisserie', 'pastry', 'boulangerie', 'pastry shop'], categorySlug: 'bakery', priority: 21 },
    // Requirement 4.7: Restaurant → restaurant
    { patterns: ['restaurant', 'bistro', 'dining', 'eatery', 'brasserie'], categorySlug: 'restaurant', priority: 30 },
    // Requirement 4.8: Thrift store/Second hand → thrift_store
    { patterns: ['thrift store', 'second hand', 'secondhand', 'charity shop', 'resale', 'consignment'], categorySlug: 'thrift_store', priority: 15 },
    // Requirement 4.9: Tourist attraction/Landmark → landmark
    { patterns: ['tourist attraction', 'landmark', 'attraction', 'viewpoint', 'scenic'], categorySlug: 'landmark', priority: 100 },
    // Additional mappings
    { patterns: ['bar', 'pub', 'cocktail bar', 'wine bar'], categorySlug: 'bar', priority: 31 },
    { patterns: ['hotel', 'lodging', 'boutique hotel', 'hostel', 'ryokan'], categorySlug: 'hotel', priority: 40 },
    { patterns: ['church', 'cathedral', 'basilica', 'chapel'], categorySlug: 'church', priority: 50 },
    { patterns: ['temple', 'shrine', 'buddhist temple', 'hindu temple', 'shinto shrine'], categorySlug: 'temple', priority: 49 },
    { patterns: ['university', 'college', 'campus', 'school'], categorySlug: 'university', priority: 48 },
    { patterns: ['zoo', 'aquarium', 'wildlife park', 'animal park'], categorySlug: 'zoo', priority: 47 },
    { patterns: ['library', 'public library'], categorySlug: 'library', priority: 51 },
    { patterns: ['bookstore', 'book store', 'book shop'], categorySlug: 'bookstore', priority: 52 },
    { patterns: ['cemetery', 'graveyard'], categorySlug: 'cemetery', priority: 53 },
    { patterns: ['park', 'garden', 'botanical garden'], categorySlug: 'park', priority: 60 },
    { patterns: ['castle', 'palace', 'fortress', 'chateau'], categorySlug: 'castle', priority: 12 },
    { patterns: ['market', 'marketplace', 'farmers market', 'food market'], categorySlug: 'market', priority: 70 },
    { patterns: ['shopping mall', 'mall', 'department store', 'shopping center'], categorySlug: 'shopping_mall', priority: 71 },
    { patterns: ['yarn', 'wool shop', 'knitting', 'haberdashery'], categorySlug: 'yarn_store', priority: 16 },
    { patterns: ['shop', 'store', 'retail', 'gift shop'], categorySlug: 'shop', priority: 90 },
  ];
  
  /**
   * 从 Apify 数据归一化分类
   * 
   * Requirements: 4.1-4.11
   * 
   * @param categories - Apify categories 数组
   * @param categoryName - Apify categoryName 字段
   * @param searchString - Apify searchString 字段（用于 feminist 标签检测）
   * @returns 归一化后的分类结果
   */
  normalizeFromApify(
    categories?: string[] | null,
    categoryName?: string | null,
    searchString?: string | null
  ): {
    categorySlug: string;
    categoryEn: string;
    categoryZh: string;
    tags: string[];
    matchedBy: 'categories' | 'categoryName' | 'searchString' | 'fallback';
  } {
    const tags: string[] = [];
    
    // Requirement 4.10: searchString 为 feminist 时添加 Feminism 标签
    if (searchString && this.isFeminismSearchString(searchString)) {
      tags.push('theme:feminism');
    }
    
    // Requirement 4.2: 优先级 categories > categoryName > searchString
    
    // 1. 尝试从 categories 数组匹配
    if (categories && categories.length > 0) {
      const result = this.matchApifyCategories(categories);
      if (result) {
        return {
          categorySlug: result.categorySlug,
          categoryEn: CATEGORY_DISPLAY_NAMES[result.categorySlug],
          categoryZh: CATEGORY_ZH_NAMES[result.categorySlug],
          tags,
          matchedBy: 'categories',
        };
      }
    }
    
    // 2. 尝试从 categoryName 匹配
    if (categoryName) {
      const result = this.matchApifyCategoryName(categoryName);
      if (result) {
        return {
          categorySlug: result.categorySlug,
          categoryEn: CATEGORY_DISPLAY_NAMES[result.categorySlug],
          categoryZh: CATEGORY_ZH_NAMES[result.categorySlug],
          tags,
          matchedBy: 'categoryName',
        };
      }
    }
    
    // 3. 尝试从 searchString 推断
    if (searchString) {
      const result = this.matchApifySearchString(searchString);
      if (result) {
        return {
          categorySlug: result.categorySlug,
          categoryEn: CATEGORY_DISPLAY_NAMES[result.categorySlug],
          categoryZh: CATEGORY_ZH_NAMES[result.categorySlug],
          tags,
          matchedBy: 'searchString',
        };
      }
    }
    
    // 4. Fallback: 默认为 shop
    return {
      categorySlug: 'shop',
      categoryEn: CATEGORY_DISPLAY_NAMES['shop'],
      categoryZh: CATEGORY_ZH_NAMES['shop'],
      tags,
      matchedBy: 'fallback',
    };
  }
  
  /**
   * 从 categories 数组匹配分类
   * 按优先级选择最佳匹配
   */
  private matchApifyCategories(categories: string[]): { categorySlug: string; priority: number } | null {
    let bestMatch: { categorySlug: string; priority: number } | null = null;
    
    for (const category of categories) {
      const categoryLower = category.toLowerCase();
      
      for (const mapping of this.APIFY_CATEGORY_MAPPINGS) {
        const matched = mapping.patterns.some((pattern: string) => 
          categoryLower.includes(pattern.toLowerCase()) ||
          pattern.toLowerCase().includes(categoryLower)
        );
        
        if (matched) {
          // 选择优先级最低（数值最小）的匹配
          if (!bestMatch || mapping.priority < bestMatch.priority) {
            bestMatch = { categorySlug: mapping.categorySlug, priority: mapping.priority };
          }
        }
      }
    }
    
    return bestMatch;
  }
  
  /**
   * 从 categoryName 匹配分类
   */
  private matchApifyCategoryName(categoryName: string): { categorySlug: string; priority: number } | null {
    const categoryLower = categoryName.toLowerCase();
    
    let bestMatch: { categorySlug: string; priority: number } | null = null;
    
    for (const mapping of this.APIFY_CATEGORY_MAPPINGS) {
      const matched = mapping.patterns.some((pattern: string) => 
        categoryLower.includes(pattern.toLowerCase()) ||
        pattern.toLowerCase().includes(categoryLower)
      );
      
      if (matched) {
        if (!bestMatch || mapping.priority < bestMatch.priority) {
          bestMatch = { categorySlug: mapping.categorySlug, priority: mapping.priority };
        }
      }
    }
    
    return bestMatch;
  }
  
  /**
   * 从 searchString 推断分类
   */
  private matchApifySearchString(searchString: string): { categorySlug: string; priority: number } | null {
    const searchLower = searchString.toLowerCase();
    
    // 特殊处理：feminist 搜索词不影响分类，只影响标签
    // 分类仍按场所功能确定
    
    let bestMatch: { categorySlug: string; priority: number } | null = null;
    
    for (const mapping of this.APIFY_CATEGORY_MAPPINGS) {
      const matched = mapping.patterns.some((pattern: string) => 
        searchLower.includes(pattern.toLowerCase())
      );
      
      if (matched) {
        if (!bestMatch || mapping.priority < bestMatch.priority) {
          bestMatch = { categorySlug: mapping.categorySlug, priority: mapping.priority };
        }
      }
    }
    
    return bestMatch;
  }
  
  /**
   * 检测是否为 feminism 相关搜索词
   * Requirement 4.10
   */
  private isFeminismSearchString(searchString: string): boolean {
    const feminismKeywords = ['feminist', 'feminism', "women's", 'gender equality'];
    const searchLower = searchString.toLowerCase();
    return feminismKeywords.some(kw => searchLower.includes(kw));
  }
}

// 导出单例
export const normalizationService = new NormalizationService();
export default normalizationService;
