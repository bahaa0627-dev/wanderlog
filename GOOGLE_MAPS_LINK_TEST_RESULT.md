# Google Maps 链接测试报告

## 测试链接
`https://maps.app.goo.gl/pJpgevR4efjKicFz8`

## 处理流程

### 1. 短链接展开 ✅
短链接成功展开为:
```
https://www.google.com/maps/@/data=!3m1!4b1!4m3!11m2!2s6vVGRF1nWgEhIBCocYbknSHSU-6GoA!3e3?entry=tts&g_ep=EgoyMDI1MTIwOS4wKgosMTAwNzkyMDY5SAFQAw%3D%3D&skid=c83b5a00-e0a4-494c-bbe6-f7f1d20a4495
```

### 2. Place ID 提取 ❌
无法从 URL 中直接提取 Place ID。该 URL 使用了特殊的编码格式，不包含标准的 `place_id` 或 `ChIJ` 格式的 ID。

### 3. Apify 爬取 ⚠️
- Apify Actor 成功启动
- Run ID: `gbsudyvEw5iF8cEai`
- 状态: SUCCEEDED
- **结果: 0 个地点**

### 问题分析

这个 Google Maps 链接是一个**保存的地点列表**（Saved Places List），具有以下特点:

1. **需要身份认证**: 可能需要登录 Google 账号才能访问
2. **特殊 URL 格式**: 使用了 `@/data=` 格式，而不是标准的地点或搜索 URL
3. **包含 skid 参数**: `skid=c83b5a00-e0a4-494c-bbe6-f7f1d20a4495` 可能是列表的唯一标识符

## 解决方案

### 方案 1: 使用 Google Maps API (推荐)
如果这是一个公开的列表，可以尝试:
```typescript
// 从 skid 参数获取列表 ID
const listId = 'c83b5a00-e0a4-494c-bbe6-f7f1d20a4495';

// 使用 Google Places API 的 List 功能（需要特定权限）
// 或者使用 My Business API
```

### 方案 2: 手动导出
1. 在浏览器中打开该链接
2. 查看列表中的所有地点
3. 手动复制每个地点的链接
4. 使用我们的 API 逐个导入:

```bash
# 示例：导入单个地点
curl -X POST http://localhost:3000/api/public-places/add-by-place-id \
  -H 'Content-Type: application/json' \
  -d '{"placeId": "ChIJ..."}'
```

### 方案 3: 使用批量导入
如果您能获取到列表中的 Place IDs:

```bash
curl -X POST http://localhost:3000/api/public-places/import-by-place-ids \
  -H 'Content-Type: application/json' \
  -d '{
    "placeIds": ["ChIJ...", "ChIJ...", ...],
    "sourceDetails": {
      "listName": "测试列表",
      "originalUrl": "https://maps.app.goo.gl/pJpgevR4efjKicFz8"
    }
  }'
```

### 方案 4: 使用标准地点链接
如果这个列表中包含具体地点，请分享单个地点的链接，例如:
- `https://maps.app.goo.gl/xxxxx` (地点短链接)
- `https://www.google.com/maps/place/...` (完整地点链接)

这些链接可以直接被 Apify 抓取。

## 当前系统能力

我们的系统已经支持以下导入方式:

### 1. 通过 Place ID 导入 ✅
```bash
POST /api/public-places/add-by-place-id
{
  "placeId": "ChIJLU7jZClu5kcR4PcOOO6p3I0"
}
```

### 2. 通过 Google Maps 链接导入 ✅
支持以下格式:
- `https://maps.google.com/maps?cid=xxx`
- `https://www.google.com/maps/place/...?place_id=xxx`
- `https://maps.app.goo.gl/xxx` (如果是单个地点)

### 3. 批量导入 Place IDs ✅
```bash
POST /api/public-places/import-by-place-ids
{
  "placeIds": ["ChIJ...", "ChIJ..."]
}
```

## 测试状态

- ✅ API 服务器运行正常
- ✅ Apify 配置正确
- ✅ Google Maps API 配置正确
- ⚠️  该特定链接格式不受支持

## 下一步建议

1. **确认链接类型**: 在浏览器中打开该链接，确认是否是:
   - 单个地点
   - 地点列表/收藏夹
   - 搜索结果
   - 路线规划

2. **获取标准链接**: 如果是列表，点击列表中的每个地点获取标准链接

3. **使用现有工具**: 我们已经有完善的导入工具可以处理标准格式的 Google Maps 链接

## 相关文档

- `/wanderlog_api/README.md` - API 文档
- `/PUBLIC_PLACES_QUICK_START.md` - 快速开始指南
- `/IMPORT_GOOGLE_MAPS_LIST_GUIDE.md` - Google Maps 导入指南
