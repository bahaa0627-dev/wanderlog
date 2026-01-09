import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function analyze() {
  console.log('🔍 分析 Apify 数据来源...\n');

  // 获取所有 apify 数据的创建时间分布
  const allApify: any[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data } = await supabase
      .from('places')
      .select('id, name, created_at, source_detail, custom_fields')
      .eq('source', 'apify_google_places')
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (!data || data.length === 0) break;
    allApify.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  console.log(`📊 Apify 总数据: ${allApify.length} 条\n`);

  // 按日期分组
  const dateStats: Record<string, number> = {};
  for (const p of allApify) {
    const date = p.created_at?.substring(0, 10) || 'unknown';
    dateStats[date] = (dateStats[date] || 0) + 1;
  }

  console.log('📅 按创建日期分布:');
  for (const [date, count] of Object.entries(dateStats).sort()) {
    console.log(`   ${date}: ${count} 条`);
  }

  // 检查 custom_fields 看看有没有来源信息
  console.log('\n📋 检查 custom_fields 中的来源信息:');
  const sourceTypes: Record<string, number> = {};
  
  for (const p of allApify) {
    const cf = p.custom_fields;
    let sourceType = 'no_custom_fields';
    
    if (cf) {
      if (cf.sourceFile) {
        sourceType = `sourceFile: ${cf.sourceFile}`;
      } else if (cf.dataType) {
        sourceType = `dataType: ${cf.dataType}`;
      } else if (cf.importBatch) {
        sourceType = `importBatch: ${cf.importBatch}`;
      } else {
        sourceType = 'has_custom_fields_but_no_source';
      }
    }
    
    sourceTypes[sourceType] = (sourceTypes[sourceType] || 0) + 1;
  }

  for (const [type, count] of Object.entries(sourceTypes).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${type}: ${count}`);
  }

  // 检查 source_detail
  console.log('\n📋 检查 source_detail:');
  const withSourceDetail = allApify.filter(p => p.source_detail).length;
  const withoutSourceDetail = allApify.filter(p => !p.source_detail).length;
  console.log(`   有 source_detail: ${withSourceDetail}`);
  console.log(`   无 source_detail: ${withoutSourceDetail}`);

  // 显示一些没有 source_detail 的样本
  console.log('\n📋 无 source_detail 的 Apify 数据样本:');
  const noSourceDetailSamples = allApify.filter(p => !p.source_detail).slice(0, 10);
  for (const s of noSourceDetailSamples) {
    console.log(`   ${s.name} | created: ${s.created_at?.substring(0, 10)} | custom_fields: ${JSON.stringify(s.custom_fields)?.substring(0, 50)}...`);
  }
}

analyze();
