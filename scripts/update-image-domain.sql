-- ============================================
-- 替换图片 URL 域名
-- wanderlog-images.blcubahaa0627.workers.dev → vago.to
-- 在 Supabase SQL Editor 中执行
-- ============================================

-- 先查看有多少条记录需要更新 (cover_image)
SELECT COUNT(*) as cover_image_count
FROM places
WHERE cover_image LIKE '%wanderlog-images.blcubahaa0627.workers.dev%';

-- 查看 images 数组中有多少需要更新
SELECT COUNT(*) as images_count
FROM places
WHERE images::text LIKE '%wanderlog-images.blcubahaa0627.workers.dev%';

-- ============================================
-- 更新 cover_image 字段
-- ============================================

UPDATE places
SET cover_image = REPLACE(
    cover_image,
    'wanderlog-images.blcubahaa0627.workers.dev',
    'vago.to'
)
WHERE cover_image LIKE '%wanderlog-images.blcubahaa0627.workers.dev%';

-- ============================================
-- 更新 images jsonb 数组
-- ============================================

UPDATE places
SET images = (
    SELECT jsonb_agg(
        REPLACE(img::text, 'wanderlog-images.blcubahaa0627.workers.dev', 'vago.to')::jsonb
    )
    FROM jsonb_array_elements(images) AS img
)
WHERE images IS NOT NULL
  AND images::text LIKE '%wanderlog-images.blcubahaa0627.workers.dev%';

-- ============================================
-- 验证更新结果
-- ============================================

SELECT COUNT(*) as remaining_cover
FROM places
WHERE cover_image LIKE '%wanderlog-images.blcubahaa0627.workers.dev%';

SELECT COUNT(*) as remaining_images
FROM places
WHERE images::text LIKE '%wanderlog-images.blcubahaa0627.workers.dev%';
