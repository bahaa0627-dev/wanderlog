下面这份是**“现在立马能让开发开工”的 Apify → Supabase 导入方案**（以你正在用的 `compass/crawler-google-places` 数据结构为准），包含：字段映射、去重/合并规则、图片策略、注意事项、以及跑 5k–10k 的执行方式。

---

## 1）目标与约束（按你的要求落地）

* **必填**：`city / country / latitude / longitude / cover_image / category`
* **唯一去重**：优先用 `google_place_id (placeId)`，Apify 输出里就是 `placeId` 
* **openingHours**：你明确要用 **Google 的 openingHours**；Apify 在 detail page 开启后会输出 `openingHours`（示例：Louvre）
* **只要 1 张图**：用 `imageUrl` 作为封面即可（Apify 输出里就有）

---

## 2）Supabase 表结构建议（最小改动即可上线）

你现有表头足够导入，但我建议**加 3 个“工程必需”字段**，否则后面规模化会非常痛：

1. `source_detail`（jsonb）：保存 Apify 的原始关键信息与 run 元数据（比如 searchString、rank、scrapedAt、fid/cid/kgmid 等）。你现在 Apify 数据里这些字段都很有用：`fid/cid/kgmid/searchString/rank/scrapedAt` 等 
2. `opening_hours_raw`（jsonb）：原样保存 Apify 的 `openingHours` 数组（你未来可以解析成结构化时间段，但原始值要保留）。示例：
3. `images`（jsonb）：统一存图片数组（即使你只要 1 张，也建议用数组结构，未来好扩展）

### 索引/唯一约束（去重的核心）

* 建议建 **partial unique index**：`unique(google_place_id) where google_place_id is not null`
* 再建一个普通索引：`index(city, country)`，方便城市级查询

---

## 3）字段映射（Apify → 你 Supabase 一条记录）

以下映射直接按你贴出来的 Apify JSON 字段来（`title/categoryName/location/placeId/imageUrl/openingHours/...` 在你文件中都能看到）：

### 3.1 直接映射表（开发照抄）

| Supabase 字段       | Apify 路径                         | 规则/转换                                                                  |
| ----------------- | -------------------------------- | ---------------------------------------------------------------------- |
| `google_place_id` | `placeId`                        | **唯一键**。示例：                                                            |
| `name`            | `title`                          | 原样；示例 `Coutume`                                                        |
| `latitude`        | `location.lat`                   | 必填；示例                                                                  |
| `longitude`       | `location.lng`                   | 必填；示例                                                                  |
| `address`         | `address`                        | 尽量保留完整地址；示例                                                            |
| `city`            | `city`                           | 必填；示例                                                                  |
| `country`         | `countryCode`                    | 用 ISO2（FR/JP…）；示例                                                      |
| `openingHours`    | （你现字段）                           | **建议改为存结构化/或保留字符串**；原始数据在 Apify 是数组：                                   |
| `rating`          | `totalScore`                     | 示例：4.6                                                                 |
| `rating_count`    | `reviewsCount`                   | 示例：321                                                                 |
| `website`         | `website`                        | 示例                                                                     |
| `phone_number`    | `phoneUnformatted`（优先）否则 `phone` | 示例                                                                     |
| `price_level`     | `price`                          | Apify 输出是字符串区间（如 `€1–10`）；建议存到 `custom_fields.price_text`，别硬转 0-4（容易错） |
| `cover_image`     | `imageUrl`                       | 你要 1 张图就用它；示例                                                          |
| `category`        | 见 3.2                            | 从 `categoryName + categories + searchString` 推断你自己的 `category_slug`    |
| `tags / ai_tags`  | 见 3.3                            | `ai_tags` 先空，等后续 LLM；原始可先落 `tags_raw` 到 `custom_fields`                |
| `description`     | `description`                    | 可能为 null，也可能有（Louvre 有）                                                |
| `source`          | 常量                               | 建议 `'apify_google_places'`                                             |
| `source_detail`   | 见 3.4                            | 记录这条从哪个 searchString/rank 来的等                                          |

### 3.2 你自己的 `category_slug` 推断规则（强规则，保证统一）

输入信息来源：

* `categoryName`：如 `Coffee shop` 
* `categories[]`：可能多个，如 `Art museum / Museum / Tourist attraction` 
* `searchString`：这条是用什么关键词搜出来的，如 `thrift store` 

**规则（按优先级从高到低，命中即停止）：**

1. 若 `categories` 包含（不区分大小写）：

   * `Museum` / `Art museum` → `museum`
   * `Art gallery` / `Gallery` → `art_gallery`
   * `Church` / `Cathedral` / `Basilica` → `church`
   * `Library` → `library`
   * `Book store` / `Bookshop` → `bookstore`
   * `Cemetery` / `Graveyard` → `cemetery`
   * `Coffee shop` / `Cafe` → `cafe`
   * `Bakery` / `Patisserie` → `bakery`
   * `Restaurant` → `restaurant`
   * `Brunch restaurant`（或 searchString=brunch）→ `brunch`
   * `Yarn store` / `Knitting` → `yarn_store`
   * `Thrift store` / `Second hand` → `thrift_store`
   * `Vintage` → `vintage_shop`
   * `Castle` → `castle`
   * `Tourist attraction` / `Landmark` → `landmark`
2. 若第 1 条没命中，用 `categoryName`
3. 若还没命中，用 `searchString` 兜底（比如你跑 feminist：`searchString: "feminist"`  → 分类可落 `landmark`，tag 打 `Feminism`，见下条）

> 你之前的结论我仍然同意：**Feminisim 更适合做 tag，而不是独立 category**（否则分类爆炸且不稳定）。

### 3.3 tags / ai_tags 的落库策略（避免重复、方便展示“最多 3 个标签合集”）

你现在需要用户端展示：**`category_en + (tags/ai_tags)`**，最多 3 个。

建议落库：

* `category`：只放“功能主类”（museum/cafe/library…）
* `tags`：放**稳定、少而粗**的人群标签与主题标签（如 `Pritzker / Brutalist / Feminism / Vegan / SpecialtyCoffee / Vintage`）
* `ai_tags (jsonb[])`：后续 LLM 只能从你允许的白名单里选（你之前已经整理过白名单逻辑）

**Apify 原始里可用来生成 tags 的字段：**

* `categories[]`（多标签）
* `additionalInfo`（很适合提炼 tag：比如 “Great coffee”“Cozy”“Tourists”等）

落地规则（导入阶段先做“非 AI 的 deterministic tags”）：

* 如果 `categories` 包含 `Tourist attraction` → tags 加 `Landmark`
* 如果 `additionalInfo` 出现 `Great coffee` → tags 加 `SpecialtyCoffee`
* 如果 `searchString == feminist` → tags 加 `Feminism`，但 category 仍按场所功能（如果它其实是 gallery/studio，就让 category 命中 gallery/studio）

> `ai_tags` 先留空，等你们后续用模型按白名单打标，避免现在就“随意打”。

### 3.4 source_detail（强烈建议这样存，未来可追溯+可合并）

把这些都塞进 `source_detail.apify`：

* `scrapedAt` 
* `searchString` 
* `rank` 
* `fid/cid/kgmid` 
* `url/searchPageUrl` 
* `imagesCount` 

并且允许 `source_detail.apify.search_hits` 是数组（同一个 place 可能来自多个 searchString）：

* `[{searchString, rank, scrapedAt, searchPageUrl}]`

---

## 4）去重与合并（你最关心的“同一个地点不能重复”）

### 4.1 唯一键优先级

1. `google_place_id = placeId`（主键，推荐 upsert 依据）
2. 若极少数没有 `placeId`（会发生），用：

   * `fid`（Google 内部 feature id）
   * 或 `cid` 
3. 再兜底：`sha1(normalized_name + rounded_latlng + city)`（只作为最后 fallback）

### 4.2 Upsert 合并策略（避免“越导越脏”）

当发生冲突（同 google_place_id）时：

* `name/address/website/phone_number`：**新值非空才覆盖旧值**
* `rating/rating_count/imagesCount`：取更“可信”的那个

  * `rating_count` 取更大
  * `rating` 若 `rating_count` 更大的一侧就用那侧
* `opening_hours_raw`：取 `scrapedAt` 更新的那份
* `categories_raw`：做集合去重 union
* `source_detail.apify.search_hits`：追加一条（不要覆盖）
* 如果你们未来允许用户编辑（收藏/笔记/自定义字段），这些字段**必须永远不被导入覆盖**（建议单独用 `custom_fields.user_*` 命名空间）

---

## 5）图片 URL
将现有的图片下载下来，再上传到 R2，数据库里显示的地址是 R2 的，另外图片地址的命名加上 google_place_id 和地点名，方便之后查找。

---

## 6）导入执行流程（开发按这个做就行）

### Step A：从 Apify 拉数据

* 通过 Apify API 读取 dataset items（分页拉取，建议每页 100）
* 每条 item 做 `normalize(item)` 转成你的 DB row（按第 3 节映射）

### Step B：过滤（保证必填）

若缺少以下任一则跳过写库，并打日志：

* `placeId`（或 fid/cid fallback 也行）
* `city / countryCode / location.lat / location.lng / imageUrl`（你要求的必填）

### Step C：Upsert 写 Supabase

* 以 `google_place_id` 做 upsert（冲突走第 4.2 合并规则）
* 批量写入（每批 100–500）

### Step D：导入后校验（必须做，不然你很快会遇到脏数据）

* 同城重复率（同 placeId 是否出现多条）
* 必填缺失率（city/country/lat/lng/cover）
* openingHours 覆盖率（旅行强依赖，覆盖率太低就需要调整 searchString 或开启更完整 detail）

---

## 7）跑到 5k–10k 的“生产级”打法（避免一次跑爆 + 方便维护更新）

1. **按城市分批**：每个城市一个 run_id（或一组 run），写入 `source_detail.apify.run_id`
2. **按主题分 run（实现“权重”）**：

   * “高优先级类”（landmark/museum/gallery/church/cafe）给更高 `maxCrawledPlacesPerSearch`
   * “小众店类”（yarn_store/vintage/thrift）给更低上限
3. **定期增量更新**：按城市每 30/60/90 天游一次（你只更新评分、营业时间、封面图、是否关闭）


**具体步骤**

1. 写 normalize(item) -> placeRow 映射（placeId/location/title/city/countryCode/openingHours/imageUrl/categories 等）

2. 写 mergeOnConflict(oldRow,newRow) 合并策略（非空覆盖、rating_count 取大、openingHours 取新、categories/tags union、source_detail.search_hits append）

3. Supabase：加 unique index on google_place_id + GIN index on source_detail/tags（如已做则跳过）

4. 导入脚本：Apify dataset 分页拉取 → 批量 upsert（100–500/批）→ 统计缺失率/去重率

5. 试跑巴黎 100 条：验证必填字段覆盖率 + openingHours 覆盖率 + 封面图可用率