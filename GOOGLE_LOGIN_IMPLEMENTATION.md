# Google 登录实现指南

## 📋 实现概述
实现 Google OAuth 登录功能，包括前端和后端的完整流程。

## 🔧 后端实现

### 1. 安装依赖包
```bash
cd wanderlog_api
npm install google-auth-library
```

### 2. 添加环境变量
在 `.env` 文件中添加：
```
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

### 3. 后端代码已实现
- ✅ Google 登录 API endpoint: `/auth/google`
- ✅ 验证 Google ID Token
- ✅ 创建或查找用户
- ✅ 返回 JWT token

## 📱 前端实现

### 1. 依赖包
已安装：`google_sign_in: ^6.1.5`

### 2. 配置文件

#### iOS配置 (ios/Runner/Info.plist)
```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleTypeRole</key>
    <string>Editor</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>com.googleusercontent.apps.YOUR_CLIENT_ID</string>
    </array>
  </dict>
</array>
<key>GIDClientID</key>
<string>YOUR_IOS_CLIENT_ID.apps.googleusercontent.com</string>
```

#### Android配置 (android/app/build.gradle)
```gradle
android {
    defaultConfig {
        // ...
        resValue "string", "default_web_client_id", "YOUR_WEB_CLIENT_ID"
    }
}
```

### 3. 前端代码已实现
- ✅ GoogleAuthService 服务
- ✅ Login 页面集成
- ✅ Auth Provider 集成

## 🔐 获取 Google OAuth 凭证

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建新项目或选择现有项目
3. 启用 Google+ API
4. 创建 OAuth 2.0 凭证：
   - Web 应用（用于后端验证）
   - iOS 应用（用于 iOS 客户端）
   - Android 应用（用于 Android 客户端）

## 📝 测试流程

1. 启动后端服务
2. 启动 Flutter 应用
3. 点击 "Continue with Google"
4. 选择 Google 账号
5. 验证登录成功并跳转到首页

## ⚠️ 注意事项

- iOS 需要在 Info.plist 中配置 URL scheme
- Android 需要在 build.gradle 中配置 web client ID
- Web 版本需要在 .env 文件中配置 GOOGLE_CLIENT_ID
- 确保后端 GOOGLE_CLIENT_ID 与前端配置一致

## 🔄 当前状态

✅ 前端代码已实现
✅ 后端 API 已实现
⏳ 需要配置 Google OAuth 凭证
⏳ 需要测试完整流程
