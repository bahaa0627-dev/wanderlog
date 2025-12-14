# 🧪 邮件服务测试步骤

## 📝 准备工作（5分钟）

### 步骤 1: 注册 Resend 账号

1. 打开浏览器访问：https://resend.com/signup
2. 使用你的邮箱注册（建议用 Gmail）
3. 验证邮箱后登录

### 步骤 2: 获取 API Key

1. 登录后，点击左侧菜单的 **"API Keys"**
2. 点击右上角 **"Create API Key"** 按钮
3. 输入名称（如：`wanderlog-dev`）
4. 点击创建
5. **立即复制**显示的 API Key（格式：`re_xxxxx...`）
   ⚠️ 这个 Key 只显示一次，复制后保存好！

### 步骤 3: 配置环境变量

打开终端，执行：

```bash
cd /Users/bahaa/Desktop/bahaa-dev-repo/wanderlog/wanderlog_api

# 编辑 .env 文件
nano .env

# 或使用 VS Code
code .env
```

找到这一行：
```
RESEND_API_KEY=your_resend_api_key_here
```

替换为你刚才复制的 API Key：
```
RESEND_API_KEY=re_你的实际API_Key
```

保存文件（nano: Ctrl+X, Y, Enter）

## 🧪 运行测试（1分钟）

### 方式 1: 使用 npm script（推荐）

```bash
cd /Users/bahaa/Desktop/bahaa-dev-repo/wanderlog/wanderlog_api

# 替换为你自己的邮箱！
npm run test:email your-email@gmail.com
```

### 方式 2: 使用 shell 脚本

```bash
cd /Users/bahaa/Desktop/bahaa-dev-repo/wanderlog/wanderlog_api

# 替换为你自己的邮箱！
./test_resend.sh your-email@gmail.com
```

## 📊 预期结果

你会看到类似这样的输出：

```
🧪 Testing Email Service...

1️⃣ Verifying email configuration...
✅ Configuration verified

📧 Test email: your-email@gmail.com

2️⃣ Testing verification email...
   Verification code: 123456
✅ Verification email sent successfully

3️⃣ Testing password reset email...
   Reset code: 654321
✅ Password reset email sent successfully

4️⃣ Testing welcome email...
✅ Welcome email sent successfully

📊 Test Summary:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✉️  Verification Email: ✅ PASS
🔒 Password Reset Email: ✅ PASS
🎉 Welcome Email: ✅ PASS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎉 All tests passed! Check your inbox at: your-email@gmail.com
   (Don't forget to check spam folder)
```

## 📬 检查邮箱

1. 打开你的邮箱（你在测试命令中使用的邮箱）
2. 你应该会收到 **3 封邮件**：
   - ✉️ **邮箱验证邮件** - 带6位验证码
   - 🔒 **密码重置邮件** - 带6位验证码
   - 🎉 **欢迎邮件** - 欢迎信息

3. 如果收件箱没有，**检查垃圾邮件文件夹**！

## ⚠️ 常见问题

### 问题 1: "RESEND_API_KEY is not configured"

**原因：** API Key 未正确配置

**解决：**
```bash
# 检查 .env 文件
cat .env | grep RESEND_API_KEY

# 应该看到类似：
# RESEND_API_KEY=re_abc123...xyz

# 如果还是 your_resend_api_key_here，说明没配置
```

### 问题 2: 收不到邮件

**可能原因：**
1. ❌ 使用了别人的邮箱（开发环境限制）
2. ❌ 邮件在垃圾邮件文件夹
3. ❌ API Key 错误
4. ❌ 网络问题

**解决方案：**
- ✅ 确保使用**你自己的邮箱**（开发环境只能发送到你自己的邮箱）
- ✅ 检查垃圾邮件文件夹
- ✅ 在 Resend Dashboard 查看发送记录：https://resend.com/emails
- ✅ 重新生成 API Key 并更新 .env

### 问题 3: "Failed to send email"

**检查步骤：**
```bash
# 1. 测试 API Key 是否有效
curl https://api.resend.com/emails \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json"

# 2. 检查网络连接
ping resend.com

# 3. 查看详细错误日志
npm run test:email your-email@gmail.com 2>&1 | tee test.log
```

## 🎯 测试成功后

邮件服务测试通过后，你可以：

1. **查看邮件内容** - 看看邮件模板是否好看
2. **继续下一步** - 实现认证 API 端点
3. **前端集成** - 创建验证页面

## 💡 重要提示

### 开发环境限制

⚠️ 使用 `onboarding@resend.dev` 作为发件人时：
- **只能发送到你自己的邮箱**
- 免费额度：100 封/月
- 不需要验证域名

### 生产环境

上线时需要：
1. 拥有域名（如 wanderlog.com）
2. 在 Resend 验证域名
3. 配置 DNS 记录
4. 更改发件人为：noreply@yourdomain.com

## 🆘 需要帮助？

如果遇到问题：
1. 查看 [RESEND_SETUP_GUIDE.md](./RESEND_SETUP_GUIDE.md)
2. 访问 Resend 文档：https://resend.com/docs
3. 查看 Resend Dashboard：https://resend.com/emails

---

## 快速命令参考

```bash
# 进入项目目录
cd /Users/bahaa/Desktop/bahaa-dev-repo/wanderlog/wanderlog_api

# 运行测试
npm run test:email your-email@gmail.com

# 检查配置
cat .env | grep RESEND

# 查看日志
tail -f logs/*.log
```

准备好了就运行测试吧！🚀
