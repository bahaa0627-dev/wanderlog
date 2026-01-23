# iOS 真机测试完整指南

## ✅ 已完成的配置

1. **Mac IP 地址**：`192.168.1.6`
2. **环境变量**：`.env.dev` 已更新为使用 Mac IP
   ```
   API_BASE_URL=http://192.168.1.6:3000/api
   ```
3. **后端服务**：已验证运行并可访问

## 📋 待完成的步骤

### 步骤 1: 配置 Xcode 代码签名

Xcode 项目已打开，请按照以下步骤：

1. **在 Xcode 中**：
   - 左侧导航栏选择 **Runner** 项目（蓝色图标）
   - 中间面板选择 **Runner** target
   - 点击 **Signing & Capabilities** 标签

2. **配置签名**：
   - ✅ 勾选 **"Automatically manage signing"**
   - 在 **Team** 下拉菜单中选择您的 Apple ID
     - 如果没有账号，点击 **"Add Account..."** 添加
   - Bundle Identifier：`com.example.wanderlog`
     - 如果冲突，改为唯一标识符（如：`com.yourname.wanderlog`）

3. **验证**：
   - 确保显示 ✅ "Signing certificate is valid"
   - 确保显示 ✅ "Provisioning profile is valid"

**详细说明**：查看 `ios_device_setup_guide.md`

---

### 步骤 2: 连接 iOS 设备

1. **物理连接**：
   - 使用 USB 线连接 iPhone/iPad 到 Mac
   - 在 iPhone 上：如果提示 "信任此电脑"，选择 **"信任"**
   - 输入设备密码确认

2. **启用开发者模式**（iOS 16+）：
   - 设置 > 隐私与安全性 > 开发者模式
   - 启用 **"开发者模式"**
   - **重启设备**

3. **验证连接**：
   ```bash
   cd wanderlog_app
   flutter devices
   ```
   
   应该看到类似输出：
   ```
   iPhone (mobile) • xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx • ios • iOS 17.0
   ```

---

### 步骤 3: 运行应用到设备

#### 方法 1: 使用自动化脚本（推荐）

```bash
cd wanderlog_app
./run_on_device.sh
```

脚本会自动：
- 检查 Flutter 环境
- 检查设备连接
- 检查后端服务
- 验证环境配置
- 运行应用到设备

#### 方法 2: 使用 Flutter CLI

```bash
cd wanderlog_app

# 查看可用设备
flutter devices

# 运行到指定设备
flutter run -d <device-id>

# 或让 Flutter 自动选择
flutter run
```

#### 方法 3: 使用 Xcode

1. 在 Xcode 顶部选择您的 iPhone 设备
2. 点击运行按钮（▶️）或按 `Cmd + R`
3. 首次运行可能需要在设备上信任开发者：
   - 设置 > 通用 > VPN 与设备管理
   - 选择开发者 App
   - 点击 **"信任"**

---

### 步骤 4: 验证网络连接

应用启动后：

1. **检查日志**：
   - 查看 Flutter 控制台输出
   - 应该看到：`Dio baseUrl: http://192.168.1.6:3000/api`

2. **测试功能**：
   - 尝试登录或注册
   - 检查是否能成功连接到后端

3. **如果连接失败**：
   - ✅ 确认 Mac 和 iPhone 在同一 Wi-Fi 网络
   - ✅ 检查 Mac 防火墙设置
     - 系统设置 > 网络 > 防火墙
     - 临时关闭测试，或添加端口 3000 的例外
   - ✅ 验证后端服务正在运行：`lsof -i :3000`
   - ✅ 在 iPhone 浏览器中测试：`http://192.168.1.6:3000/health`

---

## 🔧 故障排除

### 问题 1: "No devices found"

**解决方案**：
- 检查 USB 连接
- 在设备上信任电脑
- 运行 `flutter doctor` 检查环境
- 确保已启用开发者模式（iOS 16+）

### 问题 2: 代码签名错误

**解决方案**：
- 在 Xcode 中检查 Signing & Capabilities
- 确保选择了有效的 Team
- 如果使用免费 Apple ID，Bundle Identifier 需要唯一
- 检查证书是否过期

### 问题 3: 无法连接到 API

**解决方案**：
- 确认 Mac 和 iPhone 在同一 Wi-Fi
- 检查 Mac 防火墙设置
- 验证 `.env.dev` 中的 `API_BASE_URL` 使用 Mac IP 而不是 localhost
- 测试从 iPhone 浏览器访问：`http://192.168.1.6:3000/health`

### 问题 4: 开发者模式未启用

**解决方案**：
- 设置 > 隐私与安全性 > 开发者模式 > 启用
- 重启设备后再次尝试

---

## 📝 快速参考

### 当前配置

- **Mac IP**: `192.168.1.6`
- **API URL**: `http://192.168.1.6:3000/api`
- **后端端口**: `3000`
- **Bundle ID**: `com.example.wanderlog`

### 常用命令

```bash
# 检查设备
flutter devices

# 查看日志
flutter logs

# 运行应用
flutter run

# 检查后端
lsof -i :3000
curl http://192.168.1.6:3000/health

# 获取 Mac IP
ipconfig getifaddr en0
```

---

## 🎯 下一步

完成以上步骤后，您就可以在真机上测试应用了！

如果遇到任何问题，请参考故障排除部分或查看详细的配置指南。
