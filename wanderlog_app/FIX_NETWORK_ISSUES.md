# 修复网络连接问题

## 🔍 问题分析

您遇到了两个问题：

### 问题 1: Flutter 本地网络权限
```
Flutter could not access the local network.
Please ensure your IDE or terminal app has permission to access devices on the local network.
```

### 问题 2: 应用无法加载数据
- 搜索功能失败
- Mine 页面显示 "Failed to load data"
- VAGO 页面显示 "Failed to load data"

## ✅ 解决方案

### 步骤 1: 授予本地网络权限（必需）

1. **打开系统设置**
   - 点击屏幕左上角的 🍎 菜单
   - 选择 **"系统设置"** (System Settings)

2. **进入隐私设置**
   - 点击 **"隐私与安全性"** (Privacy & Security)
   - 滚动到底部，点击 **"本地网络"** (Local Network)

3. **授予权限**
   - 找到您的终端应用（Terminal、iTerm、VS Code 等）
   - 或者找到 **"Flutter"** 或 **"Dart"**
   - ✅ **勾选** 允许访问本地网络

4. **重启终端/IDE**
   - 关闭并重新打开终端或 VS Code
   - 重新运行 `flutter run`

### 步骤 2: 验证后端 API 可访问

#### 从 Mac 测试：
```bash
# 测试本地访问
curl http://localhost:3000/health

# 测试 IP 访问
curl http://192.168.1.6:3000/health
```

#### 从 iPhone 测试：
1. 确保 iPhone 和 Mac 在同一 Wi-Fi 网络
2. 在 iPhone 的 Safari 浏览器中打开：
   ```
   http://192.168.1.6:3000/health
   ```
3. 应该看到：
   ```json
   {"status":"ok","timestamp":"..."}
   ```

### 步骤 3: 检查防火墙设置

如果从 iPhone 无法访问：

1. **打开系统设置**
   - 系统设置 > 网络 > 防火墙

2. **配置防火墙**
   - 如果防火墙已启用，点击 **"选项"** (Options)
   - 添加端口 3000 的例外
   - 或者临时关闭防火墙测试

### 步骤 4: 验证应用配置

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

### 步骤 5: 检查后端服务

确保后端服务正在运行：

```bash
# 检查服务状态
lsof -i :3000

# 如果未运行，启动服务
cd wanderlog_api
npm run dev
```

## 🧪 测试步骤

### 1. 测试本地网络权限
```bash
# 重新运行应用
cd wanderlog_app
flutter run -d 00008150-001954293C82401C
```

如果仍然看到本地网络权限错误，请：
- 确保已在系统设置中授予权限
- 重启终端/IDE
- 重启 Mac（如果问题持续）

### 2. 测试 API 连接

应用启动后，查看 Flutter 日志：
- 应该看到：`Dio baseUrl: http://192.168.1.6:3000/api`
- 尝试登录或搜索功能
- 检查是否有网络错误

### 3. 检查应用日志

在 Flutter 控制台中查看：
- 网络请求是否发送
- 是否有连接超时错误
- API 响应状态码

## 🔧 常见问题

### Q: 授予权限后仍然失败
**A**: 
1. 重启终端/IDE
2. 重启 Mac
3. 检查是否有多个终端应用需要授权

### Q: iPhone 无法访问 Mac API
**A**:
1. 确认 Mac 和 iPhone 在同一 Wi-Fi
2. 检查 Mac 防火墙设置
3. 在 iPhone Safari 中测试：`http://192.168.1.6:3000/health`

### Q: 应用显示 "Failed to load data"
**A**:
1. 检查后端服务是否运行：`lsof -i :3000`
2. 检查 `.env.dev` 中的 API_BASE_URL
3. 查看 Flutter 日志中的网络错误
4. 确认 Mac IP 地址是否正确

## 📝 快速检查清单

- [ ] 已在系统设置中授予本地网络权限
- [ ] 已重启终端/IDE
- [ ] 后端服务正在运行（端口 3000）
- [ ] Mac 和 iPhone 在同一 Wi-Fi
- [ ] `.env.dev` 配置正确（使用 Mac IP）
- [ ] 可以从 iPhone 浏览器访问 `http://192.168.1.6:3000/health`
- [ ] Mac 防火墙允许端口 3000

## 🎯 下一步

完成以上步骤后：
1. 重新运行应用：`flutter run -d 00008150-001954293C82401C`
2. 测试搜索功能
3. 测试 Mine 页面
4. 测试 VAGO 页面

如果问题仍然存在，请查看 Flutter 日志中的具体错误信息。
