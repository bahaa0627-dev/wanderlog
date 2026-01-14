-- ============================================
-- 更新建筑风格名称 - 去掉 "architecture" 后缀
-- 在 Supabase SQL Editor 中执行
-- ============================================

-- 首先查看当前有哪些包含 "architecture" 的风格标签
SELECT DISTINCT style_value
FROM places, 
     jsonb_array_elements_text(tags->'style') AS style_value
WHERE LOWER(style_value) LIKE '%architecture%'
ORDER BY style_value;

-- ============================================
-- 执行更新：去掉 " architecture" 后缀
-- ============================================

UPDATE places
SET tags = jsonb_set(
    tags,
    '{style}',
    (
        SELECT jsonb_agg(
            CASE 
                -- 去掉 " architecture" 后缀（不区分大小写）
                WHEN LOWER(style_value) LIKE '% architecture' 
                THEN TRIM(REGEXP_REPLACE(style_value, '\s+[Aa]rchitecture$', ''))
                -- 去掉 " Architecture" 后缀
                WHEN style_value LIKE '% Architecture'
                THEN TRIM(REPLACE(style_value, ' Architecture', ''))
                ELSE style_value
            END
        )
        FROM jsonb_array_elements_text(tags->'style') AS style_value
    )
)
WHERE tags->'style' IS NOT NULL
  AND EXISTS (
      SELECT 1 
      FROM jsonb_array_elements_text(tags->'style') AS s
      WHERE LOWER(s) LIKE '%architecture%'
        AND LOWER(s) != 'architecture'  -- 保留单独的 "Architecture" 标签
  );

-- ============================================
-- 验证更新结果
-- ============================================

-- 查看更新后的风格标签
SELECT style_value, COUNT(*) as count
FROM places, 
     jsonb_array_elements_text(tags->'style') AS style_value
WHERE style_value IS NOT NULL
GROUP BY style_value
ORDER BY count DESC
LIMIT 50;

-- 确认没有剩余的 "xxx architecture" 格式
SELECT DISTINCT style_value
FROM places, 
     jsonb_array_elements_text(tags->'style') AS style_value
WHERE LOWER(style_value) LIKE '% architecture'
ORDER BY style_value;
