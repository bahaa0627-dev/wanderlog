# 导出数据库到 Google My Maps

## 概述

将数据库中的地点批量导出到 Google My Maps，可以：
- 在 Google 地图上可视化你的数据
- 分享给朋友查看
- 作为数据备份
- 用于演示和展示

## 快速开始

### 1. 导出所有地点

```bash
cd wanderlog_api
npx tsx scripts/export-to-geojson.ts
```

### 2. 导出特定城市（例如：罗马）

```bash
npx tsx scripts/export-to-geojson.ts --city Rome --verified
```

### 3. 导出特定国家（例如：意大利）

```bash
npx tsx scripts/export-to-geojson.ts --country IT --limit 500
```

### 4. 导出特定分类（例如：建筑）

```bash
npx tsx scripts/export-to-geojson.ts --category architecture --verified
```

## 导入到 Google My Maps

### 步骤 1：打开 Google My Maps

访问：https://www.google.com/mymaps

### 步骤 2：创建新地图

1. 点击 "创建新地图"
2. 给地图起个名字（例如："我的旅行地点"）

### 步骤 3：导入 GeoJSON

1. 点击左侧面板的 "Import"（导入）
2. 选择刚才生成的 `.geojson` 文件
3. Google 会自动识别坐标字段
4. 选择 "name" 作为标记标题
5. 点击 "Finish"（完成）

### 步骤 4：查看和分享

- 所有地点会立即显示在地图上
- 点击每个标记可以看到详细信息
- 点击 "Share"（分享）可以分享给朋友

## 命令选项

| 选项 | 说明 | 示例 |
|------|------|------|
| `--country <code>` | 按国家过滤 | `--country IT` |
| `--city <name>` | 按城市过滤 | `--city Rome` |
| `--category <slug>` | 按分类过滤 | `--category architecture` |
| `--verified` | 只导出已验证的地点 | `--verified` |
| `--limit <number>` | 限制数量 | `--limit 500` |
| `--output <file>` | 指定输出文件 | `--output rome.geojson` |

## 使用场景

### 场景 1：展示某个城市的所有建筑

```bash
npx tsx scripts/export-to-geojson.ts \
  --city "New York" \
  --category architecture \
  --verified \
  --output nyc-architecture.geojson
```

### 场景 2：导出整个国家的景点

```bash
npx tsx scripts/export-to-geojson.ts \
  --country FR \
  --verified \
  --limit 1000 \
  --output france-places.geojson
```

### 场景 3：导出所有已验证的地点

```bash
npx tsx scripts/export-to-geojson.ts \
  --verified \
  --output verified-places.geojson
```

## GeoJSON 格式说明

导出的 GeoJSON 文件包含：

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [经度, 纬度]
      },
      "properties": {
        "name": "地点名称",
        "description": "详细描述\n地址\n电话\n网站\n评分",
        "city": "城市",
        "country": "国家",
        "category": "分类",
        "verified": true,
        "rating": 4.5,
        "place_id": "Google Place ID",
        "wikidata_id": "Wikidata ID"
      }
    }
  ]
}
```

## 注意事项

### Google My Maps 限制

- 每个地图最多 **10,000 个标记**
- 每个图层最多 **2,000 个标记**
- 如果超过限制，需要分多个图层或多个地图

### 建议

1. **分批导出**：如果地点很多，按城市或分类分批导出
2. **使用 --verified**：只导出已验证的地点，确保数据质量
3. **设置 --limit**：控制导出数量，避免超过 Google 限制

## 完整工作流程

### 从 Google My Maps 导入到数据库

```bash
# 1. 下载 KML
curl "https://www.google.com/maps/d/kml?forcekml=1&mid=YOUR_MAP_ID" -o my-map.kml

# 2. 解析并用 Apify 爬取
npx tsx parse-kml-for-apify.ts my-map.kml

# 3. 导入数据库
npx tsx scripts/import-apify-places.ts --file my-map-apify.json
```

### 从数据库导出到 Google My Maps

```bash
# 1. 导出 GeoJSON
npx tsx scripts/export-to-geojson.ts --city Rome --verified

# 2. 打开 Google My Maps
# 访问 https://www.google.com/mymaps

# 3. 导入 GeoJSON 文件
# 点击 Import → 选择文件 → 完成
```

## 双向同步

现在你可以：

1. **Google My Maps → 数据库**
   - 在 Google My Maps 创建地点列表
   - 下载 KML
   - 用 Apify 爬取完整信息
   - 导入数据库

2. **数据库 → Google My Maps**
   - 从数据库导出 GeoJSON
   - 导入到 Google My Maps
   - 可视化和分享

## 示例输出

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                     EXPORT PLACES TO GEOJSON                                  ║
╚══════════════════════════════════════════════════════════════════════════════╝

📋 Export filters:
   City: Rome
   Verified only: Yes
   Limit: 1000

🔍 Fetching places from database...
✅ Found 156 places

📊 Export statistics:
   Total places: 156
   Countries: 1
   Cities: 1
   Categories: 12
   Verified: 156 (100.0%)
   With rating: 142 (91.0%)
   With image: 138 (88.5%)

🔄 Converting to GeoJSON...
✅ Saved to: ./export-2025-01-08T12-30-00.geojson

📋 Sample places:
   1. Colosseum
      Rome, IT
      41.8902, 12.4922
      ⭐ 4.7/5

   2. Trevi Fountain
      Rome, IT
      41.9009, 12.4833
      ⭐ 4.6/5

   3. Pantheon
      Rome, IT
      41.8986, 12.4768
      ⭐ 4.7/5

💡 Next steps:
   1. Go to https://www.google.com/mymaps
   2. Create a new map or open existing one
   3. Click "Import" in the left panel
   4. Upload the file: ./export-2025-01-08T12-30-00.geojson
   5. Select "latitude" and "longitude" as coordinates
   6. Select "name" as the marker title

✨ Your places will appear on Google My Maps!
```

## 故障排除

### 问题：导入时 Google 无法识别坐标

**解决方案**：确保选择了正确的字段
- Latitude field: `latitude`
- Longitude field: `longitude`
- Title field: `name`

### 问题：地点太多，超过 Google 限制

**解决方案**：分批导出
```bash
# 按城市分批
npx tsx scripts/export-to-geojson.ts --city Rome --output rome.geojson
npx tsx scripts/export-to-geojson.ts --city Paris --output paris.geojson

# 或使用 limit
npx tsx scripts/export-to-geojson.ts --limit 2000 --output batch1.geojson
```

### 问题：描述信息显示不全

**解决方案**：Google My Maps 会自动截断长描述，这是正常的。点击标记可以看到完整信息。

## 相关文档

- [KML_IMPORT_GUIDE.md](./KML_IMPORT_GUIDE.md) - 从 Google My Maps 导入
- [APIFY_IMPORT_GUIDE.md](./APIFY_IMPORT_GUIDE.md) - Apify 爬取指南
