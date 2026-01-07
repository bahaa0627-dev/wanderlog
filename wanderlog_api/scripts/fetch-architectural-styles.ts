/**
 * Fetch Architectural Styles Script
 * 从 Wikidata 获取建筑风格并更新数据库
 *
 * 功能：
 * 1. 查询 source='wikidata' 的建筑
 * 2. 从 Wikidata API 获取 P149 (architectural style) 属性
 * 3. 更新 tags.style 字段（替换 "Architecture" 为真正的风格）
 *
 * 使用方法：
 *   npx ts-node scripts/fetch-architectural-styles.ts [options]
 *
 * 选项：
 *   --limit <n>     限制处理数量
 *   --dry-run       只预览，不写入数据库
 */

import axios from 'axios';
import prisma from '../src/config/database';

// ============================================================================
// Configuration
// ============================================================================

const RATE_LIMIT_DELAY_MS = 1200; // 1.2 秒延迟

// Wikidata 建筑风格 QID 到简洁英文名称的映射
const STYLE_QID_MAP: Record<string, string> = {
  'Q46970': 'Modernist',
  'Q131681': 'Brutalist',
  'Q188740': 'Postmodern',
  'Q181902': 'Deconstructivist',
  'Q34636': 'Art Nouveau',
  'Q173417': 'Art Deco',
  'Q186363': 'International Style',
  'Q1473346': 'High-tech',
  'Q1754286': 'Organic',
  'Q1640824': 'Minimalist',
  'Q1792644': 'Expressionist',
  'Q2044250': 'Functionalist',
  'Q3039121': 'Metabolist',
  'Q7725634': 'Contemporary',
  'Q1074552': 'Neoclassical',
  'Q842256': 'Gothic Revival',
  'Q245031': 'Neo-futurist',
  'Q1139528': 'Constructivist',
  'Q1640657': 'Streamline Moderne',
  'Q48537': 'Gothic',
  'Q4692': 'Renaissance',
  'Q4440864': 'Baroque',
  'Q877729': 'Romanesque',
  'Q641066': 'Byzantine',
  'Q179700': 'Classical',
  'Q1513688': 'Parametric',
  'Q2142439': 'Blob',
};

/**
 * 清理风格名称，去掉 "architecture" 后缀
 */
function cleanStyleName(style: string): string {
  return style
    .replace(/\s*architecture$/i, '')
    .replace(/\s*style$/i, '')
    .trim();
}

// ============================================================================
// Types
// ============================================================================

interface ProcessResult {
  placeId: string;
  name: string;
  wikidataQID: string;
  stylesFound: string[];
  stylesBefore: string[];
  stylesAfter: string[];
  status: 'success' | 'no_styles' | 'error';
  error?: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(): { limit?: number; dryRun: boolean } {
  const args = process.argv.slice(2);
  let limit: number | undefined;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }

  return { limit, dryRun };
}


// ============================================================================
// Wikidata API Functions
// ============================================================================

/**
 * 从 Wikidata 获取建筑风格 (P149)
 */
async function fetchArchitecturalStyles(qid: string): Promise<string[]> {
  const url = `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;

  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'WanderLog/1.0 (https://wanderlog.app)',
        Accept: 'application/json',
      },
    });

    const entity = response.data.entities[qid];
    if (!entity || !entity.claims) {
      return [];
    }

    // P149 = architectural style
    const p149 = entity.claims.P149;
    if (!p149 || p149.length === 0) {
      return [];
    }

    const styles: string[] = [];
    for (const claim of p149) {
      const styleQID = claim?.mainsnak?.datavalue?.value?.id;
      if (styleQID && STYLE_QID_MAP[styleQID]) {
        styles.push(STYLE_QID_MAP[styleQID]);
      } else if (styleQID) {
        // 如果 QID 不在映射中，尝试获取标签
        const label = await fetchEntityLabel(styleQID);
        if (label) {
          const cleanedStyle = cleanStyleName(label);
          // 首字母大写
          const capitalizedStyle = cleanedStyle.charAt(0).toUpperCase() + cleanedStyle.slice(1);
          styles.push(capitalizedStyle);
        }
      }
    }

    return [...new Set(styles)]; // 去重
  } catch (error) {
    console.error(`[Wikidata] Error fetching ${qid}:`, error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * 获取 Wikidata 实体的英文标签
 */
async function fetchEntityLabel(qid: string): Promise<string | null> {
  try {
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=labels&languages=en&format=json`;
    const response = await axios.get(url, {
      timeout: 5000,
      headers: {
        'User-Agent': 'WanderLog/1.0 (https://wanderlog.app)',
      },
    });

    const label = response.data?.entities?.[qid]?.labels?.en?.value;
    return label || null;
  } catch {
    return null;
  }
}

// ============================================================================
// Database Functions
// ============================================================================

async function getPlacesToProcess(limit?: number) {
  const places = await prisma.place.findMany({
    where: {
      source: 'wikidata',
      sourceDetail: { not: null },
    },
    select: {
      id: true,
      name: true,
      sourceDetail: true,
      tags: true,
      aiTags: true,
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
  });

  return places;
}

async function updatePlaceStyles(
  placeId: string,
  tags: any,
  aiTags: any[]
): Promise<void> {
  await prisma.place.update({
    where: { id: placeId },
    data: {
      tags,
      aiTags,
      updatedAt: new Date(),
    },
  });
}


// ============================================================================
// Main Processing Function
// ============================================================================

async function processPlace(
  place: { id: string; name: string; sourceDetail: string | null; tags: any; aiTags: any },
  dryRun: boolean
): Promise<ProcessResult> {
  const qid = place.sourceDetail;
  const existingTags = place.tags as { award?: string[]; style?: string[]; architect?: string[] } || {};
  const existingStyles = existingTags.style || [];

  if (!qid || !qid.startsWith('Q')) {
    return {
      placeId: place.id,
      name: place.name,
      wikidataQID: qid || 'N/A',
      stylesFound: [],
      stylesBefore: existingStyles,
      stylesAfter: existingStyles,
      status: 'error',
      error: 'Invalid QID',
    };
  }

  // 获取建筑风格
  const styles = await fetchArchitecturalStyles(qid);
  await delay(RATE_LIMIT_DELAY_MS);

  // 无论是否有风格，都更新 tags 和 type
  const newStyles = styles.length > 0 ? styles : []; // 有风格用风格，没有则为空数组
  const newTags = {
    ...existingTags,
    style: newStyles,
  };

  // 更新 aiTags
  const existingAiTags = (place.aiTags as any[]) || [];
  // 移除旧的 "Architecture" 标签
  const filteredAiTags = existingAiTags.filter((t: any) => t.en !== 'Architecture');
  // 添加新的风格标签（priority 80）
  for (const style of newStyles) {
    if (!filteredAiTags.some((t: any) => t.en === style)) {
      filteredAiTags.push({ en: style, priority: 80 });
    }
  }
  // 重新排序
  filteredAiTags.sort((a: any, b: any) => b.priority - a.priority);

  if (!dryRun) {
    await updatePlaceStyles(place.id, newTags, filteredAiTags);
  }

  return {
    placeId: place.id,
    name: place.name,
    wikidataQID: qid,
    stylesFound: styles,
    stylesBefore: existingStyles,
    stylesAfter: newStyles,
    status: styles.length > 0 ? 'success' : 'no_styles',
  };
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('Fetch Architectural Styles Script');
  console.log('从 Wikidata 获取建筑风格');
  console.log('='.repeat(60));

  const { limit, dryRun } = parseArgs();

  console.log('\n配置:');
  console.log(`  - 处理限制: ${limit || '全部'}`);
  console.log(`  - 模式: ${dryRun ? '预览 (dry-run)' : '实际写入'}`);

  console.log('\n正在查询数据库...');
  const places = await getPlacesToProcess(limit);
  console.log(`找到 ${places.length} 个建筑需要处理`);

  if (places.length === 0) {
    console.log('没有需要处理的建筑，退出');
    await prisma.$disconnect();
    return;
  }

  const results: ProcessResult[] = [];
  let successCount = 0;
  let noStylesCount = 0;
  let errorCount = 0;

  console.log('\n开始处理...\n');

  for (let i = 0; i < places.length; i++) {
    const place = places[i];
    const progress = `[${i + 1}/${places.length}]`;

    console.log(`${progress} 处理: ${place.name} (${place.sourceDetail})`);

    const result = await processPlace(place, dryRun);
    results.push(result);

    switch (result.status) {
      case 'success':
        successCount++;
        console.log(`  ✅ 找到风格: ${result.stylesFound.join(', ')}`);
        break;
      case 'no_styles':
        noStylesCount++;
        console.log(`  ⚠️ 无风格信息`);
        break;
      case 'error':
        errorCount++;
        console.log(`  ❌ 错误: ${result.error}`);
        break;
    }
  }

  // 打印统计
  console.log('\n' + '='.repeat(60));
  console.log('处理完成');
  console.log('='.repeat(60));
  console.log(`\n统计:`);
  console.log(`  - 总数: ${places.length}`);
  console.log(`  - 成功获取风格: ${successCount}`);
  console.log(`  - 无风格信息: ${noStylesCount}`);
  console.log(`  - 错误: ${errorCount}`);

  if (dryRun) {
    console.log('\n⚠️ 这是预览模式，数据库未被修改');
  }

  // 保存报告
  const fs = await import('fs');
  const reportPath = `reports/styles-report_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        config: { limit, dryRun },
        summary: { total: places.length, success: successCount, noStyles: noStylesCount, errors: errorCount },
        results: results.filter(r => r.status === 'success'), // 只保存成功的
      },
      null,
      2
    )
  );
  console.log(`\n报告已保存: ${reportPath}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('脚本执行失败:', error);
  prisma.$disconnect();
  process.exit(1);
});
