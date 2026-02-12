import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const placeNames = [
  "Cafe & Restaurant Mars",
  "Kensal Green Cemetery",
  "St Andrew's Church, Kingsbury",
  "Smith & Wollensky"
];

async function verify() {
  console.log('\n📊 验证批量添加的地点\n');
  console.log('=' .repeat(80));
  
  let successCount = 0;
  
  for (const name of placeNames) {
    const place = await prisma.place.findFirst({
      where: { name, city: 'London' }
    });
    
    if (place) {
      successCount++;
      console.log(`\n✅ [${successCount}/${placeNames.length}] ${name}`);
      console.log(`   ID: ${place.id}`);
      console.log(`   分类: ${place.categoryEn} (${place.categorySlug})`);
      console.log(`   评分: ${place.rating ? place.rating + ' ⭐' : 'N/A'}`);
      console.log(`   地址: ${place.address || 'N/A'}`);
      console.log(`   网站: ${place.website || 'N/A'}`);
      console.log(`   电话: ${place.phoneNumber || 'N/A'}`);
      console.log(`   营业时间: ${place.openingHours ? '✓' : 'N/A'}`);
    } else {
      console.log(`\n❌ ${name} - 未找到`);
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log(`\n📈 总结: 成功添加 ${successCount}/${placeNames.length} 个地点\n`);
  
  await prisma.$disconnect();
}

verify().catch(console.error);
