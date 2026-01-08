# 后端标签类型筛选功能实现指南

## 功能概述

为了解决后台标签列表过长的问题，我们在后端 API 中添加了**标签类型分类功能**。现在 API 会自动将标签按类型（建筑师、风格、主题等）进行分组，并提供相应的筛选接口。

## 实现内容

### 1. 新增文件

**`wanderlog_api/src/utils/tagTypeClassifier.ts`** - 标签类型分类器

提供以下功能：
- 标签类型定义（建筑师、风格、主题、奖项、领域、餐饮、商店等）
- 标签分类逻辑（根据前缀自动分类）
- 标签显示名称提取（去掉前缀）
- 标签按类型分组
- 标签类型统计

### 2. 修改文件

#### `wanderlog_api/src/services/publicPlaceService.ts`
- 导入 `getTagTypeStats` 工具函数
- 修改 `getFilterOptions` 方法，添加 `tagsByType` 字段
- 新增 `getTagTypes` 方法，支持按国家和分类筛选标签类型

#### `wanderlog_api/src/controllers/publicPlaceController.ts`
- 新增 `getTagTypes` 控制器方法

#### `wanderlog_api/src/routes/publicPlaceRoutes.ts`
- 新增 `/api/public-places/tag-types` 路由

## API 接口

### 1. 获取筛选选项（已增强）

**接口**: `GET /api/public-places/filter-options`

**响应**:
```json
{
  "success": true,
  "data": {
    "countries": [...],
    "citiesByCountry": {...},
    "categories": [...],
    "categoriesByCountry": {...},
    "sources": [...],
    "tags": [...],
    "tagsByType": [
      {
        "type": "architect",
        "label": "Architect",
        "labelZh": "建筑师",
        "count": 150,
        "tags": [
          {
            "name": "architect:Frank Lloyd Wright",
            "displayName": "Frank Lloyd Wright",
            "type": "architect",
            "count": 25
          },
          {
            "name": "architect:Le Corbusier",
            "displayName": "Le Corbusier",
            "type": "architect",
            "count": 18
          }
        ]
      },
      {
        "type": "style",
        "label": "Style",
        "labelZh": "风格",
        "count": 200,
        "tags": [
          {
            "name": "style:brutalism",
            "displayName": "brutalism",
            "type": "style",
            "count": 45
          }
        ]
      }
    ],
    "tagsByCountry": {...},
    "tagsByCategory": {...}
  }
}
```

### 2. 获取标签类型列表（新增）

**接口**: `GET /api/public-places/tag-types`

**查询参数**:
- `country` (可选): 按国家筛选
- `category` (可选): 按分类筛选

**示例**:
```bash
# 获取所有标签类型
GET /api/public-places/tag-types

# 按国家筛选
GET /api/public-places/tag-types?country=France

# 按分类筛选
GET /api/public-places/tag-types?category=Architecture

# 组合筛选
GET /api/public-places/tag-types?country=France&category=Architecture
```

**响应**:
```json
{
  "success": true,
  "data": {
    "tagsByType": [
      {
        "type": "architect",
        "label": "Architect",
        "labelZh": "建筑师",
        "count": 150,
        "tags": [
          {
            "name": "architect:Frank Lloyd Wright",
            "displayName": "Frank Lloyd Wright",
            "type": "architect",
            "count": 25
          }
        ]
      }
    ],
    "totalTags": 500,
    "totalCount": 1200
  }
}
```

## 标签类型定义

| 类型 | 英文标签 | 中文标签 | 前缀 | 示例 |
|------|---------|---------|------|------|
| architect | Architect | 建筑师 | `architect:` | architect:Frank Lloyd Wright |
| style | Style | 风格 | `style:` | style:brutalism |
| theme | Theme | 主题 | `theme:` | theme:feminism |
| award | Award | 奖项 | `pritzker`, `pritzker_year:` | pritzker, pritzker_year:2024 |
| domain | Domain | 领域 | `domain:` | domain:architecture |
| meal | Meal | 餐饮 | `meal:` | meal:brunch |
| shop | Shop | 商店 | `shop:` | shop:secondhand |
| type | Type | 类型 | `type:` | type:museum |
| other | Other | 其他 | - | 其他未分类标签 |

## 核心功能

### 1. 标签分类

根据标签前缀自动分类：

```typescript
classifyTag('architect:Frank Lloyd Wright') // 返回 'architect'
classifyTag('style:brutalism') // 返回 'style'
classifyTag('pritzker') // 返回 'award'
classifyTag('random-tag') // 返回 'other'
```

### 2. 显示名称提取

自动去除标签前缀：

```typescript
getTagDisplayName('architect:Frank Lloyd Wright') // 返回 'Frank Lloyd Wright'
getTagDisplayName('style:brutalism') // 返回 'brutalism'
getTagDisplayName('pritzker') // 返回 'pritzker'
```

### 3. 按类型分组

将标签列表按类型分组：

```typescript
const tags = [
  { name: 'architect:Frank Lloyd Wright', count: 25 },
  { name: 'style:brutalism', count: 45 },
  { name: 'architect:Le Corbusier', count: 18 }
];

const grouped = groupTagsByType(tags);
// 返回:
// {
//   architect: [
//     { name: 'architect:Frank Lloyd Wright', displayName: 'Frank Lloyd Wright', type: 'architect', count: 25 },
//     { name: 'architect:Le Corbusier', displayName: 'Le Corbusier', type: 'architect', count: 18 }
//   ],
//   style: [
//     { name: 'style:brutalism', displayName: 'brutalism', type: 'style', count: 45 }
//   ],
//   ...
// }
```

### 4. 类型统计

获取每个类型的统计信息：

```typescript
const stats = getTagTypeStats(tags);
// 返回:
// [
//   {
//     type: 'style',
//     label: 'Style',
//     labelZh: '风格',
//     count: 45,
//     tags: [...]
//   },
//   {
//     type: 'architect',
//     label: 'Architect',
//     labelZh: '建筑师',
//     count: 43,
//     tags: [...]
//   }
// ]
```

## 使用场景

### 场景 1: 后台管理界面

在后台管理界面中，先显示标签类型选择器，用户选择类型后再显示该类型下的具体标签。

```javascript
// 1. 获取标签类型
const response = await fetch('/api/public-places/tag-types');
const { data } = await response.json();

// 2. 显示标签类型选择器
data.tagsByType.forEach(typeInfo => {
  console.log(`${typeInfo.label} (${typeInfo.count})`);
});

// 3. 用户选择 "Architect" 后，显示该类型下的标签
const architectType = data.tagsByType.find(t => t.type === 'architect');
architectType.tags.forEach(tag => {
  console.log(`${tag.displayName} (${tag.count})`);
});
```

### 场景 2: 按国家筛选

查看特定国家的标签类型分布：

```javascript
const response = await fetch('/api/public-places/tag-types?country=France');
const { data } = await response.json();

// 显示法国的标签类型
data.tagsByType.forEach(typeInfo => {
  console.log(`${typeInfo.labelZh}: ${typeInfo.count} 个标签`);
});
```

### 场景 3: 按分类筛选

查看特定分类的标签类型分布：

```javascript
const response = await fetch('/api/public-places/tag-types?category=Architecture');
const { data } = await response.json();

// 显示建筑分类的标签类型
data.tagsByType.forEach(typeInfo => {
  console.log(`${typeInfo.label}: ${typeInfo.count} tags`);
});
```

## 测试

### 运行测试脚本

```bash
cd wanderlog_api
./test_tag_types_api.sh
```

### 手动测试

```bash
# 1. 启动后端服务
npm run dev

# 2. 测试获取所有标签类型
curl http://localhost:3000/api/public-places/tag-types | jq '.'

# 3. 测试按国家筛选
curl http://localhost:3000/api/public-places/tag-types?country=France | jq '.'

# 4. 测试按分类筛选
curl http://localhost:3000/api/public-places/tag-types?category=Architecture | jq '.'

# 5. 测试筛选选项（包含 tagsByType）
curl http://localhost:3000/api/public-places/filter-options | jq '.data.tagsByType'
```

## 前端集成示例

### React 示例

```typescript
import { useState, useEffect } from 'react';

interface TagType {
  type: string;
  label: string;
  labelZh: string;
  count: number;
  tags: Array<{
    name: string;
    displayName: string;
    type: string;
    count: number;
  }>;
}

function TagFilter() {
  const [tagTypes, setTagTypes] = useState<TagType[]>([]);
  const [selectedType, setSelectedType] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/public-places/tag-types')
      .then(res => res.json())
      .then(data => setTagTypes(data.data.tagsByType));
  }, []);

  const selectedTypeInfo = tagTypes.find(t => t.type === selectedType);

  return (
    <div>
      {/* 标签类型选择器 */}
      <div className="tag-types">
        <button onClick={() => setSelectedType(null)}>全部</button>
        {tagTypes.map(typeInfo => (
          <button
            key={typeInfo.type}
            onClick={() => setSelectedType(typeInfo.type)}
            className={selectedType === typeInfo.type ? 'active' : ''}
          >
            {typeInfo.labelZh} ({typeInfo.count})
          </button>
        ))}
      </div>

      {/* 标签列表 */}
      <div className="tags">
        {selectedTypeInfo ? (
          selectedTypeInfo.tags.map(tag => (
            <div key={tag.name}>
              {tag.displayName} ({tag.count})
            </div>
          ))
        ) : (
          <div>请选择标签类型</div>
        )}
      </div>
    </div>
  );
}
```

## 扩展标签类型

如果需要添加新的标签类型，只需在 `tagTypeClassifier.ts` 中添加：

```typescript
export const TAG_TYPES: Record<string, TagTypeInfo> = {
  // ... 现有类型 ...
  
  // 新增类型
  newType: {
    key: 'newType',
    label: 'New Type',
    labelZh: '新类型',
    prefixes: ['newtype:'],
  },
};
```

## 性能优化

1. **缓存**: 考虑对 `getTagTypes` 的结果进行缓存，减少数据库查询
2. **索引**: 确保 `country` 和 `categoryEn` 字段有索引
3. **分页**: 对于标签数量特别多的类型，可以考虑添加分页

## 总结

后端标签类型筛选功能已成功实现，提供了：

1. ✅ 自动标签分类（根据前缀）
2. ✅ 标签显示名称优化（去掉前缀）
3. ✅ 按类型分组的标签列表
4. ✅ 支持按国家和分类筛选
5. ✅ 双语支持（英文/中文）
6. ✅ 统计信息（每个类型的标签数量和总数）

现在后台管理界面可以使用这些 API 来实现更好的标签筛选体验！
