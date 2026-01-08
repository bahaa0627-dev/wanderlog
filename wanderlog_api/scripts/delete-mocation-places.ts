import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function deleteOldData() {
  const { data, error } = await supabase
    .from('places')
    .delete()
    .eq('source', 'mocation')
    .select('id, name');
  
  if (error) {
    console.error('Error:', error.message);
  } else {
    console.log('Deleted', data?.length || 0, 'places');
  }
}

deleteOldData();
