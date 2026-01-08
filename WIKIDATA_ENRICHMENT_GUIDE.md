# Wikidata 数据增强指南

## 概述

通过 Google My Maps 和 Apify 来增强 Wikidata 来源的地点数据，补充评分、评论、营业时间、高质量图片等信息。

## 完整流程

### 步骤 1：从数据库导出 Wikidata 地点

**推荐使用 CSV 格式**（Google My Maps 支持更好）：

```bash
cd wanderlog_api

# 导出 100 条 A 开头的 Wikidata 地点（CSV 格式）
npx tsx scripts/export-to-csv.ts \
  --source wikidata \
  --starts-with A \
  --limit 100 \
  --output wikidata-a-100.csv
```

**输出**：`wikidata-a-100.csv`

**备选方案**（GeoJSON 格式）：

```bash
# 如果 CSV 无法上传，可以尝试 GeoJSON
npx tsx scripts/export-to-geojson.ts \
  --source wikidata \
  --starts-with A \
  --limit 100 \
  --output wikidata-a-100.geojson
```

**注意**：Google My Maps 对 CSV 的支持更稳定，推荐优先使用 CSV 格式。

### 步骤 2：上传到 Google My Maps

**使用 CSV 文件**（推荐）：

1. 打开 https://www.google.com/mymaps
2. 点击 "创建新地图"
3. 给地图命名（例如："Wikidata A-100 Enrichment"）
4. 点击 "Import"（导入）
5. 上传 `wikidata-a-100.csv`
6. Google 会自动识别列：
   - Position columns: `latitude`, `longitude`
   - Marker title: `name`
7. 点击 "Continue" → "Finish"

**使用 GeoJSON 文件**（备选）：

如果 CSV 无法上传，尝试 GeoJSON：
1. 上传 `wikidata-a-100.geojson`
2. 手动选择字段：
   - Latitude: `latitude`
   - Longitude: `longitude`
   - Title: `name`

**结果**：100 个地点显示在 Google 地图上

### 步骤 3：下载 KML

1. 在 Google My Maps 中，点击地图标题旁的 "⋮" 菜单
2. 选择 "Export to KML/KMZ"
3. 勾选 "Export to KML instead of KMZ"
4. 点击 "Download"

**输出**：`wikidata-a-100.kml`

### 步骤 4：自动增强（Apify 爬取 + 重新导入）

```bash
# 一键完成：解析 KML → Apify 爬取 → 导入数据库
npx tsx scripts/enrich-from-google.ts wikidata-a-100.kml
```

这个脚本会自动：
1. 解析 KML 文件
2. 使用 Apify 爬取 Google Places 完整信息
3. 重新导入数据库，智能处理图片：
   - **Google 图片 → coverImage**（高质量）
   - **原 Wikidata 图片 → images 数组**（保留）
   - 所有图片上传到 R2

## 数据增强内容

### 之前（Wikidata）
- ✅ 基本信息：名称、经纬度、国家、城市
- ✅ Wikidata ID
- ✅ 分类
- ✅ 图片（来自 Wikidata/Wikimedia）
- ❌ 无评分
- ❌ 无评论数
- ❌ 无营业时间
- ❌ 地址可能不完整
- ❌ 无电话/网站

### 之后（Wikidata + Google）
- ✅ 所有 Wikidata 信息（保留）
- ✅ **Google 评分**（rating）
- ✅ **评论数**（user_ratings_total）
- ✅ **营业时间**（opening_hours）
- ✅ **完整地址**（address）
- ✅ **电话**（phone）
- ✅ **网站**（website）
- ✅ **价格等级**（price_level）
- ✅ **Google Place ID**
- ✅ **高质量 Google 图片**（coverImage）
- ✅ **原 Wikidata 图片**（images 数组）

## 图片处理逻辑

### 新逻辑（数据增强）

```
原数据：
  coverImage: wikidata-image.jpg (来自 Wikidata)
  images: []

增强后：
  coverImage: google-image.jpg (来自 Google，高质量)
  images: [
    {
      url: wikidata-image.jpg,
      source: "wikidata",
      r2Key: "...",
      addedAt: "2025-01-08T..."
    }
  ]
```

**优势**：
- Google 图片通常质量更高，作为封面更合适
- Wikidata 图片不会丢失，保存在 images 数组中
- 所有图片都上传到 R2，确保可用性

## 批量处理策略

### 按字母批次处理

```bash
# A 开头的地点
npx tsx scripts/export-to-csv.ts --source wikidata --starts-with A --limit 100 --output wikidata-a.csv

# B 开头的地点
npx tsx scripts/export-to-csv.ts --source wikidata --starts-with B --limit 100 --output wikidata-b.csv

# C 开头的地点
npx tsx scripts/export-to-csv.ts --source wikidata --starts-with C --limit 100 --output wikidata-c.csv
```

### 按国家批次处理

```bash
# 意大利的 Wikidata 地点
npx tsx scripts/export-to-csv.ts --source wikidata --country IT --limit 500 --output wikidata-italy.csv

# 法国的 Wikidata 地点
npx tsx scripts/export-to-csv.ts --source wikidata --country FR --limit 500 --output wikidata-france.csv
```

### 按分类批次处理

```bash
# 建筑类 Wikidata 地点
npx tsx scripts/export-to-csv.ts --source wikidata --category architecture --limit 500 --output wikidata-architecture.csv

# 博物馆类 Wikidata 地点
npx tsx scripts/export-to-csv.ts --source wikidata --category museum --limit 500 --output wikidata-museums.csv
```

## 成本估算

### Apify 费用

每个地点的成本：
- Place detail page: $0.002
- Compute units: ~$0.0002 (取决于套餐)
- **总计：约 $0.0022/地点**

100 个地点：
- 100 × $0.0022 = **$0.22**

1000 个地点：
- 1000 × $0.0022 = **$2.20**

### Google My Maps 限制

- 每个地图最多 10,000 个标记
- 每个图层最多 2,000 个标记
- 建议每批 100-500 个地点

## 示例输出

### 导出阶段

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                     EXPORT PLACES TO CSV                                      ║
╚══════════════════════════════════════════════════════════════════════════════╝

📋 Export filters:
   Source: wikidata
   Starts with: A
   Limit: 100

🔍 Fetching places from database...
✅ Found 100 places

📊 Export statistics:
   Total places: 100
   Countries: 26
   Cities: 83
   Categories: 9
   Verified: 100 (100.0%)
   With rating: 0 (0.0%)
   With image: 100 (100.0%)

✅ Saved to: wikidata-a-100.csv
```

### 增强阶段

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                     ENRICH PLACES FROM GOOGLE MY MAPS                         ║
╚══════════════════════════════════════════════════════════════════════════════╝

🚀 Step 1/2: Parsing KML and scraping with Apify...
   ✅ Found 100 places in KML
   🕷️  Starting Apify scraper...
   ✅ Scraping complete! (98/100 places)

🚀 Step 2/2: Importing enriched data to database...
   📝 Image handling:
      - Google images → coverImage (high quality)
      - Old coverImage → images array (preserved)
   
   ✅ Import complete!
      Total: 98
      Updated: 98
      Skipped: 0
      Failed: 0

╔══════════════════════════════════════════════════════════════════════════════╗
║                          ENRICHMENT COMPLETE!                                 ║
╚══════════════════════════════════════════════════════════════════════════════╝

✨ Your places now have:
   ✅ Ratings and reviews from Google
   ✅ Opening hours and contact info
   ✅ High-quality Google images as coverImage
   ✅ Original images preserved in images array
   ✅ Better addresses and location data
```

## 数据质量对比

### 增强前（Wikidata only）

| 字段 | 覆盖率 |
|------|--------|
| Name | 100% |
| Coordinates | 100% |
| City | 100% |
| Country | 100% |
| Rating | 0% ❌ |
| Reviews | 0% ❌ |
| Opening Hours | 0% ❌ |
| Phone | ~5% |
| Website | ~20% |
| Cover Image | 100% |

### 增强后（Wikidata + Google）

| 字段 | 覆盖率 |
|------|--------|
| Name | 100% |
| Coordinates | 100% |
| City | 100% |
| Country | 100% |
| Rating | ~95% ✅ |
| Reviews | ~95% ✅ |
| Opening Hours | ~85% ✅ |
| Phone | ~70% ✅ |
| Website | ~60% ✅ |
| Cover Image | 100% (Google) |
| Images Array | 100% (Wikidata) |

## 注意事项

### 1. Google My Maps 手动步骤

步骤 2（上传）和步骤 3（下载）需要手动操作，因为：
- Google My Maps 没有公开 API
- 需要 Google 账号登录
- 需要在浏览器中操作

### 2. 匹配准确性

- Apify 通过名称和坐标匹配地点
- 大部分地点可以准确匹配（~95%）
- 少数地点可能匹配失败（名称变化、坐标偏移）

### 3. 数据更新策略

- 只更新缺失的字段
- 不覆盖已有的 Wikidata 信息
- Google 图片替换 coverImage，原图片保留

### 4. 批次大小建议

- 测试：100 个地点
- 生产：500-1000 个地点/批次
- 避免超过 Google My Maps 限制

## 故障排除

### 问题：Apify 爬取失败

**原因**：地点名称或坐标无法在 Google Maps 找到

**解决方案**：
- 检查 KML 文件中的地点信息
- 手动在 Google Maps 搜索验证
- 跳过无法匹配的地点

### 问题：图片上传失败

**原因**：R2 配置或网络问题

**解决方案**：
- 检查 `.env` 中的 R2 配置
- 检查网络连接
- 重新运行导入脚本

### 问题：数据库更新失败

**原因**：Supabase 连接或权限问题

**解决方案**：
- 检查 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`
- 确认数据库表结构正确
- 检查网络连接

## 相关文档

- [EXPORT_TO_GOOGLE_MAPS.md](./EXPORT_TO_GOOGLE_MAPS.md) - 导出到 Google My Maps
- [KML_IMPORT_GUIDE.md](./KML_IMPORT_GUIDE.md) - KML 导入指南
- [APIFY_IMPORT_GUIDE.md](./APIFY_IMPORT_GUIDE.md) - Apify 导入指南

## 下一步

完成 A 开头的 100 个地点测试后，可以：

1. 继续处理其他字母（B, C, D...）
2. 按国家批量处理
3. 按分类批量处理
4. 分析数据质量提升效果
5. 调整批次大小和处理策略
