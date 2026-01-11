# Implementation Plan: Forget Password Flow

## Overview

基于 Supabase Auth 的忘记密码流程改进，主要包括验证工具类、错误消息映射、UI 优化和测试。

## Tasks

- [x] 1. 创建验证工具类
  - [x] 1.1 创建 `lib/core/utils/validators.dart` 文件
    - 实现 `validateEmail()` 方法
    - 实现 `validatePassword()` 方法
    - 实现 `validatePasswordConfirmation()` 方法
    - 实现 `hasMinLength()` 辅助方法
    - _Requirements: 1.1, 3.1, 3.3_

  - [x] 1.2 编写 Validators 属性测试
    - **Property 1: Email Validation Correctness**
    - **Property 2: Password Length Validation**
    - **Property 3: Password Confirmation Matching**
    - **Validates: Requirements 1.1, 3.1, 3.3**

- [x] 2. 创建错误消息映射
  - [x] 2.1 创建 `lib/core/utils/auth_error_messages.dart` 文件
    - 实现 `fromSupabaseError()` 方法
    - 定义所有错误消息常量
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 2.2 编写错误消息映射属性测试
    - **Property 5: Error Message Mapping**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**

- [x] 3. 改进 ForgotPasswordPage
  - [x] 3.1 添加邮件发送成功状态显示
    - 添加 `_emailSent` 状态变量
    - 成功后显示确认消息和重发按钮
    - _Requirements: 1.4_

  - [x] 3.2 实现重发倒计时功能
    - 添加 `_resendCountdown` 和 `_countdownTimer`
    - 实现 `_startResendCountdown()` 方法
    - 实现 `_resendEmail()` 方法
    - 显示倒计时 UI
    - _Requirements: 1.5_

  - [x] 3.3 集成 Validators 和 AuthErrorMessages
    - 使用 `Validators.validateEmail()` 替换内联验证
    - 使用 `AuthErrorMessages.fromSupabaseError()` 处理错误
    - _Requirements: 1.1, 1.3_

  - [ ]* 3.4 编写倒计时属性测试
    - **Property 4: Countdown Timer Decrement**
    - **Validates: Requirements 1.5**

- [x] 4. 改进 ResetPasswordPage
  - [x] 4.1 添加实时密码验证
    - 添加 `_hasMinLength` 和 `_passwordsMatch` 状态
    - 实现 `_validatePassword()` 方法
    - 在输入时实时更新状态
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 4.2 添加密码强度指示器
    - 实现 `_buildPasswordStrengthIndicator()` 方法
    - 显示密码是否满足要求
    - 显示两次密码是否匹配
    - _Requirements: 4.4_

  - [x] 4.3 集成 Validators 和 AuthErrorMessages
    - 使用 `Validators.validatePassword()` 替换内联验证
    - 使用 `Validators.validatePasswordConfirmation()` 验证确认
    - 使用 `AuthErrorMessages.fromSupabaseError()` 处理错误
    - _Requirements: 3.1, 3.3, 3.6_

- [x] 5. Checkpoint - 确保所有测试通过
  - 运行所有单元测试和属性测试
  - 确保没有编译错误
  - 如有问题请询问用户

- [x] 6. 更新 AuthNotifier 错误处理
  - [x] 6.1 改进 `forgotPassword()` 方法
    - 使用 `AuthErrorMessages.fromSupabaseError()` 处理错误
    - _Requirements: 1.3_

  - [x] 6.2 改进 `updatePassword()` 方法
    - 使用 `AuthErrorMessages.fromSupabaseError()` 处理错误
    - _Requirements: 3.6_

- [x] 7. Final Checkpoint - 完整流程测试
  - 确保所有测试通过
  - 手动测试完整流程（可选）
  - 如有问题请询问用户

## Notes

- 任务标记 `*` 的为可选测试任务，可跳过以加快 MVP 开发
- 每个任务都引用了具体的需求条款以便追溯
- 属性测试验证核心验证逻辑的正确性
