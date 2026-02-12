import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkOpeningHours() {
  console.log('\n🕐 检查营业时间数据\n');
  console.log('=' .repeat(80));
  
  const places = [
    "Cafe & Restaurant Mars",
    "Kensal Green Cemetery",
    "St Andrew's Church, Kingsbury", 
    "Smith & Wollensky"
  ];
  
  for (const name of places) {
    const place = await prisma.place.findFirst({
      where: { name, city: 'London' },
      select: { name: true, openingHours: true }
    });
    
    if (place) {
      console.log(`\n📍 ${place.name}`);
      if (place.openingHours) {
        console.log('   营业时间类型:', typeof place.openingHours);
        console.log('   营业时间内容:', place.openingHours);
        
        // 如果是字符串，尝试解析
        if (typeof place.openingHours === 'string') {
          try {
            const parsed = JSON.parse(place.openingHours);
            console.log('   解析后:');
            Object.entries(parsed).forEach(([day, hours]) => {
              console.log(`      ${day}: ${hours}`);
            });
          } catch (e) {
            console.log('   ❌ 无法解析 JSON');
          }
        } else {
          console.log('   ⚠️  不是字符串格式');
        }
      } else {
        console.log('   ❌ openingHours 为 null');
      }
    }
  }
  
  console.log('\n' + '='.repeat(80) + '\n');
  await prisma.$disconnect();
}

checkOpeningHours().catch(console.error);
