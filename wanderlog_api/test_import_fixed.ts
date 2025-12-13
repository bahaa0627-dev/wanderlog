/**
 * 测试修复后的 Google Maps 导入功能
 */

import apifyService from './src/services/apifyService';

const testUrl = 'https://maps.app.goo.gl/keqysd15DrFoGGjP8';

async function test() {
  console.log('🧪 测试修复后的 Apify 配置\n');
  console.log('📍 URL:', testUrl);
  console.log('🎯 预期结果: 72 个地点\n');
  
  try {
    console.log('⏳ 开始提取地点...\n');
    const placeIds = await apifyService.extractPlacesFromLink(testUrl);
    
    console.log('\n✅ 提取成功!');
    console.log(`📊 找到 ${placeIds.length} 个 Place IDs`);
    
    if (placeIds.length > 0) {
      console.log('\n📋 前 5 个 Place IDs:');
      placeIds.slice(0, 5).forEach((id, index) => {
        console.log(`  ${index + 1}. ${id}`);
      });
    }
    
    if (placeIds.length === 72) {
      console.log('\n🎉 完美！正好是预期的 72 个地点！');
    } else if (placeIds.length < 72) {
      console.log(`\n⚠️  地点数量少于预期（${placeIds.length} < 72）`);
    } else {
      console.log(`\n⚠️  地点数量多于预期（${placeIds.length} > 72）`);
      console.log('   可能仍在爬取额外的地点');
    }
    
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ 错误:', error.message);
    
    if (error.response) {
      console.error('\n📋 响应状态:', error.response.status);
      console.error('📋 响应数据:', JSON.stringify(error.response.data, null, 2));
    }
    
    process.exit(1);
  }
}

test();
