const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://dhyfttcikicrsfqamgfk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRoeWZ0dGNpa2ljcnNmcWFtZ2ZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjY3OTc4MiwiZXhwIjoyMDgyMjU1NzgyfQ.GTW82QdX5FcriCGdrGvIigY-2KVi4X3Y5AdZbhjBQmY';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  try {
    console.log('Testing Supabase connection...');
    const { data, error } = await supabase.from('places').select('id, name').limit(3);
    
    if (error) {
      console.error('❌ Supabase error:', error.message);
    } else {
      console.log('✅ Supabase connection successful!');
      console.log('Sample places:', data);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

main();
