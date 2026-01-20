# 增强版 Mocation 爬虫使用指南

## 功能特点

### ✅ 已实现
1. **完整地点数据爬取** - 爬取 movie 页面的所有地点
2. **城市国家分离** - 自动将"那不勒斯 意大利"分离为 city: "那不勒斯", country: "Italy"
3. **国家名称英文化** - 自动将中文国家名转换为英文（意大利 → Italy）
4. **封面图使用 movie 页图片** - coverImage 使用 movie 页的剧照，不使用 place 页首图
5. **场景图片数组** - sceneImages 包含所有剧照
6. **剧集和时间戳** - 保留 episode 和 position 信息

### 🔄 需要配置 Google Places API
以下功能需要 Google Places API Key：
1. **坐标获取** - latitude, longitude
2. **详细地址** - address
3. **电话号码** - phoneNumber
4. **网站** - website
5. **分类** - category (中文), categoryEn (英文)

## 配置步骤

### 1. 获取 Google Places API Key

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建新项目或选择现有项目
3. 启用 "Places API"
4. 创建 API 凭据（API Key）
5. 复制 API Key

### 2. 配置环境变量

在 `wanderlog_api/.env` 文件中添加：

```bash
GOOGLE_PLACES_API_KEY=your_api_key_here
```

### 3. 运行爬虫

```bash
# 爬取指定电影
npx tsx wanderlog_api/scrape-movie-enhanced.ts <movie_id> [output_file]

# 示例：爬取电影 5448
npx tsx wanderlog_api/scrape-movie-enhanced.ts 5448

# 指定输出文件
npx tsx wanderlog_api/scrape-movie-enhanced.ts 5448 my-output.json
```

## 输出数据结构

```json
{
  "movieId": "5448",
  "movieNameCn": "我的天才女友 第二季",
  "movieNameEn": "My Brilliant Friend Season 2",
  "sourceUrl": "https://prd.mocation.cc/html/movie_detail.html?id=5448",
  "placeCount": 33,
  "places": [
    {
      "name": "格拉维纳宫",
      "nameEn": "Palazzo Gravina",
      "nameZh": "格拉维纳宫",
      "city": "那不勒斯",
      "country": "Italy",
      "latitude": 40.8467,
      "longitude": 14.2533,
      "address": "Via Monteoliveto, 3, 80134 Napoli NA, Italy",
      "phoneNumber": "+39 081 551 7352",
      "category": "博物馆",
      "categoryEn": "Museum",
      "website": "https://example.com",
      "coverImage": "http://cache.fotoplace.cc/mocation/...",
      "sceneImages": ["http://cache.fotoplace.cc/mocation/..."],
      "sceneDescription": "高中内景",
      "episode": "2",
      "position": "39:31"
    }
  ],
  "scrapedAt": "2026-01-20T16:00:00.000Z"
}
```

## 数据字段说明

### 地点信息
- `name`: 地点中文名（主要名称）
- `nameEn`: 地点英文名
- `nameZh`: 地点中文名（备份）
- `city`: 城市名（保留原文，如"那不勒斯"）
- `country`: 国家名（英文，如"Italy"）

### 地理信息（需要 Google Places API）
- `latitude`: 纬度
- `longitude`: 经度
- `address`: 完整地址
- `phoneNumber`: 电话号码
- `website`: 官方网站

### 分类信息（需要 Google Places API）
- `category`: 中文分类（如"博物馆"）
- `categoryEn`: 英文分类（如"Museum"）

### 图片信息
- `coverImage`: 封面图（来自 movie 页的剧照）
- `sceneImages`: 场景图片数组（所有剧照）

### 剧集信息
- `sceneDescription`: 场景描述
- `episode`: 集数
- `position`: 时间戳

## 分类映射

脚本会自动将 Google Places 的 types 映射为中英文分类：

| Google Type | 英文分类 | 中文分类 |
|------------|---------|---------|
| museum | Museum | 博物馆 |
| art_gallery | Art Gallery | 美术馆 |
| church | Church | 教堂 |
| cafe | Cafe | 咖啡馆 |
| restaurant | Restaurant | 餐厅 |
| hotel | Hotel | 酒店 |
| tourist_attraction | Tourist Attraction | 景点 |
| park | Park | 公园 |
| library | Library | 图书馆 |
| book_store | Bookstore | 书店 |
| store | Store | 商店 |
| school | School | 学校 |
| university | University | 大学 |
| beach | Beach | 海滩 |
| bridge | Bridge | 桥梁 |
| plaza | Plaza | 广场 |
| street | Street | 街道 |

## 导入到数据库

爬取完成后，需要创建一个新的导入脚本来处理增强版数据：

```bash
# TODO: 创建 import-enhanced-mocation.ts
npx tsx wanderlog_api/scripts/import-enhanced-mocation.ts \
  wanderlog_api/mocation-movie-5448-enhanced.json \
  --upload-r2
```

## 注意事项

### Google Places API 配额
- 免费配额：每月 $200 美元额度
- Text Search: $32 / 1000 requests
- Place Details: $17 / 1000 requests
- 每个地点需要 2 次 API 调用（Search + Details）
- 33 个地点 ≈ 66 次调用 ≈ $1.62

### 速率限制
- 脚本已内置 1 秒延迟
- 避免触发 Google API 速率限制
- 大批量爬取建议分批进行

### 数据准确性
- Google Places 数据可能不完全匹配
- 建议人工审核关键地点
- 特别是历史建筑和小众地点

## 下一步工作

1. ✅ 基础爬虫功能
2. ✅ 城市国家分离
3. ✅ 封面图使用 movie 页图片
4. 🔄 配置 Google Places API Key
5. ⏳ 测试 Google Places 数据获取
6. ⏳ 创建增强版数据导入脚本
7. ⏳ 批量爬取多个电影
8. ⏳ 数据质量验证和清洗

## 相关文件

- `wanderlog_api/scrape-movie-enhanced.ts` - 增强版爬虫脚本
- `wanderlog_api/mocation-movie-5448-enhanced.json` - 输出数据示例
- `wanderlog_api/.env` - 环境变量配置
