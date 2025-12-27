# Implementation Plan: AI Search V2 - Parallel Pipeline

## Overview

本实现计划将 AI 搜索功能升级到 V2 版本，实现 GPT-4o-mini 与 Google Text Search Enterprise 的并行调用架构。使用 TypeScript (Node.js) 后端和 Dart (Flutter) 前端。

## Tasks

- [x] 1. 数据库准备
  - [x] 1.1 添加 is_verified 字段到 places 表
    - 执行 SQL: `ALTER TABLE places ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false`
    - 创建索引: `CREATE INDEX IF NOT EXISTS idx_places_is_verified ON places(is_verified)`
    - _Requirements: 14.5, 14.6_
  - [x] 1.2 迁移现有数据设置 is_verified
    - 执行 SQL: `UPDATE places SET is_verified = true WHERE google_place_id IS NOT NULL`
    - _Requirements: 14.5, 14.6_

- [x] 2. 后端 - AI 推荐服务
  - [x] 2.1 创建 AIRecommendationService
    - 新建 `wanderlog_api/src/services/aiRecommendationService.ts`
    - 实现 `getRecommendations(query: string)` 方法
    - 使用 Kouri Provider 调用 GPT-4o-mini
    - 实现 JSON 响应解析和验证
    - _Requirements: 1.1, 3.1, 3.3, 3.4, 3.5_
  - [x] 2.2 编写 AIRecommendationService 单元测试
    - 测试 prompt 构建
    - 测试 JSON 解析
    - 测试字段验证
    - _Requirements: 3.3, 3.4, 3.5_
  - [x] 2.3 实现 Summary 生成方法
    - 实现 `generateSummaries(places: PlaceBasicInfo[])` 方法
    - 生成每个地点的 summary 和整体 summary
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 3. 后端 - Google Places Enterprise 服务
  - [x] 3.1 创建 GooglePlacesEnterpriseService
    - 新建 `wanderlog_api/src/services/googlePlacesEnterpriseService.ts`
    - 实现 `textSearchEnterprise(query: string)` 方法
    - 配置 Field Mask 控制成本
    - 返回 20 个地点
    - _Requirements: 4.1, 4.2, 4.3_
  - [x] 3.2 实现图片上传到 R2
    - 实现 `uploadPhotoToR2(photoReference: string, placeId: string)` 方法
    - 只上传第一张图片
    - 返回 R2 URL
    - _Requirements: 4.4, 4.6_
  - [x] 3.3 实现地点同步到数据库
    - 实现 `syncPlacesToDatabase(places: GooglePlace[])` 方法
    - 设置 is_verified = true
    - 使用 upsert 避免重复
    - _Requirements: 4.5, 14.5_
  - [x] 3.4 编写 GooglePlacesEnterpriseService 单元测试
    - 测试 Field Mask 配置
    - 测试数据库同步
    - _Requirements: 4.1, 4.5_

- [x] 4. 后端 - 地点匹配服务
  - [x] 4.1 创建 PlaceMatcherService
    - 新建 `wanderlog_api/src/services/placeMatcherService.ts`
    - 实现名称相似度计算 (Levenshtein)
    - 实现地理距离计算 (Haversine)
    - _Requirements: 5.1, 5.2_
  - [x] 4.2 实现匹配算法
    - 实现 `matchPlaces(aiPlaces, googlePlaces, cachedPlaces)` 方法
    - 阈值：名称相似度 ≥ 0.7，距离 ≤ 500m
    - 返回匹配结果和未匹配列表
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  - [x] 4.3 实现展示数量限制
    - 有分类：每个分类 2-5 个
    - 无分类：累计最多 5 个
    - _Requirements: 9.2, 9.4_
  - [x] 4.4 编写 PlaceMatcherService 属性测试
    - **Property 7: Display Count Limits**
    - **Validates: Requirements 9.2, 9.4**

- [x] 5. 后端 - 配额服务
  - [x] 5.1 更新 QuotaService
    - 修改 `wanderlog_api/src/services/quotaService.ts`
    - 设置每日限制为 10 次
    - 实现 `canSearch()`, `consumeQuota()`, `getRemainingQuota()` 方法
    - _Requirements: 13.1, 13.2_
  - [x] 5.2 编写 QuotaService 属性测试
    - **Property 9: Daily Quota Enforcement**
    - **Validates: Requirements 13.1**

- [x] 6. 后端 - 搜索 V2 API
  - [x] 6.1 创建 SearchV2Controller
    - 新建 `wanderlog_api/src/controllers/searchV2Controller.ts`
    - 实现 `POST /places/ai/search-v2` 端点
    - 协调并行调用 AI 和 Google 服务
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [x] 6.2 实现并行调用逻辑
    - 使用 `Promise.allSettled()` 并行执行
    - 处理超时（AI: 10s, Google: 5s）
    - 处理部分失败场景
    - _Requirements: 2.1, 2.4, 2.5_
  - [x] 6.3 实现完整搜索流程
    - 检查配额 → 并行调用 → 匹配 → 生成 Summary → 保存 AI 地点 → 返回结果
    - _Requirements: 2.1, 5.1, 6.1, 14.1_
  - [x] 6.4 编写 SearchV2Controller 属性测试
    - **Property 1: Parallel Execution Independence**
    - **Property 10: Fallback on Partial Failure**
    - **Validates: Requirements 2.1, 2.4, 2.5**

- [x] 7. Checkpoint - 后端测试
  - 确保所有后端测试通过
  - 手动测试 API 端点
  - 如有问题请询问用户

- [x] 8. Flutter - 数据模型
  - [x] 8.1 创建 SearchV2 响应模型
    - 新建 `wanderlog_app/lib/features/ai_recognition/data/models/search_v2_result.dart`
    - 定义 `SearchV2Result`, `CategoryGroup`, `PlaceResult` 类
    - 实现 JSON 序列化
    - _Requirements: 3.5, 9.1_
  - [x] 8.2 更新 Spot 模型
    - 添加 `isVerified`, `recommendationPhrase`, `source` 字段
    - _Requirements: 11.1, 11.4_

- [x] 9. Flutter - AI 搜索服务
  - [x] 9.1 创建 SearchV2Service
    - 新建 `wanderlog_app/lib/features/ai_recognition/data/services/search_v2_service.dart`
    - 实现 `searchV2(query: string)` 方法
    - 调用后端 `/places/ai/search-v2` API
    - _Requirements: 2.1_
  - [x] 9.2 实现加载状态管理
    - 定义 `SearchStage` 枚举
    - Stage 1: 分析用户诉求 (1s)
    - Stage 2: 正在寻找合适地点
    - Stage 3: 总结输出中
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 10. Flutter - UI 组件
  - [x] 10.1 创建分类展示组件
    - 新建 `CategorySection` widget
    - 横滑 4:3 卡片布局
    - 每个分类 2-5 个地点
    - _Requirements: 9.1, 9.2, 9.3_
  - [x] 10.2 创建平铺展示组件
    - 新建 `FlatPlaceList` widget
    - 横向卡片布局
    - 最多 5 个地点
    - _Requirements: 9.4, 9.5_
  - [x] 10.3 创建 AI 地点卡片
    - 新建 `AIPlaceCard` widget
    - 显示 recommendationPhrase 替代评分
    - 显示 AI 标签和 summary
    - _Requirements: 11.1, 11.2, 11.4_
  - [x] 10.4 创建结果地图组件
    - 新建 `RecommendationMapView` widget
    - 显示所有推荐地点标记
    - 支持缩放，不支持搜索
    - _Requirements: 10.3, 10.4, 10.5_

- [x] 11. Flutter - AI Assistant 页面更新
  - [x] 11.1 更新 AIAssistantPage
    - 修改 `wanderlog_app/lib/features/ai_recognition/presentation/pages/ai_assistant_page.dart`
    - 集成 SearchV2Service
    - 实现三阶段 loading 状态
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  - [x] 11.2 更新结果展示
    - 显示承接文案
    - 根据是否有分类选择展示组件
    - 显示总结 summary
    - 显示地图
    - _Requirements: 8.1, 8.2, 8.3, 9.1, 10.1, 10.2_
  - [x] 11.3 移除 AI 头像和底卡
    - 移除 `_buildAIAvatar()` 调用
    - 移除 AI 消息的 Container 背景
    - 直接显示文本
    - _Requirements: 12.1, 12.2, 12.3_
  - [x] 11.4 显示配额信息
    - 在界面显示剩余搜索次数
    - 配额用完时显示提示
    - _Requirements: 13.3, 13.4_

- [x] 12. Checkpoint - 前端测试
  - 确保 Flutter 编译通过
  - 手动测试c
  - 如有问题请询问用户

- [x] 13. 集成测试
  - [x] 13.1 端到端搜索流程测试
    - 测试有分类场景
    - 测试无分类场景
    - 测试 AI-only 地点展示
    - _Requirements: 2.1, 5.1, 9.1, 11.1_
  - [x] 13.2 配额限制测试
    - 测试 10 次限制
    - 测试配额用完提示
    - _Requirements: 13.1, 13.3_

- [x] 14. Final Checkpoint
  - 确保所有测试通过
  - 确保功能完整
  - 如有问题请询问用户

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
