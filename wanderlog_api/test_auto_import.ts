/**
 * 自动导入测试 - 无需手动输入
 */

import dotenv from 'dotenv';
import apifyService from './src/services/apifyService';

dotenv.config();

const TEST_URL = 'https://maps.app.goo.gl/Cd5DMwwW89C2jDbU9';

async function main() {
  console.log('🧪 自动导入测试');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📍 测试 URL:', TEST_URL);
  console.log('');

  try {
    const result = await apifyService.importFromGoogleMapsLink(TEST_URL);

    console.log('');
    console.log('✅ 测试成功!');
    console.log(`   - 成功导入: ${result.success} 个地点`);
    console.log(`   - 失败: ${result.failed} 个地点`);
    
    if (result.errors.length > 0) {
      console.log('');
      console.log('错误列表:');
      result.errors.slice(0, 3).forEach((err, i) => {
        console.log(`  ${i + 1}. ${err}`);
      });
    }

  } catch (error: any) {
    console.error('');
    console.error('❌ 测试失败:', error.message);
    console.error('');
    process.exit(1);
  }
}

main();
