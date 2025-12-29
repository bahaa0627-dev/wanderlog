/**
 * 迁移所有渠道的 category 字段到新 schema
 * 
 * 对于缺少 categorySlug 的数据：
 * - 如果有 category 字段，根据映射转换
 * - 如果没有 category，默认设为 landmark
 */

import prisma from '../src/config/database';
import 'dotenv/config';

// Category 映射
const CATEGORY_MAP: Record<string, { slug: string; en: string; zh: string }> = {
  'museum': { slug: 'museum', en: 'Museum', zh: '博物馆' },
  'art_gallery': { slug: 'art_gallery', en: 'Gallery', zh: '美术馆' },
  'gallery': { slug: 'art_gallery', en: 'Gallery', zh: '美术馆' },
  'cafe': { slug: 'cafe', en: 'Cafe', zh: '咖啡店' },
  'coffee': { slug: 'cafe', en: 'Cafe', zh: '咖啡店' },
  'restaurant': { slug: 'restaurant', en: 'Restaurant', zh: '餐馆' },
  'bar': { slug: 'bar', en: 'Bar', zh: '酒吧' },
  'church': { slug: 'church', en: 'Church', zh: '教堂' },
  'park': { slug: 'park', en: 'Park', zh: '公园' },
  'garden': { slug: 'park', en: 'Park', zh: '公园' },
  'shopping_mall': { slug: 'shopping_mall', en: 'Shopping', zh: '商场' },
  'bakery': { slug: 'bakery', en: 'Bakery', zh: '面包店' },
  'library': { slug: 'library', en: 'Library', zh: '图书馆' },
  'bookstore': { slug: 'bookstore', en: 'Bookstore', zh: '书店' },
  'book_store': { slug: 'bookstore', en: 'Bookstore', zh: '书店' },
  'hotel': { slug: 'hotel', en: 'Hotel', zh: '酒店' },
  'lodging': { slug: 'hotel', en: 'Hotel', zh: '酒店' },
  'market': { slug: 'market', en: 'Market', zh: '市集' },
  'cemetery': { slug: 'cemetery', en: 'Cemetery', zh: '墓园' },
  'castle': { slug: 'castle', en: 'Castle', zh: '城堡' },
  'palace': { slug: 'castle', en: 'Castle', zh: '城堡' },
  'shop': { slug: 'shop', en: 'Shop', zh: '商店' },
  'store': { slug: 'shop', en: 'Shop', zh: '商店' },
  'tourist_attraction': { slug: 'landmark', en: 'Landmark', zh: '地标' },
  'landmark': { slug: 'landmark', en: 'Landmark', zh: '地标' },
  'point_of_interest': { slug: 'landmark', en: 'Landmark', zh: '地标' },
  'university': { slug: 'university', en: 'University', zh: '大学' },
  'temple': { slug: 'temple', en: 'Temple', zh: '寺庙' },
  'shrine': { slug: 'temple', en: 'Temple', zh: '寺庙' },
  'zoo': { slug: 'zoo', en: 'Zoo', zh: '动物园' },
  'aquarium': { slug: 'zoo', en: 'Zoo', zh: '动物园' },
};

// 默认分类
const DEFAULT_CATEGORY = { slug: 'landmark', en: 'Landmark', zh: '地标' };

function getCategoryInfo(oldCategory: string | null): { slug: string; en: string; zh: string } {
  if (!oldCategory) return DEFAULT_CATEGORY;
  const key = oldCategory.toLowerCase().trim();
  return CATEGORY_MAP[key] || DEFAULT_CATEGORY;
}

async function main() {
  console.log('🔍 查找所有缺少 categorySlug 的数据...');
  
  const places = await prisma.place.findMany({
    where: {
      OR: [
        { categorySlug: null },
        { categorySlug: '' }
      ]
    },
    select: {
      id: true,
      name: true,
      category: true,
      source: true,
    }
  });
  
  console.log(`📍 找到 ${places.length} 条需要迁移的数据\n`);
  
  if (places.length === 0) {
    console.log('✅ 没有需要迁移的数据');
    return;
  }
  
  let updated = 0;
  let errors = 0;
  
  for (const place of places) {
    try {
      const catInfo = getCategoryInfo(place.category);
      
      await prisma.place.update({
        where: { id: place.id },
        data: {
          categorySlug: catInfo.slug,
          categoryEn: catInfo.en,
          categoryZh: catInfo.zh,
        }
      });
      
      console.log(`✅ [${place.source}] ${place.name} -> ${catInfo.slug}`);
      updated++;
    } catch (error: any) {
      console.error(`❌ ${place.name}: ${error.message}`);
      errors++;
    }
  }
  
  console.log(`\n📊 完成: 更新 ${updated} 条, 失败 ${errors} 条`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
