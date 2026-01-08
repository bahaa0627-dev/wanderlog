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

async function diagnoseDetailed() {
  console.log('🔍 详细诊断普利兹克导入情况...\n');

  // 1. 读取源文件，看看应该有多少条
  const filePath = path.resolve(process.cwd(), '../Architecture from wikidata/Architecture list.json');
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const sourceData = JSON.parse(fileContent);
  
  console.log(`📁 源文件统计：`);
  console.log(`   总记录数: ${sourceData.length}`);
  
  // 统计每个建筑师的作品数
  const sourceByArchitect: Record<string, number> = {};
  sourceData.forEach((entry: any) => {
    const arch = entry.architectLabel;
    if (pritzkerArchitects.includes(arch)) {
      sourceByArchitect[arch] = (sourceByArchitect[arch] || 0) + 1;
    }
  });
  
  console.log(`   普利兹克建筑师作品数: ${Object.values(sourceByArchitect).reduce((a, b) => a + b, 0)}`);

  // 2. 检查数据库中有多少 wikidata 来源的地点
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

  console.log(`\n📊 数据库统计：`);
  console.log(`   Wikidata 来源地点总数: ${allWikidataPlaces.length}`);

  // 3. 检查有多少有 wikidataWorkURL
  const withWorkURL = allWikidataPlaces.filter(p => {
    const cf = p.customFields as any;
    return cf && cf.wikidataWorkURL;
  });
  console.log(`   有 wikidataWorkURL 的: ${withWorkURL.length}`);

  // 4. 检查有多少有 Pritzker 标签
  const withPritzkerTag = allWikidataPlaces.filter(p => {
    const tags = p.tags as any;
    return tags && tags.award && Array.isArray(tags.award) && tags.award.includes('Pritzker');
  });
  console.log(`   有 Pritzker 标签的: ${withPritzkerTag.length}`);

  // 5. 检查有多少有建筑师信息
  const withArchitect = allWikidataPlaces.filter(p => {
    const cf = p.customFields as any;
    return cf && cf.architect && pritzkerArchitects.includes(cf.architect);
  });
  console.log(`   有普利兹克建筑师信息的: ${withArchitect.length}`);

  // 6. 检查 sourceDetail 是否匹配源文件中的 QID
  const sourceQIDs = new Set<string>();
  sourceData.forEach((entry: any) => {
    const match = entry.work.match(/Q\d+$/);
    if (match) {
      sourceQIDs.add(match[0]);
    }
  });

  const dbQIDs = new Set<string>();
  allWikidataPlaces.forEach(p => {
    if (p.sourceDetail) {
      dbQIDs.add(p.sourceDetail);
    }
  });

  const matchingQIDs = Array.from(sourceQIDs).filter(qid => dbQIDs.has(qid));
  console.log(`\n🔗 QID 匹配情况：`);
  console.log(`   源文件中的唯一 QID: ${sourceQIDs.size}`);
  console.log(`   数据库中的 QID: ${dbQIDs.size}`);
  console.log(`   匹配的 QID: ${matchingQIDs.length}`);

  // 7. 检查匹配的记录的标签情况
  if (matchingQIDs.length > 0) {
    const matchingPlaces = allWikidataPlaces.filter(p => 
      p.sourceDetail && matchingQIDs.includes(p.sourceDetail)
    );

    const withCorrectTags = matchingPlaces.filter(p => {
      const tags = p.tags as any;
      return tags && tags.award && Array.isArray(tags.award) && tags.award.includes('Pritzker');
    });

    console.log(`\n📋 匹配记录的标签情况：`);
    console.log(`   匹配的记录数: ${matchingPlaces.length}`);
    console.log(`   有正确 Pritzker 标签的: ${withCorrectTags.length}`);
    console.log(`   缺少 Pritzker 标签的: ${matchingPlaces.length - withCorrectTags.length}`);

    // 显示几个缺少标签的例子
    const missingTags = matchingPlaces.filter(p => {
      const tags = p.tags as any;
      return !tags || !tags.award || !Array.isArray(tags.award) || !tags.award.includes('Pritzker');
    });

    if (missingTags.length > 0) {
      console.log(`\n❌ 缺少 Pritzker 标签的示例（前5个）：`);
      missingTags.slice(0, 5).forEach(p => {
        console.log(`\n  ${p.name} (${p.sourceDetail})`);
        console.log(`    Tags: ${JSON.stringify(p.tags)}`);
        console.log(`    CustomFields: ${JSON.stringify(p.customFields)}`);
      });
    }
  }

  console.log('\n✅ 诊断完成');
}

diagnoseDetailed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
