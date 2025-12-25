-- =====================================================
-- 修复 Supabase 权限问题
-- 在 Supabase SQL Editor 中执行此脚本
-- =====================================================

-- 1. 授予 anon 和 authenticated 角色对 public schema 的使用权限
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

-- 2. 授予对所有现有表的 SELECT 权限
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;

-- 3. 授予对未来表的默认权限
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO authenticated;

-- 4. 对特定表授予额外权限（如果需要写入）
-- places 表 - 只读
GRANT SELECT ON TABLE public.places TO anon;
GRANT SELECT ON TABLE public.places TO authenticated;

-- collections 表 - 只读
GRANT SELECT ON TABLE public.collections TO anon;
GRANT SELECT ON TABLE public.collections TO authenticated;

-- collection_spots 表 - 只读
GRANT SELECT ON TABLE public.collection_spots TO anon;
GRANT SELECT ON TABLE public.collection_spots TO authenticated;

-- collection_recommendations 表 - 只读
GRANT SELECT ON TABLE public.collection_recommendations TO anon;
GRANT SELECT ON TABLE public.collection_recommendations TO authenticated;

-- collection_recommendation_items 表 - 只读
GRANT SELECT ON TABLE public.collection_recommendation_items TO anon;
GRANT SELECT ON TABLE public.collection_recommendation_items TO authenticated;

-- user_collection_favorites 表 - 登录用户可读写
GRANT SELECT, INSERT, DELETE ON TABLE public.user_collection_favorites TO authenticated;

-- 5. 启用 RLS（如果尚未启用）
ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_spots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_recommendation_items ENABLE ROW LEVEL SECURITY;

-- 6. 删除旧策略并创建新策略
-- Places: 所有人可读
DROP POLICY IF EXISTS "Places are viewable by everyone" ON public.places;
CREATE POLICY "Places are viewable by everyone" ON public.places
  FOR SELECT USING (true);

-- Collections: 已发布的合集所有人可读
DROP POLICY IF EXISTS "Published collections are viewable" ON public.collections;
CREATE POLICY "Published collections are viewable" ON public.collections
  FOR SELECT USING (is_published = true);

-- 也允许查看所有合集（用于管理后台）
DROP POLICY IF EXISTS "All collections viewable for admin" ON public.collections;
CREATE POLICY "All collections viewable for admin" ON public.collections
  FOR SELECT USING (true);

-- Collection Spots: 所有人可读
DROP POLICY IF EXISTS "Collection spots are viewable by everyone" ON public.collection_spots;
CREATE POLICY "Collection spots are viewable by everyone" ON public.collection_spots
  FOR SELECT USING (true);

-- Collection Recommendations: 所有人可读
DROP POLICY IF EXISTS "Recommendations are viewable by everyone" ON public.collection_recommendations;
CREATE POLICY "Recommendations are viewable by everyone" ON public.collection_recommendations
  FOR SELECT USING (true);

-- Collection Recommendation Items: 所有人可读
DROP POLICY IF EXISTS "Recommendation items are viewable by everyone" ON public.collection_recommendation_items;
CREATE POLICY "Recommendation items are viewable by everyone" ON public.collection_recommendation_items
  FOR SELECT USING (true);

-- User Collection Favorites: 用户只能操作自己的收藏
DROP POLICY IF EXISTS "Users can manage own collection favorites" ON public.user_collection_favorites;
CREATE POLICY "Users can manage own collection favorites" ON public.user_collection_favorites
  FOR ALL USING (auth.uid() = user_id);

-- 7. 验证权限设置
SELECT 
  schemaname,
  tablename,
  tableowner,
  rowsecurity
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- 8. 验证 RLS 策略
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
