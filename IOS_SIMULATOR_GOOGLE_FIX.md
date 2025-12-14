# iOS 模拟器 Google 登录网络问题修复

## 问题
iOS 模拟器显示：`Google 录 败：The connection errored: connection refused`

## 根本原因
iOS 模拟器无法访问 Google 服务器（网络连接被阻止）。这通常是因为：
- 防火墙阻止了 Google 服务
- 没有配置系统代理
- 网络环境限制

## 解决方案

### 方案 1：配置 macOS 系统代理（最简单）

1. **打开系统设置**
   - 点击屏幕左上角的  菜单
   - 选择 "系统设置..." (System Settings)

2. **配置网络代理**
   - 点击 "网络" (Network)
   - 选择当前连接的 Wi-Fi
   - 点击 "详细信息..." (Details)
   - 选择 "代理" (Proxies) 标签

3. **启用代理**
   - 勾选 "网页代理 (HTTP)" (Web Proxy HTTP)
   - 服务器: `127.0.0.1`
   - 端口: `7890`
   - 勾选 "安全网页代理 (HTTPS)" (Secure Web Proxy HTTPS)
   - 服务器: `127.0.0.1`
   - 端口: `7890`
   - 点击 "好" (OK)

4. **重启模拟器**
   ```bash
   # 关闭所有模拟器
   killall Simulator
   
   # 重新运行应用
   cd wanderlog_app
   flutter run
   ```

### 方案 2：使用真机测试

如果代理配置复杂，可以使用真实的 iOS 设备：

```bash
# 连接 iPhone 到电脑
# 然后运行
flutter devices  # 查看设备
flutter run -d [device-id]
```

### 方案 3：临时测试用邮箱登录

Google 登录需要网络连接，但普通的邮箱登录不需要：

1. 在登录页面使用 "Email Login"
2. 输入邮箱和密码
3. 完成邮箱验证

## 验证修复

运行诊断脚本：
```bash
./diagnose_google_signin.sh
```

应该看到：
```
3. 检查网络连接...
✅ 可以访问 Google 服务
```

## 测试 Google 登录

1. 启动应用
2. 点击 "Continue with Google"
3. 选择 Google 账号
4. 应该成功登录并跳转到首页

## 相关文档

- [GOOGLE_LOGIN_QUICK_START.md](GOOGLE_LOGIN_QUICK_START.md) - Google 登录快速开始指南
- [GOOGLE_LOGIN_FIX_SUMMARY.md](GOOGLE_LOGIN_FIX_SUMMARY.md) - 后端代理修复说明

## 常见问题

**Q: 为什么后端配置了代理，前端还是失败？**
A: 后端的代理只影响服务器端的请求。iOS 模拟器是一个独立的进程，它使用 macOS 的系统网络设置。

**Q: 配置系统代理会影响其他应用吗？**
A: 是的，启用系统代理后，所有应用都会通过代理。如果只想在开发时使用，可以在测试完成后关闭。

**Q: 可以绕过 Google 服务器直接登录吗？**  
A: 不可以。Google OAuth 必须与 Google 服务器通信来验证身份。这是安全机制的一部分。

修复日期：2025-12-15
