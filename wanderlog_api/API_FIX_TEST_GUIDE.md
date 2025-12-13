# 🚀 快速测试修复后的 API

## 问题
之前出现错误: `Failed to fetch place details from Google Maps`

## 已修复
✅ 增加了超时时间 (10s → 30s)
✅ 移除了不兼容的 language 参数
✅ 添加了详细的调试日志
✅ 改进了错误处理

## 测试步骤

### 方法 1: 使用提供的脚本（推荐）

打开一个**新终端**，执行：

```bash
# 1. 启动服务
cd /Users/bahaa/Desktop/bahaa-dev-repo/wanderlog/wanderlog_api
chmod +x START_SERVER.sh
./START_SERVER.sh
```

服务启动后，在**另一个新终端**中测试：

```bash
# 2. 测试 API
cd /Users/bahaa/Desktop/bahaa-dev-repo/wanderlog/wanderlog_api
chmod +x TEST_API.sh
./TEST_API.sh
```

### 方法 2: 手动测试

#### 终端 1 - 启动服务:
```bash
cd /Users/bahaa/Desktop/bahaa-dev-repo/wanderlog/wanderlog_api

# 清理端口（如果需要）
lsof -ti:3000 | xargs kill -9 2>/dev/null

# 启动
npm run dev
```

#### 终端 2 - 测试 API:
```bash
curl -X POST http://localhost:3000/api/public-places/add-by-place-id \
  -H "Content-Type: application/json" \
  -d '{"placeId": "ChIJLU7jZClu5kcR4PcOOO6p3I0"}'
```

## 查看日志

现在服务会显示详细日志：

```
🔍 Fetching details for place ID: ChIJLU7jZClu5kcR4PcOOO6p3I0
🔑 Using API key: AIzaSyAFrsDUcA9JqNDT...
✅ API Response Status: OK
```

如果出错，会显示：
```
❌ Place details error: [错误状态]
Error message: [具体错误信息]
```

## 预期结果

成功时会返回：
```json
{
  "success": true,
  "data": {
    "id": "...",
    "placeId": "ChIJLU7jZClu5kcR4PcOOO6p3I0",
    "name": "Eiffel Tower",
    "city": "Paris",
    "country": "France",
    ...
  },
  "message": "Place added successfully"
}
```

## 如果还是超时

可以直接测试 Google Maps API：

```bash
curl "https://maps.googleapis.com/maps/api/place/details/json?place_id=ChIJLU7jZClu5kcR4PcOOO6p3I0&key=AIzaSyAFrsDUcA9JqNDT52646JKwGPBu5BdvyW0&fields=name,formatted_address"
```

这会直接调用 Google 的 API，如果这个也超时，可能是：
- 网络问题
- API key 配额问题
- 需要配置代理

## 文件位置

- 修复的文件: `src/services/googleMapsService.ts`
- 启动脚本: `START_SERVER.sh`
- 测试脚本: `TEST_API.sh`
