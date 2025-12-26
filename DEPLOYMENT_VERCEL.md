# Vercel 免费部署指南

## 快速部署（3分钟）

### 方式一：网页部署（最简单）

1. 访问 [vercel.com](https://vercel.com) 用 GitHub 登录
2. 点击 "Add New..." → "Project"
3. 导入你的 GitHub 仓库
4. 配置：
   - **Root Directory**: `wanderlog_api`
   - **Framework Preset**: Other
5. 添加环境变量（见下方）
6. 点击 "Deploy"

### 方式二：CLI 部署

```bash
# 安装 Vercel CLI
npm i -g vercel

# 登录
vercel login

# 部署
cd wanderlog_api
vercel

# 生产部署
vercel --prod
```

---

## 环境变量配置

在 Vercel Dashboard → Settings → Environment Variables 添加：

```env
# 必需
DATABASE_URL=postgresql://postgres.dhyfttcikicrsfqamgfk:YOUR_PASSWORD@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
DIRECT_URL=postgresql://postgres:YOUR_PASSWORD@db.dhyfttcikicrsfqamgfk.supabase.co:5432/postgres
JWT_SECRET=your-production-secret-key-32-chars-min
GOOGLE_MAPS_API_KEY=AIzaSyAFrsDUcA9JqNDT52646JKwGPBu5BdvyW0

# Supabase
SUPABASE_URL=https://dhyfttcikicrsfqamgfk.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_key

# 可选
RESEND_API_KEY=your_key
OPENAI_API_KEY=your_key
R2_PUBLIC_URL=https://wanderlog-images.xxx.workers.dev
R2_UPLOAD_SECRET=your_secret
```

---

## 部署后验证

```bash
# 健康检查
curl https://your-project.vercel.app/health

# 测试 API
curl https://your-project.vercel.app/api/public-places?limit=1
```

---

## 自定义域名（可选）

1. Vercel Dashboard → Settings → Domains
2. 添加 `api.yourdomain.com`
3. 在 DNS 添加：
   - CNAME: `api` → `cname.vercel-dns.com`

---

## Vercel 免费版限制

| 限制 | 免费版 |
|------|--------|
| 函数执行时间 | 10秒 |
| 函数内存 | 1024MB |
| 带宽 | 100GB/月 |
| 部署次数 | 无限 |
| 自定义域名 | 支持 |

对于你的后端 API，这些限制完全够用。

---

## 注意事项

1. **冷启动**: 首次请求可能需要 1-2 秒
2. **数据库连接**: 使用 Pooler 连接避免连接数问题
3. **静态文件**: admin.html 后台也会一起部署
4. **日志**: 在 Vercel Dashboard → Logs 查看

---

## 更新 Flutter App

部署成功后，更新 Flutter App 的 API 地址：

```dart
// wanderlog_app/lib/core/config/api_config.dart
const String apiBaseUrl = 'https://your-project.vercel.app';
```
