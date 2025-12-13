/**
 * 列出 Apify 账号中的可用 Actors
 */

import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '.env') });

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;

async function listAvailableActors() {
  try {
    console.log('🔍 Checking Apify Account & Available Actors');
    console.log('Token:', APIFY_TOKEN?.substring(0, 20) + '...');
    console.log('='.repeat(70));

    // 1. 获取用户信息
    const userResponse = await axios.get(
      `https://api.apify.com/v2/users/me?token=${APIFY_TOKEN}`
    );

    const user = userResponse.data.data;
    console.log('\n✅ Account Info:');
    console.log('Username:', user.username);
    console.log('Email:', user.email);

    // 2. 尝试几个已知的 Google Maps Scrapers
    const actorsToTry = [
      'compass/google-maps-scraper',
      'nwua9Gu5YrADL7ZDj',
      'drobnikj/crawler-google-places',
      'epctex/google-maps-scraper',
    ];

    console.log('\n🔍 Testing Known Google Maps Scrapers:');
    console.log('='.repeat(70));

    for (const actorId of actorsToTry) {
      try {
        const encodedId = encodeURIComponent(actorId);
        const response = await axios.get(
          `https://api.apify.com/v2/acts/${encodedId}?token=${APIFY_TOKEN}`
        );

        console.log(`\n✅ ${actorId}`);
        console.log('   Name:', response.data.data.name);
        console.log('   Title:', response.data.data.title);
        console.log('   Description:', response.data.data.description?.substring(0, 100));
      } catch (error: any) {
        console.log(`\n❌ ${actorId}`);
        console.log('   Error:', error.response?.data?.error?.message || error.message);
      }
    }

    // 3. 搜索 Google Maps 相关的 Actors
    console.log('\n\n🔍 Searching for "google maps" Actors:');
    console.log('='.repeat(70));

    const searchResponse = await axios.get(
      `https://api.apify.com/v2/store`,
      {
        params: {
          token: APIFY_TOKEN,
          search: 'google maps',
          limit: 10,
        },
      }
    );

    const actors = searchResponse.data.data.items;
    console.log(`\nFound ${actors.length} actors:`);

    actors.forEach((actor: any, index: number) => {
      console.log(`\n${index + 1}. ${actor.username}/${actor.name}`);
      console.log(`   Title: ${actor.title}`);
      console.log(`   Stats: ${actor.stats?.totalRuns || 0} runs`);
      console.log(`   ID: ${actor.id}`);
    });

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

listAvailableActors();
