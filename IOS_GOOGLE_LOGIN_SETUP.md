# 🍎 iOS Google 登录配置指南

## 当前配置信息

- **Bundle ID**: `com.example.wanderlog`
- **应用名称**: WanderLog

## 📋 配置步骤

### 步骤 1: 访问 Google Cloud Console

访问 [Google Cloud Console](https://console.cloud.google.com/)

### 步骤 2: 创建或选择项目

1. 点击顶部的项目选择器
2. 创建新项目或选择现有项目
   - 项目名称：`WanderLog`（或任意名称）

### 步骤 3: 启用必要的 API

1. 在左侧菜单选择 **API 和服务** > **库**
2. 搜索 **Google+ API** 或 **People API**
3. 点击 **启用**

### 步骤 4: 配置 OAuth 同意屏幕

1. 在左侧菜单选择 **API 和服务** > **OAuth 同意屏幕**
2. 选择 **外部** 用户类型
3. 填写必填信息：
   - 应用名称：`WanderLog`
   - 用户支持电子邮件：你的邮箱
   - 开发者联系信息：你的邮箱
4. 点击 **保存并继续**
5. 范围（Scopes）：无需添加，直接点 **保存并继续**
6. 测试用户：可以添加你自己的邮箱用于测试
7. 点击 **保存并继续**

### 步骤 5: 创建 OAuth 2.0 凭证

#### 5.1 创建 iOS 客户端 ID

1. 在左侧菜单选择 **API 和服务** > **凭据**
2. 点击 **+ 创建凭据** > **OAuth 2.0 客户端 ID**
3. 应用类型选择：**iOS**
4. 填写信息：
   - **名称**：`WanderLog iOS`
   - **软件包 ID**：`com.example.wanderlog`（你的 Bundle ID）

5. 点击 **创建**
6. **重要**：复制生成的 **客户端 ID**（格式：`123456789-xxxxx.apps.googleusercontent.com`）

#### 5.2 创建 Web 客户端 ID（用于后端验证）

1. 再次点击 **+ 创建凭据** > **OAuth 2.0 客户端 ID**
2. 应用类型选择：**Web 应用**
3. 填写信息：
   - **名称**：`WanderLog Web`
   - **已获授权的 JavaScript 来源**：`http://localhost:3000`（开发环境）
   - **已获授权的重定向 URI**：`http://localhost:3000/auth/callback`
4. 点击 **创建**
5. 复制 **客户端 ID** 和 **客户端密钥**

### 步骤 6: 配置前端 (.env)

编辑 `wanderlog_app/.env`：

```env
# 使用 iOS 客户端 ID
GOOGLE_CLIENT_ID=你的iOS客户端ID.apps.googleusercontent.com
```

**示例**：
```env
GOOGLE_CLIENT_ID=123456789-abcdefgh.apps.googleusercontent.com
```

### 步骤 7: 配置后端 (.env)

编辑 `wanderlog_api/.env`：

```env
# 使用 Web 客户端 ID 和密钥
GOOGLE_CLIENT_ID=你的Web客户端ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=你的客户端密钥
```

### 步骤 8: 配置 iOS Info.plist

编辑 `wanderlog_app/ios/Runner/Info.plist`，在 `</dict>` 之前添加：

```xml
<!-- Google Sign-In 配置 -->
<key>GIDClientID</key>
<string>你的iOS客户端ID.apps.googleusercontent.com</string>

<!-- URL Scheme 用于回调 -->
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleTypeRole</key>
        <string>Editor</string>
        <key>CFBundleURLSchemes</key>
        <array>
            <!-- 注意：这里是反转的客户端 ID -->
            <string>com.googleusercontent.apps.你的反转ID</string>
        </array>
    </dict>
</array>
```

#### URL Scheme 说明

如果你的 iOS 客户端 ID 是：
```
123456789-abcdefgh.apps.googleusercontent.com
```

那么反转的 URL Scheme 是：
```
com.googleusercontent.apps.123456789-abcdefgh
```

**完整示例**：
```xml
<key>GIDClientID</key>
<string>123456789-abcdefgh.apps.googleusercontent.com</string>

<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleTypeRole</key>
        <string>Editor</string>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>com.googleusercontent.apps.123456789-abcdefgh</string>
        </array>
    </dict>
</array>
```

### 步骤 9: 重新运行应用

```bash
cd wanderlog_app

# 清理构建缓存
flutter clean

# 重新安装 pods
cd ios
pod install
cd ..

# 运行应用
flutter run
```

## ✅ 验证配置

### 1. 检查 .env 文件

```bash
cat wanderlog_app/.env | grep GOOGLE_CLIENT_ID
```

应该看到：
```
GOOGLE_CLIENT_ID=你的iOS客户端ID.apps.googleusercontent.com
```

### 2. 检查 Info.plist

```bash
cat wanderlog_app/ios/Runner/Info.plist | grep -A 2 "GIDClientID"
```

应该看到你的客户端 ID。

### 3. 测试登录

1. 运行应用
2. 进入登录页面
3. 点击 "Continue with Google"
4. 应该弹出 Google 账号选择界面
5. 选择账号并授权
6. 登录成功！

## 🔍 常见问题

### Q1: 点击 Google 登录没有反应？

**检查：**
1. Info.plist 中是否添加了 `GIDClientID`
2. URL Scheme 是否正确（注意是反转的 ID）
3. .env 文件中的 GOOGLE_CLIENT_ID 是否正确

### Q2: 出现 "Missing GOOGLE_CLIENT_ID" 错误？

**解决：**
1. 确认 .env 文件中有 `GOOGLE_CLIENT_ID`
2. 运行 `flutter clean && flutter run` 重新构建

### Q3: Google 登录后没有跳转回应用？

**检查：**
1. CFBundleURLSchemes 是否配置正确
2. URL Scheme 格式是否正确（`com.googleusercontent.apps.xxx`）

### Q4: 后端返回 "Invalid Google token"？

**检查：**
1. 后端 .env 使用的是 **Web 客户端 ID**（不是 iOS 客户端 ID）
2. GOOGLE_CLIENT_SECRET 是否正确
3. 后端 API 是否正在运行

## 📝 快速配置清单

- [ ] 创建 Google Cloud 项目
- [ ] 启用 Google+ API
- [ ] 配置 OAuth 同意屏幕
- [ ] 创建 iOS OAuth 客户端 ID
- [ ] 创建 Web OAuth 客户端 ID
- [ ] 更新前端 .env（使用 iOS 客户端 ID）
- [ ] 更新后端 .env（使用 Web 客户端 ID 和密钥）
- [ ] 配置 iOS Info.plist
  - [ ] 添加 GIDClientID
  - [ ] 添加 CFBundleURLSchemes
- [ ] 运行 `flutter clean`
- [ ] 运行 `pod install`
- [ ] 运行 `flutter run`
- [ ] 测试 Google 登录

## 🎯 重要提示

1. **iOS 客户端 ID** 用于前端（Flutter）
2. **Web 客户端 ID** 用于后端（Node.js）验证
3. 不要混淆这两个 Client ID！
4. URL Scheme 必须是**反转的客户端 ID**
5. Bundle ID 必须与 Google Console 中配置的一致：`com.example.wanderlog`

## 🔗 相关资源

- [Google Sign-In iOS 文档](https://developers.google.com/identity/sign-in/ios/start-integrating)
- [Flutter Google Sign-In 包](https://pub.dev/packages/google_sign_in)
- [Google Cloud Console](https://console.cloud.google.com/)

---

配置完成后，你就可以在 iOS 上使用 Google 登录了！🎉
