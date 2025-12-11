# 🚀 Wanderlog 项目运行指南

## 前置要求检查

### 已安装 ✅
- ✅ Node.js 和 npm
- ✅ 项目依赖已安装

### 需要安装 ⚠️
- ❌ PostgreSQL 数据库
- ❌ Flutter SDK

---

## 方案一：完整运行（推荐）

### 步骤 1: 安装并启动 PostgreSQL

#### macOS 安装方式：
```bash
# 方式 1: 使用 Homebrew（推荐）
brew install postgresql@15
brew services start postgresql@15

# 方式 2: 使用 Postgres.app（GUI 方式）
# 下载：https://postgresapp.com/
```

#### 创建数据库：
```bash
# 创建数据库
createdb wanderlog

# 或者使用 psql
psql postgres
CREATE DATABASE wanderlog;
\q
```

### 步骤 2: 配置后端环境变量

```bash
cd wanderlog_api

# 创建 .env 文件
cat > .env << 'EOF'
PORT=3000
DATABASE_URL="postgresql://localhost:5432/wanderlog?schema=public"
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
STRIPE_SECRET_KEY="sk_test_..."
OPENAI_API_KEY="sk-..."
EOF
```

### 步骤 3: 运行数据库迁移

```bash
cd wanderlog_api

# 生成 Prisma Client
npm run db:generate

# 运行迁移（创建表）
npm run db:migrate

# 可选：查看数据库
npm run db:studio
```

### 步骤 4: 启动后端服务器

```bash
cd wanderlog_api
npm run dev
```

**期望输出：**
```
[INFO] Server is running on port 3000
```

后端 API 现在运行在：`http://localhost:3000`

### 步骤 5: 安装 Flutter SDK

```bash
# 使用 Homebrew
brew install --cask flutter

# 或者手动下载
# https://docs.flutter.dev/get-started/install/macos
```

### 步骤 6: 配置 Flutter 项目

```bash
cd wanderlog_app

# 安装依赖
flutter pub get

# 生成代码（JSON 序列化）
flutter pub run build_runner build --delete-conflicting-outputs

# 配置环境变量（创建 .env.dev 文件在 assets 目录）
mkdir -p assets
cat > assets/.env.dev << 'EOF'
API_BASE_URL=http://localhost:3000/api
MAPBOX_ACCESS_TOKEN=pk.your_mapbox_token_here
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
STRIPE_PUBLISHABLE_KEY=pk_test_...
EOF
```

### 步骤 7: 运行 Flutter App

#### iOS 模拟器：
```bash
cd wanderlog_app

# 列出可用设备
flutter devices

# 运行在 iOS 模拟器
flutter run -d ios
```

#### Web 浏览器：
```bash
cd wanderlog_app
flutter run -d chrome
```

---

## 方案二：快速测试（无需数据库）

如果您暂时不想安装 PostgreSQL，可以使用 SQLite 进行本地测试：

### 修改 Prisma Schema 使用 SQLite：

```bash
cd wanderlog_api/prisma
```

编辑 `schema.prisma`，将：
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

改为：
```prisma
datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}
```

### 然后运行：
```bash
cd wanderlog_api

# 更新 .env
echo "DATABASE_URL=\"file:./dev.db\"" > .env

# 生成和迁移
npm run db:generate
npm run db:migrate

# 启动服务器
npm run dev
```

---

## 方案三：只运行前端（使用 Mock 数据）

如果您只想查看前端 UI，暂时不连接后端：

### 修改 Auth Provider 使用 Mock：

```bash
cd wanderlog_app
```

在 `lib/features/auth/providers/auth_provider.dart` 中临时注释掉 API 调用，返回 mock 数据。

---

## 测试运行是否成功

### 1. 测试后端 API

```bash
# 健康检查
curl http://localhost:3000/health

# 注册用户
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "123456",
    "name": "Test User"
  }'

# 登录
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "123456"
  }'
```

### 2. 测试 Flutter App

1. **启动 App** - 应该看到 WanderLog 首页
2. **点击 Sign In** - 跳转到登录页
3. **注册账号** - 填写表单注册
4. **创建 Trip** - 点击 MyLand → 创建行程

---

## 常见问题解决

### 问题 1: PostgreSQL 连接失败

**错误信息：**
```
Error: Can't reach database server at `localhost:5432`
```

**解决方案：**
```bash
# 检查 PostgreSQL 是否运行
brew services list | grep postgresql

# 重启 PostgreSQL
brew services restart postgresql@15

# 检查端口
lsof -i :5432
```

### 问题 2: Flutter 命令找不到

**解决方案：**
```bash
# 添加 Flutter 到 PATH
export PATH="$PATH:`pwd`/flutter/bin"

# 或永久添加到 ~/.zshrc
echo 'export PATH="$PATH:/path/to/flutter/bin"' >> ~/.zshrc
source ~/.zshrc
```

### 问题 3: Prisma 迁移失败

**解决方案：**
```bash
cd wanderlog_api

# 重置数据库
npx prisma migrate reset

# 重新生成
npm run db:generate
npm run db:migrate
```

### 问题 4: Flutter 代码生成失败

**错误信息：**
```
[ERROR] Missing part 'user_model.g.dart'
```

**解决方案：**
```bash
cd wanderlog_app

# 清理
flutter clean
flutter pub get

# 重新生成
flutter pub run build_runner build --delete-conflicting-outputs
```

---

## 推荐的开发工作流

### 终端 1 - 后端：
```bash
cd wanderlog_api
npm run dev
```

### 终端 2 - 数据库可视化（可选）：
```bash
cd wanderlog_api
npm run db:studio
# 访问 http://localhost:5555
```

### 终端 3 - Flutter App：
```bash
cd wanderlog_app
flutter run
```

### 终端 4 - Flutter 热重载监听：
```bash
cd wanderlog_app
flutter pub run build_runner watch
# 保持运行，自动生成代码
```

---

## 一键启动脚本（可选）

创建 `start.sh`：

```bash
#!/bin/bash

echo "🚀 Starting Wanderlog Development Environment..."

# 启动后端
echo "📦 Starting Backend..."
cd wanderlog_api
npm run dev &
BACKEND_PID=$!

# 等待后端启动
sleep 3

# 启动 Flutter
echo "📱 Starting Flutter App..."
cd ../wanderlog_app
flutter run &
FLUTTER_PID=$!

echo "✅ All services started!"
echo "Backend PID: $BACKEND_PID"
echo "Flutter PID: $FLUTTER_PID"
echo ""
echo "Press Ctrl+C to stop all services"

# 捕获 Ctrl+C
trap "kill $BACKEND_PID $FLUTTER_PID; exit" INT

# 保持运行
wait
```

使用：
```bash
chmod +x start.sh
./start.sh
```

---

## 下一步

运行成功后，您可以：

1. ✅ 测试注册和登录流程
2. ✅ 创建您的第一个 Trip
3. ✅ 在地图上探索 Spots（需要配置 Mapbox Token）
4. ✅ 添加 Spots 到 Wishlist
5. ✅ 使用 Check-in 功能记录访问

有任何问题，请查看 `wanderlog_app/README.md` 获取更多帮助。



