const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');

const apiKey = 'AIzaSyAFrsDUcA9JqNDT52646JKwGPBu5BdvyW0';
const placeId = 'ChIJLU7jZClu5kcR4PcOOO6p3I0';

// 配置代理
const proxyUrl = process.env.https_proxy || process.env.http_proxy || 'http://127.0.0.1:7890';
const agent = new HttpsProxyAgent(proxyUrl);

// 测试 1: 简单的 Place Details 请求
const testUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${apiKey}&fields=name,formatted_address`;

console.log('====================================');
console.log('🧪 测试 Google Maps API');
console.log('====================================\n');

console.log('🔑 API Key:', apiKey.substring(0, 20) + '...');
console.log('📍 Place ID:', placeId);
console.log('🌐 代理设置:', proxyUrl);
console.log('🔗 测试 URL:', testUrl.replace(apiKey, 'API_KEY'));
console.log('\n⏱️  开始请求...\n');

const startTime = Date.now();

const options = {
  agent: agent,
  timeout: 30000
};

https.get(testUrl, options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    const duration = Date.now() - startTime;
    console.log(`⏱️  请求耗时: ${duration}ms\n`);
    
    try {
      const json = JSON.parse(data);
      
      console.log('📊 响应状态:', json.status);
      
      if (json.status === 'OK') {
        console.log('✅ API 调用成功！\n');
        console.log('📍 地点名称:', json.result.name);
        console.log('📮 地址:', json.result.formatted_address);
      } else {
        console.log('❌ API 返回错误\n');
        console.log('错误信息:', json.error_message || json.status);
        if (json.error_message) {
          console.log('\n可能的原因:');
          if (json.error_message.includes('API key')) {
            console.log('  - API Key 无效或权限不足');
          }
          if (json.error_message.includes('quota')) {
            console.log('  - API 配额已用完');
          }
        }
      }
    } catch (error) {
      console.error('❌ 解析响应失败:', error.message);
      console.log('\n原始响应:');
      console.log(data.substring(0, 500));
    }
  });
}).on('error', (error) => {
  const duration = Date.now() - startTime;
  console.log(`❌ 请求失败 (${duration}ms)`);
  console.error('\n错误类型:', error.code);
  console.error('错误信息:', error.message);
  
  console.log('\n可能的原因:');
  if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
    console.log('  - 网络超时，请检查网络连接');
    console.log('  - 可能需要配置代理');
  } else if (error.code === 'ENOTFOUND') {
    console.log('  - DNS 解析失败');
    console.log('  - 无法访问 maps.googleapis.com');
  } else if (error.code === 'ECONNREFUSED') {
    console.log('  - 连接被拒绝');
  }
}).setTimeout(30000, () => {
  console.log('❌ 请求超时 (30秒)');
  console.log('\n可能需要:');
  console.log('  1. 检查网络连接');
  console.log('  2. 配置 HTTP 代理');
  console.log('  3. 检查防火墙设置');
});

console.log('等待响应中...\n');
