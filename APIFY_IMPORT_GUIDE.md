# Apify Google Maps 数据导入指南

## 概述

本指南说明如何使用新的 Apify API token 从 Google Maps 爬取数据并导入到数据库。

## 配置

### 1. API Token 配置

`.env` 文件中已配置两个 token：

```env
APIFY_API_TOKEN=your_apify_api_token_here  # 新账号（当前使用）
APIFY_API_TOKEN_OLD=your_backup_token_here  # 旧账号（备用）
APIFY_ACTOR_ID=your_actor_id_here
```

### 2. Apify Actor 配置

使用官方的 `compass/crawler-google-places` Actor，配置如下：

**必须开启的 Add-on：**
- ✅ **Scrape place detail page** ($0.002/result)
  - 获取完整的地点详情（营业时间、电话、网站、描述等）
  
**图片设置：**
- `maxImages: 1` - 1张图片免费

**禁用的功能（节省成本）：**
- ❌ `deeperCityScrape: false` - 不深度爬取城市
- ❌ `scrapeDirectories: false` - 不爬取目录
- ❌ `includeWebResults: false` - 不包含网页搜索结果

## 支持的字段

导入服务会自动映射以下字段：

| Apify 字段 | 数据库字段 | 说明 |
|-----------|-----------|------|
| `title` | `name` | 地点名称 |
| `city` | `city` | 城市 |
| `countryCode` | `country` | 国家代码 (ISO2) |
| `location.lat` | `latitude` | 纬度 |
| `location.lng` | `longitude` | 经度 |
| `imageUrl` | `coverImage` | 封面图片 (上传到 R2) |
| `categories` | `categorySlug` | 分类 (自动映射) |
| `openingHours` | `openingHours` | 营业时间 (JSON) |
| `address` | `address` | 地址 |
| `phoneUnformatted` | `phoneNumber` | 电话 |
| `website` | `website` | 网站 |
| `description` | `description` | 描述 |
| `totalScore` | `rating` | 评分 |
| `reviewsCount` | `ratingCount` | 评分人数 |
| `price` | `customFields.priceText` | 价格文本 |
| `placeId` | `googlePlaceId` | Google Place ID |
| - | `isVerified` | **自动设置为 true** |

## 使用方法

### 方法 1: 测试爬虫配置

首先测试爬虫是否正确配置并能获取所需字段：

```bash
cd wanderlog_api

# 测试爬取巴黎的咖啡馆
npx tsx test-apify-scraper.ts "https://www.google.com/maps/search/coffee+in+paris"

# 测试爬取特定地点列表
npx tsx test-apify-scraper.ts "https://www.google.com/maps/search/museums+in+tokyo"
```

测试脚本会：
1. 启动 Apify Actor（开启 place detail page add-on）
2. 等待爬取完成
3. 分析字段覆盖率
4. 显示示例数据
5. 提供 Dataset ID 用于正式导入

### 方法 2: 从 Dataset 导入

使用测试脚本获取的 Dataset ID 进行正式导入：

```bash
cd wanderlog_api

# 从 Apify Dataset 导入
npx tsx scripts/import-apify-places.ts --dataset <dataset-id>

# Dry-run 模式（只验证不写入）
npx tsx scripts/import-apify-places.ts --dataset <dataset-id> --dry-run

# 自定义批量大小
npx tsx scripts/import-apify-places.ts --dataset <dataset-id> --batch-size 50

# 跳过图片处理（更快）
npx tsx scripts/import-apify-places.ts --dataset <dataset-id> --skip-images
```

### 方法 3: 从本地 JSON 文件导入

如果已经下载了 Apify 数据：

```bash
cd wanderlog_api

# 从本地文件导入
npx tsx scripts/import-apify-places.ts --file ../dataset_places.json

# Dry-run 模式
npx tsx scripts/import-apify-places.ts --file ../dataset_places.json --dry-run
```

## 导入流程

导入服务会自动执行以下步骤：

1. **数据验证** - 检查必填字段（placeId, city, countryCode, lat, lng）
2. **字段映射** - 将 Apify 字段映射到数据库字段
3. **分类归一化** - 将 Google 分类映射到系统标准分类
4. **去重合并** - 基于 googlePlaceId 进行智能合并
5. **图片处理** - 下载图片并上传到 Cloudflare R2
6. **标签生成** - 从多个来源提取结构化标签
7. **AI 标签** - 基于结构化标签生成 AI 标签
8. **设置 isVerified** - 自动设置为 true
9. **数据库写入** - Upsert 到 Supabase

## 成本估算

基于 Apify 定价：

- **Place detail page add-on**: $0.002/result
- **图片 (1张)**: 免费
- **基础爬取**: 按 compute units 计费

**示例：**
- 爬取 100 个地点 = $0.20 (place details) + compute units
- 爬取 1000 个地点 = $2.00 (place details) + compute units

## 数据质量检查

导入完成后会生成详细报告：

```
📊 IMPORT VALIDATION REPORT
─────────────────────────────────────────
Total Items: 100

📈 SUMMARY
  Inserted: 85
  Updated:  10
  Skipped:  3
  Failed:   2

📋 REQUIRED FIELDS COVERAGE
  City:        98/100 (98.0%)
  Country:     100/100 (100.0%)
  Latitude:    100/100 (100.0%)
  Longitude:   100/100 (100.0%)
  Cover Image: 95/100 (95.0%)
  All Required: 95/100 (95.0%)

⏰ OPENING HOURS COVERAGE
  With Hours: 87/100 (87.0%)

🖼️  COVER IMAGE AVAILABILITY
  With Image: 95/100 (95.0%)

📂 CATEGORY DISTRIBUTION
  cafe: 45 (45.0%)
  restaurant: 30 (30.0%)
  museum: 15 (15.0%)
  ...
```

## 故障排查

### 问题 1: API Token 无效

```
❌ Error: Apify API token is not configured
```

**解决方案：**
检查 `.env` 文件中的 `APIFY_API_TOKEN` 是否正确设置。

### 问题 2: 字段缺失

如果某些字段覆盖率低，检查：
1. 是否开启了 `scrapePlaceDetailPage` add-on
2. 是否设置了 `maxImages: 1`
3. 查看 Apify Console 中的运行日志

### 问题 3: 图片上传失败

```
⚠️  Image upload failed for place: xxx
```

**解决方案：**
1. 检查 R2 配置（`R2_PUBLIC_URL`, `R2_UPLOAD_SECRET`）
2. 使用 `--skip-images` 跳过图片处理
3. 稍后单独处理图片

## 注意事项

1. **KML 链接不支持** - Google My Maps 的 KML 导出链接需要先转换为标准 Google Maps 搜索链接
2. **成本控制** - 使用 `maxCrawledPlaces` 限制爬取数量
3. **数据去重** - 系统会自动基于 googlePlaceId 去重
4. **isVerified** - 所有通过 Apify 导入的地点自动设置 `isVerified = true`
5. **批量导入** - 建议先用小数据集测试，确认字段覆盖率后再大批量导入

## 相关文件

- **测试脚本**: `wanderlog_api/test-apify-scraper.ts`
- **导入脚本**: `wanderlog_api/scripts/import-apify-places.ts`
- **导入服务**: `wanderlog_api/src/services/apifyImportService.ts`
- **字段映射**: `wanderlog_api/src/services/apifyFieldMapper.ts`
- **Spec 文档**: `.kiro/specs/apify-data-import/`

## 下一步

1. 运行测试脚本验证配置
2. 检查字段覆盖率
3. 使用 dry-run 模式验证数据
4. 正式导入数据
5. 检查导入报告
6. 在应用中验证数据显示
