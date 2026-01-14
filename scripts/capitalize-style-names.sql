-- ============================================
-- 风格名称首字母大写
-- 在 Supabase SQL Editor 中执行
-- ============================================

-- 先查看当前小写开头的风格
SELECT style_value, COUNT(*) as count
FROM places, 
     jsonb_array_elements_text(tags->'style') AS style_value
WHERE style_value ~ '^[a-z]'
GROUP BY style_value
ORDER BY count DESC;

-- ============================================
-- 执行更新：首字母大写
-- ============================================

UPDATE places
SET tags = jsonb_set(
    tags,
    '{style}',
    (
        SELECT jsonb_agg(INITCAP(style_value))
        FROM jsonb_array_elements_text(tags->'style') AS style_value
    )
)
WHERE tags->'style' IS NOT NULL;

-- ============================================
-- 验证更新结果
-- ============================================

SELECT style_value, COUNT(*) as count
FROM places, 
     jsonb_array_elements_text(tags->'style') AS style_value
WHERE style_value IS NOT NULL
GROUP BY style_value
ORDER BY count DESC
LIMIT 50;
