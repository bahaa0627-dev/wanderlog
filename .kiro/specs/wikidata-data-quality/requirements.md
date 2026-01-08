# Requirements Document

## Introduction

本功能用于修复 Wikidata 导入数据的质量问题。主要解决三类问题：
1. 分类修正 - 从地点名称识别实际类型（museum、hotel、cafe 等），重新分类
2. 名称修复 - 修复显示为 Qxxx（Wikidata QID）的地点名，获取实际名称
3. 名称英文化 - 将非英文地点名转换为英文，与 Google Maps 保持一致

## Glossary

- **Data_Fixer**: 数据修复系统，负责检测和修复数据质量问题
- **QID_Name**: 地点名称为 Wikidata QID 格式（如 Q12345）的记录
- **Category_Mismatch**: 分类与实际地点类型不符的记录
- **Non_English_Name**: 包含非 ASCII 字符的地点名称
- **Wikidata_API**: Wikidata 提供的 API 服务，用于获取实体标签
- **Place**: 数据库中的地点记录

## Requirements

### Requirement 1: QID 名称检测与修复

**User Story:** As a data administrator, I want to fix places that have QID as their name, so that users see meaningful place names instead of Wikidata identifiers.

#### Acceptance Criteria

1. THE Data_Fixer SHALL identify all places where name matches pattern "Q" followed by digits only (e.g., Q12345)
2. WHEN a QID_Name is detected, THE Data_Fixer SHALL query Wikidata API to fetch the English label for that entity
3. IF Wikidata API returns an English label, THEN THE Data_Fixer SHALL update the place name with the English label
4. IF Wikidata API returns no English label but has other language labels, THEN THE Data_Fixer SHALL use the first available label
5. IF Wikidata API returns no labels, THEN THE Data_Fixer SHALL log the QID and skip the update
6. THE Data_Fixer SHALL preserve the original QID in sourceDetail field

### Requirement 2: 分类重新检测

**User Story:** As a data administrator, I want to reclassify places based on their names, so that museums, hotels, and other specific types are correctly categorized.

#### Acceptance Criteria

1. THE Data_Fixer SHALL scan all places with category_slug "landmark" or "architecture"
2. WHEN a place name contains museum keywords (museum, musée, museo, muzeum, gallery, galleria, galerie), THE Data_Fixer SHALL reclassify to "museum" or "art_gallery"
3. WHEN a place name contains hotel keywords (hotel, inn, resort, hostel, motel, ryokan), THE Data_Fixer SHALL reclassify to "hotel"
4. WHEN a place name contains cafe/restaurant keywords (cafe, café, coffee, restaurant, bistro), THE Data_Fixer SHALL reclassify to appropriate category
5. WHEN a place name contains religious keywords (church, cathedral, temple, mosque, shrine), THE Data_Fixer SHALL reclassify to "church" or "temple"
6. WHEN a place name contains castle keywords (castle, palace, château, fortress), THE Data_Fixer SHALL reclassify to "castle"
7. WHEN a place name contains library keywords (library, bibliothèque, biblioteca), THE Data_Fixer SHALL reclassify to "library"
8. WHEN a place name contains university keywords (university, college, school, academy), THE Data_Fixer SHALL reclassify to "university"
9. THE Data_Fixer SHALL update categorySlug, categoryEn, and categoryZh fields accordingly

### Requirement 3: 名称英文化

**User Story:** As a data administrator, I want to convert non-English place names to English, so that the data is consistent with Google Maps and international search engines.

#### Acceptance Criteria

1. THE Data_Fixer SHALL identify places with non-ASCII characters in their names
2. FOR EACH non-English name, THE Data_Fixer SHALL query Wikidata API using the QID from sourceDetail
3. IF Wikidata API returns an English label, THEN THE Data_Fixer SHALL update the name to English
4. IF no English label is available, THE Data_Fixer SHALL keep the original name
5. THE Data_Fixer SHALL store the original non-English name in customFields.originalName for reference
6. THE Data_Fixer SHALL prioritize English (en) labels, then fall back to other Latin-script languages

### Requirement 4: 批量处理与报告

**User Story:** As a data administrator, I want efficient batch processing with detailed reports, so that I can monitor and verify the data fixes.

#### Acceptance Criteria

1. THE Data_Fixer SHALL support --dry-run mode to preview changes without modifying the database
2. THE Data_Fixer SHALL process records in batches of 50 for database updates
3. THE Data_Fixer SHALL implement rate limiting for Wikidata API calls (max 10 requests per second)
4. THE Data_Fixer SHALL generate a summary report with: total scanned, QID names fixed, categories changed, names translated, errors encountered
5. THE Data_Fixer SHALL log progress every 100 records processed
6. THE Data_Fixer SHALL support --limit parameter to process a subset of records for testing

### Requirement 5: 错误处理

**User Story:** As a data administrator, I want robust error handling, so that the fix process continues even when individual records fail.

#### Acceptance Criteria

1. IF Wikidata API request fails, THEN THE Data_Fixer SHALL retry up to 3 times with exponential backoff
2. IF a database update fails, THEN THE Data_Fixer SHALL log the error with place details and continue
3. IF a place has no sourceDetail (QID), THEN THE Data_Fixer SHALL skip Wikidata API calls for that record
4. THE Data_Fixer SHALL collect all errors and include them in the final report

### Requirement 6: 数据完整性

**User Story:** As a data administrator, I want to preserve original data during fixes, so that changes can be audited and reverted if needed.

#### Acceptance Criteria

1. BEFORE updating a place name, THE Data_Fixer SHALL store the original name in customFields.originalName if not already present
2. BEFORE changing a category, THE Data_Fixer SHALL store the original category in customFields.originalCategory if not already present
3. THE Data_Fixer SHALL add a customFields.lastFixedAt timestamp when making changes
4. THE Data_Fixer SHALL add customFields.fixType array indicating what types of fixes were applied (e.g., ["qid_name", "category", "translation"])

