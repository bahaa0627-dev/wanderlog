import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function checkPlaceStructure() {
  console.log('🔍 Checking place data structure...\n');

  const { data, error } = await supabase
    .from('places')
    .select('*')
    .eq('source', 'mocation')
    .eq('name', 'Libreria Bocca')
    .single();

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  if (!data) {
    console.log('⚠️  Place not found');
    return;
  }

  console.log('📍 Place data:');
  console.log(JSON.stringify(data, null, 2));
}

checkPlaceStructure().catch(console.error);
