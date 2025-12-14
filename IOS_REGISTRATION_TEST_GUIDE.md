# 📱 iOS 用户注册流程测试指南

## 🎯 测试目标

在 iOS 模拟器上测试完整的用户注册流程，包括：
1. 用户注册
2. 邮箱验证码接收
3. 邮箱验证
4. 登录

---

## 📋 准备工作

### 1. 确保 API 服务正在运行

```bash
cd /Users/bahaa/Desktop/bahaa-dev-repo/wanderlog
# 检查服务状态
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null ; then 
  echo '✅ API 服务正在运行'; 
else 
  echo '❌ API 服务未运行，请先启动';
fi
```

如果服务未运行，启动 API 服务：
```bash
# 方法1: 使用 VS Code Task
# 在 VS Code 中运行 "1️⃣ 启动 API 服务" 任务

# 方法2: 手动启动
cd wanderlog_api
npm run dev
```

### 2. 配置 iOS 模拟器访问本地 API

iOS 模拟器可以通过 `localhost` 或 `127.0.0.1` 直接访问 Mac 上的服务。

**当前配置：**
- API 地址：`http://localhost:3000/api`
- 本机 IP：`192.168.1.5`
- iOS 模拟器可以使用 `localhost:3000`

---

## 🚀 启动 iOS 应用

### 方法 1: 使用 VS Code

```bash
cd /Users/bahaa/Desktop/bahaa-dev-repo/wanderlog/wanderlog_app

# 打开 iOS 模拟器
open -a Simulator

# 等待模拟器启动完成，然后运行
flutter run
```

### 方法 2: 使用 Xcode

```bash
cd /Users/bahaa/Desktop/bahaa-dev-repo/wanderlog/wanderlog_app

# 使用 Xcode 打开
open ios/Runner.xcworkspace

# 在 Xcode 中选择模拟器并运行
```

---

## 📝 测试步骤

### Step 1: 清理测试数据（可选）

如果之前已经注册过测试账号，先清理：

```bash
cd wanderlog_api
npx tsx cleanup_test_user.ts
```

### Step 2: 启动 iOS 应用

1. 在 VS Code 中，打开终端
2. 运行：
   ```bash
   cd wanderlog_app
   flutter run
   ```
3. 选择 iOS 模拟器设备

### Step 3: 注册新用户

在 iOS 应用中：

1. **打开注册页面**
   - 点击 "Sign Up" 或 "Create Account"

2. **填写注册信息**
   - Name (可选): `Test User`
   - Email: `blcubahaa0627@gmail.com`
   - Password: `Test123456`
   - Confirm Password: `Test123456`

3. **提交注册**
   - 点击 "Create Account" 按钮
   - 等待注册完成

4. **检查注册结果**
   - ✅ 应该自动跳转到邮箱验证页面
   - ✅ 页面显示邮箱地址
   - ✅ 显示 6 位验证码输入框

### Step 4: 获取验证码

**方法 1: 检查邮箱**
- 打开邮箱 `blcubahaa0627@gmail.com`
- 查找来自 WanderLog 的验证邮件
- 复制 6 位验证码

**方法 2: 从数据库获取（开发环境）**

在电脑上运行：
```bash
cd wanderlog_api
npx tsx -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const token = await prisma.verificationToken.findFirst({
  where: { 
    user: { email: 'blcubahaa0627@gmail.com' },
    type: 'EMAIL_VERIFICATION'
  },
  orderBy: { createdAt: 'desc' }
});
console.log('验证码:', token?.token);
await prisma.\$disconnect();
"
```

**方法 3: 使用 Prisma Studio**

```bash
cd wanderlog_api
npx prisma studio
```

打开浏览器访问 `http://localhost:5555`，查看 `VerificationToken` 表。

### Step 5: 验证邮箱

在 iOS 应用中：

1. **输入验证码**
   - 在 6 个输入框中输入验证码
   - 输入最后一位后会自动验证

2. **检查验证结果**
   - ✅ 验证成功后应该跳转到主页
   - ✅ 用户状态显示为已验证

### Step 6: 测试登录（可选）

1. **退出登录**
   - 在应用中找到退出按钮并退出

2. **重新登录**
   - Email: `blcubahaa0627@gmail.com`
   - Password: `Test123456`

3. **检查登录结果**
   - ✅ 应该能够成功登录
   - ✅ 进入主页

### Step 7: 测试未验证邮箱无法登录（可选）

1. **注册新用户但不验证邮箱**
2. **尝试登录**
3. **预期结果：** 显示错误消息 "Email not verified"

---

## 🐛 调试技巧

### 查看 Flutter 日志

```bash
# 在运行 flutter run 的终端中查看实时日志
# 或者使用
flutter logs
```

### 查看 API 日志

API 服务的日志会实时显示在启动服务的终端中，包括：
- 注册请求
- 邮件发送状态
- 验证请求
- 错误信息

### 常见问题

#### 1. 无法连接到 API

**症状：** 应用显示网络错误或连接超时

**解决方案：**
```bash
# 1. 检查 API 是否在运行
lsof -Pi :3000 -sTCP:LISTEN

# 2. 检查防火墙设置
# 确保端口 3000 未被阻止

# 3. 在应用中尝试访问
# http://localhost:3000/api/health
```

#### 2. 验证码未收到邮件

**症状：** 注册成功但没有收到邮件

**解决方案：**
1. 检查 API 日志，查看邮件发送状态
2. 检查邮箱垃圾邮件文件夹
3. 使用数据库或 Prisma Studio 直接查看验证码

#### 3. 验证码无效

**症状：** 输入验证码后提示无效

**可能原因：**
1. 验证码过期（15分钟有效期）
2. 输入错误
3. 验证码已被使用

**解决方案：**
- 点击 "Resend Code" 重新发送
- 检查数据库中的验证码是否正确

#### 4. Flutter 热重载问题

如果修改了代码但没有生效：
```bash
# 完全重启应用
# 在 flutter run 终端中按 'R' (大写)

# 或者重新运行
flutter run
```

---

## 📊 验证清单

测试完成后，确认以下功能正常：

- [ ] 用户可以成功注册
- [ ] 注册后收到验证邮件
- [ ] 验证码显示在邮件中
- [ ] 未验证邮箱无法登录（返回 403 错误）
- [ ] 验证码输入界面显示正常
- [ ] 输入验证码后可以成功验证
- [ ] 验证成功后自动跳转到主页
- [ ] 验证后可以正常登录
- [ ] 用户信息显示正确（emailVerified: true）
- [ ] 可以重新发送验证码

---

## 🔧 测试辅助脚本

### 快速清理并重新测试

创建一个快速测试脚本：

```bash
#!/bin/bash

echo "🧹 清理测试用户..."
cd /Users/bahaa/Desktop/bahaa-dev-repo/wanderlog/wanderlog_api
npx tsx cleanup_test_user.ts

echo ""
echo "✅ 准备就绪！"
echo ""
echo "📱 现在可以在 iOS 应用中注册测试用户："
echo "   Email: blcubahaa0627@gmail.com"
echo "   Password: Test123456"
echo ""
echo "📧 查看验证码："
echo "   方法1: 检查邮箱 blcubahaa0627@gmail.com"
echo "   方法2: npx prisma studio (访问 http://localhost:5555)"
echo ""
```

保存为 `wanderlog/quick_test_ios.sh` 并运行：
```bash
chmod +x quick_test_ios.sh
./quick_test_ios.sh
```

---

## 📸 预期截图

### 1. 注册页面
- 显示 Name、Email、Password、Confirm Password 输入框
- 有 "Create Account" 按钮
- 有 "Already have an account? Sign in" 链接

### 2. 验证页面
- 显示邮箱图标
- 显示 "Check Your Email" 标题
- 显示用户邮箱地址
- 6 个验证码输入框
- "Resend Code" 按钮（带倒计时）

### 3. 验证成功
- 自动跳转到主页
- 显示用户信息

---

## 🎉 测试完成

如果所有步骤都成功完成，恭喜！iOS 上的用户注册流程已经完全正常工作！

需要帮助？查看：
- API 日志：启动 API 服务的终端
- Flutter 日志：`flutter logs`
- 数据库：`npx prisma studio`
