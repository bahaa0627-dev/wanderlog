/**
 * 自动导入 Google Maps 列表的脚本
 * 支持短链接自动展开和智能解析
 * 使用 Apify 爬取地点，然后通过 Google Maps API 获取详情并保存
 */

import dotenv from 'dotenv';
import apifyService from './src/services/apifyService';
import readline from 'readline';

// 加载环境变量
dotenv.config();

// 创建命令行输入接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🗺️  Google Maps 列表自动导入工具');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('✨ 功能特性:');
  console.log('  • 自动展开短链接 (goo.gl)');
  console.log('  • 智能解析收藏夹/列表 URL');
  console.log('  • 自动提取 Place IDs');
  console.log('  • 批量获取地点详情');
  console.log('  • 自动去重入库');
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  // 获取用户输入的 URL
  const defaultUrl = 'https://maps.app.goo.gl/Cd5DMwwW89C2jDbU9';
  const urlInput = await question(`请输入 Google Maps 链接 (留空使用默认): `);
  const googleMapsUrl = urlInput.trim() || defaultUrl;

  console.log('');
  console.log('📍 目标 URL:', googleMapsUrl);
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 开始处理...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  rl.close();

  try {
    const result = await apifyService.importFromGoogleMapsLink(googleMapsUrl);

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 导入结果');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('✅ 成功导入:', result.success, '个地点');
    console.log('❌ 失败:', result.failed, '个地点');
    console.log('');

    if (result.errors && result.errors.length > 0) {
      console.log('❌ 错误详情:');
      result.errors.slice(0, 5).forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
      if (result.errors.length > 5) {
        console.log(`  ... 及其他 ${result.errors.length - 5} 个错误`);
      }
      console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✨ 导入完成！');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('💡 查看导入的地点:');
    console.log('   curl http://localhost:3000/api/public-places/stats | python3 -m json.tool');
    console.log('');

  } catch (error: any) {
    console.error('');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ 导入失败');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
    console.error('错误信息:', error.message);
    console.error('');
    if (error.stack) {
      console.error('错误堆栈:');
      console.error(error.stack);
    }
    console.error('');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    process.exit(1);
  }
}

main();
