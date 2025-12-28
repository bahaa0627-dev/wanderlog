-- ============================================
-- Category & Tags Normalization - Schema Migration
-- 最小改动版本 - 可直接在 Supabase SQL Editor 执行
-- ============================================

-- Step 1: 添加新字段（如果不存在）
-- category_slug: 主分类机器键 (如 cafe, museum)
ALTER TABLE places ADD COLUMN IF NOT EXISTS category_slug TEXT;

-- category_en: 主分类英文展示名 (如 Cafe, Museum)
ALTER TABLE places ADD COLUMN IF NOT EXISTS category_en TEXT;

-- source_detail: 数据源详细标识 (OSM node ID, Wikidata QID 等)
ALTER TABLE places ADD COLUMN IF NOT EXISTS source_detail TEXT;

-- Step 2: 创建索引（如果不存在）
-- category_slug 索引，用于按分类筛选
CREATE INDEX IF NOT EXISTS idx_places_category_slug ON places (category_slug);

-- Step 3: 创建 (source, source_detail) 组合唯一约束
-- 使用 partial unique index，允许 NULL 值
-- 只有当 source 和 source_detail 都非空时才强制唯一
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_places_source_detail_unique'
    ) THEN
        CREATE UNIQUE INDEX idx_places_source_detail_unique 
        ON places (source, source_detail) 
        WHERE source IS NOT NULL AND source_detail IS NOT NULL;
    END IF;
END $$;

-- Step 4: 验证 google_place_id 唯一约束已存在
-- (Prisma schema 已定义，此处仅验证)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'places_google_place_id_key'
    ) THEN
        RAISE NOTICE 'Warning: google_place_id unique constraint not found. Creating...';
        CREATE UNIQUE INDEX places_google_place_id_key ON places (google_place_id);
    ELSE
        RAISE NOTICE 'google_place_id unique constraint exists.';
    END IF;
END $$;

-- Step 5: 验证变更
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'places' 
AND column_name IN ('category_slug', 'category_en', 'source_detail')
ORDER BY column_name;

-- 查看索引
SELECT 
    indexname, 
    indexdef 
FROM pg_indexes 
WHERE tablename = 'places' 
AND indexname IN (
    'idx_places_category_slug', 
    'idx_places_source_detail_unique',
    'places_google_place_id_key'
);

-- ============================================
-- 执行完成后，你应该看到：
-- 1. 3 个新字段: category_slug, category_en, source_detail
-- 2. 3 个索引: idx_places_category_slug, idx_places_source_detail_unique, places_google_place_id_key
-- ============================================
