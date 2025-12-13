/**
 * 检查 Apify 运行详情
 */

import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '.env') });

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
const RUN_ID = '5xT5i85F9S5QUGQH7'; // 从日志中获取的最后一个运行ID

async function checkRunDetails() {
  try {
    console.log('🔍 Checking Apify Run Details');
    console.log('Run ID:', RUN_ID);
    console.log('='.repeat(70));

    // 1. 获取运行详情
    const runResponse = await axios.get(
      `https://api.apify.com/v2/actor-runs/${RUN_ID}?token=${APIFY_TOKEN}`
    );

    const run = runResponse.data.data;
    console.log('\n📊 Run Status:', run.status);
    console.log('Started At:', run.startedAt);
    console.log('Finished At:', run.finishedAt);
    console.log('Duration:', Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000), 'seconds');

    // 2. 获取数据集
    const datasetId = run.defaultDatasetId;
    console.log('\n📦 Dataset ID:', datasetId);

    const datasetResponse = await axios.get(
      `https://api.apify.com/v2/datasets/${datasetId}?token=${APIFY_TOKEN}`
    );

    console.log('Item Count:', datasetResponse.data.data.itemCount);
    console.log('Clean Item Count:', datasetResponse.data.data.cleanItemCount);

    // 3. 获取数据集项目
    const itemsResponse = await axios.get(
      `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}`
    );

    const items = itemsResponse.data;
    console.log('\n📋 Items Retrieved:', items.length);

    if (items.length > 0) {
      console.log('\n✅ Sample Item:');
      console.log(JSON.stringify(items[0], null, 2).substring(0, 1000));
    } else {
      console.log('\n⚠️  No items found in dataset');
    }

    // 4. 获取日志
    console.log('\n📜 Checking Actor Logs...');
    const logResponse = await axios.get(
      `https://api.apify.com/v2/actor-runs/${RUN_ID}/log?token=${APIFY_TOKEN}`,
      { headers: { 'Accept': 'text/plain' } }
    );

    const log = logResponse.data;
    const logLines = log.split('\n');
    
    console.log('\n🔍 Last 30 lines of log:');
    console.log('='.repeat(70));
    console.log(logLines.slice(-30).join('\n'));
    console.log('='.repeat(70));

    // 查找错误
    const errorLines = logLines.filter((line: string) => 
      line.toLowerCase().includes('error') || 
      line.toLowerCase().includes('failed') ||
      line.toLowerCase().includes('warning')
    );

    if (errorLines.length > 0) {
      console.log('\n⚠️  Found potential issues:');
      errorLines.forEach((line: string) => console.log(line));
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

checkRunDetails();
