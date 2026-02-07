import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function updateUKCountry() {
  try {
    // 查询所有国家为 UK 的地点数量
    const placesWithUK = await prisma.place.findMany({
      where: {
        country: "UK",
      },
      select: {
        id: true,
        name: true,
        country: true,
      },
    });

    console.log(`\n找到 ${placesWithUK.length} 个国家为 UK 的地点:`);
    placesWithUK.forEach((place, index) => {
      console.log(`  ${index + 1}. ${place.name} (${place.country})`);
    });

    // 更新国家从 UK 到 United Kingdom
    const updateResult = await prisma.place.updateMany({
      where: {
        country: "UK",
      },
      data: {
        country: "United Kingdom",
      },
    });

    console.log(
      `\n✅ 成功更新 ${updateResult.count} 个地点的国家从 'UK' 到 'United Kingdom'`
    );

    // 验证更新结果
    const placesAfterUpdate = await prisma.place.findMany({
      where: {
        country: "United Kingdom",
      },
      select: {
        id: true,
        name: true,
        country: true,
      },
    });

    console.log(
      `\n验证: 现在有 ${placesAfterUpdate.length} 个地点的国家为 'United Kingdom'`
    );
  } catch (error) {
    console.error("❌ 更新失败:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

updateUKCountry();
