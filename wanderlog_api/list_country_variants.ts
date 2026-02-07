import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normalizeCountry(country: string) {
  return country
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

async function listCountryVariants() {
  try {
    const places = await prisma.place.findMany({
      where: {
        country: {
          not: null,
        },
      },
      select: {
        country: true,
      },
    });

    const counts = new Map<string, number>();
    for (const place of places) {
      const country = (place.country || "").trim();
      if (!country) {
        continue;
      }
      counts.set(country, (counts.get(country) || 0) + 1);
    }

    const groups = new Map<string, { total: number; variants: Map<string, number> }>();

    for (const [country, count] of counts.entries()) {
      const key = normalizeCountry(country);
      if (!groups.has(key)) {
        groups.set(key, { total: 0, variants: new Map() });
      }
      const group = groups.get(key)!;
      group.total += count;
      group.variants.set(country, count);
    }

    const duplicateGroups = Array.from(groups.entries())
      .filter(([, group]) => group.variants.size > 1)
      .sort((a, b) => b[1].total - a[1].total);

    if (duplicateGroups.length === 0) {
      console.log("未发现国家名称的重复变体。\n");
      return;
    }

    console.log(`发现 ${duplicateGroups.length} 组国家名称重复变体：\n`);

    duplicateGroups.forEach(([, group], index) => {
      const variants = Array.from(group.variants.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => `${name} (${count})`)
        .join(" | ");
      console.log(`${index + 1}. ${variants}`);
    });
  } catch (error) {
    console.error("❌ 查询失败:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

listCountryVariants();
