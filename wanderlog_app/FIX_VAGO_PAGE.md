# 修复 VAGO 页面 "Failed to load" 问题

## 🔍 问题分析

VAGO 页面（HomePage）显示 "Failed to load" 是因为推荐数据加载失败。

### 数据加载流程

1. **HomePage** 调用 `_loadRecommendations()`
2. **CollectionRepository** 调用 `/api/collection-recommendations`
3. 如果 API 调用失败，显示错误信息

## ✅ 已确认

- ✅ 后端 API 端点存在：`/api/collection-recommendations`
- ✅ API 返回数据正常
- ✅ 后端服务正在运行

## 🔧 可能的原因

### 1. 网络连接问题
- iPhone 无法访问 Mac 的 IP 地址
- 防火墙阻止了连接

### 2. API 响应格式问题
- 前端期望的响应格式与后端返回不一致

### 3. 环境变量未加载
- `.env.dev` 文件未正确加载
- API_BASE_URL 配置错误

## 🛠️ 解决方案

### 步骤 1: 验证网络连接

在 iPhone 的 Safari 浏览器中测试：
```
http://192.168.1.6:3000/api/collection-recommendations
```

应该看到 JSON 数据。如果无法访问：
- 检查 Mac 防火墙设置
- 确认 Mac 和 iPhone 在同一 Wi-Fi

### 步骤 2: 检查应用日志

运行应用时，查看 Flutter 控制台输出：
- 查找 `📡 Requesting recommendations` 日志
- 查找 `❌ Error in listRecommendations` 错误
- 查找网络请求的详细信息

### 步骤 3: 验证环境变量

确认 `.env.dev` 文件已正确加载：

```bash
cd wanderlog_app
cat .env.dev
```

应该看到：
```
API_BASE_URL=http://192.168.1.6:3000/api
```

### 步骤 4: 检查 Dio 配置

查看应用启动时的日志，应该看到：
```
Dio baseUrl: http://192.168.1.6:3000/api
```

如果显示 `localhost` 或 `127.0.0.1`，说明环境变量未正确加载。

## 🧪 调试步骤

### 1. 查看详细错误信息

在 Flutter 控制台中查找：
- 网络请求的完整 URL
- 错误状态码
- 错误消息

### 2. 测试 API 端点

从 Mac 测试：
```bash
curl http://192.168.1.6:3000/api/collection-recommendations
```

从 iPhone Safari 测试：
```
http://192.168.1.6:3000/api/collection-recommendations
```

### 3. 检查应用网络权限

确保：
- ✅ 已授予本地网络权限（系统设置 > 隐私与安全性 > 本地网络）
- ✅ 已重启终端/IDE

## 📝 快速检查清单

- [ ] 后端服务正在运行（`lsof -i :3000`）
- [ ] `.env.dev` 配置正确（使用 Mac IP）
- [ ] 可以从 iPhone 浏览器访问 API
- [ ] Mac 防火墙允许端口 3000
- [ ] 已授予本地网络权限
- [ ] Flutter 日志显示正确的 API URL
- [ ] 查看应用日志中的具体错误信息

## 🎯 预期结果

修复后，VAGO 页面应该：
- ✅ 正常加载推荐数据
- ✅ 显示 Collection 卡片列表
- ✅ 不再显示 "Failed to load" 错误

## 🔍 如果问题仍然存在

请提供以下信息：
1. Flutter 控制台中的完整错误日志
2. 网络请求的 URL 和状态码
3. Dio baseUrl 的日志输出

这样我可以更准确地定位问题。
