# Design Document: AI Tags Optimization

## Overview

本设计文档描述了 Wanderlog 的 Category、ai_tags、tags 三者关系的优化方案。核心目标是：
- 将 `tags` 重构为结构化 jsonb 对象，作为内部数据存储
- 将 `ai_tags` 重构为 jsonb[] 数组，存储展示标签对象
- 建立 `ai_facet_dictionary` 字典表管理受控的展示标签
- C 端用户可见的是 `category_en/zh` + `ai_tags` 的并集，累计不超过 3 个

## Architecture

```mermaid
graph TB
    subgraph "Data Sources"
        G[Google Maps API]
        O[OpenStreetMap]
        W[Wikidata]
        A[Apify Scrapers]
    end
    
    subgraph "Processing Layer"
        NS[Normalization Service]
        ATG[AI Tags Generator]
        FD[(ai_facet_dictionary)]
    end
    
    subgraph "Database Layer"
        P[(places table)]
        TR[Trigger: normalize_ai_tags]
    end
    
    subgraph "API Layer"
        API[REST API]
        DT[Display Tags Formatter]
    end
    
    subgraph "Client"
        FE[Flutter App]
    end
    
    G --> NS
    O --> NS
    W --> NS
    A --> NS
    
    NS --> |tags jsonb| P
    NS --> ATG
    FD --> ATG
    ATG --> |ai_tags jsonb[]| P
    
    P --> TR
    TR --> P
    
    P --> API
    API --> DT
    DT --> FE
```

## Components and Interfaces

### 1. Database Schema Changes

#### 1.1 Places 表字段变更

```sql
-- 现有字段类型变更
-- tags: Json -> jsonb (结构化对象)
-- ai_tags: Json -> jsonb[] (对象数组)

-- 新增字段
ALTER TABLE places ADD COLUMN IF NOT EXISTS i18n jsonb;

-- 约束
ALTER TABLE places
ADD CONSTRAINT places_ai_tags_len_chk
CHECK (ai_tags IS NULL OR array_length(ai_tags, 1) <= 2);

-- 索引
CREATE INDEX IF NOT EXISTS places_tags_gin ON places USING gin (tags);
```

#### 1.2 AI Facet Dictionary 表

```sql
CREATE TABLE IF NOT EXISTS ai_facet_dictionary (
  id TEXT PRIMARY KEY,              -- e.g. 'Brutalist'
  en TEXT NOT NULL,                 -- e.g. 'Brutalist'
  zh TEXT NOT NULL,                 -- e.g. '粗野主义'
  priority INT NOT NULL DEFAULT 50,
  allowed_categories TEXT[] NULL,   -- e.g. ['restaurant', 'cafe']
  derive_from JSONB NULL            -- e.g. {"source": "tags:style:Brutalist*"}
);
```

### 2. Tags 结构化格式

```typescript
interface StructuredTags {
  style?: string[];        // ["Brutalist", "ArtDeco"]
  theme?: string[];        // ["feminism"]
  award?: string[];        // ["pritzker"]
  meal?: string[];         // ["brunch"]
  cuisine?: string[];      // ["Japanese", "Korean"]
  architectQ?: string[];   // ["Q82840"] - Wikidata QID
  personQ?: string[];      // ["Q254"] - Wikidata QID
  alt_category?: string[]; // ["museum"]
}
```

### 3. AI Tags 对象格式

```typescript
interface AITagElement {
  kind: 'facet' | 'person' | 'architect';
  id: string;       // e.g. 'Pritzker', 'Q254', 'Q82840'
  en: string;       // e.g. 'Pritzker', 'Mozart', 'Zaha Hadid'
  zh: string;       // e.g. '普利兹克', '莫扎特', '扎哈·哈迪德'
  priority: number; // e.g. 95
}

// ai_tags 是 AITagElement[] 类型，最多 2 个元素
type AITags = AITagElement[];
```

### 4. AI Tags Generator Service

```typescript
interface AITagsGeneratorService {
  /**
   * 从结构化 tags 生成 ai_tags
   */
  generateAITags(
    tags: StructuredTags,
    categorySlug: string,
    categoryEn: string
  ): AITagElement[];
  
  /**
   * 获取 facet 定义
   */
  getFacetDefinition(facetId: string): FacetDefinition | null;
  
  /**
   * 检查 facet 是否允许用于该分类
   */
  isFacetAllowedForCategory(facetId: string, categorySlug: string): boolean;
}

interface FacetDefinition {
  id: string;
  en: string;
  zh: string;
  priority: number;
  allowedCategories: string[] | null;
  deriveFrom: DeriveRule | null;
}

interface DeriveRule {
  source: string;  // e.g. "tags:style:Brutalist*"
}
```

### 5. AI Tags Generation Priority

生成优先级（从高到低）：

| Priority | Type | Example | Max Count |
|----------|------|---------|-----------|
| 95 | Pritzker Award | Pritzker | 1 |
| 92-70 | Architectural Style | Brutalist, ArtDeco | 1 |
| 78 | Brunch | Brunch | 1 |
| 66-54 | Cuisine | Japanese, Korean | 1 |
| 72-55 | Shop Style | Vintage, Curated | 1 |
| 60-52 | Experience | Iconic, Photogenic | 1 |
| N/A | Person Entity | Mozart | 1 |
| N/A | Architect Entity | Zaha Hadid | 1 |

**规则：**
- 最多 2 个 ai_tags
- 最多 1 个 style facet
- 最多 1 个 entity (person 或 architect)
- 不能与 category_en 重复

### 6. Display Tags Computation

```typescript
interface DisplayTagsService {
  /**
   * 计算 C 端展示标签
   */
  computeDisplayTags(
    categoryEn: string,
    categoryZh: string,
    aiTags: AITagElement[],
    language: 'en' | 'zh'
  ): string[];
}

// 实现逻辑
function computeDisplayTags(
  categoryEn: string,
  categoryZh: string,
  aiTags: AITagElement[],
  language: 'en' | 'zh'
): string[] {
  const result: string[] = [];
  
  // 1. 首先添加 category
  result.push(language === 'en' ? categoryEn : categoryZh);
  
  // 2. 按 priority 排序 ai_tags
  const sortedTags = [...aiTags].sort((a, b) => b.priority - a.priority);
  
  // 3. 添加 ai_tags（最多 2 个，总共最多 3 个）
  for (const tag of sortedTags) {
    if (result.length >= 3) break;
    result.push(language === 'en' ? tag.en : tag.zh);
  }
  
  return result;
}
```

### 7. Database Trigger: normalize_ai_tags

```sql
CREATE OR REPLACE FUNCTION normalize_ai_tags()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  cleaned jsonb[];
  t jsonb;
  k text;
  en text;
BEGIN
  IF NEW.ai_tags IS NULL THEN
    RETURN NEW;
  END IF;

  cleaned := array[]::jsonb[];

  FOREACH t IN ARRAY NEW.ai_tags LOOP
    -- 只接受对象
    IF jsonb_typeof(t) <> 'object' THEN
      CONTINUE;
    END IF;

    k := COALESCE(t->>'kind', '');
    en := COALESCE(t->>'en', '');

    -- 必填字段校验
    IF k = '' OR COALESCE(t->>'id', '') = '' OR en = '' OR COALESCE(t->>'zh', '') = '' THEN
      CONTINUE;
    END IF;

    -- kind 枚举校验
    IF k NOT IN ('facet', 'person', 'architect') THEN
      CONTINUE;
    END IF;

    -- 不允许跟 category_en 重复
    IF NEW.category_en IS NOT NULL AND LOWER(en) = LOWER(NEW.category_en) THEN
      CONTINUE;
    END IF;

    -- 去重（按 kind+id）
    IF array_position(
        array(SELECT (x->>'kind')||':'||(x->>'id') FROM unnest(cleaned) AS x),
        (k||':'||(t->>'id'))
      ) IS NULL THEN
      cleaned := array_append(cleaned, t);
    END IF;
  END LOOP;

  -- 截断到最多 2 个
  IF array_length(cleaned, 1) > 2 THEN
    cleaned := cleaned[1:2];
  END IF;

  NEW.ai_tags := cleaned;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_ai_tags ON places;

CREATE TRIGGER trg_normalize_ai_tags
BEFORE INSERT OR UPDATE OF ai_tags, category_en
ON places
FOR EACH ROW
EXECUTE FUNCTION normalize_ai_tags();
```

### 8. API Response Format

```typescript
interface PlaceAPIResponse {
  id: string;
  name: string;
  // ... other fields
  
  // Category fields
  category_slug: string;
  category_en: string;
  category_zh: string;
  
  // AI Tags (展示标签)
  ai_tags: AITagElement[];
  
  // Computed display tags (便捷字段)
  display_tags_en: string[];  // e.g. ["Museum", "Pritzker", "Brutalist"]
  display_tags_zh: string[];  // e.g. ["博物馆", "普利兹克", "粗野主义"]
  
  // tags 字段不返回给 C 端用户
}
```

## Data Models

### Updated Place Model (Prisma)

```prisma
model Place {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name           String
  // ... existing fields
  
  // Category fields
  category       String?                    // 保留，向后兼容
  categorySlug   String?   @map("category_slug")
  categoryEn     String?   @map("category_en")
  categoryZh     String?   @map("category_zh")
  
  // Tags fields (重构)
  tags           Json?     @default("{}")   // jsonb 结构化对象
  aiTags         Json?     @default("[]") @map("ai_tags")  // jsonb[] 对象数组
  
  // i18n field (新增)
  i18n           Json?     // 多语言文本容器
  
  // ... other fields
  
  @@map("places")
}
```

### AI Facet Dictionary Model

```prisma
model AIFacetDictionary {
  id                String   @id
  en                String
  zh                String
  priority          Int      @default(50)
  allowedCategories String[] @map("allowed_categories")
  deriveFrom        Json?    @map("derive_from")
  
  @@map("ai_facet_dictionary")
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Tags Structure Validation

*For any* place with a non-null tags field, the tags value must be a valid jsonb object where each key is one of the allowed keys (style, theme, award, meal, cuisine, architectQ, personQ, alt_category) and each value is an array of strings.

**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: AI Tags Format and Constraints

*For any* place with non-null ai_tags:
- ai_tags must be an array of at most 2 elements
- Each element must have kind, id, en, zh, priority fields
- kind must be one of 'facet', 'person', 'architect'
- No element's en value should equal category_en (case-insensitive)

**Validates: Requirements 2.2, 2.3, 2.5**

### Property 3: Facet Dictionary Validation

*For any* ai_tag element with kind='facet', its id must exist in the ai_facet_dictionary table. If the facet has allowed_categories defined, the place's category_slug must be in that list.

**Validates: Requirements 3.2, 3.4**

### Property 4: AI Tags Generation Rules

*For any* place with structured tags:
- If tags.award contains 'pritzker', ai_tags should contain Pritzker facet
- At most 1 style facet should be in ai_tags
- Brunch facet only applies to restaurant/cafe/bakery categories
- Cuisine facets only apply to restaurant category
- At most 1 entity (person or architect) should be in ai_tags

**Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8**

### Property 5: Display Tags Computation

*For any* place, the computed display_tags:
- Must start with category_en/zh
- Must contain at most 3 items total
- Must include ai_tags sorted by priority (descending)
- Must use correct language field (en or zh)

**Validates: Requirements 5.1, 5.2, 5.3, 5.5, 5.6**

### Property 6: Trigger Validation

*For any* INSERT or UPDATE on places with ai_tags:
- Elements without required fields (kind, id, en, zh) are removed
- Elements with invalid kind are removed
- Elements duplicating category_en are removed
- Duplicate elements (same kind+id) are deduplicated
- Result is truncated to at most 2 elements

**Validates: Requirements 6.2, 6.3, 6.4, 6.5, 6.6**

### Property 7: Migration Correctness

*For any* migrated place:
- Old string array tags are converted to structured jsonb format
- ai_tags are regenerated based on new rules
- Original data is preserved in custom_fields.migration_backup

**Validates: Requirements 7.1, 7.2, 7.3**

### Property 8: API Response Format

*For any* API response for a place:
- category_en and category_zh fields are present
- ai_tags is an array of objects with required fields
- display_tags_en and display_tags_zh are computed correctly
- Internal tags field is NOT present in response

**Validates: Requirements 8.1, 8.2, 8.3, 8.4**

## Error Handling

### Invalid AI Tags Input

```typescript
function handleInvalidAITags(aiTags: unknown[]): AITagElement[] {
  if (!Array.isArray(aiTags)) return [];
  
  return aiTags
    .filter(isValidAITagElement)
    .slice(0, 2);
}

function isValidAITagElement(element: unknown): element is AITagElement {
  if (typeof element !== 'object' || element === null) return false;
  const e = element as Record<string, unknown>;
  return (
    typeof e.kind === 'string' &&
    ['facet', 'person', 'architect'].includes(e.kind) &&
    typeof e.id === 'string' &&
    typeof e.en === 'string' &&
    typeof e.zh === 'string' &&
    typeof e.priority === 'number'
  );
}
```

### Migration Errors

```typescript
interface MigrationError {
  placeId: string;
  error: string;
  originalTags: unknown;
  recoverable: boolean;
}

function handleMigrationError(place: Place, error: Error): MigrationError {
  return {
    placeId: place.id,
    error: error.message,
    originalTags: place.tags,
    recoverable: true,
  };
}
```

## Testing Strategy

### Unit Tests

1. **Tags Structure Tests**
   - Test valid structured tags parsing
   - Test invalid tags rejection
   - Test empty tags handling

2. **AI Tags Generation Tests**
   - Test Pritzker detection
   - Test style facet selection (max 1)
   - Test cuisine facet with category restriction
   - Test entity (person/architect) selection (max 1)

3. **Display Tags Tests**
   - Test category + ai_tags combination
   - Test max 3 limit
   - Test language switching

### Property-Based Tests

使用 `fast-check` 库进行属性测试：

1. **Property 1**: 生成随机 tags 对象，验证结构正确性
2. **Property 2**: 生成随机 ai_tags，验证格式和约束
3. **Property 3**: 生成随机 facet ai_tags，验证字典存在性
4. **Property 4**: 生成随机 tags，验证 ai_tags 生成规则
5. **Property 5**: 生成随机 place，验证 display_tags 计算
6. **Property 6**: 生成随机 ai_tags 输入，验证触发器清洗
7. **Property 7**: 生成旧格式数据，验证迁移正确性
8. **Property 8**: 生成 API 响应，验证格式正确性

### Integration Tests

1. **End-to-End Flow**
   - 导入数据 → 生成 tags → 生成 ai_tags → API 返回 display_tags

2. **Migration Integration**
   - 完整数据库迁移测试
   - 迁移后 API 兼容性测试

## Implementation Notes

### Facet Dictionary CSV Import

```typescript
async function importFacetDictionary(csvPath: string): Promise<void> {
  const records = await parseCsv(csvPath);
  
  for (const record of records) {
    await prisma.aIFacetDictionary.upsert({
      where: { id: record.id },
      create: {
        id: record.id,
        en: record.en,
        zh: record.zh,
        priority: parseInt(record.priority),
        allowedCategories: record.allowed_categories 
          ? record.allowed_categories.split(';') 
          : [],
        deriveFrom: record.derive_from 
          ? { source: record.derive_from } 
          : null,
      },
      update: {
        en: record.en,
        zh: record.zh,
        priority: parseInt(record.priority),
        allowedCategories: record.allowed_categories 
          ? record.allowed_categories.split(';') 
          : [],
        deriveFrom: record.derive_from 
          ? { source: record.derive_from } 
          : null,
      },
    });
  }
}
```

### Tags Migration Logic

```typescript
function migrateOldTags(oldTags: string[]): StructuredTags {
  const newTags: StructuredTags = {};
  
  for (const tag of oldTags) {
    // 解析 prefix:value 格式
    const [prefix, value] = tag.includes(':') 
      ? tag.split(':', 2) 
      : [null, tag];
    
    if (prefix === 'style') {
      newTags.style = newTags.style || [];
      newTags.style.push(value);
    } else if (prefix === 'theme') {
      newTags.theme = newTags.theme || [];
      newTags.theme.push(value);
    } else if (prefix === 'meal') {
      newTags.meal = newTags.meal || [];
      newTags.meal.push(value);
    } else if (prefix === 'architect') {
      // 需要查找 Wikidata QID
      // newTags.architectQ = ...
    } else if (tag === 'pritzker') {
      newTags.award = newTags.award || [];
      newTags.award.push('pritzker');
    }
    // ... 其他映射
  }
  
  return newTags;
}
```
