-- 1. 查看重复的地点
SELECT name, city, COUNT(*) as count 
FROM places 
WHERE name = 'Österreichische Postsparkasse'
GROUP BY name, city;

-- 2. 删除重复的 trip_spots（保留最早创建的）
DELETE FROM trip_spots 
WHERE id NOT IN (
  SELECT MIN(id)::uuid 
  FROM trip_spots 
  GROUP BY trip_id, place_id
);

-- 3. 更新 trip_spots 指向正确的 place（有 google_place_id 的那个）
-- 先更新引用，再删除重复的 places

-- 4. 删除重复的 places（保留有完整数据的）
-- 这个需要手动在 Supabase 控制台执行
