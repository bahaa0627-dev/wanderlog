# Azure OpenAI 设置指南

本指南介绍如何为 VAGO/Wanderlog 应用配置 Azure OpenAI 服务。

## 为什么使用 Azure OpenAI？

- 中国信用卡无法直接使用 OpenAI，Azure OpenAI 提供了替代方案
- Azure OpenAI 提供与 OpenAI 相同的模型（GPT-4o、GPT-4o-mini）
- 支持企业级 SLA 和合规性要求

## 前置条件

- Azure 账户（可使用国际信用卡或企业账户）
- Azure 订阅（可使用免费试用）

## 设置步骤

### 1. 创建 Azure OpenAI 资源

1. 登录 [Azure Portal](https://portal.azure.com)

2. 点击 **"创建资源"** (Create a resource)

3. 搜索 **"Azure OpenAI"** 并选择

4. 点击 **"创建"** (Create)

5. 填写资源信息：
   - **订阅**: 选择你的 Azure 订阅
   - **资源组**: 创建新的或选择现有的
   - **区域**: 选择支持 GPT-4o 的区域（推荐 East US、West Europe）
   - **名称**: 输入唯一的资源名称（如 `wanderlog-openai`）
   - **定价层**: 选择 Standard S0

6. 点击 **"审阅 + 创建"** → **"创建"**

7. 等待部署完成（约 1-2 分钟）

### 2. 部署模型

创建资源后，需要部署具体的模型：

1. 进入创建的 Azure OpenAI 资源

2. 点击左侧菜单的 **"模型部署"** (Model deployments) 或 **"Azure OpenAI Studio"**

3. 点击 **"创建新部署"** (Create new deployment)

4. **部署 GPT-4o（用于图片识别）**：
   - 模型: `gpt-4o`
   - 部署名称: `gpt-4o`（或自定义名称）
   - 版本: 选择最新版本
   - 点击 **"创建"**

5. **部署 GPT-4o-mini（用于文本生成）**：
   - 模型: `gpt-4o-mini`
   - 部署名称: `gpt-4o-mini`（或自定义名称）
   - 版本: 选择最新版本
   - 点击 **"创建"**

### 3. 获取 API 密钥和端点

1. 在 Azure OpenAI 资源页面，点击左侧菜单的 **"密钥和终结点"** (Keys and Endpoint)

2. 记录以下信息：
   - **终结点** (Endpoint): `https://your-resource-name.openai.azure.com/`
   - **密钥 1** 或 **密钥 2** (Key): `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### 4. 配置环境变量

在 `wanderlog_api/.env` 文件中添加以下配置：

```bash
# Azure OpenAI 配置
AZURE_OPENAI_ENDPOINT=https://your-resource-name.openai.azure.com
AZURE_OPENAI_API_KEY=your-api-key-here
AZURE_OPENAI_API_VERSION=2024-02-15-preview
AZURE_OPENAI_DEPLOYMENT_VISION=gpt-4o
AZURE_OPENAI_DEPLOYMENT_CHAT=gpt-4o-mini

# Provider 优先级（可选，默认 azure_openai,gemini）
AI_PROVIDER_ORDER=azure_openai,gemini
```

**注意**：
- `AZURE_OPENAI_DEPLOYMENT_VISION` 和 `AZURE_OPENAI_DEPLOYMENT_CHAT` 应与你在步骤 2 中创建的部署名称一致
- 如果你使用了自定义部署名称，请相应修改

## 验证配置

启动服务后，可以通过日志确认 Azure OpenAI 是否正确初始化：

```bash
npm run dev
```

查看日志中是否有类似输出：
```
[AIService] Azure OpenAI provider initialized successfully
[AIService] Available providers: azure_openai, gemini
```

## API 版本说明

| API 版本 | 状态 | 说明 |
|---------|------|------|
| `2024-02-15-preview` | 推荐 | 支持 GPT-4o vision 功能 |
| `2024-05-01-preview` | 最新 | 最新功能，可能不稳定 |
| `2023-12-01-preview` | 稳定 | 不支持最新模型 |

## 常见问题

### Q: 部署模型时提示配额不足？

A: 某些区域的 GPT-4o 配额有限。尝试：
1. 选择其他区域（如 Sweden Central、Canada East）
2. 申请增加配额：Azure Portal → 订阅 → 使用情况 + 配额 → 请求增加

### Q: API 调用返回 401 错误？

A: 检查：
1. API Key 是否正确复制（无多余空格）
2. Endpoint URL 是否正确（末尾无多余斜杠）
3. 部署名称是否与配置一致

### Q: API 调用返回 404 错误？

A: 检查：
1. 部署名称是否正确
2. API 版本是否支持该模型
3. 模型是否已成功部署

### Q: 如何切换到 Gemini 作为主要 Provider？

A: 修改环境变量：
```bash
AI_PROVIDER_ORDER=gemini,azure_openai
```

## 成本估算

Azure OpenAI 按 token 计费：

| 模型 | 输入价格 | 输出价格 |
|------|---------|---------|
| GPT-4o | $5.00 / 1M tokens | $15.00 / 1M tokens |
| GPT-4o-mini | $0.15 / 1M tokens | $0.60 / 1M tokens |

**典型使用场景**：
- 图片识别（GPT-4o）：约 1000-2000 tokens/次
- 地点推荐（GPT-4o-mini）：约 500-1000 tokens/次

## 相关链接

- [Azure OpenAI 文档](https://learn.microsoft.com/azure/ai-services/openai/)
- [Azure OpenAI 定价](https://azure.microsoft.com/pricing/details/cognitive-services/openai-service/)
- [Azure OpenAI API 参考](https://learn.microsoft.com/azure/ai-services/openai/reference)
- [支持的区域和模型](https://learn.microsoft.com/azure/ai-services/openai/concepts/models)
