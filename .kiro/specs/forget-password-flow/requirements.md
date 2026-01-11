# Requirements Document

## Introduction

本文档定义了 WanderLog 应用基于 Supabase Auth 的忘记密码（Forget Password）流程改进需求。当前系统已有基础实现，需要优化用户体验和错误处理。

## Glossary

- **User**: 使用 WanderLog 应用的注册用户
- **Supabase_Auth**: Supabase 提供的认证服务，处理用户注册、登录、密码重置等
- **Reset_Link**: Supabase 发送的密码重置邮件链接
- **Deep_Link**: 可以直接打开 App 特定页面的链接，格式为 `io.supabase.wanderlog://login-callback`
- **Flutter_App**: WanderLog 的移动端应用
- **passwordRecovery_Event**: Supabase Auth 触发的密码恢复事件

## Requirements

### Requirement 1: 请求密码重置

**User Story:** As a user, I want to request a password reset by entering my email, so that I can regain access to my account when I forget my password.

#### Acceptance Criteria

1. WHEN a user enters their email and submits the forgot password form, THE Flutter_App SHALL validate the email format before calling Supabase_Auth
2. WHEN a valid email is submitted, THE Flutter_App SHALL call `resetPasswordForEmail()` with the correct redirect URL
3. IF Supabase_Auth returns an error, THEN THE Flutter_App SHALL display a user-friendly error message
4. WHEN the request is successful, THE Flutter_App SHALL display a confirmation message instructing the user to check their email
5. THE Flutter_App SHALL display a "Resend" button with a countdown timer (60 seconds cooldown) to prevent spam

### Requirement 2: 处理重置链接

**User Story:** As a user, I want to click the reset link in my email and be taken directly to the password reset screen, so that I can easily set a new password.

#### Acceptance Criteria

1. WHEN a user clicks the Reset_Link from email, THE Flutter_App SHALL intercept the Deep_Link via app_links package
2. WHEN Supabase_Auth triggers the passwordRecovery_Event, THE Flutter_App SHALL navigate to the reset password screen
3. IF the app is not running when the link is clicked, THEN THE Flutter_App SHALL launch and navigate to the reset password screen after initialization
4. IF the reset link is expired or invalid, THEN THE Flutter_App SHALL display an appropriate error message

### Requirement 3: 设置新密码

**User Story:** As a user, I want to set a new password after clicking the reset link, so that I can securely access my account again.

#### Acceptance Criteria

1. WHEN a user submits a new password, THE Flutter_App SHALL validate password strength (minimum 6 characters)
2. WHEN a user submits a new password, THE Flutter_App SHALL require password confirmation
3. IF the password and confirmation do not match, THEN THE Flutter_App SHALL display an error message
4. WHEN a valid new password is submitted, THE Flutter_App SHALL call `updateUser()` to update the password via Supabase_Auth
5. WHEN the password is successfully reset, THE Flutter_App SHALL display a success message and navigate to the login page
6. IF Supabase_Auth returns an error (e.g., same password), THEN THE Flutter_App SHALL display a user-friendly error message

### Requirement 4: 用户界面优化

**User Story:** As a user, I want a clear and intuitive interface for the password reset flow, so that I can easily recover my account.

#### Acceptance Criteria

1. THE Flutter_App SHALL provide a "Forgot Password?" link on the login page
2. THE ForgotPasswordPage SHALL display clear instructions about the reset process
3. THE ForgotPasswordPage SHALL show a loading indicator while the request is being processed
4. THE ResetPasswordPage SHALL display password strength requirements
5. THE ResetPasswordPage SHALL provide password visibility toggle for both password fields
6. IF any error occurs, THEN THE Flutter_App SHALL display a clear, user-friendly error message using CustomToast

### Requirement 5: 错误处理改进

**User Story:** As a user, I want clear error messages when something goes wrong, so that I know how to proceed.

#### Acceptance Criteria

1. IF the email is not registered, THEN THE Flutter_App SHALL display "This email didn't sign up. Please check your email or create a new account."
2. IF the network is unavailable, THEN THE Flutter_App SHALL display a network error message
3. IF the reset link has expired, THEN THE Flutter_App SHALL display "Reset link has expired. Please request a new one."
4. IF the new password is the same as the old password, THEN THE Flutter_App SHALL display "New password must be different from your current password."
5. IF the session is invalid during password update, THEN THE Flutter_App SHALL redirect to forgot password page with an error message
