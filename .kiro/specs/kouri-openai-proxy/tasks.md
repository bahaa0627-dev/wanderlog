# Implementation Plan: Kouri OpenAI Proxy Integration

## Overview

将 Kouri API 中转服务集成到现有的多 AI Provider 架构中，实现 KouriProvider 类并集成到 AIService 的 fallback 机制。

## Tasks

- [x] 1. 扩展 AI Provider 类型定义
  - [x] 1.1 在 types.ts 中添加 KOURI 到 AIProviderName 枚举
    - 添加 `KOURI = 'kouri'` 枚举值
    - _Requirements: 3.1_

- [x] 2. 实现 KouriProvider 类
  - [x] 2.1 创建 KouriProvider.ts 文件
    - 实现 AIProvider 接口
    - 实现配置加载（KOURI_API_KEY, KOURI_BASE_URL, KOURI_CHAT_MODEL, KOURI_VISION_MODEL）
    - 实现 isAvailable() 方法
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4_
  
  - [x] 2.2 实现 generateText 方法
    - 构建 OpenAI 兼容的 chat completion 请求
    - 发送请求到 Kouri API
    - 解析响应并返回文本
    - _Requirements: 1.4, 1.5_
  
  - [x] 2.3 实现 identifyPlace 方法
    - 构建 OpenAI vision 格式的请求
    - 使用 KOURI_VISION_MODEL 配置
    - 解析 JSON 响应为 PlaceIdentificationResult
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  
  - [x] 2.4 实现错误处理
    - 映射 HTTP 状态码到 AIErrorCode
    - 设置正确的 retryable 标志
    - 处理超时错误
    - _Requirements: 3.3, 4.1, 4.2, 4.3, 4.4_

- [x] 2.5 编写 KouriProvider 单元测试
  - 测试配置加载
  - 测试 isAvailable() 逻辑
  - 测试请求构建
  - 测试错误处理
  - _Requirements: 1.2, 1.3, 4.1, 4.2, 4.3, 4.4_

- [x] 2.6 编写属性测试 - Error Code Mapping
  - **Property 2: Error Code Mapping**
  - **Validates: Requirements 3.3, 4.1, 4.2, 4.3**

- [x] 3. 集成到 AIService
  - [x] 3.1 在 aiService.ts 中注册 KouriProvider
    - 在 initializeProviders() 中初始化 KouriProvider
    - 在 parseProviderOrder() 中支持 'kouri' 名称
    - _Requirements: 3.1, 3.2_

- [x] 4. 更新配置文件
  - [x] 4.1 更新 .env.example
    - 添加 KOURI_API_KEY, KOURI_BASE_URL, KOURI_CHAT_MODEL, KOURI_VISION_MODEL 示例
    - 更新 AI_PROVIDER_ORDER 示例包含 kouri
    - _Requirements: 2.1, 2.2, 2.3_

- [x] 5. Checkpoint - 验证集成
  - 确保所有测试通过
  - 如有问题请询问用户

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- KouriProvider 使用 OpenAI 兼容 API 格式，与 AzureOpenAIProvider 类似但更简单
- 错误处理复用现有的 AIErrorCode 和重试机制
