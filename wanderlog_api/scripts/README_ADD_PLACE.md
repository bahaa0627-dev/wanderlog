# 从图片识别添加地点 - 使用指南

## 功能说明

`add-place-from-image.ts` 是一个通用工具，用于将从图片识别的地点信息添加到数据库。

## 使用方式

### 方式 1: 使用 JSON 配置文件（推荐）

1. 创建配置文件 `place-data.json`：

```json
{
  "name": "Hedsor House",
  "city": "Maidenhead",
  "country": "United Kingdom",
  "latitude": 51.5642044,
  "longitude": -0.7004869,
  "address": "Taplow, Hedsor, Maidenhead SL6 0HX, United Kingdom",
  "rating": 4.8,
  "ratingCount": 853,
  "categorySlug": "landmark",
  "description": "Grand Victorian country house in a parkland setting, hosting weddings, conferences and film shoots.",
  "tags": {
    "google": ["wedding_venue", "event_space"],
    "others": ["historic", "countryside", "exclusive"]
  },
  "website": "hedsor.com",
  "phoneNumber": "+44 1628 819050",
  "note": "从 Google Maps 图片识别"
}
```

2. 运行命令：

```bash
cd wanderlog_api
npx ts-node scripts/add-place-from-image.ts --config place-data.json
```

### 方式 2: 命令行参数

```bash
npx ts-node scripts/add-place-from-image.ts \
  --name "Hedsor House" \
  --city "Maidenhead" \
  --country "United Kingdom" \
  --lat 51.5642044 \
  --lng -0.7004869 \
  --address "Taplow, Hedsor, Maidenhead SL6 0HX, United Kingdom" \
  --category "landmark" \
  --rating 4.8 \
  --rating-count 853 \
  --website "hedsor.com" \
  --phone "+44 1628 819050" \
  --description "Grand Victorian country house..." \
  --note "From image"
```

### 方式 3: 在代码中调用

```typescript
import { addPlaceFromImage } from './scripts/add-place-from-image';

await addPlaceFromImage({
  name: "Hedsor House",
  city: "Maidenhead",
  country: "United Kingdom",
  latitude: 51.5642044,
  longitude: -0.7004869,
  address: "Taplow, Hedsor, Maidenhead SL6 0HX, United Kingdom",
  rating: 4.8,
  ratingCount: 853,
  categorySlug: "landmark",
  website: "hedsor.com",
  phoneNumber: "+44 1628 819050"
});
```

## 字段说明

### 必填字段
- `name` - 地点名称
- `city` - 城市
- `country` - 国家
- `latitude` - 纬度
- `longitude` - 经度

### 可选字段
- `address` - 完整地址
- `categorySlug` - 分类（默认: landmark）
- `rating` - 评分 (0-5)
- `ratingCount` - 评分数量
- `description` - 描述
- `tags` - 标签对象 `{ google: [], others: [] }`
- `website` - 网站
- `phoneNumber` - 电话号码
- `openingHours` - 营业时间（JSON 对象）
- `imageUrl` - 图片 URL
- `note` - 备注信息

## 有效的分类 (categorySlug)

```
landmark, museum, art_gallery, shopping_mall, cafe, bakery,
restaurant, bar, hotel, church, library, bookstore, cemetery,
park, castle, market, shop, yarn_store, thrift_store,
university, temple, zoo
```

如果不指定或指定无效分类，默认使用 `landmark`。

## 示例配置文件

### 示例 1: 简单地点
```json
{
  "name": "Central Park",
  "city": "New York",
  "country": "United States",
  "latitude": 40.785091,
  "longitude": -73.968285,
  "categorySlug": "park"
}
```

### 示例 2: 完整信息
```json
{
  "name": "Shakespeare and Company",
  "city": "Paris",
  "country": "France",
  "latitude": 48.8525,
  "longitude": 2.3470,
  "address": "37 Rue de la Bûcherie, 75005 Paris, France",
  "categorySlug": "bookstore",
  "rating": 4.6,
  "ratingCount": 12453,
  "description": "Iconic English-language bookshop with literary history",
  "tags": {
    "google": ["bookstore", "tourist_attraction"],
    "others": ["literary", "historic", "indie"]
  },
  "website": "shakespeareandcompany.com",
  "phoneNumber": "+33 1 43 25 40 93",
  "openingHours": {
    "monday": "10:00-22:00",
    "tuesday": "10:00-22:00",
    "wednesday": "10:00-22:00",
    "thursday": "10:00-22:00",
    "friday": "10:00-22:00",
    "saturday": "10:00-22:00",
    "sunday": "10:00-22:00"
  },
  "note": "从 Google Maps 图片识别"
}
```

## 注意事项

1. **分类映射**: 必须使用有效的 `category_slug`，不能自定义分类名称
2. **去重检测**: 脚本会自动检查是否已存在相同名称和城市的地点
3. **标签结构**: 不需要添加中文标签或 AI 标签
4. **坐标精度**: 建议使用至少 6 位小数的精度

## 故障排除

### 错误: "Missing required fields"
确保提供了所有必填字段: name, city, country, latitude, longitude

### 警告: "Place already exists"
数据库中已存在相同名称和城市的地点，使用更新脚本代替

### 分类显示为 "landmark"
指定的 categorySlug 无效，已自动使用默认值
