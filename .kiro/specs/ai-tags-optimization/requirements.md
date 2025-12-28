# Requirements Document

## Introduction

本功能旨在优化 Wanderlog 的 Category、ai_tags、tags 三者关系。核心目标是：
- C 端用户可见的是 `category_en/zh` + `ai_tags` 的并集，累计不超过 3 个标签
- `ai_tags` 的数据来源是 `tags`，不能和 Category 重复
- `tags` 为内部数据，用户不可见
- 建立 `ai_facet_dictionary` 字典表管理受控的展示标签

## Glossary

- **Place**: 地点实体，存储在 `places` 表中的核心数据模型
- **Category_Slug**: 主分类的机器键，使用 snake_case 格式（如 `cafe`、`museum`）
- **Category_En**: 主分类的英文展示名（如 `Cafe`、`Gallery`）
- **Category_Zh**: 主分类的中文展示名（如 `咖啡店`、`美术馆`）
- **Tags**: 内部结构化标签容器（jsonb），用于存储风格、主题、奖项、菜系等属性，用户不可见
- **AI_Tags**: 展示标签数组（jsonb[]），最多 2 个，每个元素包含 kind/id/en/zh/priority
- **AI_Facet_Dictionary**: 受控的展示标签字典表，定义允许的 facet 及其中英文映射
- **Facet**: 一种展示标签类型，如 Pritzker、Brutalist、Brunch 等
- **Display_Tags**: C 端用户可见的标签，= category + ai_tags 的并集，最多 3 个

## Requirements

### Requirement 1: Tags 字段结构化重构

**User Story:** As a developer, I want to restructure the tags field as a structured jsonb object, so that I can efficiently store and query internal tag data.

#### Acceptance Criteria

1. THE Database_Schema SHALL change the `tags` column type from `Json` (string array) to `jsonb` with structured object format
2. THE Tags_Structure SHALL support the following keys: `style`, `theme`, `award`, `meal`, `cuisine`, `architectQ`, `personQ`, `alt_category`
3. WHEN storing tags, THE System SHALL use array values for each key (e.g., `{"style": ["Brutalist", "ArtDeco"], "theme": ["feminism"]}`)
4. THE Tags_Field SHALL NOT be exposed to C-end users in API responses
5. WHEN migrating existing data, THE Migration_Script SHALL convert old string array tags to the new structured format

### Requirement 2: AI_Tags 字段重构

**User Story:** As a developer, I want to restructure ai_tags as a jsonb array of objects, so that I can store rich metadata for display tags.

#### Acceptance Criteria

1. THE Database_Schema SHALL change the `ai_tags` column type to `jsonb[]` (PostgreSQL array of jsonb)
2. WHEN storing ai_tags elements, THE System SHALL use the format: `{"kind": "facet|person|architect", "id": "string", "en": "string", "zh": "string", "priority": number}`
3. THE AI_Tags_Array SHALL contain at most 2 elements
4. THE Database_Schema SHALL add a CHECK constraint to enforce the 2-element limit
5. WHEN an ai_tag element has the same `en` value as `category_en`, THE System SHALL exclude it from ai_tags

### Requirement 3: AI Facet Dictionary 字典表

**User Story:** As a data curator, I want a dictionary table for controlled facets, so that I can manage the whitelist of display tags with translations.

#### Acceptance Criteria

1. THE Database_Schema SHALL create an `ai_facet_dictionary` table with columns: `id` (text, primary key), `en` (text), `zh` (text), `priority` (int), `allowed_categories` (text[]), `derive_from` (jsonb)
2. WHEN generating ai_tags with kind=facet, THE System SHALL only use facets defined in the dictionary
3. THE Dictionary SHALL be populated from the `ai_facet_dictionary.csv` file
4. WHEN a facet has `allowed_categories` defined, THE System SHALL only apply it to places with matching category_slug

### Requirement 4: AI_Tags 生成规则

**User Story:** As a developer, I want clear rules for generating ai_tags from tags, so that display tags are consistent and meaningful.

#### Acceptance Criteria

1. THE AI_Tags_Generator SHALL follow this priority order: Pritzker > Architectural Style (max 1) > Brunch > Cuisine > Experience tags
2. WHEN `tags.award` contains `pritzker`, THE System SHALL add facet `Pritzker` to ai_tags
3. WHEN `tags.style` contains a style value, THE System SHALL add the corresponding style facet to ai_tags (max 1 style)
4. WHEN `tags.meal` contains `brunch` AND category is restaurant/cafe/bakery, THE System SHALL add facet `Brunch` to ai_tags
5. WHEN `tags.cuisine` contains a cuisine value AND category is restaurant, THE System SHALL add the corresponding cuisine facet to ai_tags
6. WHEN `tags.personQ` contains a Wikidata QID, THE System SHALL add a person entity to ai_tags with kind=person
7. WHEN `tags.architectQ` contains a Wikidata QID, THE System SHALL add an architect entity to ai_tags with kind=architect
8. THE System SHALL display at most 1 entity (person or architect) per place

### Requirement 5: C端展示标签规则

**User Story:** As a user, I want to see meaningful tags for each place, so that I can quickly understand its characteristics.

#### Acceptance Criteria

1. THE Display_Tags SHALL be the union of `category_en/zh` and `ai_tags`
2. THE Display_Tags SHALL contain at most 3 items total
3. WHEN displaying tags, THE System SHALL always show category first, then ai_tags by priority
4. THE AI_Tags SHALL NOT contain any tag that duplicates the category (case-insensitive comparison)
5. WHEN the language is English, THE System SHALL display `category_en` + `ai_tags[].en`
6. WHEN the language is Chinese, THE System SHALL display `category_zh` + `ai_tags[].zh`

### Requirement 6: 数据库触发器校验

**User Story:** As a system administrator, I want database-level validation, so that invalid ai_tags cannot be written to the database.

#### Acceptance Criteria

1. THE Database SHALL create a trigger function `normalize_ai_tags()` that runs before INSERT or UPDATE on places
2. WHEN ai_tags contains an element without required fields (kind, id, en, zh), THE Trigger SHALL remove that element
3. WHEN ai_tags contains an element with kind not in ('facet', 'person', 'architect'), THE Trigger SHALL remove that element
4. WHEN ai_tags contains an element where `en` equals `category_en` (case-insensitive), THE Trigger SHALL remove that element
5. WHEN ai_tags contains duplicate elements (same kind+id), THE Trigger SHALL keep only the first occurrence
6. WHEN ai_tags has more than 2 elements after cleaning, THE Trigger SHALL truncate to the first 2

### Requirement 7: 历史数据迁移

**User Story:** As a developer, I want to migrate existing data to the new schema, so that old places are compatible with the new tag system.

#### Acceptance Criteria

1. WHEN migrating existing places, THE Migration_Script SHALL convert old `tags` array to new structured jsonb format
2. WHEN migrating existing places, THE Migration_Script SHALL regenerate `ai_tags` based on the new rules
3. THE Migration_Script SHALL preserve original data in `custom_fields.migration_backup` for audit
4. WHEN migration completes, THE Migration_Script SHALL report: total records, migrated count, ai_tags generated count, errors

### Requirement 8: API 响应格式更新

**User Story:** As a frontend developer, I want updated API responses, so that I can display the new tag format correctly.

#### Acceptance Criteria

1. THE API SHALL return `category_en` and `category_zh` fields for the primary category
2. THE API SHALL return `ai_tags` as an array of objects with `{kind, id, en, zh, priority}`
3. THE API SHALL return a computed `display_tags` array for convenience (category + ai_tags, max 3)
4. THE API SHALL NOT return the internal `tags` field to C-end users
5. WHEN `ai_tags` is null or empty, THE API SHALL return an empty array `[]`

### Requirement 9: GIN 索引优化

**User Story:** As a developer, I want efficient queries on the tags field, so that I can filter places by internal tags.

#### Acceptance Criteria

1. THE Database_Schema SHALL create a GIN index on the `tags` jsonb column
2. THE GIN_Index SHALL support containment queries (e.g., `tags @> '{"style": ["Brutalist"]}'`)
3. WHEN querying by tag, THE System SHALL use the GIN index for efficient filtering
