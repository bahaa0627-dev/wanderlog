# 📱 iOS 真机测试配置完整指南

本指南基于实施计划，提供 iOS 真机测试的完整配置步骤。

## 📋 目录

1. [快速开始](#快速开始)
2. [详细步骤](#详细步骤)
3. [Xcode 代码签名配置](#xcode-代码签名配置)
4. [设备连接](#设备连接)
5. [网络配置](#网络配置)
6. [构建和运行](#构建和运行)
7. [故障排查](#故障排查)

---

## 🚀 快速开始

### 自动化配置（推荐）

运行配置脚本，自动完成大部分设置：

```bash
cd wanderlog_app
./setup_ios_device.sh
```

脚本会自动：
- ✅ 获取 Mac IP 地址
- ✅ 更新 .env.dev 文件
- ✅ 检查后端服务状态
- ✅ 检查防火墙设置
- ✅ 检查设备连接
- ✅ 验证 Xcode 配置

### 手动配置

如果脚本无法运行，请按照以下步骤手动配置。

---

## 📝 详细步骤

### 步骤 1: 获取 Mac 的本地 IP 地址

真机无法使用 `localhost`，需要使用 Mac 在局域网中的 IP 地址。

#### 方法 1: 使用 ipconfig（推荐）

```bash
# Wi-Fi
ipconfig getifaddr en0

# 以太网
ipconfig getifaddr en1
```

#### 方法 2: 使用 ifconfig

```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

#### 方法 3: 系统设置

系统设置 > 网络 > Wi-Fi/Ethernet > 查看 IP 地址

**记录下 IP 地址**（例如：`192.168.1.6`）

---

### 步骤 2: 更新环境变量配置

更新 `wanderlog_app/.env.dev` 文件，将 API 地址改为 Mac 的 IP：

```bash
cd wanderlog_app

# 获取 Mac IP（假设是 192.168.1.6）
MAC_IP=$(ipconfig getifaddr en0)

# 更新 .env.dev
cat > .env.dev << EOF
API_BASE_URL=http://${MAC_IP}:3000/api
MAPBOX_ACCESS_TOKEN=pk.eyJ1IjoibW9yaWJhaGFhIiwiYSI6ImNtaXp0MzM5NjAxamgzZXB0dnI3MTl4dzIifQ.sHnu6-JSac2YGSwEhkK8ag
GOOGLE_CLIENT_ID=791447495976-rd5pp61vq7t61hp8sn2i3421kq7b18qi.apps.googleusercontent.com

# Supabase 配置（如果使用）
SUPABASE_URL=https://bpygtpeawkxlgjhqorzi.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJweWd0cGVhd2t4bGdqaHFvcnppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MTM1NjQsImV4cCI6MjA4MTk4OTU2NH0.6_2dRSlPs54Q25RtKP07eIv-7t0yDFOkibAt05Bp_RQ
EOF
```

**重要提示**：
- 确保 Mac 和 iPhone 连接到**同一个 Wi-Fi 网络**
- `.env.dev` 用于开发环境，`.env` 用于生产环境
- 如果应用加载 `.env`，也需要更新 `.env` 文件

---

### 步骤 3: 确保后端 API 可访问

#### 3.1 检查后端服务

```bash
# 检查后端是否运行
lsof -i :3000

# 如果未运行，启动后端
cd wanderlog_api
npm run dev
```

#### 3.2 测试从 Mac 访问

```bash
# 测试本地访问（应该成功）
curl http://localhost:3000/health

# 测试 IP 访问（应该成功）
curl http://192.168.1.6:3000/health
```

#### 3.3 配置防火墙

如果 IP 访问失败，可能是防火墙阻止了连接：

1. **打开系统设置**
   - 系统设置 > 网络 > 防火墙

2. **配置防火墙**
   - 点击 **"选项"** (Options)
   - 找到 Node.js 或 node，设置为 **"允许传入连接"**
   - 或者添加端口 3000 的例外
   - 或者临时关闭防火墙测试

3. **验证配置**
   ```bash
   # 从 Mac 测试 IP 访问
   curl http://192.168.1.6:3000/health
   ```

#### 3.4 测试从设备访问

在 iPhone Safari 中打开：
```
http://192.168.1.6:3000/health
```

应该看到 JSON 响应：
```json
{"status":"ok","timestamp":"2026-01-22T20:37:38.538Z"}
```

---

## 🔐 Xcode 代码签名配置

### 打开 Xcode 项目

```bash
cd wanderlog_app
open ios/Runner.xcworkspace
```

**注意**：必须打开 `.xcworkspace`，不是 `.xcodeproj`

### 配置签名设置

在 Xcode 中：

1. **选择项目**
   - 左侧导航栏选择 `Runner` 项目（蓝色图标）

2. **选择 Target**
   - 在项目设置中，选择 `Runner` target（不是 RunnerTests）

3. **进入 Signing & Capabilities 标签**

4. **配置自动签名**（推荐）
   - ✅ 勾选 **"Automatically manage signing"**
   - 选择 **Team**（需要 Apple ID 或开发者账号）
   - Bundle Identifier 会自动设置为 `com.example.wanderlog`
   - 如果冲突，可以改为 `com.yourname.wanderlog`

5. **手动签名**（高级）
   - 取消 "Automatically manage signing"
   - 选择 Provisioning Profile 和 Signing Certificate

### 修改 Bundle Identifier（如需要）

如果 `com.example.wanderlog` 已被使用：

1. 在 Xcode 中：项目设置 > Target Runner > General
2. 修改 **Bundle Identifier**
3. 改为唯一标识符，例如：`com.yourname.wanderlog`

**注意**：修改 Bundle ID 后，需要更新：
- Google OAuth Client ID（如果使用）
- Info.plist 中的 URL Schemes

---

## 📱 设备连接

### 物理连接

1. **使用 USB 线连接 iPhone/iPad 到 Mac**
2. **在 iPhone 上**：
   - 如果提示 **"信任此电脑"**，选择 **"信任"**
   - 输入设备密码确认

### 启用开发者模式（iOS 16+）

如果设备运行 iOS 16 或更高版本：

1. **设置 > 隐私与安全性 > 开发者模式**
2. 启用 **"开发者模式"**
3. **重启设备**
4. 重启后，再次确认启用开发者模式

### 验证设备连接

```bash
cd wanderlog_app
flutter devices
```

应该看到类似输出：
```
iPhone (mobile) • xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx • ios • iOS 17.0
```

或在 Xcode 中：
- 顶部工具栏 > 设备选择器 > 应该看到您的 iPhone

---

## 🌐 网络配置

### 当前配置说明

`dio_provider.dart` 中的网络处理逻辑：

- **Android 模拟器**：自动将 `localhost` 转换为 `10.0.2.2`
- **iOS 模拟器**：自动将 `localhost` 转换为 `127.0.0.1`
- **真机**：需要手动配置为 Mac 的 IP 地址（通过 `.env.dev` 文件）

### 验证网络连接

应用启动后，检查是否能连接到后端：

1. **查看 Flutter 日志**
   ```bash
   flutter logs
   ```
   应该看到：`Dio baseUrl: http://192.168.1.6:3000/api`

2. **测试 API 调用**
   - 在应用中尝试登录或注册
   - 查看是否有网络错误

3. **从设备 Safari 测试**
   - 打开：`http://192.168.1.6:3000/health`
   - 应该看到 JSON 响应

---

## 🏗️ 构建和运行

### 方法 1: 使用 Flutter CLI（推荐）

```bash
cd wanderlog_app

# 确保依赖已安装
flutter pub get

# 运行到连接的设备
flutter run -d <device-id>

# 或者让 Flutter 自动选择设备
flutter run
```

### 方法 2: 使用 Xcode

1. **在 Xcode 顶部选择您的 iPhone 设备**
2. **点击运行按钮（▶️）或按 `Cmd + R`**
3. **首次运行可能需要在设备上信任开发者**：
   - 设置 > 通用 > VPN 与设备管理
   - 选择开发者 App
   - 点击 **"信任"**

---

## 🔍 故障排查

### 问题 1: "No devices found"

**解决方案**：
- ✅ 检查 USB 连接
- ✅ 在设备上信任电脑
- ✅ 运行 `flutter doctor` 检查环境
- ✅ 重启 Xcode 和 Flutter
- ✅ iOS 16+ 需要启用开发者模式

### 问题 2: 代码签名错误

**解决方案**：
- ✅ 确保在 Xcode 中选择了有效的 Team
- ✅ 如果使用免费 Apple ID，Bundle Identifier 需要唯一
- ✅ 检查证书是否过期
- ✅ 尝试清理构建：`flutter clean`

### 问题 3: 无法连接到 API

**解决方案**：
- ✅ 确认 Mac 和 iPhone 在同一 Wi-Fi 网络
- ✅ 检查 Mac 防火墙设置（系统设置 > 网络 > 防火墙）
- ✅ 临时关闭防火墙测试，或添加端口 3000 的例外
- ✅ 验证 API_BASE_URL 使用 Mac 的 IP 而不是 localhost
- ✅ 从 iPhone Safari 测试：`http://YOUR_MAC_IP:3000/health`
- ✅ 检查后端服务是否正在运行：`lsof -i :3000`

### 问题 4: 开发者模式未启用（iOS 16+）

**解决方案**：
- ✅ 设置 > 隐私与安全性 > 开发者模式 > 启用
- ✅ 重启设备后再次尝试

### 问题 5: Safari 无法访问 API

**解决方案**：
- ✅ 检查后端服务是否运行：`lsof -i :3000`
- ✅ 检查防火墙设置
- ✅ 确认 Mac 和 iPhone 在同一 Wi-Fi
- ✅ 验证 Mac IP 地址：`ipconfig getifaddr en0`

### 问题 6: 应用启动后网络错误

**检查清单**：
- [ ] `.env.dev` 中的 `API_BASE_URL` 使用 Mac IP
- [ ] 后端服务正在运行
- [ ] Mac 和 iPhone 在同一 Wi-Fi
- [ ] 防火墙允许端口 3000
- [ ] 从 iPhone Safari 可以访问 `http://MAC_IP:3000/health`

---

## 📚 相关文件

- `wanderlog_app/lib/core/providers/dio_provider.dart` - API URL 处理逻辑
- `wanderlog_app/ios/Runner.xcodeproj/project.pbxproj` - Xcode 项目配置
- `wanderlog_app/ios/Runner/Info.plist` - iOS 应用配置
- `wanderlog_app/.env.dev` - 环境变量配置文件
- `wanderlog_app/setup_ios_device.sh` - 自动化配置脚本

---

## 🎯 快速检查清单

在运行应用前，确认：

- [ ] Mac IP 地址已获取
- [ ] `.env.dev` 已更新为 Mac IP
- [ ] 后端服务正在运行
- [ ] 可以从 Mac 访问 `http://MAC_IP:3000/health`
- [ ] 可以从 iPhone Safari 访问 `http://MAC_IP:3000/health`
- [ ] Xcode 代码签名已配置
- [ ] iOS 设备已连接并信任
- [ ] iOS 16+ 已启用开发者模式
- [ ] `flutter devices` 显示设备

---

## 💡 提示

1. **保持后端服务运行**：在另一个终端窗口运行 `npm run dev`
2. **使用脚本**：运行 `./setup_ios_device.sh` 自动配置
3. **检查日志**：使用 `flutter logs` 查看详细错误信息
4. **网络测试**：先在 Safari 中测试 API 访问，再运行应用

---

## 📞 需要帮助？

如果遇到问题：
1. 运行 `./setup_ios_device.sh` 检查配置
2. 查看 `flutter doctor` 输出
3. 检查 Xcode 控制台日志
4. 查看 Flutter 日志：`flutter logs`
