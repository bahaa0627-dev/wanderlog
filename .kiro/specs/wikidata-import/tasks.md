# Implementation Plan: Wikidata Import

## Overview

实现从 Wikidata 导入建筑和墓地数据的脚本，包括 JSON 解析、全局去重、图片获取和批量数据库插入。

## Tasks

- [x] 1. 创建核心解析工具函数
  - [x] 1.1 实现 CoordParser 坐标解析函数
    - 解析 "Point(longitude latitude)" 格式
    - 返回 { latitude, longitude } 对象
    - 处理无效格式返回 null
    - _Requirements: 1.3, 7.4, 7.5_
  - [x] 1.2 编写 CoordParser 属性测试
    - **Property 1: Coordinate Parsing Round-Trip**
    - **Validates: Requirements 1.3, 7.4, 7.5**
  - [x] 1.3 实现 QIDExtractor 函数
    - 从 Wikidata URL 提取 Q 号
    - 支持 http 和 https 协议
    - 无效 URL 返回 null
    - _Requirements: 1.4_
  - [x] 1.4 编写 QIDExtractor 属性测试
    - **Property 2: QID Extraction Correctness**
    - **Validates: Requirements 1.4**

- [x] 2. 实现数据解析器
  - [x] 2.1 创建 WikidataImportTypes 类型定义文件
    - 定义 ArchitectureEntry, CemeteryEntry 接口
    - 定义 ParsedArchitecture, ParsedCemetery 接口
    - 定义 MergedRecord, PlaceImportData 接口
    - _Requirements: 1.1, 1.2_
  - [x] 2.2 实现 ArchitectureParser
    - 解析建筑 JSON 条目
    - 提取所有字段并转换类型
    - 收集建筑师和风格信息
    - _Requirements: 1.1_
  - [x] 2.3 实现 CemeteryParser
    - 解析墓地 JSON 条目
    - 提取名人数量字段
    - 转换字符串数字为数值
    - _Requirements: 1.2_

- [x] 3. 实现全局去重系统
  - [x] 3.1 实现 GlobalQIDRegistry 类
    - 维护已处理 QID 的 Map
    - 实现 register 方法检测重复
    - 实现 merge 方法合并重复记录
    - 记录来源文件名
    - _Requirements: 2.1, 2.2, 2.3_
  - [x] 3.2 编写去重属性测试
    - **Property 3: Global Deduplication Invariant**
    - **Validates: Requirements 2.1, 2.2**
  - [x] 3.3 编写合并属性测试
    - **Property 4: Record Merging Completeness**
    - **Validates: Requirements 2.3**

- [x] 4. 实现分类和标签系统
  - [x] 4.1 实现 CategoryAssigner 函数
    - 根据数据类型返回正确分类
    - architecture → category_slug: "architecture"
    - cemetery → category_slug: "cemetery"
    - _Requirements: 3.1, 4.1_
  - [x] 4.2 编写分类属性测试
    - **Property 5: Category Assignment Correctness**
    - **Validates: Requirements 3.1, 4.1**
  - [x] 4.3 实现 TagsBuilder 类
    - buildArchitectureTags: 构建 style 和 architect 标签
    - buildCemeteryTags: 构建 theme 标签
    - shouldAddStyleTag: 判断是否从文件名添加 style
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 4.2-4.7_
  - [x] 4.4 编写 Style Tag 属性测试
    - **Property 6: Style Tag Conditional Assignment**
    - **Validates: Requirements 3.2, 3.3**
  - [x] 4.5 编写 Theme Tag 属性测试
    - **Property 7: Cemetery Theme Tag Generation**
    - **Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.6**

- [x] 5. Checkpoint - 确保核心逻辑测试通过
  - 运行所有属性测试
  - 确保解析和标签逻辑正确
  - 如有问题请询问用户

- [x] 6. 实现 Wikidata 图片获取
  - [x] 6.1 实现 WikidataImageFetcher 类
    - fetchImages: 主方法，获取并合并图片
    - fetchFromWikidataAPI: 调用 Wikidata API
    - filterBannerImages: 过滤 banner 图片
    - 实现速率限制 (10 req/s)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  - [x] 6.2 编写图片获取属性测试
    - **Property 8: Image Collection Preservation**
    - **Property 9: Cover Image Selection**
    - **Validates: Requirements 5.2, 5.3, 5.4, 5.5**

- [x] 7. 实现数据映射和持久化
  - [x] 7.1 实现 PlaceMapper 函数
    - 将 MergedRecord 映射到 PlaceImportData
    - 设置 source, sourceDetail, isVerified
    - 构建 customFields 保存所有额外数据
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.2, 7.3, 7.6_
  - [x] 7.2 编写映射属性测试
    - **Property 10: Source Metadata Completeness**
    - **Property 11: Custom Fields Preservation**
    - **Property 12: Field Mapping Correctness**
    - **Validates: Requirements 6.1-6.5, 7.1-7.3**
  - [x] 7.3 实现 BatchInserter 类
    - insertBatch: 批量插入，每批 50 条
    - upsertPlace: 单条 upsert 逻辑
    - 基于 sourceDetail (QID) 去重
    - _Requirements: 9.1_
  - [x] 7.4 编写批量插入属性测试
    - **Property 14: Batch Processing Size**
    - **Validates: Requirements 9.1**

- [x] 8. 实现错误处理和重试机制
  - [x] 8.1 实现 RetryHandler 工具
    - 指数退避重试 (1s, 2s, 4s)
    - 最多重试 3 次
    - 记录重试日志
    - _Requirements: 8.2_
  - [x] 8.2 编写重试属性测试
    - **Property 13: Retry Behavior on API Failure**
    - **Validates: Requirements 8.2**

- [x] 9. 实现主导入脚本
  - [x] 9.1 创建 import-wikidata-places.ts CLI 脚本
    - 解析命令行参数 (--dry-run, --limit, --skip-images)
    - 扫描两个文件夹的所有 JSON 文件
    - 按顺序处理：architecture1/2 → style files → cemetery files
    - _Requirements: 8.1, 8.3, 8.4, 8.5_
  - [x] 9.2 实现文件处理流程
    - 读取并解析 JSON 文件
    - 调用对应的 Parser
    - 注册到 GlobalQIDRegistry
    - 处理解析错误并继续
    - _Requirements: 8.1_
  - [x] 9.3 实现导入流程
    - 遍历去重后的记录
    - 获取 Wikidata 图片
    - 构建标签和分类
    - 映射并批量插入
    - 每 100 条记录输出进度
    - _Requirements: 8.5, 9.2_
  - [x] 9.4 实现报告生成
    - 统计：总数、成功、跳过、错误
    - 输出 JSON 报告文件
    - 打印摘要到控制台
    - _Requirements: 8.4_

- [x] 10. Checkpoint - 集成测试
  - 使用小样本数据测试完整流程
  - 验证数据库记录正确性
  - 确保报告生成正确
  - 如有问题请询问用户

- [x] 11. 实现可恢复导入功能
  - [x] 11.1 添加进度跟踪
    - 保存已处理 QID 到文件
    - 支持 --resume 参数
    - 跳过已处理的 QID
    - _Requirements: 9.3_

- [x] 12. Final Checkpoint - 完整测试
  - 运行所有属性测试
  - 执行 dry-run 验证
  - 确认所有功能正常
  - 如有问题请询问用户

## Notes

- All tasks including property-based tests are required
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- 使用 fast-check 库进行属性测试
- 复用现有的 pritzkerParserService 中的部分逻辑
