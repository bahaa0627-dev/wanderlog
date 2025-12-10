# 🧪 测试后端 API - 无需 Flutter

## 第一步：确保后端运行

在终端运行：
```bash
cd wanderlog_api
npm run dev
```

看到 "Server is running on port 3000" 就成功了。

---

## 第二步：在浏览器测试

### 1. 健康检查
在浏览器打开：
```
http://localhost:3000/health
```

应该看到：
```json
{"status":"ok","timestamp":"2024-12-10T..."}
```

---

## 第三步：用 curl 测试完整功能

### 1. 注册用户
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "demo@wanderlog.com",
    "password": "123456",
    "name": "Demo User"
  }'
```

会返回：
```json
{
  "token": "eyJhbGci...",
  "user": {
    "id": "...",
    "email": "demo@wanderlog.com",
    "name": "Demo User"
  }
}
```

**复制这个 token！** 👆

### 2. 创建行程
把上面的 token 替换到下面的 YOUR_TOKEN_HERE：

```bash
curl -X POST http://localhost:3000/api/trips \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "name": "Tokyo Adventure",
    "city": "Tokyo",
    "startDate": "2024-12-20T00:00:00.000Z"
  }'
```

返回：
```json
{
  "id": "...",
  "name": "Tokyo Adventure",
  "city": "Tokyo",
  "status": "PLANNING"
}
```

### 3. 获取我的行程列表
```bash
curl http://localhost:3000/api/trips \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 4. 导入一个地点
```bash
curl -X POST http://localhost:3000/api/spots/import \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "googlePlaceId": "ChIJ123456",
    "name": "Senso-ji Temple",
    "latitude": 35.7148,
    "longitude": 139.7967,
    "address": "Tokyo, Asakusa",
    "category": "temple"
  }'
```

### 5. 添加地点到行程
```bash
curl -X PUT http://localhost:3000/api/trips/YOUR_TRIP_ID/spots \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "spotId": "YOUR_SPOT_ID",
    "status": "WISHLIST",
    "priority": "MUST_GO"
  }'
```

---

## 🎨 或者用 Postman/Insomnia

更友好的图形界面测试工具：

1. 下载 [Postman](https://www.postman.com/downloads/)
2. 导入我准备的配置（见下面）
3. 点击按钮测试



