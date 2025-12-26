-- =====================================================
-- 修复 places 表的 INSERT 权限
-- 用于 AI 识别功能自动保存地点
-- 在 Supabase SQL Editor 中执行此脚本
-- =====================================================

-- 1. 授予 authenticated 用户对 places 表的 INSERT 权限
GRANT INSERT ON TABLE public.places TO authenticated;
GRANT UPDATE ON TABLE public.places TO authenticated;

-- 2. 添加 INSERT 策略 - 允许登录用户插入地点
DROP POLICY IF EXISTS "Authenticated users can insert places" ON public.places;
CREATE POLICY "Authenticated users can insert places" ON public.places
  FOR INSERT 
  TO authenticated
  WITH CHECK (true);

-- 3. 添加 UPDATE 策略 - 允许登录用户更新地点（用于补充信息）
DROP POLICY IF EXISTS "Authenticated users can update places" ON public.places;
CREATE POLICY "Authenticated users can update places" ON public.places
  FOR UPDATE 
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 4. 验证策略已创建
SELECT 
  policyname,
  cmd,
  roles
FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'places'
ORDER BY policyname;
