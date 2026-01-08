# Design Document: Pritzker Architecture Import Fix

## Overview

This design addresses the critical data import issue where only 5 out of 794 unique Pritzker Prize architect works have been successfully persisted to the database, despite import reports showing 794 records were created. The root cause is that the 794 imported records were either rolled back, deleted, or not properly committed to the database.

The solution involves:
1. Re-running the Pritzker import script to import all 794 unique buildings
2. Ensuring proper database transaction handling to prevent data loss
3. Verifying the import was successful by checking database counts
4. Ensuring all imported places have proper Pritzker award tags for filtering

## Architecture

### Data Flow

```
Wikidata JSON File (4,506 entries)
    ↓
Validation & Deduplication (794 unique buildings)
    ↓
Tag Generation (add Pritzker award tag)
    ↓
Database Upsert (create or update records)
    ↓
Verification (confirm 794 records in database)
```

### Components

1. **Import Script** (`scripts/import-pritzker-architecture.ts`)
   - CLI tool for importing Pritzker Prize architect works
   - Handles file reading, validation, deduplication, and database operations
   - Generates detailed import reports

2. **Parser Service** (`src/services/pritzkerParserService.ts`)
   - Core parsing and transformation logic
   - Validates entries, deduplicates by Wikidata QID
   - Generates structured tags with Pritzker award
   - Maps data to database format

3. **Database Layer** (Prisma ORM)
   - Handles upsert operations (create or update)
   - Ensures data integrity through transactions
   - Prevents duplicate records

4. **Verification Script** (new)
   - Counts imported Pritzker buildings
   - Verifies tag structure
   - Confirms filter functionality

## Components and Interfaces

### Import Script Interface

```typescript
// CLI Options
interface CLIOptions {
  file: string;           // Path to JSON file
  dryRun: boolean;        // Validate without writing
  enrich: boolean;        // Enable AI enrichment
  enrichLimit?: number;   // Limit enrichment count
  help: boolean;          // Show help message
}

// Usage
npx tsx scripts/import-pritzker-architecture.ts --file "Architecture list.json"
```

### Parser Service Interface

```typescript
// Input: Wikidata JSON entry
interface WikidataArchitectureEntry {
  architect: string;        // Wikidata URL
  architectLabel: string;   // Architect name
  work: string;            // Building Wikidata URL
  workLabel: string;       // Building name
  image?: string;          // Image URL
  coord?: string;          // "Point(lng lat)"
  cityLabel?: string;      // City name
  countryLabel?: string;   // Country name
}

// Output: Database-ready place data
interface PlaceImportData {
  name: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  coverImage: string | null;
  images: string[];
  source: 'wikidata';
  sourceDetail: string;     // Wikidata QID
  isVerified: boolean;
  category: string;
  categorySlug: string;
  categoryEn: string;
  categoryZh: string;
  tags: {
    award: string[];        // ['Pritzker']
    style: string[];        // ['Architecture']
    architect: string[];    // ['OscarNiemeyer']
  };
  aiTags: Array<{
    en: string;
    priority: number;
  }>;
  customFields: {
    architect: string;
    architectQID: string;
    wikidataWorkURL: string;
  };
}
```

### Database Upsert Interface

```typescript
// Upsert result
interface UpsertResult {
  action: 'created' | 'updated' | 'error';
  id?: string;
  error?: string;
}

// Upsert function
async function upsertPlace(data: PlaceImportData): Promise<UpsertResult>
```

## Data Models

### Place Model (Prisma Schema)

```prisma
model Place {
  id            String   @id @default(uuid())
  name          String
  city          String?
  country       String?
  latitude      Float
  longitude     Float
  coverImage    String?
  images        Json?    // string[]
  source        String   // 'wikidata'
  sourceDetail  String?  // Wikidata QID
  isVerified    Boolean  @default(false)
  category      String?
  categorySlug  String?
  categoryEn    String?
  categoryZh    String?
  tags          Json?    // { award: string[], style: string[], architect: string[] }
  aiTags        Json?    // Array<{ en: string, priority: number }>
  customFields  Json?    // { architect: string, architectQID: string, wikidataWorkURL: string }
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

### Tag Structure

```json
{
  "tags": {
    "award": ["Pritzker"],
    "style": ["Architecture"],
    "architect": ["OscarNiemeyer"]
  },
  "aiTags": [
    { "en": "Pritzker", "priority": 100 },
    { "en": "OscarNiemeyer", "priority": 90 },
    { "en": "Architecture", "priority": 50 }
  ],
  "customFields": {
    "architect": "Oscar Niemeyer",
    "architectQID": "Q134165",
    "wikidataWorkURL": "http://www.wikidata.org/entity/Q281521"
  }
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Complete Import

*For any* import run of the Wikidata source file containing 4,506 entries, after deduplication the system should import exactly 794 unique buildings into the database.

**Validates: Requirements 1.1, 1.4**

### Property 2: Pritzker Award Tagging

*For any* place imported from a Pritzker laureate's work, the tags.award array should contain 'Pritzker'.

**Validates: Requirements 2.1, 2.2**

### Property 3: Architect Attribution

*For any* imported place, if the source is 'wikidata' and customFields.wikidataWorkURL exists, then customFields.architect and customFields.architectQID should also exist and be non-empty.

**Validates: Requirements 4.1, 4.2, 4.3**

### Property 4: Deduplication Consistency

*For any* two places with the same sourceDetail (Wikidata QID), the database should contain only one record with that QID.

**Validates: Requirements 3.2**

### Property 5: Filter Count Accuracy

*For any* query filtering by award='Pritzker', the count of returned results should equal the total number of places with 'Pritzker' in tags.award.

**Validates: Requirements 2.3, 2.4**

### Property 6: Data Integrity After Import

*For any* place imported with required fields (name, coordinates, architect), all these fields should be present and valid in the database after import.

**Validates: Requirements 3.1, 3.3**

## Error Handling

### Import Errors

1. **File Not Found**
   - Error: Source JSON file doesn't exist
   - Handling: Display clear error message with file path, exit with code 1

2. **Invalid JSON**
   - Error: JSON file is malformed or not parseable
   - Handling: Display parse error, exit with code 1

3. **Invalid Entry**
   - Error: Entry missing required fields or has invalid data
   - Handling: Log error, skip entry, continue with remaining entries

4. **Database Connection Error**
   - Error: Cannot connect to database
   - Handling: Display connection error, exit with code 1

5. **Database Write Error**
   - Error: Failed to create or update record
   - Handling: Log error with entry details, continue with remaining entries

### Validation Errors

1. **Missing Required Fields**
   - Fields: work, workLabel, architectLabel
   - Handling: Record in skipped list with reason

2. **Invalid Coordinates**
   - Error: Coordinate string not in "Point(lng lat)" format
   - Handling: Skip entry, record in skipped list

3. **Invalid Wikidata QID**
   - Error: Cannot extract QID from Wikidata URL
   - Handling: Skip entry, record in skipped list

### Recovery Strategies

1. **Partial Import Failure**
   - If some records fail, continue importing remaining records
   - Generate report showing success/failure counts
   - Allow re-running import to retry failed records

2. **Duplicate Detection**
   - Check for existing records by sourceDetail
   - Update existing records instead of creating duplicates
   - Log update actions in import report

## Testing Strategy

### Unit Tests

Unit tests verify specific examples and edge cases:

1. **Coordinate Parsing**
   - Test valid "Point(lng lat)" format
   - Test invalid formats (missing Point, wrong order, etc.)
   - Test boundary values (±180 longitude, ±90 latitude)

2. **QID Extraction**
   - Test valid Wikidata URLs
   - Test invalid URLs (missing QID, wrong format)

3. **Architect Tag Formatting**
   - Test name with spaces ("Oscar Niemeyer" → "OscarNiemeyer")
   - Test name with dots ("I. M. Pei" → "IMPei")
   - Test name with accents ("Kenzō Tange" → "KenzoTange")

4. **City Selection**
   - Test filtering administrative subdivisions
   - Test selecting shortest city name

5. **Tag Generation**
   - Test Pritzker award tag is always included
   - Test architect tag is properly formatted

### Property-Based Tests

Property-based tests verify universal properties across all inputs:

1. **Property 1: Complete Import**
   - Generate random subsets of the source file
   - Verify deduplication produces correct unique count
   - Verify all unique buildings are imported

2. **Property 2: Pritzker Award Tagging**
   - Generate random Pritzker architect entries
   - Verify all have 'Pritzker' in tags.award

3. **Property 3: Architect Attribution**
   - Generate random entries with architect data
   - Verify customFields contains architect info

4. **Property 4: Deduplication Consistency**
   - Generate entries with duplicate Wikidata QIDs
   - Verify only one record per QID in database

5. **Property 5: Filter Count Accuracy**
   - Import random set of buildings
   - Query by Pritzker filter
   - Verify count matches expected

6. **Property 6: Data Integrity**
   - Generate random valid entries
   - Import and retrieve from database
   - Verify all required fields are preserved

### Integration Tests

1. **End-to-End Import**
   - Run import script with test data file
   - Verify database contains expected records
   - Verify tags are correct
   - Verify filters work

2. **Dry Run Mode**
   - Run import with --dry-run flag
   - Verify no database changes
   - Verify validation works

3. **Update Existing Records**
   - Import same data twice
   - Verify records are updated, not duplicated
   - Verify updatedAt timestamp changes

### Manual Testing

1. **Filter UI Testing**
   - Open filter UI
   - Select "Pritzker" award filter
   - Verify count shows 794 (or expected number)
   - Verify results show Pritzker buildings

2. **Architect Filter Testing**
   - Filter by specific architect (e.g., "Oscar Niemeyer")
   - Verify results show only that architect's works
   - Verify count is accurate

### Test Configuration

- Property tests: Minimum 100 iterations per test
- Test framework: Jest with ts-jest
- Property testing library: fast-check
- Each property test tagged with: **Feature: pritzker-architecture-import, Property {number}: {property_text}**
