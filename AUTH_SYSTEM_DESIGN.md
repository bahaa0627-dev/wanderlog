# 🔐 Wanderlog 注册和登录系统设计

## 📋 功能概述

支持两种认证方式：
1. **邮箱注册/登录**（使用 Resend 进行邮箱验证）
2. **Google OAuth 登录**

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                        Flutter App                           │
├─────────────────────────────────────────────────────────────┤
│  UI Layer                                                    │
│  ├─ LoginPage (邮箱 + Google 登录)                          │
│  ├─ RegisterPage (邮箱注册)                                 │
│  ├─ EmailVerificationPage (验证邮箱)                        │
│  └─ ForgotPasswordPage (重置密码)                           │
├─────────────────────────────────────────────────────────────┤
│  Service Layer                                               │
│  ├─ AuthService (统一认证逻辑)                              │
│  ├─ GoogleAuthService (Google OAuth)                        │
│  └─ StorageService (Token 存储)                             │
└─────────────────────────────────────────────────────────────┘
                              ↓ HTTP/HTTPS
┌─────────────────────────────────────────────────────────────┐
│                      Backend API (Express)                   │
├─────────────────────────────────────────────────────────────┤
│  Auth Routes                                                 │
│  ├─ POST /api/auth/register (邮箱注册)                      │
│  ├─ POST /api/auth/login (邮箱登录)                         │
│  ├─ POST /api/auth/verify-email (验证邮箱)                  │
│  ├─ POST /api/auth/resend-verification (重发验证码)         │
│  ├─ POST /api/auth/google (Google OAuth)                    │
│  ├─ POST /api/auth/forgot-password (忘记密码)               │
│  ├─ POST /api/auth/reset-password (重置密码)                │
│  ├─ POST /api/auth/refresh-token (刷新 Token)               │
│  ├─ POST /api/auth/logout (登出)                            │
│  └─ GET /api/auth/me (获取当前用户信息)                     │
├─────────────────────────────────────────────────────────────┤
│  Services                                                    │
│  ├─ EmailService (Resend 邮件服务)                         │
│  ├─ TokenService (JWT Token 管理)                          │
│  └─ GoogleOAuthService (Google 验证)                        │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      External Services                       │
├─────────────────────────────────────────────────────────────┤
│  ├─ Resend API (邮件验证)                                   │
│  ├─ Google OAuth 2.0 (Google 登录)                         │
│  └─ SQLite/PostgreSQL (用户数据)                           │
└─────────────────────────────────────────────────────────────┘
```

## 📊 数据库设计

### User 表扩展

```prisma
model User {
  id              String    @id @default(cuid())
  email           String    @unique
  password        String?   // Google 登录用户可以为 null
  name            String?
  avatarUrl       String?
  
  // 认证相关
  authProvider    String    @default("email") // "email" | "google"
  googleId        String?   @unique // Google OAuth ID
  isEmailVerified Boolean   @default(false)
  emailVerifiedAt DateTime?
  
  // Token 管理
  refreshToken    String?   // 刷新 Token
  tokenVersion    Int       @default(0) // 用于撤销所有 Token
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  trips           Trip[]
  verificationTokens VerificationToken[]
}

// 邮箱验证 Token
model VerificationToken {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  token       String   @unique
  type        String   // "EMAIL_VERIFICATION" | "PASSWORD_RESET"
  expiresAt   DateTime
  usedAt      DateTime?
  createdAt   DateTime @default(now())
  
  @@index([token])
  @@index([userId, type])
}
```

## 🔄 完整流程设计

### 1️⃣ 邮箱注册流程

```
用户输入邮箱和密码
    ↓
前端验证（格式、长度）
    ↓
POST /api/auth/register
    ↓
后端检查邮箱是否已存在
    ↓
生成密码哈希（bcrypt）
    ↓
创建用户（isEmailVerified = false）
    ↓
生成验证 Token（6位数字码 + UUID）
    ↓
通过 Resend 发送验证邮件
    ↓
返回临时 Token（用户可登录但功能受限）
    ↓
用户收到邮件并输入验证码
    ↓
POST /api/auth/verify-email { token: "123456" }
    ↓
验证成功，更新 isEmailVerified = true
    ↓
返回完整访问 Token
    ↓
用户可完整使用应用
```

### 2️⃣ 邮箱登录流程

```
用户输入邮箱和密码
    ↓
POST /api/auth/login
    ↓
验证邮箱和密码
    ↓
检查 isEmailVerified
    ↓
生成 Access Token (15分钟) + Refresh Token (7天)
    ↓
返回 Token 和用户信息
    ↓
前端存储 Token
    ↓
自动添加到所有请求的 Authorization Header
```

### 3️⃣ Google OAuth 登录流程

```
用户点击 "Continue with Google"
    ↓
前端调用 google_sign_in 包
    ↓
跳转到 Google 授权页面
    ↓
用户授权
    ↓
获取 Google ID Token
    ↓
POST /api/auth/google { idToken: "..." }
    ↓
后端验证 Google ID Token
    ↓
检查用户是否已存在（通过 googleId）
    ↓
如果不存在，创建新用户
    ├─ authProvider = "google"
    ├─ isEmailVerified = true（Google 已验证）
    └─ password = null
    ↓
生成 Access Token + Refresh Token
    ↓
返回 Token 和用户信息
    ↓
用户登录成功
```

### 4️⃣ Token 刷新流程

```
Access Token 过期（15分钟后）
    ↓
API 返回 401 Unauthorized
    ↓
前端拦截器自动触发刷新
    ↓
POST /api/auth/refresh-token { refreshToken: "..." }
    ↓
验证 Refresh Token
    ↓
检查 tokenVersion 是否匹配
    ↓
生成新的 Access Token
    ↓
返回新 Token
    ↓
重试原请求
```

### 5️⃣ 忘记密码流程

```
用户点击 "Forgot Password"
    ↓
输入邮箱
    ↓
POST /api/auth/forgot-password
    ↓
生成重置 Token
    ↓
通过 Resend 发送重置链接/验证码
    ↓
用户点击链接或输入验证码
    ↓
跳转到重置密码页面
    ↓
输入新密码
    ↓
POST /api/auth/reset-password { token, newPassword }
    ↓
验证 Token 并更新密码
    ↓
密码重置成功
    ↓
自动登录或跳转到登录页
```

## 📧 Resend 邮件模板

### 邮箱验证邮件

```typescript
// Subject: Verify your Wanderlog account
// Template: email-verification

{
  "to": "user@example.com",
  "subject": "Verify your Wanderlog account",
  "html": `
    <h1>Welcome to Wanderlog! 🌍</h1>
    <p>Please verify your email address using the code below:</p>
    <h2 style="font-size: 32px; letter-spacing: 4px;">${verificationCode}</h2>
    <p>This code will expire in 15 minutes.</p>
    <p>If you didn't create an account, please ignore this email.</p>
  `
}
```

### 密码重置邮件

```typescript
// Subject: Reset your Wanderlog password
// Template: password-reset

{
  "to": "user@example.com",
  "subject": "Reset your Wanderlog password",
  "html": `
    <h1>Reset your password</h1>
    <p>You requested to reset your password. Use the code below:</p>
    <h2 style="font-size: 32px; letter-spacing: 4px;">${resetCode}</h2>
    <p>This code will expire in 30 minutes.</p>
    <p>If you didn't request this, please ignore this email.</p>
  `
}
```

## 🔒 安全策略

### Token 管理

```typescript
// Access Token (JWT)
{
  "id": "user_id",
  "email": "user@example.com",
  "version": 0, // tokenVersion
  "exp": 900, // 15 minutes
  "iat": timestamp
}

// Refresh Token (JWT)
{
  "id": "user_id",
  "version": 0,
  "type": "refresh",
  "exp": 604800, // 7 days
  "iat": timestamp
}
```

### 密码要求

- 最小长度：8 字符
- 必须包含：字母 + 数字
- 推荐包含：特殊字符
- 使用 bcrypt，salt rounds = 10

### 验证码

- 格式：6 位数字
- 有效期：15 分钟
- 最多尝试：5 次
- 重发间隔：60 秒

### Rate Limiting

```typescript
// 登录/注册
- 10 次/15分钟/IP
- 5 次/15分钟/邮箱

// 发送验证码
- 3 次/小时/邮箱
- 60 秒冷却时间

// Token 刷新
- 20 次/小时/用户
```

## 📱 前端实现

### 依赖包

```yaml
# pubspec.yaml
dependencies:
  # HTTP Client
  dio: ^5.4.0
  
  # State Management
  flutter_riverpod: ^2.4.9
  
  # Google 登录
  google_sign_in: ^6.1.6
  
  # 安全存储
  flutter_secure_storage: ^9.0.0
  
  # 路由
  go_router: ^13.0.0
  
  # UI
  flutter_svg: ^2.0.9
```

### 目录结构

```
lib/features/auth/
├── data/
│   ├── auth_repository.dart      # API 调用
│   └── models/
│       ├── auth_result.dart
│       └── verification_request.dart
├── domain/
│   ├── auth_service.dart         # 业务逻辑
│   └── google_auth_service.dart
├── presentation/
│   ├── pages/
│   │   ├── login_page.dart
│   │   ├── register_page.dart
│   │   ├── verify_email_page.dart
│   │   └── forgot_password_page.dart
│   ├── widgets/
│   │   ├── auth_text_field.dart
│   │   ├── social_login_button.dart
│   │   └── verification_code_input.dart
│   └── providers/
│       └── auth_provider.dart
```

## 🔧 后端实现

### 目录结构

```
src/
├── controllers/
│   └── authController.ts
├── services/
│   ├── emailService.ts         # Resend 集成
│   ├── tokenService.ts         # JWT 管理
│   └── googleOAuthService.ts   # Google 验证
├── middleware/
│   ├── auth.ts                 # JWT 验证
│   ├── rateLimiter.ts          # 请求限流
│   └── validator.ts            # 输入验证
├── utils/
│   ├── emailTemplates.ts       # 邮件模板
│   └── tokenGenerator.ts       # 验证码生成
└── routes/
    └── authRoutes.ts
```

### 环境变量

```bash
# .env

# JWT
JWT_SECRET=your-super-secret-jwt-key-min-32-characters
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Resend
RESEND_API_KEY=re_xxx
RESEND_FROM_EMAIL=noreply@wanderlog.com

# Google OAuth
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx

# App URLs
FRONTEND_URL=http://localhost:3001
VERIFICATION_CALLBACK_URL=http://localhost:3001/verify-email

# Rate Limiting
REDIS_URL=redis://localhost:6379 # 可选，用于分布式限流
```

## 🧪 测试场景

### 邮箱注册测试

```bash
# 1. 注册新用户
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123456",
    "name": "Test User"
  }'

# 期望返回：
# {
#   "token": "eyJhbGci...", (临时 Token)
#   "user": { ... },
#   "message": "Please verify your email"
# }

# 2. 查收邮件，输入验证码
curl -X POST http://localhost:3000/api/auth/verify-email \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {TOKEN}" \
  -d '{
    "code": "123456"
  }'

# 3. 验证成功，获取完整 Token
```

### Google 登录测试

```bash
# 前端获取 Google ID Token 后
curl -X POST http://localhost:3000/api/auth/google \
  -H "Content-Type: application/json" \
  -d '{
    "idToken": "google_id_token_here"
  }'
```

### Token 刷新测试

```bash
curl -X POST http://localhost:3000/api/auth/refresh-token \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "your_refresh_token_here"
  }'
```

## 📈 实施计划

### Phase 1: 后端基础（2-3 天）

- [x] 已有基础认证系统
- [ ] 扩展 User 模型（添加验证字段）
- [ ] 创建 VerificationToken 模型
- [ ] 实现 Resend 邮件服务
- [ ] 实现邮箱验证流程
- [ ] 实现 Google OAuth 后端

### Phase 2: 前端基础（2-3 天）

- [x] 已有登录/注册页面
- [ ] 添加邮箱验证页面
- [ ] 集成 google_sign_in
- [ ] 实现 Token 刷新拦截器
- [ ] 添加忘记密码流程

### Phase 3: 安全加固（1-2 天）

- [ ] 添加 Rate Limiting
- [ ] 实现防暴力破解
- [ ] 添加请求签名验证
- [ ] 实现 CSRF 保护

### Phase 4: 测试和优化（1-2 天）

- [ ] 单元测试
- [ ] 集成测试
- [ ] 性能优化
- [ ] 错误处理完善

## 🎯 下一步行动

1. **立即开始**：扩展数据库 Schema
2. **核心功能**：集成 Resend 邮件服务
3. **用户体验**：实现邮箱验证 UI
4. **增强功能**：添加 Google OAuth
5. **安全性**：实现 Rate Limiting

## 📚 参考资源

- [Resend 文档](https://resend.com/docs)
- [Google Sign-In Flutter](https://pub.dev/packages/google_sign_in)
- [JWT 最佳实践](https://tools.ietf.org/html/rfc8725)
- [OWASP 认证备忘单](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
