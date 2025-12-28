# Implementation Plan: Category & Tags Normalization

## Overview

本实现计划采用"最小增量"策略，分阶段完成分类和标签系统的重构。优先完成数据库变更和迁移脚本，确保现有数据安全，然后逐步实现归一化服务和 API 兼容性。

## Tasks

- [x] 1. 数据库 Schema 变更
  - [x] 1.1 创建 Prisma migration 添加新字段
    - 添加 `category_slug` (text, nullable)
    - 添加 `category_en` (text, nullable)
    - 添加 `source_detail` (text, nullable)
    - 添加 `category_slug` 索引
    - 添加 `(source, source_detail)` 组合唯一索引
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6_

  - [x] 1.2 生成并执行 Supabase SQL 迁移脚本
    - 导出 Prisma migration 为 SQL
    - 在 Supabase 控制台执行
    - 验证字段和索引创建成功
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6_

  - [ ]* 1.3 编写数据库约束测试
    - **Property 1: Category Slug Uniqueness Constraint**
    - **Property 2: Source-Detail Combination Uniqueness**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**

- [x] 2. Checkpoint - 验证数据库变更
  - 确保所有测试通过，如有问题请询问用户

- [x] 3. 分类规则引擎实现
  - [x] 3.1 创建分类常量和映射文件
    - 创建 `src/constants/categories.ts`
    - 定义 18 个主分类的 slug/en/zh 映射
    - 定义旧分类到新分类的迁移映射
    - _Requirements: 2.1, 5.1_

  - [x] 3.2 实现归一化服务核心逻辑
    - 创建 `src/services/normalizationService.ts`
    - 实现 `determineCategory()` 方法（优先级判定）
    - 实现 `extractTags()` 方法（标签提取）
    - 实现 `normalize()` 方法（完整归一化）
    - _Requirements: 2.2, 2.3, 2.4, 3.1-3.8, 6.1, 6.2, 6.3, 6.5_

  - [ ]* 3.3 编写归一化服务属性测试
    - **Property 3: Category Priority Resolution**
    - **Property 4: Multiple Category Handling**
    - **Property 5: Structured Tag Format Validation**
    - **Property 6: Architecture Signal Detection**
    - **Property 8: Fallback Category Assignment**
    - **Property 10: Raw Data Preservation**
    - **Validates: Requirements 2.2, 2.3, 2.4, 3.1-3.8, 6.1, 6.2, 6.3, 6.5**

- [x] 4. Checkpoint - 验证归一化服务
  - 确保所有测试通过，如有问题请询问用户

- [x] 5. 历史数据迁移
  - [x] 5.1 创建迁移脚本
    - 创建 `scripts/migrate-categories.ts`
    - 实现单条记录迁移逻辑
    - 实现批量迁移逻辑
    - 实现迁移报告生成
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 1.7_

  - [ ]* 5.2 编写迁移脚本属性测试
    - **Property 7: Category Migration Correctness**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**

  - [x] 5.3 执行历史数据迁移
    - 在测试环境执行迁移脚本
    - 验证迁移报告
    - 在生产环境执行迁移脚本
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [x] 6. Checkpoint - 验证数据迁移
  - 确保所有测试通过，如有问题请询问用户

- [x] 7. API 兼容性更新
  - [x] 7.1 更新 publicPlaceController 响应格式
    - 修改 `formatPlaceResponse()` 函数
    - 添加 `category_slug` 和 `category_en` 到响应
    - 确保 `category` 字段向后兼容
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ]* 7.2 编写 API 兼容性属性测试
    - **Property 9: API Backward Compatibility**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**

- [x] 8. 数据导入服务集成
  - [x] 8.1 更新 publicPlaceService 导入逻辑
    - 在 `createPlace()` 中集成归一化服务
    - 在 `updatePlace()` 中集成归一化服务
    - 处理去重约束冲突
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 8.2 更新 googleMapsService 导入逻辑
    - 在导入时调用归一化服务
    - 存储原始 Google types 到 custom_fields.raw
    - _Requirements: 6.1, 6.3_

- [x] 9. Final Checkpoint - 完整集成测试
  - 确保所有测试通过，如有问题请询问用户
  - 验证端到端导入流程
  - 验证 API 响应格式

- [x] 10. 高级分类规则实现
  - [x] 10.1 实现 per-category mapping_priority 配置
    - 添加 `CATEGORY_PRIORITY_OVERRIDES` 配置
    - 修改 `determineCategory()` 使用分类特定优先级
    - castle/yarn_store/thrift_store 使用自定义优先级
    - _Requirements: 2.5_

  - [x] 10.2 实现 primary_rule 排除逻辑
    - 添加 `LANDMARK_EXCLUSION_LIST` 和 `SHOP_EXCLUSION_LIST`
    - 实现 `shouldExcludeCategory()` 函数
    - 修改 `determineCategory()` 应用排除规则
    - _Requirements: 2.6_

  - [x] 10.3 实现 art_gallery/museum 优先级规则
    - 当两者都匹配时，art_gallery 为主分类
    - 自动添加 `alt_category:museum` 标签
    - _Requirements: 2.7_

  - [ ]* 10.4 编写排除规则属性测试
    - **Property 11: Landmark Exclusion Rule**
    - **Property 12: Art Gallery Museum Precedence**
    - **Property 20: Castle Custom Priority**
    - **Validates: Requirements 2.5, 2.6, 2.7**

- [x] 11. Checkpoint - 验证高级分类规则
  - 确保所有测试通过，如有问题请询问用户

- [x] 12. Secondary Tag Rules 实现
  - [x] 12.1 实现条件性标签规则引擎
    - 创建 `SecondaryTagRule` 接口和规则数组
    - 实现 `applySecondaryTagRules()` 函数
    - 集成到 `extractTags()` 方法
    - _Requirements: 3.13_

  - [x] 12.2 实现 lodging:hostel 标签检测
    - 添加 `hasHostelSignals()` 函数
    - 当 hotel 分类检测到 hostel 信号时添加标签
    - _Requirements: 3.11_

  - [x] 12.3 实现 typology 标签支持
    - 确保 church/castle/cemetery 的 default_tags 正确应用
    - 支持 `typology:church`, `typology:castle`, `typology:cemetery`
    - _Requirements: 3.12_

  - [x] 12.4 实现标签证据保存
    - 在 `custom_fields.evidence_<tag>` 保存检测证据
    - 支持 feminism、architecture 等标签的证据记录
    - _Requirements: 3.14_

  - [ ]* 12.5 编写 Secondary Tag Rules 属性测试
    - **Property 18: Secondary Tag Rules Application**
    - **Property 19: Tag Evidence Preservation**
    - **Validates: Requirements 3.11, 3.12, 3.13, 3.14**

- [x] 13. Checkpoint - 验证 Secondary Tag Rules
  - 确保所有测试通过，如有问题请询问用户

- [x] 14. Pritzker Prize 检测实现
  - [x] 14.1 创建 Pritzker 建筑师数据
    - 创建 `src/constants/pritzkerArchitects.ts`
    - 包含所有获奖建筑师及年份
    - _Requirements: 3.9, 3.10_

  - [x] 14.2 实现 Pritzker 标签检测
    - 实现 `detectPritzkerTags()` 函数
    - 集成到 `extractTags()` 方法
    - 添加 `pritzker` 和 `pritzker_year:<YYYY>` 标签
    - _Requirements: 3.9, 3.10_

  - [ ]* 14.3 编写 Pritzker 检测属性测试
    - **Property 13: Pritzker Tag Detection**
    - **Validates: Requirements 3.9, 3.10**

- [x] 15. Checkpoint - 验证 Pritzker 检测
  - 确保所有测试通过，如有问题请询问用户

- [x] 16. 多源数据合并策略实现
  - [x] 16.1 创建 Merge Policy 配置
    - 创建 `src/services/mergePolicyService.ts`
    - 定义 `MERGE_POLICIES` 配置数组
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 16.2 实现 mergeMultiSourceData() 方法
    - 实现 `prefer_google` 策略
    - 实现 `union` 策略（tags/images）
    - 实现 `keep_richer` 策略（description）
    - 实现 `fallback_chain` 策略（coverImage）
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 16.3 实现 OSM opening_hours 保存
    - 当 Google 无 openingHours 但 OSM 有时
    - 保存到 `custom_fields.osm_opening_hours_raw`
    - _Requirements: 8.5_

  - [x] 16.4 集成合并策略到导入服务
    - 修改 `publicPlaceService` 使用合并策略
    - 处理多源数据合并场景
    - _Requirements: 8.6_

  - [ ]* 16.5 编写合并策略属性测试
    - **Property 14: Merge Policy - Google Preference**
    - **Property 15: Merge Policy - Union Arrays**
    - **Property 16: Merge Policy - Richer Description**
    - **Property 17: Merge Policy - Cover Image Fallback**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6**

- [x] 17. Final Checkpoint - 完整 CSV 规则验证
  - 确保所有测试通过，如有问题请询问用户
  - 验证 Categories.csv 所有规则已实现
  - 验证 Tags.csv 所有规则已实现
  - 验证端到端多源导入流程

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- 数据库迁移是最关键的第一步，必须先完成
- 迁移脚本执行前建议备份数据库
- 属性测试使用 `fast-check` 库
- 每个 Checkpoint 都是验证点，确保前序任务正确完成
- 任务 10-17 是新增的高级规则实现，补充 CSV 中定义但未实现的规则
- `mapping_priority` 允许每个分类有自定义的数据源优先级
- `primary_rule` 排除逻辑确保 landmark/shop 不会覆盖更具体的分类
- `secondary_tag_rules` 实现条件性标签添加
- `merge_policy` 确保多源数据正确合并
