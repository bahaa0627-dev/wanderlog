# WanderLog 云端迁移技术方案

## 一、整体架构设计

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Flutter App (C端)                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  地点浏览   │  │  合集展示   │  │  用户收藏   │  │  账号系统   │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
└─────────┼────────────────┼────────────────┼────────────────┼───────────┘
          │                │                │                │
          ▼                ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Supabase (后端服务)                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    PostgreSQL Database                           │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │   │
│  │  │ places  │ │collections│ │  users  │ │user_data│ │ configs │   │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                     │
│  │  Auth       │  │  Edge Func  │  │  Realtime   │                     │
│  │  (认证)     │  │  (API)      │  │  (实时同步) │                     │
│  └─────────────┘  └─────────────┘  └─────────────┘                     │
└─────────────────────────────────────────────────────────────────────────┘
          │
          │ 图片 URL 引用
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Cloudflare (图片服务)                                 │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Cloudflare R2                                 │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │   │
│  │  │ places/     │  │ collections/│  │ users/      │              │   │
│  │  │ (地点图片)  │  │ (合集封面)  │  │ (用户头像)  │              │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Cloudflare Images (可选) - 图片处理/变换/CDN                    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

## 二、数据分类与存储策略

### 2.1 数据分类

| 场景 | 数据类型 | 存储位置 | 访问权限 | 同步策略 |
|------|----------|----------|----------|----------|
| 1. 平台地点 | Place + 图片 | Supabase + R2 | 公开读 | 单向推送 |
| 2. 合集运营 | Collection + 封面 | Supabase + R2 | 公开读 | 单向推送 |
| 3. 用户记录 | 收藏/打卡 | Supabase | 用户私有 | 双向同步 |
| 4. 用户数据 | 账号/会员 | Supabase Auth | 用户私有 | 实时同步 |
| 5. 配置数据 | App Config | Supabase | 公开读 | 按需拉取 |

### 2.2 Supabase 数据库设计

```sql
-- =====================================================
-- 1. 地点数据 (平台运营 + AI 识别)
-- =====================================================
CREATE TABLE places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
  price_level INTEGER,
  website TEXT,
  phone_number TEXT,
  google_place_id TEXT UNIQUE,
  
  -- 来源追踪
  source TEXT DEFAULT 'google_maps',
  source_details JSONB,
  is_verified BOOLEAN DEFAULT false,
  
  -- 时间戳
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引优化
CREATE INDEX idx_places_city ON places(city);
CREATE INDEX idx_places_category ON places(category);
CREATE INDEX idx_places_rating ON places(rating DESC);
CREATE INDEX idx_places_location ON places USING GIST (
  ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
);

-- =====================================================
-- 2. 合集数据 (平台运营)
-- =====================================================
CREATE TABLE collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  cover_image TEXT NOT NULL,  -- R2 URL
  description TEXT,
  people TEXT,                 -- 相关人物
  works TEXT,                  -- 相关作品
  source TEXT,
  
  -- 发布状态
  is_published BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ,
  
  -- 排序权重
  sort_order INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 合集-地点关联
CREATE TABLE collection_spots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
  place_id UUID REFERENCES places(id) ON DELETE CASCADE,
  city TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(collection_id, place_id)
);

-- 合集推荐分组
CREATE TABLE collection_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 推荐-合集关联
CREATE TABLE collection_recommendation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID REFERENCES collection_recommendations(id) ON DELETE CASCADE,
  collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(recommendation_id, collection_id)
);

-- =====================================================
-- 3. 用户数据 (使用 Supabase Auth)
-- =====================================================
-- Supabase Auth 自动创建 auth.users 表
-- 扩展用户信息存储在 public.profiles

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  name TEXT,
  avatar_url TEXT,           -- R2 URL
  
  -- 会员信息
  membership_type TEXT DEFAULT 'free',  -- free, premium, pro
  membership_expires_at TIMESTAMPTZ,
  
  -- 统计
  total_favorites INTEGER DEFAULT 0,
  total_checkins INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 用户收藏
CREATE TABLE user_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id UUID REFERENCES places(id) ON DELETE CASCADE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, place_id)
);

-- 用户打卡
CREATE TABLE user_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id UUID REFERENCES places(id) ON DELETE CASCADE,
  visited_at TIMESTAMPTZ DEFAULT NOW(),
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  notes TEXT,
  photos JSONB DEFAULT '[]',  -- R2 URLs
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 用户合集收藏
CREATE TABLE user_collection_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, collection_id)
);

-- 索引
CREATE INDEX idx_user_favorites_user ON user_favorites(user_id);
CREATE INDEX idx_user_checkins_user ON user_checkins(user_id);
CREATE INDEX idx_user_checkins_place ON user_checkins(place_id);

-- =====================================================
-- 4. 配置数据
-- =====================================================
CREATE TABLE app_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  is_public BOOLEAN DEFAULT true,  -- 是否对 C 端可见
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 预置配置示例
INSERT INTO app_configs (key, value, description, is_public) VALUES
('app_version', '{"min": "1.0.0", "latest": "1.2.0", "force_update": false}', '版本控制', true),
('feature_flags', '{"ai_recognition": true, "premium_features": true}', '功能开关', true),
('categories', '["餐厅", "咖啡馆", "景点", "购物", "酒店", "酒吧"]', '地点分类', true),
('home_banners', '[]', '首页轮播图', true);

-- =====================================================
-- 5. RLS (Row Level Security) 策略
-- =====================================================

-- 启用 RLS
ALTER TABLE places ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_configs ENABLE ROW LEVEL SECURITY;

-- 公开数据策略 (places, collections, configs)
CREATE POLICY "Places are viewable by everyone" ON places
  FOR SELECT USING (true);

CREATE POLICY "Published collections are viewable" ON collections
  FOR SELECT USING (is_published = true);

CREATE POLICY "Public configs are viewable" ON app_configs
  FOR SELECT USING (is_public = true);

-- 用户数据策略
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can manage own favorites" ON user_favorites
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own checkins" ON user_checkins
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Public checkins are viewable" ON user_checkins
  FOR SELECT USING (is_public = true);
```

## 三、Cloudflare R2 图片存储设计

### 3.1 存储桶结构

```
wanderlog-images/
├── places/
│   ├── covers/           # 地点封面图
│   │   └── {place_id}.jpg
│   └── gallery/          # 地点图集
│       └── {place_id}/
│           ├── 1.jpg
│           ├── 2.jpg
│           └── ...
├── collections/
│   └── covers/           # 合集封面
│       └── {collection_id}.jpg
├── users/
│   ├── avatars/          # 用户头像
│   │   └── {user_id}.jpg
│   └── checkins/         # 打卡照片
│       └── {user_id}/
│           └── {checkin_id}/
│               ├── 1.jpg
│               └── ...
└── system/
    └── banners/          # 系统轮播图
        └── {banner_id}.jpg
```

### 3.2 Cloudflare Worker (图片上传 API)

```typescript
// workers/image-upload.ts
export interface Env {
  WANDERLOG_IMAGES: R2Bucket;
  UPLOAD_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, PUT, DELETE',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    // 验证上传权限
    const authHeader = request.headers.get('Authorization');
    if (request.method !== 'GET' && authHeader !== `Bearer ${env.UPLOAD_SECRET}`) {
      return new Response('Unauthorized', { status: 401 });
    }

    const key = url.pathname.slice(1); // 移除开头的 /

    switch (request.method) {
      case 'PUT': {
        // 上传图片
        const contentType = request.headers.get('Content-Type') || 'image/jpeg';
        await env.WANDERLOG_IMAGES.put(key, request.body, {
          httpMetadata: { contentType },
        });
        
        return new Response(JSON.stringify({ 
          success: true, 
          url: `https://images.wanderlog.app/${key}` 
        }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'GET': {
        // 获取图片
        const object = await env.WANDERLOG_IMAGES.get(key);
        if (!object) {
          return new Response('Not Found', { status: 404 });
        }
        
        const headers = new Headers();
        headers.set('Content-Type', object.httpMetadata?.contentType || 'image/jpeg');
        headers.set('Cache-Control', 'public, max-age=31536000'); // 1年缓存
        
        return new Response(object.body, { headers });
      }

      case 'DELETE': {
        await env.WANDERLOG_IMAGES.delete(key);
        return new Response(JSON.stringify({ success: true }));
      }

      default:
        return new Response('Method Not Allowed', { status: 405 });
    }
  },
};
```

### 3.3 图片处理策略

```typescript
// 使用 Cloudflare Images 或自定义 Worker 处理图片变换
// URL 格式: https://images.wanderlog.app/{path}?w=400&h=300&fit=cover

// 支持的参数:
// - w: 宽度
// - h: 高度  
// - fit: cover | contain | fill
// - q: 质量 (1-100)
// - f: 格式 (webp | avif | jpeg)

// 示例:
// 原图: https://images.wanderlog.app/places/covers/abc123.jpg
// 缩略图: https://images.wanderlog.app/places/covers/abc123.jpg?w=200&h=200&fit=cover
// WebP: https://images.wanderlog.app/places/covers/abc123.jpg?f=webp&q=80
```

## 四、数据迁移流程

### 4.1 迁移脚本设计

```typescript
// scripts/migrate-to-supabase.ts
import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY! // 使用 service key 绕过 RLS
);

interface MigrationResult {
  table: string;
  total: number;
  migrated: number;
  failed: number;
  errors: string[];
}

// 1. 迁移地点数据
async function migratePlaces(): Promise<MigrationResult> {
  const result: MigrationResult = { 
    table: 'places', total: 0, migrated: 0, failed: 0, errors: [] 
  };
  
  const places = await prisma.place.findMany();
  result.total = places.length;
  
  for (const place of places) {
    try {
      // 上传图片到 R2
      const coverImageUrl = place.coverImage 
        ? await uploadImageToR2(place.coverImage, `places/covers/${place.id}`)
        : null;
      
      const imagesUrls = place.images 
        ? await uploadImagesToR2(JSON.parse(place.images), `places/gallery/${place.id}`)
        : [];

      // 插入 Supabase
      const { error } = await supabase.from('places').insert({
        id: place.id,
        name: place.name,
        city: place.city,
        country: place.country,
        latitude: place.latitude,
        longitude: place.longitude,
        address: place.address,
        description: place.description,
        opening_hours: place.openingHours,
        rating: place.rating,
        rating_count: place.ratingCount,
        category: place.category,
        ai_summary: place.aiSummary,
        ai_description: place.aiDescription,
        ai_tags: place.aiTags ? JSON.parse(place.aiTags) : [],
        cover_image: coverImageUrl,
        images: imagesUrls,
        price_level: place.priceLevel,
        website: place.website,
        phone_number: place.phoneNumber,
        google_place_id: place.googlePlaceId,
        source: place.source,
        source_details: place.sourceDetails ? JSON.parse(place.sourceDetails) : null,
        is_verified: place.isVerified,
        last_synced_at: place.lastSyncedAt,
        created_at: place.createdAt,
        updated_at: place.updatedAt,
      });

      if (error) throw error;
      result.migrated++;
    } catch (e: any) {
      result.failed++;
      result.errors.push(`Place ${place.id}: ${e.message}`);
    }
  }
  
  return result;
}

// 2. 迁移合集数据
async function migrateCollections(): Promise<MigrationResult> {
  const result: MigrationResult = { 
    table: 'collections', total: 0, migrated: 0, failed: 0, errors: [] 
  };
  
  const collections = await prisma.collection.findMany({
    include: { collectionSpots: true }
  });
  result.total = collections.length;
  
  for (const collection of collections) {
    try {
      const coverImageUrl = await uploadImageToR2(
        collection.coverImage, 
        `collections/covers/${collection.id}`
      );

      const { error } = await supabase.from('collections').insert({
        id: collection.id,
        name: collection.name,
        cover_image: coverImageUrl,
        description: collection.description,
        people: collection.people,
        works: collection.works,
        source: collection.source,
        is_published: collection.isPublished,
        published_at: collection.publishedAt,
        created_at: collection.createdAt,
        updated_at: collection.updatedAt,
      });

      if (error) throw error;

      // 迁移合集-地点关联
      for (const spot of collection.collectionSpots) {
        await supabase.from('collection_spots').insert({
          id: spot.id,
          collection_id: spot.collectionId,
          place_id: spot.placeId,
          city: spot.city,
          created_at: spot.createdAt,
        });
      }

      result.migrated++;
    } catch (e: any) {
      result.failed++;
      result.errors.push(`Collection ${collection.id}: ${e.message}`);
    }
  }
  
  return result;
}

// 3. 迁移用户数据
async function migrateUsers(): Promise<MigrationResult> {
  const result: MigrationResult = { 
    table: 'users', total: 0, migrated: 0, failed: 0, errors: [] 
  };
  
  const users = await prisma.user.findMany({
    include: { userCollections: true }
  });
  result.total = users.length;
  
  for (const user of users) {
    try {
      // 创建 Supabase Auth 用户
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email: user.email,
        email_confirm: user.isEmailVerified,
        user_metadata: {
          name: user.name,
          avatar_url: user.avatarUrl,
        },
      });

      if (authError) throw authError;

      // 上传头像
      const avatarUrl = user.avatarUrl 
        ? await uploadImageToR2(user.avatarUrl, `users/avatars/${authUser.user.id}`)
        : null;

      // 创建 profile
      await supabase.from('profiles').insert({
        id: authUser.user.id,
        email: user.email,
        name: user.name,
        avatar_url: avatarUrl,
        created_at: user.createdAt,
        updated_at: user.updatedAt,
      });

      // 迁移用户合集收藏
      for (const uc of user.userCollections) {
        await supabase.from('user_collection_favorites').insert({
          user_id: authUser.user.id,
          collection_id: uc.collectionId,
          created_at: uc.createdAt,
        });
      }

      result.migrated++;
    } catch (e: any) {
      result.failed++;
      result.errors.push(`User ${user.id}: ${e.message}`);
    }
  }
  
  return result;
}

// 4. 图片上传工具函数
async function uploadImageToR2(
  sourceUrl: string, 
  targetPath: string
): Promise<string> {
  // 下载原图
  const response = await fetch(sourceUrl);
  const buffer = await response.arrayBuffer();
  
  // 上传到 R2
  const uploadResponse = await fetch(
    `https://images.wanderlog.app/${targetPath}.jpg`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${process.env.R2_UPLOAD_SECRET}`,
        'Content-Type': 'image/jpeg',
      },
      body: buffer,
    }
  );
  
  const result = await uploadResponse.json();
  return result.url;
}

async function uploadImagesToR2(
  sourceUrls: string[], 
  basePath: string
): Promise<string[]> {
  const urls: string[] = [];
  for (let i = 0; i < sourceUrls.length; i++) {
    const url = await uploadImageToR2(sourceUrls[i], `${basePath}/${i + 1}`);
    urls.push(url);
  }
  return urls;
}

// 5. 主迁移函数
async function runMigration() {
  console.log('🚀 开始数据迁移...\n');
  
  const results: MigrationResult[] = [];
  
  // 按顺序迁移 (有外键依赖)
  console.log('📍 迁移地点数据...');
  results.push(await migratePlaces());
  
  console.log('📚 迁移合集数据...');
  results.push(await migrateCollections());
  
  console.log('👤 迁移用户数据...');
  results.push(await migrateUsers());
  
  console.log('🔗 迁移推荐数据...');
  results.push(await migrateRecommendations());
  
  // 输出报告
  console.log('\n📊 迁移报告:');
  console.log('='.repeat(50));
  for (const r of results) {
    console.log(`${r.table}: ${r.migrated}/${r.total} 成功, ${r.failed} 失败`);
    if (r.errors.length > 0) {
      r.errors.forEach(e => console.log(`  ❌ ${e}`));
    }
  }
}

runMigration().catch(console.error);
```

## 五、Flutter App 集成

### 5.1 Supabase 客户端配置

```dart
// lib/core/supabase/supabase_client.dart
import 'package:supabase_flutter/supabase_flutter.dart';

class SupabaseConfig {
  static const String url = 'https://your-project.supabase.co';
  static const String anonKey = 'your-anon-key';
  
  static Future<void> initialize() async {
    await Supabase.initialize(
      url: url,
      anonKey: anonKey,
      authOptions: const FlutterAuthClientOptions(
        authFlowType: AuthFlowType.pkce,
      ),
      realtimeClientOptions: const RealtimeClientOptions(
        logLevel: RealtimeLogLevel.info,
      ),
    );
  }
  
  static SupabaseClient get client => Supabase.instance.client;
  static GoTrueClient get auth => client.auth;
}
```

### 5.2 数据仓库层

```dart
// lib/services/repositories/place_repository.dart
import 'package:supabase_flutter/supabase_flutter.dart';

class PlaceRepository {
  final SupabaseClient _client;
  
  PlaceRepository(this._client);
  
  /// 获取地点列表 (分页)
  Future<List<Place>> getPlaces({
    String? city,
    String? category,
    int page = 1,
    int pageSize = 20,
  }) async {
    var query = _client
        .from('places')
        .select()
        .order('rating', ascending: false);
    
    if (city != null) {
      query = query.eq('city', city);
    }
    if (category != null) {
      query = query.eq('category', category);
    }
    
    final response = await query
        .range((page - 1) * pageSize, page * pageSize - 1);
    
    return (response as List).map((e) => Place.fromJson(e)).toList();
  }
  
  /// 搜索地点
  Future<List<Place>> searchPlaces(String keyword) async {
    final response = await _client
        .from('places')
        .select()
        .or('name.ilike.%$keyword%,address.ilike.%$keyword%')
        .limit(20);
    
    return (response as List).map((e) => Place.fromJson(e)).toList();
  }
  
  /// 获取附近地点
  Future<List<Place>> getNearbyPlaces(
    double lat, 
    double lng, 
    double radiusKm,
  ) async {
    // 使用 PostGIS 函数
    final response = await _client.rpc('get_nearby_places', params: {
      'lat': lat,
      'lng': lng,
      'radius_km': radiusKm,
    });
    
    return (response as List).map((e) => Place.fromJson(e)).toList();
  }
}

// lib/services/repositories/user_repository.dart
class UserRepository {
  final SupabaseClient _client;
  
  UserRepository(this._client);
  
  /// 获取用户收藏
  Future<List<Place>> getFavorites() async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) throw Exception('Not authenticated');
    
    final response = await _client
        .from('user_favorites')
        .select('*, place:places(*)')
        .eq('user_id', userId)
        .order('created_at', ascending: false);
    
    return (response as List)
        .map((e) => Place.fromJson(e['place']))
        .toList();
  }
  
  /// 添加收藏
  Future<void> addFavorite(String placeId) async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) throw Exception('Not authenticated');
    
    await _client.from('user_favorites').insert({
      'user_id': userId,
      'place_id': placeId,
    });
  }
  
  /// 移除收藏
  Future<void> removeFavorite(String placeId) async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) throw Exception('Not authenticated');
    
    await _client
        .from('user_favorites')
        .delete()
        .eq('user_id', userId)
        .eq('place_id', placeId);
  }
  
  /// 打卡
  Future<void> checkin({
    required String placeId,
    int? rating,
    String? notes,
    List<String>? photoUrls,
  }) async {
    final userId = _client.auth.currentUser?.id;
    if (userId == null) throw Exception('Not authenticated');
    
    await _client.from('user_checkins').insert({
      'user_id': userId,
      'place_id': placeId,
      'rating': rating,
      'notes': notes,
      'photos': photoUrls ?? [],
    });
  }
}
```

### 5.3 认证服务

```dart
// lib/services/auth_service.dart
class AuthService {
  final SupabaseClient _client;
  
  AuthService(this._client);
  
  User? get currentUser => _client.auth.currentUser;
  Stream<AuthState> get authStateChanges => _client.auth.onAuthStateChange;
  
  /// 邮箱注册
  Future<AuthResponse> signUp(String email, String password) async {
    return await _client.auth.signUp(
      email: email,
      password: password,
    );
  }
  
  /// 邮箱登录
  Future<AuthResponse> signIn(String email, String password) async {
    return await _client.auth.signInWithPassword(
      email: email,
      password: password,
    );
  }
  
  /// Google 登录
  Future<AuthResponse> signInWithGoogle() async {
    return await _client.auth.signInWithOAuth(
      OAuthProvider.google,
      redirectTo: 'io.wanderlog.app://login-callback',
    );
  }
  
  /// Apple 登录
  Future<AuthResponse> signInWithApple() async {
    return await _client.auth.signInWithOAuth(
      OAuthProvider.apple,
      redirectTo: 'io.wanderlog.app://login-callback',
    );
  }
  
  /// 登出
  Future<void> signOut() async {
    await _client.auth.signOut();
  }
}
```

### 5.4 图片上传服务

```dart
// lib/services/image_service.dart
import 'dart:io';
import 'package:http/http.dart' as http;

class ImageService {
  static const String _baseUrl = 'https://images.wanderlog.app';
  
  /// 上传用户头像
  Future<String> uploadAvatar(File imageFile) async {
    final userId = SupabaseConfig.client.auth.currentUser?.id;
    if (userId == null) throw Exception('Not authenticated');
    
    final path = 'users/avatars/$userId.jpg';
    return await _uploadImage(imageFile, path);
  }
  
  /// 上传打卡照片
  Future<List<String>> uploadCheckinPhotos(
    String checkinId, 
    List<File> images,
  ) async {
    final userId = SupabaseConfig.client.auth.currentUser?.id;
    if (userId == null) throw Exception('Not authenticated');
    
    final urls = <String>[];
    for (int i = 0; i < images.length; i++) {
      final path = 'users/checkins/$userId/$checkinId/${i + 1}.jpg';
      final url = await _uploadImage(images[i], path);
      urls.add(url);
    }
    return urls;
  }
  
  Future<String> _uploadImage(File file, String path) async {
    final bytes = await file.readAsBytes();
    
    final response = await http.put(
      Uri.parse('$_baseUrl/$path'),
      headers: {
        'Content-Type': 'image/jpeg',
        'Authorization': 'Bearer ${await _getUploadToken()}',
      },
      body: bytes,
    );
    
    if (response.statusCode != 200) {
      throw Exception('Upload failed: ${response.body}');
    }
    
    return '$_baseUrl/$path';
  }
  
  Future<String> _getUploadToken() async {
    // 从 Supabase Edge Function 获取临时上传 token
    final response = await SupabaseConfig.client.functions.invoke(
      'get-upload-token',
    );
    return response.data['token'];
  }
  
  /// 获取优化后的图片 URL
  static String getOptimizedUrl(
    String originalUrl, {
    int? width,
    int? height,
    String fit = 'cover',
    int quality = 80,
  }) {
    final params = <String>[];
    if (width != null) params.add('w=$width');
    if (height != null) params.add('h=$height');
    params.add('fit=$fit');
    params.add('q=$quality');
    params.add('f=webp');
    
    return '$originalUrl?${params.join('&')}';
  }
}
```

## 六、Supabase Edge Functions (API 层)

### 6.1 获取上传 Token

```typescript
// supabase/functions/get-upload-token/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SignJWT } from 'https://deno.land/x/jose@v4.14.4/index.ts'

serve(async (req) => {
  // 验证用户身份
  const authHeader = req.headers.get('Authorization')!
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )
  
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
      status: 401 
    })
  }
  
  // 生成临时上传 token (15分钟有效)
  const secret = new TextEncoder().encode(Deno.env.get('R2_UPLOAD_SECRET')!)
  const token = await new SignJWT({ userId: user.id })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('15m')
    .sign(secret)
  
  return new Response(JSON.stringify({ token }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

### 6.2 附近地点查询 (PostGIS)

```sql
-- 创建 PostGIS 函数
CREATE OR REPLACE FUNCTION get_nearby_places(
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  radius_km DOUBLE PRECISION DEFAULT 5
)
RETURNS SETOF places AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM places
  WHERE ST_DWithin(
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
    ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
    radius_km * 1000  -- 转换为米
  )
  ORDER BY ST_Distance(
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
    ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
  );
END;
$$ LANGUAGE plpgsql;
```

## 七、实施步骤

### Phase 1: 基础设施搭建 (1-2天)

```bash
# 1. 创建 Supabase 项目
# 访问 https://supabase.com/dashboard 创建新项目

# 2. 创建 Cloudflare R2 存储桶
# 访问 https://dash.cloudflare.com → R2 → Create bucket
# 名称: wanderlog-images

# 3. 部署 Cloudflare Worker
cd workers
wrangler publish

# 4. 配置自定义域名
# R2: images.wanderlog.app
# Supabase: api.wanderlog.app (可选)
```

### Phase 2: 数据库迁移 (1天)

```bash
# 1. 在 Supabase 执行建表 SQL
# 复制上面的 SQL 到 Supabase SQL Editor 执行

# 2. 启用 PostGIS 扩展
CREATE EXTENSION IF NOT EXISTS postgis;

# 3. 运行迁移脚本
cd wanderlog_api
npx ts-node scripts/migrate-to-supabase.ts

# 4. 验证数据
SELECT COUNT(*) FROM places;
SELECT COUNT(*) FROM collections;
SELECT COUNT(*) FROM profiles;
```

### Phase 3: Flutter App 改造 (2-3天)

```yaml
# pubspec.yaml 添加依赖
dependencies:
  supabase_flutter: ^2.3.0
  cached_network_image: ^3.3.0
```

```dart
// 1. 初始化 Supabase
void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SupabaseConfig.initialize();
  runApp(MyApp());
}

// 2. 替换现有 API 调用为 Supabase 调用
// 3. 更新图片 URL 为 R2 URL
// 4. 测试所有功能
```

### Phase 4: 测试与上线 (1-2天)

```bash
# 1. 功能测试清单
- [ ] 地点列表加载
- [ ] 地点搜索
- [ ] 合集展示
- [ ] 用户注册/登录
- [ ] Google/Apple 登录
- [ ] 收藏功能
- [ ] 打卡功能
- [ ] 图片上传
- [ ] 图片加载

# 2. 性能测试
- [ ] 首屏加载时间 < 2s
- [ ] 图片加载时间 < 1s
- [ ] API 响应时间 < 500ms

# 3. 上线
- 配置生产环境变量
- 切换 App 到生产 Supabase
- 监控错误日志
```

## 八、环境变量配置

### 8.1 后端 (.env)

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Cloudflare R2
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET_NAME=wanderlog-images
R2_PUBLIC_URL=https://images.wanderlog.app
R2_UPLOAD_SECRET=your-upload-secret
```

### 8.2 Flutter App (.env)

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Cloudflare Images
IMAGES_BASE_URL=https://images.wanderlog.app
```

### 8.3 Cloudflare Worker (wrangler.toml)

```toml
name = "wanderlog-images"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[r2_buckets]]
binding = "WANDERLOG_IMAGES"
bucket_name = "wanderlog-images"

[vars]
UPLOAD_SECRET = "your-upload-secret"
```

## 九、成本估算

| 服务 | 免费额度 | 预估月费用 |
|------|----------|------------|
| Supabase (Free) | 500MB 数据库, 1GB 存储 | $0 |
| Supabase (Pro) | 8GB 数据库, 100GB 存储 | $25/月 |
| Cloudflare R2 | 10GB 存储, 100万次请求 | $0 |
| Cloudflare R2 (超出) | - | $0.015/GB |
| Cloudflare Workers | 10万次/天 | $0 |

初期建议: 使用 Supabase Free + Cloudflare R2 Free，足够支撑早期用户。

## 十、后续优化建议

1. **缓存策略**: 使用 Cloudflare CDN 缓存热门数据
2. **实时同步**: 利用 Supabase Realtime 实现收藏/打卡实时更新
3. **离线支持**: 使用 Hive/Isar 本地缓存，支持离线浏览
4. **图片优化**: 使用 Cloudflare Images 自动生成多尺寸图片
5. **监控告警**: 配置 Supabase 监控 + Cloudflare Analytics
