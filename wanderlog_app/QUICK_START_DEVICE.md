# 🚀 iOS 真机测试快速开始

## 一键配置（推荐）

```bash
cd wanderlog_app
./setup_ios_device.sh
```

脚本会自动完成大部分配置！

---

## 手动步骤

### 1. 配置环境（5分钟）

```bash
cd wanderlog_app

# 运行配置脚本
./setup_ios_device.sh
```

### 2. 配置 Xcode 签名（2分钟）

```bash
# 打开 Xcode
open ios/Runner.xcworkspace
```

在 Xcode 中：
1. 选择 **Runner** 项目（左侧）
2. 选择 **Runner** target
3. **Signing & Capabilities** 标签
4. ✅ 勾选 **"Automatically manage signing"**
5. 选择 **Team**（你的 Apple ID）

### 3. 连接设备（1分钟）

1. USB 连接 iPhone/iPad
2. 在设备上：**信任此电脑**
3. iOS 16+：**设置 > 隐私与安全性 > 开发者模式** > 启用 > 重启

### 4. 验证连接

```bash
./verify_device_connection.sh
```

### 5. 验证网络

```bash
./verify_network.sh
```

### 6. 运行应用

```bash
./build_and_run.sh
```

---

## 📋 快速检查清单

- [ ] 运行了 `./setup_ios_device.sh`
- [ ] 在 Xcode 中配置了代码签名
- [ ] iPhone/iPad 已 USB 连接
- [ ] 设备已信任此电脑
- [ ] iOS 16+ 已启用开发者模式
- [ ] 运行了 `./verify_device_connection.sh` 并看到设备
- [ ] 运行了 `./verify_network.sh` 并通过测试
- [ ] 后端服务正在运行（`lsof -i :3000`）

---

## 🆘 遇到问题？

### 找不到设备？
```bash
./verify_device_connection.sh
```

### 网络连接失败？
```bash
./verify_network.sh
```

### 需要详细指南？
查看：`IOS_DEVICE_SETUP_GUIDE.md`

---

## 📞 常用命令

```bash
# 检查设备
flutter devices

# 检查网络
./verify_network.sh

# 运行应用
./build_and_run.sh

# 查看日志
flutter logs
```

---

**详细文档**：`IOS_DEVICE_SETUP_GUIDE.md`
