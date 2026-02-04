-- 创建用户推荐地点表
CREATE TABLE IF NOT EXISTS user_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country TEXT NOT NULL,
  city TEXT NOT NULL,
  place_name TEXT NOT NULL,
  image_url TEXT,
  user_nickname TEXT NOT NULL DEFAULT 'Anonymous',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS user_recommendations_status_idx ON user_recommendations(status);
CREATE INDEX IF NOT EXISTS user_recommendations_created_at_idx ON user_recommendations(created_at DESC);

-- 添加更新时间自动更新触发器
CREATE OR REPLACE FUNCTION update_user_recommendations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_recommendations_updated_at ON user_recommendations;
CREATE TRIGGER user_recommendations_updated_at
  BEFORE UPDATE ON user_recommendations
  FOR EACH ROW
  EXECUTE FUNCTION update_user_recommendations_updated_at();

-- 授权公共访问（用于匿名用户也能提交推荐）
GRANT SELECT, INSERT ON user_recommendations TO anon;
GRANT SELECT, INSERT, UPDATE ON user_recommendations TO authenticated;
