/**
 * 校准 Pilgrimage 地点名称为英文（优先使用 i18n.name_en）
 *
 * 用法：
 * - 预览（不修改）：npx tsx scripts/fix-pilgrimage-english-names.ts
 * - 执行修改：npx tsx scripts/fix-pilgrimage-english-names.ts --execute
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PILGRIMAGE_TAG = 'Pilgrimage';

type PlaceRecord = {
  id: string;
  name: string;
  source: string | null;
  tags: any;
  i18n: any;
};

function parseTags(value: any): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === 'object' && parsed ? parsed : null;
    } catch {
      return null;
    }
  }
  return typeof value === 'object' ? value : null;
}

function hasPilgrimageTag(tags: Record<string, unknown> | null): boolean {
  if (!tags) return false;
  const others = (tags as any).others;
  if (Array.isArray(others)) {
    return others.some((tag) => String(tag).toLowerCase() === PILGRIMAGE_TAG.toLowerCase());
  }
  return false;
}

function extractEnglishName(i18n: any): string | null {
  if (!i18n) return null;
  if (typeof i18n === 'string') {
    try {
      const parsed = JSON.parse(i18n);
      return typeof parsed?.name_en === 'string' ? parsed.name_en.trim() : null;
    } catch {
      return null;
    }
  }
  if (typeof i18n === 'object' && typeof i18n.name_en === 'string') {
    return i18n.name_en.trim();
  }
  return null;
}

async function run(dryRun: boolean) {
  console.log(`\n🚀 校准 Pilgrimage 英文名 (dry-run: ${dryRun})\n`);

  const places = await prisma.place.findMany({
    where: { source: 'mocation' },
    select: {
      id: true,
      name: true,
      source: true,
      tags: true,
      i18n: true,
    },
  });

  const targets = places.filter((place) => {
    const tags = parseTags(place.tags);
    return hasPilgrimageTag(tags);
  });

  console.log(`📊 Mocation 总数: ${places.length}`);
  console.log(`🎯 Pilgrimage 目标数: ${targets.length}\n`);

  let updated = 0;
  let skipped = 0;

  for (const place of targets) {
    const enName = extractEnglishName(place.i18n);
    if (!enName || enName.length === 0) {
      skipped++;
      continue;
    }
    if (place.name === enName) {
      skipped++;
      continue;
    }

    if (!dryRun) {
      await prisma.place.update({
        where: { id: place.id },
        data: {
          name: enName,
        },
      });
    }

    updated++;
    console.log(`  ✅ ${place.name} → ${enName}`);
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 校准统计');
  console.log('='.repeat(50));
  console.log(`  已更新: ${updated}`);
  console.log(`  已跳过: ${skipped}`);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');
  await run(dryRun);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
