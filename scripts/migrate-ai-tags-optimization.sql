-- ============================================
-- AI Tags Optimization - Schema Migration
-- 可直接在 Supabase SQL Editor 执行
-- ============================================

-- ============================================
-- Part 1: 创建 ai_facet_dictionary 字典表
-- Requirements: 3.1, 3.3
-- ============================================

-- 创建 ai_facet_dictionary 表
CREATE TABLE IF NOT EXISTS ai_facet_dictionary (
  id TEXT PRIMARY KEY,                    -- e.g. 'Brutalist'
  en TEXT NOT NULL,                       -- e.g. 'Brutalist'
  zh TEXT NOT NULL,                       -- e.g. '粗野主义'
  priority INT NOT NULL DEFAULT 50,       -- 优先级，数字越大优先级越高
  allowed_categories TEXT[] NULL,         -- e.g. ['restaurant', 'cafe']
  derive_from JSONB NULL,                 -- e.g. {"source": "tags:style:Brutalist*"}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_ai_facet_dictionary_priority ON ai_facet_dictionary (priority DESC);

-- 验证表创建
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'ai_facet_dictionary'
ORDER BY ordinal_position;

-- ============================================
-- Part 2: 更新 places 表 Schema
-- Requirements: 2.3, 2.4, 9.1
-- ============================================

-- 添加 i18n jsonb 字段（可选，用于多语言文本）
ALTER TABLE places ADD COLUMN IF NOT EXISTS i18n JSONB;

-- 创建 tags 字段的 GIN 索引（用于高效的 jsonb 查询）
CREATE INDEX IF NOT EXISTS idx_places_tags_gin ON places USING gin (tags);

-- 添加 CHECK 约束限制 ai_tags 最多 2 个元素
-- 注意：需要先检查约束是否存在
DO $
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'places_ai_tags_len_chk'
    ) THEN
        ALTER TABLE places
        ADD CONSTRAINT places_ai_tags_len_chk
        CHECK (ai_tags IS NULL OR jsonb_array_length(ai_tags) <= 2);
    END IF;
END $;

-- ============================================
-- Part 3: 创建 normalize_ai_tags 触发器
-- Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
-- ============================================

-- 创建触发器函数
CREATE OR REPLACE FUNCTION normalize_ai_tags()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $
DECLARE
  cleaned jsonb[];
  t jsonb;
  k text;
  en text;
  seen_keys text[];
BEGIN
  -- 如果 ai_tags 为 NULL，直接返回
  IF NEW.ai_tags IS NULL THEN
    RETURN NEW;
  END IF;

  -- 初始化
  cleaned := array[]::jsonb[];
  seen_keys := array[]::text[];

  -- 遍历 ai_tags 数组中的每个元素
  -- 注意：ai_tags 存储为 jsonb 数组，需要用 jsonb_array_elements 遍历
  FOR t IN SELECT * FROM jsonb_array_elements(NEW.ai_tags)
  LOOP
    -- 只接受对象类型
    IF jsonb_typeof(t) <> 'object' THEN
      CONTINUE;
    END IF;

    k := COALESCE(t->>'kind', '');
    en := COALESCE(t->>'en', '');

    -- 必填字段校验：kind, id, en, zh 都必须存在且非空
    IF k = '' OR COALESCE(t->>'id', '') = '' OR en = '' OR COALESCE(t->>'zh', '') = '' THEN
      CONTINUE;
    END IF;

    -- kind 枚举校验：只允许 facet, person, architect
    IF k NOT IN ('facet', 'person', 'architect') THEN
      CONTINUE;
    END IF;

    -- 不允许跟 category_en 重复（大小写不敏感）
    IF NEW.category_en IS NOT NULL AND LOWER(en) = LOWER(NEW.category_en) THEN
      CONTINUE;
    END IF;

    -- 去重（按 kind+id 组合）
    IF (k || ':' || (t->>'id')) = ANY(seen_keys) THEN
      CONTINUE;
    END IF;
    
    -- 添加到已见集合
    seen_keys := array_append(seen_keys, k || ':' || (t->>'id'));
    
    -- 添加到清洗后的数组
    cleaned := array_append(cleaned, t);
  END LOOP;

  -- 截断到最多 2 个元素
  IF array_length(cleaned, 1) > 2 THEN
    cleaned := cleaned[1:2];
  END IF;

  -- 将清洗后的数组转换回 jsonb
  IF array_length(cleaned, 1) IS NULL OR array_length(cleaned, 1) = 0 THEN
    NEW.ai_tags := '[]'::jsonb;
  ELSE
    NEW.ai_tags := to_jsonb(cleaned);
  END IF;
  
  RETURN NEW;
END;
$;

-- 删除旧触发器（如果存在）
DROP TRIGGER IF EXISTS trg_normalize_ai_tags ON places;

-- 创建新触发器
CREATE TRIGGER trg_normalize_ai_tags
BEFORE INSERT OR UPDATE OF ai_tags, category_en
ON places
FOR EACH ROW
EXECUTE FUNCTION normalize_ai_tags();

-- ============================================
-- Part 4: 验证变更
-- ============================================

-- 验证 places 表新字段和约束
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'places' 
AND column_name IN ('i18n', 'tags', 'ai_tags')
ORDER BY column_name;

-- 验证索引
SELECT 
    indexname, 
    indexdef 
FROM pg_indexes 
WHERE tablename = 'places' 
AND indexname LIKE '%tags%';

-- 验证约束
SELECT 
    conname, 
    pg_get_constraintdef(oid) as constraint_def
FROM pg_constraint 
WHERE conrelid = 'places'::regclass
AND conname LIKE '%ai_tags%';

-- 验证触发器
SELECT 
    trigger_name, 
    event_manipulation, 
    action_timing
FROM information_schema.triggers 
WHERE event_object_table = 'places'
AND trigger_name = 'trg_normalize_ai_tags';

-- ============================================
-- 执行完成后，你应该看到：
-- 1. ai_facet_dictionary 表已创建
-- 2. places 表新增 i18n 字段
-- 3. places 表 tags 字段有 GIN 索引
-- 4. places 表 ai_tags 有长度约束
-- 5. normalize_ai_tags 触发器已创建
-- ============================================
