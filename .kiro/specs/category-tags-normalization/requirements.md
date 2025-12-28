# Requirements Document

## Introduction

本功能旨在重构 Wanderlog 的分类（Category）和标签（Tags）系统，以支持多数据源（Google Maps、Apify、Wikidata、OSM、Foursquare）的数据导入和去重合并。核心目标是建立一套可维护、可扩展的分类规则引擎，确保数据一致性和长期可控性。

## Glossary

- **Place**: 地点实体，存储在 `places` 表中的核心数据模型
- **Category_Slug**: 主分类的机器键，使用 snake_case 格式（如 `cafe`、`museum`）
- **Category_En**: 主分类的英文展示名（如 `Cafe`、`Gallery`）
- **Tags**: 标签数组，用于存储主题、属性、风格等附加信息
- **Alt_Category**: 备选分类标签，当地点同时匹配多个主分类时使用
- **Source**: 数据来源标识（如 `google_maps`、`osm`、`wikidata`、`apify`）
- **Source_Detail**: 数据源的详细标识（如 OSM node ID、Wikidata QID）
- **Normalization_Engine**: 分类归一化引擎，负责将多源数据映射到统一分类体系
- **Custom_Fields**: 存储原始数据和证据的 JSON 字段

## Requirements

### Requirement 1: 数据库 Schema 扩展

**User Story:** As a developer, I want to extend the database schema with new fields, so that I can store normalized category data alongside original data.

#### Acceptance Criteria

1. THE Database_Schema SHALL add a `category_slug` column (text, nullable) to the `places` table for storing the machine-readable category key
2. THE Database_Schema SHALL add a `category_en` column (text, nullable) to the `places` table for storing the English display name
3. THE Database_Schema SHALL add a `source_detail` column (text, nullable) to the `places` table for storing source-specific identifiers (OSM ID, Wikidata QID, etc.)
4. THE Database_Schema SHALL create a unique constraint on `google_place_id` column (allowing nulls)
5. THE Database_Schema SHALL create a unique constraint on the combination of `(source, source_detail)` columns (allowing nulls)
6. THE Database_Schema SHALL add an index on `category_slug` column for efficient filtering
7. WHEN existing data is present, THE Migration SHALL preserve all existing `category` values unchanged

### Requirement 2: 分类规则定义

**User Story:** As a data curator, I want a clear set of category rules, so that I can consistently classify places from different data sources.

#### Acceptance Criteria

1. THE Category_System SHALL support exactly 18 primary categories: `landmark`, `museum`, `art_gallery`, `shopping_mall`, `cafe`, `bakery`, `restaurant`, `bar`, `hotel`, `church`, `library`, `bookstore`, `cemetery`, `park`, `castle`, `market`, `shop`, `yarn_store`, `thrift_store`
2. WHEN a place matches multiple primary categories, THE Category_System SHALL select one as `category_slug` and store others as `alt_category:<slug>` tags
3. THE Category_System SHALL follow the default priority order: `google_types > osm_tags > wikidata_p31 > fsq_category > keywords` for category determination
4. WHEN no specific category matches, THE Category_System SHALL default to `landmark` if the place has tourist attraction signals, otherwise `shop`
5. THE Category_System SHALL support per-category custom `mapping_priority` (e.g., castle uses `osm_tags > keywords > wikidata_p31 > google_types`)
6. THE Category_System SHALL implement `primary_rule` exclusion logic: landmark SHALL NOT match if already matched by any specific category (museum, art_gallery, library, park, etc.)
7. WHEN art_gallery and museum both match, THE Category_System SHALL select art_gallery as primary and add `alt_category:museum` tag
8. WHEN cafe and bakery both match, THE Category_System SHALL add `alt_category:bakery` or `alt_category:cafe` based on primary match

### Requirement 3: 标签规则定义

**User Story:** As a data curator, I want a structured tag system, so that I can capture additional attributes without polluting the category field.

#### Acceptance Criteria

1. THE Tag_System SHALL support domain tags in format `domain:<value>` (e.g., `domain:architecture`)
2. THE Tag_System SHALL support theme tags in format `theme:<value>` (e.g., `theme:feminism`)
3. THE Tag_System SHALL support meal tags in format `meal:<value>` (e.g., `meal:brunch`)
4. THE Tag_System SHALL support style tags in format `style:<value>` (e.g., `style:vintage`)
5. THE Tag_System SHALL support architect tags in format `architect:<name>` (e.g., `architect:Zaha Hadid`)
6. THE Tag_System SHALL support alt_category tags in format `alt_category:<slug>` for secondary categories
7. THE Tag_System SHALL support shop tags in format `shop:<value>` (e.g., `shop:secondhand`)
8. WHEN a place has architecture signals (Wikidata P84/P149, OSM architect:wikidata), THE Tag_System SHALL add `domain:architecture` tag
9. THE Tag_System SHALL support `pritzker` tag for Pritzker Prize winning architects
10. THE Tag_System SHALL support `pritzker_year:<YYYY>` tag for the year of Pritzker Prize
11. THE Tag_System SHALL support `lodging:hostel` tag when hostel signals are detected for hotel category
12. THE Tag_System SHALL support `typology:<value>` tags (e.g., `typology:church`, `typology:castle`, `typology:cemetery`)
13. WHEN secondary_tag_rules conditions are met, THE Tag_System SHALL apply conditional tags (e.g., brunch signals → `meal:brunch`, vintage signals → `style:vintage`)
14. THE Tag_System SHALL store tag evidence in `custom_fields.evidence_<tag>` for audit purposes

### Requirement 4: 数据去重约束

**User Story:** As a system administrator, I want unique constraints on source identifiers, so that I can prevent duplicate place entries.

#### Acceptance Criteria

1. WHEN a place has a `google_place_id`, THE Database SHALL ensure it is globally unique across all places
2. WHEN a place has both `source` and `source_detail`, THE Database SHALL ensure the combination is unique
3. IF a duplicate `google_place_id` is inserted, THEN THE Database SHALL reject the insertion with a constraint violation error
4. IF a duplicate `(source, source_detail)` combination is inserted, THEN THE Database SHALL reject the insertion with a constraint violation error

### Requirement 5: 历史数据迁移

**User Story:** As a developer, I want to migrate existing data to the new schema, so that old places are compatible with the new category system.

#### Acceptance Criteria

1. WHEN migrating existing data, THE Migration_Script SHALL map old `category` values to new `category_slug` values using a predefined mapping table
2. WHEN an old category maps to a tag (e.g., `brunch` → `meal:brunch`), THE Migration_Script SHALL move it to the `tags` array
3. WHEN an old category maps to a tag (e.g., `vintage` → `style:vintage`), THE Migration_Script SHALL move it to the `tags` array
4. WHEN an old category maps to a tag (e.g., `architecture_work` → `domain:architecture`), THE Migration_Script SHALL move it to the `tags` array
5. THE Migration_Script SHALL preserve the original `category` value in `custom_fields.original_category` for audit purposes
6. WHEN migration completes, THE Migration_Script SHALL report the count of migrated records and any unmapped categories

### Requirement 6: 分类归一化服务

**User Story:** As a developer, I want a normalization service, so that new data from any source is automatically classified correctly.

#### Acceptance Criteria

1. WHEN new place data is imported, THE Normalization_Service SHALL determine `category_slug` based on the priority rules
2. WHEN new place data is imported, THE Normalization_Service SHALL extract and add relevant tags based on tag rules
3. THE Normalization_Service SHALL store raw source types/tags in `custom_fields.raw` for debugging
4. WHEN multiple sources provide data for the same place, THE Normalization_Service SHALL merge data following the merge policy: prefer Google for hours/ratings/photos, union for tags/images, keep richer description
5. IF the Normalization_Service cannot determine a category, THEN it SHALL log a warning and use `shop` as fallback

### Requirement 8: 多源数据合并策略

**User Story:** As a developer, I want a clear merge policy, so that data from multiple sources is combined correctly without losing information.

#### Acceptance Criteria

1. WHEN merging data from multiple sources, THE Merge_Policy SHALL prefer Google Maps data for `openingHours`, `address`, `rating`, `photos`
2. WHEN merging data from multiple sources, THE Merge_Policy SHALL union `tags` and `images` arrays from all sources
3. WHEN merging descriptions, THE Merge_Policy SHALL keep the richer (longer) description
4. WHEN Google Maps lacks cover image and Wikidata has P18, THE Merge_Policy SHALL use Wikidata P18 as cover image
5. WHEN OSM has `opening_hours` but Google does not, THE Merge_Policy SHALL store OSM hours in `custom_fields.osm_opening_hours_raw`
6. THE Merge_Policy SHALL preserve source-specific data in `custom_fields.raw.<source>` for each data source

### Requirement 7: 前端兼容性

**User Story:** As a frontend developer, I want backward-compatible API responses, so that existing app versions continue to work.

#### Acceptance Criteria

1. THE API SHALL continue to return `category` field in responses for backward compatibility
2. THE API SHALL additionally return `category_slug` and `category_en` fields when available
3. WHEN `category_slug` is set but `category` is empty, THE API SHALL populate `category` from `category_en` for display
4. THE API SHALL return `tags` as an array of strings in the existing format
