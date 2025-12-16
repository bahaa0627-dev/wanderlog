# 🚀 Wanderlog 完整运行指南（已配置代理）

## 问题修复：端口被占用

您看到的错误：`Error: listen EADDRINUSE: address already in use :::3000`

**解决方法：**

```bash
# 1. 查找占用 3000 端口的进程
lsof -i :3000

# 2. 杀掉该进程（替换 PID 为上面显示的进程 ID）
kill -9 <PID>

# 或者一键杀掉所有 3000 端口进程
lsof -ti:3000 | xargs kill -9
```

---

## 🎯 完整运行步骤（从零开始）

### 第一部分：后端设置（5分钟）

#### 1. 清理端口并启动后端

```bash
# 进入后端目录
cd wanderlog_api

# 杀掉占用的端口
lsof -ti:3000 | xargs kill -9

# 生成 Prisma Client
npm run db:generate

# 运行数据库迁移
npm run db:migrate

# 启动后端
npm run dev
```

**期望看到：**
```
[INFO] Server is running on port 3000
```

✅ **保持这个终端运行！**

---

### 第二部分：Flutter App 设置（10分钟）

#### 2. 打开新终端，设置代理并运行 Flutter

```bash
# 设置代理（您已经设置了）
export http_proxy=http://127.0.0.1:7890
export https_proxy=http://127.0.0.1:7890

# 进入 Flutter 项目
cd wanderlog_app

# 安装依赖
flutter pub get

# 生成代码（JSON 序列化）
flutter pub run build_runner build --delete-conflicting-outputs

# 创建环境配置
cat > .env.dev << 'EOF'
API_BASE_URL=http://localhost:3000/api
MAPBOX_ACCESS_TOKEN=pk.placeholder
GOOGLE_CLIENT_ID=placeholder
EOF

# 查看可用设备
flutter devices

# 在 iOS 模拟器运行
flutter run -d ios

# 或在 Chrome 运行
flutter run -d chrome
```

---

## 📱 测试流程

### App 启动后：

1. **注册账号**
   - 点击右上角 "sign in"
   - 点击 "Create account"
   - 填写：
     - Email: `demo@wanderlog.com`
     - Password: `123456`
     - Name: `Demo User`

2. **创建第一个 Trip**
   - 点击底部 "MyLand"
   - 点击右下角 "New Trip" 按钮
   - 输入：
     - Trip Name: `Tokyo Adventure`
     - City: `Tokyo`
   - 点击 "Create"

3. **查看 Trip 详情**
   - 点击刚创建的 Trip 卡片
   - 看到三个标签页：Wishlist、Today's Plan、Visited

4. **测试功能**（虽然还没有真实数据）
   - 切换不同标签页
   - 体验界面交互

---

## 🧪 或者用 API 测试（无需 Flutter）

如果 Flutter 还是有问题，可以直接测试后端：

### 在浏览器测试：

1. **健康检查：** http://localhost:3000/health

### 用 curl 测试完整流程：

```bash
# 1. 注册用户
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "demo@wanderlog.com",
    "password": "123456",
    "name": "Demo User"
  }'

# 会返回 token，复制下来
# 输出示例：
# {
#   "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
#   "user": {...}
# }

# 2. 创建行程（把下面的 YOUR_TOKEN 替换为上面的 token）
curl -X POST http://localhost:3000/api/trips \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "Tokyo Adventure",
    "city": "Tokyo"
  }'

# 3. 获取行程列表
curl http://localhost:3000/api/trips \
  -H "Authorization: Bearer YOUR_TOKEN"

# 4. 导入一个地点
curl -X POST http://localhost:3000/api/spots/import \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "googlePlaceId": "ChIJ_xkgOm2LGGAR2pq9wqO_j1g",
    "name": "Senso-ji Temple",
    "latitude": 35.7148,
    "longitude": 139.7967,
    "address": "2 Chome-3-1 Asakusa, Taito City, Tokyo",
    "category": "temple"
  }'

# 返回的 spot 会有一个 id，复制下来

# 5. 获取行程详情（把 TRIP_ID 替换为之前创建的行程 id）
curl http://localhost:3000/api/trips/TRIP_ID \
  -H "Authorization: Bearer YOUR_TOKEN"

# 6. 添加地点到行程（替换 TRIP_ID 和 SPOT_ID）
curl -X PUT http://localhost:3000/api/trips/TRIP_ID/spots \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "spotId": "SPOT_ID",
    "status": "WISHLIST",
    "priority": "MUST_GO"
  }'

# 7. 标记为已访问并评分
curl -X PUT http://localhost:3000/api/trips/TRIP_ID/spots \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "spotId": "SPOT_ID",
    "status": "VISITED",
    "visitDate": "2024-12-10T10:00:00.000Z",
    "userRating": 5,
    "userNotes": "Amazing temple! Beautiful architecture."
  }'
```

---

## 🎨 查看 UI 代码

想看某个页面怎么实现的？

```bash
# 查看登录页面
cat wanderlog_app/lib/features/auth/presentation/pages/login_page.dart | less

# 查看主页
cat wanderlog_app/lib/features/trips/presentation/pages/home_page.dart | less

# 查看行程详情页（三个标签）
cat wanderlog_app/lib/features/trips/presentation/pages/trip_detail_page.dart | less

# 查看地图页
cat wanderlog_app/lib/features/map/presentation/pages/map_view_page.dart | less

# 查看 Check-in 组件
cat wanderlog_app/lib/features/trips/presentation/widgets/spot_list_item.dart | less
```

---

## 📊 查看数据库

如果想可视化查看数据库内容：

```bash
cd wanderlog_api
npm run db:studio
```

会在浏览器打开 Prisma Studio：http://localhost:5555

可以看到：
- Users 表
- Trips 表
- Spots 表
- TripSpots 表

---

## 🔧 常见问题

### 问题 1: 端口被占用

```bash
# 查看占用端口的进程
lsof -i :3000

# 杀掉进程
kill -9 <PID>
```

### 问题 2: Prisma 错误

```bash
cd wanderlog_api
npx prisma generate
npx prisma migrate reset  # 重置数据库
npx prisma migrate dev    # 重新迁移
```

### 问题 3: Flutter 代码生成错误

```bash
cd wanderlog_app
flutter clean
flutter pub get
flutter pub run build_runner build --delete-conflicting-outputs
```

### 问题 4: iOS 模拟器没有启动

```bash
# 打开 Xcode
open -a Simulator

# 等待模拟器启动后
flutter run
```

---

## 📂 项目结构

```
wanderlog/
├── wanderlog_api/          # 后端 API
│   ├── src/
│   │   ├── controllers/    # API 控制器
│   │   ├── routes/         # 路由定义
│   │   ├── middleware/     # 中间件（认证等）
│   │   └── config/         # 数据库配置
│   ├── prisma/
│   │   └── schema.prisma   # 数据库模型
│   └── .env               # 环境配置
│
├── wanderlog_app/         # Flutter App
│   └── lib/
│       ├── core/          # 核心工具
│       ├── features/      # 功能模块
│       │   ├── auth/      # 认证
│       │   ├── trips/     # 行程管理
│       │   └── map/       # 地图
│       └── shared/        # 共享组件
│
├── START_HERE.md          # 快速开始
├── UI_PREVIEW.md          # UI 预览
├── TEST_API.md            # API 测试
└── COMPLETE_RUN_GUIDE.md  # 本文件
```

---

## ✅ 检查清单

运行前确认：

- [ ] 后端依赖已安装 (`npm install`)
- [ ] 数据库已迁移 (`npm run db:migrate`)
- [ ] 后端服务运行中 (端口 3000)
- [ ] 代理已设置 (如需要)
- [ ] Flutter 依赖已安装 (`flutter pub get`)
- [ ] 代码已生成 (`build_runner`)
- [ ] `.env.dev` 文件已创建

---

## 🎉 完成！

现在您应该能看到：
- 后端 API 运行在 http://localhost:3000
- Flutter App 运行在 iOS 模拟器或浏览器
- 可以注册用户、创建行程、管理地点

祝您测试愉快！🚀




