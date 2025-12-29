import { aiFacetDictionaryService } from '../src/services/aiFacetDictionaryService';

async function main() {
  const allFacets = await aiFacetDictionaryService.getAllFacets();
  
  // 按 allowedCategories 分组
  const byCategory: Record<string, string[]> = {};
  
  for (const f of allFacets) {
    if (f.allowedCategories) {
      for (const cat of f.allowedCategories) {
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(`${f.id} (${f.priority})`);
      }
    } else {
      if (!byCategory['all']) byCategory['all'] = [];
      byCategory['all'].push(`${f.id} (${f.priority})`);
    }
  }
  
  console.log('各分类可用的 facets:');
  for (const [cat, facets] of Object.entries(byCategory).sort()) {
    console.log(`  ${cat}: ${facets.join(', ')}`);
  }
}
main();
