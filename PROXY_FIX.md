# 🔧 代理配置修复

## 问题
`@googlemaps/google-maps-services-js` 库需要通过 axios 来配置代理

## ✅ 已修复

修改了 `googleMapsService.ts` 以正确支持代理：

```typescript
// 配置代理
const proxyUrl = process.env.https_proxy || process.env.http_proxy;
const clientConfig: any = { timeout: 30000 };

if (proxyUrl) {
  console.log(`🌐 Using proxy: ${proxyUrl}`);
  clientConfig.axiosInstance = require('axios').create({
    httpsAgent: new HttpsProxyAgent(proxyUrl),
    proxy: false
  });
}

const client = new Client(clientConfig);
```

## 🚀 重新测试步骤

### 1. 安装依赖（包括 axios）

按 **Cmd + Shift + P** → `Tasks: Run Task` → **0️⃣ 安装代理依赖**

### 2. 停止当前服务

按 **Cmd + Shift + P** → `Tasks: Run Task` → **🛑 停止端口 3000 的进程**

### 3. 重新启动服务（带代理）

按 **Cmd + Shift + P** → `Tasks: Run Task` → **1️⃣ 启动 API 服务**

现在会看到日志：
```
🌐 Using proxy: http://127.0.0.1:7890
info: Server is running on port 3000
```

### 4. 测试添加地点

按 **Cmd + Shift + P** → `Tasks: Run Task` → **2️⃣ 测试添加地点 - 埃菲尔铁塔**

## 预期结果

成功时会看到：
```json
{
  "success": true,
  "data": {
    "placeId": "ChIJLU7jZClu5kcR4PcOOO6p3I0",
    "name": "Eiffel Tower",
    "city": "Paris",
    "country": "France",
    ...
  }
}
```

服务器日志会显示：
```
🔍 Fetching details for place ID: ChIJLU7jZClu5kcR4PcOOO6p3I0
🔑 Using API key: AIzaSyAFrsDUcA9JqNDT...
✅ API Response Status: OK
```

## 📝 关键更新

1. ✅ 添加了 `https-proxy-agent` 支持
2. ✅ 配置 axios 实例使用代理
3. ✅ 禁用 axios 默认 proxy 配置（避免冲突）
4. ✅ 添加代理使用日志
5. ✅ 保持 30 秒超时设置

## ⚠️ 确认清单

测试前确认：
- [ ] 代理软件正在运行（Clash/V2Ray）
- [ ] 代理端口是 7890（或已修改配置）
- [ ] 已运行 **0️⃣ 安装代理依赖**
- [ ] 已停止旧服务
- [ ] 已重新启动服务

---

如果还是失败，请检查：
1. 代理软件是否真的在运行
2. 终端运行：`export https_proxy=http://127.0.0.1:7890 && curl https://www.google.com` 测试代理
3. 查看服务器日志中的具体错误信息
