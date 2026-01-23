/**
 * 统一 Baku 城市名称
 * 
 * 将所有包含 "Baku" 的城市名称统一为 "Baku"
 * 处理的情况包括：
 * - "Baku"
 * - "Baku, Azerbaijan"
 * - "Baku City"
 * - 等等
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface UpdateStats {
  total: number;
  updated: number;
  skipped: number;
  errors: number;
}

const stats: UpdateStats = {
  total: 0,
  updated: 0,
  skipped: 0,
  errors: 0,
};

// 需要统一的目标城市名称
const TARGET_CITY = 'Baku';

// 判断城市是否包含 Baku（不区分大小写）
function containsBaku(city: string | null | undefined): boolean {
  if (!city) return false;
  return city.toLowerCase().includes('baku');
}

// 判断是否是 Baku 相关的城市
function isBakuCity(city: string | null | undefined): boolean {
  if (!city) return false;
  const lowerCity = city.toLowerCase().trim();
  
  // 包含 baku
  return lowerCity.includes('baku');
}

async function main() {
  console.log('🚀 开始统一 Baku 城市名称...\n');

  try {
    // 查找所有包含 Baku 的城市
    const places = await prisma.place.findMany({
      where: {
        city: {
          contains: 'Baku',
          mode: 'insensitive', // 不区分大小写
        },
      },
      select: {
        id: true,
        name: true,
        city: true,
        country: true,
      },
    });

    stats.total = places.length;
    console.log(`📊 找到 ${places.length} 个包含 "Baku" 的地点\n`);

    if (places.length === 0) {
      console.log('✅ 没有需要更新的地点');
      return;
    }

    // 显示将要更新的地点
    console.log('📋 将要更新的地点：\n');
    places.forEach((place, index) => {
      console.log(`  ${index + 1}. ${place.name}`);
      console.log(`     当前城市: "${place.city}"`);
      console.log(`     国家: ${place.country || 'N/A'}\n`);
    });

    // 确认是否继续
    console.log(`\n将把所有城市名称统一为: "${TARGET_CITY}"`);
    console.log(`共 ${places.length} 个地点将被更新\n`);

    // 批量更新
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const place of places) {
      try {
        // 检查是否已经是目标名称
        if (place.city?.trim() === TARGET_CITY) {
          console.log(`  ⏭️  跳过: ${place.name} (已经是 "${TARGET_CITY}")`);
          skippedCount++;
          continue;
        }

        // 检查是否是 Baku 相关的城市
        if (!isBakuCity(place.city)) {
          console.log(`  ⏭️  跳过: ${place.name} (城市 "${place.city}" 不是 Baku 相关)`);
          skippedCount++;
          continue;
        }

        // 更新城市名称
        await prisma.place.update({
          where: { id: place.id },
          data: { city: TARGET_CITY },
        });

        console.log(`  ✅ 更新: ${place.name}`);
        console.log(`     从: "${place.city}" → "${TARGET_CITY}"`);
        updatedCount++;
      } catch (error: any) {
        console.error(`  ❌ 错误: ${place.name} - ${error.message}`);
        errorCount++;
      }
    }

    stats.updated = updatedCount;
    stats.skipped = skippedCount;
    stats.errors = errorCount;

    // 打印统计信息
    console.log('\n========================================');
    console.log('✅ 更新完成!');
    console.log(`   总数: ${stats.total}`);
    console.log(`   已更新: ${stats.updated}`);
    console.log(`   已跳过: ${stats.skipped}`);
    console.log(`   错误: ${stats.errors}`);
    console.log('========================================\n');

    // 验证更新结果
    const remaining = await prisma.place.count({
      where: {
        city: {
          contains: 'Baku',
          mode: 'insensitive',
        },
        NOT: {
          city: TARGET_CITY,
        },
      },
    });

    if (remaining > 0) {
      console.log(`⚠️  仍有 ${remaining} 个地点包含 "Baku" 但未统一\n`);
    } else {
      console.log('✅ 所有 Baku 城市名称已统一！\n');
    }
  } catch (error) {
    console.error('❌ 更新过程中发生错误:', error);
    throw error;
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
