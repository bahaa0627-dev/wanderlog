/**
 * Mocation JSON Import Script
 * 
 * Import previously scraped mocation data from JSON file to Supabase database.
 * Use this script to import data that was scraped with --dry-run option.
 * 
 * Usage:
 *   npx tsx scripts/import-mocation-json.ts <json-file>
 *   npx tsx scripts/import-mocation-json.ts ./mocation-movie-1-100.json
 *   npx tsx scripts/import-mocation-json.ts ./mocation-movie-1-100.json --upload-r2
 * 
 * Requirements: 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4
 */

import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { loadFromJson, MocationImporter } from '../src/services/mocationImporter';

// ============================================================================
// CLI Options
// ============================================================================

interface ImportOptions {
  jsonFilePath: string;
  processImages: boolean;
  uploadToR2: boolean;
  help: boolean;
}

// ============================================================================
// Help Message
// ============================================================================

function printHelp(): void {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                  MOCATION JSON IMPORT                                         ║
╚══════════════════════════════════════════════════════════════════════════════╝

Import previously scraped mocation data from JSON file to Supabase database.

USAGE:
  npx tsx scripts/import-mocation-json.ts <json-file> [OPTIONS]

ARGUMENTS:
  <json-file>         Path to JSON file containing scraped data

OPTIONS:
  --process-images    Download images to local temp directory during import
                      Images are downloaded but not uploaded to R2

  --upload-r2         Download images and upload to Cloudflare R2
                      Requires R2_UPLOAD_SECRET environment variable
                      Implies --process-images

  --help, -h          Show this help message

EXAMPLES:
  # Import from a scraped JSON file
  npx tsx scripts/import-mocation-json.ts ./mocation-movie-1-100.json

  # Import with image processing (download only)
  npx tsx scripts/import-mocation-json.ts ./mocation-movie-1-100.json --process-images

  # Import with R2 upload
  npx tsx scripts/import-mocation-json.ts ./mocation-movie-1-100.json --upload-r2

NOTES:
  - The JSON file should contain an array of scraped place data
  - For movie pages: each page contains movie info + places array
  - Duplicate records (same name and city) will be skipped
  - If a place already exists, new movie references will be added
  - Make sure SUPABASE_URL and SUPABASE_SERVICE_KEY are set in .env
  - For R2 upload, also ensure R2_UPLOAD_SECRET is set
`);
}

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(args: string[]): ImportOptions {
  const options: ImportOptions = {
    jsonFilePath: '',
    processImages: false,
    uploadToR2: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--process-images':
        options.processImages = true;
        break;
      case '--upload-r2':
        options.uploadToR2 = true;
        options.processImages = true; // R2 upload implies image processing
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        if (!arg.startsWith('--') && !options.jsonFilePath) {
          options.jsonFilePath = arg;
        } else if (arg.startsWith('--')) {
          console.error(`❌ Error: Unknown option: ${arg}`);
          console.error('   Use --help to see available options');
          process.exit(1);
        }
    }
  }

  return options;
}

// ============================================================================
// Main Import Function
// ============================================================================

async function runImport(options: ImportOptions): Promise<void> {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                  MOCATION JSON IMPORT                                         ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  console.log(`📂 Loading data from: ${options.jsonFilePath}`);

  // Load data from JSON file
  const data = loadFromJson(options.jsonFilePath);
  
  if (!data) {
    console.error('❌ Failed to load data from JSON file');
    process.exit(1);
  }

  console.log(`   Found ${data.length} records`);
  
  // Show image processing configuration
  if (options.processImages) {
    console.log(`\n📷 Image Processing: ENABLED`);
    console.log(`   Upload to R2: ${options.uploadToR2 ? 'YES' : 'NO (local only)'}`);
  }
  console.log('');

  if (data.length === 0) {
    console.log('⚠️  No data to import');
    process.exit(0);
  }

  // Import to database
  try {
    const importer = new MocationImporter({
      processImages: options.processImages,
      imageHandlerOptions: {
        uploadToR2: options.uploadToR2,
      },
    });
    const result = await importer.importAll(data, (current, total) => {
      process.stdout.write(`\r📤 Import Progress: ${current}/${total} (${Math.round(current / total * 100)}%)`);
    });

    console.log('\n\n╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                        IMPORT COMPLETE                                        ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

    console.log('📊 Import Summary:');
    console.log(`   Total:       ${result.total} places`);
    console.log(`   Imported:    ${result.imported} (new places)`);
    console.log(`   Updated:     ${result.updated} (added movie references)`);
    console.log(`   Skipped:     ${result.skipped} (duplicates)`);
    console.log(`   Failed:      ${result.failed}`);

    if (result.errors.length > 0) {
      console.log('\n⚠️  Errors:');
      result.errors.slice(0, 10).forEach(err => {
        console.log(`   - ID ${err.id}: ${err.error}`);
      });
      if (result.errors.length > 10) {
        console.log(`   ... and ${result.errors.length - 10} more errors`);
      }
    }

  } catch (error: any) {
    console.error(`\n❌ Import failed: ${error.message}`);
    console.error('   Make sure SUPABASE_URL and SUPABASE_SERVICE_KEY are set in .env');
    if (options.uploadToR2) {
      console.error('   For R2 upload, also ensure R2_UPLOAD_SECRET is set.');
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
  if (options.help || args.length === 0 || !options.jsonFilePath) {
    printHelp();
    process.exit(0);
  }

  await runImport(options);
}

// Run main function
main().catch((error) => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
