# Requirements Document

## Introduction

集成 Kouri API 中转服务作为新的 AI Provider，为中国大陆用户提供访问 OpenAI 模型（如 gpt-4o-mini）的能力。该服务兼容 OpenAI API 格式，可以无缝集成到现有的多 provider 架构中。

## Glossary

- **Kouri_Provider**: 基于 Kouri 中转服务的 AI Provider 实现
- **AI_Service**: 管理多个 AI Provider 的服务层，支持 fallback 机制
- **OpenAI_Compatible_API**: 兼容 OpenAI API 格式的第三方服务接口
- **Provider_Order**: AI Provider 的优先级顺序配置

## Requirements

### Requirement 1: Kouri Provider 实现

**User Story:** As a developer, I want to use Kouri API proxy service, so that I can access OpenAI models from mainland China without international payment methods.

#### Acceptance Criteria

1. THE Kouri_Provider SHALL implement the AIProvider interface with identifyPlace and generateText methods
2. WHEN Kouri API key is configured, THE Kouri_Provider SHALL be available for use
3. WHEN Kouri API key is not configured, THE Kouri_Provider SHALL report unavailable status
4. THE Kouri_Provider SHALL use OpenAI-compatible API format for all requests
5. WHEN making API requests, THE Kouri_Provider SHALL send requests to the configured Kouri base URL

### Requirement 2: 配置管理

**User Story:** As a developer, I want to configure Kouri provider through environment variables, so that I can easily switch between different API providers.

#### Acceptance Criteria

1. THE System SHALL read KOURI_API_KEY from environment variables
2. THE System SHALL read KOURI_BASE_URL from environment variables with default value
3. THE System SHALL read KOURI_MODEL from environment variables with default "gpt-4o-mini"
4. WHEN configuration is incomplete, THE Kouri_Provider SHALL log a warning message

### Requirement 3: Provider 集成

**User Story:** As a developer, I want Kouri provider to work with the existing fallback mechanism, so that I can have reliable AI service with multiple providers.

#### Acceptance Criteria

1. THE AI_Service SHALL support "kouri" as a valid provider name in AI_PROVIDER_ORDER
2. WHEN Kouri is in provider order, THE AI_Service SHALL include it in fallback chain
3. THE Kouri_Provider SHALL return proper error codes for retry logic
4. WHEN Kouri request fails with retryable error, THE AI_Service SHALL retry with exponential backoff

### Requirement 4: 错误处理

**User Story:** As a developer, I want proper error handling for Kouri API calls, so that I can diagnose issues and ensure graceful degradation.

#### Acceptance Criteria

1. WHEN Kouri API returns 429 (rate limited), THE Kouri_Provider SHALL return retryable error
2. WHEN Kouri API returns 401 (unauthorized), THE Kouri_Provider SHALL return non-retryable error
3. WHEN Kouri API times out, THE Kouri_Provider SHALL return retryable error
4. IF API response parsing fails, THEN THE Kouri_Provider SHALL return parse error with details

### Requirement 5: Vision 支持

**User Story:** As a developer, I want Kouri provider to support image recognition, so that I can identify places from images using OpenAI vision models.

#### Acceptance Criteria

1. THE Kouri_Provider SHALL support vision requests using gpt-4o model
2. WHEN vision model is needed, THE Kouri_Provider SHALL use KOURI_VISION_MODEL configuration
3. THE Kouri_Provider SHALL format image URLs in OpenAI vision API format
4. WHEN image identification succeeds, THE Kouri_Provider SHALL return PlaceIdentificationResult
