# 🎯 Google 登录 - 快速开始

## ✅ 已完成
- 后端 API：`POST /api/auth/google`
- 前端集成：登录页面 Google 按钮
- 数据库支持：用户表支持 `googleId` 和 `authProvider`

## 🚀 下一步操作

### 1. 获取 Google OAuth 凭证

访问 [Google Cloud Console](https://console.cloud.google.com/) 并按以下步骤操作：

#### a) 创建项目
- 项目名称：WanderLog

#### b) 启用 API
- APIs & Services → Library
- 搜索并启用 **Google+ API**

#### c) 配置 OAuth 同意屏幕
- OAuth consent screen → External
- 应用名称：WanderLog
- 添加你的邮箱

#### d) 创建凭证
- Credentials → Create Credentials → OAuth 2.0 Client ID
- 类型：**Web application**
- 名称：WanderLog Web
- 创建后保存 **Client ID** 和 **Client Secret**

### 2. 配置后端

编辑 `wanderlog_api/.env`：

```env
GOOGLE_CLIENT_ID=你的Client_ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=你的Client_Secret
```

### 3. 重启 API 服务

```bash
# 停止当前服务
Ctrl+C

# 重新启动
npm run dev
```

### 4. 测试（在 Flutter 应用中）

1. 运行 Flutter 应用：
   ```bash
   cd wanderlog_app
   flutter run
   ```

2. 进入登录页面

3. 点击 **"Continue with Google"** 按钮

4. 选择 Google 账号并授权

5. 应该看到成功提示并跳转到主页

## 📖 详细文档

- [GOOGLE_OAUTH_SETUP_GUIDE.md](./GOOGLE_OAUTH_SETUP_GUIDE.md) - 完整配置指南（包括 iOS/Android）
- [GOOGLE_LOGIN_IMPLEMENTATION_COMPLETE.md](./GOOGLE_LOGIN_IMPLEMENTATION_COMPLETE.md) - 实现细节

## 🧪 测试 API

```bash
# 测试 API 端点
./test_google_login.sh
```

## ✨ 功能特点

- ✅ 一键登录（无需填写表单）
- ✅ 自动创建账号（首次登录）
- ✅ 自动验证邮箱（Google 已验证）
- ✅ 显示 Google 头像
- ✅ 安全的 Token 验证
- ✅ 与邮箱登录共存

## 🎉 完成！

配置好凭证后，Google 登录功能就可以使用了！
