/**
 * Retry Skipped Places from Batch 2 (v2)
 * 
 * This script retries importing the 67 places that were skipped in batch 2
 * due to missing city/country fields. With the improved logic, these places
 * should now be enriched by:
 * 1. Finding existing records by coordinates
 * 2. Preserving city/country from database
 * 3. Bypassing validation when existing record is found
 */

import * as fs from 'fs';
import * as path from 'path';
import { apifyImportService } from '../src/services/apifyImportService';

async function main() {
  console.log('🔄 Retrying Skipped Places from Batch 2 (v2)');
  console.log('='.repeat(60));

  // Load the Apify data
  const dataPath = path.join(__dirname, '..', 'wikidata-batch-2-full-apify.json');
  
  if (!fs.existsSync(dataPath)) {
    console.error('❌ Apify data file not found:', dataPath);
    process.exit(1);
  }

  const apifyData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  console.log(`📥 Loaded ${apifyData.length} places from Apify data`);

  // Filter to only places that were skipped (missing city or country)
  const skippedPlaces = apifyData.filter((place: any) => {
    return !place.city || !place.countryCode;
  });

  console.log(`\n🎯 Found ${skippedPlaces.length} places without city/country`);
  console.log('These will be enriched using existing database records\n');

  // Import with improved logic
  const result = await apifyImportService.importItems(skippedPlaces, {
    batchSize: 50,
    delayMs: 100,
    skipImages: false, // Process images
  });

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 RETRY RESULTS (v2)');
  console.log('='.repeat(60));
  console.log(`Total Attempted: ${result.total}`);
  console.log(`Updated: ${result.updated} ✅`);
  console.log(`Inserted: ${result.inserted}`);
  console.log(`Skipped: ${result.skipped}`);
  console.log(`Failed: ${result.failed}`);

  if (result.skipped > 0) {
    console.log('\n⚠️  Still Skipped Places:');
    console.log('These places likely do not exist in the database');
    console.log('(no matching record found by coordinates)');
  }

  if (result.errors.length > 0) {
    console.log('\n❌ Errors:');
    result.errors.slice(0, 10).forEach(err => {
      console.log(`  - ${err.name}: ${err.error}`);
    });
    if (result.errors.length > 10) {
      console.log(`  ... and ${result.errors.length - 10} more errors`);
    }
  }

  console.log('\n✅ Retry complete!');
}

main().catch(console.error);
