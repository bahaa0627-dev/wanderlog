import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updateOpeningHours() {
  console.log('\n🔄 更新营业时间...\n');
  
  // 更新 Kensal Green Cemetery
  const cemetery = await prisma.place.findFirst({
    where: { 
      name: 'Kensal Green Cemetery',
      city: 'London'
    }
  });
  
  if (cemetery) {
    const openingHours = {
      "Monday": "8 AM–5 PM",
      "Tuesday": "9 AM–5 PM",
      "Wednesday": "9 AM–5 PM",
      "Thursday": "9 AM–5 PM",
      "Friday": "9 AM–5 PM",
      "Saturday": "9 AM–5 PM",
      "Sunday": "10 AM–5 PM"
    };
    
    await prisma.place.update({
      where: { id: cemetery.id },
      data: {
        openingHours: JSON.stringify(openingHours),
        rating: 4.6,
        ratingCount: 62
      }
    });
    
    console.log('✅ Kensal Green Cemetery - 营业时间已更新');
    console.log('   Monday: 8 AM–5 PM');
    console.log('   Tuesday-Saturday: 9 AM–5 PM');
    console.log('   Sunday: 10 AM–5 PM');
  }
  
  console.log('\n✨ 完成！\n');
  await prisma.$disconnect();
}

updateOpeningHours().catch(console.error);
