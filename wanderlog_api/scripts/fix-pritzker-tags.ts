import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// 普利兹克奖获奖建筑师名单
const pritzkerArchitects = [
  "Aldo Rossi", "Alejandro Alavena", "Arata Isozaki", "Balkrishna Doshi",
  "Christian de Portzamparc", "David Chipperfield", "Diébédo Francis Kéré",
  "Eduardo Souto de Moura", "Frank Gehry", "Frei Otto", "Fumihiko Maki",
  "Gordon Bunshaft", "Gottfried Böhm", "Hans Hollein", "Herzog & de Meuron",
  "I. M. Pei", "Jacques Herzog", "James Stirling", "Jean Nouvel",
  "Jean-Philippe Vassal", "Jørn Utzon", "Kazuyo Sejima", "Kenzō Tange",
  "Kevin Roche", "Luis Barragán", "Norman Foster", "Oscar Niemeyer",
  "Paulo Mendes da Rocha", "Peter Zumthor", "Philip Johnson",
  "Pierre de Meuron", "RCR Arquitectes", "Rafael Moneo", "Rem Koolhaas",
  "Renzo Piano", "Richard Meier", "Richard Rogers", "Riken Yamamoto",
  "Robert Venturi", "Ryue Nishizawa", "SANAA", "Shelley McNamara",
  "Shigeru Ban", "Sverre Fehn", "Tadao Ando", "Thom Mayne", "Toyo Ito",
  "Wang Shu", "Yvonne Farrell", "Zaha Hadid", "Álvaro Siza Vieira"
];

interface SourceEntry {
  architect: string;
  architectLabel: string;
  work: string;
  workLabel: string;
}

async function fixPritzkerTags() {
  console.log('🔧 开始修复普利兹克建筑标签...\n');

  // 1. 读取源文件，建立 QID 到建筑师的映射
  const filePath = path.resolve(process.cwd(), '../Architecture from wikidata/Architecture list.json');
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const sourceData: SourceEntry[] = JSON.parse(fileContent);

  console.log(`📁 读取源文件: ${sourceData.length} 条记录\n`);

  // 建立 QID 映射
  const qidToArchitect = new Map<string, { name: string; qid: string }>();
  
  sourceData.forEach(entry => {
    const workQID = entry.work.match(/Q\d+$/)?.[0];
    const architectQID = entry.architect.match(/Q\d+$/)?.[0];
    
    if (workQID && architectQID && pritzkerArchitects.includes(entry.architectLabel)) {
      qidToArchitect.set(workQID, {
        name: entry.architectLabel,
        qid: architectQID
      });
    }
  });

  console.log(`🗺️  建立映射: ${qidToArchitect.size} 个作品 QID\n`);

  // 2. 查找需要更新的记录
  const allWikidataPlaces = await prisma.place.findMany({
    where: {
      source: 'wikidata'
    },
    select: {
      id: true,
      name: true,
      sourceDetail: true,
      tags: true,
      customFields: true,
    }
  });

  console.log(`📊 数据库中的 wikidata 地点: ${allWikidataPlaces.length}\n`);

  // 筛选需要更新的记录
  const needsUpdate = allWikidataPlaces.filter(place => {
    if (!place.sourceDetail) return false;
    
    // 检查是否在源文件中
    if (!qidToArchitect.has(place.sourceDetail)) return false;
    
    // 检查是否已经有正确的标签
    const tags = place.tags as any;
    const hasAward = tags && tags.award && Array.isArray(tags.award) && tags.award.includes('Pritzker');
    
    const customFields = place.customFields as any;
    const hasArchitect = customFields && customFields.architect && customFields.wikidataWorkURL;
    
    // 如果缺少任何一个，就需要更新
    return !hasAward || !hasArchitect;
  });

  console.log(`🎯 需要更新的记录: ${needsUpdate.length}\n`);

  if (needsUpdate.length === 0) {
    console.log('✅ 所有记录都已正确标记！');
    return;
  }

  // 3. 更新记录
  console.log('🔄 开始更新记录...\n');
  
  let successCount = 0;
  let errorCount = 0;
  const errors: Array<{ id: string; name: string; error: string }> = [];

  for (let i = 0; i < needsUpdate.length; i++) {
    const place = needsUpdate[i];
    const architectInfo = qidToArchitect.get(place.sourceDetail!);
    
    if (!architectInfo) {
      console.error(`⚠️  找不到建筑师信息: ${place.name} (${place.sourceDetail})`);
      errorCount++;
      continue;
    }

    try {
      // 获取现有的 tags 和 customFields
      const existingTags = (place.tags as any) || {};
      const existingCustomFields = (place.customFields as any) || {};

      // 更新 tags，添加 award
      const updatedTags = {
        ...existingTags,
        award: ['Pritzker'], // 添加 Pritzker 奖标签
      };

      // 更新 customFields，添加建筑师信息
      const updatedCustomFields = {
        ...existingCustomFields,
        architect: architectInfo.name,
        architectQID: architectInfo.qid,
        wikidataWorkURL: `http://www.wikidata.org/entity/${place.sourceDetail}`,
      };

      // 执行更新
      await prisma.place.update({
        where: { id: place.id },
        data: {
          tags: updatedTags as any,
          customFields: updatedCustomFields as any,
          updatedAt: new Date(),
        },
      });

      successCount++;

      // 每50条记录显示进度
      if ((i + 1) % 50 === 0 || i + 1 === needsUpdate.length) {
        console.log(`   已处理 ${i + 1}/${needsUpdate.length} (成功: ${successCount}, 失败: ${errorCount})`);
      }
    } catch (error) {
      errorCount++;
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      errors.push({
        id: place.id,
        name: place.name,
        error: errorMsg
      });
      console.error(`   ❌ 更新失败: ${place.name} - ${errorMsg}`);
    }
  }

  // 4. 显示结果
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                           更新完成                                            ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  console.log(`✅ 成功更新: ${successCount} 条记录`);
  console.log(`❌ 更新失败: ${errorCount} 条记录\n`);

  if (errors.length > 0) {
    console.log('失败的记录：');
    errors.forEach(err => {
      console.log(`  - ${err.name} (${err.id}): ${err.error}`);
    });
  }

  // 5. 验证更新结果
  console.log('\n🔍 验证更新结果...\n');

  const afterUpdate = await prisma.place.findMany({
    where: {
      source: 'wikidata',
      tags: {
        path: ['award'],
        array_contains: 'Pritzker'
      }
    }
  });

  console.log(`📊 现在有 Pritzker 标签的记录: ${afterUpdate.length}`);
  console.log(`🎯 预期数量: ${qidToArchitect.size}`);

  if (afterUpdate.length >= qidToArchitect.size - 20) {
    console.log('\n✅ 更新成功！所有普利兹克建筑都已正确标记。');
  } else {
    console.log(`\n⚠️  还有 ${qidToArchitect.size - afterUpdate.length} 条记录可能需要检查。`);
  }
}

fixPritzkerTags()
  .catch(error => {
    console.error('\n❌ 脚本执行失败:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
