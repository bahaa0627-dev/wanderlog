-- 允许任何人插入 places 数据（用于 AI 搜索自动保存）
-- 在 Supabase Dashboard > SQL Editor 中执行此脚本

-- 添加 INSERT 策略
CREATE POLICY "Anyone can insert places" ON places
  FOR INSERT WITH CHECK (true);

-- 如果需要更新已有数据，也添加 UPDATE 策略
CREATE POLICY "Anyone can update places" ON places
  FOR UPDATE USING (true);
