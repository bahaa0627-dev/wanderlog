import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// 尝试加载多个可能的环境文件
const envFiles = ['.env', '.env.local'];
for (const file of envFiles) {
  const result = dotenv.config({ path: path.join(__dirname, file) });
  if (!result.error) {
    console.log(`✅ Loaded ${file}`);
  }
}

console.log('🔍 Environment check:');
console.log(`SUPABASE_URL: ${process.env.SUPABASE_URL ? '✅' : '❌'}`);
console.log(`SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅' : '❌'}`);

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkData() {
  console.log('📊 Checking database data...\n');

  // 1. Check collection recommendations
  const { data: recommendations, error: recError } = await supabase
    .from('collection_recommendations')
    .select('*');
  
  console.log(`1️⃣ Collection Recommendations: ${recommendations?.length || 0}`);
  if (recError) console.error('Error:', recError.message);
  
  // 2. Check collections
  const { data: collections, error: collError } = await supabase
    .from('collections')
    .select('*')
    .eq('is_published', true);
  
  console.log(`2️⃣ Published Collections: ${collections?.length || 0}`);
  if (collError) console.error('Error:', collError.message);

  // 3. Check trips
  const { data: trips, error: tripsError } = await supabase
    .from('trips')
    .select('*');
  
  console.log(`3️⃣ Trips: ${trips?.length || 0}`);
  if (tripsError) console.error('Error:', tripsError.message);

  // 4. Check trip spots (check-ins)
  const { data: tripSpots, error: spotsError } = await supabase
    .from('trip_spots')
    .select('*');
  
  console.log(`4️⃣ Trip Spots (Check-ins): ${tripSpots?.length || 0}`);
  if (spotsError) console.error('Error:', spotsError.message);

  console.log('\n📋 Summary:');
  console.log(`- Recommendations: ${recommendations?.length || 0}`);
  console.log(`- Collections: ${collections?.length || 0}`);
  console.log(`- Trips: ${trips?.length || 0}`);
  console.log(`- Check-ins: ${tripSpots?.length || 0}`);

  if (recommendations && recommendations.length > 0) {
    console.log('\n✅ Found recommendations:', recommendations.map(r => r.name));
  }
}

checkData().catch(console.error);
