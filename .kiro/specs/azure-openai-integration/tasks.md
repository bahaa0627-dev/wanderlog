# Implementation Plan: Azure OpenAI Integration

## Overview

将 VAGO 应用的 AI 服务从 OpenAI Direct 迁移到 Azure OpenAI，实现多 Provider 支持和 fallback 机制。

## Tasks

- [x] 1. 创建 Provider 接口和类型定义
  - 在 `wanderlog_api/src/services/` 创建 `aiProviders/` 目录
  - 定义 `AIProvider` 接口
  - 定义 `PlaceIdentificationResult` 类型（复用现有）
  - 定义 `AIServiceError` 类型
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 2. 实现 Azure OpenAI Provider
  - [x] 2.1 创建 `AzureOpenAIProvider` 类
    - 实现配置加载和验证
    - 实现 `isAvailable()` 方法
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  
  - [x] 2.2 实现图片识别方法
    - 构建 Azure Vision API URL
    - 格式化请求 headers 和 body
    - 解析响应为 `PlaceIdentificationResult`
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  
  - [x] 2.3 实现文本生成方法
    - 构建 Azure Chat API URL
    - 格式化请求 headers 和 body
    - 解析响应
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 2.4 编写 Azure Provider 属性测试
    - **Property 2: Azure Vision Request Formatting**
    - **Property 3: Azure Text Request Formatting**
    - **Validates: Requirements 2.1, 2.2, 2.3, 3.1, 3.2, 3.3**

- [x] 3. 重构 Gemini Provider
  - [x] 3.1 将现有 Gemini 代码提取为 `GeminiProvider` 类
    - 实现 `AIProvider` 接口
    - 保持现有功能不变
    - _Requirements: 4.1_

- [x] 4. 重构 AIService 支持多 Provider
  - [x] 4.1 实现 Provider 管理
    - 根据配置初始化可用 Providers
    - 实现 `executeWithFallback` 方法
    - 支持配置 Provider 优先级顺序
    - _Requirements: 4.2, 4.3, 4.4_
  
  - [x] 4.2 实现重试和错误处理
    - 实现指数退避重试（429, 503）
    - 实现 Provider fallback 逻辑
    - 统一错误日志格式
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 4.3 编写 Fallback 属性测试
    - **Property 5: Fallback Chain Execution**
    - **Validates: Requirements 4.2, 5.2, 5.3**

- [x] 5. 更新现有 AI 方法使用新架构
  - [x] 5.1 更新 `identifyPlaceFromImage` 方法
    - 使用 `executeWithFallback` 调用 Provider
    - 保持返回格式不变
    - _Requirements: 2.4_
  
  - [x] 5.2 更新 `getPlaceRecommendations` 方法
    - 使用 `executeWithFallback` 调用 Provider
    - 保持返回格式不变
    - _Requirements: 3.4_
  
  - [x] 5.3 更新 `generatePlaceTags` 方法
    - 使用 `executeWithFallback` 调用 Provider
    - 保持返回格式不变
    - _Requirements: 3.4_
  
  - [x] 5.4 更新 `generatePlacesForCity` 方法
    - 使用 `executeWithFallback` 调用 Provider
    - 保持返回格式不变
    - _Requirements: 3.4_

  - [x] 5.5 编写响应一致性属性测试
    - **Property 4: Response Parsing Consistency**
    - **Validates: Requirements 2.4, 3.4**

- [x] 6. 更新环境配置
  - [x] 6.1 更新 `.env.example` 添加 Azure 配置模板
    - 添加所有 Azure OpenAI 环境变量
    - 添加配置说明注释
    - _Requirements: 6.1, 6.2, 6.3_
  
  - [x] 6.2 创建 Azure OpenAI 设置指南
    - 在 README 或单独文档中添加设置步骤
    - 包含 Azure Portal 创建资源和部署的说明
    - _Requirements: 6.4_

- [x] 7. Checkpoint - 验证集成
  - 确保所有测试通过
  - 手动测试 Azure OpenAI 调用
  - 测试 fallback 到 Gemini
  - 如有问题请询问用户

## Notes

- Tasks marked with `*` are optional property-based tests
- 现有的 OpenAI Direct 代码将被移除，完全使用 Azure OpenAI
- Gemini 保留作为 fallback，但 Azure OpenAI 是主要 Provider
- 所有现有功能应保持向后兼容
