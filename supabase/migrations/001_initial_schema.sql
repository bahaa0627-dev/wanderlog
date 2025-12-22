-- =====================================================
-- WanderLog Cloud Migration - Initial Schema
-- =====================================================

-- 启用必要的扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- =====================================================
-- 1. 地点数据表 (平台运营 + AI 识别)
-- =====================================================
CREATE TABLE places (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  city TEXT,
  country TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  address TEXT,
  description TEXT,
  opening_hours TEXT,
  rating DECIMAL(2,1),
  rating_count INTEGER,
  category TEXT,
  
  -- AI 识别字段
  ai_summary TEXT,
  ai_description TEXT,
  ai_tags JSONB DEFAULT '[]',
  
  -- 图片 (存储 Cloudflare R2 URL)
  cover_image TEXT,
  images JSONB DEFAULT '[]',
  
  -- 扩展信息
  tags JSONB DEFAULT '[]',
  price_level INTEGER,
  website TEXT,
  phone_number TEXT,
  google_place_id TEXT UNIQUE,
  
  -- 来源追踪
  source TEXT DEFAULT 'google_maps',
  source_details JSONB,
  is_verified BOOLEAN DEFAULT false,
  custom_fields JSONB,
  
  -- 时间戳
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 地点索引
CREATE INDEX idx_places_city ON places(city);
CREATE INDEX idx_places_country ON places(country);
CREATE INDEX idx_places_category ON places(category);
CREATE INDEX idx_places_rating ON places(rating DESC);
CREATE INDEX idx_places_source ON places(source);
CREATE INDEX idx_places_location ON places USING GIST (
  ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
);

-- =====================================================
-- 2. 合集数据表 (平台运营)
-- =====================================================
CREATE TABLE collections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  cover_image TEXT NOT NULL,
  description TEXT,
  people TEXT,
  works TEXT,
  source TEXT,
  
  -- 发布状态
  is_published BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ,
  
  -- 排序
  sort_order INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_collections_published ON collections(is_published);
CREATE INDEX idx_collections_sort ON collections(sort_order);

-- 合集-地点关联表
CREATE TABLE collection_spots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  city TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(collection_id, place_id)
);

CREATE INDEX idx_collection_spots_collection ON collection_spots(collection_id);
CREATE INDEX idx_collection_spots_city ON collection_spots(city);

-- 合集推荐分组
CREATE TABLE collection_recommendations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_recommendations_sort ON collection_recommendations(sort_order);
CREATE INDEX idx_recommendations_active ON collection_recommendations(is_active);

-- 推荐-合集关联
CREATE TABLE collection_recommendation_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recommendation_id UUID NOT NULL REFERENCES collection_recommendations(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(recommendation_id, collection_id)
);

CREATE INDEX idx_recommendation_items_rec ON collection_recommendation_items(recommendation_id, sort_order);

-- =====================================================
-- 3. 用户扩展信息表 (配合 Supabase Auth)
-- =====================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  name TEXT,
  avatar_url TEXT,
  
  -- 会员信息
  membership_type TEXT DEFAULT 'free' CHECK (membership_type IN ('free', 'premium', 'pro')),
  membership_expires_at TIMESTAMPTZ,
  
  -- 统计
  total_favorites INTEGER DEFAULT 0,
  total_checkins INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 用户收藏
CREATE TABLE user_favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, place_id)
);

CREATE INDEX idx_user_favorites_user ON user_favorites(user_id);
CREATE INDEX idx_user_favorites_place ON user_favorites(place_id);

-- 用户打卡
CREATE TABLE user_checkins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  visited_at TIMESTAMPTZ DEFAULT NOW(),
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  notes TEXT,
  photos JSONB DEFAULT '[]',
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_checkins_user ON user_checkins(user_id);
CREATE INDEX idx_user_checkins_place ON user_checkins(place_id);
CREATE INDEX idx_user_checkins_public ON user_checkins(is_public) WHERE is_public = true;

-- 用户合集收藏
CREATE TABLE user_collection_favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, collection_id)
);

CREATE INDEX idx_user_collection_favorites_user ON user_collection_favorites(user_id);

-- =====================================================
-- 4. 配置数据表
-- =====================================================
CREATE TABLE app_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_app_configs_key ON app_configs(key);
CREATE INDEX idx_app_configs_public ON app_configs(is_public);

-- 预置配置
INSERT INTO app_configs (key, value, description, is_public) VALUES
('app_version', '{"min": "1.0.0", "latest": "1.0.0", "force_update": false}', '版本控制', true),
('feature_flags', '{"ai_recognition": true, "premium_features": false}', '功能开关', true),
('categories', '["餐厅", "咖啡馆", "景点", "购物", "酒店", "酒吧", "博物馆", "公园"]', '地点分类', true),
('home_banners', '[]', '首页轮播图', true);

-- =====================================================
-- 5. RLS (Row Level Security) 策略
-- =====================================================

-- 启用 RLS
ALTER TABLE places ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_spots ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_recommendation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_collection_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_configs ENABLE ROW LEVEL SECURITY;

-- 公开数据策略
CREATE POLICY "Places are viewable by everyone" ON places
  FOR SELECT USING (true);

CREATE POLICY "Published collections are viewable" ON collections
  FOR SELECT USING (is_published = true);

CREATE POLICY "Collection spots are viewable" ON collection_spots
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM collections WHERE id = collection_id AND is_published = true)
  );

CREATE POLICY "Active recommendations are viewable" ON collection_recommendations
  FOR SELECT USING (is_active = true);

CREATE POLICY "Recommendation items are viewable" ON collection_recommendation_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM collection_recommendations WHERE id = recommendation_id AND is_active = true)
  );

CREATE POLICY "Public configs are viewable" ON app_configs
  FOR SELECT USING (is_public = true);

-- 用户数据策略
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can manage own favorites" ON user_favorites
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own checkins" ON user_checkins
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Public checkins are viewable" ON user_checkins
  FOR SELECT USING (is_public = true);

CREATE POLICY "Users can manage own collection favorites" ON user_collection_favorites
  FOR ALL USING (auth.uid() = user_id);

-- =====================================================
-- 6. 触发器和函数
-- =====================================================

-- 自动更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER places_updated_at
  BEFORE UPDATE ON places
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER collections_updated_at
  BEFORE UPDATE ON collections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER app_configs_updated_at
  BEFORE UPDATE ON app_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 新用户自动创建 profile
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name'),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 更新用户统计
CREATE OR REPLACE FUNCTION update_user_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'user_favorites' THEN
    IF TG_OP = 'INSERT' THEN
      UPDATE profiles SET total_favorites = total_favorites + 1 WHERE id = NEW.user_id;
    ELSIF TG_OP = 'DELETE' THEN
      UPDATE profiles SET total_favorites = total_favorites - 1 WHERE id = OLD.user_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'user_checkins' THEN
    IF TG_OP = 'INSERT' THEN
      UPDATE profiles SET total_checkins = total_checkins + 1 WHERE id = NEW.user_id;
    ELSIF TG_OP = 'DELETE' THEN
      UPDATE profiles SET total_checkins = total_checkins - 1 WHERE id = OLD.user_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER update_favorites_count
  AFTER INSERT OR DELETE ON user_favorites
  FOR EACH ROW EXECUTE FUNCTION update_user_stats();

CREATE TRIGGER update_checkins_count
  AFTER INSERT OR DELETE ON user_checkins
  FOR EACH ROW EXECUTE FUNCTION update_user_stats();

-- =====================================================
-- 7. PostGIS 查询函数
-- =====================================================

-- 获取附近地点
CREATE OR REPLACE FUNCTION get_nearby_places(
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  radius_km DOUBLE PRECISION DEFAULT 5,
  limit_count INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  city TEXT,
  country TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  address TEXT,
  description TEXT,
  rating DECIMAL(2,1),
  category TEXT,
  cover_image TEXT,
  distance_km DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.name,
    p.city,
    p.country,
    p.latitude,
    p.longitude,
    p.address,
    p.description,
    p.rating,
    p.category,
    p.cover_image,
    ST_Distance(
      ST_SetSRID(ST_MakePoint(p.longitude, p.latitude), 4326)::geography,
      ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
    ) / 1000 AS distance_km
  FROM places p
  WHERE ST_DWithin(
    ST_SetSRID(ST_MakePoint(p.longitude, p.latitude), 4326)::geography,
    ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
    radius_km * 1000
  )
  ORDER BY distance_km
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- 搜索地点
CREATE OR REPLACE FUNCTION search_places(
  search_term TEXT,
  limit_count INTEGER DEFAULT 20
)
RETURNS SETOF places AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM places
  WHERE 
    name ILIKE '%' || search_term || '%'
    OR address ILIKE '%' || search_term || '%'
    OR city ILIKE '%' || search_term || '%'
    OR description ILIKE '%' || search_term || '%'
  ORDER BY 
    CASE WHEN name ILIKE search_term || '%' THEN 0 ELSE 1 END,
    rating DESC NULLS LAST
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- 获取合集详情（含地点）
CREATE OR REPLACE FUNCTION get_collection_with_places(collection_uuid UUID)
RETURNS TABLE (
  collection_id UUID,
  collection_name TEXT,
  cover_image TEXT,
  description TEXT,
  people TEXT,
  works TEXT,
  place_id UUID,
  place_name TEXT,
  place_city TEXT,
  place_latitude DOUBLE PRECISION,
  place_longitude DOUBLE PRECISION,
  place_cover_image TEXT,
  place_rating DECIMAL(2,1)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id AS collection_id,
    c.name AS collection_name,
    c.cover_image,
    c.description,
    c.people,
    c.works,
    p.id AS place_id,
    p.name AS place_name,
    p.city AS place_city,
    p.latitude AS place_latitude,
    p.longitude AS place_longitude,
    p.cover_image AS place_cover_image,
    p.rating AS place_rating
  FROM collections c
  LEFT JOIN collection_spots cs ON cs.collection_id = c.id
  LEFT JOIN places p ON p.id = cs.place_id
  WHERE c.id = collection_uuid AND c.is_published = true
  ORDER BY cs.sort_order;
END;
$$ LANGUAGE plpgsql;
