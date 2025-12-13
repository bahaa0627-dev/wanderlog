/**
 * 完整的端到端测试
 */

import axios from 'axios';

const API_BASE = 'http://localhost:3000';

async function testHealthCheck() {
  console.log('1️⃣ 测试健康检查...');
  try {
    const response = await axios.get(`${API_BASE}/health`);
    console.log('   ✅ 健康检查通过:', response.data);
    return true;
  } catch (error: any) {
    console.error('   ❌ 健康检查失败:', error.message);
    return false;
  }
}

async function testAddByPlaceId() {
  console.log('\n2️⃣ 测试添加单个地点（Place ID）...');
  try {
    const response = await axios.post(`${API_BASE}/api/public-places/add-by-place-id`, {
      placeId: 'ChIJLU7jZClu5kcR4PcOOO6p3I0' // 埃菲尔铁塔
    });
    console.log('   ✅ 成功:', response.data.message);
    return true;
  } catch (error: any) {
    console.error('   ❌ 失败:', error.response?.data || error.message);
    return false;
  }
}

async function testImportFromLink() {
  console.log('\n3️⃣ 测试从链接导入（短链接自动展开）...');
  try {
    const response = await axios.post(`${API_BASE}/api/public-places/import-from-link`, {
      url: 'https://maps.app.goo.gl/Cd5DMwwW89C2jDbU9'
    });
    console.log('   ✅ 成功:', response.data.message);
    console.log('   数据:', JSON.stringify(response.data.data, null, 2));
    return true;
  } catch (error: any) {
    console.error('   ❌ 失败:', error.response?.data || error.message);
    return false;
  }
}

async function testGetStats() {
  console.log('\n4️⃣ 获取统计信息...');
  try {
    const response = await axios.get(`${API_BASE}/api/public-places/stats`);
    console.log('   ✅ 统计数据:');
    console.log(JSON.stringify(response.data, null, 2));
    return true;
  } catch (error: any) {
    console.error('   ❌ 失败:', error.response?.data || error.message);
    return false;
  }
}

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 完整功能测试');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  const results = {
    health: await testHealthCheck(),
    addByPlaceId: await testAddByPlaceId(),
    importFromLink: await testImportFromLink(),
    stats: await testGetStats(),
  };

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 测试总结');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log(`✅ 健康检查: ${results.health ? '通过' : '失败'}`);
  console.log(`✅ 添加地点: ${results.addByPlaceId ? '通过' : '失败'}`);
  console.log(`✅ 链接导入: ${results.importFromLink ? '通过' : '失败'}`);
  console.log(`✅ 统计信息: ${results.stats ? '通过' : '失败'}`);
  console.log('');

  const allPassed = Object.values(results).every(r => r === true);
  if (allPassed) {
    console.log('🎉 所有测试通过！');
  } else {
    console.log('⚠️  部分测试失败');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('\n❌ 测试过程出错:', error.message);
  process.exit(1);
});
