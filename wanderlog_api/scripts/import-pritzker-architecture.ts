/**
 * Pritzker Architecture Import CLI Script
 * 普利兹克奖建筑作品导入脚本
 *
 * CLI tool for importing Pritzker Prize architect works from Wikidata JSON
 * into the Place database. Supports deduplication, category classification,
 * tag generation, and optional AI enrichment.
 *
 * Usage:
 *   npx ts-node scripts/import-pritzker-architecture.ts --file <path>
 *
 * Options:
 *   --file <path>       Specify input JSON file path (default: Architecture list.json)
 *   --dry-run           Validate data without writing to database
 *   --enrich            Enable AI data enrichment (optional)
 *   --help              Show help message
 *
 * Requirements: 1.1, 8.1, 8.2, 9.1
 */

import * as fs from 'fs';
import * as path from 'path';
import { WikidataArchitectureEntry } from '../src/types/pritzkerArchitecture';
import {
  validateEntry,
  deduplicateEntries,
  mapToPlaceData,
  upsertPlace,
  isQNumberLabel,
  extractWikidataQID,
} from '../src/services/pritzkerParserService';
import { ImportReportGenerator } from '../src/services/importReportService';
import {
  enrichBuildingWithAI,
  applyEnrichmentToPlace,
} from '../src/services/pritzkerEnrichmentService';

// ============================================================================
// CLI Configuration
// ============================================================================

interface CLIOptions {
  file: string;
  dryRun: boolean;
  enrich: boolean;
  enrichLimit: number | undefined;
  help: boolean;
}

const DEFAULT_FILE = 'Architecture list.json';

// ============================================================================
// Help Message
// ============================================================================

function printHelp(): void {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║              PRITZKER ARCHITECTURE IMPORT CLI                                ║
╚══════════════════════════════════════════════════════════════════════════════╝

Import Pritzker Prize architect works from Wikidata JSON into the Place database.

USAGE:
  npx ts-node scripts/import-pritzker-architecture.ts [OPTIONS]

OPTIONS:
  --file <path>       Specify input JSON file path
                      Default: ${DEFAULT_FILE}
                      Example: --file ./data/architecture.json

  --dry-run           Validate data without writing to database
                      Useful for testing and data quality checks

  --enrich            Enable AI data enrichment (optional)
                      Fetches additional data from Wikidata API and OpenAI
                      Note: Requires API keys to be configured

  --enrich-limit <n>  Limit AI enrichment to first N buildings
                      Useful for testing enrichment without processing all
                      Example: --enrich --enrich-limit 10

  --help              Show this help message

EXAMPLES:
  # Import from default file
  npx ts-node scripts/import-pritzker-architecture.ts

  # Import from specific file
  npx ts-node scripts/import-pritzker-architecture.ts --file ./my-data.json

  # Dry run to validate data
  npx ts-node scripts/import-pritzker-architecture.ts --dry-run

  # Import with AI enrichment
  npx ts-node scripts/import-pritzker-architecture.ts --enrich

  # Import with limited AI enrichment (first 10 buildings)
  npx ts-node scripts/import-pritzker-architecture.ts --enrich --enrich-limit 10

NOTES:
  - The script will output a detailed report after import
  - Use --dry-run first to validate data quality before actual import
  - Records with Q-number names (e.g., Q118424126) will be flagged for review
  - Duplicate entries (same Wikidata QID) will be merged automatically
  - AI enrichment fetches data from Wikidata API and generates descriptions
  - Rate limiting is applied to avoid API quota issues
`);
}

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    file: DEFAULT_FILE,
    dryRun: false,
    enrich: false,
    enrichLimit: undefined,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--file':
        options.file = args[++i];
        if (!options.file) {
          console.error('❌ Error: --file requires a path argument');
          process.exit(1);
        }
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--enrich':
        options.enrich = true;
        break;
      case '--enrich-limit':
        const limitStr = args[++i];
        if (!limitStr) {
          console.error('❌ Error: --enrich-limit requires a number argument');
          process.exit(1);
        }
        const limit = parseInt(limitStr, 10);
        if (isNaN(limit) || limit <= 0) {
          console.error('❌ Error: --enrich-limit must be a positive number');
          process.exit(1);
        }
        options.enrichLimit = limit;
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
// Validation
// ============================================================================

function validateOptions(options: CLIOptions): string {
  // Resolve file path
  const absolutePath = path.isAbsolute(options.file)
    ? options.file
    : path.resolve(process.cwd(), options.file);

  // Validate file exists
  if (!fs.existsSync(absolutePath)) {
    console.error(`❌ Error: File not found: ${absolutePath}`);
    process.exit(1);
  }

  return absolutePath;
}

// ============================================================================
// Main Import Function
// ============================================================================

async function runImport(options: CLIOptions): Promise<void> {
  const reporter = new ImportReportGenerator();

  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║              PRITZKER ARCHITECTURE IMPORT                                     ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  console.log('📋 Configuration:');
  console.log(`   Source:      ${options.file}`);
  console.log(`   Mode:        ${options.dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log(`   AI Enrich:   ${options.enrich ? 'Enabled' : 'Disabled'}`);
  if (options.enrich && options.enrichLimit) {
    console.log(`   Enrich Limit: ${options.enrichLimit} buildings`);
  }
  console.log('');

  // Resolve and validate file path
  const filePath = validateOptions(options);

  try {
    // ========================================================================
    // Step 1: Read and parse JSON file
    // ========================================================================
    console.log('📖 Reading JSON file...');
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    let entries: WikidataArchitectureEntry[];

    try {
      entries = JSON.parse(fileContent);
      if (!Array.isArray(entries)) {
        entries = [entries];
      }
    } catch (parseError) {
      console.error('❌ Error: Failed to parse JSON file');
      console.error(`   ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
      process.exit(1);
    }

    reporter.setTotalEntries(entries.length);
    console.log(`   Found ${entries.length} entries in JSON file\n`);

    // ========================================================================
    // Step 2: Validate entries
    // ========================================================================
    console.log('🔍 Validating entries...');
    const validEntries: WikidataArchitectureEntry[] = [];
    let invalidCount = 0;

    for (const entry of entries) {
      const validation = validateEntry(entry);
      if (validation.isValid) {
        validEntries.push(entry);
      } else {
        invalidCount++;
        const qid = extractWikidataQID(entry.work) || 'unknown';
        reporter.recordSkipped(qid, validation.errors.join('; '));
      }
    }

    console.log(`   Valid entries: ${validEntries.length}`);
    console.log(`   Invalid entries: ${invalidCount}\n`);

    // ========================================================================
    // Step 3: Deduplicate entries
    // ========================================================================
    console.log('🔄 Deduplicating entries...');
    const deduplicated = deduplicateEntries(validEntries);
    reporter.setUniqueBuildingsCount(deduplicated.length);
    console.log(`   Unique buildings after deduplication: ${deduplicated.length}\n`);

    // ========================================================================
    // Step 4: Process and import buildings
    // ========================================================================
    console.log('📥 Processing buildings...');
    let processedCount = 0;
    
    // Store enrichment data for later application
    const enrichmentMap = new Map<string, any>();

    // ========================================================================
    // Step 4a: AI Enrichment (if enabled, before database writes)
    // ========================================================================
    if (options.enrich && !options.dryRun) {
      console.log('\n🤖 Starting AI Enrichment...');
      console.log('   This may take a while due to rate limiting.\n');
      
      const buildingsToEnrich = options.enrichLimit 
        ? deduplicated.slice(0, options.enrichLimit)
        : deduplicated;
      
      let enrichedCount = 0;
      let enrichFailedCount = 0;
      
      for (let i = 0; i < buildingsToEnrich.length; i++) {
        const building = buildingsToEnrich[i];
        
        try {
          const enrichmentData = await enrichBuildingWithAI(building);
          
          if (enrichmentData) {
            enrichmentMap.set(building.wikidataQID, enrichmentData);
            enrichedCount++;
          } else {
            enrichFailedCount++;
          }
          
          // Log progress every 10 buildings
          if ((i + 1) % 10 === 0 || i + 1 === buildingsToEnrich.length) {
            console.log(`   Enriched ${i + 1}/${buildingsToEnrich.length} buildings (${enrichedCount} success, ${enrichFailedCount} no data)`);
          }
        } catch (error) {
          enrichFailedCount++;
          console.error(`   ⚠️ Enrichment failed for ${building.workLabel}:`, 
            error instanceof Error ? error.message : 'Unknown error');
          // Continue with next building - don't let one failure stop the batch
        }
      }
      
      console.log(`\n   ✅ AI Enrichment complete:`);
      console.log(`      - Processed: ${buildingsToEnrich.length}`);
      console.log(`      - Enriched: ${enrichedCount}`);
      console.log(`      - No data: ${enrichFailedCount}\n`);
    }

    // ========================================================================
    // Step 4b: Import buildings to database
    // ========================================================================
    console.log('📥 Importing to database...');

    for (const building of deduplicated) {
      processedCount++;

      // Check for Q-number labels (need manual review)
      if (isQNumberLabel(building.workLabel)) {
        reporter.recordNeedsReview(
          building.wikidataQID,
          `Work label is a Q-number: ${building.workLabel}`
        );
      }

      // Map to PlaceImportData
      let placeData = mapToPlaceData(building);
      
      // Apply enrichment data if available
      const enrichmentData = enrichmentMap.get(building.wikidataQID);
      if (enrichmentData) {
        placeData = applyEnrichmentToPlace(placeData, enrichmentData);
      }

      // Log progress every 50 buildings
      if (processedCount % 50 === 0 || processedCount === deduplicated.length) {
        console.log(`   Processed ${processedCount}/${deduplicated.length} buildings`);
      }

      // Skip database write in dry-run mode
      if (options.dryRun) {
        reporter.recordCreated(); // Count as would-be-created for dry run
        continue;
      }

      // Upsert to database
      const result = await upsertPlace(placeData);

      switch (result.action) {
        case 'created':
          reporter.recordCreated();
          break;
        case 'updated':
          reporter.recordUpdated();
          break;
        case 'error':
          reporter.recordSkipped(building.wikidataQID, result.error || 'Database error');
          break;
      }
    }

    console.log('');

    // ========================================================================
    // Step 5: Generate and save report
    // ========================================================================
    console.log('📊 Generating report...');
    const reportPath = await reporter.saveReport('./reports');
    console.log(`   Report saved to: ${reportPath}\n`);

    // Print summary
    console.log(reporter.getSummary());

    // ========================================================================
    // Final Summary
    // ========================================================================
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                           IMPORT COMPLETE                                     ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    if (options.dryRun) {
      console.log('💡 This was a DRY RUN. No data was written to the database.');
      console.log('   Run without --dry-run to perform the actual import.\n');
    }

    // Check for issues
    const report = reporter.generateReport();
    if (report.recordsNeedingReview.length > 0) {
      console.log(`⚠️  ${report.recordsNeedingReview.length} records need manual review.`);
      console.log('   Check the report file for details.\n');
    }

    if (report.recordsSkipped.length > 0) {
      console.log(`⚠️  ${report.recordsSkipped.length} records were skipped.`);
      console.log('   Check the report file for details.\n');
    }

  } catch (error: unknown) {
    console.error('\n❌ Import failed:', error instanceof Error ? error.message : 'Unknown error');
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
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
