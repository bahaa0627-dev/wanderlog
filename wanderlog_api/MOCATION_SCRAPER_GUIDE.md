# Mocation Scraper 使用指南

从 mocation.cc 网站爬取地点信息（电影取景地）并导入数据库的工具。

## 目录

- [功能概述](#功能概述)
- [安装配置](#安装配置)
- [快速开始](#快速开始)
- [命令行参数](#命令行参数)
- [使用示例](#使用示例)
- [数据格式](#数据格式)
- [图片处理](#图片处理)
- [常见问题](#常见问题)

## 功能概述

Mocation Scraper 支持以下功能：

- 爬取 `movie_detail` 页面（电影详情，包含取景地信息）
- 爬取 `place_detail` 页面（地点详情）
- 批量爬取指定 ID 范围的页面
- 自动重试失败的请求
- 保存数据到 JSON 文件
- 导入数据到 Supabase 数据库
- 下载图片并上传到 Cloudflare R2

## 安装配置

### 前置要求

1. Node.js 18+
2. Google Chrome 浏览器（Puppeteer 需要）
3. 配置环境变量

### 环境变量

在 `wanderlog_api/.env` 文件中配置：

```bash
# Supabase 配置（导入数据库时需要）
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_service_key

# R2 配置（上传图片时需要）
R2_UPLOAD_SECRET=your_r2_upload_secret
R2_PUBLIC_URL=your_r2_public_url

# Chrome 路径（可选，自动检测）
CHROME_PATH=/path/to/chrome
```

### 安装依赖

```bash
cd wanderlog_api
npm install
```

## 快速开始

### 1. 爬取少量页面测试

```bash
# 爬取 movie_detail 页面 1-10
npx tsx scripts/scrape-mocation.ts --type movie --start 1 --end 10 --dry-run
```

### 2. 查看爬取结果

爬取完成后会生成 JSON 文件，如 `mocation-movie-1-10.json`

### 3. 导入到数据库

```bash
# 从 JSON 文件导入
npx tsx scripts/import-mocation-json.ts ./mocation-movie-1-10.json
```

## 命令行参数

### scrape-mocation.ts 参数

| 参数 | 说明 | 必填 | 默认值 |
|------|------|------|--------|
| `--type <type>` | 页面类型：`movie` 或 `place` | ✅ | - |
| `--start <id>` | 起始 ID | ✅ | - |
| `--end <id>` | 结束 ID | ✅ | - |
| `--output <path>` | 输出 JSON 文件路径 | ❌ | `./mocation-{type}-{start}-{end}.json` |
| `--delay <ms>` | 请求间隔（毫秒） | ❌ | 2000 |
| `--retries <n>` | 最大重试次数 | ❌ | 2 |
| `--retry-delay <ms>` | 重试间隔（毫秒） | ❌ | 5000 |
| `--dry-run` | 仅爬取，不导入数据库 | ❌ | false |
| `--import` | 爬取后直接导入数据库 | ❌ | false |
| `--process-images` | 下载图片到本地 | ❌ | false |
| `--upload-r2` | 下载图片并上传到 R2 | ❌ | false |
| `--help` | 显示帮助信息 | ❌ | - |

### import-mocation-json.ts 参数

| 参数 | 说明 | 必填 | 默认值 |
|------|------|------|--------|
| `<json-file>` | JSON 文件路径 | ✅ | - |
| `--process-images` | 下载图片到本地 | ❌ | false |
| `--upload-r2` | 下载图片并上传到 R2 | ❌ | false |
| `--help` | 显示帮助信息 | ❌ | - |

## 使用示例

### 爬取电影取景地

```bash
# 爬取 movie_detail 页面 1-100
npx tsx scripts/scrape-mocation.ts --type movie --start 1 --end 100

# 爬取并直接导入数据库
npx tsx scripts/scrape-mocation.ts --type movie --start 1 --end 100 --import

# 爬取、导入并上传图片到 R2
npx tsx scripts/scrape-mocation.ts --type movie --start 1 --end 100 --import --upload-r2
```

### 爬取地点详情

```bash
# 爬取 place_detail 页面 1-200
npx tsx scripts/scrape-mocation.ts --type place --start 1 --end 200

# 使用自定义延迟（3秒）
npx tsx scripts/scrape-mocation.ts --type place --start 1 --end 200 --delay 3000
```

### 自定义输出路径

```bash
npx tsx scripts/scrape-mocation.ts --type movie --start 1 --end 50 --output ./data/movies.json
```

### 增加重试次数（网络不稳定时）

```bash
npx tsx scripts/scrape-mocation.ts --type movie --start 1 --end 50 --retries 5 --retry-delay 10000
```

### 从 JSON 文件导入

```bash
# 基本导入
npx tsx scripts/import-mocation-json.ts ./mocation-movie-1-100.json

# 导入并处理图片
npx tsx scripts/import-mocation-json.ts ./mocation-movie-1-100.json --upload-r2
```

## 数据格式

### Movie Detail 页面数据（优化结构）

爬取电影页面时，数据采用优化结构：电影信息只存储一次，地点信息存储在数组中。

```typescript
interface ScrapedMoviePage {
  sourceType: 'movie';           // 页面类型
  movie: {                       // 电影信息（只存储一次）
    movieId: string;             // 电影 ID
    movieNameCn: string | null;  // 中文名
    movieNameEn: string | null;  // 英文名
    sourceUrl: string;           // 原始 URL
    placeCount: number | null;   // 地点数量
  };
  places: Array<{                // 地点列表
    placeName: string;           // 地点中文名
    placeNameEn: string | null;  // 地点英文名
    cityCountry: string | null;  // 城市，国家
    sceneDescription: string | null; // 剧情地点说明
    image: string | null;        // 剧照
    episode: string | null;      // 集数（剧集）
    position: string | null;     // 时间点
  }>;
  scrapedAt: string;             // 爬取时间
}
```

**示例输出：**
```json
{
  "sourceType": "movie",
  "movie": {
    "movieId": "5380",
    "movieNameCn": "完美的日子",
    "movieNameEn": "Perfect Days",
    "sourceUrl": "https://mocation.cc/html/movie_detail.html?id=5380",
    "placeCount": 30
  },
  "places": [
    {
      "placeName": "东京晴空塔",
      "placeNameEn": "Tokyo Skytree",
      "cityCountry": "东京都 日本",
      "sceneDescription": "东京晴空塔",
      "image": "http://cache.fotoplace.cc/mocation/240109/5/1704766400101625710.jpg",
      "episode": null,
      "position": "05:51"
    }
  ],
  "scrapedAt": "2026-01-09T10:30:00.000Z"
}
```

### Place Detail 页面数据

Place detail 页面展示一个地点及其关联的多部电影，每部电影有各自的剧照。

```typescript
interface ScrapedPlaceDetail {
  sourceId: string;              // 原始页面 ID
  sourceType: 'place';           // 页面类型
  sourceUrl: string;             // 原始 URL
  placeName: string | null;      // 地点中文名
  placeNameEn: string | null;    // 地点英文名
  coverImage: string | null;     // 封面图
  address: string | null;        // 地址
  phone: string | null;          // 电话
  movies: PlaceMovieScene[];     // 关联电影列表
  scrapedAt: string;             // 爬取时间
}

interface PlaceMovieScene {
  movieId: string | null;        // 电影 ID
  movieNameCn: string | null;    // 电影中文名
  movieNameEn: string | null;    // 电影英文名
  sceneDescription: string | null; // 场景描述
  stills: string[];              // 该电影在此地点的剧照
}
```

**示例输出：**
```json
{
  "sourceId": "17103",
  "sourceType": "place",
  "sourceUrl": "https://mocation.cc/html/place_detail.html?id=17103",
  "placeName": "惠比寿公园",
  "placeNameEn": "恵比寿公園",
  "coverImage": "http://cache.fotoplace.cc/mocation/231012/5/1697078344318327891.jpg",
  "address": "日本〒150-0021 東京都渋谷区恵比寿西1丁目19-1",
  "phone": "+81334632876",
  "movies": [
    {
      "movieId": null,
      "movieNameCn": "交响情人梦",
      "movieNameEn": "のだめカンタービレ",
      "sceneDescription": null,
      "stills": ["http://cache.fotoplace.cc/mocation/180720/17/1532067271136538376.JPG", "..."]
    },
    {
      "movieId": null,
      "movieNameCn": "完美的日子",
      "movieNameEn": "Perfect Days",
      "sceneDescription": null,
      "stills": ["http://cache.fotoplace.cc/mocation/240109/5/1704783238254712612.jpg", "..."]
    }
  ],
  "scrapedAt": "2026-01-09T10:30:00.000Z"
}
```

### 多电影关联

一个地点可能出现在多部电影中。导入时会自动处理：

- **新地点**：创建新记录，添加电影引用
- **已存在地点**：更新记录，添加新的电影引用到 `custom_fields.movies` 数组

```typescript
interface MocationCustomFields {
  movies: Array<{
    movieId: string;             // 电影 ID
    movieName: string | null;    // 电影名
    sceneDescription: string | null; // 场景描述
    image: string | null;        // 剧照
    sourceUrl: string;           // 来源 URL
  }>;
  sourceUrl: string;             // 首次导入的来源 URL
}
```

### 导入到数据库的字段映射

| 爬取字段 | 数据库字段 | 说明 |
|----------|------------|------|
| places[].placeName | name | 地点名称 |
| places[].placeNameEn | name_en | 地点英文名 |
| places[].sceneDescription | description | 描述 |
| places[].image | cover_image | 封面图 |
| places[].cityCountry (解析) | city, country | 城市和国家 |
| - | source | 固定为 'mocation' |
| movie + place | custom_fields.movies | 电影引用列表 |

## 图片处理

### 图片下载

使用 `--process-images` 参数会将图片下载到本地临时目录：

```bash
npx tsx scripts/scrape-mocation.ts --type movie --start 1 --end 10 --import --process-images
```

### R2 上传

使用 `--upload-r2` 参数会将图片上传到 Cloudflare R2：

```bash
npx tsx scripts/scrape-mocation.ts --type movie --start 1 --end 10 --import --upload-r2
```

需要配置环境变量：
- `R2_UPLOAD_SECRET`
- `R2_PUBLIC_URL`

### 图片处理失败

如果图片下载或上传失败，会保留原始 URL 并记录警告，不会中断导入流程。

## 常见问题

### Q: Chrome 找不到

确保安装了 Google Chrome，或设置 `CHROME_PATH` 环境变量：

```bash
export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

### Q: 页面加载超时

增加重试次数和延迟：

```bash
npx tsx scripts/scrape-mocation.ts --type movie --start 1 --end 10 --retries 5 --retry-delay 10000
```

### Q: 被网站封禁

增加请求间隔：

```bash
npx tsx scripts/scrape-mocation.ts --type movie --start 1 --end 10 --delay 5000
```

### Q: 数据库导入失败

检查环境变量配置：
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`

### Q: 重复数据处理

导入时会自动检测重复数据：
- 基于地点名称和城市/国家匹配
- 如果地点已存在，会添加新的电影引用（支持一个地点关联多部电影）
- 如果电影引用已存在，会跳过

### Q: 查看帮助信息

```bash
npx tsx scripts/scrape-mocation.ts --help
npx tsx scripts/import-mocation-json.ts --help
```

## 运行测试

```bash
# 运行集成测试
npx jest tests/integration/MocationScraperIntegration.test.ts --testTimeout=120000
```

## 相关文件

- `scripts/scrape-mocation.ts` - 主爬虫脚本
- `scripts/import-mocation-json.ts` - JSON 导入脚本
- `src/types/mocation.ts` - 类型定义
- `src/services/mocationImporter.ts` - 导入服务
- `src/services/mocationImageHandler.ts` - 图片处理服务
- `tests/integration/MocationScraperIntegration.test.ts` - 集成测试
