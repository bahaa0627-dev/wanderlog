# 🚀 认证系统快速开始指南

> 基于 [AUTH_SYSTEM_DESIGN.md](./AUTH_SYSTEM_DESIGN.md) 的快速实施指南

## ⚡️ 5 分钟快速开始

### 步骤 1: 安装依赖 (1 分钟)

```bash
# 后端
cd wanderlog_api
npm install resend google-auth-library

# 前端
cd ../wanderlog_app
flutter pub add google_sign_in
```

### 步骤 2: 配置环境变量 (2 分钟)

```bash
# wanderlog_api/.env
echo "RESEND_API_KEY=re_your_api_key_here" >> .env
echo "RESEND_FROM_EMAIL=noreply@wanderlog.com" >> .env
echo "GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com" >> .env
```

### 步骤 3: 更新数据库 Schema (2 分钟)

运行以下命令：

```bash
cd wanderlog_api
npm run db:migrate
npm run db:generate
```

## 📋 详细实施清单

### ✅ 阶段 1: 数据库扩展

- [ ] 1.1 更新 `schema.prisma` - 添加验证字段
- [ ] 1.2 创建 `VerificationToken` 模型
- [ ] 1.3 运行数据库迁移

### ✅ 阶段 2: 邮件服务 (Resend)

- [ ] 2.1 创建 `emailService.ts`
- [ ] 2.2 创建邮件模板
- [ ] 2.3 实现发送验证码功能
- [ ] 2.4 测试邮件发送

### ✅ 阶段 3: 后端认证 API

- [ ] 3.1 扩展 `authController.ts`
  - [ ] 邮箱验证端点
  - [ ] Google OAuth 端点
  - [ ] 重发验证码
  - [ ] 忘记密码
  - [ ] 重置密码
- [ ] 3.2 创建 `tokenService.ts` - JWT 管理
- [ ] 3.3 创建 `googleOAuthService.ts`
- [ ] 3.4 添加 Rate Limiting 中间件

### ✅ 阶段 4: 前端 UI

- [ ] 4.1 创建 `VerifyEmailPage`
- [ ] 4.2 创建 `ForgotPasswordPage`
- [ ] 4.3 更新 `LoginPage` - 添加 Google 登录
- [ ] 4.4 创建验证码输入组件

### ✅ 阶段 5: Google OAuth 集成

- [ ] 5.1 配置 Google Cloud Console
- [ ] 5.2 前端实现 Google 登录
- [ ] 5.3 后端验证 Google Token

### ✅ 阶段 6: 测试

- [ ] 6.1 测试邮箱注册流程
- [ ] 6.2 测试 Google 登录
- [ ] 6.3 测试密码重置
- [ ] 6.4 测试 Token 刷新

## 🔥 今天就开始！

### 优先级排序

**🎯 MVP (今天完成)**
1. 数据库扩展 ✓
2. Resend 邮件服务 ✓
3. 邮箱验证流程 ✓

**⭐️ 第二优先 (明天)**
4. 前端验证页面
5. 密码重置功能

**🚀 增强功能 (本周内)**
6. Google OAuth
7. Rate Limiting
8. 完善测试

## 💻 代码模板

### 1. 邮件服务模板

```typescript
// src/services/emailService.ts
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendVerificationEmail(
  email: string,
  code: string
) {
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: email,
    subject: 'Verify your Wanderlog account',
    html: `
      <h1>Welcome to Wanderlog! 🌍</h1>
      <p>Your verification code is:</p>
      <h2 style="font-size: 32px; letter-spacing: 4px;">${code}</h2>
      <p>This code expires in 15 minutes.</p>
    `,
  });
}
```

### 2. 验证码生成器

```typescript
// src/utils/tokenGenerator.ts
export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}
```

### 3. 验证端点模板

```typescript
// src/controllers/authController.ts
export const verifyEmail = async (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    const userId = req.user.id; // 从 JWT 获取

    // 查找验证 Token
    const token = await prisma.verificationToken.findFirst({
      where: {
        userId,
        token: code,
        type: 'EMAIL_VERIFICATION',
        expiresAt: { gte: new Date() },
        usedAt: null,
      },
    });

    if (!token) {
      return res.status(400).json({ 
        message: 'Invalid or expired verification code' 
      });
    }

    // 标记为已使用
    await prisma.verificationToken.update({
      where: { id: token.id },
      data: { usedAt: new Date() },
    });

    // 更新用户
    await prisma.user.update({
      where: { id: userId },
      data: {
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
      },
    });

    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    logger.error('Verify email error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
```

### 4. 前端验证页面模板

```dart
// lib/features/auth/presentation/pages/verify_email_page.dart
class VerifyEmailPage extends ConsumerStatefulWidget {
  const VerifyEmailPage({super.key});

  @override
  ConsumerState<VerifyEmailPage> createState() => _VerifyEmailPageState();
}

class _VerifyEmailPageState extends ConsumerState<VerifyEmailPage> {
  final _codeController = TextEditingController();

  Future<void> _onVerify() async {
    try {
      await ref.read(authProvider.notifier).verifyEmail(
        _codeController.text,
      );
      if (mounted) {
        context.go('/home');
      }
    } catch (e) {
      // 显示错误
    }
  }

  Future<void> _onResend() async {
    try {
      await ref.read(authProvider.notifier).resendVerificationCode();
      // 显示成功消息
    } catch (e) {
      // 显示错误
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Verify Email')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text(
              'Enter Verification Code',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
            Text(
              'We sent a 6-digit code to your email',
              style: TextStyle(color: Colors.grey[600]),
            ),
            const SizedBox(height: 32),
            TextField(
              controller: _codeController,
              keyboardType: TextInputType.number,
              maxLength: 6,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 32, letterSpacing: 8),
              decoration: const InputDecoration(
                hintText: '------',
                counterText: '',
              ),
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: _onVerify,
              child: const Text('Verify'),
            ),
            const SizedBox(height: 16),
            TextButton(
              onPressed: _onResend,
              child: const Text('Resend Code'),
            ),
          ],
        ),
      ),
    );
  }
}
```

## 🧪 测试命令

### 1. 测试邮箱注册

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123456",
    "name": "Test User"
  }'
```

### 2. 测试邮箱验证

```bash
# 使用返回的 token
curl -X POST http://localhost:3000/api/auth/verify-email \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "code": "123456"
  }'
```

### 3. 测试重发验证码

```bash
curl -X POST http://localhost:3000/api/auth/resend-verification \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 📚 Resend 设置

### 1. 注册 Resend 账号

访问：https://resend.com/signup

### 2. 获取 API Key

1. 登录后点击 "API Keys"
2. 创建新的 API Key
3. 复制 Key（格式：`re_xxxxx`）

### 3. 验证域名（可选，用于生产环境）

1. 添加你的域名（如 `wanderlog.com`）
2. 添加 DNS 记录验证所有权
3. 使用 `noreply@wanderlog.com` 发送邮件

### 4. 测试模式

开发环境可以使用：
- `onboarding@resend.dev` 作为发件人
- 只能发送到你自己的邮箱

## 🔐 Google OAuth 设置

### 1. Google Cloud Console

1. 访问：https://console.cloud.google.com
2. 创建新项目或选择现有项目
3. 启用 "Google+ API"

### 2. 创建 OAuth 凭据

1. 导航到 "APIs & Services" > "Credentials"
2. 点击 "Create Credentials" > "OAuth 2.0 Client ID"
3. 选择应用类型：
   - iOS: iOS
   - Android: Android
   - Web: Web application

### 3. 配置授权来源

```
Authorized JavaScript origins:
http://localhost:3001
https://wanderlog.com

Authorized redirect URIs:
http://localhost:3001/auth/google/callback
https://wanderlog.com/auth/google/callback
```

### 4. 获取凭据

- Client ID: `xxx.apps.googleusercontent.com`
- Client Secret: `xxx` (仅后端使用)

## 🎉 完成后的功能

✅ 用户可以用邮箱注册  
✅ 收到验证码邮件  
✅ 验证邮箱后完整使用  
✅ 用户可以用 Google 账号登录  
✅ 忘记密码可以重置  
✅ Token 自动刷新  
✅ 安全的密码存储  

## 💡 常见问题

**Q: Resend 免费吗？**  
A: 有免费额度，每月 100 封邮件。足够开发测试。

**Q: Google 登录需要审核吗？**  
A: 开发阶段不需要，但发布时需要 OAuth 验证。

**Q: 如何测试邮件发送？**  
A: 用你自己的邮箱测试，检查收件箱/垃圾邮件。

**Q: 数据库迁移会丢失数据吗？**  
A: 不会，Prisma 会保留现有数据并添加新字段。

## 🚦 现在开始！

选择一个任务开始：

```bash
# 选项 1: 先做后端（推荐）
cd wanderlog_api
# 开始实现邮件服务

# 选项 2: 先做前端 UI
cd wanderlog_app
# 创建验证页面

# 选项 3: 同时进行
# 开两个终端分别开发
```

需要我帮你实现哪个部分？😊
