# Requirements Document

## Introduction

本功能用于导入普利兹克奖获奖建筑师的建筑作品数据到 Place 数据库。数据来源于 Wikidata 抓取的 JSON 文件，包含建筑师名称、作品名称、经纬度、城市、国家、图片等信息。导入需要确保数据去重、字段完整、标签标准化，支持后续通过"建筑"、建筑师名称、建筑风格等标签进行搜索。

## Glossary

- **Importer**: 负责解析 JSON 数据并导入到数据库的服务模块
- **Place**: 数据库中的地点实体，存储建筑作品信息
- **Wikidata_QID**: Wikidata 实体的唯一标识符（如 Q281521）
- **Deduplication_Key**: 用于去重的唯一键，由 Wikidata QID 或经纬度+名称组合生成
- **Architect_Tag**: 建筑师标签，格式为无空格的建筑师名（如 OscarNiemeyer）
- **Style_Tag**: 建筑风格标签（如 Brutalism, Deconstructivism）

## Requirements

### Requirement 1: JSON 数据解析

**User Story:** As a data administrator, I want to parse the Architecture list.json file, so that I can extract building information for import.

#### Acceptance Criteria

1. WHEN the Importer reads the JSON file, THE Importer SHALL parse each entry extracting: architect, architectLabel, work, workLabel, image, coord, cityLabel, countryLabel
2. WHEN the coord field contains "Point(lng lat)" format, THE Importer SHALL extract longitude and latitude as separate float values
3. WHEN the work field contains a Wikidata URL, THE Importer SHALL extract the QID (e.g., Q281521) as sourceDetail
4. IF the JSON file is malformed or missing required fields, THEN THE Importer SHALL log the error and skip the invalid entry

### Requirement 2: 数据去重

**User Story:** As a data administrator, I want duplicate entries to be automatically detected and merged, so that the database contains unique building records.

#### Acceptance Criteria

1. WHEN importing a building, THE Importer SHALL use Wikidata QID as the primary deduplication key
2. WHEN multiple entries share the same Wikidata QID but different cityLabel values, THE Importer SHALL merge them into a single record using the most specific city name
3. WHEN a building already exists in the database (matched by googlePlaceId or sourceDetail), THE Importer SHALL update the existing record instead of creating a duplicate
4. THE Importer SHALL log the count of new records created, records updated, and duplicates skipped

### Requirement 3: 字段映射与补全

**User Story:** As a data administrator, I want all Place fields to be properly populated, so that building records are complete and searchable.

#### Acceptance Criteria

1. WHEN mapping JSON to Place, THE Importer SHALL set the following fields:
   - name: workLabel
   - city: cityLabel
   - country: countryLabel
   - latitude: extracted from coord
   - longitude: extracted from coord
   - coverImage: image URL
   - source: "wikidata"
   - sourceDetail: Wikidata QID
   - isVerified: true
2. WHEN the workLabel starts with "Q" followed by numbers (e.g., Q118424126), THE Importer SHALL attempt to fetch a proper name from Wikidata API or mark the record for manual review
3. THE Importer SHALL store the architect name in customFields.architect for reference

### Requirement 4: 分类设置

**User Story:** As a user, I want buildings to have appropriate categories based on their function, so that I can filter by building type.

#### Acceptance Criteria

1. WHEN importing a building, THE Importer SHALL analyze the workLabel to determine category:
   - "Museum", "Gallery" → category: "museum", categorySlug: "museum", categoryEn: "Museum", categoryZh: "博物馆"
   - "Church", "Cathedral", "Chapel" → category: "church", categorySlug: "church", categoryEn: "Church", categoryZh: "教堂"
   - "University", "School", "College", "Campus" → category: "university", categorySlug: "university", categoryEn: "University", categoryZh: "大学"
   - "Library" → category: "library", categorySlug: "library", categoryEn: "Library", categoryZh: "图书馆"
   - "Stadium", "Arena", "Gymnasium" → category: "stadium", categorySlug: "stadium", categoryEn: "Stadium", categoryZh: "体育场"
   - "Theater", "Theatre", "Opera" → category: "theater", categorySlug: "theater", categoryEn: "Theater", categoryZh: "剧院"
   - "Hospital" → category: "hospital", categorySlug: "hospital", categoryEn: "Hospital", categoryZh: "医院"
   - "Station", "Terminal" → category: "station", categorySlug: "station", categoryEn: "Station", categoryZh: "车站"
   - "Tower", "Building", "Center", "Centre" → category: "building", categorySlug: "building", categoryEn: "Building", categoryZh: "建筑"
   - Default → category: "architecture", categorySlug: "architecture", categoryEn: "Architecture", categoryZh: "建筑"
2. IF the category cannot be determined from workLabel, THEN THE Importer SHALL set category to "architecture" as default

### Requirement 5: 标签生成

**User Story:** As a user, I want buildings to have standardized tags, so that I can search by architect, award, and style.

#### Acceptance Criteria

1. WHEN importing a building, THE Importer SHALL generate tags in the following structure:
   ```json
   {
     "award": ["Pritzker"],
     "style": ["Modernism", "Architecture"],
     "architect": ["OscarNiemeyer"]
   }
   ```
   - award: 具体奖项名称，固定为 "Pritzker"（普利兹克奖）
   - style: 建筑风格标签，包含具体风格（如 Modernism）和通用标签 "Architecture"
   - architect: 建筑师名称标签，无空格格式
2. THE Importer SHALL format architect tags by removing spaces and special characters from architectLabel (e.g., "Oscar Niemeyer" → "OscarNiemeyer", "I. M. Pei" → "IMPei", "Kenzō Tange" → "KenzoTange")
3. WHEN the architect is known to have a specific style, THE Importer SHALL add style tags:
   - Oscar Niemeyer → ["Modernism", "BrazilianModernism"]
   - Zaha Hadid → ["Deconstructivism", "Parametricism"]
   - Tadao Ando → ["Minimalism", "CriticalRegionalism"]
   - Frank Gehry → ["Deconstructivism"]
   - Norman Foster → ["HighTech"]
   - Renzo Piano → ["HighTech"]
   - Peter Zumthor → ["Minimalism"]
   - Herzog & de Meuron → ["Minimalism"]
   - Kenzō Tange → ["Metabolism"]
   - Jean Nouvel → ["HighTech", "Deconstructivism"]
   - Frei Otto → ["Tensile", "Organic"]
   - RCR Arquitectes → ["Minimalism", "Regionalism"]
4. THE Importer SHALL always include "Architecture" as a generic style tag (用于搜索所有建筑作品)

### Requirement 6: AI 标签生成

**User Story:** As a user, I want buildings to have AI-friendly display tags, so that they appear correctly in search results.

#### Acceptance Criteria

1. WHEN importing a building, THE Importer SHALL generate aiTags array containing ALL tags from the tags object, each with priority:
   ```json
   [
     {"en": "Pritzker", "zh": "普利兹克奖", "priority": 100},
     {"en": "Oscar Niemeyer", "zh": "奥斯卡·尼迈耶", "priority": 90},
     {"en": "Modernism", "zh": "现代主义", "priority": 80},
     {"en": "Architecture", "zh": "建筑", "priority": 50}
   ]
   ```
2. THE Importer SHALL assign priority values based on tag type:
   - award 标签 (如 Pritzker): priority 100 - 最高优先级，展示具体奖项名
   - architect 标签 (如 OscarNiemeyer): priority 90 - 展示建筑师名字
   - style 具体风格标签 (如 Modernism, Brutalism, Deconstructivism): priority 80
   - style 通用标签 "Architecture": priority 50 - 最低优先级，仅用于搜索归类
3. THE Importer SHALL use the architect's Chinese name from a predefined mapping:
   - Oscar Niemeyer → 奥斯卡·尼迈耶
   - Zaha Hadid → 扎哈·哈迪德
   - Norman Foster → 诺曼·福斯特
   - Frank Gehry → 弗兰克·盖里
   - I. M. Pei → 贝聿铭
   - Tadao Ando → 安藤忠雄
   - Kenzō Tange → 丹下健三
   - Peter Zumthor → 彼得·卒姆托
   - Jean Nouvel → 让·努维尔
   - Renzo Piano → 伦佐·皮亚诺
   - Frei Otto → 弗雷·奥托
   - RCR Arquitectes → RCR建筑事务所
   - Diébédo Francis Kéré → 弗朗西斯·凯雷
   - Shelley McNamara → 谢莉·麦克纳马拉
   - Yvonne Farrell → 伊冯·法雷尔
   - Hans Hollein → 汉斯·霍莱因
4. THE Importer SHALL use Chinese translations for style tags:
   - Modernism → 现代主义
   - Brutalism → 粗野主义
   - Deconstructivism → 解构主义
   - Minimalism → 极简主义
   - HighTech → 高技派
   - Parametricism → 参数化主义
   - Metabolism → 新陈代谢派
   - Organic → 有机建筑
   - Regionalism → 地域主义
   - Architecture → 建筑
5. IF no Chinese name mapping exists, THE Importer SHALL use the English name for both en and zh fields
6. THE UI SHALL display up to 3 tags sorted by priority (highest first)

### Requirement 7: 图片处理

**User Story:** As a user, I want buildings to have proper cover images, so that they display correctly in the app.

#### Acceptance Criteria

1. WHEN the image URL is from Wikimedia Commons, THE Importer SHALL convert it to a direct image URL
2. THE Importer SHALL store the original image URL in the images array
3. IF multiple images exist for the same building (from duplicate entries), THE Importer SHALL collect all unique images into the images array

### Requirement 8: 导入报告

**User Story:** As a data administrator, I want a detailed import report, so that I can verify the import was successful.

#### Acceptance Criteria

1. WHEN the import completes, THE Importer SHALL generate a report containing:
   - Total entries in JSON file
   - Unique buildings after deduplication
   - New records created
   - Existing records updated
   - Records skipped (with reasons)
   - Records requiring manual review (e.g., missing names)
2. THE Importer SHALL save the report to a JSON file with timestamp
