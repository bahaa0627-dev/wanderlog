# Implementation Plan: AI Intent Recognition

## Overview

在现有 searchV2Controller 基础上扩展意图识别能力，新增三种意图类型的处理流程，保持 general_search 完全兼容。

## Tasks

- [x] 1. 创建意图分类服务
  - [x] 1.1 创建 IntentClassifierService 类型定义
    - 定义 IntentType、IntentResult 接口
    - 定义各种 Response 类型
    - _Requirements: 1.1, 6.1_

  - [x] 1.2 实现 AI 意图分类逻辑
    - 使用 KouriProvider 调用 AI 进行意图分类
    - 实现分类 prompt 模板
    - 解析 AI 返回的 JSON 结果
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 1.3 实现规则回退分类
    - 当 AI 分类失败时使用规则判断
    - 基于关键词和模式匹配
    - _Requirements: 1.7_

  - [x] 1.4 编写意图分类属性测试
    - **Property 1: Intent Classification Validity**
    - **Validates: Requirements 1.1**

- [x] 2. 实现 specific_place 处理流程
  - [x] 2.1 实现具体地点查询处理器
    - 生成 AI 描述
    - 数据库匹配地点
    - 优先选择有图片的匹配
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 2.2 编写 specific_place 属性测试
    - **Property 7: Specific Place Description Length**
    - **Property 8: Specific Place Prioritizes Images**
    - **Validates: Requirements 2.5, 2.6**

- [x] 3. 实现 travel_consultation 处理流程
  - [x] 3.1 实现旅游咨询处理器
    - 生成 Markdown 格式回答
    - 从回答中提取地点名称及其所属城市
    - 在回答末尾可添加引导语如"想了解具体地点推荐吗？"
    - _Requirements: 3.1, 3.2, 3.11_

  - [x] 3.2 实现相关地点匹配（单城市场景）
    - 根据提取的地点名称查询数据库
    - 只返回有 coverImage 的地点
    - 单城市时返回扁平数组 `relatedPlaces`
    - 在回答末尾横滑展示
    - _Requirements: 3.3, 3.4, 3.8_

  - [x] 3.3 实现相关地点匹配（多城市场景）
    - 多城市时按城市分组返回 `cityPlaces`
    - 每个城市的地点在对应城市内容后横滑展示
    - _Requirements: 3.5, 3.8_

  - [x] 3.4 实现地点数量补齐逻辑
    - 每个城市至少展示 3 个地点
    - 如果 AI 推荐匹配不足 3 个，从数据库补齐
    - 补齐时按评分和评论数排序
    - _Requirements: 3.6, 3.7_

  - [x] 3.5 编写 travel_consultation 属性测试
    - **Property 3: Related Places Have Cover Images**
    - **Property 4: Related Places Minimum Count**
    - **Property 9: Single vs Multi-City Response Structure**
    - **Validates: Requirements 3.4, 3.6, 3.7, 3.8**

- [x] 4. 实现 non_travel 处理流程
  - [x] 4.1 实现非旅游内容处理器
    - 生成 Markdown 格式回答
    - 不进行数据库查询
    - _Requirements: 4.1, 4.3_

  - [x] 4.2 编写 non_travel 属性测试
    - **Property 5: Non-Travel Has No Places**
    - **Validates: Requirements 4.1, 4.3**

- [x] 5. 集成到 searchV2Controller
  - [x] 5.1 修改 searchV2Controller 主入口
    - 在处理开始时调用意图分类
    - 根据意图类型分发到不同处理器
    - 保持 general_search 现有流程不变
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 5.2 统一响应格式
    - 所有响应包含 intent 字段
    - 各意图类型返回对应结构
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 5.3 编写响应结构属性测试
    - **Property 2: Response Structure by Intent**
    - **Property 6: General Search Backward Compatibility**
    - **Validates: Requirements 5.1, 5.2, 6.1-6.5**

- [x] 6. Checkpoint - 确保所有测试通过
  - 运行所有属性测试
  - 验证现有 general_search 功能不受影响
  - 如有问题请询问用户

## Notes

- 任务标记 `*` 为可选测试任务
- 每个属性测试引用设计文档中的属性编号
- 保持现有 general_search 流程完全不变是最高优先级
- 使用 fast-check 进行属性测试，最少 100 次迭代
