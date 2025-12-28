-- 添加 category_zh 字段
ALTER TABLE places ADD COLUMN IF NOT EXISTS category_zh TEXT;

-- 验证
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'places' AND column_name = 'category_zh';
