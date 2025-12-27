# Requirements Document

## Introduction

本文档定义了 VAGO 应用接入 Azure OpenAI 服务的需求。由于中国信用卡无法直接使用 OpenAI，需要通过 Azure OpenAI 作为中转来访问 GPT 模型。Azure OpenAI 提供与 OpenAI 相同的模型能力，但使用不同的 API 端点和认证方式。

## Glossary

- **AI_Service**: 负责所有 AI 相关操作的服务组件，包括图片识别、地点推荐、标签生成等
- **Azure_OpenAI**: 微软 Azure 平台托管的 OpenAI 服务，提供 GPT 模型访问，作为 OpenAI Direct 的替代方案
- **Deployment_Name**: Azure OpenAI 中部署的模型名称，对应 OpenAI 的模型名（如 gpt-4o、gpt-4o-mini）
- **API_Version**: Azure OpenAI API 版本号，如 2024-02-15-preview

## Requirements

### Requirement 1: Azure OpenAI 配置管理

**User Story:** As a system operator, I want to configure Azure OpenAI credentials, so that the system can access GPT models via Azure.

#### Acceptance Criteria

1. THE AI_Service SHALL support Azure OpenAI configuration including endpoint URL, API key, and API version
2. THE AI_Service SHALL support configuring deployment names for GPT-4o (vision) and GPT-4o-mini (chat)
3. WHEN Azure OpenAI configuration is provided, THE AI_Service SHALL use Azure endpoint instead of OpenAI direct endpoint
4. THE AI_Service SHALL validate Azure configuration on startup and log status

### Requirement 2: Azure OpenAI 图片识别

**User Story:** As a user, I want to identify places from images using Azure OpenAI, so that I can add places to my collection.

#### Acceptance Criteria

1. WHEN Azure OpenAI is configured, THE AI_Service SHALL send image identification requests to Azure endpoint
2. THE AI_Service SHALL format requests according to Azure OpenAI API specifications (different from OpenAI direct)
3. THE AI_Service SHALL use the GPT-4o deployment for vision tasks
4. THE AI_Service SHALL parse Azure responses and return standard PlaceIdentificationResult

### Requirement 3: Azure OpenAI 文本生成

**User Story:** As a user, I want to get place recommendations and tags using Azure OpenAI, so that I can discover new places.

#### Acceptance Criteria

1. WHEN Azure OpenAI is configured, THE AI_Service SHALL send text generation requests to Azure endpoint
2. THE AI_Service SHALL use the GPT-4o-mini deployment for text tasks (recommendations, tags)
3. THE AI_Service SHALL handle Azure-specific headers (api-key instead of Authorization Bearer)
4. THE AI_Service SHALL maintain existing response format for compatibility

### Requirement 4: Gemini 备选支持

**User Story:** As a system operator, I want Gemini as a fallback option, so that the system has redundancy.

#### Acceptance Criteria

1. THE AI_Service SHALL continue to support Gemini as an alternative provider
2. WHEN Azure OpenAI fails, THE AI_Service SHALL fallback to Gemini if configured
3. THE AI_Service SHALL allow configuration of preferred provider order (azure_openai, gemini)
4. THE AI_Service SHALL log which provider was used for each request

### Requirement 5: 错误处理

**User Story:** As a system operator, I want proper error handling, so that failures are handled gracefully.

#### Acceptance Criteria

1. WHEN Azure OpenAI returns an error, THE AI_Service SHALL log the error with details
2. WHEN Azure OpenAI rate limits (429), THE AI_Service SHALL retry with exponential backoff
3. IF Azure OpenAI fails after retries, THEN THE AI_Service SHALL try Gemini fallback
4. IF all providers fail, THEN THE AI_Service SHALL return a clear error message

### Requirement 6: 环境配置文档

**User Story:** As a developer, I want clear configuration documentation, so that I can set up Azure OpenAI easily.

#### Acceptance Criteria

1. THE System SHALL document required environment variables: AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_API_VERSION
2. THE System SHALL document deployment name variables: AZURE_OPENAI_DEPLOYMENT_GPT4O, AZURE_OPENAI_DEPLOYMENT_GPT4O_MINI
3. THE System SHALL update .env.example with Azure OpenAI configuration template
4. THE System SHALL provide setup instructions for creating Azure OpenAI resource and deployments

