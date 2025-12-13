# 如何测试公共地点库 API

## 🚀 三步快速测试

### 步骤 1：启动 API 服务器

打开一个**新的终端窗口**，运行：

```bash
cd /Users/bahaa/Desktop/bahaa-dev-repo/wanderlog/wanderlog_api
npm run dev
```

看到这个输出表示成功：
```
info: Server is running on port 3000
```

**保持这个终端窗口打开！**

---

### 步骤 2：打开另一个终端测试 API

在**另一个新的终端窗口**中运行测试命令：

#### 测试 1：添加埃菲尔铁塔

```bash
curl -X POST http://localhost:3000/api/public-places/add-by-place-id \
  -H "Content-Type: application/json" \
  -d '{"placeId": "ChIJLU7jZClu5kcR4PcOOO6p3I0"}'
```

成功的话会看到类似这样的输出：
```json
{
  "success": true,
  "data": {
    "id": "...",
    "placeId": "ChIJLU7jZClu5kcR4PcOOO6p3I0",
    "name": "Eiffel Tower",
    "latitude": 48.8583701,
    "longitude": 2.2944813,
    ...
  },
  "message": "Place added successfully"
}
```

#### 测试 2：查看所有地点

```bash
curl http://localhost:3000/api/public-places
```

#### 测试 3：搜索地点

```bash
curl "http://localhost:3000/api/public-places/search?q=Eiffel"
```

#### 测试 4：查看统计信息

```bash
curl http://localhost:3000/api/public-places/stats
```

---

### 步骤 3：使用 Prisma Studio 可视化查看数据

在**第三个终端窗口**运行：

```bash
cd /Users/bahaa/Desktop/bahaa-dev-repo/wanderlog/wanderlog_api
npm run db:studio
```

然后在浏览器中打开：**http://localhost:5555**

你可以在这里：
- ✅ 查看所有地点数据
- ✅ 搜索和筛选
- ✅ 编辑地点信息
- ✅ 删除地点
- ✅ 添加新地点

---

## 🎯 更多测试示例

### 添加更多著名景点

```bash
# 卢浮宫
curl -X POST http://localhost:3000/api/public-places/add-by-place-id \
  -H "Content-Type: application/json" \
  -d '{"placeId": "ChIJD7fiBh9u5kcRYJSMaMOCCwQ"}'

# 凯旋门
curl -X POST http://localhost:3000/api/public-places/add-by-place-id \
  -H "Content-Type: application/json" \
  -d '{"placeId": "ChIJjx37cOxv5kcRP2UrGDD8x_I"}'

# 自由女神像
curl -X POST http://localhost:3000/api/public-places/add-by-place-id \
  -H "Content-Type: application/json" \
  -d '{"placeId": "ChIJPTacEpBQwokRKwIlDXelxkA"}'

# 大本钟
curl -X POST http://localhost:3000/api/public-places/add-by-place-id \
  -H "Content-Type: application/json" \
  -d '{"placeId": "ChIJr3BprVkEdkgR9PE4cgp_-cc"}'
```

### 查询操作

```bash
# 按城市筛选
curl "http://localhost:3000/api/public-places?city=Paris"

# 按国家筛选
curl "http://localhost:3000/api/public-places?country=France"

# 分页查询
curl "http://localhost:3000/api/public-places?page=1&limit=10"

# 获取特定地点详情
curl "http://localhost:3000/api/public-places/ChIJLU7jZClu5kcR4PcOOO6p3I0"
```

### 更新操作

```bash
# 更新地点信息
curl -X PUT http://localhost:3000/api/public-places/ChIJLU7jZClu5kcR4PcOOO6p3I0 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "埃菲尔铁塔",
    "category": "地标",
    "aiTags": ["iconic", "romantic", "must-visit", "instagram-worthy"]
  }'

# 生成 AI 标签（需要配置 OpenAI API Key）
curl -X POST http://localhost:3000/api/public-places/ChIJLU7jZClu5kcR4PcOOO6p3I0/generate-tags

# 同步 Google Maps 最新数据
curl -X POST http://localhost:3000/api/public-places/ChIJLU7jZClu5kcR4PcOOO6p3I0/sync
```

---

## 🔧 故障排查

### 问题 1：`curl: (7) Failed to connect to localhost port 3000`

**原因**：服务器没有运行

**解决**：
```bash
cd /Users/bahaa/Desktop/bahaa-dev-repo/wanderlog/wanderlog_api
npm run dev
```

### 问题 2：`Error: listen EADDRINUSE: address already in use :::3000`

**原因**：端口 3000 被占用

**解决**：
```bash
# 杀死占用 3000 端口的进程
lsof -ti:3000 | xargs kill -9

# 重新启动
npm run dev
```

### 问题 3：API 返回错误

**检查**：
1. 确认服务器正在运行
2. 检查 `.env` 文件中的 `GOOGLE_MAPS_API_KEY` 是否正确
3. 查看服务器终端的错误日志

---

## 📊 使用 Postman 测试（推荐）

如果你更喜欢图形界面：

1. 打开 Postman
2. 导入文件：`PUBLIC_PLACES_API.postman_collection.json`
3. 点击任意请求
4. 点击 "Send" 发送请求

---

## 🎯 快速验证脚本

或者直接运行测试脚本：

```bash
cd /Users/bahaa/Desktop/bahaa-dev-repo/wanderlog
./test_public_places_api.sh
```

这个脚本会自动测试所有功能！

---

## 💡 提示

- **curl 命令要在新的终端窗口运行**，不要在运行服务器的窗口运行
- 所有返回的数据都是 JSON 格式
- 可以使用 `| python3 -m json.tool` 格式化 JSON 输出：
  ```bash
  curl http://localhost:3000/api/public-places | python3 -m json.tool
  ```

---

## 📚 相关文档

- [完整 API 文档](PUBLIC_PLACES_LIBRARY_README.md)
- [快速开始指南](PUBLIC_PLACES_QUICK_START.md)
- [系统概览](START_HERE_PUBLIC_PLACES.md)
