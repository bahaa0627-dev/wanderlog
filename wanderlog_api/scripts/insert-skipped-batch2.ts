/**
 * Insert Skipped Places from Batch 2 as New Places
 * 
 * This script takes the 34 places that were skipped in batch 2
 * (due to missing city/country and no existing database match)
 * and inserts them as new places using reverse geocoding to fill
 * city/country information.
 */

import * as fs from 'fs';
import * as path from 'path';
import { apifyImportService } from '../src/services/apifyImportService';

async function main() {
  console.log('🆕 Inserting Skipped Places from Batch 2 as New Places');
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
  console.log('These will be inserted as new places using reverse geocoding\n');

  // Import with reverse geocoding enabled
  const result = await apifyImportService.importItems(skippedPlaces, {
    batchSize: 50,
    delayMs: 200, // Slightly longer delay for API calls
    skipImages: false, // Process images
  });

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 INSERT RESULTS');
  console.log('='.repeat(60));
  console.log(`Total Attempted: ${result.total}`);
  console.log(`Inserted: ${result.inserted} ✅`);
  console.log(`Updated: ${result.updated}`);
  console.log(`Skipped: ${result.skipped}`);
  console.log(`Failed: ${result.failed}`);

  if (result.inserted > 0) {
    console.log(`\n✅ Successfully inserted ${result.inserted} new places!`);
  }

  if (result.skipped > 0) {
    console.log('\n⚠️  Still Skipped Places:');
    console.log('These places could not be geocoded or have other issues');
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

  console.log('\n✅ Insert complete!');
  
  // Summary
  console.log('\n📈 BATCH 2 FINAL SUMMARY');
  console.log('='.repeat(60));
  console.log(`Original Apify scraped: 482 places`);
  console.log(`Updated (enriched): 460 places`);
  console.log(`Inserted (new): ${result.inserted} places`);
  console.log(`Total processed: ${460 + result.inserted} places`);
  console.log(`Success rate: ${((460 + result.inserted) / 482 * 100).toFixed(1)}%`);
}

main().catch(console.error);
