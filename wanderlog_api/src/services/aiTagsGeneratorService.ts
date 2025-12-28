/**
 * AI Tags Generator Service
 * 
 * 从结构化 tags 生成 ai_tags 展示标签
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8
 */

import { aiFacetDictionaryService, FacetDefinition } from './aiFacetDictionaryService';

// ============================================
// 类型定义
// ============================================

/**
 * 结构化 tags 对象格式
 */
export interface StructuredTags {
  style?: string[];        // ["Brutalist", "ArtDeco"]
  theme?: string[];        // ["feminism"]
  award?: string[];        // ["pritzker"]
  meal?: string[];         // ["brunch"]
  cuisine?: string[];      // ["Japanese", "Korean"]
  architectQ?: string[];   // ["Q82840"] - Wikidata QID
  personQ?: string[];      // ["Q254"] - Wikidata QID
  alt_category?: string[]; // ["museum"]
  [key: string]: string[] | undefined;
}

/**
 * AI Tag 元素格式
 */
export interface AITagElement {
  kind: 'facet' | 'person' | 'architect';
  id: string;       // e.g. 'Pritzker', 'Q254', 'Q82840'
  en: string;       // e.g. 'Pritzker', 'Mozart', 'Zaha Hadid'
  zh: string;       // e.g. '普利兹克', '莫扎特', '扎哈·哈迪德'
  priority: number; // e.g. 95
}

/**
 * 实体信息（用于 person/architect）
 */
export interface EntityInfo {
  qid: string;      // Wikidata QID
  en: string;       // 英文名
  zh: string;       // 中文名
}

// ============================================
// 常量定义
// ============================================

// 允许 brunch facet 的分类
const BRUNCH_ALLOWED_CATEGORIES = ['restaurant', 'cafe', 'bakery'];

// 允许 cuisine facet 的分类
const CUISINE_ALLOWED_CATEGORIES = ['restaurant'];

// 最大 ai_tags 数量
const MAX_AI_TAGS = 2;

// 最大 style facet 数量
const MAX_STYLE_FACETS = 1;

// 最大 entity 数量 (person 或 architect)
const MAX_ENTITIES = 1;

// ============================================
// AI Tags Generator Service
// ============================================

class AITagsGeneratorService {
  /**
   * 从结构化 tags 生成 ai_tags
   * 
   * 优先级顺序: Pritzker > Architectural Style (max 1) > Brunch > Cuisine > Experience
   * 
   * @param tags - 结构化 tags 对象
   * @param categorySlug - 分类 slug (e.g. 'restaurant', 'cafe')
   * @param categoryEn - 分类英文名 (e.g. 'Restaurant', 'Cafe')
   * @param entityResolver - 可选的实体解析器，用于获取 person/architect 的名称
   * @returns AITagElement 数组，最多 2 个元素
   */
  async generateAITags(
    tags: StructuredTags | null | undefined,
    categorySlug: string,
    categoryEn: string,
    entityResolver?: (qid: string, type: 'person' | 'architect') => Promise<EntityInfo | null>
  ): Promise<AITagElement[]> {
    if (!tags) {
      return [];
    }

    const candidates: AITagElement[] = [];
    let styleCount = 0;
    let entityCount = 0;

    // 1. 检测 Pritzker (最高优先级 95)
    if (this.hasPritzkerAward(tags)) {
      const pritzkerFacet = await aiFacetDictionaryService.getFacetDefinition('Pritzker');
      if (pritzkerFacet && !this.isDuplicateOfCategory(pritzkerFacet.en, categoryEn)) {
        candidates.push({
          kind: 'facet',
          id: pritzkerFacet.id,
          en: pritzkerFacet.en,
          zh: pritzkerFacet.zh,
          priority: pritzkerFacet.priority,
        });
      }
    }

    // 2. 检测建筑风格 (优先级 70-92, 最多 1 个)
    if (tags.style && tags.style.length > 0 && styleCount < MAX_STYLE_FACETS) {
      const styleFacet = await this.findBestStyleFacet(tags.style, categorySlug, categoryEn);
      if (styleFacet) {
        candidates.push(styleFacet);
        styleCount++;
      }
    }

    // 3. 检测 Brunch (优先级 78)
    if (this.hasBrunch(tags) && BRUNCH_ALLOWED_CATEGORIES.includes(categorySlug)) {
      const brunchFacet = await aiFacetDictionaryService.getFacetDefinition('Brunch');
      if (brunchFacet && !this.isDuplicateOfCategory(brunchFacet.en, categoryEn)) {
        candidates.push({
          kind: 'facet',
          id: brunchFacet.id,
          en: brunchFacet.en,
          zh: brunchFacet.zh,
          priority: brunchFacet.priority,
        });
      }
    }

    // 4. 检测 Cuisine (优先级 54-66)
    if (tags.cuisine && tags.cuisine.length > 0 && CUISINE_ALLOWED_CATEGORIES.includes(categorySlug)) {
      const cuisineFacet = await this.findBestCuisineFacet(tags.cuisine, categorySlug, categoryEn);
      if (cuisineFacet) {
        candidates.push(cuisineFacet);
      }
    }

    // 5. 检测 Theme facets (如 Feminist)
    if (tags.theme && tags.theme.length > 0) {
      const themeFacet = await this.findBestThemeFacet(tags.theme, categorySlug, categoryEn);
      if (themeFacet) {
        candidates.push(themeFacet);
      }
    }

    // 6. 检测 Shop style facets (Vintage, Secondhand, Curated)
    const shopStyleFacet = await this.findShopStyleFacet(tags, categorySlug, categoryEn);
    if (shopStyleFacet && styleCount < MAX_STYLE_FACETS) {
      candidates.push(shopStyleFacet);
      styleCount++;
    }

    // 7. 检测 Architect entity (最多 1 个 entity)
    if (tags.architectQ && tags.architectQ.length > 0 && entityCount < MAX_ENTITIES && entityResolver) {
      const architectEntity = await this.resolveArchitectEntity(tags.architectQ[0], entityResolver, categoryEn);
      if (architectEntity) {
        candidates.push(architectEntity);
        entityCount++;
      }
    }

    // 8. 检测 Person entity (最多 1 个 entity)
    if (tags.personQ && tags.personQ.length > 0 && entityCount < MAX_ENTITIES && entityResolver) {
      const personEntity = await this.resolvePersonEntity(tags.personQ[0], entityResolver, categoryEn);
      if (personEntity) {
        candidates.push(personEntity);
        entityCount++;
      }
    }

    // 按优先级排序并截取前 MAX_AI_TAGS 个
    const sorted = candidates.sort((a, b) => b.priority - a.priority);
    const result = this.deduplicateAndLimit(sorted, MAX_AI_TAGS);

    return result;
  }

  /**
   * 检查 tags 是否包含 Pritzker 奖项
   */
  hasPritzkerAward(tags: StructuredTags): boolean {
    // 检查 award 数组
    if (tags.award?.some(a => a.toLowerCase() === 'pritzker')) {
      return true;
    }
    
    // 检查 architectQ 是否是 Pritzker 获奖者
    if (tags.architectQ && tags.architectQ.length > 0) {
      // 这里需要额外的逻辑来检查 QID 对应的建筑师是否是 Pritzker 获奖者
      // 暂时只检查 award 数组
    }
    
    return false;
  }

  /**
   * 检查 tags 是否包含 brunch
   */
  hasBrunch(tags: StructuredTags): boolean {
    return tags.meal?.some(m => m.toLowerCase() === 'brunch') ?? false;
  }

  /**
   * 检查 en 值是否与 category_en 重复（大小写不敏感）
   */
  isDuplicateOfCategory(en: string, categoryEn: string): boolean {
    return en.toLowerCase() === categoryEn.toLowerCase();
  }

  // ============================================
  // 私有方法
  // ============================================

  /**
   * 查找最佳匹配的 style facet
   */
  private async findBestStyleFacet(
    styles: string[],
    categorySlug: string,
    categoryEn: string
  ): Promise<AITagElement | null> {
    // 获取所有 facet
    const allFacets = await aiFacetDictionaryService.getAllFacets();
    
    // 建筑风格 facet IDs
    const styleFacetIds = [
      'Brutalist', 'Modernist', 'Contemporary', 'Minimalist', 'Industrial',
      'HighTech', 'Postmodern', 'Deconstructivist', 'Bauhaus', 'ArtDeco',
      'ArtNouveau', 'Neoclassical', 'Renaissance', 'Baroque', 'Rococo',
      'Gothic', 'NeoGothic', 'Expressionist', 'Constructivist', 'Islamic',
      'Byzantine', 'Romanesque', 'Vernacular', 'AdaptiveReuse'
    ];

    let bestMatch: FacetDefinition | null = null;

    for (const style of styles) {
      const normalizedStyle = style.toLowerCase().replace(/[^a-z]/g, '');
      
      for (const facetId of styleFacetIds) {
        const facet = allFacets.find(f => f.id === facetId);
        if (!facet) continue;

        // 检查是否允许用于该分类
        const isAllowed = await aiFacetDictionaryService.isFacetAllowedForCategory(facetId, categorySlug);
        if (!isAllowed) continue;

        // 检查是否与 category 重复
        if (this.isDuplicateOfCategory(facet.en, categoryEn)) continue;

        // 匹配检查
        const facetIdLower = facetId.toLowerCase();
        if (normalizedStyle.includes(facetIdLower) || facetIdLower.includes(normalizedStyle)) {
          if (!bestMatch || facet.priority > bestMatch.priority) {
            bestMatch = facet;
          }
        }
      }
    }

    if (bestMatch) {
      return {
        kind: 'facet',
        id: bestMatch.id,
        en: bestMatch.en,
        zh: bestMatch.zh,
        priority: bestMatch.priority,
      };
    }

    return null;
  }

  /**
   * 查找最佳匹配的 cuisine facet
   */
  private async findBestCuisineFacet(
    cuisines: string[],
    categorySlug: string,
    categoryEn: string
  ): Promise<AITagElement | null> {
    const cuisineFacetIds = [
      'Japanese', 'Korean', 'Vietnamese', 'Thai', 'Chinese',
      'Italian', 'French', 'Spanish', 'Indian', 'Mexican',
      'MiddleEastern', 'Seafood', 'BBQ'
    ];

    let bestMatch: FacetDefinition | null = null;

    for (const cuisine of cuisines) {
      const normalizedCuisine = cuisine.toLowerCase();
      
      for (const facetId of cuisineFacetIds) {
        const facet = await aiFacetDictionaryService.getFacetDefinition(facetId);
        if (!facet) continue;

        // 检查是否允许用于该分类
        const isAllowed = await aiFacetDictionaryService.isFacetAllowedForCategory(facetId, categorySlug);
        if (!isAllowed) continue;

        // 检查是否与 category 重复
        if (this.isDuplicateOfCategory(facet.en, categoryEn)) continue;

        // 匹配检查
        if (normalizedCuisine.includes(facetId.toLowerCase()) || 
            facetId.toLowerCase().includes(normalizedCuisine)) {
          if (!bestMatch || facet.priority > bestMatch.priority) {
            bestMatch = facet;
          }
        }
      }
    }

    if (bestMatch) {
      return {
        kind: 'facet',
        id: bestMatch.id,
        en: bestMatch.en,
        zh: bestMatch.zh,
        priority: bestMatch.priority,
      };
    }

    return null;
  }

  /**
   * 查找最佳匹配的 theme facet
   */
  private async findBestThemeFacet(
    themes: string[],
    categorySlug: string,
    categoryEn: string
  ): Promise<AITagElement | null> {
    const themeFacetMap: Record<string, string> = {
      'feminism': 'Feminist',
      'feminist': 'Feminist',
    };

    for (const theme of themes) {
      const normalizedTheme = theme.toLowerCase();
      const facetId = themeFacetMap[normalizedTheme];
      
      if (facetId) {
        const facet = await aiFacetDictionaryService.getFacetDefinition(facetId);
        if (facet && !this.isDuplicateOfCategory(facet.en, categoryEn)) {
          const isAllowed = await aiFacetDictionaryService.isFacetAllowedForCategory(facetId, categorySlug);
          if (isAllowed) {
            return {
              kind: 'facet',
              id: facet.id,
              en: facet.en,
              zh: facet.zh,
              priority: facet.priority,
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * 查找 shop style facet (Vintage, Secondhand, Curated)
   */
  private async findShopStyleFacet(
    tags: StructuredTags,
    categorySlug: string,
    categoryEn: string
  ): Promise<AITagElement | null> {
    const shopStyleFacets = ['Vintage', 'Secondhand', 'Curated'];
    
    // 检查 style 数组中是否有匹配
    if (tags.style) {
      for (const style of tags.style) {
        const normalizedStyle = style.toLowerCase();
        
        for (const facetId of shopStyleFacets) {
          if (normalizedStyle.includes(facetId.toLowerCase())) {
            const facet = await aiFacetDictionaryService.getFacetDefinition(facetId);
            if (facet && !this.isDuplicateOfCategory(facet.en, categoryEn)) {
              const isAllowed = await aiFacetDictionaryService.isFacetAllowedForCategory(facetId, categorySlug);
              if (isAllowed) {
                return {
                  kind: 'facet',
                  id: facet.id,
                  en: facet.en,
                  zh: facet.zh,
                  priority: facet.priority,
                };
              }
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * 解析 architect entity
   */
  private async resolveArchitectEntity(
    qid: string,
    entityResolver: (qid: string, type: 'person' | 'architect') => Promise<EntityInfo | null>,
    categoryEn: string
  ): Promise<AITagElement | null> {
    try {
      const entity = await entityResolver(qid, 'architect');
      if (entity && !this.isDuplicateOfCategory(entity.en, categoryEn)) {
        return {
          kind: 'architect',
          id: entity.qid,
          en: entity.en,
          zh: entity.zh,
          priority: 50, // 默认优先级
        };
      }
    } catch (error) {
      console.error(`Failed to resolve architect entity ${qid}:`, error);
    }
    return null;
  }

  /**
   * 解析 person entity
   */
  private async resolvePersonEntity(
    qid: string,
    entityResolver: (qid: string, type: 'person' | 'architect') => Promise<EntityInfo | null>,
    categoryEn: string
  ): Promise<AITagElement | null> {
    try {
      const entity = await entityResolver(qid, 'person');
      if (entity && !this.isDuplicateOfCategory(entity.en, categoryEn)) {
        return {
          kind: 'person',
          id: entity.qid,
          en: entity.en,
          zh: entity.zh,
          priority: 50, // 默认优先级
        };
      }
    } catch (error) {
      console.error(`Failed to resolve person entity ${qid}:`, error);
    }
    return null;
  }

  /**
   * 去重并限制数量
   * - 按 kind+id 去重
   * - 限制最多 MAX_AI_TAGS 个
   */
  private deduplicateAndLimit(tags: AITagElement[], limit: number): AITagElement[] {
    const seen = new Set<string>();
    const result: AITagElement[] = [];

    for (const tag of tags) {
      const key = `${tag.kind}:${tag.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(tag);
        if (result.length >= limit) {
          break;
        }
      }
    }

    return result;
  }
}

// 导出单例
export const aiTagsGeneratorService = new AITagsGeneratorService();
export default aiTagsGeneratorService;
