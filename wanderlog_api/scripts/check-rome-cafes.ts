import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
  // 精确匹配：city = "Rome", categoryEn = "Cafe", coverImage is not null
  const exactCount = await prisma.place.count({
    where: {
      city: 'Rome',
      categoryEn: 'Cafe',
      coverImage: { not: null },
    },
  });
  console.log('Exact match (city=Rome, categoryEn=Cafe, coverImage not null):', exactCount);
  
  // 检查 coverImage 不为空字符串的
  const notEmptyCount = await prisma.place.count({
    where: {
      city: 'Rome',
      categoryEn: 'Cafe',
      AND: [
        { coverImage: { not: null } },
        { coverImage: { not: '' } },
      ],
    },
  });
  console.log('With coverImage not null AND not empty:', notEmptyCount);
  
  // 列出前 10 个
  const samples = await prisma.place.findMany({
    where: {
      city: 'Rome',
      categoryEn: 'Cafe',
      coverImage: { not: null },
    },
    select: { name: true, coverImage: true },
    take: 10,
  });
  console.log('\nSample cafes:');
  samples.forEach(s => {
    const hasImage = s.coverImage && s.coverImage.length > 0;
    console.log(`  - ${s.name} - coverImage: ${hasImage ? 'YES (' + s.coverImage?.substring(0, 50) + '...)' : 'EMPTY'}`);
  });
  
  await prisma.$disconnect();
}

check();
