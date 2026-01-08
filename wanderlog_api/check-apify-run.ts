import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;
const RUN_ID = process.argv[2] || 'ROljr9pZjwamRVGRc';

async function checkRun() {
  try {
    console.log(`\n🔍 Checking Apify run: ${RUN_ID}\n`);

    // Get run details
    const runResponse = await axios.get(
      `https://api.apify.com/v2/actor-runs/${RUN_ID}?token=${APIFY_API_TOKEN}`
    );

    const run = runResponse.data.data;
    console.log('📊 Run Status:', run.status);
    console.log('⏱️  Started:', run.startedAt);
    console.log('⏱️  Finished:', run.finishedAt);
    console.log('💰 Compute Units:', run.stats?.computeUnits?.toFixed(4));
    console.log('');

    // Get log
    console.log('📜 Run Log:');
    console.log('─'.repeat(80));
    const logResponse = await axios.get(
      `https://api.apify.com/v2/actor-runs/${RUN_ID}/log?token=${APIFY_API_TOKEN}`,
      { headers: { 'Accept': 'text/plain' } }
    );

    console.log(logResponse.data);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

checkRun();
