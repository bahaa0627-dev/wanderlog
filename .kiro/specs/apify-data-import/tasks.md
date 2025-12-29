# Implementation Plan: Apify Data Import

## Overview

实现 Apify Google Places 数据导入到 Supabase 的完整流程，包括字段映射、数据去重合并、图片存储到 R2、以及分类归一化。

## Tasks

- [x] 1. 创建 Apify 数据类型定义
  - 在 `wanderlog_api/src/types/` 创建 `apify.ts` 类型文件
  - 定义 ApifyPlaceItem 接口（基于 Paris 测试数据结构）
  - 定义 ImportOptions、ImportResult、ImportStats 接口
  - _Requirements: 1.1-1.14_

- [x] 2. 实现 ApifyFieldMapper 字段映射服务
  - [x] 2.1 创建 `wanderlog_api/src/services/apifyFieldMapper.ts`
    - 实现 mapToPlace() 方法，映射所有字段
    - 实现 extractSourceDetails() 提取 Apify 元数据
    - 实现 extractCustomFields() 提取额外字段
    - _Requirements: 1.1-1.14, 5.1-5.7_
  - [x] 2.2 编写字段映射属性测试
    - **Property 1: Field Mapping Correctness**
    - **Validates: Requirements 1.1-1.13**

- [x] 3. 实现 ApifyDataValidator 数据验证服务
  - [x] 3.1 创建 `wanderlog_api/src/services/apifyDataValidator.ts`
    - 实现 validateRequired() 验证必填字段
    - 实现 validateFormat() 验证数据格式
    - _Requirements: 2.8_
  - [x] 3.2 编写必填字段验证属性测试
    - **Property 7: Required Fields Validation**
    - **Validates: Requirements 2.8**

- [x] 4. 实现 PlaceMergeService 去重合并服务
  - [x] 4.1 创建 `wanderlog_api/src/services/placeMergeService.ts`
    - 实现 findExisting() 查找现有记录（按 placeId > fid > cid 优先级）
    - 实现 merge() 合并策略（非空覆盖、取大、取新、追加）
    - 实现 upsert() 执行数据库操作
    - _Requirements: 2.1-2.6_
  - [x] 4.2 编写去重属性测试
    - **Property 2: Deduplication by PlaceId**
    - **Validates: Requirements 2.1, 2.2**
  - [x] 4.3 编写合并策略属性测试
    - **Property 3: Non-Null Overwrite**
    - **Property 4: Take Greater**
    - **Property 5: Take Newer**
    - **Property 6: SearchHits Append**
    - **Validates: Requirements 2.3-2.6**

- [x] 5. 实现 R2ImageService 图片处理服务
  - [x] 5.1 创建 `wanderlog_api/src/services/r2ImageService.ts`
    - 实现 generateR2Key() 生成 UUID 格式的 key
    - 实现 downloadImage() 下载图片（超时 10s，重试 1 次）
    - 实现 processImage() 转换为 JPEG（质量 85，最长边 1600px）
    - 实现 uploadToR2() 上传到 R2
    - 实现 processAndUpload() 完整流程
    - _Requirements: 3.1-3.9_
  - [x] 5.2 编写 R2 Key 格式属性测试
    - **Property 8: R2 Key Format**
    - **Validates: Requirements 3.2, 3.9**
  - [x] 5.3 编写图片 URL 存储属性测试
    - **Property 9: Image URL Storage**
    - **Validates: Requirements 3.5-3.7**

- [x] 6. 集成分类归一化
  - [x] 6.1 扩展现有 NormalizationService 支持 Apify 数据
    - 添加 normalizeFromApify() 方法
    - 实现 categories 数组到 categorySlug 的映射规则
    - _Requirements: 4.1-4.11_
  - [x] 6.2 编写分类归一化属性测试
    - **Property 10: Category Normalization**
    - **Validates: Requirements 4.1-4.9**

- [x] 7. Checkpoint - 确保所有单元测试通过
  - 运行所有属性测试和单元测试
  - 确保测试覆盖率达标
  - 如有问题请询问用户

- [x] 8. 实现 ApifyImportService 主服务
  - [x] 8.1 创建 `wanderlog_api/src/services/apifyImportService.ts`
    - 实现 importFromFile() 从本地 JSON 文件导入
    - 实现 importFromDataset() 从 Apify API 导入
    - 实现 importSinglePlace() 单条导入逻辑
    - 实现批量处理和进度显示
    - _Requirements: 6.1-6.6_
  - [x] 8.2 编写导入统计属性测试
    - **Property 12: Import Statistics Accuracy**
    - **Validates: Requirements 2.7**
  - [x] 8.3 编写元数据完整性属性测试
    - **Property 11: Metadata Completeness**
    - **Validates: Requirements 5.1, 5.2, 5.7**

- [x] 9. 实现导入后校验
  - [x] 9.1 在 ApifyImportService 中添加校验方法
    - 实现 generateReport() 生成导入报告
    - 统计必填字段覆盖率
    - 统计 openingHours 覆盖率
    - 统计封面图可用率
    - _Requirements: 7.1-7.6_

- [x] 10. 创建 CLI 导入脚本
  - [x] 10.1 创建 `wanderlog_api/scripts/import-apify-places.ts`
    - 支持 --file 参数指定本地 JSON 文件
    - 支持 --dataset 参数指定 Apify Dataset ID
    - 支持 --dry-run 模式
    - 支持 --batch-size 参数
    - 支持 --skip-images 参数
    - _Requirements: 6.1-6.6_

- [x] 11. Checkpoint - 集成测试
  - 使用 Paris 测试数据进行端到端测试
  - 验证数据正确导入到 Supabase
  - 验证图片正确上传到 R2
  - 如有问题请询问用户

- [x] 12. Final checkpoint - 确保所有测试通过
  - 运行完整测试套件
  - 确保所有属性测试通过
  - 确保集成测试通过
  - 如有问题请询问用户

## Notes

- All tasks are required for comprehensive testing from the start
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- 使用 fast-check 库进行属性测试
- 图片处理使用 sharp 库
