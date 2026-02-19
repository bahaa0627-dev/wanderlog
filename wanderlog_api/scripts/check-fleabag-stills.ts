import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  // Search for all Fleabag-related places in London
  const { data: allPlaces, error: allError } = await supabase
    .from('places')
    .select('id, name, city, custom_fields, images, cover_image, source')
    .eq('city', 'London')
    .not('custom_fields->stills', 'is', null)
    .limit(100);

  if (allError) {
    console.log('Error listing places with stills:', allError.message);
  } else {
    console.log('=== London places WITH stills ===');
    for (const p of (allPlaces || [])) {
      const cf = p.custom_fields as any;
      const stills = cf?.stills || [];
      const hasFleabag = stills.some((s: any) =>
        (s.movieNameEn || '').toLowerCase().includes('fleabag') ||
        (s.movieNameCn || '').includes('伦敦生活')
      );
      console.log(`  ${p.name} - stills: ${stills.length}${hasFleabag ? ' [FLEABAG]' : ''}`);
    }
  }

  // Check the specific fleabag place
  const placeId = '3045af71-6aa3-43c6-8e63-c9e0902dbf3a';
  const { data: place, error } = await supabase
    .from('places')
    .select('id, name, city, custom_fields, images, cover_image, source, updated_at')
    .eq('id', placeId)
    .single();

  if (error) {
    console.log('Error:', error);
    return;
  }

  console.log('\n=== The house of fleabag\'s father ===');
  console.log('custom_fields:', JSON.stringify(place.custom_fields, null, 2));
  console.log('images:', JSON.stringify(place.images));
  console.log('cover_image:', place.cover_image);
  console.log('source:', place.source);
  console.log('updated_at:', place.updated_at);
}

main().catch(console.error);
