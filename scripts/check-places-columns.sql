-- 查看 places 表的所有字段
SELECT column_name, data_type
FROM information_schema.columns 
WHERE table_name = 'places'
ORDER BY ordinal_position;
