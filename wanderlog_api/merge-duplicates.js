const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================
// 配置
// ============================================
const DRY_RUN = process.argv.includes('--dry-run');  // 默认 dry-run 模式
const DISTANCE_THRESHOLD = 100; // 100米以内算同一地点

// 渠道优先级（数字越小优先级越高）
const SOURCE_PRIORITY = {
  'google_maps_link': 1,
  'google_maps': 2,
  'apify_google_places': 3,
  'mocation': 4,
  'wikidata': 5,
  'ai_search_web': 6,
  'ai_search': 7,
  'mock_data': 8,
  'user_import': 9,
};

function getSourcePriority(source) {
  return SOURCE_PRIORITY[source] || 99;
}

// 计算两点之间的距离（米）
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeName(name) {
  return (name || '').toLowerCase().trim().replace(/[''`]/g, "'").replace(/\s+/g, ' ');
}

// ============================================
// 合并逻辑（字段并集 + 渠道优先级）
// ============================================
function mergePlaces(places) {
  // 按渠道优先级排序
  const sorted = [...places].sort((a, b) => 
    getSourcePriority(a.source) - getSourcePriority(b.source)
  );
  
  // 主记录（优先级最高的）
  const primary = sorted[0];
  const merged = { ...primary };
  
  // ====== 1. 图片集：合并所有来源的图片（非常重要！） ======
  const allImages = new Set();
  for (const p of places) {
    if (p.images && Array.isArray(p.images)) {
      for (const img of p.images) {
        if (img && typeof img === 'string' && img.trim()) {
          allImages.add(img.trim());
        }
      }
    }
    // 有些图片可能存在 cover_image 但不在 images 里
    if (p.cover_image && typeof p.cover_image === 'string' && p.cover_image.trim()) {
      allImages.add(p.cover_image.trim());
    }
  }
  merged.images = Array.from(allImages);
  
  // ====== 2. 评分：取最高的 ======
  let bestRating = null;
  let bestRatingCount = null;
  for (const p of places) {
    if (p.rating !== null && p.rating !== undefined) {
      if (bestRating === null || p.rating > bestRating) {
        bestRating = p.rating;
        bestRatingCount = p.rating_count;
      } else if (p.rating === bestRating && (p.rating_count || 0) > (bestRatingCount || 0)) {
        bestRatingCount = p.rating_count;
      }
    }
  }
  if (bestRating !== null) {
    merged.rating = bestRating;
    merged.rating_count = bestRatingCount;
  }
  
  // ====== 3. 封面图：优先取有的 ======
  if (!merged.cover_image) {
    for (const p of places) {
      if (p.cover_image) {
        merged.cover_image = p.cover_image;
        break;
      }
    }
  }
  
  // ====== 4. 其他重要字段：按优先级取，但要补全 ======
  const fieldsToMerge = [
    'description',
    'address',
    'website',
    'phone_number',
    'opening_hours',
    'google_place_id',
    'category',
    'category_slug',
    'category_en',
    'category_zh',
    'tags',
    'ai_tags',
    'ai_summary',
    'ai_description',
    'price_level',
  ];
  
  for (const field of fieldsToMerge) {
    // 如果主记录没有这个字段，从其他记录补全
    if (!merged[field] || (Array.isArray(merged[field]) && merged[field].length === 0)) {
      for (const p of sorted) {
        if (p[field] && (!Array.isArray(p[field]) || p[field].length > 0)) {
          merged[field] = p[field];
          break;
        }
      }
    }
  }
  
  // ====== 5. 标签合并（并集） ======
  if (places.some(p => p.tags && Array.isArray(p.tags) && p.tags.length > 0)) {
    const allTags = new Set();
    for (const p of places) {
      if (p.tags && Array.isArray(p.tags)) {
        for (const tag of p.tags) {
          if (tag) allTags.add(typeof tag === 'string' ? tag : JSON.stringify(tag));
        }
      }
    }
    merged.tags = Array.from(allTags).map(t => {
      try { return JSON.parse(t); } catch { return t; }
    });
  }
  
  // ====== 6. AI 标签合并（并集） ======
  if (places.some(p => p.ai_tags && Array.isArray(p.ai_tags) && p.ai_tags.length > 0)) {
    const allAiTags = new Set();
    for (const p of places) {
      if (p.ai_tags && Array.isArray(p.ai_tags)) {
        for (const tag of p.ai_tags) {
          if (tag) allAiTags.add(typeof tag === 'string' ? tag : JSON.stringify(tag));
        }
      }
    }
    merged.ai_tags = Array.from(allAiTags).map(t => {
      try { return JSON.parse(t); } catch { return t; }
    });
  }
  
  return {
    primaryId: primary.id,
    primarySource: primary.source,
    merged,
    toDelete: sorted.slice(1).map(p => ({ id: p.id, source: p.source })),
  };
}

// ============================================
// 主函数
// ============================================
async function mergeDuplicates() {
  console.log('🔄 开始合并重复地点...');
  console.log(`📋 模式: ${DRY_RUN ? '预览模式 (--dry-run)' : '⚠️  执行模式'}`);
  console.log(`📏 距离阈值: ${DISTANCE_THRESHOLD}米\n`);
  
  // 获取所有地点
  let allPlaces = [];
  let offset = 0;
  const limit = 1000;
  
  while (true) {
    const { data: batch, error } = await supabase
      .from('places')
      .select('*')
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: true });
      
    if (error) {
      console.error('❌ 获取数据失败:', error);
      return;
    }
    
    if (!batch || batch.length === 0) break;
    allPlaces = allPlaces.concat(batch);
    offset += limit;
    if (batch.length < limit) break;
  }
  
  console.log(`📊 总地点数: ${allPlaces.length}`);
  
  // 按名称+城市+国家分组
  const groupMap = new Map();
  for (const place of allPlaces) {
    const key = normalizeName(place.name) + '|' + 
                (place.city || '').toLowerCase().trim() + '|' + 
                (place.country || '').toLowerCase().trim();
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key).push(place);
  }
  
  // 找出真正的重复（经纬度校验）
  const duplicateGroups = [];
  
  for (const [key, places] of groupMap.entries()) {
    if (places.length < 2) continue;
    
    const assigned = new Set();
    
    for (let i = 0; i < places.length; i++) {
      if (assigned.has(i)) continue;
      
      const group = [places[i]];
      assigned.add(i);
      
      for (let j = i + 1; j < places.length; j++) {
        if (assigned.has(j)) continue;
        
        const p1 = places[i], p2 = places[j];
        
        if (!p1.latitude || !p2.latitude) continue;
        
        const distance = calculateDistance(
          p1.latitude, p1.longitude,
          p2.latitude, p2.longitude
        );
        
        if (distance <= DISTANCE_THRESHOLD) {
          group.push(p2);
          assigned.add(j);
        }
      }
      
      if (group.length > 1) {
        duplicateGroups.push({ key, places: group });
      }
    }
  }
  
  console.log(`⚠️  发现 ${duplicateGroups.length} 组重复地点\n`);
  
  if (duplicateGroups.length === 0) {
    console.log('✅ 没有需要合并的重复地点');
    return;
  }
  
  // 处理每组重复
  let successCount = 0;
  let errorCount = 0;
  let imagesPreserved = 0;
  let fieldsEnriched = 0;
  
  for (let i = 0; i < duplicateGroups.length; i++) {
    const group = duplicateGroups[i];
    const [name, city, country] = group.key.split('|');
    
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`[${i + 1}/${duplicateGroups.length}] ${name} (${city}, ${country})`);
    console.log(`${'─'.repeat(60)}`);
    
    // 合并
    const result = mergePlaces(group.places);
    
    // 统计
    const originalImagesCount = group.places.reduce((sum, p) => 
      sum + (p.images && Array.isArray(p.images) ? p.images.length : 0), 0
    );
    const mergedImagesCount = result.merged.images ? result.merged.images.length : 0;
    
    console.log(`  主记录: ${result.primaryId.substring(0, 8)}... (来源: ${result.primarySource})`);
    console.log(`  删除: ${result.toDelete.map(d => d.id.substring(0, 8) + '...' + '(' + d.source + ')').join(', ')}`);
    console.log(`  图片: ${originalImagesCount}张 → 合并后 ${mergedImagesCount}张`);
    
    // 显示字段补全情况
    const enriched = [];
    const primary = group.places.find(p => p.id === result.primaryId);
    if (!primary.rating && result.merged.rating) enriched.push('评分');
    if (!primary.description && result.merged.description) enriched.push('描述');
    if (!primary.cover_image && result.merged.cover_image) enriched.push('封面图');
    if (!primary.address && result.merged.address) enriched.push('地址');
    if (!primary.website && result.merged.website) enriched.push('网站');
    if (!primary.phone_number && result.merged.phone_number) enriched.push('电话');
    if (!primary.opening_hours && result.merged.opening_hours) enriched.push('营业时间');
    if (!primary.google_place_id && result.merged.google_place_id) enriched.push('Google Place ID');
    if ((!primary.images || primary.images.length === 0) && mergedImagesCount > 0) enriched.push('图片集');
    
    if (enriched.length > 0) {
      console.log(`  补全字段: ${enriched.join(', ')}`);
      fieldsEnriched += enriched.length;
    }
    
    if (mergedImagesCount > 0) {
      imagesPreserved += mergedImagesCount;
    }
    
    if (!DRY_RUN) {
      try {
        // 1. 更新主记录
        const updateData = {
          rating: result.merged.rating,
          rating_count: result.merged.rating_count,
          cover_image: result.merged.cover_image,
          description: result.merged.description,
          address: result.merged.address,
          website: result.merged.website,
          phone_number: result.merged.phone_number,
          opening_hours: result.merged.opening_hours,
          google_place_id: result.merged.google_place_id,
          images: result.merged.images,
          tags: result.merged.tags,
          ai_tags: result.merged.ai_tags,
          ai_summary: result.merged.ai_summary,
          ai_description: result.merged.ai_description,
          category: result.merged.category,
          category_slug: result.merged.category_slug,
          category_en: result.merged.category_en,
          category_zh: result.merged.category_zh,
          price_level: result.merged.price_level,
          updated_at: new Date().toISOString(),
        };
        
        const { error: updateError } = await supabase
          .from('places')
          .update(updateData)
          .eq('id', result.primaryId);
          
        if (updateError) {
          console.error(`  ❌ 更新失败:`, updateError.message);
          errorCount++;
          continue;
        }
        
        // 2. 删除重复记录
        for (const toDelete of result.toDelete) {
          const { error: deleteError } = await supabase
            .from('places')
            .delete()
            .eq('id', toDelete.id);
            
          if (deleteError) {
            console.error(`  ❌ 删除 ${toDelete.id} 失败:`, deleteError.message);
          }
        }
        
        console.log(`  ✅ 合并成功`);
        successCount++;
        
      } catch (err) {
        console.error(`  ❌ 处理失败:`, err.message);
        errorCount++;
      }
    } else {
      console.log(`  📋 [预览] 将合并到 ${result.primaryId.substring(0, 8)}...`);
      successCount++;
    }
  }
  
  // 汇总
  console.log('\n' + '='.repeat(60));
  console.log('📊 合并汇总');
  console.log('='.repeat(60));
  console.log(`处理重复组: ${duplicateGroups.length}`);
  console.log(`成功: ${successCount}`);
  console.log(`失败: ${errorCount}`);
  console.log(`删除记录数: ${duplicateGroups.reduce((sum, g) => sum + g.places.length - 1, 0)}`);
  console.log(`保留图片总数: ${imagesPreserved}`);
  console.log(`补全字段数: ${fieldsEnriched}`);
  
  if (DRY_RUN) {
    console.log('\n⚠️  这是预览模式，没有实际执行任何操作');
    console.log('👉 运行 `node merge-duplicates.js` 来执行合并');
  } else {
    console.log('\n✅ 合并完成！');
  }
}

mergeDuplicates().catch(console.error);
