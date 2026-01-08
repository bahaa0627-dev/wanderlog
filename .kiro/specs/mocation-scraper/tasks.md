# Implementation Plan: Mocation Scraper

## Overview

实现 mocation.cc 网站爬虫，使用 Puppeteer 爬取 movie_detail 和 place_detail 页面，提取地点信息并导入数据库。

## Tasks

- [x] 1. 项目设置和依赖安装
  - 安装 Puppeteer 和相关依赖
  - 创建脚本文件 `scripts/scrape-mocation.ts`
  - 配置 TypeScript 类型定义
  - _Requirements: 1.1, 1.2_

- [x] 2. 实现数据类型定义
  - [x] 2.1 创建 `src/types/mocation.ts` 类型文件
    - 定义 ScrapedMoviePlace 接口
    - 定义 ScrapedPlaceDetail 接口
    - 定义 ScrapeResult 接口
    - _Requirements: 2.1-2.7_

- [x] 3. 实现 MocationScraper 核心类
  - [x] 3.1 实现浏览器初始化和关闭
    - 创建 Puppeteer 浏览器实例
    - 配置无头模式和超时设置
    - _Requirements: 1.1, 1.2_
  
  - [x] 3.2 实现 Movie Detail 页面数据提取
    - 使用 CSS 选择器提取剧名 (div.h11.alic)
    - 提取地点名 (div.fs16.pb5)
    - 提取城市/国家 (div.fs12.pb5)
    - 提取剧情说明 (div.fs12.c88)
    - 提取剧照 (img[alt="剧照"])
    - _Requirements: 2.1-2.6_
  
  - [x] 3.3 实现 Place Detail 页面数据提取
    - 使用 CSS 选择器提取地点名 (div.fs21.mb5)
    - 提取封面图 (img.mb20.img100[alt="封面"])
    - 提取地址 (div.fs12.mb20)
    - 提取剧照 (img[alt="剧照"], 最多5张)
    - _Requirements: 2.1-2.5_

- [ ]* 3.4 编写数据提取单元测试
  - 测试 Movie Detail 提取函数
  - 测试 Place Detail 提取函数
  - _Requirements: 2.1-2.6_

- [x] 4. 实现批量爬取功能
  - [x] 4.1 实现 scrapeRange 方法
    - 支持 ID 范围爬取
    - 添加请求间隔延迟（默认 2 秒）
    - 显示进度信息
    - _Requirements: 3.1-3.3_
  
  - [x] 4.2 实现错误处理和重试逻辑
    - 处理页面加载超时
    - 处理 404 错误
    - 记录失败的页面 ID
    - _Requirements: 1.3, 1.4_

- [ ]* 4.3 编写批量处理属性测试
  - **Property 2: 批量处理完整性**
  - **Validates: Requirements 3.1, 3.4**

- [x] 5. 实现数据存储功能
  - [x] 5.1 实现 JSON 文件保存
    - 将爬取结果保存为 JSON 文件
    - 支持自定义输出路径
    - _Requirements: 4.1_
  
  - [x] 5.2 实现数据库导入
    - 转换数据格式为 places 表结构
    - 检查重复数据（基于名称和地址）
    - 插入新数据到 Supabase
    - _Requirements: 4.2, 4.3, 4.4_

- [ ]* 5.3 编写重复检测属性测试
  - **Property 3: 重复检测一致性**
  - **Validates: Requirements 4.3**

- [x] 6. 实现图片处理功能（可选）
  - [x] 6.1 实现图片下载
    - 下载图片到本地临时目录
    - 处理下载失败情况
    - _Requirements: 5.1, 5.4_
  
  - [x] 6.2 实现 R2 上传
    - 上传图片到 Cloudflare R2
    - 更新图片 URL
    - _Requirements: 5.2, 5.3_

- [x] 7. 实现 CLI 接口
  - [x] 7.1 实现参数解析
    - --type: 页面类型 (movie/place)
    - --start/--end: ID 范围
    - --output: 输出文件路径
    - --delay: 请求间隔
    - --dry-run: 仅爬取不导入
    - --import: 直接导入数据库
    - --help: 显示帮助
    - _Requirements: 6.1-6.7_
  
  - [x] 7.2 实现帮助信息和使用示例
    - 显示所有可用参数
    - 提供使用示例
    - _Requirements: 6.7_

- [x] 8. Checkpoint - 确保所有测试通过
  - 运行所有单元测试
  - 运行属性测试
  - 如有问题请询问用户

- [x] 9. 集成测试和文档
  - [x] 9.1 端到端测试
    - 爬取少量真实页面验证
    - 验证数据完整性
    - _Requirements: 1.1-4.4_
  
  - [x] 9.2 创建使用文档
    - 编写 MOCATION_SCRAPER_GUIDE.md
    - 包含安装、配置、使用示例
    - _Requirements: 6.1-6.7_

## Notes

- 任务标记 `*` 的是可选测试任务，可以跳过以加快 MVP 开发
- 图片处理功能（任务 6）可以在后续迭代中实现
- 建议先用 --dry-run 模式测试，确认数据正确后再导入数据库
- 请求间隔默认 2 秒，避免对目标网站造成压力
