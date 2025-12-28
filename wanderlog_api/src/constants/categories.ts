/**
 * Category & Tags Normalization Constants
 * 分类和标签归一化常量定义
 * 
 * 基于 Categories.csv 和 Tags.csv 规则表
 */

// ============================================
// 主分类定义 (18 个)
// ============================================

export interface CategoryDefinition {
  slug: string;
  en: string;
  zh: string;
  googleTypes: string[];
  googleKeywords: string[];
  osmTags: string[];
  wikidataP31: string[];
  fsqKeywords: string[];
  defaultTags: string[];
}

export const CATEGORIES: Record<string, CategoryDefinition> = {
  landmark: {
    slug: 'landmark',
    en: 'Landmark',
    zh: '地标',
    googleTypes: ['tourist_attraction', 'cultural_landmark', 'historical_landmark', 'historical_place', 'landmark'],
    googleKeywords: ['landmark', 'must see', 'viewpoint', 'scenic', 'attraction'],
    osmTags: ['tourism=attraction', 'tourism=viewpoint', 'historic=*', 'man_made=*'],
    wikidataP31: ['tourist attraction', 'monument', 'landmark', 'viewpoint'],
    fsqKeywords: ['Landmark', 'Historic Site', 'Scenic Lookout', 'Tourist Attraction'],
    defaultTags: [],
  },
  museum: {
    slug: 'museum',
    en: 'Museum',
    zh: '博物馆',
    googleTypes: ['museum'],
    googleKeywords: ['museum', 'history museum', 'science museum', 'heritage museum'],
    osmTags: ['tourism=museum'],
    wikidataP31: ['museum'],
    fsqKeywords: ['Museum', 'History Museum', 'Science Museum'],
    defaultTags: [],
  },
  art_gallery: {
    slug: 'art_gallery',
    en: 'Gallery',
    zh: '美术馆',
    googleTypes: ['art_gallery', 'museum'],
    googleKeywords: ['art gallery', 'gallery', 'contemporary art', 'art museum'],
    osmTags: ['tourism=gallery'],
    wikidataP31: ['art museum', 'art gallery'],
    fsqKeywords: ['Art Museum', 'Art Gallery'],
    defaultTags: [],
  },
  shopping_mall: {
    slug: 'shopping_mall',
    en: 'Shopping',
    zh: '商场',
    googleTypes: ['shopping_mall', 'department_store'],
    googleKeywords: ['shopping mall', 'mall', 'department store', 'shopping center'],
    osmTags: ['shop=mall', 'shop=department_store'],
    wikidataP31: ['shopping mall', 'department store'],
    fsqKeywords: ['Shopping Mall', 'Department Store'],
    defaultTags: [],
  },
  cafe: {
    slug: 'cafe',
    en: 'Cafe',
    zh: '咖啡店',
    googleTypes: ['cafe', 'coffee_shop'],
    googleKeywords: ['cafe', 'coffee', 'specialty coffee', 'espresso bar', 'coffee roaster'],
    osmTags: ['amenity=cafe'],
    wikidataP31: ['café', 'coffeehouse'],
    fsqKeywords: ['Coffee Shop', 'Café'],
    defaultTags: [],
  },
  bakery: {
    slug: 'bakery',
    en: 'Bakery',
    zh: '面包店',
    googleTypes: ['bakery'],
    googleKeywords: ['bakery', 'patisserie', 'pastry', 'boulangerie'],
    osmTags: ['shop=bakery', 'shop=pastry'],
    wikidataP31: ['bakery', 'pâtisserie'],
    fsqKeywords: ['Bakery', 'Patisserie'],
    defaultTags: [],
  },
  restaurant: {
    slug: 'restaurant',
    en: 'Restaurant',
    zh: '餐馆',
    googleTypes: ['restaurant'],
    googleKeywords: ['restaurant', 'dining', 'bistro', 'izakaya', 'eatery'],
    osmTags: ['amenity=restaurant'],
    wikidataP31: ['restaurant'],
    fsqKeywords: ['Restaurant'],
    defaultTags: [],
  },
  bar: {
    slug: 'bar',
    en: 'Bar',
    zh: '酒吧',
    googleTypes: ['bar', 'wine_bar', 'cocktail_bar'],
    googleKeywords: ['bar', 'cocktail', 'wine bar', 'taproom'],
    osmTags: ['amenity=bar', 'amenity=pub'],
    wikidataP31: ['bar', 'pub'],
    fsqKeywords: ['Bar', 'Cocktail Bar', 'Wine Bar', 'Pub'],
    defaultTags: [],
  },
  hotel: {
    slug: 'hotel',
    en: 'Hotel',
    zh: '酒店',
    googleTypes: ['hotel', 'lodging'],
    googleKeywords: ['hotel', 'design hotel', 'boutique hotel', 'hostel'],
    osmTags: ['tourism=hotel', 'tourism=guest_house', 'tourism=hostel'],
    wikidataP31: ['hotel', 'hostel'],
    fsqKeywords: ['Hotel', 'Boutique Hotel', 'Hostel'],
    defaultTags: [],
  },
  church: {
    slug: 'church',
    en: 'Church',
    zh: '教堂',
    googleTypes: ['church'],
    googleKeywords: ['church', 'cathedral', 'basilica', 'chapel'],
    // OSM: building=church OR (amenity=place_of_worship + religion=christian)
    osmTags: ['building=church', 'amenity=place_of_worship+religion=christian'],
    wikidataP31: ['church', 'cathedral', 'basilica'],
    fsqKeywords: ['Church', 'Cathedral'],
    defaultTags: ['typology:church'],
  },
  library: {
    slug: 'library',
    en: 'Library',
    zh: '图书馆',
    googleTypes: ['library'],
    googleKeywords: ['library', 'public library', 'reading room'],
    osmTags: ['amenity=library'],
    wikidataP31: ['library'],
    fsqKeywords: ['Library'],
    defaultTags: [],
  },
  bookstore: {
    slug: 'bookstore',
    en: 'Bookstore',
    zh: '书店',
    googleTypes: ['book_store'],
    googleKeywords: ['bookstore', 'indie bookstore', 'book shop'],
    osmTags: ['shop=books'],
    wikidataP31: ['bookstore'],
    fsqKeywords: ['Bookstore'],
    defaultTags: [],
  },
  cemetery: {
    slug: 'cemetery',
    en: 'Cemetery',
    zh: '墓园',
    googleTypes: ['cemetery'],
    googleKeywords: ['cemetery', 'graveyard', 'memorial cemetery'],
    osmTags: ['landuse=cemetery', 'amenity=grave_yard'],
    wikidataP31: ['cemetery', 'graveyard'],
    fsqKeywords: ['Cemetery', 'Graveyard'],
    defaultTags: ['typology:cemetery'],
  },
  park: {
    slug: 'park',
    en: 'Park',
    zh: '公园',
    googleTypes: ['park'],
    googleKeywords: ['park', 'garden', 'botanical garden', 'public garden'],
    osmTags: ['leisure=park', 'leisure=garden'],
    wikidataP31: ['park', 'garden'],
    fsqKeywords: ['Park', 'Garden'],
    defaultTags: [],
  },
  castle: {
    slug: 'castle',
    en: 'Castle',
    zh: '城堡',
    googleTypes: ['tourist_attraction', 'historical_landmark', 'landmark'],
    googleKeywords: ['castle', 'palace', 'fortress', 'chateau', 'schloss'],
    osmTags: ['historic=castle', 'historic=palace', 'historic=fort'],
    wikidataP31: ['castle', 'palace', 'fortress'],
    fsqKeywords: ['Castle', 'Palace', 'Fortress'],
    defaultTags: ['typology:castle'],
  },
  market: {
    slug: 'market',
    en: 'Market',
    zh: '市集',
    googleTypes: ['market', 'farmers_market'],
    googleKeywords: ['market', 'marketplace', 'food market', 'farmers market'],
    osmTags: ['amenity=marketplace'],
    wikidataP31: ['market', 'marketplace'],
    fsqKeywords: ['Market', 'Farmers Market', 'Food Market'],
    defaultTags: [],
  },
  shop: {
    slug: 'shop',
    en: 'Shop',
    zh: '商店',
    googleTypes: ['store', 'shopping', 'gift_shop', 'clothing_store'],
    googleKeywords: ['concept store', 'design shop', 'gift shop', 'store'],
    osmTags: ['shop=*'],
    wikidataP31: ['shop', 'store', 'retail'],
    fsqKeywords: ['Shop', 'Store', 'Retail'],
    defaultTags: [],
  },
  yarn_store: {
    slug: 'yarn_store',
    en: 'Yarn',
    zh: '毛线店',
    googleTypes: [],
    googleKeywords: ['yarn store', 'wool shop', 'knitting', 'haberdashery', 'merceria'],
    osmTags: ['shop=wool', 'craft=knitting', 'shop=haberdashery'],
    wikidataP31: ['shop', 'craft store'],
    fsqKeywords: ['Yarn', 'Knitting', 'Craft Store'],
    defaultTags: ['craft:yarn'],
  },
  thrift_store: {
    slug: 'thrift_store',
    en: 'Thrift',
    zh: '二手店',
    googleTypes: [],
    googleKeywords: ['thrift store', 'second hand', 'resale', 'charity shop'],
    osmTags: ['shop=second_hand', 'second_hand=*'],
    wikidataP31: ['second-hand shop'],
    fsqKeywords: ['Thrift', 'Secondhand', 'Resale'],
    defaultTags: ['shop:secondhand'],
  },
};

// 分类 slug 列表
export const CATEGORY_SLUGS = Object.keys(CATEGORIES) as Array<keyof typeof CATEGORIES>;

// slug -> 英文名映射
export const CATEGORY_DISPLAY_NAMES: Record<string, string> = Object.fromEntries(
  Object.values(CATEGORIES).map(c => [c.slug, c.en])
);

// slug -> 中文名映射
export const CATEGORY_ZH_NAMES: Record<string, string> = Object.fromEntries(
  Object.values(CATEGORIES).map(c => [c.slug, c.zh])
);


// ============================================
// 分类优先级（用于多分类冲突时选择）
// ============================================

// 特定分类优先于通用分类
export const CATEGORY_PRIORITY: string[] = [
  'art_gallery',    // 美术馆优先于博物馆
  'museum',
  'castle',         // 城堡优先于地标
  'church',
  'library',
  'cemetery',
  'park',
  'cafe',
  'bakery',
  'restaurant',
  'bar',
  'hotel',
  'bookstore',
  'yarn_store',
  'thrift_store',
  'market',
  'shopping_mall',
  'shop',
  'landmark',       // 地标作为兜底
];

// ============================================
// 分类特定的 mapping_priority 配置
// ============================================

// 默认优先级顺序
export const DEFAULT_MAPPING_PRIORITY: Array<'google_types' | 'osm_tags' | 'wikidata_p31' | 'fsq_category' | 'keywords'> = [
  'google_types',
  'osm_tags',
  'wikidata_p31',
  'fsq_category',
  'keywords',
];

// 特殊分类的自定义优先级（基于 Categories.csv 的 mapping_priority 列）
export const CATEGORY_PRIORITY_OVERRIDES: Record<string, Array<'google_types' | 'osm_tags' | 'wikidata_p31' | 'fsq_category' | 'keywords'>> = {
  // castle: OSM 和关键词优先于 Google（因为 Google 常返回 tourist_attraction）
  // CSV: osm_tags>keywords>wikidata_p31>google_types>fsq_category
  castle: ['osm_tags', 'keywords', 'wikidata_p31', 'google_types', 'fsq_category'],
  
  // yarn_store: OSM 和关键词优先（Google 没有专门类型）
  // CSV: osm_tags>keywords>fsq_category>google_types
  yarn_store: ['osm_tags', 'keywords', 'fsq_category', 'google_types', 'wikidata_p31'],
  
  // thrift_store: OSM 和关键词优先（Google 没有专门类型）
  // CSV: osm_tags>keywords>fsq_category>google_types
  thrift_store: ['osm_tags', 'keywords', 'fsq_category', 'google_types', 'wikidata_p31'],
  
  // shopping_mall: Google 优先，Wikidata 最后
  // CSV: google_types>osm_tags>fsq_category>keywords>wikidata_p31
  shopping_mall: ['google_types', 'osm_tags', 'fsq_category', 'keywords', 'wikidata_p31'],
  
  // cafe: Google 优先，Wikidata 最后
  // CSV: google_types>osm_tags>fsq_category>keywords>wikidata_p31
  cafe: ['google_types', 'osm_tags', 'fsq_category', 'keywords', 'wikidata_p31'],
  
  // bakery: Google 优先，Wikidata 最后
  // CSV: google_types>osm_tags>fsq_category>keywords>wikidata_p31
  bakery: ['google_types', 'osm_tags', 'fsq_category', 'keywords', 'wikidata_p31'],
  
  // bookstore: Google 优先，Wikidata 最后
  // CSV: google_types>osm_tags>fsq_category>keywords>wikidata_p31
  bookstore: ['google_types', 'osm_tags', 'fsq_category', 'keywords', 'wikidata_p31'],
};

/**
 * 获取分类的 mapping_priority
 */
export function getCategoryMappingPriority(slug: string): Array<'google_types' | 'osm_tags' | 'wikidata_p31' | 'fsq_category' | 'keywords'> {
  return CATEGORY_PRIORITY_OVERRIDES[slug] || DEFAULT_MAPPING_PRIORITY;
}

// ============================================
// 分类排除规则
// ============================================

// landmark 的排除列表：如果已匹配这些分类，则不应再匹配 landmark
export const LANDMARK_EXCLUSION_LIST: string[] = [
  'museum', 'art_gallery', 'library', 'park', 'shopping_mall',
  'cafe', 'bakery', 'restaurant', 'bar', 'hotel', 'church',
  'castle', 'cemetery', 'market', 'bookstore', 'yarn_store', 'thrift_store'
];

// shop 的排除列表：如果已匹配这些分类，则不应再匹配 shop
export const SHOP_EXCLUSION_LIST: string[] = [
  'shopping_mall', 'yarn_store', 'thrift_store', 'bookstore',
  'bakery', 'cafe', 'restaurant', 'bar', 'market'
];

/**
 * 检查是否应该排除某个分类
 */
export function shouldExcludeCategory(candidateSlug: string, alreadyMatched: string[]): boolean {
  if (candidateSlug === 'landmark') {
    return alreadyMatched.some(m => LANDMARK_EXCLUSION_LIST.includes(m));
  }
  if (candidateSlug === 'shop') {
    return alreadyMatched.some(m => SHOP_EXCLUSION_LIST.includes(m));
  }
  return false;
}

// ============================================
// 旧分类到新分类的迁移映射
// ============================================

export interface MigrationMapping {
  slug: string;
  tags?: string[];
}

export const CATEGORY_MIGRATION_MAP: Record<string, MigrationMapping> = {
  // 直接映射（旧分类名 -> 新 slug）
  'cafe': { slug: 'cafe' },
  'coffee': { slug: 'cafe' },
  'Coffee': { slug: 'cafe' },
  'Cafe': { slug: 'cafe' },
  'museum': { slug: 'museum' },
  'Museum': { slug: 'museum' },
  'art_gallery': { slug: 'art_gallery' },
  'gallery': { slug: 'art_gallery' },
  'Gallery': { slug: 'art_gallery' },
  'Art Gallery': { slug: 'art_gallery' },
  'restaurant': { slug: 'restaurant' },
  'Restaurant': { slug: 'restaurant' },
  'bar': { slug: 'bar' },
  'Bar': { slug: 'bar' },
  'hotel': { slug: 'hotel' },
  'Hotel': { slug: 'hotel' },
  'church': { slug: 'church' },
  'Church': { slug: 'church' },
  'library': { slug: 'library' },
  'Library': { slug: 'library' },
  'bookstore': { slug: 'bookstore' },
  'Bookstore': { slug: 'bookstore' },
  'book_store': { slug: 'bookstore' },
  'park': { slug: 'park' },
  'Park': { slug: 'park' },
  'shopping': { slug: 'shopping_mall' },
  'Shopping': { slug: 'shopping_mall' },
  'shopping_mall': { slug: 'shopping_mall' },
  'market': { slug: 'market' },
  'Market': { slug: 'market' },
  'shop': { slug: 'shop' },
  'Shop': { slug: 'shop' },
  'store': { slug: 'shop' },
  'Store': { slug: 'shop' },
  'cemetery': { slug: 'cemetery' },
  'Cemetery': { slug: 'cemetery' },
  'castle': { slug: 'castle' },
  'Castle': { slug: 'castle' },
  'landmark': { slug: 'landmark' },
  'Landmark': { slug: 'landmark' },
  'attraction': { slug: 'landmark' },
  'Attraction': { slug: 'landmark' },
  'tourist_attraction': { slug: 'landmark' },
  
  // 迁移到标签（旧分类 -> 新 slug + 标签）
  'brunch': { slug: 'restaurant', tags: ['meal:brunch'] },
  'Brunch': { slug: 'restaurant', tags: ['meal:brunch'] },
  'vintage': { slug: 'shop', tags: ['style:vintage'] },
  'Vintage': { slug: 'shop', tags: ['style:vintage'] },
  'architecture': { slug: 'landmark', tags: ['domain:architecture'] },
  'Architecture': { slug: 'landmark', tags: ['domain:architecture'] },
  'architecture_work': { slug: 'landmark', tags: ['domain:architecture'] },
  'feminist': { slug: 'bookstore', tags: ['theme:feminism'] },
  'Feminist': { slug: 'bookstore', tags: ['theme:feminism'] },
  'feminism': { slug: 'bookstore', tags: ['theme:feminism'] },
  'secondhand': { slug: 'thrift_store', tags: ['shop:secondhand'] },
  'Secondhand': { slug: 'thrift_store', tags: ['shop:secondhand'] },
  'thrift': { slug: 'thrift_store' },
  'Thrift': { slug: 'thrift_store' },
  'yarn': { slug: 'yarn_store' },
  'Yarn': { slug: 'yarn_store' },
  'bakery': { slug: 'bakery' },
  'Bakery': { slug: 'bakery' },
};

// ============================================
// 标签规则定义
// ============================================

export interface TagRule {
  key: string;
  valueFormat: string;
  googleTypes: string[];
  googleKeywords: string[];
  osmTags: string[];
  wikidataHint: string;
  fsqHint: string[];
  applyWhen: string;
}

export const TAG_RULES: TagRule[] = [
  {
    key: 'domain:architecture',
    valueFormat: 'domain:architecture',
    googleTypes: [],
    googleKeywords: ['architecture', 'brutalist', 'modern architecture', 'signature building'],
    osmTags: ['architect:wikidata=*', 'building=*', 'wikidata=*'],
    wikidataHint: 'has P84 (architect) OR P149 (architectural style)',
    fsqHint: ['Architecture', 'Landmark', 'Historic'],
    applyWhen: 'wikidata has P84/P149 OR osm has architect:wikidata OR keywords indicate architecture',
  },
  {
    key: 'architect:',
    valueFormat: 'architect:<Full Name>',
    googleTypes: [],
    googleKeywords: [],
    osmTags: ['architect=*', 'architect:wikidata=*'],
    wikidataHint: 'P84 architect label',
    fsqHint: [],
    applyWhen: 'can extract architect name from wikidata/osm',
  },
  {
    key: 'style:',
    valueFormat: 'style:<Style Name>',
    googleTypes: [],
    googleKeywords: ['brutalism', 'modernism', 'art nouveau', 'expressionism'],
    osmTags: [],
    wikidataHint: 'P149 architectural style label',
    fsqHint: [],
    applyWhen: 'can extract style from wikidata P149 OR infer from keywords',
  },
  {
    key: 'pritzker',
    valueFormat: 'pritzker',
    googleTypes: [],
    googleKeywords: ['pritzker'],
    osmTags: [],
    wikidataHint: 'architect has award P166=Pritzker',
    fsqHint: [],
    applyWhen: 'architect is in Pritzker architect set',
  },
  {
    key: 'theme:feminism',
    valueFormat: 'theme:feminism',
    googleTypes: [],
    googleKeywords: ['feminist', "women's", 'gender equality', "women's rights", "women's center", 'feminist bookstore', "women's museum"],
    osmTags: [],
    wikidataHint: "women's museum; women's organization; gender equality",
    fsqHint: ["Women's", 'Feminist', 'Community Center'],
    applyWhen: 'keywords/theme hit OR wikidata topic hit OR curated list hit',
  },
  {
    key: 'meal:brunch',
    valueFormat: 'meal:brunch',
    googleTypes: ['brunch_restaurant', 'breakfast_restaurant'],
    googleKeywords: ['brunch', 'all day breakfast'],
    osmTags: ['cuisine=brunch', 'breakfast:brunch=*'],
    wikidataHint: '',
    fsqHint: ['Brunch', 'Breakfast'],
    applyWhen: 'google type indicates OR fsq indicates brunch OR keywords/osm tags indicate',
  },
  {
    key: 'style:vintage',
    valueFormat: 'style:vintage',
    googleTypes: [],
    googleKeywords: ['vintage', 'consignment', 'antique clothing'],
    osmTags: ['clothes=vintage'],
    wikidataHint: '',
    fsqHint: ['Vintage', 'Consignment'],
    applyWhen: 'keywords/osm/fsq indicates vintage',
  },
  {
    key: 'shop:secondhand',
    valueFormat: 'shop:secondhand',
    googleTypes: [],
    googleKeywords: ['second hand', 'thrift', 'resale', 'charity shop'],
    osmTags: ['shop=second_hand', 'second_hand=*'],
    wikidataHint: 'second-hand shop',
    fsqHint: ['Thrift', 'Secondhand', 'Resale'],
    applyWhen: 'second-hand signals hit',
  },
];

// ============================================
// 辅助函数
// ============================================

/**
 * 根据 slug 获取分类定义
 */
export function getCategoryBySlug(slug: string): CategoryDefinition | undefined {
  return CATEGORIES[slug];
}

/**
 * 根据 slug 获取英文展示名
 */
export function getCategoryDisplayName(slug: string): string {
  return CATEGORY_DISPLAY_NAMES[slug] || slug;
}

/**
 * 检查是否为有效的分类 slug
 */
export function isValidCategorySlug(slug: string): boolean {
  return slug in CATEGORIES;
}

/**
 * 获取迁移映射
 */
export function getMigrationMapping(oldCategory: string): MigrationMapping | undefined {
  return CATEGORY_MIGRATION_MAP[oldCategory] || CATEGORY_MIGRATION_MAP[oldCategory.toLowerCase()];
}
