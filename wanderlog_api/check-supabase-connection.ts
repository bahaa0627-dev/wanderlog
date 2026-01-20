import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

async function checkConnection() {
  console.log('🔍 Checking Supabase connection...\n');
  
  console.log('Environment variables:');
  console.log(`SUPABASE_URL: ${process.env.SUPABASE_URL ? '✅ Set' : '❌ Not set'}`);
  console.log(`SUPABASE_SERVICE_KEY: ${process.env.SUPABASE_SERVICE_KEY ? '✅ Set' : '❌ Not set'}\n`);

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing Supabase credentials');
    return;
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  // 测试连接
  console.log('Testing connection...');
  const { data, error, count } = await supabase
    .from('places')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('❌ Connection error:', error);
    return;
  }

  console.log(`✅ Connected successfully`);
  console.log(`📊 Total places in database: ${count}\n`);

  // 检查最近的记录
  const { data: recentPlaces, error: recentError } = await supabase
    .from('places')
    .select('id, name, city, source, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  if (recentError) {
    console.error('❌ Error fetching recent places:', recentError);
    return;
  }

  console.log('📍 Most recent 5 places:');
  recentPlaces?.forEach((place, i) => {
    console.log(`${i + 1}. ${place.name} (${place.city}) - ${place.source}`);
    console.log(`   Created: ${place.created_at}`);
  });
}

checkConnection().catch(console.error);
