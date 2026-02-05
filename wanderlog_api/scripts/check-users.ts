import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkUsers() {
  const { data: authUsers } = await supabase.auth.admin.listUsers();
  console.log('auth.users:', authUsers?.users.length);
  
  const { data: users } = await supabase.from('users').select('id, email');
  console.log('public.users:', users?.length);
  
  console.log('\n=== public.users ===');
  users?.forEach(u => console.log(u.email));
}

checkUsers();
