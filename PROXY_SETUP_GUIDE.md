# 🌐 使用代理测试 Google Maps API

## 📋 问题诊断
网络超时错误，需要通过代理访问 Google Maps API

## ✅ 解决方案
已配置代理: `http://127.0.0.1:7890`

## 🚀 测试步骤

### 第 0 步：安装代理依赖（首次运行）

1. 按 **Cmd + Shift + P**
2. 输入 `Tasks: Run Task`
3. 选择 **0️⃣ 安装代理依赖**
4. 等待安装完成

### 第 1 步：测试 Google Maps API（带代理）

1. 按 **Cmd + Shift + P**
2. 输入 `Tasks: Run Task`
3. 选择 **🧪 测试 Google Maps API (直接)**

**预期输出:**
```
🧪 测试 Google Maps API
====================================

🔑 API Key: AIzaSyAFrsDUcA9JqNDT...
📍 Place ID: ChIJLU7jZClu5kcR4PcOOO6p3I0
🌐 代理设置: http://127.0.0.1:7890
🔗 测试 URL: ...

⏱️  开始请求...

⏱️  请求耗时: XXXms

📊 响应状态: OK
✅ API 调用成功！

📍 地点名称: Eiffel Tower
📮 地址: Champ de Mars, 5 Av. Anatole France, 75007 Paris, France
```

### 第 2 步：启动 API 服务（带代理）

如果测试成功，现在启动服务：

1. 按 **Cmd + Shift + P**
2. 输入 `Tasks: Run Task`
3. 选择 **1️⃣ 启动 API 服务**
4. 服务会自动使用代理设置

### 第 3 步：测试添加地点

服务启动后：

1. 按 **Cmd + Shift + P**
2. 输入 `Tasks: Run Task`
3. 选择 **2️⃣ 测试添加地点 - 埃菲尔铁塔**

**预期成功响应:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "placeId": "ChIJLU7jZClu5kcR4PcOOO6p3I0",
    "name": "Eiffel Tower",
    "city": "Paris",
    "country": "France",
    ...
  },
  "message": "Place added successfully"
}
```

## 🔧 已配置的代理设置

### 1. VS Code 任务配置
所有需要网络访问的任务都已配置代理：
- ✅ 1️⃣ 启动 API 服务
- ✅ 🧪 测试 Google Maps API

### 2. 启动脚本
`START_SERVER.sh` 已添加代理环境变量：
```bash
export http_proxy=http://127.0.0.1:7890
export https_proxy=http://127.0.0.1:7890
```

### 3. 测试脚本
`test_google_api.js` 已使用 `https-proxy-agent`

## ⚙️ 修改代理地址

如果你的代理地址不是 `127.0.0.1:7890`，需要修改以下文件：

### 1. 修改 tasks.json
文件位置: `.vscode/tasks.json`

找到并修改所有出现的代理地址：
```json
"env": {
  "http_proxy": "http://YOUR_PROXY_HOST:PORT",
  "https_proxy": "http://YOUR_PROXY_HOST:PORT"
}
```

### 2. 修改 START_SERVER.sh
文件位置: `wanderlog_api/START_SERVER.sh`

修改这两行：
```bash
export http_proxy=http://YOUR_PROXY_HOST:PORT
export https_proxy=http://YOUR_PROXY_HOST:PORT
```

### 3. 修改 test_google_api.js
文件位置: `wanderlog_api/test_google_api.js`

修改这一行：
```javascript
const proxyUrl = process.env.https_proxy || process.env.http_proxy || 'http://YOUR_PROXY_HOST:PORT';
```

## 🔍 故障排查

### 问题 1: 代理连接失败
**错误**: `Error: connect ECONNREFUSED 127.0.0.1:7890`

**解决方案**:
1. 确认代理软件正在运行（Clash、V2Ray、Shadowsocks 等）
2. 检查代理端口是否正确（通常是 7890 或 1087）
3. 确认代理软件允许局部流量

### 问题 2: 仍然超时
**可能原因**:
1. 代理软件未启动
2. 代理规则未包含 Google Maps API
3. 代理服务器本身有问题

**检查方法**:
在终端运行：
```bash
export https_proxy=http://127.0.0.1:7890
curl -I https://www.google.com
```

如果这个命令成功，说明代理工作正常。

### 问题 3: https-proxy-agent 未安装
**错误**: `Cannot find module 'https-proxy-agent'`

**解决方案**:
运行任务 **0️⃣ 安装代理依赖**

或手动安装：
```bash
cd wanderlog_api
npm install https-proxy-agent
```

## 📊 测试检查清单

完成以下步骤确认代理配置正确：

- [ ] 代理软件正在运行
- [ ] 运行 **0️⃣ 安装代理依赖**
- [ ] 运行 **🧪 测试 Google Maps API (直接)** 并成功
- [ ] 运行 **1️⃣ 启动 API 服务**
- [ ] 运行 **2️⃣ 测试添加地点 - 埃菲尔铁塔** 并成功
- [ ] 数据库中成功保存地点

## 🎯 预期时间

使用代理后：
- API 响应时间: 1-5秒（取决于代理速度）
- 总体流程: < 10秒

---

**提示**: 确保你的代理软件（如 Clash、V2Ray）正在运行且端口设置正确！
