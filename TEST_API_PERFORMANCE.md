# API 性能测试

## 已完成的优化

### 1. Vago 页面（推荐合集）✅
**优化前**：
- 为每个推荐组循环查询数据库
- 加载完整的嵌套数据（collection -> spots -> places）
- 每个推荐需要 3-5 秒

**优化后**：
- 一次性查询所有推荐项目
- 只加载封面数据，不加载完整的 spots
- 预期加载时间：< 500ms

### 2. Mine 页面 ✅
**优化**：
- 添加了性能计时日志
- 添加了更好的加载骨架屏
- 数据已经被 tripsProvider 缓存（keepAlive）

## 测试 API 响应时间

### 测试推荐 API
```bash
time curl -s http://127.0.0.1:3000/api/collection-recommendations > /dev/null
```

### 测试 Trips API（需要认证）
```bash
# 首先需要获取 JWT token
curl -X POST http://127.0.0.1:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com","password":"your-password"}'

# 然后测试
time curl -s http://127.0.0.1:3000/api/destinations \
  -H "Authorization: Bearer YOUR_TOKEN" > /dev/null
```

## 预期结果

运行 Flutter 应用后，你应该在控制台看到：

### Vago 页面
```
📡 [Fast] Fetching recommendations from Supabase
📦 Loaded XX recommendation items in XXXms
📊 Found 3 recommendation groups
✅ [Fast] Returning 3 recommendations in XXXms
```

### Mine 页面
```
🏠 [MinePageProvider] Loading trips data...
🏠 [MinePageProvider] Loaded 40 trips in XXXms
🏠 [MinePageProvider] Processed in XXXms: X countries, Y cities, Z markers
```

## 如果仍然很慢

1. **检查网络连接**：确保模拟器可以访问 `http://127.0.0.1:3000`
2. **查看 API 日志**：检查 wanderlog_api 终端的输出
3. **检查数据库连接**：确认 Supabase 连接正常
4. **重启应用**：执行 Hot Restart (Shift + R)
