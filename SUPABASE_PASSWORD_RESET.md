# Supabase 密码重置功能说明

## 问题
之前后端自己实现了一套基于验证码的密码重置系统，但实际上 Supabase 已经提供了原生的密码重置功能，并且支持 deep link。

## 解决方案
**使用 Supabase 的原生密码重置功能**，无需后端自己实现。

## 工作流程

### 1. 用户请求重置密码
```dart
// Frontend: forgot_password_page.dart
await SupabaseConfig.auth.resetPasswordForEmail(
  email,
  redirectTo: 'io.supabase.wanderlog://login-callback',
);
```

- 后端 API `/auth/forgot-password` 仅用于检查邮箱是否存在（改善用户体验）
- 实际的邮件发送由 Supabase 完成

### 2. Supabase 发送邮件
- Supabase 自动发送密码重置邮件
- 邮件包含一个安全的重置链接
- 链接格式：`io.supabase.wanderlog://login-callback#access_token=xxx&type=recovery`

### 3. App 处理 Deep Link
```dart
// Frontend: main.dart
_authSub = SupabaseConfig.auth.onAuthStateChange.listen((data) {
  if (data.event == AuthChangeEvent.passwordRecovery) {
    _router.go('/reset-password');
  }
});
```

- 用户点击邮件中的链接
- iOS/Android 系统识别 deep link scheme 并打开 App
- Supabase SDK 自动处理 token，触发 `passwordRecovery` 事件
- App 导航到重置密码页面

### 4. 用户设置新密码
```dart
// Frontend: reset_password_page.dart
await SupabaseConfig.auth.updateUser(
  UserAttributes(password: newPassword),
);
```

- 用户输入新密码
- 调用 Supabase 的 `updateUser` 更新密码
- Supabase 自动验证 token 和更新密码

## Deep Link 配置

### iOS (Info.plist)
```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>io.supabase.wanderlog</string>
    </array>
  </dict>
</array>
```

### Android (AndroidManifest.xml)
```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW"/>
  <category android:name="android.intent.category.DEFAULT"/>
  <category android:name="android.intent.category.BROWSABLE"/>
  <data android:scheme="io.supabase.wanderlog" 
        android:host="login-callback"/>
</intent-filter>
```

### Supabase Dashboard
在 Authentication → URL Configuration 中添加：
```
io.supabase.wanderlog://login-callback
```

## 后端角色

后端的 `/auth/forgot-password` 和 `/auth/reset-password` 端点：

```typescript
// forgotPassword - 仅用于邮箱存在性检查
export const forgotPassword = async (req: Request, res: Response) => {
  // 检查用户是否存在，提供更好的错误信息
  // 实际邮件由 Supabase 发送
};

// resetPassword - 返回 501，由 Supabase 处理
export const resetPassword = async (req: Request, res: Response) => {
  return res.status(501).json({ 
    message: 'Password reset is handled by Supabase Auth.',
  });
};
```

## 优势

1. **原生集成** - 充分利用 Supabase 的内置功能
2. **Deep Link 支持** - 无缝的 App → Email → App 流程
3. **安全性** - 使用 Supabase 的 token 管理和过期机制
4. **代码更少** - 无需自己实现 token 生成、存储、邮件发送
5. **一致性** - 与其他 Supabase 认证流程（邮箱验证等）保持一致
6. **邮件模板** - 使用 Supabase Dashboard 自定义邮件模板

## 测试步骤

1. 运行 App
2. 点击登录页的 "Forgot Password"
3. 输入邮箱地址
4. 检查邮箱收件箱（如果没收到，查看垃圾邮件）
5. 点击邮件中的重置链接
6. App 应该自动打开到重置密码页面
7. 输入新密码
8. 完成！

## 故障排查

### 邮件未收到
- 检查垃圾邮件文件夹
- 验证邮箱已注册
- 检查 Supabase Dashboard → Authentication → Email Templates

### Deep Link 无法打开 App
- 验证 Info.plist/AndroidManifest.xml 中的 URL scheme
- 检查 Supabase Dashboard 中的 redirect URL 配置
- iOS 测试：`xcrun simctl openurl booted "io.supabase.wanderlog://login-callback"`
- Android 测试：`adb shell am start -a android.intent.action.VIEW -d "io.supabase.wanderlog://login-callback"`

### "Invalid or expired token"
- Token 在 1 小时后过期（Supabase 默认设置）
- 请求新的重置链接

## 相关文件

### Frontend
- `lib/features/auth/presentation/pages/forgot_password_page.dart` - 请求重置页面
- `lib/features/auth/presentation/pages/reset_password_page.dart` - 重置密码页面
- `lib/features/auth/providers/auth_provider.dart` - 认证逻辑
- `lib/core/supabase/supabase_config.dart` - Supabase 配置
- `lib/main.dart` - Deep link 监听

### Backend
- `src/controllers/authController.ts` - 认证控制器
- `src/routes/authRoutes.ts` - 路由配置

## 邮件模板自定义

在 Supabase Dashboard → Authentication → Email Templates → Reset Password，可以自定义邮件模板：

```html
<h2>Reset Your Password</h2>
<p>Hi {{ .Email }},</p>
<p>Click the link below to reset your password:</p>
<p><a href="{{ .ConfirmationURL }}">Reset Password</a></p>
<p>This link will expire in 1 hour.</p>
```

其中 `{{ .ConfirmationURL }}` 会被替换为 deep link。
