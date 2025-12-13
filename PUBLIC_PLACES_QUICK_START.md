# 公共地点库 - 快速开始指南

## 🚀 5分钟快速启动

### 第 1 步：启动 API 服务器

```bash
cd wanderlog_api
npm run dev
```

服务器将在 http://localhost:3000 启动

### 第 2 步：启动 Prisma Studio（数据库可视化工具）

在新的终端窗口中运行：

```bash
cd wanderlog_api
npm run db:studio
```

访问 http://localhost:5555 即可看到数据库管理界面

### 第 3 步：测试 API

使用以下任一方式测试：

#### 方式 A：使用 curl（命令行）

```bash
# 1. 手动添加一个地点（埃菲尔铁塔）
curl -X POST http://localhost:3000/api/public-places/add-by-place-id \
  -H "Content-Type: application/json" \
  -d '{"placeId": "ChIJLU7jZClu5kcR4PcOOO6p3I0"}'

# 2. 查看所有地点
curl http://localhost:3000/api/public-places

# 3. 搜索地点
curl "http://localhost:3000/api/public-places/search?q=tower"

# 4. 获取统计信息
curl http://localhost:3000/api/public-places/stats
```

#### 方式 B：使用 Postman

1. 导入文件：`PUBLIC_PLACES_API.postman_collection.json`
2. 设置环境变量：`base_url = http://localhost:3000`
3. 运行任意请求

#### 方式 C：使用浏览器

直接访问：http://localhost:3000/api/public-places

---

## 📚 功能演示

### 功能 1：手动添加地点（通过 place_id）

```bash
curl -X POST http://localhost:3000/api/public-places/add-by-place-id \
  -H "Content-Type: application/json" \
  -d '{
    "placeId": "ChIJD7fiBh9u5kcRYJSMaMOCCwQ"
  }'
```

**说明**：这会从 Google Maps 获取埃菲尔铁塔的完整信息并存入数据库

### 功能 2：从 Google Maps 链接批量导入

⚠️ **需要配置 Apify API Token**

```bash
# 先在 .env 文件中添加：
# APIFY_API_TOKEN=your_token_here

curl -X POST http://localhost:3000/api/public-places/import-from-link \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.google.com/maps/saved/..."
  }'
```

### 功能 3：从图片识别地点

⚠️ **需要配置 OpenAI 或 Gemini API Key**

```bash
# 先在 .env 文件中添加：
# OPENAI_API_KEY=your_key_here

curl -X POST http://localhost:3000/api/public-places/import-from-image \
  -H "Content-Type: application/json" \
  -d '{
    "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Tour_Eiffel_Wikimedia_Commons_%28cropped%29.jpg/800px-Tour_Eiffel_Wikimedia_Commons_%28cropped%29.jpg"
  }'
```

### 功能 4：通过对话导入地点

⚠️ **需要配置 OpenAI API Key**

```bash
curl -X POST http://localhost:3000/api/public-places/import-from-chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "推荐巴黎最著名的5个景点",
    "city": "Paris",
    "country": "France"
  }'
```

---

## 🔑 获取 API Keys

### 1. Google Maps API Key（必需）

✅ **已配置**：你的 `.env` 文件中已有

如需新 Key：
1. 访问 https://console.cloud.google.com/
2. 启用 Places API
3. 创建 API Key

### 2. Apify API Token（可选 - 用于链接导入）

1. 注册：https://apify.com/
2. 免费账户包含足够的配额
3. 获取 API Token：https://console.apify.com/account/integrations
4. 添加到 `.env`：
   ```
   APIFY_API_TOKEN=apify_api_xxxxxxxxxx
   ```

### 3. OpenAI API Key（可选 - 用于 AI 功能）

1. 注册：https://platform.openai.com/
2. 获取 API Key：https://platform.openai.com/api-keys
3. 添加到 `.env`：
   ```
   OPENAI_API_KEY=sk-xxxxxxxxxx
   ```

### 4. Google Gemini API Key（可选 - OpenAI 的备选）

1. 访问：https://makersuite.google.com/app/apikey
2. 创建 API Key
3. 添加到 `.env`：
   ```
   GEMINI_API_KEY=xxxxxxxxxxxx
   ```

---

## 📊 使用 Prisma Studio 管理数据

### 打开 Prisma Studio

```bash
cd wanderlog_api
npm run db:studio
```

访问：http://localhost:5555

### 功能：

1. **查看数据**
   - 点击 `PublicPlace` 查看所有地点
   - 支持排序、筛选

2. **编辑地点**
   - 点击任意记录
   - 修改字段（名称、分类、标签等）
   - 点击 "Save" 保存

3. **删除地点**
   - 选择记录
   - 点击 "Delete"

4. **添加地点**
   - 点击 "Add record"
   - 填写必填字段
   - 保存

---

## 🔄 常用操作示例

### 查询操作

```bash
# 获取所有地点（分页）
curl "http://localhost:3000/api/public-places?page=1&limit=10"

# 按城市筛选
curl "http://localhost:3000/api/public-places?city=Paris"

# 按分类筛选
curl "http://localhost:3000/api/public-places?category=博物馆"

# 搜索地点
curl "http://localhost:3000/api/public-places/search?q=咖啡"

# 获取特定地点详情
curl "http://localhost:3000/api/public-places/ChIJD7fiBh9u5kcRYJSMaMOCCwQ"

# 查看统计数据
curl "http://localhost:3000/api/public-places/stats"
```

### 编辑操作

```bash
# 更新地点信息
curl -X PUT http://localhost:3000/api/public-places/ChIJD7fiBh9u5kcRYJSMaMOCCwQ \
  -H "Content-Type: application/json" \
  -d '{
    "name": "埃菲尔铁塔",
    "category": "地标",
    "aiTags": ["iconic", "romantic", "must-visit"]
  }'

# 同步 Google Maps 最新数据
curl -X POST http://localhost:3000/api/public-places/ChIJD7fiBh9u5kcRYJSMaMOCCwQ/sync

# 为地点生成 AI 标签
curl -X POST http://localhost:3000/api/public-places/ChIJD7fiBh9u5kcRYJSMaMOCCwQ/generate-tags

# 删除地点
curl -X DELETE http://localhost:3000/api/public-places/ChIJD7fiBh9u5kcRYJSMaMOCCwQ
```

---

## 🎯 如何获取 Google Place ID？

### 方法 1：通过 Google Maps 网页版

1. 打开 https://www.google.com/maps
2. 搜索地点（如 "埃菲尔铁塔"）
3. 查看 URL，会看到类似：
   ```
   https://www.google.com/maps/place/.../@...
   ```
4. 右键点击地点 → "关于这个地方" → 复制 Place ID

### 方法 2：使用 API 搜索

```bash
# 通过名称搜索（未实现，但可以参考）
# 需要调用 Google Maps Text Search API
```

### 常用地点的 Place ID：

```
埃菲尔铁塔: ChIJLU7jZClu5kcR4PcOOO6p3I0
卢浮宫: ChIJD7fiBh9u5kcRYJSMaMOCCwQ
自由女神像: ChIJPTacEpBQwokRKwIlDXelxkA
大本钟: ChIJr3BprVkEdkgR9PE4cgp_-cc
```

---

## 🐛 故障排查

### 问题 1：服务器无法启动

```bash
# 检查端口是否被占用
lsof -i :3000

# 更改端口（在 .env 中）
PORT=3001
```

### 问题 2：数据库错误

```bash
# 重新生成 Prisma Client
cd wanderlog_api
npm run db:generate

# 重新运行迁移
npm run db:migrate
```

### 问题 3：API Key 无效

- 检查 `.env` 文件中的 Key 是否正确
- 确认 API 配额未用尽
- 确认 API 服务已启用

### 问题 4：Prisma Studio 无法访问

```bash
# 确认服务正在运行
ps aux | grep prisma

# 重新启动
npm run db:studio
```

---

## 📝 下一步

1. ✅ 测试基本的 CRUD 操作
2. ✅ 在 Prisma Studio 中查看和编辑数据
3. ⬜ 配置 Apify 实现链接导入
4. ⬜ 配置 OpenAI 实现 AI 功能
5. ⬜ 导入真实数据到数据库
6. ⬜ 集成到 Flutter 应用

---

## 📚 完整文档

详细文档请参考：`PUBLIC_PLACES_LIBRARY_README.md`

---

## 💬 需要帮助？

如果遇到问题：
1. 检查 `.env` 配置
2. 查看终端错误日志
3. 在 Prisma Studio 中检查数据
4. 参考 API 文档和示例
