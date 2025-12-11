# 🗺️ Google Maps 地点导入 - 快速开始指南

## 当前状态

✅ **数据库中已有 6 个哥本哈根景点**：
1. Church of Our Saviour - 4.8⭐
2. The Coffee Collective - 4.7⭐  
3. Nyhavn - 4.7⭐
4. Tivoli Gardens - 4.6⭐
5. Design Museum Denmark - 4.6⭐
6. Torvehallerne - 4.5⭐

## 快速测试 Flutter 地图页面

### 方法 1: 在 Flutter 应用中测试（推荐）

Flutter 应用的 MapPage 使用本地 mock 数据，无需后端 API：

```bash
cd /Users/bahaa/Desktop/bahaa-dev-repo/wanderlog/wanderlog_app
flutter run
```

然后：
1. 打开应用
2. 点击首页顶部的 **"Map"** 标签
3. 你会看到带有城市选择器、搜索框、标签筛选的完整地图界面
4. 底部会显示 SpotCard（3:4 竖向卡片）

### 方法 2: 添加更多 Mock 数据到数据库

如果你想添加更多地点：

```bash
cd /Users/bahaa/Desktop/bahaa-dev-repo/wanderlog/wanderlog_api
npx tsx src/scripts/addMockData.ts
```

### 方法 3: 查看已有数据

```bash
cd /Users/bahaa/Desktop/bahaa-dev-repo/wanderlog/wanderlog_api
npx tsx src/scripts/checkSpots.ts
```

## 解决 Google API 网络问题

### 原因
- 网络连接超时（ETIMEDOUT）
- 可能是防火墙、代理或网络限制

### 解决方案

#### 选项 A: 检查网络连接
```bash
# 测试是否能访问 Google APIs
ping -c 3 maps.googleapis.com

# 如果ping不通，可能需要配置代理
```

#### 选项 B: 使用代理（如果在中国大陆）
在 `.env` 文件中添加：
```
HTTP_PROXY=http://your-proxy:port
HTTPS_PROXY=http://your-proxy:port
```

#### 选项 C: 手动导入你的保存地点

1. **从 Google Maps 获取 Place ID**：
   - 打开 Google Maps
   - 点击任何地点
   - 查看 URL，复制 Place ID（格式：ChIJ...）

2. **创建你自己的导入脚本**：
```typescript
// src/scripts/mySpots.ts
const MY_PLACE_IDS = [
  'ChIJ...', // 你的第一个地点
  'ChIJ...', // 你的第二个地点
  // ... 添加更多
];

// 然后运行简单导入脚本
```

## 后端服务器问题

### 临时解决方案：使用测试服务器

已创建的简化测试服务器（端口 3001）：
```bash
cd /Users/bahaa/Desktop/bahaa-dev-repo/wanderlog/wanderlog_api
npx tsx src/scripts/testServer.ts
```

然后测试：
```bash
curl http://localhost:3001/api/spots/city-center/copenhagen
```

### 修复主服务器的 TypeScript 错误

服务器有一些 TypeScript 类型错误。如果想修复：

1. 简化 Prisma 查询（移除 `mode: 'insensitive'`，SQLite 不支持）
2. 简化 Google Maps Service 的类型检查
3. 添加明确的返回类型

或者暂时跳过编译检查：
```bash
cd wanderlog_api
npm run dev -- --tsconfig false
```

## 下一步建议

### 立即可做的：

1. **测试 Flutter 地图 UI**
   ```bash
   cd wanderlog_app
   flutter run
   # 点击 "Map" 标签查看效果
   ```

2. **添加更多 mock 数据**
   编辑 `wanderlog_api/src/scripts/addMockData.ts`
   添加更多景点，然后运行

3. **网络问题解决后**
   - 配置好代理或网络
   - 运行：`npx tsx src/scripts/simpleImport.ts`
   - 会自动导入 10 个知名景点

### 长期计划：

1. 解决网络连接问题
2. 修复 TypeScript 编译错误
3. 实现真实的 Mapbox 地图标记
4. 接入实时 Google Places API 数据
5. 添加定时同步任务

## 文件位置

### 数据导入脚本
- `wanderlog_api/src/scripts/addMockData.ts` - 添加 mock 数据（✅ 可用）
- `wanderlog_api/src/scripts/simpleImport.ts` - 从 Google API 导入（⚠️ 网络问题）
- `wanderlog_api/src/scripts/checkSpots.ts` - 查看数据库内容

### Flutter 地图页面
- `wanderlog_app/lib/features/map/presentation/pages/map_page_new.dart` - 地图页面
- `wanderlog_app/lib/features/trips/presentation/pages/home_page.dart` - 首页（含 Map 标签）

### 后端 API
- `wanderlog_api/src/controllers/spotController.ts` - Spot API 控制器
- `wanderlog_api/src/services/googleMapsService.ts` - Google Maps 服务
- `wanderlog_api/src/routes/spotRoutes.ts` - API 路由

## 需要帮助？

如果遇到问题：
1. 检查数据库：`npx tsx src/scripts/checkSpots.ts`
2. 查看文档：`SPOTS_IMPLEMENTATION_SUMMARY.md`
3. 测试 API：先测试 mock 数据，再解决网络问题

---

**建议**：先用 mock 数据测试 UI 效果，确保界面符合预期，然后再解决网络和后端问题。
