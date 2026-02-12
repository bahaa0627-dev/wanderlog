/**
 * 批量导入英国手工艺品店
 * 从Google Maps截图识别出的4个地点
 */

import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000';

interface PlaceToImport {
  name: string;
  location: string;
  type: string;
}

const placesToImport: PlaceToImport[] = [
  {
    name: 'MacCulloch & Wallis Ltd',
    location: '25-26 Poland St, London W1F 8QN, United Kingdom',
    type: 'Fabric store'
  },
  {
    name: 'Loop',
    location: '15 Camden Passage, London N1 8EA, United Kingdom',
    type: 'Yarn store'
  },
  {
    name: 'Lannan Bakery & Pantry',
    location: '29-35 Hamilton Pl, Edinburgh EH3 5BA, United Kingdom',
    type: 'Bakery'
  },
  {
    name: 'Hobbycraft Greenwich',
    location: 'Unit 8, Greenwich shopping Park, Bugsby\'s Wy, New Charlton, London SE7 7SR, United Kingdom',
    type: 'Craft store'
  }
];

async function importPlace(place: PlaceToImport): Promise<void> {
  try {
    console.log(`\n🔍 正在搜索: ${place.name} (${place.location})`);
    
    // 使用地点名称和地址搜索
    const searchQuery = `${place.name}, ${place.location}`;
    
    console.log(`📝 搜索关键词: ${searchQuery}`);
    
    // 调用导入接口 - 使用对话导入功能
    const response = await axios.post(`${API_BASE_URL}/api/public-places/import-from-chat`, {
      message: searchQuery,
      context: {
        note: `${place.type} - Imported from Google Maps screenshot`
      }
    });

    if (response.data.success) {
      console.log(`✅ 成功导入: ${place.name}`);
      if (response.data.places && response.data.places.length > 0) {
        const imported = response.data.places[0];
        console.log(`   - Place ID: ${imported.place_id}`);
        console.log(`   - 地址: ${imported.address}`);
        console.log(`   - 评分: ${imported.rating} (${imported.user_ratings_total} 评价)`);
      }
    } else {
      console.log(`❌ 导入失败: ${place.name}`);
      console.log(`   错误: ${response.data.error}`);
    }
  } catch (error: any) {
    console.error(`❌ 错误 - ${place.name}:`, error.response?.data || error.message);
  }
}

async function main() {
  console.log('🚀 开始批量导入英国手工艺品店...\n');
  console.log(`📊 总计: ${placesToImport.length} 个地点\n`);
  console.log('='.repeat(60));

  let successCount = 0;
  let failedCount = 0;

  for (const place of placesToImport) {
    try {
      await importPlace(place);
      successCount++;
    } catch (error) {
      failedCount++;
    }
    // 延迟一下，避免请求过快
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n📈 导入完成！');
  console.log(`   ✅ 成功: ${successCount}`);
  console.log(`   ❌ 失败: ${failedCount}`);
  console.log(`   📊 总计: ${placesToImport.length}\n`);
}

main().catch(console.error);
