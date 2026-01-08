# 后台分类和标签 - 快速开始

## 当前状态 ✅

- ✅ 数据迁移完成：10,892 个地点已有新分类字段
- ✅ API 已更新：支持新的分类和标签展示
- ✅ 工具函数已创建：标签提取和格式化

## 快速使用

### 1. 启动后端服务

```bash
cd wanderlog_api
npm run dev
```

### 2. API 调用示例

#### 获取地点列表（按分类筛选）

```bash
# 获取所有博物馆
curl "http://localhost:3001/api/places?categorySlug=museum&limit=10"

# 获取巴黎的咖啡馆
curl "http://localhost:3001/api/places?city=Paris&categorySlug=cafe&limit=10"

# 获取 Wikidata 来源的教堂
curl "http://localhost:3001/api/places?source=wikidata&categorySlug=church&limit=10"
```

#### 响应格式

```json
{
  "count": 10,
  "places": [
    {
      "id": "uuid",
      "name": "Uffizi Gallery",
      "city": "Florence",
      "country": "Italy",
      
      // 新的分类字段
      "categorySlug": "art_gallery",
      "categoryEn": "Gallery",
      "categoryZh": "美术馆",
      
      // 原始标签数据
      "tags": {
        "type": ["Architecture"],
        "architect": ["Giorgio Vasari"]
      },
      "aiTags": [],
      
      // 提取后的标签（用于展示）
      "displayTags": ["Architecture", "Giorgio Vasari"],
      "displayTagsString": "Architecture, Giorgio Vasari",
      
      // 其他字段...
      "rating": 4.8,
      "coverImage": "https://...",
      ...
    }
  ]
}
```

### 3. 前端展示代码示例

#### React/TypeScript 示例

```typescript
interface Place {
  id: string;
  name: string;
  categorySlug: string;
  categoryEn: string;
  categoryZh: string;
  displayTags: string[];
  displayTagsString: string;
  // ... 其他字段
}

// 组件示例
function PlaceCard({ place, userLanguage }: { place: Place; userLanguage: 'en' | 'zh' }) {
  // 显示分类
  const displayCategory = userLanguage === 'zh' 
    ? place.categoryZh || place.categoryEn 
    : place.categoryEn;
  
  return (
    <div className="place-card">
      <h3>{place.name}</h3>
      
      {/* 分类标签 */}
      <span className="category-badge">{displayCategory}</span>
      
      {/* 标签列表 */}
      <div className="tags">
        {place.displayTags.map(tag => (
          <span key={tag} className="tag">{tag}</span>
        ))}
      </div>
      
      {/* 或者直接显示字符串 */}
      <p className="tags-text">{place.displayTagsString}</p>
    </div>
  );
}
```

#### 表格展示示例

```typescript
// 后台管理表格
const columns = [
  {
    title: '名称',
    dataIndex: 'name',
    key: 'name',
  },
  {
    title: '分类',
    dataIndex: 'categoryEn',
    key: 'category',
    render: (text: string, record: Place) => (
      <Tag color="blue">{text}</Tag>
    ),
  },
  {
    title: '标签',
    dataIndex: 'displayTags',
    key: 'tags',
    render: (tags: string[]) => (
      <>
        {tags.map(tag => (
          <Tag key={tag} color="default">{tag}</Tag>
        ))}
      </>
    ),
  },
  // ... 其他列
];
```

### 4. 支持的分类列表

| categorySlug | categoryEn | categoryZh |
|--------------|------------|------------|
| cafe | Cafe | 咖啡馆 |
| restaurant | Restaurant | 餐厅 |
| museum | Museum | 博物馆 |
| art_gallery | Gallery | 美术馆 |
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
| theater | Theater | 剧院 |
| stadium | Stadium | 体育场 |
| bar | Bar | 酒吧 |
| architecture | Architecture | 建筑 |

### 5. 筛选功能

#### 按分类筛选

```typescript
// API 调用
const fetchPlacesByCategory = async (categorySlug: string) => {
  const response = await fetch(
    `http://localhost:3001/api/places?categorySlug=${categorySlug}&limit=50`
  );
  return response.json();
};

// 使用示例
const museums = await fetchPlacesByCategory('museum');
const cafes = await fetchPlacesByCategory('cafe');
```

#### 组合筛选

```typescript
// 城市 + 分类
const fetchPlaces = async (city: string, categorySlug: string) => {
  const params = new URLSearchParams({
    city,
    categorySlug,
    limit: '50',
  });
  
  const response = await fetch(
    `http://localhost:3001/api/places?${params}`
  );
  return response.json();
};

// 使用示例
const parisCafes = await fetchPlaces('Paris', 'cafe');
const florenceMuseums = await fetchPlaces('Florence', 'museum');
```

### 6. 标签说明

#### tags 字段结构

```json
{
  "type": ["Architecture"],           // 类型标签
  "style": ["Brutalism", "Modern"],   // 风格标签
  "architect": ["Frank Gehry"],       // 建筑师标签
  "theme": ["Historical"],            // 主题标签
  "award": ["Pritzker Prize"],        // 奖项标签
  "meal": ["Breakfast", "Lunch"],     // 餐饮类型
  "cuisine": ["Italian", "French"]    // 菜系
}
```

#### aiTags 字段结构

```json
[
  { "en": "Brutalist", "zh": "粗野主义" },
  { "en": "Modern", "zh": "现代" }
]
```

#### 提取后的标签

所有标签会被自动提取、合并、去重，存储在 `displayTags` 数组中。

### 7. 常见问题

#### Q: 如何添加新的分类？

A: 在 `scripts/migrate-category-fields.ts` 的 `CATEGORY_MAPPING` 中添加新的映射：

```typescript
const CATEGORY_MAPPING = {
  // ... 现有映射
  'new_category': { slug: 'new_category', en: 'New Category', zh: '新分类' },
};
```

#### Q: 如何处理没有分类的地点？

A: API 会自动回退到老的 `category` 字段。如果都没有，返回 null。

#### Q: 标签可以筛选吗？

A: 当前版本暂不支持按标签筛选，但可以在前端实现客户端筛选。

### 8. 数据统计

**当前数据库状态**（截至最新更新）：

- 总地点数：11,460
- 已迁移分类：10,892
- Wikidata 地点：5,927

**分类分布**（Wikidata 数据）：
- Cemetery: 2,383
- Landmark: 2,264
- Church: 327
- Castle: 235
- Museum: 153
- Theater: 74
- Stadium: 78
- 其他: ~400

### 9. 相关文档

- 完整文档：`BACKEND_CATEGORY_TAG_UPDATE.md`
- 迁移脚本：`scripts/migrate-category-fields.ts`
- 标签工具：`src/utils/tagExtractor.ts`
- API 控制器：`src/controllers/placeController.ts`

### 10. 测试命令

```bash
# 测试标签提取
npx ts-node scripts/test-tag-extraction.ts

# 检查数据状态
npx ts-node -e "
import prisma from './src/config/database';
async function check() {
  const total = await prisma.place.count();
  const withNewFields = await prisma.place.count({
    where: { categorySlug: { not: null } }
  });
  console.log(\`Total: \${total}, With new fields: \${withNewFields}\`);
  await prisma.\$disconnect();
}
check();
"
```

## 完成 ✅

所有功能已实现并测试通过！现在可以在后台正确展示分类和标签了。
