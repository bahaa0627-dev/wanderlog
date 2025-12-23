# Vago.to 部署指南

## 架构概览

```
测试环境 (当前)：
├── api-test.vago.to    → Cloudflare Workers (API 服务)
├── admin-test.vago.to  → Cloudflare Pages (后台管理)
├── images.vago.to      → Cloudflare Workers + R2 (图片服务，已有)
└── 数据库              → Supabase (测试项目)

生产环境 (未来)：
├── api.vago.to         → Cloudflare Workers (API 服务)
├── admin.vago.to       → Cloudflare Pages (后台管理)
├── images.vago.to      → Cloudflare Workers + R2 (图片服务)
└── 数据库              → Supabase (生产项目)
```

## 第一步：部署后台管理页面到 Cloudflare Pages

### 1.1 准备静态文件

后台管理页面 `wanderlog_api/public/admin.html` 需要修改为支持配置 API 地址：

```javascript
// 在 admin.html 顶部添加
const API_HOST = window.location.hostname.includes('test') 
  ? 'https://api-test.vago.to' 
  : 'https://api.vago.to';
```

### 1.2 通过 Cloudflare Dashboard 部署

1. 登录 Cloudflare Dashboard
2. 进入 Pages
3. 创建项目 → 直接上传
4. 上传 `wanderlog_api/public` 文件夹
5. 项目名称：`vago-admin-test`
6. 部署后获得 URL：`vago-admin-test.pages.dev`

### 1.3 绑定自定义域名

1. 在 Pages 项目设置中
2. Custom domains → Add domain
3. 输入：`admin-test.vago.to`
4. Cloudflare 会自动配置 DNS

## 第二步：部署 API 到 Cloudflare Workers

由于你的 API 是 Express.js 应用，有两个选择：

### 选项 A：使用 Cloudflare Workers + Hono（推荐，需要重构）

将 Express API 迁移到 Hono 框架，原生支持 Cloudflare Workers。

### 选项 B：使用外部服务器 + Cloudflare Tunnel（快速，保持现有代码）

使用 Cloudflare Tunnel 将本地/服务器的 API 暴露到公网。

### 选项 C：部署到 Railway/Render + Cloudflare 代理（推荐生产环境）

1. 部署 API 到 Railway（免费额度足够测试）
2. 通过 Cloudflare 代理域名

## 第三步：配置 DNS（在 Cloudflare Dashboard）

确保 vago.to 域名已添加到 Cloudflare，然后添加以下记录：

| 类型 | 名称 | 内容 | 代理状态 |
|------|------|------|----------|
| CNAME | admin-test | vago-admin-test.pages.dev | 已代理 |
| CNAME | api-test | (取决于部署方式) | 已代理 |
| CNAME | images | wanderlog-images.workers.dev | 已代理 |

## 快速开始：使用 Cloudflare Tunnel（最快方式）

如果你想快速让本地 API 通过域名访问：

```bash
# 1. 安装 cloudflared
brew install cloudflare/cloudflare/cloudflared

# 2. 登录
cloudflared tunnel login

# 3. 创建隧道
cloudflared tunnel create vago-api-test

# 4. 配置 DNS（自动）
cloudflared tunnel route dns vago-api-test api-test.vago.to

# 5. 运行隧道
cloudflared tunnel run --url http://localhost:3000 vago-api-test
```

这样 `https://api-test.vago.to` 就会指向你本地的 `localhost:3000`。

## 环境变量配置

### Supabase 配置（已有）
- DATABASE_URL
- DIRECT_URL
- SUPABASE_URL
- SUPABASE_ANON_KEY

### Cloudflare 配置
- R2_BUCKET_NAME: vago-assets
- UPLOAD_SECRET: (设置一个安全的密钥)

## 下一步

1. 先用 Cloudflare Tunnel 快速测试
2. 确认功能正常后，再考虑正式部署到 Railway/Render
3. 生产环境使用独立的 Supabase 项目
