# 完整网络问题修复指南

## 🔍 问题总结

您遇到了两个主要问题：

### 问题 1: Flutter 本地网络权限
```
Flutter could not access the local network.
Please ensure your IDE or terminal app has permission to access devices on the local network.
```

### 问题 2: 应用功能失败
- ❌ 搜索功能无法使用
- ❌ Mine 页面显示 "Failed to load data"
- ❌ VAGO 页面显示 "Failed to load data"

## ✅ 解决方案

### 步骤 1: 授予本地网络权限（必需）

这是解决 Flutter 连接问题的关键步骤：

1. **打开系统设置**
   - 点击屏幕左上角的 🍎 菜单
   - 选择 **"系统设置"** (System Settings)

2. **进入隐私设置**
   - 点击 **"隐私与安全性"** (Privacy & Security)
   - 滚动到底部，点击 **"本地网络"** (Local Network)

3. **授予权限**
   找到以下应用并**勾选**允许访问本地网络：
   - ✅ **Terminal**（或您使用的终端应用）
   - ✅ **VS Code**（如果使用 VS Code）
   - ✅ **Flutter**（如果有）
   - ✅ **Dart**（如果有）

4. **重启应用**
   - 完全关闭终端/IDE
   - 重新打开
   - 重新运行 `flutter run`

### 步骤 2: 验证后端 API 可访问

#### 从 Mac 测试：
```bash
# 测试本地访问
curl http://localhost:3000/health

# 测试 IP 访问
curl http://192.168.1.6:3000/health
```

应该看到：
```json
{"status":"ok","timestamp":"..."}
```

#### 从 iPhone 测试（重要）：
1. 确保 iPhone 和 Mac 在同一 Wi-Fi 网络
2. 在 iPhone 的 Safari 浏览器中打开：
   ```
   http://192.168.1.6:3000/health
   ```
3. 应该看到 JSON 响应

**如果无法访问**：
- 检查 Mac 防火墙设置
- 系统设置 > 网络 > 防火墙 > 选项
- 添加端口 3000 的例外，或临时关闭防火墙测试

### 步骤 3: 检查应用配置

确认 `.env.dev` 文件配置正确：

```bash
cd wanderlog_app
cat .env.dev
```

应该看到：
```
API_BASE_URL=http://192.168.1.6:3000/api
MAPBOX_ACCESS_TOKEN=pk.eyJ1IjoibW9yaWJhaGFhIiwiYSI6ImNtaXp0MzM5NjAxamgzZXB0dnI3MTl4dzIifQ.sHnu6-JSac2YGSwEhkK8ag
GOOGLE_CLIENT_ID=791447495976-rd5pp61vq7t61hp8sn2i3421kq7b18qi.apps.googleusercontent.com
```

### 步骤 4: 确保后端服务运行

```bash
# 检查服务状态
lsof -i :3000

# 如果未运行，启动服务
cd wanderlog_api
npm run dev
```

应该看到：
```
[INFO] Server is running on port 3000
```

### 步骤 5: 重新运行应用

完成以上步骤后：

```bash
cd wanderlog_app
flutter run -d 00008150-001954293C82401C
```

## 🧪 验证修复

### 1. 检查 Flutter 日志

应用启动后，查看控制台输出：
- 应该看到：`Dio baseUrl: http://192.168.1.6:3000/api`
- 不应该看到本地网络权限错误

### 2. 测试功能

#### 测试搜索功能：
1. 打开搜索页面
2. 输入搜索关键词
3. 应该能看到搜索结果

#### 测试 Mine 页面：
1. 打开 Mine 页面
2. 应该能看到：
   - 地图标记
   - 照片墙
   - 统计数据

#### 测试 VAGO 页面：
1. 打开 VAGO 页面
2. 应该能正常加载数据

### 3. 检查网络请求

在 Flutter 控制台中查看：
- 网络请求是否发送
- API 响应状态码
- 是否有错误信息

## 🔧 故障排除

### Q: 授予权限后仍然失败
**A**: 
1. 重启终端/IDE
2. 重启 Mac
3. 检查是否有多个终端应用需要授权
4. 确保授予了正确的应用权限

### Q: iPhone 无法访问 Mac API
**A**:
1. 确认 Mac 和 iPhone 在同一 Wi-Fi
2. 检查 Mac 防火墙设置
3. 在 iPhone Safari 中测试：`http://192.168.1.6:3000/health`
4. 如果仍然失败，临时关闭防火墙测试

### Q: 应用显示 "Failed to load data"
**A**:
1. 检查后端服务是否运行：`lsof -i :3000`
2. 检查 `.env.dev` 中的 API_BASE_URL
3. 查看 Flutter 日志中的网络错误
4. 确认 Mac IP 地址是否正确
5. 测试从 iPhone 浏览器访问 API

### Q: 搜索功能不工作
**A**:
1. 检查后端服务是否运行
2. 查看 Flutter 日志中的搜索请求
3. 确认 API 端点是否正确
4. 检查网络连接

## 📝 快速检查清单

- [ ] 已在系统设置中授予本地网络权限
- [ ] 已重启终端/IDE
- [ ] 后端服务正在运行（端口 3000）
- [ ] Mac 和 iPhone 在同一 Wi-Fi
- [ ] `.env.dev` 配置正确（使用 Mac IP）
- [ ] 可以从 iPhone 浏览器访问 `http://192.168.1.6:3000/health`
- [ ] Mac 防火墙允许端口 3000
- [ ] Flutter 日志显示正确的 API URL

## 🎯 预期结果

修复后，您应该能够：
- ✅ Flutter 成功连接到设备
- ✅ 应用成功连接到后端 API
- ✅ 搜索功能正常工作
- ✅ Mine 页面正常加载数据
- ✅ VAGO 页面正常加载数据

## 📚 相关文档

- **网络问题修复**：`FIX_NETWORK_ISSUES.md`
- **真机测试指南**：`IOS_DEVICE_TESTING.md`
- **快速开始**：`QUICK_START_DEVICE.md`
