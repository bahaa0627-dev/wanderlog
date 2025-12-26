# Railway 部署指南

## 快速部署（5分钟）

### 1. 注册 Railway
访问 [railway.app](https://railway.app) 并用 GitHub 登录

### 2. 创建项目
```bash
# 方式一：从 GitHub 部署（推荐）
# 1. 点击 "New Project"
# 2. 选择 "Deploy from GitHub repo"
# 3. 选择你的 wanderlog 仓库
# 4. 选择 wanderlog_api 目录

# 方式二：CLI 部署
npm install -g @railway/cli
railway login
cd wanderlog_api
railway init
railway up
```

### 3. 配置环境变量
在 Railway Dashboard → Variables 中添加：

```env
# 必需
DATABASE_URL=postgresql://postgres.dhyfttcikicrsfqamgfk:xxx@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
DIRECT_URL=postgresql://postgres:xxx@db.dhyfttcikicrsfqamgfk.supabase.co:5432/postgres
JWT_SECRET=your-production-secret-key
GOOGLE_MAPS_API_KEY=your_key

# Supabase
SUPABASE_URL=https://dhyfttcikicrsfqamgfk.supabase.co
SUPABASE_ANON_KEY=your_key
SUPABASE_SERVICE_KEY=your_key

# 可选
RESEND_API_KEY=your_key
OPENAI_API_KEY=your_key
R2_PUBLIC_URL=https://wanderlog-images.xxx.workers.dev
R2_UPLOAD_SECRET=your_secret
```

### 4. 配置域名
Railway 会自动分配一个 `xxx.railway.app` 域名

如需自定义域名：
1. Settings → Domains → Add Custom Domain
2. 添加 `api.yourdomain.com`
3. 在 DNS 添加 CNAME 记录指向 Railway 提供的地址

### 5. 验证部署
```bash
curl https://your-app.railway.app/health
# 应返回 {"status":"ok","timestamp":"..."}

curl https://your-app.railway.app/api/public-places?limit=1
# 应返回地点数据
```

---

## 其他部署选项

### Render（免费版可用）

1. 访问 [render.com](https://render.com)
2. New → Web Service → 连接 GitHub
3. 配置：
   - Root Directory: `wanderlog_api`
   - Build Command: `npm install && npx prisma generate && npm run build`
   - Start Command: `npm start`
4. 添加环境变量

### Fly.io（全球边缘部署）

```bash
# 安装 CLI
brew install flyctl

# 登录
fly auth login

# 初始化
cd wanderlog_api
fly launch

# 设置环境变量
fly secrets set DATABASE_URL="postgresql://..."
fly secrets set JWT_SECRET="..."

# 部署
fly deploy
```

### Docker 自托管

```bash
# 构建镜像
cd wanderlog_api
docker build -t wanderlog-api .

# 运行
docker run -d \
  -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e JWT_SECRET="..." \
  --name wanderlog-api \
  wanderlog-api
```

---

## 生产环境检查清单

- [ ] 使用 Supabase Pooler 连接（不是直连）
- [ ] JWT_SECRET 使用强密钥（32+ 字符）
- [ ] 配置 HTTPS（Railway/Render 自动提供）
- [ ] 设置健康检查端点 `/health`
- [ ] 配置日志监控
- [ ] 升级 Supabase 到 Pro（避免暂停）
- [ ] 更新 Flutter App 的 API 地址

---

## 费用估算

| 服务 | 免费额度 | 预估月费 |
|------|----------|----------|
| Railway | $5 信用 | ~$5-10 |
| Render | 750小时 | $0-7 |
| Fly.io | 3个小实例 | ~$5 |
| Supabase Pro | - | $25 |
| **总计** | - | **$30-40/月** |
