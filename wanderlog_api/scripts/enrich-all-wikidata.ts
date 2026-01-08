/**
 * Enrich All Wikidata Places
 * 
 * Automatically process all Wikidata places in batches:
 * 1. Fetch from database in batches
 * 2. Use Apify to scrape Google Places data
 * 3. Re-import with enriched data
 * 
 * Features:
 * - Automatic batching (default: 500 places per batch)
 * - Resume from last batch if interrupted
 * - Progress tracking
 * - Cost estimation
 * 
 * Usage:
 *   npx tsx scripts/enrich-all-wikidata.ts [options]
 * 
 * Options:
 *   --batch-size <number>    Places per batch (default: 500)
 *   --start-batch <number>   Start from specific batch (default: 0)
 *   --max-batches <number>   Maximum batches to process (default: all)
 *   --dry-run                Preview without processing
 * 
 * Examples:
 *   # Process all in batches of 500
 *   npx tsx scripts/enrich-all-wikidata.ts
 * 
 *   # Resume from batch 5
 *   npx tsx scripts/enrich-all-wikidata.ts --start-batch 5
 * 
 *   # Process only 3 batches
 *   npx tsx scripts/enrich-all-wikidata.ts --max-batches 3
 */

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface Options {
  batchSize: number;
  startBatch: number;
  maxBatches?: number;
  dryRun: boolean;
}

interface BatchResult {
  batchNumber: number;
  totalPlaces: number;
  scraped: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  cost: number;
  duration: number;
}

/**
 * Parse command line arguments
 */
function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {
    batchSize: 500,
    startBatch: 0,
    dryRun: false,
  };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--batch-size':
        options.batchSize = parseInt(args[++i]);
        break;
      case '--start-batch':
        options.startBatch = parseInt(args[++i]);
        break;
      case '--max-batches':
        options.maxBatches = parseInt(args[++i]);
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
    }
  }
  
  return options;
}

/**
 * Get total count of Wikidata places
 */
async function getTotalCount(): Promise<number> {
  const { count, error } = await supabase
    .from('places')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'wikidata');
  
  if (error) {
    throw new Error(`Failed to count places: ${error.message}`);
  }
  
  return count || 0;
}

/**
 * Export batch to CSV
 */
async function exportBatch(batchNumber: number, batchSize: number): Promise<string> {
  const offset = batchNumber * batchSize;
  const outputPath = `./wikidata-batch-${batchNumber}.csv`;
  
  console.log(`📤 Exporting batch ${batchNumber} (offset: ${offset}, limit: ${batchSize})...`);
  
  try {
    execSync(
      `npx tsx scripts/export-to-csv.ts --source wikidata --limit ${batchSize} --offset ${offset} --output ${outputPath}`,
      { cwd: __dirname + '/..', stdio: 'inherit' }
    );
    
    return path.resolve(__dirname + '/..', outputPath);
  } catch (error) {
    throw new Error(`Failed to export batch ${batchNumber}`);
  }
}

/**
 * Process batch with Apify
 */
async function processBatch(csvPath: string, batchNumber: number): Promise<BatchResult> {
  const startTime = Date.now();
  
  console.log(`\n🚀 Processing batch ${batchNumber}...`);
  console.log('─'.repeat(80));
  
  // Convert CSV to KML format (Apify expects coordinates)
  const kmlPath = csvPath.replace('.csv', '.kml');
  
  // Create simple KML from CSV
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split('\n');
  const headers = lines[0].split(',');
  
  const nameIdx = headers.indexOf('name');
  const latIdx = headers.indexOf('latitude');
  const lngIdx = headers.indexOf('longitude');
  
  let kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Wikidata Batch ${batchNumber}</name>
`;
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const cols = lines[i].split(',');
    const name = cols[nameIdx]?.replace(/"/g, '');
    const lat = cols[latIdx];
    const lng = cols[lngIdx];
    
    if (name && lat && lng) {
      kmlContent += `    <Placemark>
      <name>${name}</name>
      <Point>
        <coordinates>${lng},${lat},0</coordinates>
      </Point>
    </Placemark>
`;
    }
  }
  
  kmlContent += `  </Document>
</kml>`;
  
  fs.writeFileSync(kmlPath, kmlContent);
  
  // Process with Apify
  try {
    execSync(
      `npx tsx scripts/enrich-from-google.ts "${kmlPath}"`,
      { cwd: __dirname + '/..', stdio: 'inherit' }
    );
  } catch (error) {
    console.error(`❌ Batch ${batchNumber} failed:`, error);
    throw error;
  }
  
  const duration = (Date.now() - startTime) / 1000;
  
  // Parse results from output (simplified - you'd parse actual import results)
  const result: BatchResult = {
    batchNumber,
    totalPlaces: lines.length - 1,
    scraped: 0, // Would parse from Apify output
    inserted: 0, // Would parse from import output
    updated: 0,
    skipped: 0,
    failed: 0,
    cost: (lines.length - 1) * 0.0022,
    duration,
  };
  
  // Clean up temporary files
  fs.unlinkSync(csvPath);
  fs.unlinkSync(kmlPath);
  const apifyJsonPath = kmlPath.replace('.kml', '-apify.json');
  if (fs.existsSync(apifyJsonPath)) {
    fs.unlinkSync(apifyJsonPath);
  }
  
  return result;
}

/**
 * Main function
 */
async function main() {
  const options = parseArgs();
  
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                     ENRICH ALL WIKIDATA PLACES                                ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
  
  // Get total count
  console.log('🔍 Counting Wikidata places...');
  const totalPlaces = await getTotalCount();
  const totalBatches = Math.ceil(totalPlaces / options.batchSize);
  const batchesToProcess = options.maxBatches 
    ? Math.min(options.maxBatches, totalBatches - options.startBatch)
    : totalBatches - options.startBatch;
  
  console.log(`✅ Found ${totalPlaces} Wikidata places\n`);
  
  console.log('📋 Processing plan:');
  console.log(`   Total places: ${totalPlaces}`);
  console.log(`   Batch size: ${options.batchSize}`);
  console.log(`   Total batches: ${totalBatches}`);
  console.log(`   Start batch: ${options.startBatch}`);
  console.log(`   Batches to process: ${batchesToProcess}`);
  console.log(`   Estimated cost: $${(totalPlaces * 0.0022).toFixed(2)}`);
  console.log(`   Estimated time: ${Math.ceil(batchesToProcess * 20)} minutes`);
  console.log('');
  
  if (options.dryRun) {
    console.log('🔍 DRY RUN MODE - No actual processing');
    return;
  }
  
  // Confirm
  console.log('⚠️  This will process', batchesToProcess, 'batches');
  console.log('   Press Ctrl+C to cancel, or wait 5 seconds to continue...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  console.log('\n🚀 Starting batch processing...\n');
  
  const results: BatchResult[] = [];
  let totalCost = 0;
  let totalDuration = 0;
  
  for (let i = 0; i < batchesToProcess; i++) {
    const batchNumber = options.startBatch + i;
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`BATCH ${batchNumber + 1}/${totalBatches}`);
    console.log('='.repeat(80));
    
    try {
      // Export batch
      const csvPath = await exportBatch(batchNumber, options.batchSize);
      
      // Process batch
      const result = await processBatch(csvPath, batchNumber);
      results.push(result);
      
      totalCost += result.cost;
      totalDuration += result.duration;
      
      console.log(`\n✅ Batch ${batchNumber} complete!`);
      console.log(`   Duration: ${result.duration.toFixed(1)}s`);
      console.log(`   Cost: $${result.cost.toFixed(2)}`);
      console.log(`   Progress: ${((i + 1) / batchesToProcess * 100).toFixed(1)}%`);
      
    } catch (error: any) {
      console.error(`\n❌ Batch ${batchNumber} failed:`, error.message);
      console.log(`\n💡 To resume from this batch, run:`);
      console.log(`   npx tsx scripts/enrich-all-wikidata.ts --start-batch ${batchNumber}`);
      process.exit(1);
    }
  }
  
  // Final summary
  console.log('\n' + '='.repeat(80));
  console.log('🎉 ALL BATCHES COMPLETE!');
  console.log('='.repeat(80));
  console.log(`   Batches processed: ${results.length}`);
  console.log(`   Total cost: $${totalCost.toFixed(2)}`);
  console.log(`   Total duration: ${(totalDuration / 60).toFixed(1)} minutes`);
  console.log('');
  console.log('✨ All Wikidata places have been enriched with Google data!');
  console.log('');
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  process.exit(1);
});
