/**
 * Fetch Commons Images Script
 * 从 Wikimedia Commons 获取更多建筑图片
 *
 * 功能：
 * 1. 查询数据库中 source='wikidata' 的建筑
 * 2. 通过 Wikidata API 获取 Commons Category (P373)
 * 3. 从 Commons Category 获取最多 10 张图片
 * 4. 更新数据库中的 images 字段
 *
 * 使用方法：
 *   npx ts-node scripts/fetch-commons-images.ts [options]
 *
 * 选项：
 *   --limit <n>     限制处理的建筑数量（默认：全部）
 *   --dry-run       只预览，不写入数据库
 *   --skip-existing 跳过已有多张图片的建筑
 */

import axios from 'axios';
import prisma from '../src/config/database';

// ============================================================================
// Configuration
// ============================================================================

const MAX_IMAGES_PER_PLACE = 10;
const RATE_LIMIT_DELAY_MS = 1500; // 1.5 秒延迟，避免 API 限制

// ============================================================================
// Types
// ============================================================================

interface CommonsImage {
  title: string;
  url: string;
}

// ============================================================================
// Image Filtering - 只保留建筑外观图片
// ============================================================================

// 排除关键词（文件名包含这些词的图片会被过滤掉）
const EXCLUDE_KEYWORDS = [
  // 演出/活动相关
  'concert', 'performance', 'show', 'event', 'festival', 'tour',
  'conducts', 'conductor', 'orchestra', 'symphony', 'playing',
  'singer', 'band', 'musician', 'artist', 'stage',
  'gizzard', 'wizard', 'hackett', 'zacharias', 'spinvis', 'drummer', 'god_forbid',
  'fasnacht', 'carnival', 'parade', // 节日活动
  // 门票/票务
  'ticket', 'billet', 'entry', 'admission',
  // 室内/细节
  'interior', 'inside', 'lobby', 'foyer', 'hall_interior',
  'seat', 'seating', 'auditorium', 'counter', 'tvm',
  'gallery', 'theatre_at', 'theatre_ncpa', 'dance_theatre',
  'staircase', 'stairs', 'treppenhaus', 'saal_im', // 楼梯、室内大厅
  // 人物
  'portrait', 'headshot', 'person', 'people', 'crowd', 'audience',
  'dylan', 'björk', 'bob_', 'cropped', // 裁剪的人物照
  // 其他非建筑
  'logo', 'poster', 'flyer', 'brochure', 'map', 'plan', 'diagram',
  'construction', 'chantier', 'demolition',
  'model_of', 'rendering', 'details', 'aufgang',
  'gate_', 'embarcadère', 'passerelle', 'pont_',
  'cantus', 'pellegrini', // 特定排除
];

// 优先关键词（文件名包含这些词的图片会被优先选择）
const PREFER_KEYWORDS = [
  'exterior', 'facade', 'building', 'architecture',
  'front', 'entrance', 'main', 'view', 'panorama', 'panoramic',
  'aerial', 'drone', 'skyline', 'night', 'evening', 'sunset',
];

/**
 * 检查图片文件名是否应该被排除
 */
function shouldExcludeImage(fileName: string): boolean {
  const lowerName = fileName.toLowerCase();
  return EXCLUDE_KEYWORDS.some(keyword => lowerName.includes(keyword));
}

/**
 * 计算图片的优先级分数（分数越高越好）
 */
function getImagePriorityScore(fileName: string): number {
  const lowerName = fileName.toLowerCase();
  let score = 0;
  
  // 优先关键词加分
  for (const keyword of PREFER_KEYWORDS) {
    if (lowerName.includes(keyword)) {
      score += 10;
    }
  }
  
  // 文件名包含建筑名称的加分（通常是主图）
  // 简单的启发式：文件名较短的通常是主图
  if (fileName.length < 50) {
    score += 5;
  }
  
  return score;
}

/**
 * 标准化文件名用于去重（忽略大小写、空格/下划线差异、括号内容）
 */
function normalizeFileName(fileName: string): string {
  return fileName
    .toLowerCase()
    .replace(/[_\s-]+/g, '') // 移除下划线、空格、连字符
    .replace(/\([^)]*\)/g, '') // 移除括号及其内容
    .replace(/\.[^.]+$/, ''); // 移除扩展名
}

interface ProcessResult {
  placeId: string;
  name: string;
  wikidataQID: string;
  commonsCategory: string | null;
  imagesFound: number;
  imagesBefore: number;
  imagesAfter: number;
  status: 'success' | 'no_category' | 'no_images' | 'error';
  error?: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(): { limit?: number; dryRun: boolean; skipExisting: boolean } {
  const args = process.argv.slice(2);
  let limit: number | undefined;
  let dryRun = false;
  let skipExisting = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--skip-existing') {
      skipExisting = true;
    }
  }

  return { limit, dryRun, skipExisting };
}


// ============================================================================
// Wikidata API Functions
// ============================================================================

/**
 * 从 Wikidata 获取 Commons Category (P373)
 */
async function fetchCommonsCategory(qid: string): Promise<string | null> {
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
      return null;
    }

    // P373 = Commons category
    const p373 = entity.claims.P373;
    if (!p373 || p373.length === 0) {
      return null;
    }

    const value = p373[0]?.mainsnak?.datavalue?.value;
    return typeof value === 'string' ? value : null;
  } catch (error) {
    console.error(`[Wikidata] Error fetching ${qid}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

// ============================================================================
// Wikimedia Commons API Functions
// ============================================================================

/**
 * 从 Commons Category 获取图片列表（带过滤）
 */
async function fetchImagesFromCategory(category: string, limit: number = MAX_IMAGES_PER_PLACE): Promise<CommonsImage[]> {
  // Commons API: 获取分类中的文件（多获取一些，因为要过滤）
  const apiUrl = 'https://commons.wikimedia.org/w/api.php';
  const params = new URLSearchParams({
    action: 'query',
    list: 'categorymembers',
    cmtitle: `Category:${category}`,
    cmtype: 'file',
    cmlimit: String(limit * 3), // 获取3倍数量，过滤后取前N个
    format: 'json',
    origin: '*',
  });

  try {
    const response = await axios.get(`${apiUrl}?${params.toString()}`, {
      timeout: 10000,
      headers: {
        'User-Agent': 'WanderLog/1.0 (https://wanderlog.app)',
        Accept: 'application/json',
      },
    });

    const members = response.data?.query?.categorymembers || [];
    const images: CommonsImage[] = [];

    for (const member of members) {
      const title = member.title;
      if (!title || !title.startsWith('File:')) continue;

      // 只保留图片文件（排除 PDF、SVG 等）
      const ext = title.toLowerCase().split('.').pop();
      if (!['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext || '')) continue;

      const fileName = title.replace('File:', '');
      
      // 过滤掉非建筑外观的图片
      if (shouldExcludeImage(fileName)) {
        continue;
      }

      // 构建直接图片 URL
      const encodedName = encodeURIComponent(fileName.replace(/ /g, '_'));
      const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodedName}`;

      images.push({ title: fileName, url });
    }

    // 按优先级排序，优先选择建筑外观图片
    images.sort((a, b) => {
      const scoreA = getImagePriorityScore(a.title);
      const scoreB = getImagePriorityScore(b.title);
      return scoreB - scoreA; // 降序，高分在前
    });

    // 去重（忽略大小写和空格/下划线差异）
    const seen = new Set<string>();
    const uniqueImages = images.filter(img => {
      const normalized = normalizeFileName(img.title);
      if (seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    });

    // 返回前 N 张
    return uniqueImages.slice(0, limit);
  } catch (error) {
    console.error(`[Commons] Error fetching category "${category}":`, error instanceof Error ? error.message : error);
    return [];
  }
}


// ============================================================================
// Database Functions
// ============================================================================

/**
 * 获取需要处理的建筑列表
 */
async function getPlacesToProcess(limit?: number, skipExisting: boolean = false) {
  const where: any = {
    source: 'wikidata',
    sourceDetail: { not: null },
  };

  // 如果跳过已有多张图片的，只处理 images 为空或只有 1 张的
  if (skipExisting) {
    // 注意：Prisma 对 JSON 数组长度的查询有限制，这里用 raw query 更好
    // 简化处理：只查询 images 为 null 或空数组的
  }

  const places = await prisma.place.findMany({
    where,
    select: {
      id: true,
      name: true,
      sourceDetail: true,
      images: true,
      coverImage: true,
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
  });

  // 如果需要跳过已有多张图片的，在内存中过滤
  if (skipExisting) {
    return places.filter((p) => {
      const images = p.images as string[] | null;
      return !images || images.length <= 1;
    });
  }

  return places;
}

/**
 * 更新建筑的图片
 */
async function updatePlaceImages(
  placeId: string,
  images: string[],
  coverImage: string | null
): Promise<void> {
  await prisma.place.update({
    where: { id: placeId },
    data: {
      images,
      coverImage: coverImage || images[0] || null,
      updatedAt: new Date(),
    },
  });
}

// ============================================================================
// Main Processing Function
// ============================================================================

async function processPlace(
  place: { id: string; name: string; sourceDetail: string | null; images: any; coverImage: string | null },
  dryRun: boolean
): Promise<ProcessResult> {
  const qid = place.sourceDetail;
  const existingImages = (place.images as string[]) || [];

  if (!qid || !qid.startsWith('Q')) {
    return {
      placeId: place.id,
      name: place.name,
      wikidataQID: qid || 'N/A',
      commonsCategory: null,
      imagesFound: 0,
      imagesBefore: existingImages.length,
      imagesAfter: existingImages.length,
      status: 'error',
      error: 'Invalid QID',
    };
  }

  // Step 1: 获取 Commons Category
  const commonsCategory = await fetchCommonsCategory(qid);
  await delay(RATE_LIMIT_DELAY_MS);

  if (!commonsCategory) {
    return {
      placeId: place.id,
      name: place.name,
      wikidataQID: qid,
      commonsCategory: null,
      imagesFound: 0,
      imagesBefore: existingImages.length,
      imagesAfter: existingImages.length,
      status: 'no_category',
    };
  }

  // Step 2: 从 Commons 获取图片
  const commonsImages = await fetchImagesFromCategory(commonsCategory, MAX_IMAGES_PER_PLACE);
  await delay(RATE_LIMIT_DELAY_MS);

  if (commonsImages.length === 0) {
    return {
      placeId: place.id,
      name: place.name,
      wikidataQID: qid,
      commonsCategory,
      imagesFound: 0,
      imagesBefore: existingImages.length,
      imagesAfter: existingImages.length,
      status: 'no_images',
    };
  }

  // Step 3: 合并图片（保留现有图片，添加新图片，去重，限制数量）
  const newImageUrls = commonsImages.map((img) => img.url);
  const allImages = [...existingImages, ...newImageUrls];
  const uniqueImages = Array.from(new Set(allImages)).slice(0, MAX_IMAGES_PER_PLACE);

  // Step 4: 更新数据库
  if (!dryRun) {
    await updatePlaceImages(place.id, uniqueImages, place.coverImage || uniqueImages[0]);
  }

  return {
    placeId: place.id,
    name: place.name,
    wikidataQID: qid,
    commonsCategory,
    imagesFound: commonsImages.length,
    imagesBefore: existingImages.length,
    imagesAfter: uniqueImages.length,
    status: 'success',
  };
}


// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('Fetch Commons Images Script');
  console.log('从 Wikimedia Commons 获取更多建筑图片');
  console.log('='.repeat(60));

  const { limit, dryRun, skipExisting } = parseArgs();

  console.log('\n配置:');
  console.log(`  - 最大图片数: ${MAX_IMAGES_PER_PLACE}`);
  console.log(`  - 处理限制: ${limit || '全部'}`);
  console.log(`  - 模式: ${dryRun ? '预览 (dry-run)' : '实际写入'}`);
  console.log(`  - 跳过已有多图: ${skipExisting ? '是' : '否'}`);

  // 获取需要处理的建筑
  console.log('\n正在查询数据库...');
  const places = await getPlacesToProcess(limit, skipExisting);
  console.log(`找到 ${places.length} 个建筑需要处理`);

  if (places.length === 0) {
    console.log('没有需要处理的建筑，退出');
    await prisma.$disconnect();
    return;
  }

  // 处理每个建筑
  const results: ProcessResult[] = [];
  let successCount = 0;
  let noCategoryCount = 0;
  let noImagesCount = 0;
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
        console.log(`  ✅ 成功: 找到 ${result.imagesFound} 张图片, ${result.imagesBefore} → ${result.imagesAfter} 张`);
        break;
      case 'no_category':
        noCategoryCount++;
        console.log(`  ⚠️ 无 Commons 分类`);
        break;
      case 'no_images':
        noImagesCount++;
        console.log(`  ⚠️ 分类中无图片: ${result.commonsCategory}`);
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
  console.log(`  - 成功获取图片: ${successCount}`);
  console.log(`  - 无 Commons 分类: ${noCategoryCount}`);
  console.log(`  - 分类中无图片: ${noImagesCount}`);
  console.log(`  - 错误: ${errorCount}`);

  if (dryRun) {
    console.log('\n⚠️ 这是预览模式，数据库未被修改');
    console.log('移除 --dry-run 参数以实际写入数据库');
  }

  // 保存报告
  const reportPath = `reports/commons-images-report_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const fs = await import('fs');
  const reportDir = 'reports';
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        config: { maxImages: MAX_IMAGES_PER_PLACE, limit, dryRun, skipExisting },
        summary: {
          total: places.length,
          success: successCount,
          noCategory: noCategoryCount,
          noImages: noImagesCount,
          errors: errorCount,
        },
        results,
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
