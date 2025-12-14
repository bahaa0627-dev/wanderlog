# 📧 Resend 邮件服务配置指南

## 🚀 快速开始

### 1. 注册 Resend 账号

访问：https://resend.com/signup

### 2. 获取 API Key

1. 登录后点击侧边栏的 **"API Keys"**
2. 点击 **"Create API Key"**
3. 输入名称（如：`wanderlog-dev`）
4. 复制生成的 API Key（格式：`re_xxxxx`）

### 3. 配置环境变量

打开 `wanderlog_api/.env` 文件，更新以下配置：

```bash
RESEND_API_KEY=re_你的API_Key
RESEND_FROM_EMAIL=WanderLog <onboarding@resend.dev>
```

### 4. 测试邮件服务

```bash
cd wanderlog_api
npm run test:email your-email@example.com
```

你会收到 3 封测试邮件：
- ✉️ 邮箱验证邮件（带6位验证码）
- 🔒 密码重置邮件（带6位验证码）
- 🎉 欢迎邮件

## 📖 开发环境 vs 生产环境

### 开发环境（当前）

**发件人邮箱：** `onboarding@resend.dev`

**限制：**
- ⚠️ 只能发送到你自己的邮箱（用于测试）
- 免费额度：100 封邮件/月
- 无需验证域名

**使用场景：** 开发和测试阶段

### 生产环境（上线时）

**发件人邮箱：** `noreply@yourdomain.com`

**要求：**
1. 拥有自己的域名（如 `wanderlog.com`）
2. 在 Resend 中验证域名
3. 添加 DNS 记录验证所有权

**优势：**
- ✅ 可以发送到任何邮箱
- ✅ 更高的发送额度
- ✅ 更好的送达率
- ✅ 自定义品牌形象

## 🛠️ 已实现的功能

### 1. 邮件服务 (`src/services/emailService.ts`)

```typescript
// 发送邮箱验证邮件
await sendVerificationEmail(email, code, userName);

// 发送密码重置邮件
await sendPasswordResetEmail(email, code, userName);

// 发送欢迎邮件
await sendWelcomeEmail(email, userName);

// 批量发送邮件
await sendBulkEmails(recipients, subject, htmlContent);

// 验证配置
await verifyEmailConfiguration();
```

### 2. 邮件模板 (`src/utils/emailTemplates.ts`)

- ✉️ **邮箱验证模板** - 6位数字验证码，15分钟有效期
- 🔒 **密码重置模板** - 6位数字验证码，30分钟有效期
- 🎉 **欢迎邮件模板** - 邮箱验证成功后发送

所有模板都是响应式设计，支持移动端和桌面端。

### 3. Token 工具 (`src/utils/tokenGenerator.ts`)

```typescript
// 生成 6 位数字验证码
const code = generateVerificationCode(); // "123456"

// 生成 UUID Token（用于密码重置链接）
const token = generateToken(); // "abc123...xyz"

// 生成 4 位短验证码
const shortCode = generateShortCode(); // "1234"
```

## 📧 邮件模板预览

### 邮箱验证邮件

```
┌─────────────────────────────────────┐
│          🌍 WanderLog               │
│                                     │
│  Welcome to WanderLog, User! 🎉    │
│                                     │
│  Please verify your email:          │
│                                     │
│  ┌───────────────────────────┐     │
│  │       1 2 3 4 5 6         │     │
│  └───────────────────────────┘     │
│                                     │
│  ⏱ Expires in 15 minutes           │
└─────────────────────────────────────┘
```

### 密码重置邮件

```
┌─────────────────────────────────────┐
│          🌍 WanderLog               │
│                                     │
│     Reset Your Password 🔒          │
│                                     │
│  Use this code:                     │
│                                     │
│  ┌───────────────────────────┐     │
│  │       6 5 4 3 2 1         │     │
│  └───────────────────────────┘     │
│                                     │
│  ⏱ Expires in 30 minutes           │
│                                     │
│  ⚠️ If you didn't request this,    │
│     please ignore this email.      │
└─────────────────────────────────────┘
```

## 🧪 测试脚本使用

### 运行测试

```bash
# 方式 1: 使用 npm script
npm run test:email your-email@example.com

# 方式 2: 直接运行
tsx test_email_service.ts your-email@example.com
```

### 测试输出

```
🧪 Testing Email Service...

1️⃣ Verifying email configuration...
✅ Configuration verified

📧 Test email: your-email@example.com

2️⃣ Testing verification email...
   Verification code: 123456
✅ Verification email sent successfully

3️⃣ Testing password reset email...
   Reset code: 654321
✅ Password reset email sent successfully

4️⃣ Testing welcome email...
✅ Welcome email sent successfully

📊 Test Summary:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✉️  Verification Email: ✅ PASS
🔒 Password Reset Email: ✅ PASS
🎉 Welcome Email: ✅ PASS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎉 All tests passed! Check your inbox at: your-email@example.com
   (Don't forget to check spam folder)
```

## 🔍 故障排查

### 问题 1: 收不到邮件

**检查步骤：**
1. ✅ 检查垃圾邮件文件夹
2. ✅ 确认 API Key 是否正确
3. ✅ 确认发送到的是你自己的邮箱（开发环境限制）
4. ✅ 查看控制台日志是否有错误

### 问题 2: API Key 无效

**错误信息：** `RESEND_API_KEY is not configured`

**解决方案：**
```bash
# 检查 .env 文件
cat .env | grep RESEND

# 应该看到：
# RESEND_API_KEY=re_your_key_here
# RESEND_FROM_EMAIL=WanderLog <onboarding@resend.dev>
```

### 问题 3: 发送失败

**错误信息：** `Failed to send verification email`

**可能原因：**
1. API Key 错误或已过期
2. 网络连接问题
3. Resend 服务临时不可用
4. 超出发送额度（免费版：100封/月）

**解决方案：**
- 检查 Resend Dashboard 查看发送状态
- 重新生成 API Key
- 检查网络连接

## 📊 Resend 免费额度

**开发环境（测试）：**
- 100 封邮件/月
- 无需信用卡
- 只能发送到验证过的邮箱

**生产环境：**
- 需要升级到付费计划
- 或验证自己的域名（免费额度更高）

## 🔐 安全建议

### 保护 API Key

```bash
# ❌ 错误：不要提交到 Git
git add .env

# ✅ 正确：.env 已在 .gitignore 中
# 只提交 .env.example 作为参考
git add .env.example
```

### 环境变量管理

```bash
# 开发环境
.env (本地，不提交)

# 示例配置
.env.example (提交到 Git)

# 生产环境
使用环境变量或密钥管理服务
```

## 🎯 下一步

邮件服务已配置完成！接下来你可以：

1. **集成到认证流程** - 在注册时发送验证邮件
2. **实现验证端点** - 创建 `/api/auth/verify-email` API
3. **添加前端页面** - 创建邮箱验证输入界面
4. **实现密码重置** - 完整的忘记密码流程

查看完整实施计划：[AUTH_QUICK_START.md](../AUTH_QUICK_START.md)

## 📚 相关文档

- [Resend 官方文档](https://resend.com/docs)
- [Resend Node.js SDK](https://github.com/resendlabs/resend-node)
- [邮件模板最佳实践](https://resend.com/docs/send-with-nodejs)

## 🆘 需要帮助？

遇到问题？
- 查看 [Resend 状态页面](https://status.resend.com/)
- 访问 [Resend Discord](https://resend.com/discord)
- 查看项目文档 [AUTH_SYSTEM_DESIGN.md](../AUTH_SYSTEM_DESIGN.md)
