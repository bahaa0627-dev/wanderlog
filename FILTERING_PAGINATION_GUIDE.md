# 公共地点 API - 分页与筛选功能指南

## 📋 功能概述

公共地点 API 现已支持强大的分页和多维度筛选功能，让您可以高效地浏览和查找数据库中的 300+ 个地点。

## 🎯 核心功能

### 1. 分页功能
- **默认每页**: 50 条记录
- **手动跳页**: 支持直接跳转到任意页码
- **页码信息**: 返回当前页、总页数、总记录数

### 2. 筛选维度
✅ **国家筛选** (`country`)
✅ **城市筛选** (`city`)
✅ **分类筛选** (`category`)
✅ **名称搜索** (`search`) - 支持名称和地址模糊匹配
✅ **评分区间** (`minRating`, `maxRating`) - 支持精确的星级筛选
✅ **数据来源** (`source`) - 区分手动添加或自动导入

## 📡 API 使用示例

### 基础查询

#### 1. 获取第一页（默认 50 条）
```bash
curl 'http://localhost:3000/api/public-places?page=1&limit=50'
```

**响应示例**:
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 311,
    "pages": 7
  }
}
```

#### 2. 跳转到指定页
```bash
# 跳到第 5 页
curl 'http://localhost:3000/api/public-places?page=5&limit=50'
```

### 单一筛选条件

#### 3. 按国家筛选
```bash
# 查看丹麦的所有地点
curl 'http://localhost:3000/api/public-places?country=Denmark&limit=10'

# 结果: 205 个丹麦地点
```

#### 4. 按城市筛选
```bash
# 查看清迈的所有地点
curl 'http://localhost:3000/api/public-places?city=Chiang%20Mai&limit=10'

# 结果: 103 个清迈地点
```

#### 5. 按分类筛选
```bash
# 查看所有咖啡馆
curl 'http://localhost:3000/api/public-places?category=cafe&limit=10'

# 结果: 27 个咖啡馆
```

#### 6. 名称搜索
```bash
# 搜索包含 "museum" 的地点（名称或地址）
curl 'http://localhost:3000/api/public-places?search=museum&limit=10'

# 结果示例:
# - SMK – Statens Museum for Kunst
# - Designmuseum Danmark
# - Louisiana Museum of Modern Art
# - National Museum of Denmark
```

#### 7. 评分区间筛选
```bash
# 查找 4.5-5.0 星的高分地点
curl 'http://localhost:3000/api/public-places?minRating=4.5&maxRating=5.0&limit=10'

# 结果: 135 个高分地点

# 查找 3.0-4.0 星的地点
curl 'http://localhost:3000/api/public-places?minRating=3.0&maxRating=4.0&limit=10'

# 结果: 35 个中等评分地点
```

### 组合筛选

#### 8. 多条件组合
```bash
# 泰国 + 咖啡馆 + 4.0+ 星 + 包含 "coffee"
curl 'http://localhost:3000/api/public-places?country=Thailand&category=cafe&minRating=4.0&search=coffee&limit=10'

# 结果: 3 个符合条件的咖啡馆
# - Huan Kaew Coffee (⭐4.9)
# - Kalm Coffee (⭐4.4)
# - Republic Coffee (⭐4.8)
```

#### 9. 城市 + 分类 + 评分
```bash
# 哥本哈根的高分餐厅（4.5+ 星）
curl 'http://localhost:3000/api/public-places?city=København&category=restaurant&minRating=4.5&limit=10'
```

#### 10. 搜索 + 分页
```bash
# 搜索 "park"，查看第 2 页
curl 'http://localhost:3000/api/public-places?search=park&page=2&limit=20'
```

## 🔧 参数详解

| 参数 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `page` | number | 页码（从 1 开始） | `?page=3` |
| `limit` | number | 每页记录数（默认 50） | `?limit=20` |
| `country` | string | 国家名称（精确匹配） | `?country=Thailand` |
| `city` | string | 城市名称（精确匹配，需 URL 编码） | `?city=Chiang%20Mai` |
| `category` | string | 分类名称 | `?category=cafe` |
| `source` | string | 数据来源 | `?source=google_maps_link` |
| `search` | string | 名称/地址模糊搜索 | `?search=museum` |
| `minRating` | number | 最低评分（包含） | `?minRating=4.5` |
| `maxRating` | number | 最高评分（包含） | `?maxRating=5.0` |

## 📊 当前数据统计

```bash
# 查看统计信息
curl 'http://localhost:3000/api/public-places/stats'
```

**数据分布**:
- **总地点数**: 311
- **国家分布**: 
  - Denmark: 205 个地点
  - Thailand: 103 个地点
  - France: 2 个地点（手动添加）
- **主要分类**:
  - point_of_interest: 49
  - food: 42
  - store: 39
  - cafe: 27
  - restaurant: 23

## 💡 使用技巧

### 1. 高效浏览
```bash
# 默认分页（每页 50 条）可以快速浏览全部数据
# 总共 7 页，最后一页只有 11 条记录
for page in {1..7}; do
  curl "http://localhost:3000/api/public-places?page=$page&limit=50"
done
```

### 2. 精确定位
```bash
# 组合多个筛选条件快速找到目标地点
curl 'http://localhost:3000/api/public-places?country=Thailand&category=cafe&minRating=4.5&search=coffee'
```

### 3. 数据探索
```bash
# 先按国家分组了解数据分布
curl 'http://localhost:3000/api/public-places/stats'

# 然后针对性查询特定国家/城市
curl 'http://localhost:3000/api/public-places?country=Denmark&category=tourist_attraction'
```

## 🎨 前端集成示例

### React 示例
```typescript
const [places, setPlaces] = useState([]);
const [pagination, setPagination] = useState({});
const [filters, setFilters] = useState({
  page: 1,
  limit: 50,
  country: '',
  city: '',
  category: '',
  search: '',
  minRating: null,
  maxRating: null
});

const fetchPlaces = async () => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.append(key, value.toString());
  });
  
  const res = await fetch(`/api/public-places?${params}`);
  const data = await res.json();
  
  setPlaces(data.data);
  setPagination(data.pagination);
};

// 跳转页面
const goToPage = (page: number) => {
  setFilters({ ...filters, page });
};

// 应用筛选
const applyFilters = (newFilters: any) => {
  setFilters({ ...filters, ...newFilters, page: 1 }); // 重置到第一页
};
```

### Flutter 示例
```dart
class PublicPlaceFilters {
  int page;
  int limit;
  String? country;
  String? city;
  String? category;
  String? search;
  double? minRating;
  double? maxRating;
  
  Map<String, dynamic> toQueryParams() {
    final params = <String, dynamic>{
      'page': page,
      'limit': limit,
    };
    if (country != null) params['country'] = country;
    if (city != null) params['city'] = city;
    if (category != null) params['category'] = category;
    if (search != null) params['search'] = search;
    if (minRating != null) params['minRating'] = minRating;
    if (maxRating != null) params['maxRating'] = maxRating;
    return params;
  }
}

Future<PlaceListResult> fetchPlaces(PublicPlaceFilters filters) async {
  final uri = Uri.parse('http://localhost:3000/api/public-places')
      .replace(queryParameters: filters.toQueryParams());
  
  final response = await http.get(uri);
  final data = json.decode(response.body);
  
  return PlaceListResult(
    places: (data['data'] as List).map((e) => PublicPlace.fromJson(e)).toList(),
    pagination: Pagination.fromJson(data['pagination']),
  );
}
```

## 🔍 常见查询场景

### 场景 1: 旅行规划
```bash
# 找到清迈所有 4.5+ 星的餐厅和咖啡馆
curl 'http://localhost:3000/api/public-places?city=Chiang%20Mai&minRating=4.5&limit=50' \
  | jq '.data[] | select(.category == "restaurant" or .category == "cafe") | {name, rating, category}'
```

### 场景 2: 博物馆探索
```bash
# 搜索所有博物馆，按评分排序
curl 'http://localhost:3000/api/public-places?search=museum&limit=20'
```

### 场景 3: 城市美食地图
```bash
# 哥本哈根的所有餐饮场所（餐厅 + 咖啡馆 + 酒吧）
curl 'http://localhost:3000/api/public-places?city=København&limit=100' \
  | jq '.data[] | select(.category | test("restaurant|cafe|bar")) | {name, category, rating, address}'
```

### 场景 4: 高分地点清单
```bash
# 获取所有 4.8+ 星的地点（任何国家）
curl 'http://localhost:3000/api/public-places?minRating=4.8&limit=50'
```

## 🚀 性能说明

- **查询速度**: 所有筛选条件都在数据库层面执行，响应时间 < 100ms
- **索引优化**: 已为常用字段（country, city, category, rating）添加索引
- **分页效率**: 使用 `skip/take` 实现高效分页，即使在大数据集下也能保持性能

## 📝 更新日志

**v1.1.0** (2025-12-14)
- ✨ 新增名称搜索功能（`search` 参数）
- ✨ 新增评分区间筛选（`minRating`, `maxRating`）
- ✨ 调整默认分页大小为 50 条/页
- 🐛 修复 SQLite 不支持 `mode: 'insensitive'` 的问题
- 📚 完善 API 文档和使用示例

**v1.0.0** (2025-12-13)
- 🎉 初始版本发布
- ✅ 基础分页功能
- ✅ 国家、城市、分类、来源筛选

## 🔗 相关文档

- [公共地点导入指南](./PUBLIC_PLACES_QUICK_START.md)
- [API 测试指南](./TEST_PUBLIC_PLACES_COMPLETE.md)
- [Google Maps 导入](./QUICK_START_GOOGLE_MAPS_IMPORT.md)

---

**提示**: 所有查询参数都是可选的，可以根据需要自由组合使用！
