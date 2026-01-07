/**
 * Wikidata Places Import CLI Script
 * Wikidata 建筑和墓地数据导入脚本
 *
 * CLI tool for importing Architecture and Cemetery data from Wikidata JSON files
 * into the Place database. Supports global deduplication, image fetching,
 * category classification, and tag generation.
 *
 * Usage:
 *   npx ts-node scripts/import-wikidata-places.ts [OPTIONS]
 *
 * Options:
 *   --dry-run           Validate data without writing to database
 *   --limit <n>         Limit the number of records to import
 *   --skip-images       Skip fetching images from Wikidata API
 *   --resume            Resume from previous import (skip processed QIDs)
 *   --help              Show help message
 *
 * Requirements: 8.1, 8.3, 8.4, 8.5, 9.1, 9.2, 9.3
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  ArchitectureEntry,
  CemeteryEntry,
  WikidataImages,
  GlobalQIDRegistry,
  WikidataImageFetcher,
  TagsBuilder,
  BatchInserter,
  RetryHandler,
  parseArchitectureEntry,
  parseCemeteryEntry,
  mapToPlaceData,
} from '../src/services/wikidataImportUtils';

// ============================================================================
// CLI Configuration
// ============================================================================

interface CLIOptions {
  dryRun: boolean;
  limit: number | undefined;
  skipImages: boolean;
  resume: boolean;
  help: boolean;
}

// Folder paths relative to project root
const ARCHITECTURE_FOLDER = 'Architecture from wikidata';
const CEMETERY_FOLDER = 'Cemetery from wikidata';

// Progress file for resumable imports
const PROGRESS_FILE = 'wanderlog_api/reports/wikidata-import-progress.json';

// ============================================================================
// Help Message
// ============================================================================

function printHelp(): void {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║              WIKIDATA PLACES IMPORT CLI                                       ║
╚══════════════════════════════════════════════════════════════════════════════╝

Import Architecture and Cemetery data from Wikidata JSON files into the Place database.

USAGE:
  npx ts-node scripts/import-wikidata-places.ts [OPTIONS]

OPTIONS:
  --dry-run           Validate data without writing to database
                      Useful for testing and data quality checks

  --limit <n>         Limit the number of records to import
                      Example: --limit 100

  --skip-images       Skip fetching images from Wikidata API
                      Useful for faster testing

  --resume            Resume from previous import
                      Skips QIDs that were already processed

  --help              Show this help message

EXAMPLES:
  # Full import
  npx ts-node scripts/import-wikidata-places.ts

  # Dry run to validate data
  npx ts-node scripts/import-wikidata-places.ts --dry-run

  # Import first 100 records
  npx ts-node scripts/import-wikidata-places.ts --limit 100

  # Import without fetching images
  npx ts-node scripts/import-wikidata-places.ts --skip-images

  # Resume interrupted import
  npx ts-node scripts/import-wikidata-places.ts --resume

DATA SOURCES:
  - Architecture from wikidata/
    - architecture1.json, architecture2.json (top architecture, no style tags)
    - Style-named files (Brutalism.json, ArtDeco.json, etc.)
  - Cemetery from wikidata/
    - All cemetery JSON files

PROCESSING ORDER:
  1. architecture1.json, architecture2.json (top architecture)
  2. Style-named architecture files
  3. Cemetery files

NOTES:
  - Records are deduplicated globally by Wikidata QID
  - Duplicate records are merged (architects, styles, images combined)
  - Progress is logged every 100 records
  - A detailed report is generated after import
`);
}

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    dryRun: false,
    limit: undefined,
    skipImages: false,
    resume: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--limit':
        const limitStr = args[++i];
        if (!limitStr) {
          console.error('❌ Error: --limit requires a number argument');
          process.exit(1);
        }
        const limit = parseInt(limitStr, 10);
        if (isNaN(limit) || limit <= 0) {
          console.error('❌ Error: --limit must be a positive number');
          process.exit(1);
        }
        options.limit = limit;
        break;
      case '--skip-images':
        options.skipImages = true;
        break;
      case '--resume':
        options.resume = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        if (arg.startsWith('--')) {
          console.error(`❌ Error: Unknown option: ${arg}`);
          console.error('   Use --help to see available options');
          process.exit(1);
        }
    }
  }

  return options;
}

// ============================================================================
// File Discovery
// ============================================================================

interface FileList {
  architectureTop: string[];      // architecture1.json, architecture2.json
  architectureStyle: string[];    // Style-named files
  cemetery: string[];             // All cemetery files
}

/**
 * Discover all JSON files in the data folders
 * 
 * @returns FileList with categorized file paths
 * 
 * Requirements: 8.1
 */
function discoverFiles(): FileList {
  const result: FileList = {
    architectureTop: [],
    architectureStyle: [],
    cemetery: [],
  };

  // Get project root (parent of wanderlog_api)
  const projectRoot = path.resolve(__dirname, '../..');

  // Discover architecture files
  const archFolder = path.join(projectRoot, ARCHITECTURE_FOLDER);
  if (fs.existsSync(archFolder)) {
    const archFiles = fs.readdirSync(archFolder)
      .filter(f => f.endsWith('.json') && !f.startsWith('.'));
    
    for (const file of archFiles) {
      const filePath = path.join(archFolder, file);
      const lowerFile = file.toLowerCase();
      
      // Categorize architecture files
      if (lowerFile === 'architecture1.json' || lowerFile === 'architecture2.json') {
        result.architectureTop.push(filePath);
      } else if (lowerFile !== 'architecture list.json') {
        // Skip "Architecture list.json" as it's a different format
        result.architectureStyle.push(filePath);
      }
    }
  } else {
    console.warn(`⚠️  Architecture folder not found: ${archFolder}`);
  }

  // Discover cemetery files
  const cemFolder = path.join(projectRoot, CEMETERY_FOLDER);
  if (fs.existsSync(cemFolder)) {
    const cemFiles = fs.readdirSync(cemFolder)
      .filter(f => f.endsWith('.json') && !f.startsWith('.'));
    
    for (const file of cemFiles) {
      result.cemetery.push(path.join(cemFolder, file));
    }
  } else {
    console.warn(`⚠️  Cemetery folder not found: ${cemFolder}`);
  }

  // Sort files for consistent processing order
  result.architectureTop.sort();
  result.architectureStyle.sort();
  result.cemetery.sort();

  return result;
}

// ============================================================================
// Progress Tracking (for resumable imports)
// ============================================================================

interface ImportProgress {
  processedQIDs: string[];
  lastUpdated: string;
}

/**
 * Load progress from previous import
 */
function loadProgress(): Set<string> {
  const projectRoot = path.resolve(__dirname, '../..');
  const progressPath = path.join(projectRoot, PROGRESS_FILE);
  
  if (fs.existsSync(progressPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(progressPath, 'utf-8')) as ImportProgress;
      console.log(`📂 Loaded ${data.processedQIDs.length} previously processed QIDs`);
      return new Set(data.processedQIDs);
    } catch (error) {
      console.warn('⚠️  Could not load progress file, starting fresh');
    }
  }
  return new Set();
}

/**
 * Save progress for resumable imports
 */
function saveProgress(processedQIDs: Set<string>): void {
  const projectRoot = path.resolve(__dirname, '../..');
  const progressPath = path.join(projectRoot, PROGRESS_FILE);
  
  // Ensure directory exists
  const dir = path.dirname(progressPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  const progress: ImportProgress = {
    processedQIDs: Array.from(processedQIDs),
    lastUpdated: new Date().toISOString(),
  };
  
  fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2), 'utf-8');
}

// ============================================================================
// Import Statistics
// ============================================================================

interface ImportStats {
  totalFilesProcessed: number;
  totalEntriesRead: number;
  parseErrors: number;
  uniqueRecords: number;
  duplicatesMerged: number;
  successfulImports: number;
  failedImports: number;
  skippedRecords: number;
  errors: Array<{ qid: string; error: string }>;
}

function createStats(): ImportStats {
  return {
    totalFilesProcessed: 0,
    totalEntriesRead: 0,
    parseErrors: 0,
    uniqueRecords: 0,
    duplicatesMerged: 0,
    successfulImports: 0,
    failedImports: 0,
    skippedRecords: 0,
    errors: [],
  };
}

// ============================================================================
// File Processing
// ============================================================================

/**
 * Process a single architecture JSON file
 * 
 * @param filePath - Path to the JSON file
 * @param registry - Global QID registry for deduplication
 * @param stats - Import statistics
 * 
 * Requirements: 8.1
 */
function processArchitectureFile(
  filePath: string,
  registry: GlobalQIDRegistry,
  stats: ImportStats
): void {
  const fileName = path.basename(filePath);
  console.log(`   📄 Processing: ${fileName}`);

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    let entries: ArchitectureEntry[];

    try {
      entries = JSON.parse(content);
      if (!Array.isArray(entries)) {
        entries = [entries];
      }
    } catch (parseError) {
      console.error(`   ❌ Failed to parse JSON: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
      stats.parseErrors++;
      return;
    }

    stats.totalEntriesRead += entries.length;
    let fileNewCount = 0;
    let fileDupCount = 0;

    for (const entry of entries) {
      const parsed = parseArchitectureEntry(entry);
      if (!parsed) {
        stats.parseErrors++;
        continue;
      }

      const isNew = registry.register(parsed, fileName);
      if (isNew) {
        fileNewCount++;
      } else {
        fileDupCount++;
      }
    }

    console.log(`      ✓ ${entries.length} entries, ${fileNewCount} new, ${fileDupCount} merged`);
    stats.totalFilesProcessed++;
  } catch (error) {
    console.error(`   ❌ Error reading file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    stats.parseErrors++;
  }
}

/**
 * Process a single cemetery JSON file
 * 
 * @param filePath - Path to the JSON file
 * @param registry - Global QID registry for deduplication
 * @param stats - Import statistics
 * 
 * Requirements: 8.1
 */
function processCemeteryFile(
  filePath: string,
  registry: GlobalQIDRegistry,
  stats: ImportStats
): void {
  const fileName = path.basename(filePath);
  console.log(`   📄 Processing: ${fileName}`);

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    let entries: CemeteryEntry[];

    try {
      entries = JSON.parse(content);
      if (!Array.isArray(entries)) {
        entries = [entries];
      }
    } catch (parseError) {
      console.error(`   ❌ Failed to parse JSON: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
      stats.parseErrors++;
      return;
    }

    stats.totalEntriesRead += entries.length;
    let fileNewCount = 0;
    let fileDupCount = 0;

    for (const entry of entries) {
      const parsed = parseCemeteryEntry(entry);
      if (!parsed) {
        stats.parseErrors++;
        continue;
      }

      const isNew = registry.register(parsed, fileName);
      if (isNew) {
        fileNewCount++;
      } else {
        fileDupCount++;
      }
    }

    console.log(`      ✓ ${entries.length} entries, ${fileNewCount} new, ${fileDupCount} merged`);
    stats.totalFilesProcessed++;
  } catch (error) {
    console.error(`   ❌ Error reading file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    stats.parseErrors++;
  }
}

// ============================================================================
// Report Generation
// ============================================================================

interface ImportReport {
  timestamp: string;
  options: CLIOptions;
  stats: ImportStats;
  registryStats: { total: number; unique: number; duplicates: number };
}

/**
 * Generate and save import report
 * 
 * @param stats - Import statistics
 * @param registryStats - Registry deduplication stats
 * @param options - CLI options used
 * 
 * Requirements: 8.4
 */
function generateReport(
  stats: ImportStats,
  registryStats: { total: number; unique: number; duplicates: number },
  options: CLIOptions
): string {
  const projectRoot = path.resolve(__dirname, '../..');
  const reportsDir = path.join(projectRoot, 'wanderlog_api/reports');
  
  // Ensure directory exists
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const report: ImportReport = {
    timestamp: new Date().toISOString(),
    options,
    stats,
    registryStats,
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `wikidata-import-report_${timestamp}.json`;
  const filepath = path.join(reportsDir, filename);

  fs.writeFileSync(filepath, JSON.stringify(report, null, 2), 'utf-8');

  return filepath;
}

/**
 * Print summary to console
 * 
 * Requirements: 8.4
 */
function printSummary(stats: ImportStats, registryStats: { total: number; unique: number; duplicates: number }): void {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                           IMPORT SUMMARY                                      ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  console.log('📊 File Processing:');
  console.log(`   Files processed:     ${stats.totalFilesProcessed}`);
  console.log(`   Total entries read:  ${stats.totalEntriesRead}`);
  console.log(`   Parse errors:        ${stats.parseErrors}`);

  console.log('\n📊 Deduplication:');
  console.log(`   Total records:       ${registryStats.total}`);
  console.log(`   Unique records:      ${registryStats.unique}`);
  console.log(`   Duplicates merged:   ${registryStats.duplicates}`);

  console.log('\n📊 Database Operations:');
  console.log(`   Successful imports:  ${stats.successfulImports}`);
  console.log(`   Failed imports:      ${stats.failedImports}`);
  console.log(`   Skipped records:     ${stats.skippedRecords}`);

  if (stats.errors.length > 0) {
    console.log('\n⚠️  Errors (first 10):');
    for (const error of stats.errors.slice(0, 10)) {
      console.log(`   ${error.qid}: ${error.error}`);
    }
    if (stats.errors.length > 10) {
      console.log(`   ... and ${stats.errors.length - 10} more errors`);
    }
  }
}

// ============================================================================
// Main Import Function
// ============================================================================

async function runImport(options: CLIOptions): Promise<void> {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║              WIKIDATA PLACES IMPORT                                           ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  console.log('📋 Configuration:');
  console.log(`   Mode:          ${options.dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log(`   Limit:         ${options.limit ?? 'None'}`);
  console.log(`   Skip Images:   ${options.skipImages ? 'Yes' : 'No'}`);
  console.log(`   Resume:        ${options.resume ? 'Yes' : 'No'}`);
  console.log('');

  // Initialize components
  const registry = new GlobalQIDRegistry();
  const stats = createStats();
  const tagsBuilder = new TagsBuilder();
  const imageFetcher = new WikidataImageFetcher(10); // 10 requests per second
  const retryHandler = RetryHandler.forWikidataAPI();

  // Load progress if resuming
  const previouslyProcessed = options.resume ? loadProgress() : new Set<string>();

  // Initialize Prisma client (only if not dry run)
  let prisma: PrismaClient | null = null;
  let batchInserter: BatchInserter | null = null;
  
  if (!options.dryRun) {
    prisma = new PrismaClient();
    batchInserter = new BatchInserter(prisma as any, 50);
  }

  try {
    // ========================================================================
    // Step 1: Discover files
    // ========================================================================
    console.log('📂 Discovering files...');
    const files = discoverFiles();
    
    const totalFiles = files.architectureTop.length + 
                       files.architectureStyle.length + 
                       files.cemetery.length;
    
    console.log(`   Found ${totalFiles} JSON files:`);
    console.log(`   - Architecture (top): ${files.architectureTop.length}`);
    console.log(`   - Architecture (style): ${files.architectureStyle.length}`);
    console.log(`   - Cemetery: ${files.cemetery.length}`);
    console.log('');

    // ========================================================================
    // Step 2: Process files and build registry
    // ========================================================================
    console.log('📖 Processing files...\n');

    // Process architecture1/2 first (top architecture, no style tags)
    if (files.architectureTop.length > 0) {
      console.log('🏛️  Processing top architecture files:');
      for (const filePath of files.architectureTop) {
        processArchitectureFile(filePath, registry, stats);
      }
      console.log('');
    }

    // Process style-named architecture files
    if (files.architectureStyle.length > 0) {
      console.log('🏛️  Processing style architecture files:');
      for (const filePath of files.architectureStyle) {
        processArchitectureFile(filePath, registry, stats);
      }
      console.log('');
    }

    // Process cemetery files
    if (files.cemetery.length > 0) {
      console.log('⚰️  Processing cemetery files:');
      for (const filePath of files.cemetery) {
        processCemeteryFile(filePath, registry, stats);
      }
      console.log('');
    }

    // Get registry stats
    const registryStats = registry.getStats();
    stats.uniqueRecords = registryStats.unique;
    stats.duplicatesMerged = registryStats.duplicates;

    console.log(`✅ File processing complete:`);
    console.log(`   Total entries: ${stats.totalEntriesRead}`);
    console.log(`   Unique records: ${registryStats.unique}`);
    console.log(`   Duplicates merged: ${registryStats.duplicates}`);
    console.log('');

    // ========================================================================
    // Step 3: Import records to database
    // ========================================================================
    const allRecords = registry.getAll();
    let recordsToProcess = allRecords;

    // Apply limit if specified
    if (options.limit && options.limit < recordsToProcess.length) {
      recordsToProcess = recordsToProcess.slice(0, options.limit);
      console.log(`📊 Limiting to ${options.limit} records\n`);
    }

    // Filter out previously processed records if resuming
    if (options.resume && previouslyProcessed.size > 0) {
      const beforeCount = recordsToProcess.length;
      recordsToProcess = recordsToProcess.filter(r => !previouslyProcessed.has(r.qid));
      const skipped = beforeCount - recordsToProcess.length;
      if (skipped > 0) {
        console.log(`📊 Skipping ${skipped} previously processed records\n`);
        stats.skippedRecords += skipped;
      }
    }

    console.log(`📥 Importing ${recordsToProcess.length} records...\n`);

    const processedQIDs = new Set(previouslyProcessed);
    let processedCount = 0;

    for (const record of recordsToProcess) {
      processedCount++;

      // Log progress every 100 records (Requirement 8.5)
      if (processedCount % 100 === 0 || processedCount === recordsToProcess.length) {
        console.log(`   Progress: ${processedCount}/${recordsToProcess.length} records`);
      }

      try {
        // Fetch images from Wikidata API (unless skipped)
        let images: WikidataImages;
        if (options.skipImages) {
          images = {
            coverImage: record.images[0] || null,
            additionalImages: record.images.slice(1),
          };
        } else {
          // Use retry handler for API calls
          const result = await retryHandler.execute(
            () => imageFetcher.fetchImages(record.qid, record.images),
            `fetchImages(${record.qid})`
          );
          
          if (result.success && result.value) {
            images = result.value;
          } else {
            // Fallback to existing images
            images = {
              coverImage: record.images[0] || null,
              additionalImages: record.images.slice(1),
            };
          }
        }

        // Build tags
        const tags = tagsBuilder.buildTags(record);

        // Map to place data
        const placeData = mapToPlaceData(record, images, tags);

        // Insert to database (unless dry run)
        if (!options.dryRun && batchInserter) {
          const insertResult = await batchInserter.upsertPlace(placeData);
          
          if (insertResult === 'error') {
            stats.failedImports++;
            stats.errors.push({ qid: record.qid, error: 'Database insert failed' });
          } else {
            stats.successfulImports++;
          }
        } else {
          // Dry run - count as successful
          stats.successfulImports++;
        }

        // Track processed QID
        processedQIDs.add(record.qid);

        // Save progress periodically (every 100 records)
        if (!options.dryRun && processedCount % 100 === 0) {
          saveProgress(processedQIDs);
        }
      } catch (error) {
        stats.failedImports++;
        stats.errors.push({
          qid: record.qid,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Save final progress
    if (!options.dryRun) {
      saveProgress(processedQIDs);
    }

    console.log('');

    // ========================================================================
    // Step 4: Generate report
    // ========================================================================
    console.log('📊 Generating report...');
    const reportPath = generateReport(stats, registryStats, options);
    console.log(`   Report saved to: ${reportPath}\n`);

    // Print summary
    printSummary(stats, registryStats);

    // ========================================================================
    // Final message
    // ========================================================================
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                           IMPORT COMPLETE                                     ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    if (options.dryRun) {
      console.log('💡 This was a DRY RUN. No data was written to the database.');
      console.log('   Run without --dry-run to perform the actual import.\n');
    }

  } catch (error) {
    console.error('\n❌ Import failed:', error instanceof Error ? error.message : 'Unknown error');
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    // Cleanup
    if (prisma) {
      await prisma.$disconnect();
    }
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  // Show help if requested
  if (options.help) {
    printHelp();
    process.exit(0);
  }

  // Run import
  await runImport(options);
}

// Run main function
main().catch((error) => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
