# 后台分类和标签更新说明

## 概述

本次更新实现了以下功能：

1. **分类字段统一**：从老的 `category` 字段迁移到新的 `category_slug`, `category_en`, `category_zh` 三个字段
2. **标签展示优化**：合并展示 `tags` + `ai_tags` 的内容，拆解 JSON 格式为扁平数组

## 1. 分类字段更新

### 数据库字段

- `category_slug`: 分类机器键（如 `cafe`, `museum`, `church`）- 用于查询和筛选
- `category_en`: 分类英文展示名（如 `Cafe`, `Museum`, `Church`）- 用户可见
- `category_zh`: 分类中文展示名（如 `咖啡馆`, `博物馆`, `教堂`）- 用户可见
- `category`: 老字段，保留用于向后兼容

### 数据迁移

已创建迁移脚本：`scripts/migrate-category-fields.ts`

**使用方法**：

```bash
# 预览迁移（不修改数据库）
npx ts-node scripts/migrate-category-fields.ts --dry-run

# 执行迁移
npx ts-node scripts/migrate-category-fields.ts

# 限制处理数量（用于测试）
npx ts-node scripts/migrate-category-fields.ts --limit 100
```

**迁移结果**：
- ✅ 已迁移 16 个地点
- ✅ 支持 18 种分类
- ✅ 自动映射德语分类（如 Wissenschaft → University）

### 支持的分类

| Slug | English | 中文 |
|------|---------|------|
| cafe | Cafe | 咖啡馆 |
| restaurant | Restaurant | 餐厅 |
| museum | Museum | 博物馆 |
| park | Park | 公园 |
| landmark | Landmark | 地标 |
| church | Church | 教堂 |
| temple | Temple | 寺庙 |
| castle | Castle | 城堡 |
| hotel | Hotel | 酒店 |
| library | Library | 图书馆 |
| university | University | 大学 |
| cemetery | Cemetery | 墓园 |
| zoo | Zoo | 动物园 |
| art_gallery | Gallery | 美术馆 |
| theater | Theater | 剧院 |
| stadium | Stadium | 体育场 |
| bar | Bar | 酒吧 |
| architecture | Architecture | 建筑 |

## 2. 标签展示优化

### 标签数据结构

**tags 字段**（JSON 对象）：
```json
{
  "type": ["Architecture"],
  "style": ["Brutalism", "Modern"],
  "architect": ["Frank Gehry"],
  "theme": ["Historical"]
}
```

**aiTags 字段**（JSON 数组）：
```json
[
  { "en": "Brutalist", "zh": "粗野主义" },
  { "en": "Modern", "zh": "现代" }
]
```

### 标签提取工具

已创建工具函数：`src/utils/tagExtractor.ts`

**主要函数**：

1. `extractTagsFromObject(tags)` - 从 tags 对象提取所有值
2. `extractAITags(aiTags, language)` - 从 aiTags 数组提取指定语言的值
3. `extractAllTags(tags, aiTags, language)` - 合并提取所有标签
4. `formatTagsForDisplay(tags, aiTags, language)` - 格式化标签用于展示

**示例**：

```typescript
import { formatTagsForDisplay } from '../utils/tagExtractor';

const tagInfo = formatTagsForDisplay(place.tags, place.aiTags, 'en');

console.log(tagInfo.tags);           // ["Architecture", "Brutalism", "Frank Gehry"]
console.log(tagInfo.aiTags);         // ["Brutalist", "Modern"]
console.log(tagInfo.allTags);        // ["Architecture", "Brutalism", "Frank Gehry", "Brutalist", "Modern"]
console.log(tagInfo.displayString);  // "Architecture, Brutalism, Frank Gehry, Brutalist, Modern"
```

## 3. API 更新

### GET /api/places

**更新内容**：

1. 支持新的 `categorySlug` 查询参数
2. 返回新的分类字段（`categorySlug`, `categoryEn`, `categoryZh`）
3. 返回提取后的标签（`displayTags`, `displayTagsString`）

**查询参数**：

```
GET /api/places?categorySlug=cafe&limit=10
GET /api/places?city=Paris&categorySlug=museum
GET /api/places?source=wikidata&categorySlug=church
```

**响应格式**：

```json
{
  "count": 10,
  "places": [
    {
      "id": "uuid",
      "name": "Uffizi Gallery",
      "city": "Florence",
      "country": "Italy",
      "categorySlug": "art_gallery",
      "categoryEn": "Gallery",
      "categoryZh": "美术馆",
      "tags": {
        "type": ["Architecture"],
        "architect": ["Giorgio Vasari", "Bernardo Buontalenti"]
      },
      "aiTags": [],
      "displayTags": ["Architecture", "Giorgio Vasari", "Bernardo Buontalenti"],
      "displayTagsString": "Architecture, Giorgio Vasari, Bernardo Buontalenti",
      ...
    }
  ]
}
```

### 向后兼容

- 仍然支持老的 `category` 查询参数
- 如果 `categorySlug` 为空，会回退到 `category` 字段
- 响应中同时包含新旧字段

## 4. 后台展示建议

### 分类列

显示 `categoryEn`（英文）或 `categoryZh`（中文），根据用户语言设置选择。

```typescript
// 示例代码
const displayCategory = userLanguage === 'zh' 
  ? place.categoryZh || place.categoryEn 
  : place.categoryEn;
```

### 标签列

显示 `displayTagsString` 或 `displayTags` 数组。

```typescript
// 方式 1：直接显示字符串
<span>{place.displayTagsString}</span>

// 方式 2：显示为标签列表
{place.displayTags.map(tag => (
  <Tag key={tag}>{tag}</Tag>
))}
```

### 筛选功能

支持按分类和标签筛选：

```typescript
// 按分类筛选
GET /api/places?categorySlug=museum

// 按城市和分类筛选
GET /api/places?city=Paris&categorySlug=cafe

// 按来源筛选
GET /api/places?source=wikidata&categorySlug=church
```

## 5. 测试

### 测试脚本

```bash
# 测试标签提取
npx ts-node scripts/test-tag-extraction.ts

# 测试分类迁移
npx ts-node scripts/migrate-category-fields.ts --dry-run --limit 10
```

### 测试结果

✅ **分类迁移**：
- 16 个地点成功迁移
- 0 个错误
- 支持 18 种分类

✅ **标签提取**：
- 正确提取 tags 对象中的所有值
- 正确提取 aiTags 数组中的值
- 正确合并去重

## 6. 数据统计

### 当前数据库状态

**总计**: 5,927 个 Wikidata 地点

**分类分布**:
- Cemetery (墓园): 2,383
- Landmark (地标): 2,264
- Church (教堂): 327
- Castle (城堡): 235
- Museum (博物馆): 153
- Temple (寺庙): 119
- Hotel (酒店): 110
- University (大学): 83
- Stadium (体育场): 78
- Theater (剧院): 74
- Library (图书馆): 38
- Park (公园): 29
- Gallery (美术馆): 26
- Architecture (建筑): 5
- Cafe (咖啡馆): 3

## 7. 注意事项

1. **分类字段优先级**：
   - 优先使用 `categorySlug`, `categoryEn`, `categoryZh`
   - 如果为空，回退到 `category` 字段

2. **标签去重**：
   - `displayTags` 已自动去重
   - 合并 tags 和 aiTags 时会去除重复值

3. **多语言支持**：
   - aiTags 支持中英文
   - 可通过 `language` 参数选择语言（默认 'en'）

4. **性能考虑**：
   - 标签提取在内存中完成，性能良好
   - 建议在前端缓存分类映射表

## 8. 未来改进

1. **标签筛选**：
   - 支持按标签筛选地点
   - 实现标签自动补全

2. **分类管理**：
   - 后台管理界面支持修改分类
   - 批量更新分类功能

3. **标签管理**：
   - 标签标准化和合并
   - 标签优先级排序

## 9. 相关文件

- 迁移脚本：`scripts/migrate-category-fields.ts`
- 标签工具：`src/utils/tagExtractor.ts`
- 测试脚本：`scripts/test-tag-extraction.ts`
- API 控制器：`src/controllers/placeController.ts`
- 数据库 Schema：`prisma/schema.prisma`
