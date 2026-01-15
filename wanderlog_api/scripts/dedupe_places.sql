-- 查找重复的 places（基于 google_place_id 或 name + 坐标）
-- 首先查看有多少重复

-- 1. 查看基于 google_place_id 的重复
SELECT google_place_id, COUNT(*) as cnt, array_agg(id) as place_ids, array_agg(name) as names
FROM places 
WHERE google_place_id IS NOT NULL
GROUP BY google_place_id 
HAVING COUNT(*) > 1;

-- 2. 查看基于 name + 坐标的重复（约100米范围内）
SELECT name, ROUND(latitude::numeric, 3) as lat, ROUND(longitude::numeric, 3) as lng, 
       COUNT(*) as cnt, array_agg(id) as place_ids
FROM places 
GROUP BY name, ROUND(latitude::numeric, 3), ROUND(longitude::numeric, 3)
HAVING COUNT(*) > 1;

-- 3. 合并重复的 trip_spots（保留最早创建的 place）
-- 这个需要手动执行，先查看再决定

-- 对于每组重复的 places，我们需要：
-- a) 选择一个主 place（通常是最早创建的）
-- b) 将所有指向其他 place 的 trip_spots 更新为指向主 place
-- c) 删除重复的 places

-- 示例：合并基于 google_place_id 的重复
WITH duplicates AS (
  SELECT google_place_id, 
         MIN(id) as keep_id,
         array_agg(id) FILTER (WHERE id != (SELECT MIN(id) FROM places p2 WHERE p2.google_place_id = places.google_place_id)) as delete_ids
  FROM places 
  WHERE google_place_id IS NOT NULL
  GROUP BY google_place_id 
  HAVING COUNT(*) > 1
)
SELECT * FROM duplicates;

-- 执行合并（谨慎执行！）
-- UPDATE trip_spots ts
-- SET place_id = d.keep_id
-- FROM duplicates d
-- WHERE ts.place_id = ANY(d.delete_ids);

-- DELETE FROM places WHERE id IN (SELECT unnest(delete_ids) FROM duplicates);
