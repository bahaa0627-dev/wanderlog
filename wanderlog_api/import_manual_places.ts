import dotenv from 'dotenv';
import publicPlaceService from './src/services/publicPlaceService';
import fs from 'fs';
import path from 'path';

dotenv.config();

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🗺️  手动导入 Google Maps Place IDs');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  // 检查文件是否存在
  const filePath = path.join(__dirname, 'place_ids.json');
  if (!fs.existsSync(filePath)) {
    console.error('❌ 错误: place_ids.json 文件不存在');
    console.log('');
    console.log('请创建 place_ids.json 文件，格式如下:');
    console.log('');
    console.log(JSON.stringify({
      placeIds: [
        "ChIJLU7jZClu5kcR4PcOOO6p3I0",
        "ChIJD3uTd9hx5kcR1IQvGfr8dbk"
      ],
      note: "从 Google Maps 列表手动提取的 Place IDs"
    }, null, 2));
    console.log('');
    process.exit(1);
  }

  // 读取 Place IDs
  let data: any;
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    data = JSON.parse(fileContent);
  } catch (error: any) {
    console.error('❌ 错误: 无法读取或解析 place_ids.json');
    console.error('错误信息:', error.message);
    process.exit(1);
  }

  if (!data.placeIds || !Array.isArray(data.placeIds)) {
    console.error('❌ 错误: place_ids.json 必须包含 placeIds 数组');
    process.exit(1);
  }

  const placeIds = data.placeIds;

  console.log(`📥 准备导入 ${placeIds.length} 个地点...`);
  console.log('📝 来源说明:', data.note || '手动导入');
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  // 显示进度
  let completed = 0;
  const total = placeIds.length;

  const startTime = Date.now();

  const result = await publicPlaceService.batchAddByPlaceIds(
    placeIds,
    'manual',
    {
      note: data.note || '手动导入',
      timestamp: new Date(),
      listUrl: data.listUrl
    }
  );

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 导入结果');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log(`✅ 成功导入: ${result.success} 个地点`);
  console.log(`❌ 失败: ${result.failed} 个地点`);
  console.log(`⏱️  用时: ${duration} 秒`);
  console.log('');

  if (result.errors.length > 0) {
    console.log('❌ 错误详情:');
    result.errors.forEach((err, i) => {
      console.log(`  ${i + 1}. ${err}`);
    });
    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✨ 导入完成！');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('💡 查看导入的地点:');
  console.log('   curl http://localhost:3000/api/public-places');
  console.log('');
}

main().catch((error) => {
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
  process.exit(1);
});
