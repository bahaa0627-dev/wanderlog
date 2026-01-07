# Implementation Plan: Pritzker Architecture Import

## Overview

实现普利兹克奖建筑作品导入脚本，从 Wikidata JSON 文件导入到 Place 数据库，支持去重、分类、标签生成和可选的 AI 数据增强。

## Tasks

- [x] 1. 创建核心数据类型和常量
  - [x] 1.1 创建 TypeScript 接口定义文件
    - 定义 WikidataArchitectureEntry, DeduplicatedBuilding, PlaceImportData, ImportReport 接口
    - _Requirements: 1.1, 3.1_
  - [x] 1.2 创建分类关键词映射常量
    - 定义 CATEGORY_RULES 数组和 DEFAULT_CATEGORY
    - _Requirements: 4.1, 4.2_

- [x] 2. 实现核心解析函数
  - [x] 2.1 实现 parseCoordinates 函数
    - 解析 "Point(lng lat)" 格式为 {latitude, longitude}
    - _Requirements: 1.2_
  - [x] 2.2 编写 parseCoordinates 属性测试
    - **Property 1: Coordinate Parsing Round Trip**
    - **Validates: Requirements 1.2**
  - [x] 2.3 实现 extractWikidataQID 函数
    - 从 Wikidata URL 提取 QID
    - _Requirements: 1.3_
  - [x] 2.4 编写 extractWikidataQID 属性测试
    - **Property 2: Wikidata QID Extraction**
    - **Validates: Requirements 1.3**
  - [x] 2.5 实现 formatArchitectTag 函数
    - 移除空格和特殊字符，生成标签格式
    - _Requirements: 5.2_
  - [x] 2.6 编写 formatArchitectTag 属性测试
    - **Property 5: Architect Tag Formatting**
    - **Validates: Requirements 5.2**

- [x] 3. Checkpoint - 确保核心函数测试通过
  - 运行所有测试，确认解析函数正确
  - 如有问题请询问用户

- [x] 4. 实现去重和城市选择逻辑
  - [x] 4.1 实现 selectBestCity 函数
    - 优先选择不含 arrondissement/District 的城市名
    - _Requirements: 2.2_
  - [x] 4.2 编写 selectBestCity 属性测试
    - **Property 4: City Selection Preference**
    - **Validates: Requirements 2.2**
  - [x] 4.3 实现 deduplicateEntries 函数
    - 按 Wikidata QID 分组，合并重复条目
    - 收集所有城市名和图片
    - _Requirements: 2.1, 2.2, 7.3_
  - [x] 4.4 编写去重属性测试
    - **Property 3: Deduplication by QID**
    - **Validates: Requirements 2.1, 2.2**

- [x] 5. 实现分类和标签生成
  - [x] 5.1 实现 classifyCategory 函数
    - 根据作品名称关键词确定分类
    - _Requirements: 4.1, 4.2_
  - [x] 5.2 编写分类属性测试
    - **Property 10: Category Classification Consistency**
    - **Validates: Requirements 4.1**
  - [x] 5.3 实现 generateTags 函数
    - 生成 award, style, architect 标签结构
    - _Requirements: 5.1, 5.3, 5.4_
  - [ ] 5.4 编写标签结构属性测试
    - **Property 6: Tag Structure Completeness**
    - **Validates: Requirements 5.1, 5.4**
  - [x] 5.5 实现 generateAiTags 函数
    - 生成带优先级的 aiTags 数组
    - _Requirements: 6.1, 6.2_
  - [ ]* 5.6 编写 AI 标签优先级属性测试
    - **Property 7: AI Tags Priority Ordering**
    - **Validates: Requirements 6.1, 6.2**

- [x] 6. Checkpoint - 确保分类和标签测试通过
  - 运行所有测试，确认分类和标签逻辑正确
  - 如有问题请询问用户

- [x] 7. 实现图片处理
  - [x] 7.1 实现 convertWikimediaUrl 函数
    - 将 http:// 转换为 https://
    - _Requirements: 7.1_
  - [ ]* 7.2 编写 URL 转换属性测试
    - **Property 8: Image URL HTTPS Conversion**
    - **Validates: Requirements 7.1**
  - [x] 7.3 实现 collectUniqueImages 函数
    - 收集并去重图片 URL
    - _Requirements: 7.2, 7.3_
  - [ ]* 7.4 编写图片去重属性测试
    - **Property 9: Image Collection Uniqueness**
    - **Validates: Requirements 7.3**

- [x] 8. 实现数据库操作
  - [x] 8.1 实现 mapToPlaceData 函数
    - 将 DeduplicatedBuilding 转换为 PlaceImportData
    - _Requirements: 3.1, 3.2, 3.3_
  - [x] 8.2 实现 upsertPlace 函数
    - 根据 sourceDetail 查找并更新或创建记录
    - _Requirements: 2.3_
  - [x] 8.3 实现 validateEntry 函数
    - 验证必填字段，返回错误列表
    - _Requirements: 1.4_

- [x] 9. 实现导入报告
  - [x] 9.1 实现 ImportReportGenerator 类
    - 跟踪导入统计：新建、更新、跳过、需审核
    - _Requirements: 8.1_
  - [x] 9.2 实现报告保存功能
    - 保存为带时间戳的 JSON 文件
    - _Requirements: 8.2_
  - [ ]* 9.3 编写报告计数属性测试
    - **Property 11: Report Counts Accuracy**
    - **Validates: Requirements 2.4, 8.1**

- [x] 10. 实现主导入脚本
  - [x] 10.1 创建 import-pritzker-architecture.ts 脚本
    - 读取 JSON 文件
    - 执行完整导入流程
    - 生成并保存报告
    - _Requirements: 1.1, 8.1, 8.2_
  - [x] 10.2 添加命令行参数支持
    - --dry-run: 只验证不写入数据库
    - --file: 指定输入文件路径
    - --enrich: 启用 AI 增强
    - _Requirements: 9.1_

- [x] 11. Checkpoint - 基础导入功能测试
  - 使用测试数据运行导入脚本
  - 验证数据库记录正确
  - 如有问题请询问用户

- [x] 12. 实现 AI 数据增强（可选）
  - [x] 12.1 实现 fetchWikidataDetails 函数
    - 从 Wikidata API 获取额外属性
    - _Requirements: 9.2_
  - [x] 12.2 实现 enrichBuildingWithAI 函数
    - 使用 OpenAI 生成建筑描述
    - _Requirements: 9.3_
  - [x] 12.3 添加速率限制和错误处理
    - 限制 API 调用频率
    - 失败时继续基础导入
    - _Requirements: 9.4, 9.5_

- [x] 13. Final Checkpoint - 完整功能测试
  - 运行完整导入流程
  - 验证所有功能正常
  - 确保所有测试通过
  - 如有问题请询问用户

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- AI enrichment (Task 12) is optional and can be implemented later
