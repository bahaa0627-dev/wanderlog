# Requirements Document

## Introduction

扩展 AI 搜索系统的意图识别能力，在现有 `general_search`（泛泛找地点）基础上，新增三种意图类型：`specific_place`（找具体地点）、`travel_consultation`（旅游咨询）、`non_travel`（非旅游内容）。每种意图有不同的处理流程和响应格式，提供更精准的用户体验。

## Glossary

- **Intent_Classifier**: 意图分类器，负责识别用户查询的意图类型
- **Search_System**: 搜索系统，处理用户查询并返回结果
- **Place_Matcher**: 地点匹配器，将地点名称与数据库记录匹配
- **Text_Generator**: 文本生成器，生成 AI 文字回答
- **Related_Places**: 相关地点，从 AI 回答中提取并匹配到数据库的地点列表

## Requirements

### Requirement 1: Intent Classification

**User Story:** As a user, I want the system to understand my query intent, so that I receive the most appropriate response format.

#### Acceptance Criteria

1. WHEN a user submits a query, THE Intent_Classifier SHALL classify it into one of four intents: `general_search`, `specific_place`, `travel_consultation`, or `non_travel`
2. WHEN the query contains specific place names like "Eiffel Tower" or "Denmark Design Museum", THE Intent_Classifier SHALL classify it as `specific_place`
3. WHEN the query requests multiple places with criteria like "8 restaurants in Tokyo", THE Intent_Classifier SHALL classify it as `general_search`
4. WHEN the query is travel-related but without specific place requests like "欧洲哪里好玩" or "Plan a 3-day trip to Rome", THE Intent_Classifier SHALL classify it as `travel_consultation`
5. WHEN the query is not travel-related like "北京天气" or "推荐运动方案", THE Intent_Classifier SHALL classify it as `non_travel`
6. THE Intent_Classifier SHALL complete classification within 10 seconds
7. IF AI classification fails, THEN THE Intent_Classifier SHALL use rule-based fallback detection

### Requirement 2: Specific Place Query Handling

**User Story:** As a user, I want to get detailed information about a specific place, so that I can learn about it before visiting.

#### Acceptance Criteria

1. WHEN intent is `specific_place`, THE Search_System SHALL generate an AI description about the place
2. WHEN intent is `specific_place`, THE Place_Matcher SHALL search the database for matching places
3. WHEN a matching place with cover image is found, THE Search_System SHALL return both the description and place card
4. WHEN no matching place is found, THE Search_System SHALL return only the AI description
5. THE Search_System SHALL prioritize places with cover images when multiple matches exist
6. THE AI description SHALL be 2-3 sentences, under 100 words, in the user's language

### Requirement 3: Travel Consultation Handling

**User Story:** As a user, I want to get travel advice and see related places, so that I can plan my trip better.

#### Acceptance Criteria

1. WHEN intent is `travel_consultation`, THE Text_Generator SHALL generate a comprehensive Markdown response
   - Examples: "欧洲哪里好玩？", "巴黎这座城市怎么样？", "What's special about Kyoto?", "Plan a 3-day trip to Rome"
2. WHEN generating the response, THE Text_Generator SHALL extract mentioned place names AND their associated cities
3. WHEN place names are extracted, THE Place_Matcher SHALL search the database for matching places with cover images
4. WHEN the response mentions a single city, THE Search_System SHALL display related places in a horizontal scroll at the end of the response
5. WHEN the response mentions multiple cities, THE Search_System SHALL display related places grouped by city, with each city's places shown in horizontal scroll after the corresponding city section
6. THE total number of related places per city section SHALL be at least 3
7. IF AI-recommended places match fewer than 3 from database, THEN THE Place_Matcher SHALL supplement with additional places from the same city and relevant categories
8. THE `relatedPlaces` SHALL be a flat array for single-city responses, or grouped by city for multi-city responses
9. THE Markdown response SHALL support headings, emoji, line breaks, and basic formatting
10. THE response SHALL be in the user's preferred language
11. THE response MAY include a prompt at the end like "想了解具体地点推荐吗？" to guide users

### Requirement 4: Non-Travel Query Handling

**User Story:** As a user, I want to get helpful responses even for non-travel questions, so that the assistant feels versatile.

#### Acceptance Criteria

1. WHEN intent is `non_travel`, THE Text_Generator SHALL generate a Markdown response without database queries
2. THE response SHALL support headings (different font sizes), emoji, line breaks, and basic Markdown formatting
3. THE Search_System SHALL NOT return any place cards for `non_travel` intent
4. THE response SHALL be in the user's preferred language

### Requirement 5: Backward Compatibility

**User Story:** As a developer, I want the existing general_search flow to remain unchanged, so that current functionality is not affected.

#### Acceptance Criteria

1. WHEN intent is `general_search`, THE Search_System SHALL use the existing recommendation flow
2. THE existing API response format for `general_search` SHALL remain unchanged
3. THE existing category grouping logic for `general_search` SHALL remain unchanged
4. THE existing database matching logic for `general_search` SHALL remain unchanged

### Requirement 6: API Response Format

**User Story:** As a frontend developer, I want a consistent API response format, so that I can handle different intents appropriately.

#### Acceptance Criteria

1. THE Search_System SHALL include an `intent` field in all responses
2. WHEN intent is `general_search`, THE response SHALL include `categories` and `places` fields
3. WHEN intent is `specific_place`, THE response SHALL include `place` (optional) and `description` fields
4. WHEN intent is `travel_consultation`, THE response SHALL include `textContent` and `relatedPlaces` (optional) fields
5. WHEN intent is `non_travel`, THE response SHALL include only `textContent` field
6. THE `relatedPlaces` field SHALL only include places with valid cover images
