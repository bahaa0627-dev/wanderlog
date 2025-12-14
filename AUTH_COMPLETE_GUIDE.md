run# 🔐 认证系统功能完整指南

## ✅ 已完成功能

### 1. 邮箱注册与验证
- ✅ 用户注册（邮箱 + 密码）
- ✅ 邮箱验证码发送（6位数字，15分钟有效期）
- ✅ 验证码输入页面（自动跳转到下一个输入框）
- ✅ 重发验证码（60秒冷却时间）
- ✅ 验证成功后自动登录

### 2. 忘记密码流程
- ✅ 忘记密码页面（输入邮箱）
- ✅ 密码重置码发送（6位数字，30分钟有效期）
- ✅ 重置密码页面（输入验证码 + 新密码）
- ✅ 密码重置成功后跳转登录

### 3. 登录功能
- ✅ 邮箱密码登录
- ✅ JWT Token 管理（Access Token + Refresh Token）
- ✅ 自动刷新 Token
- ✅ 退出登录

### 4. 邮件服务
- ✅ 集成 Resend 邮件服务
- ✅ 精美的 HTML 邮件模板
- ✅ 验证邮件、密码重置邮件、欢迎邮件

## 📝 完整测试流程

### 准备工作
1. 确保后端 API 服务运行在 `http://localhost:3000`
2. 确保 Resend API Key 已配置在 `.env` 文件中
3. 运行 Flutter 应用

### 测试场景 1：新用户注册流程

#### 步骤 1：注册
1. 打开应用，进入登录页面
2. 点击 "Create account"
3. 填写信息：
   - Email: `your@email.com`
   - Password: `123456`
   - Name: `Test User` (可选)
   - Confirm Password: `123456`
4. 点击 "Create Account"
5. **预期结果**：
   - 后端创建用户
   - 发送验证邮件到你的邮箱
   - 自动跳转到邮箱验证页面

#### 步骤 2：查收邮件
1. 打开你的邮箱
2. 找到来自 "WanderLog" 的验证邮件
3. 邮件标题：`Verify Your Email - WanderLog`
4. 邮件内容包含：
   - 6位数字验证码
   - 有效期：15分钟
   - 精美的 HTML 设计

#### 步骤 3：验证邮箱
1. 在验证页面输入6位验证码
2. 可以手动输入，也会自动跳转到下一个输入框
3. 输入完最后一位会自动提交验证
4. **预期结果**：
   - 验证成功
   - 显示成功提示
   - 自动跳转到首页
   - 用户已登录

#### 步骤 4：测试重发验证码
1. 如果验证码过期或丢失
2. 点击 "Resend" 按钮
3. **预期结果**：
   - 发送新的验证码到邮箱
   - 按钮变为 "Resend in 60s" 并倒计时
   - 60秒后可以再次点击重发

### 测试场景 2：忘记密码流程

#### 步骤 1：进入忘记密码页面
1. 在登录页面点击 "Forgot password?"
2. 进入忘记密码页面

#### 步骤 2：请求重置码
1. 输入注册的邮箱地址
2. 点击 "Send Reset Code"
3. **预期结果**：
   - 发送密码重置邮件
   - 显示成功提示
   - 页面切换到成功视图

#### 步骤 3：查收邮件
1. 打开邮箱
2. 找到来自 "WanderLog" 的密码重置邮件
3. 邮件标题：`Reset Your Password - WanderLog`
4. 邮件内容包含：
   - 6位数字重置码
   - 有效期：30分钟

#### 步骤 4：重置密码
1. 点击 "Enter Reset Code" 按钮
2. 输入6位重置码
3. 输入新密码（至少6个字符）
4. 确认新密码
5. 点击 "Reset Password"
6. **预期结果**：
   - 密码重置成功
   - 显示成功提示
   - 自动跳转到登录页面

#### 步骤 5：使用新密码登录
1. 在登录页面输入邮箱和新密码
2. 点击 "Login"
3. **预期结果**：
   - 登录成功
   - 跳转到首页

### 测试场景 3：已登录用户验证

#### 测试邮箱未验证的用户
1. 注册新用户但不验证邮箱
2. 尝试访问需要验证的功能
3. **预期行为**：
   - 用户可以登录
   - `isEmailVerified: false`
   - 可以在后续添加验证提示

#### 测试 Token 刷新
1. 登录后等待 15 分钟（Access Token 过期）
2. 发送 API 请求
3. **预期行为**：
   - 自动使用 Refresh Token 获取新的 Access Token
   - 请求继续执行
   - 用户无感知

## 🔧 API 测试（使用 curl）

### 1. 注册用户
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "123456",
    "name": "Test User"
  }'
```

**响应示例：**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "test@example.com",
    "name": "Test User",
    "isEmailVerified": false
  },
  "message": "Please check your email to verify your account"
}
```

### 2. 验证邮箱
```bash
# 从邮件中获取验证码，例如：123456
curl -X POST http://localhost:3000/api/auth/verify-email \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "code": "123456"
  }'
```

**响应示例：**
```json
{
  "message": "Email verified successfully",
  "user": {
    "id": 1,
    "email": "test@example.com",
    "name": "Test User",
    "isEmailVerified": true
  }
}
```

### 3. 重发验证码
```bash
curl -X POST http://localhost:3000/api/auth/resend-verification \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 4. 忘记密码
```bash
curl -X POST http://localhost:3000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com"
  }'
```

### 5. 重置密码
```bash
# 从邮件中获取重置码
curl -X POST http://localhost:3000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "code": "123456",
    "newPassword": "newpass123"
  }'
```

### 6. 登录
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "newpass123"
  }'
```

### 7. 刷新 Token
```bash
curl -X POST http://localhost:3000/api/auth/refresh-token \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "YOUR_REFRESH_TOKEN"
  }'
```

### 8. 退出登录
```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 📱 前端页面说明

### 新增页面
1. **`verify_email_page.dart`** - 邮箱验证页面
   - 6位数字输入框
   - 自动跳转焦点
   - 重发验证码（60秒冷却）
   - 显示用户邮箱
   
2. **`forgot_password_page.dart`** - 忘记密码页面
   - 邮箱输入表单
   - 发送成功后切换到成功视图
   - 可以重发验证码
   
3. **`reset_password_page.dart`** - 重置密码页面
   - 验证码输入（6位）
   - 新密码输入
   - 确认密码输入
   - 密码显示/隐藏切换

### 更新的页面
1. **`register_page.dart`**
   - 注册成功后跳转到 `/verify-email`
   
2. **`login_page.dart`**
   - 添加 "Forgot password?" 链接

## 🎨 UI/UX 特性

### 邮箱验证页面
- ✨ 6个独立的输入框，视觉清晰
- ⌨️ 自动聚焦下一个输入框
- ⌫ 删除时自动聚焦上一个输入框
- 🚀 输入完成后自动提交
- ⏱️ 重发验证码60秒倒计时
- 📧 显示当前验证的邮箱地址

### 密码重置页面
- 👁️ 密码显示/隐藏切换
- ✅ 实时密码匹配验证
- 📝 清晰的表单验证提示
- 🔄 可选的邮箱输入（支持直接跳转和手动输入）

### 通用特性
- 🎯 响应式设计（最大宽度 420px）
- 📱 移动端友好
- 🔄 Loading 状态提示
- ✅ 成功/错误消息提示（SnackBar）
- 🎨 Material Design 3 风格

## 🔒 安全特性

### 密码安全
- 最少6个字符
- bcrypt 加密存储（10 rounds）
- Token 版本控制（重置密码时递增）

### Token 安全
- Access Token：15分钟有效期
- Refresh Token：7天有效期
- 退出登录时清除 Refresh Token
- 重置密码时使所有旧 Token 失效

### 验证码安全
- 邮箱验证码：15分钟有效期
- 密码重置码：30分钟有效期
- 使用后自动标记为已使用
- 重发验证码有60秒冷却时间

## 🐛 常见问题排查

### 收不到邮件
1. 检查 Resend API Key 是否正确配置
2. 检查邮箱地址是否正确
3. 查看垃圾邮件文件夹
4. 检查后端日志：`wanderlog_api/logs/`

### 验证码无效
1. 确认验证码未过期（15分钟/30分钟）
2. 确认验证码未被使用过
3. 检查输入的验证码是否正确

### Token 失效
1. Access Token 15分钟后自动失效
2. 使用 Refresh Token 获取新的 Access Token
3. Refresh Token 7天后失效，需要重新登录

## 📚 代码结构

### 后端
```
wanderlog_api/src/
├── controllers/authController.ts    # 认证控制器（9个方法）
├── services/emailService.ts         # 邮件服务
├── utils/
│   ├── tokenGenerator.ts            # Token/验证码生成
│   └── emailTemplates.ts            # 邮件模板
└── routes/authRoutes.ts             # 认证路由
```

### 前端
```
wanderlog_app/lib/features/auth/
├── data/
│   └── auth_repository.dart         # API 调用（8个方法）
├── providers/
│   └── auth_provider.dart           # 状态管理（8个方法）
└── presentation/pages/
    ├── login_page.dart              # 登录页
    ├── register_page.dart           # 注册页
    ├── verify_email_page.dart       # 验证邮箱页（新）
    ├── forgot_password_page.dart    # 忘记密码页（新）
    └── reset_password_page.dart     # 重置密码页（新）
```

## 🚀 下一步计划

### Google OAuth 集成
- [ ] 配置 Google OAuth 客户端
- [ ] 实现 Google 登录按钮
- [ ] 处理 OAuth 回调
- [ ] 关联 Google 账号和本地账号

### 用户体验优化
- [ ] 未验证邮箱的用户显示提示横幅
- [ ] 添加邮箱更改功能
- [ ] 添加密码更改功能（需要验证旧密码）
- [ ] 添加账号注销功能

### 安全增强
- [ ] 添加登录尝试限制
- [ ] 添加 IP 白名单功能
- [ ] 添加双因素认证（2FA）
- [ ] 添加设备管理功能

## 📖 相关文档
- [AUTH_SYSTEM_DESIGN.md](./AUTH_SYSTEM_DESIGN.md) - 系统设计文档
- [AUTH_QUICK_START.md](./AUTH_QUICK_START.md) - 快速开始指南
- [GOOGLE_MAPS_SETUP.md](./GOOGLE_MAPS_SETUP.md) - Google Maps 配置
