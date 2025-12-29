import 'dotenv/config';
import aiRecommendationService from '../src/services/aiRecommendationService';

async function test() {
  console.log('Testing AI Recommendation Service...');
  console.log('Proxy:', process.env.HTTPS_PROXY || process.env.HTTP_PROXY);
  
  const start = Date.now();
  
  try {
    const result = await aiRecommendationService.getRecommendations('Tokyo ramen shops');
    
    console.log('\n=== SUCCESS ===');
    console.log('Acknowledgment:', result.acknowledgment);
    console.log('Places count:', result.places.length);
    console.log('Requested count:', result.requestedCount);
    console.log('Categories:', result.categories?.length || 0);
    console.log('First place:', result.places[0]?.name);
    console.log(`Time: ${Date.now() - start}ms`);
  } catch (error: any) {
    console.error('\n=== ERROR ===');
    console.error('Message:', error.message);
    console.error('Code:', error.code);
    console.error('Provider:', error.provider);
    console.error(`Time: ${Date.now() - start}ms`);
  }
}

test();
