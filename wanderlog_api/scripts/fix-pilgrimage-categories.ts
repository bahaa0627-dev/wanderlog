/**
 * 校准 Pilgrimage 地点的分类标签（基于名称关键词）
 *
 * 目标：
 * - 修复明显错误的分类（如 church -> restaurant, trail -> hotel）
 * - 仅更新匹配到关键词的地点，避免误伤
 *
 * 用法：
 * - 预览（不修改）：tsx scripts/fix-pilgrimage-categories.ts
 * - 执行修改：tsx scripts/fix-pilgrimage-categories.ts --execute
 */

import { PrismaClient } from '@prisma/client';
import { CATEGORY_DISPLAY_NAMES, CATEGORY_ZH_NAMES } from '../src/constants/categories';

const prisma = new PrismaClient();

const PILGRIMAGE_TAG = 'Pilgrimage';

type PlaceRecord = {
  id: string;
  name: string;
  source: string | null;
  categorySlug: string | null;
  categoryEn: string | null;
  categoryZh: string | null;
  tags: any;
  i18n: any;
};

const NAME_KEYWORD_MAPPINGS: Array<{ patterns: RegExp[]; slug: string }> = [
  // Religious
  {
    slug: 'church',
    patterns: [
      /church/i,
      /cathedral/i,
      /basilica/i,
      /chapel/i,
      /abbey/i,
      /monastery/i,
      /convent/i,
      /kirche/i,
      /église/i,
      /iglesia/i,
      /igreja/i,
      /chiesa/i,
      /教会|教堂/,
    ],
  },
  {
    slug: 'temple',
    patterns: [
      /temple/i,
      /shrine/i,
      /jinja/i,
      /寺|寺院|神社|神宮|寺庙|寺廟/,
    ],
  },
  {
    slug: 'cemetery',
    patterns: [
      /cemetery/i,
      /graveyard/i,
      /friedhof/i,
      /cimitero/i,
      /cimetière/i,
      /墓地/,
    ],
  },
  // Heritage & culture
  {
    slug: 'castle',
    patterns: [
      /castle/i,
      /palace/i,
      /fortress/i,
      /chateau/i,
      /schloss/i,
      /palazzo/i,
      /\bfort\b/i,
      /城|宫|宮/,
    ],
  },
  {
    slug: 'museum',
    patterns: [
      /museum/i,
      /museo/i,
      /musée/i,
      /博物馆|博物館/,
    ],
  },
  {
    slug: 'art_gallery',
    patterns: [
      /gallery/i,
      /galerie/i,
      /galleria/i,
      /art\s*center/i,
      /美術館/,
    ],
  },
  // Nature / outdoor
  {
    slug: 'park',
    patterns: [
      /\bpark\b/i,
      /garden/i,
      /botanical/i,
      /arboretum/i,
      /national\s*park/i,
      /reserve\b/i,
      /trail/i,
      /hiking/i,
      /trek/i,
      /falls?\b/i,
      /waterfall/i,
      /lake/i,
      /river/i,
      /beach/i,
      /island/i,
      /coast/i,
      /bay\b/i,
      /forest/i,
      /woods?\b/i,
      /valley/i,
      /gorge/i,
      /canyon/i,
      /cliff/i,
      /mountain/i,
      /\bmount\b/i,
      /peak/i,
      /volcano/i,
      /glacier/i,
      /cave/i,
    ],
  },
  // Built environment
  {
    slug: 'building',
    patterns: [
      /tower/i,
      /bridge/i,
      /station/i,
      /terminal/i,
      /airport/i,
      /gate/i,
    ],
  },
  // Landmark (fallback for monuments)
  {
    slug: 'landmark',
    patterns: [
      /monument/i,
      /memorial/i,
      /statue/i,
      /square/i,
      /viewpoint/i,
      /lookout/i,
      /scenic/i,
      /attraction/i,
      /ruins?/i,
      /heritage/i,
    ],
  },
];

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

function extractNameText(place: PlaceRecord): string {
  const parts: string[] = [];
  if (place.name) parts.push(place.name);
  const i18n = place.i18n;
  if (i18n && typeof i18n === 'object') {
    if (typeof i18n.name_zh === 'string') parts.push(i18n.name_zh);
    if (typeof i18n.name_en === 'string') parts.push(i18n.name_en);
  } else if (typeof i18n === 'string') {
    try {
      const parsed = JSON.parse(i18n);
      if (parsed?.name_zh) parts.push(parsed.name_zh);
      if (parsed?.name_en) parts.push(parsed.name_en);
    } catch {
      // ignore
    }
  }
  return parts.join(' ').trim();
}

function inferCategoryFromName(name: string): string | null {
  for (const mapping of NAME_KEYWORD_MAPPINGS) {
    for (const pattern of mapping.patterns) {
      if (pattern.test(name)) {
        return mapping.slug;
      }
    }
  }
  return null;
}

async function run(dryRun: boolean) {
  console.log(`\n🚀 校准 Pilgrimage 分类 (dry-run: ${dryRun})\n`);

  const places = await prisma.place.findMany({
    where: { source: 'mocation' },
    select: {
      id: true,
      name: true,
      source: true,
      categorySlug: true,
      categoryEn: true,
      categoryZh: true,
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
  const byCategory = new Map<string, number>();

  for (const place of targets) {
    const nameText = extractNameText(place);
    const inferred = inferCategoryFromName(nameText);

    if (!inferred) {
      skipped++;
      continue;
    }

    if (place.categorySlug === inferred) {
      skipped++;
      continue;
    }

    const newEn = CATEGORY_DISPLAY_NAMES[inferred] || inferred;
    const newZh = CATEGORY_ZH_NAMES[inferred] || inferred;

    if (!dryRun) {
      await prisma.place.update({
        where: { id: place.id },
        data: {
          categorySlug: inferred,
          categoryEn: newEn,
          categoryZh: newZh,
        },
      });
    }

    updated++;
    byCategory.set(inferred, (byCategory.get(inferred) || 0) + 1);
    console.log(`  ✅ ${place.name} → ${inferred}`);
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 校准统计');
  console.log('='.repeat(50));
  console.log(`  已更新: ${updated}`);
  console.log(`  已跳过: ${skipped}`);
  if (byCategory.size > 0) {
    console.log('\n  按分类统计:');
    const sorted = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1]);
    for (const [cat, count] of sorted) {
      console.log(`    - ${cat}: ${count} 条`);
    }
  }
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
