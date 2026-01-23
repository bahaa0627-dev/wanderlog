# iOS 真机测试配置总结

## ✅ 已完成的自动化配置

### 1. 网络配置
- ✅ **Mac IP 地址**：`192.168.1.6`
- ✅ **环境变量更新**：`.env.dev` 文件已更新
  ```
  API_BASE_URL=http://192.168.1.6:3000/api
  MAPBOX_ACCESS_TOKEN=pk.eyJ1IjoibW9yaWJhaGFhIiwiYSI6ImNtaXp0MzM5NjAxamgzZXB0dnI3MTl4dzIifQ.sHnu6-JSac2YGSwEhkK8ag
  GOOGLE_CLIENT_ID=791447495976-rd5pp61vq7t61hp8sn2i3421kq7b18qi.apps.googleusercontent.com
  ```

### 2. 后端服务验证
- ✅ **后端服务状态**：正在运行（端口 3000）
- ✅ **本地访问测试**：`http://localhost:3000/health` ✅
- ✅ **IP 访问测试**：`http://192.168.1.6:3000/health` ✅

### 3. 设备连接
- ✅ **设备检测**：已检测到设备 "戴鑫茹的iPhone"（无线连接）
- ✅ **设备 ID**：`00008150-001954293C82401C`
- ✅ **iOS 版本**：iOS 26.0

### 4. 项目配置
- ✅ **Xcode 项目**：已打开 `ios/Runner.xcworkspace`
- ✅ **辅助脚本**：已创建 `run_on_device.sh`
- ✅ **文档**：已创建完整测试指南

## 📋 需要手动完成的步骤

### ⚠️ 重要：Xcode 代码签名配置（必需）

**这是运行应用到真机的必要步骤**，需要在 Xcode GUI 中手动完成：

1. **在已打开的 Xcode 中**：
   - 左侧导航栏选择 **Runner** 项目（蓝色图标）
   - 中间面板选择 **Runner** target
   - 点击 **Signing & Capabilities** 标签

2. **配置签名**：
   - ✅ 勾选 **"Automatically manage signing"**
   - 在 **Team** 下拉菜单中选择您的 Apple ID
     - 如果没有账号，点击 **"Add Account..."** 添加
   - Bundle Identifier：`com.example.wanderlog`
     - 如果显示错误（已被占用），改为唯一标识符，例如：`com.yourname.wanderlog`

3. **验证**：
   - 确保显示 ✅ "Signing certificate is valid"
   - 确保显示 ✅ "Provisioning profile is valid"

**详细说明**：查看 `ios_device_setup_guide.md`

---

### 运行应用到设备

配置完签名后，使用以下任一方法运行：

#### 方法 1: 自动化脚本（推荐）
```bash
cd wanderlog_app
./run_on_device.sh
```

#### 方法 2: Flutter CLI
```bash
cd wanderlog_app
flutter run -d 00008150-001954293C82401C
```

#### 方法 3: Xcode
- 在 Xcode 顶部选择 "戴鑫茹的iPhone"
- 点击运行按钮（▶️）或按 `Cmd + R`

---

### 验证网络连接

应用启动后：
1. 查看 Flutter 控制台日志
2. 应该看到：`Dio baseUrl: http://192.168.1.6:3000/api`
3. 尝试登录/注册功能
4. 确认能成功连接到后端

如果连接失败：
- ✅ 确认 Mac 和 iPhone 在同一 Wi-Fi 网络
- ✅ 检查 Mac 防火墙设置（系统设置 > 网络 > 防火墙）
- ✅ 在 iPhone 浏览器中测试：`http://192.168.1.6:3000/health`

## 📚 相关文档

- **快速开始**：`QUICK_START_DEVICE.md`
- **完整指南**：`IOS_DEVICE_TESTING.md`
- **Xcode 配置**：`ios_device_setup_guide.md`
- **运行脚本**：`run_on_device.sh`

## 🎯 下一步

1. **完成 Xcode 签名配置**（必需）
2. **运行应用到设备**
3. **测试网络连接和功能**

配置完成后，您就可以在真机上测试应用了！

---

## 📝 配置详情

| 项目 | 值 |
|------|-----|
| Mac IP | `192.168.1.6` |
| API URL | `http://192.168.1.6:3000/api` |
| 后端端口 | `3000` |
| 设备名称 | 戴鑫茹的iPhone |
| 设备 ID | `00008150-001954293C82401C` |
| iOS 版本 | iOS 26.0 |
| Bundle ID | `com.example.wanderlog` |
