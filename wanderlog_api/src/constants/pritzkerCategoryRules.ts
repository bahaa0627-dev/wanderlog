/**
 * Pritzker Architecture Import Category Rules
 * 普利兹克建筑作品分类规则
 * 
 * Category classification rules for importing Pritzker Prize architect works.
 * Based on work name keywords to determine the appropriate category.
 */

// ============================================================================
// Category Rule Definition
// ============================================================================

/**
 * Category rule for classifying buildings based on work name keywords
 */
export interface CategoryRule {
  /** Keywords to match in work name (case-insensitive) */
  keywords: string[];
  /** Category slug */
  category: string;
  /** Category slug (same as category for consistency) */
  categorySlug: string;
  /** English category name */
  categoryEn: string;
  /** Chinese category name */
  categoryZh: string;
}

// ============================================================================
// Category Rules Array
// ============================================================================

/**
 * Category classification rules based on work name keywords
 * Order matters: more specific categories should come before generic ones
 * 
 * Requirements: 4.1, 4.2
 */
export const CATEGORY_RULES: CategoryRule[] = [
  {
    keywords: ['Museum', 'Gallery', 'Art'],
    category: 'museum',
    categorySlug: 'museum',
    categoryEn: 'Museum',
    categoryZh: '博物馆',
  },
  {
    keywords: ['Church', 'Cathedral', 'Chapel', 'Basilica'],
    category: 'church',
    categorySlug: 'church',
    categoryEn: 'Church',
    categoryZh: '教堂',
  },
  {
    keywords: ['University', 'School', 'College', 'Campus', 'Institute'],
    category: 'university',
    categorySlug: 'university',
    categoryEn: 'University',
    categoryZh: '大学',
  },
  {
    keywords: ['Library'],
    category: 'library',
    categorySlug: 'library',
    categoryEn: 'Library',
    categoryZh: '图书馆',
  },
  {
    keywords: ['Stadium', 'Arena', 'Gymnasium', 'Sports'],
    category: 'stadium',
    categorySlug: 'stadium',
    categoryEn: 'Stadium',
    categoryZh: '体育场',
  },
  {
    keywords: ['Theater', 'Theatre', 'Opera', 'Concert'],
    category: 'theater',
    categorySlug: 'theater',
    categoryEn: 'Theater',
    categoryZh: '剧院',
  },
  {
    keywords: ['Hospital', 'Medical', 'Clinic'],
    category: 'hospital',
    categorySlug: 'hospital',
    categoryEn: 'Hospital',
    categoryZh: '医院',
  },
  {
    keywords: ['Station', 'Terminal', 'Airport'],
    category: 'station',
    categorySlug: 'station',
    categoryEn: 'Station',
    categoryZh: '车站',
  },
  {
    keywords: ['Pavilion'],
    category: 'pavilion',
    categorySlug: 'pavilion',
    categoryEn: 'Pavilion',
    categoryZh: '展亭',
  },
  {
    keywords: ['Tower', 'Building', 'Center', 'Centre', 'Headquarters'],
    category: 'building',
    categorySlug: 'building',
    categoryEn: 'Building',
    categoryZh: '建筑',
  },
];

// ============================================================================
// Default Category
// ============================================================================

/**
 * Default category when no keywords match
 * Used as fallback for buildings that don't match any specific category
 * 
 * Requirements: 4.2
 */
export const DEFAULT_CATEGORY: Omit<CategoryRule, 'keywords'> = {
  category: 'architecture',
  categorySlug: 'architecture',
  categoryEn: 'Architecture',
  categoryZh: '建筑',
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Classify a building based on its work label
 * @param workLabel The name/label of the building work
 * @returns Category information matching the work label
 */
export function classifyByWorkLabel(workLabel: string): Omit<CategoryRule, 'keywords'> {
  if (!workLabel) {
    return DEFAULT_CATEGORY;
  }

  const lowerLabel = workLabel.toLowerCase();

  for (const rule of CATEGORY_RULES) {
    for (const keyword of rule.keywords) {
      if (lowerLabel.includes(keyword.toLowerCase())) {
        return {
          category: rule.category,
          categorySlug: rule.categorySlug,
          categoryEn: rule.categoryEn,
          categoryZh: rule.categoryZh,
        };
      }
    }
  }

  return DEFAULT_CATEGORY;
}

/**
 * Get all category slugs defined in the rules
 * @returns Array of category slugs
 */
export function getAllCategorySlugs(): string[] {
  const slugs = CATEGORY_RULES.map(rule => rule.categorySlug);
  slugs.push(DEFAULT_CATEGORY.categorySlug);
  return [...new Set(slugs)];
}

/**
 * Check if a category slug is valid
 * @param slug Category slug to check
 * @returns Whether the slug is valid
 */
export function isValidCategorySlug(slug: string): boolean {
  return getAllCategorySlugs().includes(slug);
}
