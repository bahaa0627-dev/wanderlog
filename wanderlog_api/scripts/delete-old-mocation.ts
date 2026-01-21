/**
 * Delete old mocation places with incorrect data format
 * - City field contains Chinese format like "比萨 意大利"
 * - Coordinates are null or 0
 */

import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials');
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  console.log('🔍 Finding old mocation places with incorrect data...\n');
  
  // Find places where city contains Chinese characters (indicating old format)
  // These are the ones with format like "比萨 意大利" instead of separate city/country
  const { data: allMocationPlaces, error: fetchError } = await supabase
    .from('places')
    .select('id, name, city, country, latitude, longitude, source')
    .or('source.eq.mocation,source.is.null')
    .order('created_at', { ascending: false });
  
  if (fetchError) {
    console.error('Error fetching places:', fetchError);
    return;
  }
  
  // Filter for places with Chinese city names (old format)
  const chineseRegex = /[\u4e00-\u9fa5]/;
  const oldPlaces = allMocationPlaces?.filter(p => {
    // Check if city contains Chinese characters
    const hasChinese = p.city && chineseRegex.test(p.city);
    // Check if coordinates are missing
    const noCoords = !p.latitude || !p.longitude || p.latitude === 0 || p.longitude === 0;
    return hasChinese || noCoords;
  }) || [];
  
  console.log(`📊 Found ${oldPlaces.length} places with old format:\n`);
  
  for (const place of oldPlaces) {
    console.log(`   - ${place.name}`);
    console.log(`     City: ${place.city || 'N/A'}, Country: ${place.country || 'N/A'}`);
    console.log(`     Coords: ${place.latitude || '-'}, ${place.longitude || '-'}`);
    console.log('');
  }
  
  if (oldPlaces.length === 0) {
    console.log('✅ No old format places found!');
    return;
  }
  
  // Check for --delete flag
  const shouldDelete = process.argv.includes('--delete');
  
  if (!shouldDelete) {
    console.log('⚠️  Run with --delete flag to actually delete these places');
    console.log('   npx tsx scripts/delete-old-mocation.ts --delete');
    return;
  }
  
  // Delete the old places
  console.log(`\n🗑️  Deleting ${oldPlaces.length} old places...`);
  
  const idsToDelete = oldPlaces.map(p => p.id);
  
  const { error: deleteError } = await supabase
    .from('places')
    .delete()
    .in('id', idsToDelete);
  
  if (deleteError) {
    console.error('Error deleting places:', deleteError);
    return;
  }
  
  console.log(`✅ Successfully deleted ${oldPlaces.length} old places!`);
}

main().catch(console.error);
