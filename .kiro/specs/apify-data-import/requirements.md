# Requirements Document

## Introduction

本功能设计 Apify 爬取的 Google Places 数据如何导入到 Supabase 数据库中。需要解决字段映射、数据去重与合并、图片存储到 R2、以及分类标签归一化等问题。

## Glossary

- **Apify_Crawler**: Apify 平台上的 Google Places 爬虫 Actor (compass/crawler-google-places)
- **Place**: Supabase 数据库中的地点表，存储归一化后的地点信息
- **Google_Place_ID**: Google Maps 为每个地点分配的唯一标识符（如 ChIJZ7SPu5xv5kcRGMfYOG3bVhs）
- **R2**: Cloudflare R2 对象存储，用于存储地点封面图片
- **Normalization_Service**: 现有的归一化服务，负责将多源数据转换为统一的分类和标签体系
- **Source_Details**: Place 表中的 JSON 字段，用于存储 Apify 原始元数据（searchString、rank、scrapedAt 等）
- **Custom_Fields**: Place 表中的 JSON 字段，用于存储额外数据

## Requirements

### Requirement 1: 字段映射

**User Story:** As a 数据管理员, I want to 将 Apify 爬取的数据字段映射到 Supabase Place 表, so that 数据可以正确存储并被应用使用。

#### Acceptance Criteria

1. WHEN Apify 数据包含 title 字段 THEN THE Import_Service SHALL 映射到 Place.name
2. WHEN Apify 数据包含 location.lat 和 location.lng THEN THE Import_Service SHALL 映射到 Place.latitude 和 Place.longitude
3. WHEN Apify 数据包含 address 字段 THEN THE Import_Service SHALL 映射到 Place.address
4. WHEN Apify 数据包含 city THEN THE Import_Service SHALL 映射到 Place.city
5. WHEN Apify 数据包含 countryCode THEN THE Import_Service SHALL 映射到 Place.country（ISO2 格式如 FR/JP）
6. WHEN Apify 数据包含 totalScore THEN THE Import_Service SHALL 映射到 Place.rating
7. WHEN Apify 数据包含 reviewsCount THEN THE Import_Service SHALL 映射到 Place.ratingCount
8. WHEN Apify 数据包含 placeId THEN THE Import_Service SHALL 映射到 Place.googlePlaceId
9. WHEN Apify 数据包含 website THEN THE Import_Service SHALL 映射到 Place.website
10. WHEN Apify 数据包含 phoneUnformatted 或 phone THEN THE Import_Service SHALL 优先使用 phoneUnformatted 映射到 Place.phoneNumber
11. WHEN Apify 数据包含 openingHours 数组 THEN THE Import_Service SHALL 原样存储为 JSON 到 Place.openingHours
12. WHEN Apify 数据包含 price 字段（如 €1–10）THEN THE Import_Service SHALL 存储到 customFields.priceText（不硬转 0-4）
13. WHEN Apify 数据包含 description THEN THE Import_Service SHALL 映射到 Place.description
14. THE Import_Service SHALL 设置 Place.source 为 'apify_google_places'

### Requirement 2: 数据去重与合并

**User Story:** As a 数据管理员, I want to 确保导入的地点不会重复且数据能正确合并, so that 数据库保持数据一致性和完整性。

#### Acceptance Criteria

1. WHEN 导入地点时 THEN THE Import_Service SHALL 以 googlePlaceId (placeId) 作为主要唯一键进行 upsert
2. WHEN placeId 不存在 THEN THE Import_Service SHALL 使用 fid 或 cid 作为备选唯一标识
3. WHEN 发生冲突（同 googlePlaceId）THEN THE Import_Service SHALL 对 name/address/website/phoneNumber 执行"新值非空才覆盖旧值"策略
4. WHEN 发生冲突 THEN THE Import_Service SHALL 对 ratingCount 取较大值，rating 取 ratingCount 较大一侧的值
5. WHEN 发生冲突 THEN THE Import_Service SHALL 对 openingHours 取 scrapedAt 更新的那份
6. WHEN 发生冲突 THEN THE Import_Service SHALL 对 sourceDetails.apify.searchHits 追加新记录而非覆盖
7. THE Import_Service SHALL 返回导入统计（新增数、更新数、跳过数、失败数）
8. IF 缺少必填字段（placeId、city、countryCode、latitude、longitude）THEN THE Import_Service SHALL 跳过该记录并记录警告

### Requirement 3: 图片存储到 R2

**User Story:** As a 数据管理员, I want to 将地点封面图片存储到 R2, so that 图片可以稳定访问且不暴露 placeId。

#### Acceptance Criteria

1. WHEN Apify 数据包含 imageUrl THEN THE Import_Service SHALL 下载图片并上传到 R2
2. THE Import_Service SHALL 使用 UUID 作为图片文件名，格式为 `places/cover/v1/{uuid_prefix2}/{uuid_prefix4}/{uuid}.jpg`
3. THE Import_Service SHALL 将图片转换为 JPEG 格式（质量 82-88，最长边限制 1600px）
4. THE Import_Service SHALL 设置 R2 对象的 Content-Type 为 image/jpeg，Cache-Control 为 public, max-age=31536000, immutable
5. THE Import_Service SHALL 将 R2 公开 URL 存储到 Place.coverImage
6. THE Import_Service SHALL 将 R2 key 存储到 customFields.r2Key
7. THE Import_Service SHALL 将原始 imageUrl 存储到 customFields.imageSourceUrl
8. WHEN 图片下载失败（超时 10s 或网络错误）THEN THE Import_Service SHALL 重试 1 次，仍失败则跳过图片但继续导入其他字段
9. THE Import_Service SHALL 禁止在 R2 key 或 URL 中出现 googlePlaceId

### Requirement 4: 分类和标签归一化

**User Story:** As a 数据管理员, I want to 将 Apify 的分类数据归一化到系统标准分类, so that 数据可以被正确检索和展示。

#### Acceptance Criteria

1. WHEN Apify 数据包含 categoryName 和 categories THEN THE Import_Service SHALL 调用 NormalizationService 确定 categorySlug/categoryEn/categoryZh
2. THE Import_Service SHALL 按以下优先级推断分类：categories 数组 > categoryName > searchString
3. WHEN categories 包含 Museum/Art museum THEN THE Import_Service SHALL 设置 categorySlug 为 museum
4. WHEN categories 包含 Art gallery/Gallery THEN THE Import_Service SHALL 设置 categorySlug 为 art_gallery
5. WHEN categories 包含 Coffee shop/Cafe THEN THE Import_Service SHALL 设置 categorySlug 为 cafe
6. WHEN categories 包含 Bakery/Patisserie THEN THE Import_Service SHALL 设置 categorySlug 为 bakery
7. WHEN categories 包含 Restaurant THEN THE Import_Service SHALL 设置 categorySlug 为 restaurant
8. WHEN categories 包含 Thrift store/Second hand THEN THE Import_Service SHALL 设置 categorySlug 为 thrift_store
9. WHEN categories 包含 Tourist attraction/Landmark THEN THE Import_Service SHALL 设置 categorySlug 为 landmark
10. WHEN searchString 为 feminist THEN THE Import_Service SHALL 添加 tag Feminism（分类仍按场所功能）
11. THE Import_Service SHALL 将 aiTags 先留空，等后续 LLM 按白名单打标

### Requirement 5: 元数据存储

**User Story:** As a 数据管理员, I want to 保留 Apify 数据的原始元数据, so that 未来可以追溯数据来源和进行增量更新。

#### Acceptance Criteria

1. THE Import_Service SHALL 在 sourceDetails.apify 中存储 scrapedAt、searchString、rank、fid、cid、kgmid
2. THE Import_Service SHALL 在 sourceDetails.apify.searchHits 中以数组形式存储多次导入记录 [{searchString, rank, scrapedAt, searchPageUrl}]
3. WHEN Apify 数据包含 additionalInfo THEN THE Import_Service SHALL 存储到 customFields.additionalInfo
4. WHEN Apify 数据包含 reviewsTags THEN THE Import_Service SHALL 存储到 customFields.reviewsTags
5. WHEN Apify 数据包含 popularTimesHistogram THEN THE Import_Service SHALL 存储到 customFields.popularTimes
6. WHEN Apify 数据包含 reviewsDistribution THEN THE Import_Service SHALL 存储到 customFields.reviewsDistribution
7. WHEN Apify 数据包含 categories 数组 THEN THE Import_Service SHALL 存储到 customFields.categoriesRaw

### Requirement 6: 导入执行方式

**User Story:** As a 开发者, I want to 通过脚本执行数据导入, so that 可以批量处理 Apify 数据。

#### Acceptance Criteria

1. THE Import_Service SHALL 支持从本地 JSON 文件导入数据
2. THE Import_Service SHALL 支持通过 Apify API 分页获取 Dataset 数据（每页 100 条）
3. THE Import_Service SHALL 提供 CLI 脚本支持批量导入
4. THE Import_Service SHALL 支持批量 upsert（每批 100-500 条）
5. THE Import_Service SHALL 在批量操作间添加适当延迟以避免数据库压力
6. WHEN 处理大数据集 THEN THE Import_Service SHALL 显示进度信息

### Requirement 7: 导入后校验

**User Story:** As a 数据管理员, I want to 在导入后验证数据质量, so that 可以及时发现和处理问题。

#### Acceptance Criteria

1. THE Import_Service SHALL 在导入完成后输出汇总报告
2. THE Import_Service SHALL 统计必填字段覆盖率（city/country/lat/lng/coverImage）
3. THE Import_Service SHALL 统计 openingHours 覆盖率
4. THE Import_Service SHALL 统计封面图可用率
5. THE Import_Service SHALL 检测同城重复率（同 placeId 是否出现多条）
6. THE Import_Service SHALL 支持 dry-run 模式，只验证数据不实际写入
