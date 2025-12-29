/**
 * Apify Places Import CLI Script
 * 
 * CLI tool for importing Google Places data from Apify into Supabase.
 * Supports importing from local JSON files or Apify Dataset API.
 * 
 * Usage:
 *   npx ts-node scripts/import-apify-places.ts --file <path>
 *   npx ts-node scripts/import-apify-places.ts --dataset <dataset-id>
 * 
 * Options:
 *   --file <path>       Import from local JSON file
 *   --dataset <id>      Import from Apify Dataset ID
 *   --dry-run           Validate data without writing to database
 *   --batch-size <n>    Number of items per batch (default: 100)
 *   --skip-images       Skip image download and R2 upload
 *   --help              Show help message
 * 
 * Requirements: 6.1-6.6
 */

import * as fs from 'fs';
import * as path from 'path';
import { ApifyImportService } from '../src/services/apifyImportService';
import { ImportOptions, ApifyPlaceItem } from '../src/types/apify';

// ============================================================================
// CLI Configuration
// ============================================================================

interface CLIOptions {
  file?: string;
  dataset?: string;
  dryRun: boolean;
  batchSize: number;
  skipImages: boolean;
  help: boolean;
}

const DEFAULT_BATCH_SIZE = 100;

// ============================================================================
// Help Message
// ============================================================================

function printHelp(): void {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                     APIFY PLACES IMPORT CLI                                  ║
╚══════════════════════════════════════════════════════════════════════════════╝

Import Google Places data from Apify into Supabase database.

USAGE:
  npx ts-node scripts/import-apify-places.ts [OPTIONS]

OPTIONS:
  --file <path>       Import from local JSON file
                      Example: --file ./data/paris-places.json

  --dataset <id>      Import from Apify Dataset ID
                      Example: --dataset abc123xyz
                      Requires APIFY_API_TOKEN environment variable

  --dry-run           Validate data without writing to database
                      Useful for testing and data quality checks

  --batch-size <n>    Number of items per batch (default: ${DEFAULT_BATCH_SIZE})
                      Example: --batch-size 50

  --skip-images       Skip image download and R2 upload
                      Useful for faster imports when images aren't needed

  --help              Show this help message

EXAMPLES:
  # Import from local file
  npx ts-node scripts/import-apify-places.ts --file ./dataset_crawler-google-places.json

  # Import from Apify Dataset
  npx ts-node scripts/import-apify-places.ts --dataset abc123xyz

  # Dry run to validate data
  npx ts-node scripts/import-apify-places.ts --file ./data.json --dry-run

  # Import with custom batch size and skip images
  npx ts-node scripts/import-apify-places.ts --file ./data.json --batch-size 50 --skip-images

ENVIRONMENT VARIABLES:
  APIFY_API_TOKEN     Required for --dataset option
  R2_ACCESS_KEY_ID    Required for image upload (unless --skip-images)
  R2_SECRET_ACCESS_KEY Required for image upload (unless --skip-images)
  R2_BUCKET_NAME      Required for image upload (unless --skip-images)
  R2_PUBLIC_URL       Required for image upload (unless --skip-images)

NOTES:
  - Either --file or --dataset must be specified
  - The script will output a detailed report after import
  - Use --dry-run first to validate data quality before actual import
`);
}

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    dryRun: false,
    batchSize: DEFAULT_BATCH_SIZE,
    skipImages: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--file':
        options.file = args[++i];
        break;
      case '--dataset':
        options.dataset = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--batch-size':
        const batchSize = parseInt(args[++i], 10);
        if (isNaN(batchSize) || batchSize < 1) {
          console.error('❌ Error: --batch-size must be a positive integer');
          process.exit(1);
        }
        options.batchSize = batchSize;
        break;
      case '--skip-images':
        options.skipImages = true;
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

function validateOptions(options: CLIOptions): void {
  // Check that either file or dataset is specified
  if (!options.file && !options.dataset) {
    console.error('❌ Error: Either --file or --dataset must be specified');
    console.error('   Use --help to see usage examples');
    process.exit(1);
  }

  // Check that both are not specified
  if (options.file && options.dataset) {
    console.error('❌ Error: Cannot specify both --file and --dataset');
    console.error('   Please use only one data source');
    process.exit(1);
  }

  // Validate file exists
  if (options.file) {
    const absolutePath = path.isAbsolute(options.file) 
      ? options.file 
      : path.resolve(process.cwd(), options.file);
    
    if (!fs.existsSync(absolutePath)) {
      console.error(`❌ Error: File not found: ${absolutePath}`);
      process.exit(1);
    }
  }

  // Validate Apify token for dataset import
  if (options.dataset && !process.env.APIFY_API_TOKEN) {
    console.error('❌ Error: APIFY_API_TOKEN environment variable is required for --dataset');
    console.error('   Set it with: export APIFY_API_TOKEN=your_token');
    process.exit(1);
  }
}

// ============================================================================
// Main Import Function
// ============================================================================

async function runImport(options: CLIOptions): Promise<void> {
  const importService = new ApifyImportService();

  const importOptions: ImportOptions = {
    batchSize: options.batchSize,
    dryRun: options.dryRun,
    skipImages: options.skipImages,
    delayMs: 100,
  };

  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                     APIFY PLACES IMPORT                                       ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  console.log('📋 Configuration:');
  console.log(`   Source:      ${options.file ? `File (${options.file})` : `Dataset (${options.dataset})`}`);
  console.log(`   Mode:        ${options.dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log(`   Batch Size:  ${options.batchSize}`);
  console.log(`   Skip Images: ${options.skipImages ? 'Yes' : 'No'}`);
  console.log('');

  try {
    let result;
    let items: ApifyPlaceItem[] = [];

    if (options.file) {
      // Read file to get items for report generation
      const absolutePath = path.isAbsolute(options.file) 
        ? options.file 
        : path.resolve(process.cwd(), options.file);
      const fileContent = fs.readFileSync(absolutePath, 'utf-8');
      items = JSON.parse(fileContent);
      if (!Array.isArray(items)) {
        items = [items];
      }

      // Requirement 6.1: Import from local JSON file
      result = await importService.importFromFile(options.file, importOptions);
    } else if (options.dataset) {
      // Requirement 6.2: Import from Apify Dataset API
      result = await importService.importFromDataset(options.dataset, importOptions);
      
      // For dataset imports, we don't have items for detailed report
      // The import service already logs progress
    }

    if (!result) {
      console.error('❌ Import failed: No result returned');
      process.exit(1);
    }

    // Generate and print detailed report if we have items
    if (items.length > 0) {
      const report = importService.generateReport(items, result, options.dryRun);
      importService.printReport(report);
    }

    // Final summary
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                           IMPORT COMPLETE                                     ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    if (options.dryRun) {
      console.log('💡 This was a DRY RUN. No data was written to the database.');
      console.log('   Run without --dry-run to perform the actual import.\n');
    }

    // Exit with appropriate code
    if (result.failed > 0) {
      console.log(`⚠️  Import completed with ${result.failed} failures.`);
      process.exit(1);
    }

  } catch (error: any) {
    console.error('\n❌ Import failed:', error.message);
    if (error.stack) {
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

  // Show help if requested or no arguments
  if (options.help || args.length === 0) {
    printHelp();
    process.exit(0);
  }

  // Validate options
  validateOptions(options);

  // Run import
  await runImport(options);
}

// Run main function
main().catch((error) => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
