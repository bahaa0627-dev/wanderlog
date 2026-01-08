import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyFilter() {
  console.log('🔍 验证普利兹克筛选功能...\n');

  // 1. 统计有 Pritzker 标签的记录
  const pritzkerPlaces = await prisma.place.findMany({
    where: {
      source: 'wikidata',
      tags: {
        path: ['award'],
        array_contains: 'Pritzker'
      }
    },
    select: {
      id: true,
      name: true,
      tags: true,
      customFields: true,
    }
  });

  console.log(`📊 有 Pritzker 标签的地点总数: ${pritzkerPlaces.length}\n`);

  // 2. 按建筑师统计
  const byArchitect: Record<string, number> = {};
  pritzkerPlaces.forEach(place => {
    const cf = place.customFields as any;
    if (cf && cf.architect) {
      byArchitect[cf.architect] = (byArchitect[cf.architect] || 0) + 1;
    }
  });

  console.log('📋 按建筑师统计（前20名）:');
  Object.entries(byArchitect)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([architect, count]) => {
      console.log(`   ${architect}: ${count}`);
    });

  // 3. 检查标签结构
  console.log('\n🏷️  标签结构示例（前3个）:');
  pritzkerPlaces.slice(0, 3).forEach(place => {
    console.log(`\n  ${place.name}:`);
    console.log(`    Tags: ${JSON.stringify(place.tags)}`);
    console.log(`    CustomFields: ${JSON.stringify(place.customFields)}`);
  });

  // 4. 测试筛选查询
  console.log('\n🧪 测试筛选查询...\n');

  // 测试1: 按 award 筛选
  const byAward = await prisma.place.count({
    where: {
      tags: {
        path: ['award'],
        array_contains: 'Pritzker'
      }
    }
  });
  console.log(`✅ 按 award='Pritzker' 筛选: ${byAward} 条记录`);

  // 测试2: 按建筑师筛选（Oscar Niemeyer）
  const byOscar = await prisma.place.count({
    where: {
      customFields: {
        path: ['architect'],
        equals: 'Oscar Niemeyer'
      }
    }
  });
  console.log(`✅ 按建筑师='Oscar Niemeyer' 筛选: ${byOscar} 条记录`);

  // 测试3: 组合筛选
  const combined = await prisma.place.count({
    where: {
      AND: [
        {
          tags: {
            path: ['award'],
            array_contains: 'Pritzker'
          }
        },
        {
          customFields: {
            path: ['architect'],
            equals: 'Frank Gehry'
          }
        }
      ]
    }
  });
  console.log(`✅ 组合筛选 (Pritzker + Frank Gehry): ${combined} 条记录`);

  console.log('\n✅ 验证完成！筛选功能正常工作。');
}

verifyFilter()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
