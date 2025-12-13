# Google Maps 收藏夹导入功能使用指南

## 功能概述

从 Google Maps 收藏夹/列表链接批量导入地点到公共地点库，支持自动去重（基于 Place ID）。

## 核心特性

✅ **智能链接解析**: 支持多种 Google Maps 链接格式  
✅ **自动去重**: 基于 Place ID 自动跳过已存在的地点  
✅ **批量导入**: 一次性导入整个收藏夹中的所有地点  
✅ **详细信息**: 自动获取地点的完整信息（名称、地址、评分、图片等）  
✅ **来源追踪**: 记录导入来源和时间

## API 端点

### 1. 从 Google Maps 链接导入

**POST** `/api/public-places/import-from-link`

从 Google Maps 收藏夹/列表链接批量导入地点。

**请求体:**
```json
{
  "url": "https://maps.app.goo.gl/xxxxx",
  "listName": "我的收藏夹",
  "listDescription": "巴黎旅行计划"
}
```

**支持的链接格式:**
- `https://maps.app.goo.gl/xxxxx` (短链接)
- `https://www.google.com/maps/d/xxxxx` (地图列表)
- `https://goo.gl/maps/xxxxx` (旧版短链接)
- 包含多个地点的 Google Maps URL

**响应示例:**
```json
{
  "success": true,
  "data": {
    "success": 5,
    "failed": 0,
    "skipped": 2,
    "errors": [],
    "placeIds": ["ChIJ...", "ChIJ...", ...]
  },
  "message": "Successfully imported 5 new places. 2 places already existed and were skipped."
}
```

### 2. 批量导入 Place IDs

**POST** `/api/public-places/import-by-place-ids`

手动输入多个 Place ID 进行批量导入。

**请求体:**
```json
{
  "placeIds": [
    "ChIJLU7jZClu5kcR4PcOOO6p3I0",
    "ChIJD3uTd9hx5kcR1IQvGfr8dbk"
  ],
  "sourceDetails": {
    "note": "手动导入的巴黎景点",
    "importedBy": "admin"
  }
}
```

**响应示例:**
```json
{
  "success": true,
  "data": {
    "success": 2,
    "failed": 0,
    "skipped": 0,
    "errors": []
  },
  "message": "Successfully imported 2 new places. 0 places already existed and were skipped."
}
```

## 使用方法

### 方法 1: 使用测试脚本（推荐）

1. **启动 API 服务**
```bash
cd /Users/bahaa/Desktop/bahaa-dev-repo/wanderlog
npm run dev  # 在 wanderlog_api 目录
```

2. **运行测试脚本**
```bash
./test_google_maps_import.sh
```

3. **按提示输入 Google Maps 链接**

### 方法 2: 使用 curl 命令

```bash
# 从链接导入
curl -X POST http://localhost:3000/api/public-places/import-from-link \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://maps.app.goo.gl/xxxxx",
    "listName": "我的收藏夹"
  }'

# 批量导入 Place IDs
curl -X POST http://localhost:3000/api/public-places/import-by-place-ids \
  -H "Content-Type: application/json" \
  -d '{
    "placeIds": ["ChIJLU7jZClu5kcR4PcOOO6p3I0"]
  }'
```

### 方法 3: 使用 Postman

导入 `PUBLIC_PLACES_API.postman_collection.json` 集合，包含以下请求：
- Import from Google Maps Link
- Import by Place IDs
- Get All Places
- Get Place by ID

## 如何获取 Google Maps 链接

### 方法 1: 从收藏夹分享

1. 打开 Google Maps
2. 点击左侧菜单 → "已保存"
3. 选择一个列表
4. 点击"分享"按钮
5. 复制分享链接

### 方法 2: 从地图列表

1. 在 Google Maps 创建或打开一个地图
2. 点击"分享"按钮
3. 复制分享链接

### 方法 3: 从搜索结果

1. 在 Google Maps 搜索地点
2. 复制浏览器地址栏的 URL（包含多个地点标记）

## 工作原理

```
用户提供链接
    ↓
解析链接（处理短链接重定向）
    ↓
提取 Place IDs
    ↓
检查数据库去重（基于 Place ID）
    ↓
调用 Google Maps API 获取详细信息
    ↓
批量导入新地点
    ↓
返回导入结果
```

## 去重逻辑

- **基于 Place ID**: Google Place ID 是全球唯一的标识符
- **自动跳过**: 已存在的地点会被自动跳过，不会重复导入
- **统计报告**: 返回成功、失败和跳过的地点数量

## 注意事项

1. **需要代理**: 如果在中国大陆，需要配置代理访问 Google Maps API
2. **API 限额**: Google Maps API 有调用限额，大量导入时注意配额
3. **链接格式**: 确保链接是公开的或已登录的账号有权限访问
4. **数据同步**: 导入的数据会包含当前的地点信息，但不会自动更新

## 常见问题

### Q: 支持哪些链接格式？
A: 支持 Google Maps 的各种分享链接，包括短链接、列表链接、地图链接等。

### Q: 会重复导入吗？
A: 不会。系统会基于 Place ID 自动去重，已存在的地点会被跳过。

### Q: 导入失败怎么办？
A: 检查以下几点：
- API 服务是否正常运行
- 代理配置是否正确
- Google Maps API Key 是否有效
- 链接是否可访问

### Q: 可以导入多少个地点？
A: 理论上没有限制，但受 Google Maps API 配额限制。建议分批导入大量地点。

## 示例数据

### 巴黎热门景点

```json
{
  "placeIds": [
    "ChIJLU7jZClu5kcR4PcOOO6p3I0",  // 埃菲尔铁塔
    "ChIJD3uTd9hx5kcR1IQvGfr8dbk",  // 卢浮宫
    "ChIJjx37cOxv5kcRP2sTGUlH3ok"   // 凯旋门
  ]
}
```

### 东京热门景点

```json
{
  "placeIds": [
    "ChIJCewJkL2LGGAR3Qmk0vCTGkg",  // 东京塔
    "ChIJ51cu8IcbXWARiRtXIothAS4",  // 东京迪士尼
    "ChIJ5SZMmrWLGGARcz8QSTtJxvw"   // 浅草寺
  ]
}
```

## 技术实现

### 核心服务

- **googleMapsFavoritesService.ts**: 链接解析和批量导入逻辑
- **googleMapsService.ts**: Google Maps API 交互
- **publicPlaceService.ts**: 公共地点数据管理

### 数据流

```typescript
// 1. 解析链接
const placeIds = await extractPlaceIdsFromLink(url);

// 2. 检查去重
const existingIds = await checkExistingPlaceIds(placeIds);
const newIds = placeIds.filter(id => !existingIds.includes(id));

// 3. 批量导入
for (const placeId of newIds) {
  const details = await googleMapsService.getPlaceDetails(placeId);
  await publicPlaceService.upsertPlace(details);
}
```

## 下一步

1. **启动 API 服务**: 运行 `npm run dev`
2. **准备 Google Maps 链接**: 从收藏夹或列表获取分享链接
3. **运行测试脚本**: `./test_google_maps_import.sh`
4. **查看导入结果**: 访问 `/api/public-places` 查看所有地点

## 相关文档

- [API 测试指南](./HOW_TO_TEST_API.md)
- [Google Maps API 配置](./GOOGLE_MAPS_SETUP.md)
- [公共地点库说明](./PUBLIC_PLACES_LIBRARY_README.md)
