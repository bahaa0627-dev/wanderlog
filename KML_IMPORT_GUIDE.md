# Google My Maps (KML) 导入指南

## 概述

本指南说明如何从 Google My Maps 导入地点数据到数据库。

## 为什么需要 KML 解析？

Google My Maps 的链接格式（`/maps/d/`）**不被 Apify 支持**。我们需要：
1. 从 Google My Maps 下载 KML 文件
2. 解析 KML 提取地点信息
3. 使用 Google Places API 获取完整详情
4. 转换为 Apify 格式
5. 导入到数据库

## 完整流程

### 步骤 1: 下载 KML 文件

1. 打开你的 Google My Maps
   - 访问：https://www.google.com/maps/d/
   - 或直接打开你的地图链接

2. 导出 KML
   - 点击地图标题旁的菜单按钮（⋮ 三个点）
   - 选择 "Export to KML/KMZ"
   - **重要**: 选择 "Export to KML" (不是 KMZ)
   - 下载文件（例如：`my-favorite-places.kml`）

### 步骤 2: 使用 Apify 爬取完整数据

```bash
cd wanderlog_api

# 解析 KML 并用 Apify 爬取
npx tsx parse-kml-for-apify.ts ../my-favorite-places.kml
```

**这个脚本会：**
- ✅ 解析 KML 文件提取地点名称、坐标和 Place IDs
- ✅ 生成 Google Maps URLs
- ✅ 使用 Apify 爬取完整详情：
  - Place ID
  - 城市和国家
  - 评分和评论数
  - 分类
  - 营业时间
  - 电话和网站
  - 图片
  - 价格等级
- ✅ 生成 Apify 格式的 JSON 文件（`my-favorite-places-apify.json`）
- ✅ 显示数据质量报告

**输出示例：**
```
╔══════════════════════════════════════════════════════════════════════════════╗
║                     KML TO APIFY FORMAT PARSER                                ║
╚══════════════════════════════════════════════════════════════════════════════╝

📂 Reading KML file: my-favorite-places.kml
🔍 Parsing KML...
✅ Found 50 places in KML

📋 Sample places:
   1. Café de Flore (48.8542, 2.3320)
      Place ID: ChIJZ7SPu5xv5kcRGMfYOG3bVhs
   2. Musée d'Orsay (48.8600, 2.3266)
      Place ID: ChIJZ7SPu5xv5kcRGMfYOG3bVhs
   3. Shakespeare and Company (48.8526, 2.3470)
      Place ID: ChIJZ7SPu5xv5kcRGMfYOG3bVhs

🌐 Enriching with Google Places API...
   This may take a while for large datasets...

   Processing 50/50: Shakespeare and Company

✅ Processing complete!
   Fully enriched: 48
   Partial data: 2

💾 Saved to: my-favorite-places-apify.json

📊 Data Quality:
────────────────────────────────────────────────────────────────────────────────
   ✅ PlaceId        : 48/50 (96.0%)
   ✅ City           : 48/50 (96.0%)
   ✅ Country        : 50/50 (100.0%)
   ✅ Rating         : 45/50 (90.0%)
   ✅ Image          : 47/50 (94.0%)
   ✅ Hours          : 42/50 (84.0%)
   ⚠️  Phone          : 38/50 (76.0%)
   ⚠️  Website        : 35/50 (70.0%)

💡 Next Steps:
   1. Review the generated file: my-favorite-places-apify.json
   2. Import to database:
      npx tsx scripts/import-apify-places.ts --file my-favorite-places-apify.json
   
   3. Or dry-run first:
      npx tsx scripts/import-apify-places.ts --file my-favorite-places-apify.json --dry-run
```

### 步骤 3: 导入到数据库

```bash
# 先 dry-run 验证数据
npx tsx scripts/import-apify-places.ts --file ../my-favorite-places-apify.json --dry-run

# 确认无误后正式导入
npx tsx scripts/import-apify-places.ts --file ../my-favorite-places-apify.json
```

## 配置要求

### Apify API Token（必需）

这个方案使用 Apify 而不是直接调用 Google Places API，所以只需要：

1. **Apify API Token** - 已配置在 `.env`
   ```env
   APIFY_API_TOKEN=apify_api_7arUhHpRivu0WPqU09hPmUROOXN1Bw1seT28
   ```

2. **Apify 账号** - 需要有足够的 credits

**不需要 Google Maps API Key！**

## 数据映射

### KML 字段 → Apify 格式

| KML 字段 | Apify 字段 | 说明 |
|---------|-----------|------|
| `<name>` | `title` | 地点名称 |
| `<coordinates>` | `location.lat/lng` | 经纬度 |
| `<description>` | `description` | 描述 |

### Google Places API → Apify 格式

| Places API 字段 | Apify 字段 | 数据库字段 |
|----------------|-----------|-----------|
| `place_id` | `placeId` | `googlePlaceId` |
| `name` | `title` | `name` |
| `formatted_address` | `address` | `address` |
| `address_components` | `city`, `countryCode` | `city`, `country` |
| `geometry.location` | `location` | `latitude`, `longitude` |
| `rating` | `totalScore` | `rating` |
| `user_ratings_total` | `reviewsCount` | `ratingCount` |
| `types` | `categories` | `categorySlug` (映射) |
| `website` | `website` | `website` |
| `formatted_phone_number` | `phone` | `phoneNumber` |
| `opening_hours` | `openingHours` | `openingHours` |
| `photos[0]` | `imageUrl` | `coverImage` (上传到 R2) |
| `price_level` | `price` | `customFields.priceText` |

## 成本估算

### Apify 成本

假设你的 KML 有 100 个地点：

**Apify 爬取成本：**
- Place detail page add-on: 100 places × $0.002 = **$0.20**
- Compute units: ~$0.50
- **总计**: ~**$0.70**

**对比 Google Places API：**
- Place Details API: 100 requests × $0.017 = $1.70
- 或 Nearby Search + Details: ~$3.30

**结论**: 使用 Apify 比直接调用 Google Places API 便宜约 60-80%！

### Apify Credits

Apify 定价：
- 免费账号：每月 $5 credits（约 2,500 个地点）
- 付费计划：按需购买 credits

## 故障排查

### 问题 1: KML 文件解析失败

```
⚠️  No places found in KML file
```

**可能原因：**
- 下载的是 KMZ 文件（压缩格式）
- KML 格式不标准

**解决方案：**
1. 确保下载的是 KML 格式（不是 KMZ）
2. 用文本编辑器打开 KML 文件，检查是否包含 `<Placemark>` 标签
3. 如果是 KMZ，先解压缩提取 KML 文件

### 问题 2: Google Places API 配额超限

```
❌ Error: You have exceeded your daily request quota
```

**解决方案：**
1. 检查 Google Cloud Console 的配额使用情况
2. 等待配额重置（每天 UTC 00:00）
3. 或升级到付费计划

### 问题 3: 部分地点数据不完整

```
⚠️  Partial data: 10
```

**可能原因：**
- 地点在 Google Maps 中不存在或已关闭
- 坐标不准确
- API 请求失败

**解决方案：**
- 检查生成的 JSON 文件
- 手动补充缺失的地点信息
- 或在导入后在数据库中更新

### 问题 4: 没有 Place ID

如果 KML 中的地点没有 Place ID，脚本会：
1. 使用坐标和名称在附近搜索
2. 匹配最相似的地点
3. 如果找不到，只使用基本信息（名称、坐标）

## 高级用法

### 批量处理多个 KML 文件

```bash
# 创建批处理脚本
for kml in *.kml; do
  echo "Processing $kml..."
  npx tsx parse-kml-to-apify.ts "$kml"
done

# 合并所有生成的 JSON
cat *-apify.json | jq -s 'add' > combined-apify.json

# 导入合并后的数据
npx tsx scripts/import-apify-places.ts --file combined-apify.json
```

### 只解析不调用 API

如果你想先看看 KML 中有什么，不想消耗 API 配额：

```bash
# 临时移除 API Key
GOOGLE_MAPS_API_KEY="" npx tsx parse-kml-to-apify.ts my-map.kml
```

### 自定义 API 请求间隔

编辑 `parse-kml-to-apify.ts`，修改这一行：
```typescript
await new Promise(resolve => setTimeout(resolve, 100)); // 100ms → 改为你想要的值
```

## 相关文件

- **KML + Apify 解析脚本**: `wanderlog_api/parse-kml-for-apify.ts` ⭐ 推荐
- **KML + Google API 解析脚本**: `wanderlog_api/parse-kml-to-apify.ts` (备用)
- **导入脚本**: `wanderlog_api/scripts/import-apify-places.ts`
- **Apify 导入指南**: `APIFY_IMPORT_GUIDE.md`

## 总结

**优点：**
- ✅ 支持 Google My Maps 导入
- ✅ 使用 Apify 爬取（比 Google API 便宜）
- ✅ 自动获取完整地点详情
- ✅ 数据质量高
- ✅ 支持批量处理
- ✅ 不需要 Google Maps API Key

**缺点：**
- ❌ 需要手动下载 KML
- ❌ 需要 Apify credits
- ❌ 爬取需要时间（大数据集可能需要几分钟）

**适用场景：**
- 从 Google My Maps 导入收藏的地点
- 导入朋友分享的地图
- 批量导入精选地点列表
