import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const mappings: Array<{ from: string[]; to: string }> = [
  { from: ["Belgie", "Belgique", "Belgien", "België"], to: "Belgium" },
  { from: ["Bosna i Hercegovina", "Босна и Херцеговина"], to: "Bosnia and Herzegovina" },
  { from: ["Brasil"], to: "Brazil" },
  { from: ["México"], to: "Mexico" },
  { from: ["Hrvatska"], to: "Croatia" },
  { from: ["Magyarország"], to: "Hungary" },
  { from: ["Nederland"], to: "Netherlands" },
  { from: ["Suomi", "Finland"], to: "Finland" },
  { from: ["Sverige"], to: "Sweden" },
  { from: ["Türkiye"], to: "Turkey" },
  { from: ["USA"], to: "United States" },
  { from: ["مصر"], to: "Egypt" },
  { from: ["ایران"], to: "Iran" },
  { from: ["Россия"], to: "Russia" },
  { from: ["Україна"], to: "Ukraine" },
];

async function updateCountryMappings() {
  try {
    let totalUpdated = 0;

    for (const mapping of mappings) {
      const existing = await prisma.place.findMany({
        where: {
          country: {
            in: mapping.from,
          },
        },
        select: {
          id: true,
          name: true,
          country: true,
        },
      });

      if (existing.length === 0) {
        console.log(`\nℹ️  未找到需要更新的国家: ${mapping.from.join(" / ")}`);
        continue;
      }

      console.log(`\n准备更新 -> ${mapping.to}`);
      existing.slice(0, 10).forEach((place, index) => {
        console.log(`  ${index + 1}. ${place.name} (${place.country})`);
      });
      if (existing.length > 10) {
        console.log(`  ... 还有 ${existing.length - 10} 条`);
      }

      const result = await prisma.place.updateMany({
        where: {
          country: {
            in: mapping.from,
          },
        },
        data: {
          country: mapping.to,
        },
      });

      totalUpdated += result.count;
      console.log(`✅ 已更新 ${result.count} 条: ${mapping.from.join(" / ")} -> ${mapping.to}`);
    }

    console.log(`\n🎉 总共更新 ${totalUpdated} 条记录。`);
  } catch (error) {
    console.error("❌ 更新失败:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

updateCountryMappings();
