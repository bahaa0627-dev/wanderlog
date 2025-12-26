-- =====================================================
-- 创建 user_quotas 表 - AI 搜索配额追踪
-- 在 Supabase SQL Editor 中执行此脚本
-- =====================================================

-- 1. 创建 user_quotas 表
CREATE TABLE IF NOT EXISTS public.user_quotas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quota_date DATE NOT NULL DEFAULT CURRENT_DATE,
  deep_search_count INTEGER NOT NULL DEFAULT 0,
  detail_view_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- 每个用户每天只有一条记录
  UNIQUE(user_id, quota_date)
);

-- 2. 创建索引以加速查询
CREATE INDEX IF NOT EXISTS idx_user_quotas_user_date 
  ON public.user_quotas(user_id, quota_date);

CREATE INDEX IF NOT EXISTS idx_user_quotas_date 
  ON public.user_quotas(quota_date);

-- 3. 创建更新 updated_at 的触发器函数
CREATE OR REPLACE FUNCTION update_user_quotas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. 创建触发器
DROP TRIGGER IF EXISTS trigger_user_quotas_updated_at ON public.user_quotas;
CREATE TRIGGER trigger_user_quotas_updated_at
  BEFORE UPDATE ON public.user_quotas
  FOR EACH ROW
  EXECUTE FUNCTION update_user_quotas_updated_at();

-- 5. 启用 RLS
ALTER TABLE public.user_quotas ENABLE ROW LEVEL SECURITY;

-- 6. 创建 RLS 策略 - 用户只能查看和修改自己的配额
DROP POLICY IF EXISTS "Users can view own quotas" ON public.user_quotas;
CREATE POLICY "Users can view own quotas" ON public.user_quotas
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own quotas" ON public.user_quotas;
CREATE POLICY "Users can insert own quotas" ON public.user_quotas
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own quotas" ON public.user_quotas;
CREATE POLICY "Users can update own quotas" ON public.user_quotas
  FOR UPDATE USING (auth.uid() = user_id);

-- 7. 授予权限
GRANT SELECT, INSERT, UPDATE ON TABLE public.user_quotas TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;

-- 8. 创建获取或创建今日配额的函数
CREATE OR REPLACE FUNCTION get_or_create_today_quota(p_user_id UUID)
RETURNS public.user_quotas AS $$
DECLARE
  v_quota public.user_quotas;
BEGIN
  -- 尝试获取今日配额
  SELECT * INTO v_quota
  FROM public.user_quotas
  WHERE user_id = p_user_id AND quota_date = CURRENT_DATE;
  
  -- 如果不存在，创建新记录
  IF NOT FOUND THEN
    INSERT INTO public.user_quotas (user_id, quota_date, deep_search_count, detail_view_count)
    VALUES (p_user_id, CURRENT_DATE, 0, 0)
    RETURNING * INTO v_quota;
  END IF;
  
  RETURN v_quota;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. 创建消耗深度搜索配额的函数
CREATE OR REPLACE FUNCTION consume_deep_search_quota(p_user_id UUID)
RETURNS public.user_quotas AS $$
DECLARE
  v_quota public.user_quotas;
BEGIN
  -- 获取或创建今日配额
  SELECT * INTO v_quota FROM get_or_create_today_quota(p_user_id);
  
  -- 增加计数
  UPDATE public.user_quotas
  SET deep_search_count = deep_search_count + 1
  WHERE id = v_quota.id
  RETURNING * INTO v_quota;
  
  RETURN v_quota;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. 创建消耗详情查看配额的函数
CREATE OR REPLACE FUNCTION consume_detail_view_quota(p_user_id UUID)
RETURNS public.user_quotas AS $$
DECLARE
  v_quota public.user_quotas;
BEGIN
  -- 获取或创建今日配额
  SELECT * INTO v_quota FROM get_or_create_today_quota(p_user_id);
  
  -- 增加计数
  UPDATE public.user_quotas
  SET detail_view_count = detail_view_count + 1
  WHERE id = v_quota.id
  RETURNING * INTO v_quota;
  
  RETURN v_quota;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. 授予函数执行权限
GRANT EXECUTE ON FUNCTION get_or_create_today_quota(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION consume_deep_search_quota(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION consume_detail_view_quota(UUID) TO authenticated;

-- 12. 验证表创建
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'user_quotas'
ORDER BY ordinal_position;

-- 13. 添加注释
COMMENT ON TABLE public.user_quotas IS 'AI 搜索配额追踪表，每用户每天一条记录';
COMMENT ON COLUMN public.user_quotas.deep_search_count IS '深度搜索次数（调用 Google API 生成卡片）';
COMMENT ON COLUMN public.user_quotas.detail_view_count IS '详情查看次数（查看 Google 地点详情）';
