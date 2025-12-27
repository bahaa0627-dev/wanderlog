# Requirements Document

## Introduction

本文档定义了 VAGO 应用 AI 搜索功能 V2 版本的需求。核心升级是实现 GPT-4o-mini（通过 Kouri 代理）与 Google Maps Text Search Enterprise 的并行调用架构，通过智能数据匹配和分类展示，提供更丰富、更精准的地点推荐体验。

## Glossary

- **AI_Search_Service**: 负责协调 AI 推荐和 Google Maps 搜索的后端服务组件
- **Kouri_Provider**: 通过 Kouri 代理访问 GPT-4o-mini 模型的 AI 提供者
- **Text_Search_Enterprise**: Google Maps Platform 的 Text Search (New) API，Enterprise 版本
- **Place_Matcher**: 负责将 AI 推荐地点与数据库/Google 结果进行匹配的组件
- **AI_Place**: 由 AI 生成但未经 Google Maps 验证的地点，is_verified = false
- **Verified_Place**: 拥有 google_place_id 的地点，is_verified = true
- **Category_Group**: AI 输出的地点分类组，如"精品咖啡"、"小众咖啡"等
- **Loading_Stage**: 用户界面的加载阶段状态

## Requirements

### Requirement 1: AI 模型切换

**User Story:** As a system operator, I want to use GPT-4o-mini via Kouri proxy for all text-based AI operations, so that I can balance cost and quality.

#### Acceptance Criteria

1. THE AI_Search_Service SHALL use Kouri_Provider (GPT-4o-mini) as the primary AI model for text queries
2. THE AI_Search_Service SHALL use Kouri_Provider (GPT-4o-mini) for image recognition tasks
3. WHEN Kouri_Provider is unavailable, THE AI_Search_Service SHALL fallback to Azure OpenAI or Gemini
4. THE AI_Search_Service SHALL NOT use GPT-4o for text-based operations (cost optimization)

### Requirement 2: 并行搜索架构

**User Story:** As a user, I want to get comprehensive place recommendations quickly, so that I can discover both AI-curated and Google-verified places.

#### Acceptance Criteria

1. WHEN a user submits a search query, THE AI_Search_Service SHALL invoke GPT-4o-mini and Google Text Search Enterprise in parallel
2. THE GPT-4o-mini call SHALL return within 10 seconds or timeout
3. THE Google Text Search Enterprise call SHALL return within 5 seconds or timeout
4. WHEN both services complete, THE AI_Search_Service SHALL proceed to data matching phase
5. IF one service fails, THE AI_Search_Service SHALL continue with results from the successful service

### Requirement 3: GPT-4o-mini 输出规范

**User Story:** As a user, I want AI to understand my intent and provide categorized recommendations, so that I can explore places by different themes.

#### Acceptance Criteria

1. THE GPT-4o-mini response SHALL include an acknowledgment message with reasoning approach
2. THE GPT-4o-mini response MAY include category groups (e.g., "精品咖啡", "公园", "博物馆")
3. THE GPT-4o-mini response SHALL include exactly 10 place recommendations
4. WHEN categories exist, EACH category SHALL contain at least 2 places
5. FOR EACH place, THE response SHALL include: name, summary (1-2 sentences), latitude, longitude, city, country, cover_image_url, tags (2-3 tags), recommendation_phrase
6. THE summary for each place SHALL NOT exceed 100 characters
7. THE cover_image_url SHALL be a publicly accessible image URL for the place (from AI's knowledge)
8. THE tags SHALL describe the place style (e.g., "cozy", "instagram-worthy", "historical")
9. THE recommendation_phrase SHALL be a short phrase like "highly rated", "local favorite", "hidden gem"
10. THE latitude, longitude, city, country fields SHALL be used for matching and database storage only, NOT displayed to users
11. THE recommendation_phrase SHALL be displayed to users but NOT stored in database

### Requirement 4: Google Text Search Enterprise 输出规范

**User Story:** As a system operator, I want to fetch comprehensive place data from Google Maps efficiently, so that I can provide verified place information.

#### Acceptance Criteria

1. THE Google Text Search Enterprise call SHALL return exactly 20 places per query
2. FOR EACH place, THE response SHALL include: place_id, displayName, location (lat/lng), types, addressComponents, formattedAddress, photo (1 only), openingHours, rating, userRatingCount, phoneNumber, websiteUri, googleMapsUri, priceLevel, priceRange
3. THE API call cost SHALL NOT exceed $0.0035 per request (excluding photos)
4. THE photo fetch cost SHALL NOT exceed $0.007 per photo
5. WHEN places are fetched, THE AI_Search_Service SHALL immediately sync them to Supabase database
6. WHEN photos are fetched, THE AI_Search_Service SHALL upload them to R2 and store R2 URLs

### Requirement 5: 数据匹配逻辑

**User Story:** As a user, I want to see the best matching places from multiple sources, so that I get accurate and verified recommendations.

#### Acceptance Criteria

1. WHEN both AI and Google results are ready, THE Place_Matcher SHALL match AI's 10 places against: (a) existing Supabase database, (b) newly fetched 20 Google places
2. THE matching algorithm SHALL use place name similarity and geographic proximity (within 500m)
3. WHEN categories exist AND each category has 2+ matches, THE Place_Matcher SHALL NOT supplement with AI-only places
4. WHEN no categories exist AND 5+ total matches found, THE Place_Matcher SHALL NOT supplement with AI-only places
5. WHEN matches are insufficient, THE Place_Matcher SHALL use AI-generated content for cards and details
6. THE final output list SHALL contain matched places first, then AI-only places if needed

### Requirement 6: 最终输出生成

**User Story:** As a user, I want personalized summaries for each recommended place, so that I understand why each place is recommended.

#### Acceptance Criteria

1. WHEN the final place list is determined, THE AI_Search_Service SHALL send place names, coordinates, and country to GPT-4o-mini
2. THE GPT-4o-mini SHALL generate a summary for each place (1-2 sentences)
3. THE GPT-4o-mini SHALL generate an overall summary for the entire recommendation
4. THE overall summary SHALL include a friendly closing message (e.g., "祝旅途愉快")

### Requirement 7: 用户界面加载状态

**User Story:** As a user, I want to see detailed loading progress, so that I know what the system is doing.

#### Acceptance Criteria

1. THE App SHALL display "分析用户诉求" for exactly 1 second (Stage 1)
2. THE App SHALL display "正在寻找合适地点" while GPT-4o-mini and Google Text Search are running (Stage 2)
3. THE App SHALL display "总结输出中" while data matching and summary generation are running (Stage 3)
4. WHEN all stages complete, THE App SHALL immediately show results without loading indicator

### Requirement 8: 结果展示 - 承接文案

**User Story:** As a user, I want a friendly introduction to my search results, so that I feel the AI understands my needs.

#### Acceptance Criteria

1. THE App SHALL display an acknowledgment message before showing results
2. THE acknowledgment message SHALL reference the user's query intent
3. THE acknowledgment message SHALL mention the recommendation approach (e.g., "I will recommend from 3 aspects")
4. THE acknowledgment message SHALL be in the same language as the user's query

### Requirement 9: 结果展示 - 分类内容

**User Story:** As a user, I want to browse places by category, so that I can explore different types of recommendations.

#### Acceptance Criteria

1. WHEN categories exist, THE App SHALL display category titles (e.g., "精品咖啡", "小众咖啡")
2. WHEN categories exist, EACH category SHALL show 2-5 place cards
3. WHEN categories exist, THE cards SHALL be displayed in horizontal scroll with 4:3 aspect ratio
4. WHEN no categories exist, THE App SHALL display up to 5 places in flat layout
5. WHEN no categories exist, THE cards SHALL use horizontal card style (same as current)
6. FOR EACH place card, THE App SHALL display: cover image, name, rating, rating count, summary

### Requirement 10: 结果展示 - 总结与地图

**User Story:** As a user, I want to see a summary and map of all recommendations, so that I can plan my visit.

#### Acceptance Criteria

1. THE App SHALL display an overall summary after all place cards
2. THE summary SHALL include a friendly closing message
3. THE App SHALL display a map showing all recommended places as markers
4. THE map SHALL support zoom in/out
5. THE map SHALL NOT support additional search or filtering

### Requirement 11: AI 地点卡片与详情

**User Story:** As a user, I want to see AI-generated place information when Google data is unavailable, so that I can still explore recommendations.

#### Acceptance Criteria

1. WHEN a place is AI-only (no Google match), THE card SHALL display: AI-generated cover image URL, place name, AI recommendation phrase (e.g., "highly rated")
2. WHEN a place is AI-only, THE detail page SHALL display: AI-generated cover image URL, AI-generated tags, AI summary, basic location info
3. THE AI-generated cover image URL SHALL be provided by GPT-4o-mini in the initial parallel call (not via separate web search)
4. THE AI recommendation phrase SHALL replace rating/rating count display
5. ALL AI place content (image URL, tags, summary, coordinates) SHALL come from the GPT-4o-mini response in Requirement 3

### Requirement 12: UI 格式调整

**User Story:** As a user, I want a cleaner chat interface, so that I can focus on the recommendations.

#### Acceptance Criteria

1. THE App SHALL NOT display AI avatar icon in responses
2. THE App SHALL NOT display background card for AI responses
3. THE response text SHALL be displayed directly without container styling

### Requirement 13: 使用限制

**User Story:** As a system operator, I want to limit API usage, so that I can control costs.

#### Acceptance Criteria

1. THE System SHALL limit logged-in users to 10 AI searches per day
2. THE limit SHALL apply because each search invokes Google Maps API
3. WHEN limit is exceeded, THE App SHALL inform user and suggest trying again tomorrow
4. THE App SHALL display remaining search count in the interface

### Requirement 14: AI 地点数据持久化

**User Story:** As a system operator, I want to store AI-generated places for future enrichment, so that I can build a comprehensive place database.

#### Acceptance Criteria

1. WHEN an AI-only place is displayed, THE AI_Search_Service SHALL save it to Supabase with is_verified = false
2. THE AI_Place record MAY have empty fields (rating, opening_hours, etc.)
3. THE System SHALL periodically update AI_Place records via Apify scraping
4. WHEN a place gains a google_place_id, THE System SHALL set is_verified = true
5. ALL places with google_place_id SHALL have is_verified = true (including existing records)
6. THE System SHALL run a migration to set is_verified = true for all existing places that have google_place_id
7. THE field mapping from GPT-4o-mini output to Supabase SHALL be:
   - name → name
   - summary → ai_description
   - tags → ai_tags
   - cover_image_url → cover_image
   - latitude → latitude
   - longitude → longitude
   - city → city
   - country → country
8. THE recommendation_phrase SHALL NOT be stored in database (display only)
