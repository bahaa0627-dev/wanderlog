# Requirements Document

## Introduction

本文档定义了 VAGO 应用 AI 搜索功能的成本优化需求。核心策略是区分"深度搜索"和"详情查看"两种计费行为，结合数据库缓存实现精细化成本控制。

## Glossary

- **AI_Search_Service**: 负责解析用户查询意图并生成地点推荐的 AI 服务组件
- **Deep_Search**: 深度搜索，调用 Google Maps API 生成 JSON 格式地点卡片的行为
- **Detail_View**: 详情查看，点击进入地点详情页拉取完整数据的行为
- **Places_Cache**: Supabase 数据库中的地点缓存表，存储已获取的地点详情
- **Cached_Place**: 来自 Supabase 数据库的地点，不消耗配额
- **Google_Place**: 需要调用 Google API 获取的地点，消耗配额
- **Text_Fallback**: 纯文本降级推荐，不生成卡片，不调用 Google API

## Requirements

### Requirement 1: AI 模型切换

**User Story:** As a system operator, I want to use a cheaper AI model, so that I can reduce AI inference costs.

#### Acceptance Criteria

1. THE AI_Search_Service SHALL use Gemini 1.5 Flash model for all AI operations (intent parsing and recommendations)
2. THE AI_Search_Service SHALL NOT use GPT-4o, GPT-4o-mini, or Gemini Pro models
3. WHEN Gemini 1.5 Flash is unavailable, THE AI_Search_Service SHALL return an error instead of falling back to expensive models

### Requirement 2: 深度搜索配额限制

**User Story:** As a user, I want to perform AI-powered searches with card results, so that I can discover new places visually.

#### Acceptance Criteria

1. THE System SHALL limit Deep_Search to 10 times per day per user
2. WHEN a search returns place cards generated from Google_Places_API, THE System SHALL count it as 1 Deep_Search
3. WHEN a search returns place cards entirely from Places_Cache (Supabase), THE System SHALL NOT count it toward Deep_Search quota
4. WHEN Deep_Search quota is exceeded AND Places_Cache has no matching results, THE System SHALL return Text_Fallback recommendations without calling Google API
5. WHEN Deep_Search quota is exceeded AND Places_Cache has partial results, THE System SHALL return only Cached_Place cards

### Requirement 3: 详情查看配额限制

**User Story:** As a user, I want to view detailed information about places, so that I can make informed decisions.

#### Acceptance Criteria

1. THE System SHALL limit Detail_View of Google_Place to 20 times per day per user
2. WHEN a user views details of a Cached_Place (from Supabase), THE System SHALL NOT count it toward Detail_View quota
3. WHEN a user views details of a Google_Place (requires API call), THE System SHALL count it as 1 Detail_View
4. WHEN Detail_View quota is exceeded, THE System SHALL show cached basic info and inform user quota is reached

### Requirement 4: 数据库缓存优先查询（已有）

**User Story:** As a user, I want to get search results quickly from cached data, so that I can see recommendations without waiting.

#### Acceptance Criteria

1. WHEN a user searches for places, THE AI_Search_Service SHALL first query the Places_Cache for matching results
2. WHEN the Places_Cache contains sufficient results, THE AI_Search_Service SHALL return cached results without calling Google_Places_API
3. WHEN cached results are returned, THE System SHALL NOT consume any quota
4. THE Places_Cache SHALL store all place details including coordinates, rating, images, and opening hours

### Requirement 5: 智能缓存写入（已有）

**User Story:** As a system operator, I want to build a comprehensive place database over time, so that future searches become cheaper.

#### Acceptance Criteria

1. WHEN a place is fetched from Google_Places_API, THE AI_Search_Service SHALL immediately save it to Places_Cache
2. WHEN saving to Places_Cache, THE AI_Search_Service SHALL store the google_place_id as a unique identifier for deduplication
3. IF a place with the same google_place_id already exists, THEN THE AI_Search_Service SHALL update the existing record instead of creating a duplicate

### Requirement 6: R2 图片缓存（已有）

**User Story:** As a user, I want to see place images without delays, so that I can visually browse recommendations.

#### Acceptance Criteria

1. WHEN a place is saved to Places_Cache, THE AI_Search_Service SHALL store R2-hosted image URLs
2. WHEN displaying cached places, THE App SHALL use R2 image URLs directly without calling Google Photos API
3. THE AI_Search_Service SHALL upload Google photos to R2 only once per place, during initial fetch

### Requirement 7: 纯文本降级推荐

**User Story:** As a user, I want to still get recommendations even when my quota is exceeded, so that I can continue exploring.

#### Acceptance Criteria

1. WHEN Deep_Search quota is exceeded AND no cached results available, THE AI_Search_Service SHALL return text-only recommendations
2. THE Text_Fallback response SHALL include place names, brief descriptions, and suggested search terms
3. THE Text_Fallback response SHALL NOT include images, ratings, or coordinates
4. THE Text_Fallback response SHALL inform user that card generation is unavailable due to quota

### Requirement 8: 配额状态展示

**User Story:** As a user, I want to see my remaining quota, so that I can plan my usage.

#### Acceptance Criteria

1. THE App SHALL display remaining Deep_Search quota in the search interface
2. THE App SHALL display remaining Detail_View quota in the place detail interface
3. WHEN quota is low (≤ 2 remaining), THE App SHALL show a warning indicator
4. THE App SHALL show quota reset time (next day 00:00 UTC)
