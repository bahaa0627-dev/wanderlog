# Design Document: Mocation Scraper

## Overview

本设计文档描述了 mocation.cc 网站爬虫的技术实现方案。该爬虫使用 Puppeteer 无头浏览器来渲染动态页面，提取地点信息（名称、地址、图片、描述、坐标等），并支持批量爬取和数据导入。

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLI Interface                                │
│  (scrape-mocation.ts)                                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐    ┌─────────────────┐    ┌──────────────┐ │
│  │  Page Scraper   │───▶│  Data Extractor │───▶│ Data Storage │ │
│  │  (Puppeteer)    │    │                 │    │              │ │
│  └─────────────────┘    └─────────────────┘    └──────────────┘ │
│          │                      │                     │         │
│          ▼                      ▼                     ▼         │
│  ┌─────────────────┐    ┌─────────────────┐    ┌──────────────┐ │
│  │ Rate Limiter    │    │ Image Downloader│    │ JSON File    │ │
│  │ (delay between  │    │ (download &     │    │ Supabase DB  │ │
│  │  requests)      │    │  upload to R2)  │    │              │ │
│  └─────────────────┘    └─────────────────┘    └──────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. MocationScraper 类

主要的爬虫类，负责页面加载和数据提取。

```typescript
interface MocationScraperOptions {
  headless?: boolean;      // 是否使用无头模式，默认 true
  timeout?: number;        // 页面加载超时时间（毫秒），默认 30000
  delay?: number;          // 请求间隔（毫秒），默认 2000
}

// Movie Detail 页面数据
interface ScrapedMoviePlace {
  sourceId: string;              // 原始页面 ID
  sourceType: 'movie';           // 页面类型
  sourceUrl: string;             // 原始 URL
  movieName: string | null;      // 剧名 (div.h11.alic)
  placeName: string | null;      // 地点名 (div.fs16.pb5)
  cityCountry: string | null;    // 城市，国家 (div.fs12.pb5)
  sceneDescription: string | null; // 剧情地点说明 (div.fs12.c88)
  images: string[];              // 剧照 (img[alt="剧照"])
  placeCount: number | null;     // 地点数量 (.fs36.mocation-num)
  scrapedAt: string;             // 爬取时间
}

// Place Detail 页面数据
interface ScrapedPlaceDetail {
  sourceId: string;              // 原始页面 ID
  sourceType: 'place';           // 页面类型
  sourceUrl: string;             // 原始 URL
  placeName: string | null;      // 地点名 (div.fs21.mb5)
  coverImage: string | null;     // 封面图 (img.mb20.img100[alt="封面"])
  address: string | null;        // 地址 (div.fs12.mb20)
  phone: string | null;          // 电话
  images: string[];              // 剧照 (img[alt="剧照"], 最多5张)
  scrapedAt: string;             // 爬取时间
}

// 统一类型
type ScrapedData = ScrapedMoviePlace | ScrapedPlaceDetail;

class MocationScraper {
  constructor(options?: MocationScraperOptions);
  
  // 初始化浏览器
  async init(): Promise<void>;
  
  // 关闭浏览器
  async close(): Promise<void>;
  
  // 爬取单个页面
  async scrapePage(url: string): Promise<ScrapedPlace | null>;
  
  // 批量爬取
  async scrapeRange(
    type: 'place' | 'movie',
    startId: number,
    endId: number,
    onProgress?: (current: number, total: number) => void
  ): Promise<ScrapeResult>;
}
```

### 2. DataExtractor 模块

从页面 DOM 中提取数据的工具函数。

```typescript
// Movie Detail 页面提取函数
function extractMovieData(): Partial<ScrapedMoviePlace> {
  return {
    movieName: document.querySelector('div.h11.alic')?.textContent?.trim() || null,
    placeName: document.querySelector('div.fs16.pb5')?.textContent?.trim() || null,
    cityCountry: document.querySelector('div.fs12.pb5[style*="margin-top"]')?.textContent?.trim() || null,
    sceneDescription: document.querySelector('div.fs12.c88')?.textContent?.trim() || null,
    images: Array.from(document.querySelectorAll('img[alt="剧照"]'))
      .map(img => img.getAttribute('src'))
      .filter(Boolean) as string[],
    placeCount: parseInt(document.querySelector('.fs36.mocation-num')?.textContent || '0', 10) || null,
  };
}

// Place Detail 页面提取函数
function extractPlaceData(): Partial<ScrapedPlaceDetail> {
  const allImages = Array.from(document.querySelectorAll('img[alt="剧照"]'))
    .map(img => img.getAttribute('src'))
    .filter(Boolean) as string[];
  
  return {
    placeName: document.querySelector('div.fs21.mb5')?.textContent?.trim() || null,
    coverImage: document.querySelector('img.mb20.img100[alt="封面"]')?.getAttribute('src') || null,
    address: document.querySelector('div.fs12.mb20')?.textContent?.trim() || null,
    phone: null, // 需要根据实际页面结构确定选择器
    images: allImages.slice(0, 5), // 最多5张剧照
  };
}
```

### 3. ImageHandler 类

处理图片下载和上传。

```typescript
interface ImageHandlerOptions {
  downloadDir?: string;    // 本地下载目录
  uploadToR2?: boolean;    // 是否上传到 R2
}

class ImageHandler {
  constructor(options?: ImageHandlerOptions);
  
  // 下载图片
  async downloadImage(url: string): Promise<string | null>;
  
  // 上传到 R2
  async uploadToR2(localPath: string): Promise<string | null>;
  
  // 处理图片列表
  async processImages(urls: string[]): Promise<string[]>;
}
```

### 4. MocationImporter 类

将爬取的数据导入到数据库。

```typescript
interface ImportResult {
  total: number;
  imported: number;
  skipped: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}

class MocationImporter {
  // 检查是否重复
  async isDuplicate(place: ScrapedPlace): Promise<boolean>;
  
  // 导入单条数据
  async importPlace(place: ScrapedPlace): Promise<boolean>;
  
  // 批量导入
  async importAll(places: ScrapedPlace[]): Promise<ImportResult>;
}
```

## Data Models

### 输入数据（从页面提取）

#### Movie Detail 页面 (movie_detail.html)

| CSS 选择器 | 含义 | 对应字段 |
|-----------|------|---------|
| `div.h11.alic` | 剧名 | movieName |
| `div.fs16.pb5` | 地点名 | placeName |
| `div.fs12.pb5` (带 margin-top) | 城市，国家 | cityCountry |
| `div.fs12.c88` | 剧情地点说明 | sceneDescription |
| `img[alt="剧照"]` | 剧照图片 | images |
| `.fs36.mocation-num` | 地点数量 | placeCount |

#### Place Detail 页面 (place_detail.html)

**第1组 - 地点信息：**

| CSS 选择器 | 含义 | 对应字段 |
|-----------|------|---------|
| `div.fs21.mb5` | 地点名 | placeName |
| `img.mb20.img100[alt="封面"]` | 封面图 | coverImage |
| `div.fs12.mb20` | 地址 | address |
| 电话字段 | 电话 | phone |

**第2组 - 剧照：**

| CSS 选择器 | 含义 | 对应字段 |
|-----------|------|---------|
| `img[alt="剧照"]` (最多5张) | 剧照图片 | images |

### 输出数据（导入数据库）

映射到现有的 `places` 表结构：

```typescript
// 从 Movie Detail 页面导入
interface MoviePlaceInsert {
  name: string;              // placeName (地点名)
  description: string | null; // sceneDescription (剧情地点说明)
  cover_image: string | null; // images[0] (第一张剧照)
  images: string[];          // images (所有剧照)
  city: string | null;       // 从 cityCountry 解析
  country: string | null;    // 从 cityCountry 解析
  source: 'mocation';        // 数据来源标识
  source_id: string;         // 原始 ID
  custom_fields: {
    movie_name: string;      // 剧名
    source_url: string;
  };
}

// 从 Place Detail 页面导入
interface PlaceDetailInsert {
  name: string;              // placeName (地点名)
  address: string | null;    // address (地址)
  phone: string | null;      // phone (电话)
  cover_image: string | null; // coverImage (封面图)
  images: string[];          // images (剧照，最多5张)
  source: 'mocation';        // 数据来源标识
  source_id: string;         // 原始 ID
  custom_fields: {
    source_url: string;
  };
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: 页面加载一致性

*For any* valid mocation.cc URL (place_detail 或 movie_detail)，如果页面存在且服务器正常响应，Puppeteer 应该成功加载并返回非空的 HTML 内容。

**Validates: Requirements 1.1, 1.2**

### Property 2: 批量处理完整性

*For any* ID 范围 [start, end]，爬取完成后的统计数字（成功 + 失败 + 跳过）应该等于 (end - start + 1)。

**Validates: Requirements 3.1, 3.4**

### Property 3: 重复检测一致性

*For any* 两条具有相同名称和地址的记录，导入时应该只有一条被成功导入，另一条应该被标记为跳过。

**Validates: Requirements 4.3**

### Property 4: JSON 序列化往返

*For any* 有效的 ScrapedPlace 对象，序列化为 JSON 后再反序列化应该得到等价的对象。

**Validates: Requirements 4.1**

## Error Handling

### 页面加载错误

```typescript
try {
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
} catch (error) {
  if (error.name === 'TimeoutError') {
    logger.warn(`页面加载超时: ${url}`);
    return null;
  }
  throw error;
}
```

### 数据提取错误

- 缺失字段：返回 null，不中断处理
- 无效数据：记录警告，跳过该字段

### 图片处理错误

- 下载失败：保留原始 URL，记录警告
- 上传失败：使用本地路径或原始 URL

### 数据库错误

- 连接失败：重试 3 次后抛出错误
- 插入失败：记录错误，继续处理下一条

## Testing Strategy

### 单元测试

使用 Jest 进行单元测试：

1. **数据提取测试**：使用模拟的 HTML 内容测试提取函数
2. **CLI 参数解析测试**：测试各种参数组合
3. **数据转换测试**：测试 ScrapedPlace 到 PlaceInsert 的转换

### 属性测试

使用 fast-check 进行属性测试：

1. **Property 2: 批量处理完整性**
   - 生成随机 ID 范围
   - 验证统计数字正确性

2. **Property 3: 重复检测一致性**
   - 生成随机地点数据
   - 插入重复数据
   - 验证只有一条被导入

3. **Property 4: JSON 序列化往返**
   - 生成随机 ScrapedPlace 对象
   - 序列化后反序列化
   - 验证等价性

### 集成测试

1. **端到端爬取测试**：爬取少量真实页面，验证数据完整性
2. **数据库导入测试**：使用测试数据库验证导入流程
