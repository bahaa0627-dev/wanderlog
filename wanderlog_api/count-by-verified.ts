import prisma from './src/config/database';

async function countByVerified() {
  // 总数
  const total = await prisma.place.count({
    where: {
      source: 'wikidata'
    }
  });

  // 已验证的（通过 Apify 更新过的）
  const verified = await prisma.place.count({
    where: {
      source: 'wikidata',
      isVerified: true
    }
  });

  // 未验证的
  const unverified = total - verified;

  console.log('📊 Wikidata 地点统计（按验证状态）：');
  console.log(`   总数: ${total}`);
  console.log(`   已验证（通过 Apify 更新）: ${verified}`);
  console.log(`   未验证: ${unverified}`);
  console.log(`   验证进度: ${((verified / total) * 100).toFixed(1)}%`);
  console.log('');
  console.log('📍 批次处理记录：');
  console.log('   批次 1: 100 个');
  console.log('   批次 2: 500 个');
  console.log('   批次 3: 500 个');
  console.log('   批次 4: 884 个（从 1000 个导出）');
  console.log(`   总计: ${verified} 个已验证`);

  await prisma.$disconnect();
}

countByVerified().catch(console.error);
