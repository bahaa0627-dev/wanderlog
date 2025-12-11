# Google Maps Spots Import System

## 概述

这个系统可以将 Google Maps 标记的地点导入到 WanderLog 的地点库中，支持自动去重、评分同步、AI 总结生成等功能。

## 数据库表结构

### Spot 表字段

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String | 主键 (cuid) |
| googlePlaceId | String? | Google Place ID（唯一） |
| name | String | 地点名称 |
| city | String | 所在城市 |
| country | String | 所在国家 |
| latitude | Float | 纬度 |
| longitude | Float | 经度 |
| address | String? | 详细地址 |
| description | String? | 基本介绍 |
| openingHours | String? | 营业时间 (JSON) |
| rating | Float? | 当前评分 |
| ratingCount | Int? | 评分人数 |
| category | String? | 客观属性分类（博物馆、咖啡馆等） |
| aiSummary | String? | AI介绍（根据评价总结） |
| tags | String? | 标签组 (JSON array) |
| coverImage | String? | 封面图 URL |
| images | String? | 其他图片 URLs (JSON) |
| priceLevel | Int? | 价格等级 0-4 |
| website | String? | 网站 |
| phoneNumber | String? | 电话 |
| source | String | 数据来源 (google_maps/user_import) |
| isVerified | Boolean | 是否经过人工验证 |
| lastSyncedAt | DateTime? | 最后同步时间 |
| createdAt | DateTime | 创建时间 |
| updatedAt | DateTime | 更新时间 |

## API 端点

### 1. 批量导入地点
```typescript
POST /api/spots/import
Authorization: Bearer <token>
Content-Type: application/json

{
  "placeIds": ["ChIJIz2AXDxTUkYRuGeU5t1-3QQ", "ChIJa2FMlYZTUkYRZ5hVqhEP5qM"]
}

Response: {
  "message": "Import completed",
  "imported": 2,
  "skipped": 0,
  "errors": 0
}
```

### 2. 导入单个地点
```typescript
POST /api/spots/import-one
Authorization: Bearer <token>
Content-Type: application/json

{
  "placeId": "ChIJIz2AXDxTUkYRuGeU5t1-3QQ"
}

Response: {
  "message": "Spot imported successfully",
  "spot": { ... },
  "isDuplicate": false
}
```

### 3. 获取地点列表（支持筛选）
```typescript
GET /api/spots?city=Copenhagen&category=Museum&tags=architecture&limit=30

Response: {
  "count": 10,
  "spots": [ ... ]
}
```

查询参数：
- `city`: 城市名称
- `category`: 分类
- `tags`: 标签（逗号分隔）
- `search`: 搜索关键词
- `lat`, `lng`, `radius`: 地理位置筛选
- `limit`: 返回数量限制（默认30）

### 4. 获取单个地点详情
```typescript
GET /api/spots/:id

Response: {
  "id": "...",
  "name": "Design Museum",
  "city": "Copenhagen",
  ...
}
```

### 5. 获取城市中心地点（默认30个）
```typescript
GET /api/spots/city-center/copenhagen

Response: {
  "city": "Copenhagen",
  "center": { "lat": 55.6761, "lng": 12.5683 },
  "count": 30,
  "spots": [ ... ]
}
```

支持的城市：Copenhagen, Porto, Paris, Tokyo, Barcelona, Amsterdam

### 6. 同步地点数据（定时任务用）
```typescript
POST /api/spots/sync
Authorization: Bearer <token>

Response: {
  "message": "Sync completed",
  "updated": 25,
  "errors": 0
}
```

## 使用流程

### 步骤 1: 设置环境变量

在 `wanderlog_api/.env` 文件中添加：

```env
GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```

### 步骤 2: 获取 Place IDs

有两种方式获取 Google Place ID：

#### 方式 A: 从 Google Maps 保存的地点
1. 打开 Google Maps (maps.google.com)
2. 点击你保存的地点
3. 复制 URL 中的 Place ID（通常是 `ChI...` 格式）

#### 方式 B: 使用 Places API 搜索
```typescript
// 在 importCopenhagenSpots.ts 脚本中已经实现
const placeIds = await searchNearbyPlaces(55.6761, 12.5683, 'museum');
```

### 步骤 3: 运行导入脚本

```bash
cd wanderlog_api

# 安装依赖（如果还没有）
npm install

# 编译 TypeScript
npm run build

# 运行导入脚本
tsx src/scripts/importCopenhagenSpots.ts
```

### 步骤 4: 验证导入

```bash
# 检查数据库
npm run db:studio

# 或通过 API 查询
curl http://localhost:3000/api/spots/city-center/copenhagen
```

## 去重逻辑

系统会自动去重，基于以下规则：
- **地点名称** + **地址** 完全匹配（不区分大小写）
- 如果已存在，则跳过导入
- 返回 `{ skipped: 1, isDuplicate: true }`

## 数据同步机制

### 自动更新（计划中）

设置 cron job 在每周日晚上 22:00 更新数据：

```typescript
// 使用 node-cron
import cron from 'node-cron';

// 每周日 22:00
cron.schedule('0 22 * * 0', async () => {
  console.log('Starting weekly spots data sync...');
  // 调用 syncSpotData endpoint
});
```

### 手动更新

```bash
curl -X POST http://localhost:3000/api/spots/sync \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Flutter 地图页面

### Map Tab 功能

地图页面（`MapPage`）包含以下功能：

1. **城市选择器** - 左上角下拉菜单
2. **搜索框** - 搜索地点名称
3. **标签筛选** - 横向滚动的标签列表，支持多选
4. **地图显示** - Mapbox 地图展示地点标记
5. **Spot 卡片** - 点击标记后底部弹出 3:4 竖向卡片
6. **详情弹窗** - 点击卡片查看完整地点信息

### 地图标记样式

标记采用气泡样式：
- 白色背景 + 黑色边框
- 分类图标 + 地点名称
- 点击显示底部 Spot 卡片

### SpotCard 设计

- **尺寸**: 3:4 竖向
- **内容**: 封面图、标签（最多3个，不超过2行）、地点名称、星级评分、评分人数
- **样式**: 底部黑色渐变蒙层保证文字清晰度
- **交互**: 点击卡片打开详情弹窗

## 数据来源标识

系统会标记数据来源：

- `source: 'google_maps'` - 从 Google Maps API 导入
- `source: 'user_import'` - 用户自行导入

## 测试

### 测试导入单个地点

```bash
curl -X POST http://localhost:3000/api/spots/import-one \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"placeId": "ChIJIz2AXDxTUkYRuGeU5t1-3QQ"}'
```

### 测试查询

```bash
# 获取哥本哈根的所有博物馆
curl "http://localhost:3000/api/spots?city=Copenhagen&category=博物馆"

# 获取城市中心30个点
curl "http://localhost:3000/api/spots/city-center/copenhagen"
```

## 注意事项

1. **API 配额**: Google Places API 有使用限制，注意控制调用频率
2. **图片 URL**: 图片 URL 包含 API key，需要定期更新或使用代理
3. **评分更新**: 建议每周更新一次评分数据，避免过于频繁
4. **中文分类**: 分类使用中文（博物馆、咖啡馆等），便于中文用户理解

## 下一步计划

- [ ] 实现自动定时同步（cron job）
- [ ] 添加更多城市坐标配置
- [ ] 实现地图标记的实际显示（Mapbox annotations）
- [ ] 优化 AI 总结生成（接入真实 AI API）
- [ ] 添加用户可以从地图直接添加地点到行程
- [ ] 实现分享功能
- [ ] 添加地点收藏功能
