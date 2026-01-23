# Supabase 邮件模板配置指南

## 问题
密码重置邮件只显示文本 "Follow this link to reset the password for your user: Reset Password"，但没有可点击的链接。

## 解决方案
需要在 Supabase Dashboard 中配置正确的邮件模板。

## 配置步骤

### 1. 登录 Supabase Dashboard
访问：https://app.supabase.com

### 2. 进入邮件模板设置
1. 选择你的项目
2. 点击左侧菜单 **Authentication**
3. 点击 **Email Templates**
4. 选择 **Reset Password** 模板

### 3. 配置邮件模板

将默认模板替换为以下内容：

```html
<h2>Reset Your Password</h2>

<p>Hi there,</p>

<p>We received a request to reset your password for your WanderLog account.</p>

<p>Click the button below to reset your password:</p>

<p style="text-align: center; margin: 30px 0;">
  <a href="{{ .ConfirmationURL }}" 
     style="display: inline-block; 
            padding: 12px 24px; 
            background-color: #10b981; 
            color: white; 
            text-decoration: none; 
            border-radius: 6px; 
            font-weight: 600;">
    Reset Password
  </a>
</p>

<p>Or copy and paste this link into your browser:</p>
<p style="word-break: break-all; color: #6b7280;">{{ .ConfirmationURL }}</p>

<p style="margin-top: 30px; color: #6b7280;">This link will expire in 1 hour.</p>

<p style="color: #6b7280;">If you didn't request a password reset, please ignore this email.</p>

<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

<p style="color: #9ca3af; font-size: 12px;">© 2025 WanderLog. Your personal travel companion.</p>
```

### 4. 配置 Site URL

1. 在 Supabase Dashboard 中，进入 **Authentication** → **URL Configuration**
2. 设置 **Site URL**：
   - 开发环境：`http://localhost:3000`
   - 生产环境：你的域名（如 `https://wanderlog.app`）

3. 添加 **Redirect URLs**：
   ```
   io.supabase.wanderlog://login-callback
   http://localhost:3000/**
   https://yourdomain.com/**
   ```

### 5. 重要变量说明

Supabase 邮件模板支持以下变量：

- `{{ .Email }}` - 用户邮箱
- `{{ .ConfirmationURL }}` - 重置密码链接（最重要！）
- `{{ .Token }}` - 重置 token
- `{{ .TokenHash }}` - Token hash
- `{{ .SiteURL }}` - 网站 URL

**关键点**：必须使用 `{{ .ConfirmationURL }}` 来生成完整的重置链接。

### 6. 测试邮件

配置完成后：

1. 在 App 中点击 "Forgot Password"
2. 输入邮箱
3. 检查收件箱
4. 邮件中应该有一个绿色的 "Reset Password" 按钮
5. 点击按钮应该打开 App 到重置密码页面

## 邮件模板示例（更简洁版本）

如果上面的样式太复杂，可以使用这个简化版：

```html
<h2>Reset Your Password</h2>

<p>Click the link below to reset your password:</p>

<p><a href="{{ .ConfirmationURL }}">Reset Password</a></p>

<p>Or copy this link: {{ .ConfirmationURL }}</p>

<p>This link expires in 1 hour.</p>
```

## 邮件模板（带品牌样式）

更专业的版本：

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
      
      <!-- Logo -->
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #10b981; font-size: 32px; margin: 0;">🌍 WanderLog</h1>
      </div>
      
      <!-- Title -->
      <h2 style="color: #1f2937; font-size: 24px; margin-bottom: 20px; text-align: center;">
        Reset Your Password
      </h2>
      
      <!-- Content -->
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
        We received a request to reset your password. Click the button below to create a new password:
      </p>
      
      <!-- Button -->
      <div style="text-align: center; margin: 32px 0;">
        <a href="{{ .ConfirmationURL }}" 
           style="display: inline-block; 
                  padding: 14px 32px; 
                  background: linear-gradient(135deg, #10b981 0%, #059669 100%); 
                  color: white; 
                  text-decoration: none; 
                  border-radius: 8px; 
                  font-weight: 600; 
                  font-size: 16px;">
          Reset Password
        </a>
      </div>
      
      <!-- Expiry Info -->
      <p style="color: #6b7280; font-size: 14px; text-align: center;">
        ⏱ This link will expire in <strong>1 hour</strong>
      </p>
      
      <!-- Fallback Link -->
      <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
        If the button doesn't work, copy and paste this link into your browser:
      </p>
      <p style="word-break: break-all; color: #10b981; font-size: 12px;">
        {{ .ConfirmationURL }}
      </p>
      
      <!-- Security Notice -->
      <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; color: #92400e; font-size: 14px;">
          <strong>⚠️ Security Notice:</strong><br>
          If you didn't request a password reset, please ignore this email and your password will remain unchanged.
        </p>
      </div>
      
      <!-- Footer -->
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
        <p style="color: #9ca3af; font-size: 12px; margin: 5px 0;">
          © 2025 WanderLog. All rights reserved.
        </p>
        <p style="color: #9ca3af; font-size: 12px; margin: 5px 0;">
          Your personal travel companion for exploring the world.
        </p>
      </div>
      
    </div>
  </div>
</body>
</html>
```

## 故障排查

### 邮件中仍然没有链接
1. 确保保存了邮件模板
2. 确保使用了 `{{ .ConfirmationURL }}`（注意大小写和点号）
3. 清除浏览器缓存
4. 发送新的测试邮件

### 链接无法点击
1. 检查邮件客户端是否阻止了链接
2. 尝试在不同的邮件客户端中打开（Gmail、Outlook等）
3. 查看邮件源代码，确认链接确实存在

### 点击链接后无法打开App
1. 检查 `redirectTo` 设置：`io.supabase.wanderlog://login-callback`
2. 检查 iOS Info.plist 和 Android Manifest 中的 URL scheme 配置
3. 确保 Supabase Dashboard 的 Redirect URLs 中包含了 deep link

## 测试命令

### iOS
```bash
xcrun simctl openurl booted "io.supabase.wanderlog://login-callback#access_token=test&type=recovery"
```

### Android
```bash
adb shell am start -a android.intent.action.VIEW -d "io.supabase.wanderlog://login-callback#access_token=test&type=recovery"
```

## 相关文档

- [Supabase Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Supabase Deep Links](https://supabase.com/docs/guides/auth/auth-deep-linking)
- [Reset Password Flow](https://supabase.com/docs/guides/auth/passwords#reset-password)
