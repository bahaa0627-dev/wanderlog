# Google OAuth 登录配置指南

## 📋 概述

已完成 Google 登录的前后端集成，现在需要配置 Google OAuth 凭证。

## ✅ 已完成的工作

### 后端 (wanderlog_api)
- ✅ 安装了 `google-auth-library` 包
- ✅ 创建了 `/auth/google` API 端点
- ✅ 实现了 `googleLogin` 控制器方法
- ✅ 支持验证 Google ID Token
- ✅ 自动创建/关联用户账号
- ✅ 返回 JWT Token 和用户信息

### 前端 (wanderlog_app)
- ✅ Google Sign-In 服务已存在
- ✅ 在 `AuthRepository` 添加了 `loginWithGoogle()` 方法
- ✅ 在 `AuthNotifier` 添加了 `loginWithGoogle()` 方法
- ✅ 更新了登录页面的 Google 登录按钮逻辑

## 🔧 配置步骤

### 1. 创建 Google Cloud 项目

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建新项目或选择现有项目
3. 项目名称：WanderLog（或其他名称）

### 2. 启用 API

1. 在左侧菜单选择 **APIs & Services** > **Library**
2. 搜索并启用：
   - **Google+ API** (或 **People API**)

### 3. 配置 OAuth 同意屏幕

1. 进入 **APIs & Services** > **OAuth consent screen**
2. 选择 **External** 用户类型（或 Internal 如果是 Google Workspace）
3. 填写应用信息：
   - **应用名称**: WanderLog
   - **用户支持电子邮件**: 你的邮箱
   - **开发者联系信息**: 你的邮箱
4. 添加作用域（可选，默认即可）：
   - `userinfo.email`
   - `userinfo.profile`
5. 点击 **保存并继续**

### 4. 创建 OAuth 2.0 凭证

#### 4.1 Web 凭证（用于后端验证）

1. 进入 **APIs & Services** > **Credentials**
2. 点击 **Create Credentials** > **OAuth 2.0 Client ID**
3. 应用类型：**Web application**
4. 名称：WanderLog Web
5. **授权的 JavaScript 来源**（可选）:
   ```
   http://localhost:3000
   ```
6. **授权的重定向 URI**（可选）:
   ```
   http://localhost:3000/auth/callback
   ```
7. 点击 **创建**
8. **保存 Client ID 和 Client Secret**

#### 4.2 iOS 凭证（用于 Flutter iOS）

1. 点击 **Create Credentials** > **OAuth 2.0 Client ID**
2. 应用类型：**iOS**
3. 名称：WanderLog iOS
4. **Bundle ID**: 从 `wanderlog_app/ios/Runner.xcodeproj/project.pbxproj` 中获取
   - 打开文件搜索 `PRODUCT_BUNDLE_IDENTIFIER`
   - 例如：`com.wanderlog.app`
5. 点击 **创建**
6. **保存 Client ID**（iOS 不需要 Client Secret）

#### 4.3 Android 凭证（用于 Flutter Android）

1. 点击 **Create Credentials** > **OAuth 2.0 Client ID**
2. 应用类型：**Android**
3. 名称：WanderLog Android
4. **Package name**: 从 `wanderlog_app/android/app/build.gradle` 中获取
   - 搜索 `applicationId`
   - 例如：`com.wanderlog.app`
5. **SHA-1 证书指纹**:
   ```bash
   # 开发环境（Debug）
   cd wanderlog_app/android
   ./gradlew signingReport
   
   # 或使用 keytool（Mac/Linux）
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
   
   # 生产环境需要使用你的发布密钥
   ```
6. 点击 **创建**
7. **保存 Client ID**

### 5. 配置后端环境变量

编辑 `wanderlog_api/.env` 文件：

```env
# Google OAuth 2.0
GOOGLE_CLIENT_ID=你的Web凭证Client_ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=你的Web凭证Client_Secret
```

### 6. 配置 Flutter 前端

#### 6.1 更新 Android 配置

编辑 `wanderlog_app/android/app/build.gradle`:

```gradle
defaultConfig {
    applicationId "com.wanderlog.app"  // 确保与 Google Console 中的 Package name 一致
    // ... 其他配置
}
```

#### 6.2 更新 iOS 配置

编辑 `wanderlog_app/ios/Runner/Info.plist`:

```xml
<key>GIDClientID</key>
<string>你的iOS凭证Client_ID.apps.googleusercontent.com</string>

<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleTypeRole</key>
        <string>Editor</string>
        <key>CFBundleURLSchemes</key>
        <array>
            <!-- 反转的 Client ID -->
            <string>com.googleusercontent.apps.你的iOS凭证Client_ID</string>
        </array>
    </dict>
</array>
```

**获取反转的 Client ID**:
- 如果 Client ID 是: `123456789-abc123.apps.googleusercontent.com`
- 反转后是: `com.googleusercontent.apps.123456789-abc123`

### 7. 更新 GoogleAuthService

编辑 `wanderlog_app/lib/features/auth/services/google_auth_service.dart`:

```dart
final GoogleSignIn _googleSignIn = GoogleSignIn(
  scopes: ['email', 'profile'],
  clientId: Platform.isIOS
      ? '你的iOS凭证Client_ID.apps.googleusercontent.com'
      : null, // Android 会自动从 google-services.json 读取
);
```

## 🧪 测试步骤

### 1. 重启后端服务

```bash
# 在 wanderlog_api 目录
npm run dev
```

### 2. 运行 Flutter 应用

```bash
# iOS
cd wanderlog_app
flutter run -d ios

# Android
flutter run -d android

# 或直接从 VS Code 调试
```

### 3. 测试 Google 登录

1. 在登录页面点击 **"Continue with Google"** 按钮
2. 选择 Google 账号
3. 授权应用访问你的信息
4. 应该自动跳转到主页并显示登录成功的提示

### 4. 验证后端日志

查看后端日志确认收到 Google 登录请求：
```
Google login successful for user: user@gmail.com
```

## ⚠️ 常见问题

### 问题 1: "idpiframe_initialization_failed" 错误

**原因**: 缺少 Web Client ID 或配置错误

**解决方案**:
- 确保在 Google Console 中创建了 **Web application** 类型的凭证
- 检查 `.env` 文件中的 `GOOGLE_CLIENT_ID` 是否正确

### 问题 2: iOS 登录后没有反应

**原因**: URL Scheme 配置错误

**解决方案**:
- 检查 `Info.plist` 中的反转 Client ID 是否正确
- 格式应为：`com.googleusercontent.apps.YOUR_CLIENT_ID`

### 问题 3: Android 登录失败 "API not enabled"

**原因**: 未启用 Google+ API 或 People API

**解决方案**:
- 在 Google Cloud Console 启用 **Google+ API** 或 **People API**
- 等待几分钟让 API 生效

### 问题 4: "DEVELOPER_ERROR" on Android

**原因**: SHA-1 指纹不匹配

**解决方案**:
- 重新生成 SHA-1 指纹
- 在 Google Console 更新 Android 凭证的 SHA-1

### 问题 5: Token 验证失败

**原因**: 后端使用了错误的 Client ID

**解决方案**:
- 确保 `.env` 中的 `GOOGLE_CLIENT_ID` 是 **Web application** 的 Client ID
- 不是 iOS 或 Android 的 Client ID

## 📚 相关文档

- [Google Sign-In for Flutter](https://pub.dev/packages/google_sign_in)
- [Google Identity - OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
- [google-auth-library (Node.js)](https://github.com/googleapis/google-auth-library-nodejs)

## 🎯 下一步

配置完成后，你可以：
1. 测试 Google 登录流程
2. 添加错误处理和用户反馈
3. 实现账号关联（如果用户先用邮箱注册，后用 Google 登录）
4. 添加 Google 账号头像显示

## ✅ 测试检查清单

- [ ] Google Cloud Console 项目已创建
- [ ] OAuth 同意屏幕已配置
- [ ] Web 凭证已创建
- [ ] iOS 凭证已创建（如需要）
- [ ] Android 凭证已创建（如需要）
- [ ] 后端 `.env` 已配置
- [ ] iOS `Info.plist` 已配置
- [ ] Android `build.gradle` 已配置
- [ ] GoogleAuthService 已更新 clientId
- [ ] 后端服务已重启
- [ ] iOS 测试成功
- [ ] Android 测试成功
- [ ] 用户信息正确显示
- [ ] Token 验证正常工作

---

配置完成后，你的 Google 登录功能就可以正常使用了！🎉
