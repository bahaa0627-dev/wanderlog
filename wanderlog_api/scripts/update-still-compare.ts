/**
 * Script to update canCompare field for stills
 * 
 * Usage:
 *   npx ts-node scripts/update-still-compare.ts <placeId> <stillIndex> <canCompare>
 * 
 * Example:
 *   npx ts-node scripts/update-still-compare.ts abc123 0 true
 *   npx ts-node scripts/update-still-compare.ts abc123 1 false
 * 
 * Or to update multiple stills at once:
 *   npx ts-node scripts/update-still-compare.ts <placeId> --indices 0,1,2 --canCompare true
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

interface Still {
  url: string;
  movieId: string;
  movieNameCn: string;
  movieNameEn: string;
  year?: number;
  canCompare?: boolean;
}

async function updateStillCompare(
  placeId: string,
  stillIndices: number[],
  canCompare: boolean
): Promise<void> {
  console.log(`\n📍 Updating stills for place: ${placeId}`);
  console.log(`   Indices: ${stillIndices.join(', ')}`);
  console.log(`   canCompare: ${canCompare}`);

  // Get the place
  const { data: place, error: fetchError } = await supabase
    .from('places')
    .select('id, name, custom_fields')
    .eq('id', placeId)
    .single();

  if (fetchError || !place) {
    console.error(`❌ Place not found: ${placeId}`);
    return;
  }

  console.log(`   Place name: ${place.name}`);

  const customFields = (place.custom_fields as any) || {};
  const stills: Still[] = customFields.stills || [];

  if (stills.length === 0) {
    console.error(`❌ No stills found for this place`);
    return;
  }

  console.log(`   Total stills: ${stills.length}`);

  // Update the specified stills
  let updated = 0;
  for (const index of stillIndices) {
    if (index >= 0 && index < stills.length) {
      stills[index].canCompare = canCompare;
      updated++;
      console.log(`   ✅ Updated still ${index}: ${stills[index].url.substring(0, 50)}...`);
    } else {
      console.warn(`   ⚠️ Invalid index: ${index} (max: ${stills.length - 1})`);
    }
  }

  if (updated === 0) {
    console.error(`❌ No stills were updated`);
    return;
  }

  // Save back to database
  const { error: updateError } = await supabase
    .from('places')
    .update({
      custom_fields: {
        ...customFields,
        stills,
      },
    })
    .eq('id', placeId);

  if (updateError) {
    console.error(`❌ Failed to update: ${updateError.message}`);
    return;
  }

  console.log(`\n✅ Successfully updated ${updated} stills`);
}

async function listStills(placeId: string): Promise<void> {
  console.log(`\n📍 Listing stills for place: ${placeId}`);

  const { data: place, error } = await supabase
    .from('places')
    .select('id, name, custom_fields')
    .eq('id', placeId)
    .single();

  if (error || !place) {
    console.error(`❌ Place not found: ${placeId}`);
    return;
  }

  console.log(`   Place name: ${place.name}`);

  const customFields = (place.custom_fields as any) || {};
  const stills: Still[] = customFields.stills || [];

  if (stills.length === 0) {
    console.log(`   No stills found`);
    return;
  }

  console.log(`\n   Stills (${stills.length} total):`);
  stills.forEach((still, index) => {
    const compareStatus = still.canCompare ? '✅ Can Compare' : '❌ No Compare';
    console.log(`   [${index}] ${still.movieNameEn || still.movieNameCn} - ${compareStatus}`);
    console.log(`       URL: ${still.url.substring(0, 60)}...`);
  });
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Usage:
  List stills:
    npx ts-node scripts/update-still-compare.ts <placeId> --list

  Update single still:
    npx ts-node scripts/update-still-compare.ts <placeId> <stillIndex> <true|false>

  Update multiple stills:
    npx ts-node scripts/update-still-compare.ts <placeId> --indices 0,1,2 --canCompare true

Examples:
  npx ts-node scripts/update-still-compare.ts abc123 --list
  npx ts-node scripts/update-still-compare.ts abc123 0 true
  npx ts-node scripts/update-still-compare.ts abc123 --indices 0,1,2 --canCompare true
`);
    return;
  }

  const placeId = args[0];

  // List mode
  if (args.includes('--list')) {
    await listStills(placeId);
    return;
  }

  // Batch update mode
  if (args.includes('--indices')) {
    const indicesIndex = args.indexOf('--indices');
    const canCompareIndex = args.indexOf('--canCompare');

    if (indicesIndex === -1 || canCompareIndex === -1) {
      console.error('❌ Missing --indices or --canCompare argument');
      return;
    }

    const indices = args[indicesIndex + 1].split(',').map(Number);
    const canCompare = args[canCompareIndex + 1] === 'true';

    await updateStillCompare(placeId, indices, canCompare);
    return;
  }

  // Single update mode
  if (args.length >= 3) {
    const stillIndex = parseInt(args[1]);
    const canCompare = args[2] === 'true';

    await updateStillCompare(placeId, [stillIndex], canCompare);
    return;
  }

  console.error('❌ Invalid arguments. Use --help for usage.');
}

main().catch(console.error);
