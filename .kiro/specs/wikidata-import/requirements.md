# Requirements Document

## Introduction

本功能用于从 Wikidata 导入建筑和墓地数据到 WanderLog 数据库。数据来源于两个文件夹：`Architecture from wikidata` 和 `Cemetery from wikidata`，包含多个 JSON 文件，需要按照特定规则解析、去重、获取图片并存储到 places 表。

## Glossary

- **Importer**: 数据导入系统，负责解析 JSON、去重、获取图片并写入数据库
- **QID**: Wikidata 实体唯一标识符，格式如 Q12345，从 URL 中提取
- **Place**: 数据库中的地点记录
- **Architecture_Data**: 建筑类 JSON 数据
- **Cemetery_Data**: 墓地类 JSON 数据
- **Wikidata_API**: Wikidata 提供的 API 服务，用于获取实体详细信息和图片
- **Commons_Image**: Wikimedia Commons 上的图片资源

## Requirements

### Requirement 1: JSON 文件解析

**User Story:** As a data administrator, I want to parse all JSON files from both folders, so that I can extract place information for import.

#### Acceptance Criteria

1. WHEN the Importer reads Architecture JSON files, THE Importer SHALL extract fields: work, workLabel, architect, architectLabel, style, styleLabel, coord, image, sitelinks, countryLabel, cityLabel
2. WHEN the Importer reads Cemetery JSON files, THE Importer SHALL extract fields: cemetery, cemeteryLabel, coord, countryLabel, cityLabel, image, and optional celebrity count fields (celebsCount, artistCount, writerCount, musicCount, scientistCount)
3. WHEN parsing coord field with format "Point(longitude latitude)", THE Importer SHALL correctly extract longitude and latitude as separate float values
4. WHEN extracting QID from Wikidata URL, THE Importer SHALL parse the entity ID (e.g., Q12345) from URLs like "http://www.wikidata.org/entity/Q12345"

### Requirement 2: 全局 QID 去重

**User Story:** As a data administrator, I want to deduplicate places by QID across all files, so that each unique location is only imported once.

#### Acceptance Criteria

1. THE Importer SHALL maintain a global set of processed QIDs across all JSON files from both folders
2. WHEN a QID has already been processed, THE Importer SHALL skip that record and not create a duplicate
3. WHEN multiple records have the same QID but different architects or styles, THE Importer SHALL merge the architect and style information into a single place record
4. THE Importer SHALL log the count of duplicates skipped during import

### Requirement 3: 建筑数据分类处理

**User Story:** As a data administrator, I want architecture data to be categorized correctly, so that users can browse by category and style.

#### Acceptance Criteria

1. FOR ALL architecture records, THE Importer SHALL set category_slug to "architecture" and category_en to "Architecture"
2. WHEN processing architecture1.json or architecture2.json (top architecture), THE Importer SHALL NOT add style to tags
3. WHEN processing style-named JSON files (e.g., Brutalism.json, ArtDeco.json), THE Importer SHALL add the style from styleLabel to tags.style array
4. WHEN a record has multiple styles, THE Importer SHALL include all unique styles in the tags.style array
5. THE Importer SHALL store architect information in tags.architect array with architectLabel values

### Requirement 4: 墓地数据分类处理

**User Story:** As a data administrator, I want cemetery data to be categorized with appropriate themes, so that users can discover cemeteries by notable burials.

#### Acceptance Criteria

1. FOR ALL cemetery records, THE Importer SHALL set category_slug to "cemetery" and category_en to "Cemetery"
2. WHEN a cemetery has artistCount > 0, THE Importer SHALL add "artist" to tags.theme array
3. WHEN a cemetery has scientistCount > 0, THE Importer SHALL add "scientist" to tags.theme array
4. WHEN a cemetery has musicCount > 0, THE Importer SHALL add "musician" to tags.theme array
5. WHEN a cemetery has writerCount > 0, THE Importer SHALL add "writer" to tags.theme array
6. WHEN a cemetery has celebsCount > 0 but no specific category counts, THE Importer SHALL add "celebrity" to tags.theme array
7. THE Importer SHALL store all count values in custom_fields for reference

### Requirement 5: Wikidata 图片获取

**User Story:** As a data administrator, I want to fetch all available images from Wikidata, so that places have rich visual content.

#### Acceptance Criteria

1. FOR EACH unique QID, THE Importer SHALL query Wikidata API to retrieve all images (excluding banners)
2. THE Importer SHALL set the first image as cover_image
3. THE Importer SHALL store additional images in the images JSON array
4. WHEN the JSON record already contains an image URL, THE Importer SHALL include it in the images collection
5. IF Wikidata API returns no images, THE Importer SHALL use the image from the JSON record as cover_image if available

### Requirement 6: 数据完整性保存

**User Story:** As a data administrator, I want all source data preserved, so that no information is lost during import.

#### Acceptance Criteria

1. THE Importer SHALL store the Wikidata QID in source_detail field
2. THE Importer SHALL set source to "wikidata"
3. THE Importer SHALL store all unmapped fields in custom_fields JSON, including: sitelinks count, all Wikidata URLs (work, architect, style, cemetery), and any count fields
4. THE Importer SHALL preserve the original Wikidata entity URLs for future reference
5. FOR EACH imported place, THE Importer SHALL set is_verified to true

### Requirement 7: 字段映射

**User Story:** As a data administrator, I want consistent field mapping, so that data is stored in the correct database columns.

#### Acceptance Criteria

1. THE Importer SHALL map workLabel or cemeteryLabel to name field
2. THE Importer SHALL map cityLabel to city field
3. THE Importer SHALL map countryLabel to country field
4. THE Importer SHALL extract latitude from coord and store in latitude field
5. THE Importer SHALL extract longitude from coord and store in longitude field
6. THE Importer SHALL generate a UUID for each new place record

### Requirement 8: 错误处理与日志

**User Story:** As a data administrator, I want comprehensive error handling and logging, so that I can monitor and troubleshoot the import process.

#### Acceptance Criteria

1. IF a JSON file cannot be parsed, THEN THE Importer SHALL log the error and continue with other files
2. IF Wikidata API request fails, THEN THE Importer SHALL retry up to 3 times with exponential backoff
3. IF a database insert fails, THEN THE Importer SHALL log the error with place details and continue
4. THE Importer SHALL generate a summary report with: total records processed, successful imports, duplicates skipped, errors encountered
5. THE Importer SHALL log progress every 100 records processed

### Requirement 9: 批量处理性能

**User Story:** As a data administrator, I want efficient batch processing, so that large datasets can be imported in reasonable time.

#### Acceptance Criteria

1. THE Importer SHALL process records in batches of 50 for database inserts
2. THE Importer SHALL implement rate limiting for Wikidata API calls (max 10 requests per second)
3. THE Importer SHALL support resumable imports by tracking processed QIDs
4. WHEN importing large files, THE Importer SHALL use streaming JSON parsing to minimize memory usage
