/**
 * Enrich Places from Google My Maps
 * 
 * Complete workflow to enrich existing database places with Google data:
 * 1. Parse KML from Google My Maps
 * 2. Use Apify to scrape full details
 * 3. Re-import to database with smart image handling:
 *    - Google image → coverImage
 *    - Old coverImage → images array
 * 
 * Usage:
 *   npx tsx scripts/enrich-from-google.ts <kml-file-path>
 * 
 * Example:
 *   npx tsx scripts/enrich-from-google.ts ./wikidata-a-100.kml
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const kmlFilePath = process.argv[2];
  
  if (!kmlFilePath) {
    console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                     ENRICH PLACES FROM GOOGLE MY MAPS                         ║
╚══════════════════════════════════════════════════════════════════════════════╝

USAGE:
  npx tsx scripts/enrich-from-google.ts <kml-file-path>

WORKFLOW:
  1. Parse KML from Google My Maps
  2. Use Apify to scrape full Google Places details
  3. Re-import to database with enriched data:
     ✅ Ratings, reviews, opening hours
     ✅ Better addresses and phone numbers
     ✅ High-quality Google images
     ✅ Smart image handling:
        - Google image → coverImage
        - Old coverImage → images array

EXAMPLE:
  # After uploading to Google My Maps and downloading KML:
  npx tsx scripts/enrich-from-google.ts ./wikidata-a-100.kml

REQUIREMENTS:
  - KML file downloaded from Google My Maps
  - APIFY_API_TOKEN in .env
  - Apify account with credits
`);
    process.exit(0);
  }
  
  // Check if file exists
  if (!fs.existsSync(kmlFilePath)) {
    console.error(`❌ Error: File not found: ${kmlFilePath}`);
    process.exit(1);
  }
  
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                     ENRICH PLACES FROM GOOGLE MY MAPS                         ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');
  
  const absolutePath = path.resolve(kmlFilePath);
  const baseName = path.basename(kmlFilePath, '.kml');
  const apifyJsonPath = path.join(path.dirname(absolutePath), `${baseName}-apify.json`);
  
  console.log(`📂 Input KML: ${absolutePath}`);
  console.log(`📂 Output JSON: ${apifyJsonPath}`);
  console.log('');
  
  // Step 1: Parse KML and scrape with Apify
  console.log('🚀 Step 1/2: Parsing KML and scraping with Apify...');
  console.log('─'.repeat(80));
  
  try {
    execSync(`npx tsx parse-kml-for-apify.ts "${absolutePath}"`, {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit',
    });
  } catch (error) {
    console.error('\n❌ Failed to parse KML and scrape with Apify');
    process.exit(1);
  }
  
  // Check if Apify JSON was created
  if (!fs.existsSync(apifyJsonPath)) {
    console.error(`\n❌ Error: Apify JSON not found: ${apifyJsonPath}`);
    process.exit(1);
  }
  
  console.log('\n✅ Step 1 complete: Apify scraping finished');
  console.log('');
  
  // Step 2: Import to database
  console.log('🚀 Step 2/2: Importing enriched data to database...');
  console.log('─'.repeat(80));
  console.log('');
  console.log('📝 Image handling:');
  console.log('   - Google images → coverImage (high quality)');
  console.log('   - Old coverImage → images array (preserved)');
  console.log('   - All images uploaded to R2');
  console.log('');
  
  try {
    execSync(`npx tsx scripts/import-apify-places.ts --file "${apifyJsonPath}"`, {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit',
    });
  } catch (error) {
    console.error('\n❌ Failed to import to database');
    process.exit(1);
  }
  
  console.log('\n✅ Step 2 complete: Database updated with enriched data');
  console.log('');
  
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                          ENRICHMENT COMPLETE!                                 ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('✨ Your places now have:');
  console.log('   ✅ Ratings and reviews from Google');
  console.log('   ✅ Opening hours and contact info');
  console.log('   ✅ High-quality Google images as coverImage');
  console.log('   ✅ Original images preserved in images array');
  console.log('   ✅ Better addresses and location data');
  console.log('');
  console.log('📊 Check your database to see the improvements!');
  console.log('');
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  process.exit(1);
});
