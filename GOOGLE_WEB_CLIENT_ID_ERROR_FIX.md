# 🚨 Google 登录授权错误解决方案

## 错误信息
```
禁止访问：发生了授权错误
Custom scheme URIs are not allowed for 'WEB' client type.
错误 400：invalid_request
```

## 🔍 问题原因

你当前使用的 Client ID (`791447495976-o3akd7jtc96q0bfc0otb261jl4kn44vo`) 是 **Web 客户端类型**，但 iOS 原生应用需要使用 **iOS 客户端类型**的 Client ID。

## ✅ 解决步骤

### 步骤 1: 创建 iOS OAuth 客户端 ID

1. **访问 Google Cloud Console**
   ```
   https://console.cloud.google.com/apis/credentials
   ```

2. **选择你的项目**
   - 如果没有项目，点击 "创建项目"
   - 项目名称可以是 "WanderLog"

3. **创建 iOS OAuth 客户端 ID**
   - 点击顶部的 **"+ 创建凭据"**
   - 选择 **"OAuth 2.0 客户端 ID"**

4. **配置 iOS 客户端**
   - **应用类型**: 选择 **iOS**（重要！）
   - **名称**: `WanderLog iOS`
   - **软件包 ID**: `com.example.wanderlog`（必须与你的 Bundle ID 一致）

5. **创建并保存 Client ID**
   - 点击 "创建"
   - 会显示新的 Client ID，格式类似：`123456789-xxxxxx.apps.googleusercontent.com`
   - **复制这个 Client ID**（稍后要用）

### 步骤 2: 更新前端配置

编辑 `wanderlog_app/.env`，替换为新的 iOS Client ID：

```env
# 使用新创建的 iOS Client ID（不是 Web Client ID）
GOOGLE_CLIENT_ID=你的新iOS客户端ID.apps.googleusercontent.com
```

**示例**：
```env
GOOGLE_CLIENT_ID=123456789-abc123def456.apps.googleusercontent.com
```

### 步骤 3: 更新 iOS Info.plist

编辑 `wanderlog_app/ios/Runner/Info.plist`：

找到这两处配置，替换为新的 iOS Client ID：

```xml
<!-- 1. GIDClientID -->
<key>GIDClientID</key>
<string>你的新iOS客户端ID.apps.googleusercontent.com</string>

<!-- 2. CFBundleURLSchemes -->
<key>CFBundleURLSchemes</key>
<array>
    <string>com.googleusercontent.apps.你的新iOS客户端ID前缀</string>
</array>
```

**URL Scheme 格式说明**：

如果你的新 iOS Client ID 是：
```
123456789-abc123.apps.googleusercontent.com
```

那么 URL Scheme 应该是：
```
com.googleusercontent.apps.123456789-abc123
```

（去掉 `.apps.googleusercontent.com` 后缀，然后加上 `com.googleusercontent.apps.` 前缀）

### 步骤 4: 后端也需要配置（用于验证）

编辑 `wanderlog_api/.env`：

**后端仍然使用 Web Client ID**（用于验证 token）：

```env
# 后端使用 Web Client ID（不是 iOS Client ID）
GOOGLE_CLIENT_ID=791447495976-o3akd7jtc96q0bfc0otb261jl4kn44vo.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=你的Web客户端密钥
```

**重要**：
- **前端 (.env)**: 使用 **iOS Client ID**
- **后端 (.env)**: 使用 **Web Client ID**（保持不变）

### 步骤 5: 重新构建应用

```bash
cd wanderlog_app

# 清理缓存
flutter clean

# 获取依赖
flutter pub get

# 重新安装 pods
cd ios
pod install
cd ..

# 运行应用
flutter run
```

## 📋 快速配置示例

假设你创建的新 iOS Client ID 是：`987654321-xyz789.apps.googleusercontent.com`

### 前端 `.env`
```env
GOOGLE_CLIENT_ID=987654321-xyz789.apps.googleusercontent.com
```

### iOS `Info.plist`
```xml
<key>GIDClientID</key>
<string>987654321-xyz789.apps.googleusercontent.com</string>

<key>CFBundleURLSchemes</key>
<array>
    <string>com.googleusercontent.apps.987654321-xyz789</string>
</array>
```

### 后端 `.env`（保持不变）
```env
GOOGLE_CLIENT_ID=791447495976-o3akd7jtc96q0bfc0otb261jl4kn44vo.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=你的密钥
```

## 🔍 验证配置

运行检查脚本：
```bash
/Users/bahaa/Desktop/bahaa-dev-repo/wanderlog/check_ios_google_config.sh
```

## ⚠️ 重要提示

### Client ID 类型说明

| 用途 | Client ID 类型 | 配置位置 |
|------|---------------|---------|
| iOS 前端 | **iOS** | `wanderlog_app/.env` |
| iOS Info.plist | **iOS** | `ios/Runner/Info.plist` |
| 后端验证 | **Web** | `wanderlog_api/.env` |

### Bundle ID 必须一致

创建 iOS Client ID 时的 Bundle ID 必须是：
```
com.example.wanderlog
```

可以通过以下命令查看当前 Bundle ID：
```bash
grep -A 1 "PRODUCT_BUNDLE_IDENTIFIER = " wanderlog_app/ios/Runner.xcodeproj/project.pbxproj | head -1
```

## 🎯 常见问题

### Q: 我没有 Google Cloud 项目怎么办？

**A**: 按照以下步骤创建：
1. 访问 https://console.cloud.google.com/
2. 点击顶部的项目选择器
3. 点击 "新建项目"
4. 输入项目名称（如 "WanderLog"）
5. 点击 "创建"

### Q: 需要配置 OAuth 同意屏幕吗？

**A**: 是的，首次使用需要配置：
1. 在 Google Cloud Console 中
2. 选择 **API 和服务** > **OAuth 同意屏幕**
3. 选择 **外部** 用户类型
4. 填写应用名称：`WanderLog`
5. 添加你的邮箱
6. 保存并继续

### Q: 创建后多久生效？

**A**: 立即生效。创建后立即可以使用新的 Client ID。

### Q: 可以删除旧的 Web Client ID 吗？

**A**: **不要删除！** 后端验证 token 需要使用 Web Client ID。你需要同时保留：
- iOS Client ID（前端用）
- Web Client ID（后端验证用）

## 🚀 完成后测试

1. **重新运行应用**
   ```bash
   cd wanderlog_app
   flutter run
   ```

2. **点击 Google 登录**
   - 应该弹出 Google 账号选择器
   - 不会显示 "Custom scheme URIs are not allowed" 错误
   - 能够成功选择账号并授权

3. **验证登录成功**
   - 应该看到 "Google 登录成功" 提示
   - 自动跳转到主页
   - 用户信息已保存

## 📚 相关文档

- [IOS_GOOGLE_LOGIN_SETUP.md](./IOS_GOOGLE_LOGIN_SETUP.md) - 完整配置指南
- [Google OAuth 文档](https://developers.google.com/identity/protocols/oauth2)

---

**核心问题**：你用了 Web Client ID，需要创建并使用 iOS Client ID！ 🔑
