# 云端迁移快速启动指南

## 一、准备工作

### 1. 创建 Supabase 项目

1. 访问 https://supabase.com/dashboard
2. 点击 "New Project"
3. 记录以下信息：
   - Project URL: `https://xxx.supabase.co`
   - anon key: 在 Settings → API 中获取
   - service_role key: 在 Settings → API 中获取 (迁移用)

### 2. 创建 Cloudflare R2 存储桶

1. 访问 https://dash.cloudflare.com
2. 进入 R2 → Create bucket
3. 名称: `wanderlog-images`
4. 创建 API Token (R2 读写权限)

### 3. 配置环境变量

```bash
# wanderlog_api/.env 添加:
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key
R2_PUBLIC_URL=https://your-worker.workers.dev
R2_UPLOAD_SECRET=生成一个随机字符串
```

## 二、执行迁移

### Step 1: 初始化 Supabase 数据库

```bash
# 在 Supabase Dashboard → SQL Editor 中执行:
# 复制 supabase/migrations/001_initial_schema.sql 的内容并执行
```

### Step 2: 部署 Cloudflare Worker

```bash
cd cloudflare-worker
npm install

# 设置 secret
wrangler secret put UPLOAD_SECRET
# 输入你在 .env 中设置的 R2_UPLOAD_SECRET

# 部署
wrangler deploy
```

记录 Worker URL，更新 `.env` 中的 `R2_PUBLIC_URL`

### Step 3: 运行数据迁移

```bash
cd wanderlog_api

# 安装 Supabase 客户端
npm install @supabase/supabase-js

# 运行迁移脚本
npx ts-node scripts/migrate-to-supabase.ts
```

### Step 4: 部署 Supabase Edge Function

```bash
# 安装 Supabase CLI
npm install -g supabase

# 登录
supabase login

# 链接项目
supabase link --project-ref your-project-ref

# 设置 secret
supabase secrets set R2_UPLOAD_SECRET=your-secret

# 部署函数
supabase functions deploy get-upload-token
```

### Step 5: 更新 Flutter App

```bash
cd wanderlog_app

# 添加依赖
flutter pub add supabase_flutter
flutter pub add flutter_dotenv

# 更新 .env 文件
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
IMAGES_BASE_URL=https://your-worker.workers.dev
```

## 三、验证迁移

### 检查数据

```sql
-- 在 Supabase SQL Editor 执行
SELECT COUNT(*) as places_count FROM places;
SELECT COUNT(*) as collections_count FROM collections;
SELECT COUNT(*) as users_count FROM profiles;
```

### 测试 API

```bash
# 测试获取地点
curl "https://your-project.supabase.co/rest/v1/places?limit=5" \
  -H "apikey: your-anon-key"

# 测试图片上传
curl -X PUT "https://your-worker.workers.dev/test/image.jpg" \
  -H "Authorization: Bearer your-upload-secret" \
  -H "Content-Type: image/jpeg" \
  --data-binary @test.jpg
```

## 四、文件清单

```
supabase/
├── migrations/
│   └── 001_initial_schema.sql    # 数据库 schema
└── functions/
    └── get-upload-token/
        └── index.ts              # 上传 token 函数

cloudflare-worker/
├── src/
│   └── index.ts                  # Worker 代码
├── wrangler.toml                 # Worker 配置
└── package.json

wanderlog_api/
└── scripts/
    └── migrate-to-supabase.ts    # 迁移脚本

wanderlog_app/lib/core/supabase/
├── supabase_config.dart          # 配置
├── models/
│   ├── place_model.dart          # 地点模型
│   └── collection_model.dart     # 合集模型
├── repositories/
│   ├── place_repository.dart     # 地点仓库
│   └── user_repository.dart      # 用户仓库
└── services/
    ├── auth_service.dart         # 认证服务
    └── image_service.dart        # 图片服务
```

## 五、常见问题

### Q: 迁移失败怎么办？
A: 检查 `scripts/migration_report_xxx.json` 查看详细错误，修复后重新运行迁移脚本（使用 upsert 不会重复插入）

### Q: 图片上传失败？
A: 检查 R2_UPLOAD_SECRET 是否一致，Worker 是否正确部署

### Q: RLS 策略导致查询失败？
A: 确保使用正确的 key（anon key 用于客户端，service key 用于后台）
