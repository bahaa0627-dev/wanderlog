/**
 * Display Tags Service
 * 
 * 计算 C 端用户可见的展示标签
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.5, 5.6
 * 
 * 规则:
 * - Display Tags = category + ai_tags 的并集
 * - 最多 3 个标签
 * - Category 始终排在第一位
 * - ai_tags 按 priority 降序排列
 * - 支持中英文切换
 */

import { AITagElement } from './aiTagsGeneratorService';

// ============================================
// 常量定义
// ============================================

/** 最大展示标签数量 */
const MAX_DISPLAY_TAGS = 3;

// ============================================
// 类型定义
// ============================================

/** 支持的语言类型 */
export type DisplayLanguage = 'en' | 'zh';

/** Display Tags 计算结果 */
export interface DisplayTagsResult {
  /** 展示标签数组 */
  tags: string[];
  /** 使用的语言 */
  language: DisplayLanguage;
}

// ============================================
// Display Tags Service
// ============================================

class DisplayTagsService {
  /**
   * 计算 C 端展示标签
   * 
   * @param categoryEn - 分类英文名 (e.g. 'Museum', 'Cafe')
   * @param categoryZh - 分类中文名 (e.g. '博物馆', '咖啡店')
   * @param aiTags - AI 生成的展示标签数组
   * @param language - 目标语言 ('en' | 'zh')
   * @returns 展示标签字符串数组，最多 3 个
   * 
   * @example
   * // 英文展示
   * computeDisplayTags('Museum', '博物馆', [{kind: 'facet', id: 'Pritzker', en: 'Pritzker', zh: '普利兹克', priority: 95}], 'en')
   * // => ['Museum', 'Pritzker']
   * 
   * @example
   * // 中文展示
   * computeDisplayTags('Museum', '博物馆', [{kind: 'facet', id: 'Pritzker', en: 'Pritzker', zh: '普利兹克', priority: 95}], 'zh')
   * // => ['博物馆', '普利兹克']
   */
  computeDisplayTags(
    categoryEn: string | null | undefined,
    categoryZh: string | null | undefined,
    aiTags: AITagElement[] | null | undefined,
    language: DisplayLanguage
  ): string[] {
    const result: string[] = [];

    // 1. 首先添加 category (始终排在第一位)
    const categoryValue = language === 'en' ? categoryEn : categoryZh;
    if (categoryValue && categoryValue.trim()) {
      result.push(categoryValue.trim());
    }

    // 2. 如果没有 ai_tags，直接返回
    if (!aiTags || !Array.isArray(aiTags) || aiTags.length === 0) {
      return result;
    }

    // 3. 过滤有效的 ai_tags 并按 priority 降序排序
    const validTags = aiTags
      .filter(tag => this.isValidAITagElement(tag))
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    // 4. 添加 ai_tags（总共最多 MAX_DISPLAY_TAGS 个）
    for (const tag of validTags) {
      if (result.length >= MAX_DISPLAY_TAGS) {
        break;
      }

      const tagValue = language === 'en' ? tag.en : tag.zh;
      if (tagValue && tagValue.trim()) {
        // 避免重复（与 category 或已添加的标签重复）
        const normalizedValue = tagValue.trim().toLowerCase();
        const isDuplicate = result.some(
          existing => existing.toLowerCase() === normalizedValue
        );
        
        if (!isDuplicate) {
          result.push(tagValue.trim());
        }
      }
    }

    return result;
  }

  /**
   * 同时计算中英文展示标签
   * 
   * @param categoryEn - 分类英文名
   * @param categoryZh - 分类中文名
   * @param aiTags - AI 生成的展示标签数组
   * @returns 包含中英文展示标签的对象
   */
  computeDisplayTagsBilingual(
    categoryEn: string | null | undefined,
    categoryZh: string | null | undefined,
    aiTags: AITagElement[] | null | undefined
  ): { display_tags_en: string[]; display_tags_zh: string[] } {
    return {
      display_tags_en: this.computeDisplayTags(categoryEn, categoryZh, aiTags, 'en'),
      display_tags_zh: this.computeDisplayTags(categoryEn, categoryZh, aiTags, 'zh'),
    };
  }

  /**
   * 验证 AITagElement 是否有效
   */
  private isValidAITagElement(element: unknown): element is AITagElement {
    if (typeof element !== 'object' || element === null) {
      return false;
    }

    const e = element as Record<string, unknown>;
    
    return (
      typeof e.kind === 'string' &&
      ['facet', 'person', 'architect'].includes(e.kind) &&
      typeof e.id === 'string' &&
      typeof e.en === 'string' &&
      typeof e.zh === 'string' &&
      (typeof e.priority === 'number' || e.priority === undefined)
    );
  }
}

// 导出单例
export const displayTagsService = new DisplayTagsService();
export default displayTagsService;
