# Implementation Plan: Wikidata Data Quality Fix

## Overview

实现数据质量修复脚本，包括 QID 名称修复、分类重新检测、名称英文化。复用现有的 wikidataImportUtils.ts 中的工具函数。

## Tasks

- [x] 1. 实现检测工具函数
  - [x] 1.1 实现 isQIDName 函数
    - 检测名称是否为 Q + 数字格式
    - 返回 boolean
    - _Requirements: 1.1_
  - [x]* 1.2 编写 QID 名称检测属性测试
    - **Property 1: QID Name Detection**
    - **Validates: Requirements 1.1**
  - [x] 1.3 实现 hasNonAsciiCharacters 函数
    - 检测名称是否包含非 ASCII 字符
    - 返回 boolean
    - _Requirements: 3.1_
  - [x]* 1.4 编写非 ASCII 检测属性测试
    - **Property 3: Non-ASCII Name Detection**
    - **Validates: Requirements 3.1**

- [x] 2. 实现 Wikidata 标签获取
  - [x] 2.1 实现 WikidataLabelFetcher 类
    - fetchLabels: 获取实体的所有语言标签
    - selectBestLabel: 选择最佳标签（英文优先）
    - 复用现有的 RateLimiter 和 RetryHandler
    - _Requirements: 1.2, 1.3, 1.4, 3.2, 3.3, 3.6_
  - [x]* 2.2 编写标签选择属性测试
    - **Property 4: Label Selection Priority**
    - **Validates: Requirements 1.4, 3.6**

- [x] 3. 实现数据保存工具
  - [x] 3.1 实现 preserveOriginalData 函数
    - 保存原始名称到 customFields.originalName
    - 保存原始分类到 customFields.originalCategory
    - 添加 lastFixedAt 时间戳
    - 添加 fixType 数组
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [x]* 3.2 编写数据保存属性测试
    - **Property 5: Original Data Preservation Invariant**
    - **Property 6: Fix Type Recording**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**

- [x] 4. Checkpoint - 确保工具函数测试通过
  - 运行所有属性测试
  - 确保检测和保存逻辑正确
  - 如有问题请询问用户

- [x] 5. 实现分类检测增强
  - [x] 5.1 扩展 detectCategoryFromName 函数
    - 添加更多关键词支持（cafe, restaurant, bar 等）
    - 支持多语言关键词（法语、德语、意大利语、日语）
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_
  - [x]* 5.2 编写分类检测属性测试
    - **Property 2: Category Detection from Name Keywords**
    - **Validates: Requirements 2.2-2.8**
  - [x] 5.3 确保分类字段一致性
    - 更新 categorySlug, categoryEn, categoryZh 三个字段
    - _Requirements: 2.9_
  - [x]* 5.4 编写分类字段一致性属性测试
    - **Property 7: Category Fields Consistency**
    - **Validates: Requirements 2.9**

- [x] 6. 实现主修复脚本
  - [x] 6.1 创建 fix-data-quality.ts CLI 脚本
    - 解析命令行参数 (--dry-run, --limit, --fix-type)
    - --fix-type 支持: qid-names, categories, translations, all
    - _Requirements: 4.1, 4.6_
  - [x] 6.2 实现 QID 名称修复流程
    - 扫描 name 为 Q+数字 的记录
    - 调用 WikidataLabelFetcher 获取真实名称
    - 保存原始数据并更新
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6_
  - [x] 6.3 实现分类修复流程
    - 扫描 category_slug 为 landmark 或 architecture 的记录
    - 调用 detectCategoryFromName 检测正确分类
    - 保存原始数据并更新
    - _Requirements: 2.1, 2.9_
  - [x] 6.4 实现名称翻译流程
    - 扫描包含非 ASCII 字符的名称
    - 调用 WikidataLabelFetcher 获取英文名称
    - 保存原始数据并更新
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 7. 实现批量处理和报告
  - [x] 7.1 实现批量更新逻辑
    - 每批 50 条记录
    - 实现速率限制 (10 req/s)
    - _Requirements: 4.2, 4.3_
  - [x] 7.2 实现进度日志
    - 每 100 条记录输出进度
    - _Requirements: 4.5_
  - [x] 7.3 实现报告生成
    - 统计：总扫描、QID修复、分类修改、翻译、错误
    - 输出详细报告
    - _Requirements: 4.4_

- [x] 8. 实现错误处理
  - [x] 8.1 复用 RetryHandler
    - 指数退避重试 (1s, 2s, 4s)
    - 最多重试 3 次
    - _Requirements: 5.1_
  - [x] 8.2 实现错误收集
    - 跳过无 sourceDetail 的记录
    - 收集所有错误到报告
    - _Requirements: 5.2, 5.3, 5.4_

- [x] 9. Final Checkpoint - 完整测试
  - 运行所有属性测试
  - 执行 dry-run 验证
  - 确认所有功能正常
  - 如有问题请询问用户

## Notes

- Tasks marked with `*` are optional property-based tests
- 复用现有的 wikidataImportUtils.ts 中的工具函数
- 使用 fast-check 库进行属性测试
- 所有修改前保存原始数据到 customFields
