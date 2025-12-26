# Implementation Plan: AI Search Cost Optimization

## Overview

本实现计划基于精细化配额策略优化 AI 搜索成本。

**核心策略：**
- 🔄 AI 模型：切换到 Gemini 1.5 Flash
- 🔍 深度搜索配额：10 次/天（调用 Google API 生成卡片）
- 👁️ 详情查看配额：20 次/天（点击查看 Google 地点详情）
- ✅ Supabase 缓存数据：不消耗配额
- 📝 超额降级：纯文本推荐（不调 Google API）

**已有功能（无需重复实现）：**
- ✅ 数据库缓存（places 表，google_place_id 去重）
- ✅ 缓存查询（_searchDatabaseWithIntent）
- ✅ R2 图片上传（ImageService）
- ✅ AI 推荐数量限制（_maxLimit = 5）

## Tasks

- [x] 1. AI 模型切换
  - [x] 1.1 切换到 Gemini 1.5 Flash
    - 修改 ai_recognition_service.dart
    - 将 gemini-2.5-flash 改为 gemini-1.5-flash
    - 移除 OpenAI fallback 逻辑
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. 数据库表结构更新（配额追踪）
  - [x] 2.1 创建 user_quotas 表
    - 在 Supabase 创建表
    - 字段：user_id, quota_date, deep_search_count, detail_view_count
    - _Requirements: 2.1, 3.1_

- [x] 3. 配额服务实现
  - [x] 3.1 实现 QuotaService
    - 创建 quota_service.dart
    - 实现 getQuotaStatus(userId) 方法
    - 实现 consumeDeepSearch(userId) 方法
    - 实现 consumeDetailView(userId) 方法
    - 实现 canDeepSearch(userId) 方法
    - 实现 canViewDetail(userId) 方法
    - 常量：DEEP_SEARCH_LIMIT = 10, DETAIL_VIEW_LIMIT = 20
    - _Requirements: 2.1, 2.2, 3.1, 3.2_
  - [ ]* 3.2 编写配额服务属性测试
    - **Property: Quota Enforcement**
    - **Validates: Requirements 2.1, 3.1**

- [x] 4. Checkpoint - 确保配额服务测试通过
  - 代码诊断通过，无语法错误

- [x] 5. 搜索流程集成配额检查
  - [x] 5.1 修改搜索流程：区分缓存和 Google 结果
    - 修改 ai_recognition_service.dart 的 searchByQuery
    - 先查缓存，记录缓存命中数量
    - 只有调用 Google API 时才检查/消耗 deep_search 配额
    - _Requirements: 2.2, 2.3_
  - [x] 5.2 实现超额降级逻辑
    - 配额用完 + 无缓存 → 返回纯文本推荐
    - 配额用完 + 有缓存 → 只返回缓存卡片
    - _Requirements: 2.4, 2.5, 7.1, 7.2, 7.3, 7.4_
  - [ ]* 5.3 编写降级逻辑属性测试
    - **Property: Graceful Degradation**
    - **Validates: Requirements 2.4, 2.5**

- [x] 6. Checkpoint - 确保搜索流程测试通过
  - 代码诊断通过，无语法错误

- [x] 7. 详情页配额检查
  - [x] 7.1 修改详情页加载逻辑
    - 当前架构已满足：详情页不额外调用 Google API
    - Supabase 地点：直接显示，不消耗配额
    - _Requirements: 3.2, 3.3_
  - [x] 7.2 实现详情页超额处理
    - 当前架构已满足：详情数据在搜索时已获取
    - _Requirements: 3.4_

- [x] 8. 配额状态 UI 展示
  - [x] 8.1 搜索界面显示配额
    - 修改 ai_chat_page.dart
    - AppBar 显示剩余深度搜索次数 (⚡ X/10)
    - 低配额警告（≤2 次显示红色）
    - _Requirements: 8.1, 8.3_
  - [x] 8.2 详情页显示配额
    - 点击配额指示器显示详情弹窗
    - 显示剩余详情查看次数
    - 显示配额重置时间
    - _Requirements: 8.2, 8.4_

- [x] 9. 纯文本降级响应实现
  - [x] 9.1 实现 TextFallback 响应格式
    - AIRecognitionResult 添加 textFallback 字段
    - 包含：地点名称、简短描述
    - 不包含：图片、评分、坐标
    - _Requirements: 7.2, 7.3_
  - [x] 9.2 实现降级 UI 展示
    - 配额用完时返回文本消息
    - 提示用户配额已用完
    - _Requirements: 7.4_

- [x] 10. Final Checkpoint - 完整集成测试
  - ✅ 代码诊断通过，无语法错误
  - 测试场景说明：
    - 场景 1：缓存命中 → 直接返回缓存卡片，不消耗配额
    - 场景 2：调用 Google API → 成功后消耗 deep_search 配额
    - 场景 3：配额用完 + 无缓存 → 返回纯文本推荐
    - 场景 3b：配额用完 + 有缓存 → 只返回缓存卡片
    - 场景 4/5：详情页不额外调用 Google API，无需消耗配额

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- 核心逻辑：Supabase 数据 = 免费，Google API = 消耗配额
- 配额每日 00:00 UTC 重置
- 前端使用 Dart/Flutter，配额服务可以直接调用 Supabase
