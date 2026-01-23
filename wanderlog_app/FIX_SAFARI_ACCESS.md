# 修复 Safari 无法访问 API 的问题

## 🔍 问题分析

Safari 无法打开 `http://192.168.1.6:3000/health` 的可能原因：

1. **后端服务未运行**（最可能）
2. **Mac 防火墙阻止了连接**
3. **Mac 和 iPhone 不在同一 Wi-Fi 网络**

## ✅ 解决方案

### 步骤 1: 启动后端服务（必需）

后端服务当前未运行，需要先启动：

```bash
cd wanderlog_api
npm run dev
```

应该看到：
```
✅ Server is running on 0.0.0.0:3000
```

**保持这个终端运行！**

### 步骤 2: 检查 Mac 防火墙

1. **打开系统设置**
   - 系统设置 > 网络 > 防火墙

2. **配置防火墙**
   - 如果防火墙已启用：
     - 点击 **"选项"** (Options)
     - 确保 **"阻止所有传入连接"** 未勾选
     - 或者添加 Node.js 到允许列表
   - 或者临时关闭防火墙测试

### 步骤 3: 验证网络连接

#### 从 Mac 测试：
```bash
curl http://192.168.1.6:3000/health
```

应该看到：
```json
{"status":"ok","timestamp":"..."}
```

#### 从 iPhone Safari 测试：

1. 确保后端服务正在运行
2. 确保 Mac 和 iPhone 在同一 Wi-Fi 网络
3. 在 iPhone Safari 中打开：
   ```
   http://192.168.1.6:3000/health
   ```

如果仍然无法访问：
- 检查 Mac 防火墙设置
- 确认 Mac IP 地址是否正确：`ipconfig getifaddr en0`
- 尝试临时关闭防火墙测试

### 步骤 4: 检查后端服务监听地址

后端服务应该监听 `0.0.0.0`（所有网络接口），这样可以从其他设备访问。

从代码中看到已正确配置：
```typescript
app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`✅ Server is running on 0.0.0.0:${PORT}`);
});
```

## 🧪 测试步骤

### 1. 启动后端服务

```bash
cd wanderlog_api
npm run dev
```

### 2. 从 Mac 测试

```bash
# 测试本地访问
curl http://localhost:3000/health

# 测试 IP 访问
curl http://192.168.1.6:3000/health
```

### 3. 从 iPhone Safari 测试

打开：`http://192.168.1.6:3000/health`

应该看到 JSON 响应。

## ⚠️ 常见问题

### Q: 后端服务启动后仍然无法访问
**A**: 
1. 检查防火墙设置
2. 确认 Mac 和 iPhone 在同一 Wi-Fi
3. 验证 Mac IP 地址：`ipconfig getifaddr en0`

### Q: 防火墙已关闭但仍然无法访问
**A**:
1. 检查后端服务是否真的在运行：`lsof -i :3000`
2. 确认服务监听 `0.0.0.0` 而不是 `127.0.0.1`
3. 检查路由器设置（某些路由器可能阻止设备间通信）

### Q: 如何确认 Mac IP 地址
**A**:
```bash
# 方法 1
ipconfig getifaddr en0

# 方法 2
ifconfig | grep "inet " | grep -v 127.0.0.1
```

## 📝 快速检查清单

- [ ] 后端服务正在运行（`lsof -i :3000`）
- [ ] 可以从 Mac 访问 `http://192.168.1.6:3000/health`
- [ ] Mac 和 iPhone 在同一 Wi-Fi 网络
- [ ] Mac 防火墙允许端口 3000
- [ ] Mac IP 地址正确（`192.168.1.6`）

## 🎯 预期结果

修复后：
- ✅ 可以从 Mac 访问 API
- ✅ 可以从 iPhone Safari 访问 API
- ✅ 应用可以正常连接到后端
