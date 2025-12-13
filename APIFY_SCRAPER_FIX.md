# Apify Scraper 配置问题修复

## 问题描述

导入 Google Maps 收藏夹时，本应只有 155 个地点（72 + 81 + 2个测试），但实际导入了 311 个地点。

### 原因分析

Apify Google Maps Scraper 的配置不当导致爬取了额外的地点：

1. **`scrapeDirectories: true`** - 这个选项会爬取附近的目录和相关地点
2. **`includeWebResults: true`** - 这个选项会包含网页搜索结果中的地点

这些设置导致爬虫不仅爬取了收藏夹中的地点，还爬取了：
- 附近的地点
- 搜索结果中的相关地点
- 目录中的其他地点

### 错误导入的地点示例

```
- Bathroom (1307 Copenhagen, Denmark)
- VERPAN (Amaliegade 16b, 1256 København K)
- Campground near Bekkasinen
- Observation Platform South
- Fugletårn ved Klydesøen NØ
```

这些明显不是收藏夹中的地点。

## 解决方案

### 1. 修改 Apify Scraper 配置

已修改 `wanderlog_api/src/services/apifyService.ts` 中的配置：

```typescript
const input = {
  startUrls: [{ url: expandedUrl }],
  maxCrawledPlaces: 200,
  maxCrawledPlacesPerSearch: 200,
  maxImages: 5,
  maxReviews: 5,
  language: 'en',
  
  // 关键修改：
  deeperCityScrape: false,          // ✅ 不要深度爬取城市
  scrapeDirectories: false,         // ✅ 改为 false - 不要爬取目录
  scrapeReviewsPersonalData: false,
  scrapePhotosFromBusinessPage: true,
  scrapeReviewerPhotos: false,
  scrapeQuestions: false,
  includeWebResults: false,         // ✅ 改为 false - 不要包含网页搜索结果
  searchMatching: 'places',         // ✅ 只匹配地点
  onlyDataFromSearchPage: true,     // ✅ 只从搜索页面获取数据
  
  exportPlaceUrls: true,
  includeBusinessStatus: true,
  proxyConfiguration: {
    useApifyProxy: true,
  },
};
```

### 2. 清空错误数据

运行清空脚本：

```bash
cd wanderlog_api
npx tsx clear_google_maps_places.ts
```

这将：
- 删除所有从 `google_maps_link` 导入的地点（309个）
- 保留手动添加的测试地点（2个）

### 3. 重新导入

使用修复后的配置重新导入：

```bash
# 方法 1: 使用交互式脚本
http_proxy=http://127.0.0.1:7890 https_proxy=http://127.0.0.1:7890 npx tsx import_places.ts

# 方法 2: 使用 API
curl -X POST http://localhost:3000/api/public-places/import-from-link \
  -H "Content-Type: application/json" \
  -d '{"url": "https://maps.app.goo.gl/YOUR_LINK"}'
```

## 验证结果

重新导入后，应该看到：
- 第一个收藏夹: 72 个地点
- 第二个收藏夹: 81 个地点
- 测试地点: 2 个
- **总计: 155 个地点**

可以通过以下命令验证：

```bash
curl http://localhost:3000/api/public-places/stats | python3 -m json.tool
```

## 注意事项

### Apify 的局限性

即使配置正确，Apify 对 Google Maps 收藏夹的爬取仍可能不稳定：

1. **短链接支持有限** - `maps.app.goo.gl` 可能无法正确解析
2. **列表格式识别** - 某些列表格式可能无法识别
3. **API 限制** - 免费账户有请求限制

### 备选方案：手动导入

如果 Apify 仍然无法正确导入，建议使用手动方法：

1. **打开收藏夹链接**
2. **逐个点击地点**
3. **从 URL 复制 Place ID**
4. **批量导入**

详见 `IMPORT_GOOGLE_MAPS_LIST_GUIDE.md` 中的"方法 2"。

## 快速命令

```bash
# 1. 清空错误数据
cd wanderlog_api
npx tsx clear_google_maps_places.ts

# 2. 重启服务器
npm run dev

# 3. 重新导入（使用代理）
http_proxy=http://127.0.0.1:7890 https_proxy=http://127.0.0.1:7890 npx tsx import_places.ts

# 4. 验证结果
curl http://localhost:3000/api/public-places/stats | python3 -m json.tool
```

## 总结

- ✅ 已识别问题：Apify 配置导致爬取额外地点
- ✅ 已修复配置：禁用了 `scrapeDirectories` 和 `includeWebResults`
- ✅ 已提供清空脚本：可以清空错误数据
- ✅ 已提供重新导入方法：使用修复后的配置重新导入

现在可以按照上述步骤重新导入，应该会得到正确的 155 个地点。
