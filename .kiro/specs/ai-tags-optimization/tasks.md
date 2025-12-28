# Implementation Plan: AI Tags Optimization

## Overview

本实现计划采用"最小增量"策略，分阶段完成 Category、ai_tags、tags 三者关系的优化。优先完成数据库变更和字典表创建，然后实现 AI Tags 生成服务，最后执行数据迁移和 API 更新。

## Tasks

- [x] 1. 数据库 Schema 变更
  - [x] 1.1 创建 ai_facet_dictionary 字典表
    - 创建表结构：id, en, zh, priority, allowed_categories, derive_from
    - 从 ai_facet_dictionary.csv 导入数据
    - _Requirements: 3.1, 3.3_

  - [x] 1.2 更新 places 表 Schema
    - 添加 CHECK 约束限制 ai_tags 最多 2 个元素
    - 创建 tags 字段的 GIN 索引
    - 添加 i18n jsonb 字段（可选）
    - _Requirements: 2.3, 2.4, 9.1_

  - [x] 1.3 创建 normalize_ai_tags 触发器
    - 创建触发器函数校验 ai_tags 格式
    - 移除无效元素、重复元素
    - 移除与 category_en 重复的标签
    - 截断到最多 2 个
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 1.4 编写数据库约束测试
    - **Property 2: AI Tags Format and Constraints**
    - **Property 6: Trigger Validation**
    - **Validates: Requirements 2.2, 2.3, 2.5, 6.2-6.6**

- [x] 2. Checkpoint - 验证数据库变更
  - 确保所有测试通过，如有问题请询问用户

- [x] 3. AI Tags Generator 服务实现
  - [x] 3.1 创建 AI Facet Dictionary 服务
    - 创建 `src/services/aiFacetDictionaryService.ts`
    - 实现 `getFacetDefinition()` 方法
    - 实现 `isFacetAllowedForCategory()` 方法
    - 实现 `getAllFacets()` 方法
    - _Requirements: 3.2, 3.4_

  - [x] 3.2 创建 AI Tags Generator 服务
    - 创建 `src/services/aiTagsGeneratorService.ts`
    - 实现 `generateAITags()` 方法
    - 实现优先级排序逻辑 (Pritzker > Style > Brunch > Cuisine > Experience)
    - 实现 category 重复检测
    - 实现最多 1 个 style、最多 1 个 entity 限制
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [x] 3.3 编写 AI Tags Generator 属性测试
    - **Property 3: Facet Dictionary Validation**
    - **Property 4: AI Tags Generation Rules**
    - **Validates: Requirements 3.2, 3.4, 4.1-4.8**

- [x] 4. Checkpoint - 验证 AI Tags Generator
  - 确保所有测试通过，如有问题请询问用户

- [x] 5. Display Tags 服务实现
  - [x] 5.1 创建 Display Tags 服务
    - 创建 `src/services/displayTagsService.ts`
    - 实现 `computeDisplayTags()` 方法
    - 支持中英文切换
    - 实现最多 3 个标签限制
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 5.6_

  - [x] 5.2 编写 Display Tags 属性测试
    - **Property 5: Display Tags Computation**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.5, 5.6**

- [x] 6. Checkpoint - 验证 Display Tags 服务
  - 确保所有测试通过，如有问题请询问用户

- [x] 7. 历史数据迁移
  - [x] 7.1 创建 Tags 迁移脚本
    - 创建 `scripts/migrate-tags-to-structured.ts`
    - 实现旧 string[] tags 到新 jsonb 结构的转换
    - 保存原始数据到 custom_fields.migration_backup
    - _Requirements: 7.1, 7.3_

  - [x] 7.2 创建 AI Tags 重新生成脚本
    - 创建 `scripts/regenerate-ai-tags.ts`
    - 基于新的结构化 tags 重新生成 ai_tags
    - 生成迁移报告
    - _Requirements: 7.2, 7.4_

  - [x] 7.3 编写迁移脚本属性测试
    - **Property 7: Migration Correctness**
    - **Validates: Requirements 7.1, 7.2, 7.3**

  - [x] 7.4 执行历史数据迁移
    - 在测试环境执行迁移脚本
    - 验证迁移报告
    - 在生产环境执行迁移脚本
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 8. Checkpoint - 验证数据迁移
  - 确保所有测试通过，如有问题请询问用户

- [x] 9. API 响应格式更新
  - [x] 9.1 更新 Place API 响应格式
    - 修改 `formatPlaceResponse()` 函数
    - 添加 `ai_tags` 对象数组格式
    - 添加 `display_tags_en` 和 `display_tags_zh` 计算字段
    - 移除内部 `tags` 字段从响应
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 9.2 编写 API 响应属性测试
    - **Property 8: API Response Format**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4**

- [x] 10. 数据导入服务集成
  - [x] 10.1 更新 Normalization Service
    - 修改 `extractTags()` 生成结构化 tags
    - 集成 AI Tags Generator 生成 ai_tags
    - _Requirements: 1.1, 1.2, 1.3, 4.1-4.8_

  - [x] 10.2 更新 Public Place Service
    - 在 `createPlace()` 中集成新的 tags/ai_tags 生成
    - 在 `updatePlace()` 中集成新的 tags/ai_tags 生成
    - _Requirements: 1.4, 8.4_

- [x] 11. Final Checkpoint - 完整集成测试
  - 确保所有测试通过，如有问题请询问用户
  - 验证端到端导入流程
  - 验证 API 响应格式
  - 验证 C 端展示标签正确性

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- 数据库迁移是最关键的第一步，必须先完成
- 迁移脚本执行前建议备份数据库
- 属性测试使用 `fast-check` 库
- 每个 Checkpoint 都是验证点，确保前序任务正确完成
- ai_facet_dictionary.csv 已存在，可直接导入
- 触发器确保数据库层面的数据完整性
- API 响应不再返回内部 tags 字段，只返回 ai_tags 和 display_tags
