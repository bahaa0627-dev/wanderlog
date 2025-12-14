# Google 登录失败问题修复总结

## 问题描述

用户报告：登录后提示登录失败

## 问题原因

通过查看后端日志，发现以下错误：

```
Google token verification failed: Failed to retrieve verification certificates: 
request to https://www.googleapis.com/oauth2/v1/certs failed, reason: ETIMEDOUT
```

**根本原因：**
后端的 Google OAuth2 客户端在验证 ID Token 时，需要从 Google 服务器获取公钥证书（`https://www.googleapis.com/oauth2/v1/certs`），但由于网络环境限制，请求超时失败。

虽然 API 服务已经配置了代理环境变量 `HTTP_PROXY=http://127.0.0.1:7890`，但 `google-auth-library` 包默认不会使用环境变量中的代理配置。

## 修复方案

修改 `wanderlog_api/src/controllers/authController.ts` 文件，为 Google OAuth2Client 配置代理：

1. 导入 `https-proxy-agent` 包（已安装）
2. 创建 proxy agent 实例
3. 在初始化 OAuth2Client 时传入 agent 配置

### 修改内容

```typescript
import { HttpsProxyAgent } from 'https-proxy-agent';
import { GaxiosOptions } from 'gaxios';

// Configure proxy agent if needed
let clientOptions: GaxiosOptions = {};
if (process.env.HTTP_PROXY || process.env.http_proxy) {
  const proxyUrl = process.env.HTTP_PROXY || process.env.http_proxy;
  console.log(`[AUTH] Configuring Google OAuth2 client with proxy: ${proxyUrl}`);
  const agent = new HttpsProxyAgent(proxyUrl);
  clientOptions = { agent };
}

// Google OAuth2 Client with proxy support
const googleClient = new OAuth2Client({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  ...clientOptions,
});
```

## 测试步骤

1. **确认 API 服务正在运行**
   ```bash
   # 查看服务状态
   lsof -Pi :3000 -sTCP:LISTEN
   ```

2. **运行 Flutter 应用**
   ```bash
   cd wanderlog_app
   flutter run
   ```

3. **测试 Google 登录**
   - 在应用中点击 "Continue with Google" 按钮
   - 选择 Google 账号并授权
   - 检查是否成功登录并跳转到首页

## 预期结果

- ✅ Google 登录流程正常完成
- ✅ 后端成功验证 Google ID Token
- ✅ 返回用户信息和 JWT tokens
- ✅ 应用跳转到首页

## 如果仍然失败

1. **检查代理是否运行**
   ```bash
   # 测试代理是否可访问
   curl -x http://127.0.0.1:7890 https://www.google.com
   ```

2. **查看 API 服务日志**
   ```bash
   cd wanderlog_api
   tail -f logs/*.log | grep -i "google\|proxy"
   ```

3. **确认环境变量**
   ```bash
   # API 服务应该能看到 HTTP_PROXY 环境变量
   ps aux | grep node | grep wanderlog_api
   ```

## 相关文件

- `wanderlog_api/src/controllers/authController.ts` - 后端登录控制器
- `wanderlog_app/lib/features/auth/services/google_auth_service.dart` - 前端 Google 登录服务
- `wanderlog_app/lib/features/auth/presentation/pages/login_page.dart` - 登录页面

## 技术说明

- **代理支持**：使用 `https-proxy-agent` 包为 HTTP 请求添加代理支持
- **环境变量**：自动检测 `HTTP_PROXY` 或 `http_proxy` 环境变量
- **向后兼容**：如果没有配置代理，代码仍然可以正常工作（直连）

修复日期：2025-12-15
