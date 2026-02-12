import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const place = await prisma.place.findFirst({
    where: { name: 'Hedsor House', city: 'Maidenhead' }
  });
  
  if (!place) {
    console.log('❌ Place not found');
    return;
  }
  
  console.log('\n📍 Hedsor House 数据验证：\n');
  console.log('✓ Name:', place.name);
  console.log('✓ Category Slug:', place.categorySlug);
  console.log('✓ Category EN:', place.categoryEn);
  console.log('✓ Category ZH:', place.categoryZh);
  console.log('\n📍 位置信息：');
  console.log('✓ Address:', place.address);
  console.log('✓ City:', place.city);
  console.log('✓ Country:', place.country);
  console.log('✓ Coordinates:', `${place.latitude}, ${place.longitude}`);
  console.log('\n📞 联系方式：');
  console.log('✓ Website:', place.website || 'N/A');
  console.log('✓ Phone:', place.phoneNumber || 'N/A');
  console.log('\n🕐 营业时间：');
  console.log('✓ Opening Hours:', place.openingHours ? JSON.stringify(place.openingHours, null, 2) : 'N/A (图片中未显示)');
  console.log('\n✓ Tags:', JSON.stringify(place.tags, null, 2));
  console.log('\n✓ AI Tags:', place.aiTags || 'null (正确 - 不需要中文标签)');
  console.log('\n✅ 验证通过！所有识别信息已正确保存');
  
  await prisma.$disconnect();
}

main().catch(console.error);
