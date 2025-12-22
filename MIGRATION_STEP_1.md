# Step 1: 执行 Supabase 数据库迁移

## 操作步骤

### 1. 打开 Supabase Dashboard

访问: https://supabase.com/dashboard/project/bpygtpeawkxlgjhqorzi

### 2. 进入 SQL Editor

左侧菜单 → SQL Editor → New Query

### 3. 复制并执行 SQL

将 `supabase/migrations/001_initial_schema.sql` 的内容复制到编辑器中，然后点击 "Run" 执行。

**或者直接在终端执行:**

```bash
# 安装 Supabase CLI (如果还没安装)
npm install -g supabase

# 登录
supabase login

# 链接项目
supabase link --project-ref bpygtpeawkxlgjhqorzi

# 执行迁移
supabase db push
```

### 4. 验证迁移结果

执行以下 SQL 验证表是否创建成功:

```sql
-- 检查所有表
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- 应该看到:
-- app_configs
-- collection_recommendation_items
-- collection_recommendations
-- collection_spots
-- collections
-- places
-- profiles
-- user_checkins
-- user_collection_favorites
-- user_favorites
```

### 5. 检查 RLS 策略

```sql
-- 检查 RLS 是否启用
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';
```

### 6. 测试函数

```sql
-- 测试搜索函数
SELECT * FROM search_places('咖啡', 5);

-- 测试附近地点函数 (以北京天安门为例)
SELECT * FROM get_nearby_places(39.9042, 116.4074, 5, 10);
```

## 预期结果

✅ 所有表创建成功
✅ RLS 策略已启用
✅ 触发器已创建
✅ PostGIS 函数可用

## 如果遇到错误

### 错误: "extension postgis does not exist"

```sql
-- 在 SQL Editor 中执行
CREATE EXTENSION IF NOT EXISTS postgis;
```

### 错误: "permission denied"

确保使用的是 service_role key 或在 Dashboard 中操作

## 完成后

执行成功后，继续 Step 2: 配置环境变量
