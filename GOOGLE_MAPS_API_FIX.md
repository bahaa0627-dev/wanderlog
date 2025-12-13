# Google Maps API 问题修复指南

## 问题描述

当调用 API 添加地点时，返回错误：
```json
{"success":false,"error":"Failed to fetch place details from Google Maps"}
```

## 已修复的问题

### 1. 缺少 address_components 字段
在 `googleMapsService.ts` 中添加了 `address_components` 到 API 请求字段列表。

### 2. 错误处理改进
在 `publicPlaceService.ts` 中添加了更详细的错误日志。

## 重新测试步骤

### 步骤 1：停止所有正在运行的服务器

```bash
# 找到并停止占用 3000 端口的进程
lsof -ti:3000 | xargs kill -9

# 或者停止所有 npm 进程
pkill -f "npm run dev"
pkill -f "tsx watch"
```

### 步骤 2：重新启动服务器

```bash
cd /Users/bahaa/Desktop/bahaa-dev-repo/wanderlog/wanderlog_api
npm run dev
```

**保持这个终端窗口打开！** 你应该看到：
```
info: Server is running on port 3000
```

### 步骤 3：在新终端测试 API

打开一个**新的终端窗口**（Command + T），运行：

```bash
curl -X POST http://localhost:3000/api/public-places/add-by-place-id \
  -H "Content-Type: application/json" \
  -d '{"placeId": "ChIJLU7jZClu5kcR4PcOOO6p3I0"}'
```

### 步骤 4：查看结果

成功的响应应该类似：
```json
{
  "success": true,
  "data": {
    "id": "clxxx...",
    "placeId": "ChIJLU7jZClu5kcR4PcOOO6p3I0",
    "name": "Eiffel Tower",
    "latitude": 48.8583701,
    "longitude": 2.2944813,
    "city": "Paris",
    "country": "France",
    "address": "Champ de Mars, 5 Avenue Anatole France, 75007 Paris, France",
    "rating": 4.6,
    ...
  },
  "message": "Place added successfully"
}
```

## 如果仍然失败

### 检查 1：验证 API Key

```bash
cd /Users/bahaa/Desktop/bahaa-dev-repo/wanderlog/wanderlog_api
cat .env | grep GOOGLE_MAPS_API_KEY
```

应该显示：
```
GOOGLE_MAPS_API_KEY="AIzaSyAFrsDUcA9JqNDT52646JKwGPBu5BdvyW0"
```

### 检查 2：测试 Google Maps API 直接访问

运行测试脚本：
```bash
cd /Users/bahaa/Desktop/bahaa-dev-repo/wanderlog/wanderlog_api
npx tsx src/scripts/testGoogleMapsPlaces.ts
```

### 检查 3：查看服务器日志

在运行服务器的终端窗口中查看错误信息。

### 检查 4：验证 API Key 权限

1. 访问 Google Cloud Console: https://console.cloud.google.com/
2. 进入 "APIs & Services" → "Credentials"
3. 找到你的 API Key
4. 确认以下 API 已启用：
   - **Places API**
   - **Places API (New)**
   - **Geocoding API**

### 检查 5：测试 API Key 配额

```bash
curl "https://maps.googleapis.com/maps/api/place/details/json?place_id=ChIJLU7jZClu5kcR4PcOOO6p3I0&key=AIzaSyAFrsDUcA9JqNDT52646JKwGPBu5BdvyW0"
```

如果返回错误，可能是：
- API Key 无效
- API 未启用
- 配额已用尽
- API Key 有 IP 限制

## 常见错误及解决方案

### 错误 1：`EADDRINUSE: address already in use :::3000`

**解决**：
```bash
lsof -ti:3000 | xargs kill -9
```

### 错误 2：`REQUEST_DENIED`

**原因**：API Key 无效或 Places API 未启用

**解决**：
1. 确认 API Key 正确
2. 在 Google Cloud Console 启用 Places API

### 错误 3：`OVER_QUERY_LIMIT`

**原因**：API 配额用尽

**解决**：
1. 等待配额重置（每天重置）
2. 升级 Google Cloud 账户
3. 使用新的 API Key

### 错误 4：`INVALID_REQUEST`

**原因**：请求参数错误

**解决**：
- 检查 place_id 格式是否正确
- 确认必需的 fields 参数都已包含

## 使用 Prisma Studio 查看数据

即使 API 测试失败，你也可以手动在数据库中添加数据：

```bash
cd /Users/bahaa/Desktop/bahaa-dev-repo/wanderlog/wanderlog_api
npm run db:studio
```

访问：http://localhost:5555

1. 点击 `PublicPlace` 表
2. 点击 "Add record"
3. 填写字段：
   - `placeId`: ChIJLU7jZClu5kcR4PcOOO6p3I0
   - `name`: Eiffel Tower
   - `latitude`: 48.8583701
   - `longitude`: 2.2944813
   - `city`: Paris
   - `country`: France
4. 保存

## 获取新的 API Key（如果需要）

如果当前 API Key 有问题：

1. 访问：https://console.cloud.google.com/
2. 创建新项目或选择现有项目
3. 启用 APIs：
   - Places API
   - Geocoding API
   - Maps JavaScript API
4. 创建 Credentials → API Key
5. 复制新的 API Key
6. 更新 `.env` 文件：
   ```
   GOOGLE_MAPS_API_KEY="your_new_api_key"
   ```
7. 重启服务器

## 临时解决方案：手动数据

如果 Google Maps API 持续有问题，你可以使用测试数据：

```bash
# 使用 Prisma Studio 手动添加
npm run db:studio
```

或通过 SQL 直接插入：

```sql
INSERT INTO PublicPlace (
  id, placeId, name, latitude, longitude, 
  city, country, address, source, createdAt, updatedAt
) VALUES (
  'test1', 'ChIJLU7jZClu5kcR4PcOOO6p3I0', 'Eiffel Tower',
  48.8583701, 2.2944813, 'Paris', 'France',
  'Champ de Mars, 5 Avenue Anatole France, 75007 Paris, France',
  'manual', datetime('now'), datetime('now')
);
```

## 验证修复成功

运行完整测试脚本：
```bash
cd /Users/bahaa/Desktop/bahaa-dev-repo/wanderlog
./test_public_places_api.sh
```

应该看到所有测试通过 ✅

## 需要帮助？

1. 检查服务器控制台的错误信息
2. 查看 `/tmp/wanderlog_api.log` 日志文件
3. 运行 `testGoogleMapsPlaces.ts` 脚本诊断
4. 验证 Google Cloud Console 中的 API 配置
