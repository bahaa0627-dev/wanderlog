# 图片识别地点落库 - 快速开始

## 🚀 快速使用

### 1. 准备配置文件

创建 `place-data.json`:
```json
{
  "name": "地点名称",
  "city": "城市",
  "country": "国家",
  "latitude": 纬度,
  "longitude": 经度,
  "address": "完整地址",
  "categorySlug": "landmark",
  "rating": 4.8,
  "ratingCount": 853,
  "website": "website.com",
  "phoneNumber": "+44 1234 567890",
  "description": "描述",
  "note": "从图片识别"
}
```

### 2. 运行命令

```bash
cd wanderlog_api
npx ts-node scripts/add-place-from-image.ts --config place-data.json
```

## 📋 必填字段

- ✅ `name` - 地点名称
- ✅ `city` - 城市
- ✅ `country` - 国家
- ✅ `latitude` - 纬度
- ✅ `longitude` - 经度

## 🏷️ 可选字段

- `address` - 完整地址
- `categorySlug` - 分类（见下方列表）
- `rating` - 评分 (0-5)
- `ratingCount` - 评分数量
- `description` - 描述
- `tags` - 标签 `{ google: [], others: [] }`
- `website` - 网站
- `phoneNumber` - 电话
- `openingHours` - 营业时间
- `note` - 备注

## 📂 有效分类

```
landmark        地标
museum          博物馆
art_gallery     美术馆
cafe            咖啡店
bakery          面包店
restaurant      餐馆
bar             酒吧
hotel           酒店
church          教堂
library         图书馆
bookstore       书店
park            公园
castle          城堡
market          市集
shop            商店
shopping_mall   商场
yarn_store      毛线店
thrift_store    二手店
cemetery        墓园
university      大学
temple          寺庙
zoo             动物园
```

## 💡 提示

1. **不指定分类** → 自动使用 `landmark`
2. **重复检测** → 相同名称+城市会提示已存在
3. **无需中文** → 不需要添加中文标签或 AI 标签
4. **完整文档** → 查看 `scripts/README_ADD_PLACE.md`

## 📝 完整示例

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
  "description": "Iconic English-language bookshop",
  "tags": {
    "google": ["bookstore"],
    "others": ["literary", "historic"]
  },
  "website": "shakespeareandcompany.com",
  "phoneNumber": "+33 1 43 25 40 93",
  "note": "从 Google Maps 图片识别"
}
```

## 🎯 实际案例

### Hedsor House（已添加）

```bash
npx ts-node scripts/add-place-from-image.ts \
  --name "Hedsor House" \
  --city "Maidenhead" \
  --country "United Kingdom" \
  --lat 51.5642044 \
  --lng -0.7004869 \
  --address "Taplow, Hedsor, Maidenhead SL6 0HX, UK" \
  --category "landmark" \
  --rating 4.8 \
  --rating-count 853 \
  --website "hedsor.com" \
  --phone "+44 1628 819050"
```

✅ 数据库 ID: `fa7ee41d-f937-4dfc-ae55-1d183b5ade4d`
