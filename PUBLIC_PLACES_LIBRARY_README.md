# 公共地点库 - Public Places Library

## 概述

公共地点库是 Wanderlog 的核心功能之一，用于存储和管理全球的地点信息。系统支持三种导入方式：

1. **Google Maps 收藏链接导入** - 通过 Apify 爬虫提取链接中的地点
2. **图片识别导入** - 使用 AI 识别图片中的地点
3. **对话导入** - 通过 AI 对话推荐地点

## 核心特性

- ✅ **唯一性保证**：基于 Google Place ID 去重，确保每个地点全球唯一
- ✅ **多源导入**：支持链接、图片、对话三种导入方式
- ✅ **自动同步**：可定期同步 Google Maps 最新数据
- ✅ **AI 增强**：自动生成风格标签和描述
- ✅ **可视化管理**：通过 Prisma Studio 可视化编辑
- ✅ **扩展性强**：支持自定义字段扩展

## 数据模型

### PublicPlace 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | String | 数据库内部 ID |
| `placeId` | String (unique) | Google Place ID，全球唯一标识符 |
| `name` | String | 地点名称 |
| `latitude` | Float | 纬度 |
| `longitude` | Float | 经度 |
| `address` | String | 详细地址 |
| `city` | String | 所在城市 |
| `country` | String | 所在国家 |
| `category` | String | 分类（博物馆、咖啡馆等） |
| `coverImage` | String | 封面图 URL |
| `images` | String (JSON) | 图片数组 |
| `rating` | Float | Google 评分 |
| `ratingCount` | Int | 评分人数 |
| `priceLevel` | Int | 价格等级 (0-4) |
| `openingHours` | String (JSON) | 营业时间 |
| `website` | String | 官网 |
| `phoneNumber` | String | 电话 |
| `aiTags` | String (JSON) | AI 生成的风格标签 |
| `aiSummary` | String | AI 生成的简介 |
| `aiDescription` | String | AI 生成的详细描述 |
| `source` | String | 数据来源 |
| `sourceDetails` | String (JSON) | 来源详情 |
| `isVerified` | Boolean | 是否人工验证 |
| `lastSyncedAt` | DateTime | 最后同步时间 |
| `customFields` | String (JSON) | 自定义扩展字段 |

## API 端点

### 查询地点

```
GET /api/public-places
GET /api/public-places/:placeId
GET /api/public-places/search?q=keyword
GET /api/public-places/stats
```

### 导入地点

#### 1. 从 Google Maps 链接导入
```
POST /api/public-places/import-from-link
Body: { "url": "https://www.google.com/maps/saved/..." }
```

#### 2. 从图片导入
```
POST /api/public-places/import-from-image
Body: { "imageUrl": "https://example.com/image.jpg" }
```

#### 3. 从对话导入
```
POST /api/public-places/import-from-chat
Body: { 
  "message": "我想找哥本哈根的浪漫咖啡馆",
  "city": "Copenhagen",
  "country": "Denmark"
}
```

#### 4. 手动添加（通过 place_id）
```
POST /api/public-places/add-by-place-id
Body: { "placeId": "ChIJ..." }
```

### 管理地点

```
PUT /api/public-places/:placeId        # 更新地点
DELETE /api/public-places/:placeId     # 删除地点
POST /api/public-places/:placeId/sync  # 同步 Google 数据
POST /api/public-places/:placeId/generate-tags  # 生成 AI 标签
```

## 环境变量配置

在 `.env` 文件中配置以下变量：

```env
# Google Maps API
GOOGLE_MAPS_API_KEY=your_google_maps_api_key

# Apify（用于爬取 Google Maps 链接）
APIFY_API_TOKEN=your_apify_api_token
APIFY_ACTOR_ID=compass/google-maps-scraper

# AI 服务（至少配置一个）
OPENAI_API_KEY=your_openai_api_key
GEMINI_API_KEY=your_gemini_api_key
PREFERRED_AI_MODEL=openai  # 或 gemini

# Database
DATABASE_URL=file:./dev.db
```

## 快速开始

### 1. 安装依赖

```bash
cd wanderlog_api
npm install
```

### 2. 生成数据库迁移

```bash
npm run db:migrate
```

### 3. 启动 Prisma Studio（可视化管理）

```bash
npm run db:studio
```

访问 http://localhost:5555 查看和编辑数据库

### 4. 启动 API 服务器

```bash
npm run dev
```

## 使用示例

### 示例 1：从 Google Maps 链接导入

```bash
curl -X POST http://localhost:3000/api/public-places/import-from-link \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.google.com/maps/saved/..."
  }'
```

### 示例 2：从图片识别导入

```bash
curl -X POST http://localhost:3000/api/public-places/import-from-image \
  -H "Content-Type: application/json" \
  -d '{
    "imageUrl": "https://example.com/eiffel-tower.jpg"
  }'
```

### 示例 3：通过对话导入

```bash
curl -X POST http://localhost:3000/api/public-places/import-from-chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "推荐巴黎的必去景点",
    "city": "Paris",
    "country": "France"
  }'
```

### 示例 4：搜索地点

```bash
curl http://localhost:3000/api/public-places/search?q=咖啡馆
```

### 示例 5：更新地点

```bash
curl -X PUT http://localhost:3000/api/public-places/ChIJ... \
  -H "Content-Type: application/json" \
  -d '{
    "name": "新地点名称",
    "category": "咖啡馆",
    "aiTags": ["romantic", "cozy", "wifi"]
  }'
```

## 数据流程说明

### 流程 1：Google Maps 链接导入

```
用户提供链接
    ↓
Apify 爬虫提取 place_id 列表
    ↓
批量调用 Google Maps API 获取详情
    ↓
去重检查（基于 place_id）
    ↓
存入 PublicPlace 数据库
```

### 流程 2：图片识别导入

```
用户上传图片
    ↓
ChatGPT/Gemini 识别地点名称
    ↓
Google Maps Text Search 搜索 place_id
    ↓
获取详细信息
    ↓
AI 生成标签和描述
    ↓
存入 PublicPlace 数据库
```

### 流程 3：对话导入

```
用户发送需求文字
    ↓
ChatGPT/Gemini 推荐地点名称列表
    ↓
逐个搜索 Google Maps 获取 place_id
    ↓
批量获取详细信息
    ↓
存入 PublicPlace 数据库
```

## 去重机制

系统通过 `placeId` 字段（Google Place ID）实现去重：

- Google Place ID 是全球唯一的地点标识符
- 数据库中 `placeId` 设置了 `@unique` 约束
- 使用 `upsert` 操作：存在则更新，不存在则创建
- 确保同一地点（如"大本钟"）只有一个记录

## Prisma Studio 使用

Prisma Studio 是一个可视化数据库管理工具：

1. 启动：`npm run db:studio`
2. 访问：http://localhost:5555
3. 功能：
   - 查看所有表和数据
   - 搜索、筛选、排序
   - 添加、编辑、删除记录
   - 查看关系数据
   - 支持复杂查询

## 扩展性

### 添加自定义字段

使用 `customFields` JSON 字段存储自定义数据：

```javascript
{
  "customFields": {
    "visitorsPerYear": 1000000,
    "bestSeasonToVisit": "Spring",
    "wheelchairAccessible": true,
    "parkingAvailable": true
  }
}
```

### 添加新的数据源

在 `source` 字段中添加新的来源类型，如：

- `instagram_import`
- `tiktok_import`
- `user_submission`

## 维护建议

1. **定期同步**：每周同步 Google Maps 数据以保持最新
2. **AI 标签更新**：定期为老数据生成 AI 标签
3. **数据验证**：人工审核高流量地点，标记 `isVerified`
4. **性能优化**：定期清理无效图片链接
5. **备份**：定期备份数据库

## 技术栈

- **数据库**：SQLite (Prisma ORM)
- **API**：Express.js + TypeScript
- **Google Maps**：Places API, Text Search, Place Details
- **Apify**：Web Scraping 服务
- **AI**：OpenAI GPT-4, Google Gemini
- **可视化**：Prisma Studio

## 故障排查

### 问题 1：Apify 超时

- 检查网络连接
- 增加 `maxWaitTime` 参数
- 验证 API Token

### 问题 2：AI 识别失败

- 确认 API Key 配置正确
- 检查图片 URL 是否可访问
- 尝试切换 AI 模型（OpenAI ↔ Gemini）

### 问题 3：Google Maps 配额不足

- 升级 Google Cloud 账户
- 减少同步频率
- 使用缓存机制

## 未来计划

- [ ] 支持批量图片上传
- [ ] 添加地点推荐算法
- [ ] 实现地点关联网络
- [ ] 支持用户评论和评分
- [ ] 多语言支持
- [ ] 移动端应用集成

## 许可证

MIT License
