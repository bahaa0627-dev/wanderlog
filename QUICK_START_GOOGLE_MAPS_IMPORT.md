# 🎯 Google Maps 收藏夹导入 - 快速开始

## 功能已完成 ✅

从 Google Maps 收藏夹链接批量导入地点到公共地点库，支持自动 Place ID 去重。

## 使用步骤

### 1️⃣ 启动 API 服务

```bash
cd /Users/bahaa/Desktop/bahaa-dev-repo/wanderlog
npm run dev  # 在 wanderlog_api 目录
```

服务将在 `http://localhost:3000` 启动

### 2️⃣ 导入地点

#### 方式 A: 从 Google Maps 链接导入

```bash
curl -X POST http://localhost:3000/api/public-places/import-from-link \
  -H "Content-Type: application/json" \
  -d '{
    "url": "你的 Google Maps 收藏夹链接",
    "listName": "收藏夹名称",
    "listDescription": "收藏夹描述"
  }'
```

#### 方式 B: 手动输入 Place IDs

```bash
curl -X POST http://localhost:3000/api/public-places/import-by-place-ids \
  -H "Content-Type: application/json" \
  -d '{
    "placeIds": [
      "ChIJLU7jZClu5kcR4PcOOO6p3I0",
      "ChIJD3uTd9hx5kcR1IQvGfr8dbk"
    ]
  }'
```

#### 方式 C: 使用测试脚本

```bash
./test_google_maps_import.sh
```

### 3️⃣ 查看导入结果

```bash
# 查看所有地点
curl http://localhost:3000/api/public-places

# 查看统计
curl http://localhost:3000/api/public-places/stats
```

## API 端点

### 📍 POST `/api/public-places/import-from-link`
从 Google Maps 收藏夹链接导入地点

**请求:**
```json
{
  "url": "https://maps.app.goo.gl/xxxxx",
  "listName": "我的收藏夹",
  "listDescription": "描述"
}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "success": 5,      // 成功导入的新地点数
    "failed": 0,       // 失败数
    "skipped": 2,      // 已存在被跳过的数量
    "errors": [],
    "placeIds": ["..."]
  },
  "message": "Successfully imported 5 new places. 2 places already existed and were skipped."
}
```

### 📍 POST `/api/public-places/import-by-place-ids`
批量导入 Place IDs

**请求:**
```json
{
  "placeIds": ["ChIJ...", "ChIJ..."],
  "sourceDetails": {
    "note": "备注",
    "importedBy": "导入者"
  }
}
```

### 📍 GET `/api/public-places`
获取所有公共地点（支持分页和筛选）

**查询参数:**
- `page`: 页码（默认 1）
- `limit`: 每页数量（默认 50）
- `city`: 按城市筛选
- `country`: 按国家筛选
- `category`: 按分类筛选
- `source`: 按来源筛选

### 📍 GET `/api/public-places/stats`
获取统计信息

## 如何获取 Google Maps 收藏夹链接

### 方法 1: 从收藏夹
1. 打开 Google Maps
2. 点击左侧菜单 → "已保存"
3. 选择一个列表
4. 点击"分享"按钮
5. 复制分享链接

### 方法 2: 从单个地点
1. 在 Google Maps 搜索地点
2. 点击地点名称
3. 复制 URL（包含 Place ID）

## 支持的链接格式

✅ `https://maps.app.goo.gl/xxxxx`  
✅ `https://www.google.com/maps/d/xxxxx`  
✅ `https://goo.gl/maps/xxxxx`  
✅ 包含多个地点标记的 Google Maps URL

## 核心特性

✅ **自动去重**: 基于 Place ID 自动跳过已存在的地点  
✅ **批量导入**: 一次导入整个收藏夹  
✅ **详细信息**: 自动获取名称、地址、评分、图片、营业时间等  
✅ **错误处理**: 详细的错误报告和成功/失败统计  
✅ **来源追踪**: 记录导入来源和时间

## 测试示例

### 示例 1: 导入巴黎景点

```bash
curl -X POST http://localhost:3000/api/public-places/import-by-place-ids \
  -H "Content-Type: application/json" \
  -d '{
    "placeIds": [
      "ChIJLU7jZClu5kcR4PcOOO6p3I0",
      "ChIJD3uTd9hx5kcR1IQvGfr8dbk",
      "ChIJjx37cOxv5kcRP2sTGUlH3ok"
    ],
    "sourceDetails": {
      "note": "巴黎热门景点"
    }
  }'
```

### 示例 2: 测试去重

再次运行上面的命令，会看到：
```json
{
  "success": 0,
  "skipped": 3,  // 全部被跳过
  "message": "Successfully imported 0 new places. 3 places already existed and were skipped."
}
```

## 已测试场景 ✅

- ✅ 批量导入新地点
- ✅ Place ID 去重（已存在的地点自动跳过）
- ✅ 获取完整地点信息（名称、地址、评分、图片等）
- ✅ 错误处理和报告
- ✅ 分页查询导入的地点

## 技术实现

### 核心文件
- `googleMapsFavoritesService.ts` - 链接解析和批量导入
- `googleMapsService.ts` - Google Maps API 交互
- `publicPlaceService.ts` - 公共地点数据管理
- `publicPlaceController.ts` - API 控制器

### 去重逻辑
```typescript
// 1. 检查哪些 Place IDs 已存在
const existingPlaceIds = await checkExistingPlaceIds(placeIds);

// 2. 过滤出新的 Place IDs
const newPlaceIds = placeIds.filter(id => !existingPlaceIds.includes(id));

// 3. 只导入新地点
await batchAddByPlaceIds(newPlaceIds);
```

## 常见问题

### Q: 如何获取 Place ID？
A: 在 Google Maps 中搜索地点，URL 中会包含 Place ID（通常是 `ChIJ` 开头的字符串）

### Q: 导入会重复吗？
A: 不会，系统会基于 Place ID 自动去重

### Q: 支持多少个地点？
A: 理论上无限制，但受 Google Maps API 配额限制

### Q: 如何确认导入成功？
A: 查看响应中的 `success`、`failed` 和 `skipped` 字段

## 下一步

现在你可以：

1. 准备你的 Google Maps 收藏夹链接
2. 使用 API 导入地点
3. 在应用中查看和使用这些公共地点

## 相关文档

- [详细文档](./GOOGLE_MAPS_FAVORITES_IMPORT.md)
- [API 测试指南](./HOW_TO_TEST_API.md)
- [公共地点库说明](./PUBLIC_PLACES_LIBRARY_README.md)
