import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function findSimilarImageUrls() {
  try {
    // 查找所有使用 /places/{id}/cover.jpg 格式的地点
    const places = await prisma.place.findMany({
      where: {
        coverImage: {
          contains: '/places/'
        }
      },
      select: {
        id: true,
        name: true,
        city: true,
        coverImage: true,
      }
    });

    // 分类不同的 URL 格式
    const oldFormat: any[] = [];  // /places/{id}/cover.jpg
    const newFormat: any[] = [];  // /places/cover/v1/{path}.jpg
    const other: any[] = [];

    places.forEach(place => {
      if (!place.coverImage) return;
      
      const url = place.coverImage;
      
      // 检查是否是旧格式 (UUID直接跟在places/后面)
      if (url.match(/\/places\/[a-f0-9-]{36}\/cover\.jpg/)) {
        oldFormat.push(place);
      }
      // 检查是否是新格式 (有 cover/v1/ 路径)
      else if (url.includes('/places/cover/v1/')) {
        newFormat.push(place);
      }
      else {
        other.push(place);
      }
    });

    console.log('\n📊 统计结果:');
    console.log(`  总共: ${places.length} 个地点有图片`);
    console.log(`  旧格式 (/places/{id}/cover.jpg): ${oldFormat.length} 个`);
    console.log(`  新格式 (/places/cover/v1/...): ${newFormat.length} 个`);
    console.log(`  其他格式: ${other.length} 个`);

    if (oldFormat.length > 0) {
      console.log('\n🔴 需要手动上传图片的地点 (旧格式):');
      oldFormat.forEach((place, index) => {
        console.log(`\n${index + 1}. ${place.name}${place.city ? ` (${place.city})` : ''}`);
        console.log(`   ID: ${place.id}`);
        console.log(`   URL: ${place.coverImage}`);
      });
    }

    // 导出为 JSON 方便批量处理
    const fs = require('fs');
    fs.writeFileSync(
      'places_with_old_format_images.json',
      JSON.stringify(oldFormat, null, 2)
    );
    console.log(`\n✅ 详细列表已导出到: places_with_old_format_images.json`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

findSimilarImageUrls();
