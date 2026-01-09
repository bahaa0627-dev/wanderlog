# Wikidata 数据精准丰富方案

## 问题分析

当前 Apify Google Places 爬虫的问题：
- 输入地点名称后，返回的是 **搜索结果**，不是精确匹配
- 会返回大量"附近地点"，导致数据膨胀
- 匹配率只有约 26%

## 方案对比

### 方案 1: 使用 Google Place ID 精确查询 ⭐ 推荐

**原理**: Wikidata 中很多地点有对应的 Google Place ID (P8749 属性)

**步骤**:
1. 从 Wikidata SPARQL 查询每个地点的 Google Place ID
2. 用 Place ID 直接调用 Google Places API 或 Apify
3. 100% 精确匹配

**优点**:
- 精确匹配，无额外数据
- 成本可控

**缺点**:
- 不是所有 Wikidata 地点都有 Google Place ID
- 需要先查询 Wikidata 获取 Place ID

**SPARQL 查询示例**:
```sparql
SELECT ?item ?itemLabel ?googlePlaceId WHERE {
  ?item wdt:P8749 ?googlePlaceId .  # Google Place ID
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT 1000
```

---

### 方案 2: 使用坐标 + 名称精确搜索

**原理**: 用精确坐标和名称组合搜索

**Apify 配置**:
```json
{
  "searchStringsArray": ["Eiffel Tower"],
  "lat": "48.8584",
  "lng": "2.2945",
  "zoom": 18,  // 高缩放级别，限制搜索范围
  "maxCrawledPlaces": 1  // 只取第一个结果
}
```

**优点**:
- 不需要预先获取 Place ID
- 匹配率较高

**缺点**:
- 仍可能有误匹配
- 需要逐个地点调用

---

### 方案 3: Google Places API 直接调用

**原理**: 使用 Google Places API 的 Find Place 或 Place Details

**Find Place API**:
```
https://maps.googleapis.com/maps/api/place/findplacefromtext/json
  ?input=Eiffel Tower
  &inputtype=textquery
  &locationbias=point:48.8584,2.2945
  &fields=place_id,name,formatted_address,rating,opening_hours
  &key=YOUR_API_KEY
```

**优点**:
- 官方 API，最精确
- 可以用 locationbias 限制搜索范围

**缺点**:
- 需要 Google API Key
- 有调用限制和费用

---

### 方案 4: 合并现有数据（推荐先做）

**原理**: 用现有的 Apify 数据更新 Wikidata 记录，而不是创建新记录

**步骤**:
1. 对于 478 条确定重复的数据（名字相同或相似）
2. 将 Apify 的 rating, google_place_id, opening_hours 等字段合并到 Wikidata 记录
3. 删除 Apify 的重复记录

**优点**:
- 不需要额外 API 调用
- 保留 Wikidata 的 source_detail (QID)

---

## 推荐执行顺序

1. **立即执行**: 合并 478 条确定重复的数据
2. **短期**: 对剩余 Wikidata 数据，查询是否有 Google Place ID
3. **中期**: 用 Place ID 精确获取详细信息
4. **长期**: 对没有 Place ID 的，用坐标+名称精确搜索

## 合并脚本示例

```typescript
// 将 Apify 数据合并到 Wikidata 记录
async function mergeApifyToWikidata(wikidataId: string, apifyId: string) {
  // 获取 Apify 数据
  const { data: apify } = await supabase
    .from('places')
    .select('*')
    .eq('id', apifyId)
    .single();

  // 更新 Wikidata 记录
  await supabase
    .from('places')
    .update({
      rating: apify.rating,
      rating_count: apify.rating_count,
      google_place_id: apify.google_place_id,
      opening_hours: apify.opening_hours,
      description: apify.description || undefined,
      // 保留 Wikidata 的 source 和 source_detail
    })
    .eq('id', wikidataId);

  // 删除 Apify 重复记录
  await supabase
    .from('places')
    .delete()
    .eq('id', apifyId);
}
```

## 下一步

1. 你确认要合并哪些重复数据？
2. 是否需要我写合并脚本？
3. 是否需要查询 Wikidata 获取 Google Place ID？
