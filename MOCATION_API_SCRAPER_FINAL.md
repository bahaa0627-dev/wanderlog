# Mocation API 爬虫 - 最终版本

## 完成时间
2026-01-20

## 解决方案

使用 Mocation 的 API 接口直接获取数据，无需爬取 HTML 页面！

### API 端点
```
https://prd.mocation.cc/api/movie/{movieId}
```

## 功能特点

### ✅ 已完整实现
1. **获取所有地点** - API 返回电影的所有地点（33个全部获取）
2. **坐标信息** - latitude, longitude 直接从 API 获取
3. **城市和国家** - 自动分离，国家名称转换为英文
4. **地点 ID** - 每个地点都有唯一的 placeId
5. **封面图** - 使用 movie 页的剧照作为封面
6. **场景信息** - 包含场景描述、集数、时间戳

### 数据字段

```json
{
  "placeId": 33742,
  "name": "卡罗三世广场",
  "nameEn": "Piazza Carlo III",
  "city": "那不勒斯",
  "country": "Italy",
  "latitude": 40.8627708,
  "longitude": 14.2665571,
  "address": null,
  "phoneNumber": null,
  "category": null,
  "categoryEn": null,
  "website": null,
  "coverImage": "http://cache.fotoplace.cc/mocation/...",
  "sceneImages": ["http://cache.fotoplace.cc/mocation/..."],
  "sceneDescription": "埃莱娜偶遇阿方索",
  "episode": 1,
  "position": 745
}
```

## 使用方法

### 1. 爬取电影数据

```bash
npx tsx wanderlog_api/scrape-movie-api.ts <movie_id> [output_file]

# 示例
npx tsx wanderlog_api/scrape-movie-api.ts 5448
```

### 2. 输出文件

默认输出到：`wanderlog_api/mocation-movie-{movieId}-api.json`

### 3. 导入到数据库

使用现有的导入脚本：

```bash
npx tsx wanderlog_api/scripts/import-mocation-json.ts \
  wanderlog_api/mocation-movie-5448-final.json \
  --upload-r2
```

## 数据对比

### 之前的方案（HTML 爬取）
- ❌ 需要爬取 movie 页面
- ❌ 需要爬取每个 place_detail 页面（33次）
- ❌ 需要 Google Places API 获取坐标
- ❌ 速度慢（需要等待页面渲染）
- ❌ 不稳定（依赖 HTML 结构）

### 现在的方案（API）
- ✅ 只需一次 API 调用
- ✅ 直接获取所有数据
- ✅ 坐标已包含在 API 响应中
- ✅ 速度快（< 1秒）
- ✅ 稳定可靠

## 数据完整性

### 已包含的字段
- ✅ placeId - 地点唯一 ID
- ✅ name - 中文名称
- ✅ nameEn - 英文名称
- ✅ city - 城市（中文）
- ✅ country - 国家（英文）
- ✅ latitude - 纬度
- ✅ longitude - 经度
- ✅ coverImage - 封面图（movie 页剧照）
- ✅ sceneImages - 场景图片数组
- ✅ sceneDescription - 场景描述
- ✅ episode - 集数
- ✅ position - 时间戳（秒）

### 暂未包含的字段（需要额外 API 调用）
- ⏳ address - 详细地址
- ⏳ phoneNumber - 电话号码
- ⏳ category - 分类
- ⏳ website - 网站

这些字段可以通过调用 place detail API 获取：
```
https://prd.mocation.cc/api/place/{placeId}
```

## 下一步优化

如果需要获取地址、电话、分类等信息，可以：

1. 对每个 placeId 调用 place detail API
2. 合并数据
3. 添加适当的延迟避免速率限制

示例代码：
```typescript
async function enrichPlaceDetails(placeId: number) {
  const response = await axios.get(`${MOCATION_API_BASE}/place/${placeId}`);
  const place = response.data.data.place;
  return {
    address: place.address,
    phoneNumber: place.phone,
    category: place.categories,
    // ... 其他字段
  };
}
```

## 性能对比

### HTML 爬取方案
- 时间：~60秒（33个地点 × 2秒/地点）
- API 调用：0
- 浏览器实例：需要

### API 方案（当前）
- 时间：< 1秒
- API 调用：1次
- 浏览器实例：不需要

### API 方案（含详情）
- 时间：~35秒（1次 movie API + 33次 place API × 1秒）
- API 调用：34次
- 浏览器实例：不需要

## 相关文件

- `wanderlog_api/scrape-movie-api.ts` - API 爬虫脚本
- `wanderlog_api/mocation-movie-5448-final.json` - 输出数据
- `wanderlog_api/scripts/import-mocation-json.ts` - 导入脚本

## 测试结果

电影 ID 5448（我的天才女友 第二季）：
- ✅ 33 个地点全部获取
- ✅ 所有坐标正确
- ✅ 城市和国家正确分离
- ✅ 国家名称已转换为英文
- ✅ 封面图使用 movie 页剧照
- ✅ 场景信息完整

## 总结

通过使用 Mocation 的 API 接口，我们实现了：
1. ✅ 获取所有地点数据
2. ✅ 城市和国家正确分离（英文）
3. ✅ 坐标信息完整
4. ✅ 封面图使用 movie 页图片
5. ⏳ 地址、电话、分类（可选，需额外 API 调用）

这个方案比 HTML 爬取快 60 倍，更稳定可靠！
