# 地点收藏功能测试指南

## 问题已修复 ✅

### 修复的问题
数据库中时间戳格式不一致导致的 500 错误已经修复。

**错误信息（已解决）：**
```
Invalid `prisma.tripSpot.upsert()` invocation:
Inconsistent column data: Could not convert value "1766053311553" of the field `createdAt` to type `DateTime`.
```

**修复方案：**
将所有时间戳统一转换为 SQLite 标准格式 `YYYY-MM-DD HH:MM:SS`

## 测试步骤

### 1. 基本功能测试

#### 测试场景 A：未登录用户点击收藏
**步骤：**
1. 退出登录（如果已登录）
2. 在地图上点击任意地点
3. 在详情弹窗中点击 "Add to Wishlist"

**预期结果：**
- ✅ 自动跳转到登录页
- ✅ 不会报错

#### 测试场景 B：已登录用户添加新城市的地点
**步骤：**
1. 确保已登录
2. 选择一个你之前没有收藏过的城市的地点（如巴黎的埃菲尔铁塔）
3. 点击 "Add to Wishlist"

**预期结果：**
- ✅ 显示绿色 toast 提示："added to wishlist"
- ✅ 自动创建该城市的 destination（如 "Paris"）
- ✅ 按钮文本变为 "Added"
- ✅ 不再报 500 错误

#### 测试场景 C：已登录用户添加已有城市的地点
**步骤：**
1. 确保已有某个城市的 destination（如东京）
2. 选择同一城市的另一个地点
3. 点击 "Add to Wishlist"

**预期结果：**
- ✅ 显示 toast："added to wishlist"
- ✅ 地点添加到现有的 "Tokyo" destination
- ✅ 不创建新的 destination
- ✅ 不再报 500 错误

### 2. 列表排序测试

#### 测试场景 D：验证新地点出现在最前面
**步骤：**
1. 连续添加 3 个地点到 wishlist
2. 导航到 "My Land - All" 页面
3. 查看地点列表顺序

**预期结果：**
- ✅ 最新添加的地点出现在列表最前面
- ✅ 按添加时间倒序排列（最新的在上）

### 3. 重复添加测试

#### 测试场景 E：重复添加同一地点
**步骤：**
1. 添加一个地点到 wishlist
2. 再次点击同一地点的 "Add to Wishlist"

**预期结果：**
- ✅ 按钮显示为 "Added"（已禁用状态）
- ✅ 不会创建重复记录
- ✅ 数据库约束保证唯一性

## 后端验证

### 检查数据库
```bash
cd wanderlog_api
sqlite3 prisma/dev.db
```

**验证时间戳格式：**
```sql
-- 应该都是 YYYY-MM-DD HH:MM:SS 格式
SELECT id, name, createdAt FROM Place LIMIT 5;
SELECT id, createdAt FROM TripSpot LIMIT 5;
```

**验证 TripSpot 创建：**
```sql
-- 查看你的 wishlist
SELECT 
  t.name as destination,
  p.name as place_name,
  ts.status,
  ts.createdAt
FROM TripSpot ts
JOIN Trip t ON ts.tripId = t.id
JOIN Place p ON ts.placeId = p.id
WHERE ts.status = 'WISHLIST'
ORDER BY ts.createdAt DESC;
```

### 检查服务端日志
```bash
# 查看后端日志
tail -f /path/to/terminals/115.txt
```

**正常的日志输出：**
```
➡️  GET /api/destinations
➡️  POST /api/destinations      # 创建新 destination（如果需要）
➡️  PUT /api/destinations/:id/spots
✅  200 OK
```

## API 测试（可选）

使用 curl 或 Postman 测试：

```bash
# 1. 登录获取 token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# 2. 创建 destination (如果不存在)
curl -X POST http://localhost:3000/api/destinations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"name":"Tokyo","city":"Tokyo"}'

# 3. 添加地点到 wishlist
curl -X PUT http://localhost:3000/api/destinations/DESTINATION_ID/spots \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "spotId": "PLACE_ID",
    "status": "WISHLIST",
    "spot": {
      "name": "Test Place",
      "city": "Tokyo",
      "latitude": 35.6762,
      "longitude": 139.6503,
      "rating": 4.5,
      "images": ["https://example.com/image.jpg"],
      "category": "restaurant",
      "tags": ["japanese", "sushi"]
    }
  }'
```

## 已知问题（已修复）

### ❌ 问题：时间戳格式错误
**状态：** ✅ 已修复

**原因：** 
- 数据库中存储了多种时间戳格式：
  - Unix 时间戳（毫秒）：`1766053311553`
  - ISO 8601：`2025-12-13T12:39:20Z`
- Prisma 期望：`YYYY-MM-DD HH:MM:SS`

**修复：**
已执行 SQL 脚本统一所有时间戳格式。

## 测试清单

- [ ] 未登录用户跳转到登录页
- [ ] 登录后能成功添加地点
- [ ] Toast 提示 "added to wishlist"
- [ ] 自动创建新 destination（新城市）
- [ ] 使用现有 destination（已有城市）
- [ ] 新地点出现在列表最前面
- [ ] 按钮状态正确更新（Added）
- [ ] 不会出现 500 错误
- [ ] 数据库中时间戳格式正确
- [ ] 不创建重复记录

## 回归测试

确保其他功能没有受到影响：

- [ ] 地图显示正常
- [ ] 地点详情显示正常
- [ ] 其他 API 端点正常工作
- [ ] 用户登录/注销正常
- [ ] Destination 列表显示正常

## 支持

如果遇到问题：

1. 检查后端服务是否正常运行
2. 查看浏览器控制台错误
3. 查看服务端日志
4. 验证数据库时间戳格式
5. 参考 `DATABASE_FIX_SUMMARY.md` 文档

## 相关文档

- [WISHLIST_FEATURE_IMPLEMENTATION.md](./WISHLIST_FEATURE_IMPLEMENTATION.md) - 功能实现说明
- [DATABASE_FIX_SUMMARY.md](./DATABASE_FIX_SUMMARY.md) - 数据库修复说明

