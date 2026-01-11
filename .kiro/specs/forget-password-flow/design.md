# Design Document: Forget Password Flow

## Overview

本设计文档描述了 WanderLog 应用基于 Supabase Auth 的忘记密码流程改进方案。主要聚焦于用户体验优化、错误处理改进和代码质量提升。

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Flutter App                           │
├─────────────────────────────────────────────────────────────┤
│  Presentation Layer                                          │
│  ├─ ForgotPasswordPage (输入邮箱，请求重置)                  │
│  └─ ResetPasswordPage (输入新密码)                          │
├─────────────────────────────────────────────────────────────┤
│  Provider Layer                                              │
│  └─ AuthNotifier (状态管理，调用 Supabase Auth)             │
├─────────────────────────────────────────────────────────────┤
│  Core Layer                                                  │
│  ├─ SupabaseConfig (Supabase 客户端配置)                    │
│  └─ Validators (邮箱、密码验证工具)                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      Supabase Auth                           │
├─────────────────────────────────────────────────────────────┤
│  ├─ resetPasswordForEmail() - 发送重置邮件                  │
│  ├─ onAuthStateChange - 监听 passwordRecovery 事件          │
│  └─ updateUser() - 更新密码                                 │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. ForgotPasswordPage (改进)

现有页面需要以下改进：

```dart
class ForgotPasswordPage extends ConsumerStatefulWidget {
  // 新增状态
  bool _emailSent = false;        // 邮件是否已发送
  int _resendCountdown = 0;       // 重发倒计时
  Timer? _countdownTimer;         // 倒计时定时器
  
  // 新增方法
  void _startResendCountdown();   // 开始60秒倒计时
  Future<void> _resendEmail();    // 重发邮件
}
```

### 2. ResetPasswordPage (改进)

现有页面需要以下改进：

```dart
class ResetPasswordPage extends ConsumerStatefulWidget {
  // 新增状态
  bool _hasMinLength = false;     // 密码长度检查
  bool _passwordsMatch = false;   // 密码匹配检查
  
  // 新增方法
  void _validatePassword();       // 实时密码验证
  Widget _buildPasswordStrengthIndicator(); // 密码强度指示器
}
```

### 3. Validators (新增)

创建统一的验证工具类：

```dart
class Validators {
  /// 验证邮箱格式
  static String? validateEmail(String? value);
  
  /// 验证密码强度
  static String? validatePassword(String? value);
  
  /// 验证密码确认
  static String? validatePasswordConfirmation(String? password, String? confirmation);
  
  /// 检查密码是否满足最小长度
  static bool hasMinLength(String password, {int minLength = 6});
}
```

### 4. ErrorMessages (新增)

创建统一的错误消息映射：

```dart
class AuthErrorMessages {
  /// 将 Supabase 错误转换为用户友好的消息
  static String fromSupabaseError(dynamic error);
  
  static const String emailNotFound = "This email didn't sign up. Please check your email or create a new account.";
  static const String linkExpired = "Reset link has expired. Please request a new one.";
  static const String samePassword = "New password must be different from your current password.";
  static const String networkError = "Network error. Please check your connection and try again.";
  static const String invalidSession = "Session expired. Please request a new reset link.";
}
```

## Data Models

### AuthState (现有，无需修改)

```dart
class AuthState {
  final User? user;
  final bool isLoading;
  final String? error;
}
```

### ForgotPasswordState (新增，可选)

如果需要更细粒度的状态管理：

```dart
class ForgotPasswordState {
  final bool isLoading;
  final bool emailSent;
  final int resendCountdown;
  final String? error;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Email Validation Correctness

*For any* string input, the email validator should return null (valid) only if the string matches a valid email format (contains @ and domain), and should return an error message for all other inputs.

**Validates: Requirements 1.1**

### Property 2: Password Length Validation

*For any* string input, the password validator should return null (valid) only if the string length is >= 6 characters, and should return an error message for shorter strings.

**Validates: Requirements 3.1**

### Property 3: Password Confirmation Matching

*For any* pair of password strings, the confirmation validator should return null (valid) only if both strings are identical, and should return an error message when they differ.

**Validates: Requirements 3.3**

### Property 4: Countdown Timer Decrement

*For any* initial countdown value > 0, after each second tick, the countdown value should decrease by 1 until it reaches 0, then stop.

**Validates: Requirements 1.5**

### Property 5: Error Message Mapping

*For any* Supabase error code, the error message mapper should return a non-empty, user-friendly string that does not expose internal error details.

**Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**

## Error Handling

### Supabase Error Mapping

| Supabase Error | User Message |
|----------------|--------------|
| `user_not_found` | "This email didn't sign up. Please check your email or create a new account." |
| `email_not_confirmed` | "Please verify your email first." |
| `same_password` | "New password must be different from your current password." |
| `weak_password` | "Password is too weak. Please use at least 6 characters." |
| `expired_token` | "Reset link has expired. Please request a new one." |
| `invalid_token` | "Invalid reset link. Please request a new one." |
| Network errors | "Network error. Please check your connection and try again." |
| Unknown errors | "Something went wrong. Please try again." |

### Error Handling Flow

```
Supabase Error
    ↓
AuthErrorMessages.fromSupabaseError()
    ↓
User-friendly message
    ↓
CustomToast.showError()
```

## Testing Strategy

### Unit Tests

1. **Validators Tests**
   - Test email validation with valid/invalid formats
   - Test password length validation
   - Test password confirmation matching

2. **Error Message Mapping Tests**
   - Test each Supabase error code maps to correct message
   - Test unknown errors return generic message

### Property-Based Tests

使用 `fast_check` 或类似库进行属性测试：

1. **Email Validation Property Test**
   - Generate random strings
   - Verify only valid email formats pass validation

2. **Password Validation Property Test**
   - Generate random strings of various lengths
   - Verify length >= 6 passes, length < 6 fails

3. **Password Matching Property Test**
   - Generate pairs of strings
   - Verify matching pairs pass, non-matching fail

### Integration Tests

1. **Forgot Password Flow**
   - Mock Supabase Auth
   - Test successful email submission
   - Test error handling

2. **Reset Password Flow**
   - Mock Supabase Auth
   - Test successful password update
   - Test error handling

## UI/UX Improvements

### ForgotPasswordPage

1. **成功状态显示**
   - 邮件发送成功后显示确认消息
   - 显示重发按钮和倒计时

2. **Loading 状态**
   - 按钮显示 loading indicator
   - 禁用输入框

### ResetPasswordPage

1. **密码强度指示**
   - 实时显示密码是否满足要求
   - 使用颜色/图标指示

2. **密码匹配指示**
   - 实时显示两次密码是否匹配

## Implementation Notes

### Deep Link 配置

现有配置已正确设置：
- Scheme: `io.supabase.wanderlog`
- Host: `login-callback`
- Redirect URL: `io.supabase.wanderlog://login-callback`

### Supabase Dashboard 配置

确保 Supabase Dashboard 中配置了正确的 Redirect URL：
1. Authentication → URL Configuration
2. 添加 `io.supabase.wanderlog://login-callback` 到 Redirect URLs

### 邮件模板

Supabase 默认邮件模板可在 Dashboard 中自定义：
1. Authentication → Email Templates
2. 选择 "Reset Password" 模板
3. 自定义邮件内容和样式
