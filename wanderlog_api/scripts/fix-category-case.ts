/**
 * 修复分类大小写不一致问题
 * 1. cafe -> Cafe
 * 2. market -> Market  
 * 3. museum -> Museum
 * 4. other -> Others
 * 5. design -> Others (或根据情况改成其他分类)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 分类映射：小写 -> 首字母大写
const CATEGORY_FIXES: Record<string, string> = {
  'cafe': 'Cafe',
  'market': 'Market',
  'museum': 'Museum',
  'other': 'Others',
  'design': 'Others', // design 统一改成 Others
};

async function main() {
  console.log('🔍 开始修复分类大小写问题...\n');
  
  let totalFixed = 0;
  
  for (const [oldCategory, newCategory] of Object.entries(CATEGORY_FIXES)) {
    console.log(`\n📦 处理: "${oldCategory}" -> "${newCategory}"`);
    
    // 查找需要修复的记录数
    const count = await prisma.place.count({
      where: {
        OR: [
          { categorySlug: oldCategory },
          { categoryEn: oldCategory },
        ]
      }
    });
    
    if (count === 0) {
      console.log(`   ✓ 没有需要修复的记录`);
      continue;
    }
    
    console.log(`   找到 ${count} 条记录`);
    
    // 批量更新 categorySlug
    const slugResult = await prisma.place.updateMany({
      where: { categorySlug: oldCategory },
      data: { categorySlug: newCategory }
    });
    
    // 批量更新 categoryEn
    const enResult = await prisma.place.updateMany({
      where: { categoryEn: oldCategory },
      data: { categoryEn: newCategory }
    });
    
    console.log(`   ✅ 已修复: slug=${slugResult.count}, en=${enResult.count}`);
    totalFixed += Math.max(slugResult.count, enResult.count);
  }
  
  console.log(`\n\n========================================`);
  console.log(`✅ 总共修复了约 ${totalFixed} 条记录`);
  console.log(`========================================\n`);
  
  // 验证结果：显示当前所有分类
  console.log('📊 当前分类统计 (category_slug):');
  const slugStats = await prisma.place.groupBy({
    by: ['categorySlug'],
    _count: true,
    orderBy: { _count: { categorySlug: 'desc' } }
  });
  
  for (const stat of slugStats) {
    console.log(`   ${stat.categorySlug}: ${stat._count}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
