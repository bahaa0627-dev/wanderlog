# ⚡️ 快速启动指南（5分钟）

## 第一步：准备后端（2分钟）

### 1. 创建环境配置文件

在 `wanderlog_api` 目录下创建 `.env` 文件（复制下面内容）：

```bash
PORT=3000
DATABASE_URL="file:./dev.db"
JWT_SECRET="wanderlog-dev-secret-key-2024"
STRIPE_SECRET_KEY="sk_test_placeholder"
OPENAI_API_KEY="sk-placeholder"
```

**快速命令：**
```bash
cd wanderlog_api
cp .env.example .env
```

### 2. 初始化数据库

```bash
cd wanderlog_api

# 生成 Prisma Client
npm run db:generate

# 创建数据库表
npm run db:migrate
```

**期望看到：** ✅ Migration completed successfully

### 3. 启动后端服务器

```bash
npm run dev
```

**期望看到：** 
```
[INFO] Server is running on port 3000
```

**保持这个终端运行！** ✋

---

## 第二步：准备 Flutter App（3分钟）

### 1. 安装 Flutter 依赖

打开**新终端**，运行：

```bash
cd wanderlog_app
flutter pub get
```

### 2. 生成代码

```bash
flutter pub run build_runner build --delete-conflicting-outputs
```

**期望看到：** ✅ Succeeded after X.Xs

### 3. 创建环境配置

在 `wanderlog_app` 根目录创建 `.env.dev` 文件：

```
API_BASE_URL=http://localhost:3000/api
MAPBOX_ACCESS_TOKEN=pk.placeholder
GOOGLE_CLIENT_ID=placeholder.apps.googleusercontent.com
```

**快速命令：**
```bash
cd wanderlog_app
cat > .env.dev << 'EOF'
API_BASE_URL=http://localhost:3000/api
MAPBOX_ACCESS_TOKEN=pk.placeholder
GOOGLE_CLIENT_ID=placeholder.apps.googleusercontent.com
EOF
```

### 4. 运行 Flutter App

#### iOS 模拟器（推荐）：
```bash
flutter run -d ios
```

#### 或者在 Chrome 浏览器：
```bash
flutter run -d chrome
```

---

## 🎉 完成！开始使用

App 启动后：

1. **注册账号**
   - 点击右上角 "sign in"
   - 点击 "Create account"
   - 填写邮箱和密码

2. **创建第一个 Trip**
   - 点击底部 "MyLand"
   - 点击 "New Trip" 按钮
   - 输入 Trip 名称（如 "Tokyo Adventure"）

3. **探索功能**
   - 查看 Wishlist、Today's Plan、Visited 三个标签
   - 测试添加 Spot、修改状态、评分功能

---

## 📝 快速命令汇总

### 后端启动（终端 1）：
```bash
cd wanderlog_api
npm run dev
```

### Flutter 启动（终端 2）：
```bash
cd wanderlog_app
flutter run
```

就这么简单！🚀

---

## ⚠️ 常见问题

### 问题：Flutter 命令不存在
**解决：** 需要先安装 Flutter SDK
```bash
brew install --cask flutter
flutter doctor
```

### 问题：后端启动失败
**解决：** 检查 3000 端口是否被占用
```bash
lsof -i :3000
# 如果有进程，kill 掉
kill -9 <PID>
```

### 问题：代码生成失败
**解决：** 清理后重新生成
```bash
cd wanderlog_app
flutter clean
flutter pub get
flutter pub run build_runner build --delete-conflicting-outputs
```

---

需要更详细的说明？查看 `RUN_GUIDE.md`






