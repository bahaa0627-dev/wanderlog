# Requirements Document

## Introduction

本功能用于从 mocation.cc 网站爬取地点信息（place_detail 和 movie_detail 页面），提取图片、地址、地点名称等数据，并导入到现有的 Supabase 数据库中。

## Glossary

- **Mocation_Scraper**: 负责爬取 mocation.cc 网站页面的 TypeScript 脚本
- **Place_Detail_Page**: mocation.cc 的地点详情页面（如 /html/place_detail.html?id=17103）
- **Movie_Detail_Page**: mocation.cc 的电影详情页面（如 /html/movie_detail.html?id=5380）
- **Puppeteer**: Node.js 无头浏览器库，用于渲染动态页面
- **Place_Data**: 从页面提取的地点数据结构

## Requirements

### Requirement 1: 页面爬取

**User Story:** 作为开发者，我想爬取 mocation.cc 的地点详情页面，以便获取地点信息。

#### Acceptance Criteria

1. WHEN 提供一个 place_detail 页面 URL THEN Mocation_Scraper SHALL 使用 Puppeteer 加载并渲染该页面
2. WHEN 提供一个 movie_detail 页面 URL THEN Mocation_Scraper SHALL 使用 Puppeteer 加载并渲染该页面
3. WHEN 页面加载超时（超过 30 秒）THEN Mocation_Scraper SHALL 记录错误并跳过该页面
4. IF 页面返回 404 或其他错误状态 THEN Mocation_Scraper SHALL 记录错误并继续处理下一个页面

### Requirement 2: 数据提取

**User Story:** 作为开发者，我想从页面中提取地点的关键信息，以便存储到数据库。

#### Acceptance Criteria

1. WHEN 页面加载完成 THEN Mocation_Scraper SHALL 提取地点名称（中文和英文）
2. WHEN 页面加载完成 THEN Mocation_Scraper SHALL 提取地点地址
3. WHEN 页面加载完成 THEN Mocation_Scraper SHALL 提取地点图片 URL 列表
4. WHEN 页面加载完成 THEN Mocation_Scraper SHALL 提取地点描述信息
5. WHEN 页面加载完成 THEN Mocation_Scraper SHALL 提取地点坐标（如果有）
6. WHEN 页面包含关联电影信息 THEN Mocation_Scraper SHALL 提取电影名称作为标签
7. IF 某个字段不存在 THEN Mocation_Scraper SHALL 将该字段设为 null 并继续处理

### Requirement 3: 批量爬取

**User Story:** 作为开发者，我想批量爬取多个页面，以便高效获取大量数据。

#### Acceptance Criteria

1. WHEN 提供 ID 范围（如 1-200）THEN Mocation_Scraper SHALL 依次爬取该范围内的所有页面
2. WHEN 批量爬取时 THEN Mocation_Scraper SHALL 在每个请求之间添加延迟（默认 2 秒）以避免被封禁
3. WHEN 批量爬取时 THEN Mocation_Scraper SHALL 显示进度信息（已完成/总数）
4. WHEN 爬取完成 THEN Mocation_Scraper SHALL 输出统计报告（成功数、失败数、跳过数）

### Requirement 4: 数据存储

**User Story:** 作为开发者，我想将爬取的数据保存到文件和数据库，以便后续使用。

#### Acceptance Criteria

1. WHEN 爬取完成 THEN Mocation_Scraper SHALL 将原始数据保存为 JSON 文件
2. WHEN 提供 --import 参数 THEN Mocation_Scraper SHALL 将数据导入到 Supabase places 表
3. WHEN 导入数据时 THEN Mocation_Scraper SHALL 检查是否存在重复（基于名称和地址）
4. IF 发现重复数据 THEN Mocation_Scraper SHALL 跳过该记录并记录日志

### Requirement 5: 图片处理

**User Story:** 作为开发者，我想下载并存储地点图片，以便在应用中显示。

#### Acceptance Criteria

1. WHEN 提取到图片 URL THEN Mocation_Scraper SHALL 下载图片到本地
2. WHEN 下载图片成功 THEN Mocation_Scraper SHALL 上传图片到 R2 存储
3. WHEN 上传成功 THEN Mocation_Scraper SHALL 更新数据库中的图片 URL
4. IF 图片下载失败 THEN Mocation_Scraper SHALL 保留原始 URL 并记录警告

### Requirement 6: CLI 接口

**User Story:** 作为开发者，我想通过命令行参数控制爬虫行为，以便灵活使用。

#### Acceptance Criteria

1. THE Mocation_Scraper SHALL 支持 --type 参数指定页面类型（place 或 movie）
2. THE Mocation_Scraper SHALL 支持 --start 和 --end 参数指定 ID 范围
3. THE Mocation_Scraper SHALL 支持 --output 参数指定输出文件路径
4. THE Mocation_Scraper SHALL 支持 --delay 参数指定请求间隔（毫秒）
5. THE Mocation_Scraper SHALL 支持 --dry-run 参数仅爬取不导入
6. THE Mocation_Scraper SHALL 支持 --import 参数直接导入到数据库
7. THE Mocation_Scraper SHALL 支持 --help 参数显示帮助信息
