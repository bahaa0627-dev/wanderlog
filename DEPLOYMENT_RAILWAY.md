# Railway 部署指南

## 前置条件

1. 注册 Railway 账号: https://railway.app
2. 安装 Railway CLI (可选):
   ```bash
   npm install -g @railway/cli
   ```

## 部署步骤

### 方式一：通过 Railway Dashboard (推荐)

1. **登录 Railway Dashboard**
   - 访问 https://railway.app/dashboard

2. **创建新项目**
   - 点击 "New Project"
   - 选择 "Deploy from GitHub repo"
   - 授权 GitHub 并选择你的仓库

3. **配置部署**
   - Railway 会自动检测 Dockerfile
   - 设置 Root Directory 为 `wanderlog_api`

4. **配置环境变量**
   在 Railway Dashboard → Variables 中添加以下环境变量：

   ```
   # 必需
   DATABASE_URL=postgresql://...
   DIRECT_URL=postgresql://...
   JWT_SECRET=your-secure-jwt-secret
   NODE_ENV=production
   PORT=3000

   # Supabase
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_KEY=your-service-key

   # AI Provider (选择一个)
   # Azure OpenAI
   AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
   AZURE_OPENAI_API_KEY=your-api-key
   AZURE_OPENAI_API_VERSION=2024-02-15-preview
   AZURE_OPENAI_DEPLOYMENT_VISION=gpt-4o
   AZURE_OPENAI_DEPLOYMENT_CHAT=gpt-4o-mini

   # 或 Kouri (中国大陆推荐)
   KOURI_API_KEY=your-kouri-api-key
   KOURI_BASE_URL=https://your-kouri-endpoint/v1

   # 或 Gemini
   GEMINI_API_KEY=your-gemini-api-key

   # AI Provider 顺序
   AI_PROVIDER_ORDER=azure_openai,gemini

   # Google Maps (可选)
   GOOGLE_MAPS_API_KEY=your-google-maps-key

   # Cloudflare R2 (可选)
   R2_ACCOUNT_ID=your-account-id
   R2_ACCESS_KEY_ID=your-access-key
   R2_SECRET_ACCESS_KEY=your-secret-key
   R2_BUCKET_NAME=wanderlog-images
   R2_PUBLIC_URL=https://images.vago.to
   ```

5. **部署**
   - 点击 "Deploy" 按钮
   - 等待构建完成 (约 2-5 分钟)

6. **获取部署 URL**
   - 部署成功后，Railway 会提供一个 URL
   - 格式类似: `https://wanderlog-api-production.up.railway.app`

### 方式二：通过 Railway CLI

```bash
# 登录
railway login

# 进入 API 目录
cd wanderlog_api

# 初始化项目
railway init

# 链接到现有项目或创建新项目
railway link

# 部署
railway up
```

## 配置自定义域名 (可选)

1. 在 Railway Dashboard → Settings → Domains
2. 添加自定义域名: `api.vago.to`
3. 在 Cloudflare DNS 添加 CNAME 记录:
   - 类型: CNAME
   - 名称: api
   - 内容: Railway 提供的域名
   - 代理状态: 已代理 (橙色云朵)

## 验证部署

```bash
# 检查健康状态
curl https://your-railway-url.up.railway.app/health

# 测试 API
curl https://your-railway-url.up.railway.app/api/places?limit=5
```

## 常见问题

### 构建失败
- 检查 Dockerfile 是否正确
- 确保 package.json 中的依赖版本正确

### 数据库连接失败
- 确保 DATABASE_URL 格式正确
- 检查 Supabase 是否允许外部连接

### 环境变量未生效
- 重新部署后环境变量才会生效
- 检查变量名是否正确 (区分大小写)

## 监控和日志

- Railway Dashboard → Deployments → 选择部署 → Logs
- 可以实时查看应用日志
