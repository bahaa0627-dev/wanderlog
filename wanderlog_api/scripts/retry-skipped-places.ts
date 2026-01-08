/**
 * Retry Skipped Places
 * 
 * This script re-imports places that were skipped due to missing city/country
 * by using the improved matching logic that fills these fields from existing records.
 */

import * as fs from 'fs';
import { apifyImportService } from '../src/services/apifyImportService';
import { ApifyPlaceItem } from '../src/types/apify';

async function main() {
  const filePath = process.argv[2];
  
  if (!filePath) {
    console.log('Usage: npx tsx scripts/retry-skipped-places.ts <apify-json-file>');
    process.exit(1);
  }

  console.log('🔄 Retrying skipped places...\n');

  // Read the Apify JSON file
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const items: ApifyPlaceItem[] = JSON.parse(fileContent);

  console.log(`Total items in file: ${items.length}\n`);

  // Filter items that are missing city or country
  const skippedItems = items.filter(item => !item.city || !item.countryCode);

  console.log(`Found ${skippedItems.length} items missing city/country\n`);

  if (skippedItems.length === 0) {
    console.log('✅ No skipped items to retry!');
    return;
  }

  // Show first 10
  console.log('First 10 items to retry:');
  for (const item of skippedItems.slice(0, 10)) {
    console.log(`   - ${item.title}`);
    console.log(`     City: ${item.city || 'missing'}, Country: ${item.countryCode || 'missing'}`);
    console.log(`     Coords: ${item.location?.lat}, ${item.location?.lng}`);
  }

  if (skippedItems.length > 10) {
    console.log(`   ... and ${skippedItems.length - 10} more\n`);
  }

  console.log('\n🚀 Starting retry import...\n');

  // Import the skipped items
  const result = await apifyImportService.importItems(skippedItems, {
    batchSize: 50,
    delayMs: 100,
  });

  console.log('\n✅ Retry complete!');
  console.log(`   Total: ${result.total}`);
  console.log(`   Inserted: ${result.inserted}`);
  console.log(`   Updated: ${result.updated}`);
  console.log(`   Skipped: ${result.skipped}`);
  console.log(`   Failed: ${result.failed}`);

  if (result.skipped > 0) {
    console.log(`\n⚠️  ${result.skipped} items still skipped (no matching record found)`);
  }
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
