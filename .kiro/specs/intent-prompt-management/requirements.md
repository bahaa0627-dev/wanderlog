# Requirements Document

## Introduction

设计一个 Intent-Prompt 管理系统，将每种意图类型与其对应的 prompt 模板关联起来。通过配置文件集中管理所有 prompt，支持变量替换，使 prompt 的维护和迭代更加便捷，无需修改业务代码。

## Glossary

- **Intent_Type**: 意图类型，包括 `general_search`、`specific_place`、`travel_consultation`、`non_travel`
- **Prompt_Template**: Prompt 模板，包含变量占位符的文本模板
- **Prompt_Registry**: Prompt 注册表，管理所有意图与 prompt 的映射关系
- **Variable_Resolver**: 变量解析器，将模板中的占位符替换为实际值
- **Prompt_Config**: Prompt 配置文件，存储所有 prompt 模板的 JSON/YAML 文件

## Requirements

### Requirement 1: Prompt Configuration File Structure

**User Story:** As a developer, I want all prompts stored in a configuration file, so that I can modify prompts without changing code.

#### Acceptance Criteria

1. THE Prompt_Config SHALL be stored as a JSON file at `wanderlog_api/src/config/prompts.json`
2. THE Prompt_Config SHALL define a schema with `intents` as the root object
3. WHEN defining an intent, THE Prompt_Config SHALL include `intentType`, `name`, `description`, and `prompts` array
4. WHEN defining a prompt, THE Prompt_Config SHALL include `id`, `purpose`, `template`, and `variables` array
5. THE `variables` array SHALL list all variable names used in the template (e.g., `["query", "language"]`)
6. THE Prompt_Config SHALL support multiple prompts per intent (e.g., classification prompt, handler prompt)

### Requirement 2: Variable Replacement System

**User Story:** As a developer, I want to use variables in prompt templates, so that I can inject dynamic values at runtime.

#### Acceptance Criteria

1. THE Variable_Resolver SHALL support `{variableName}` syntax for variable placeholders
2. WHEN a template contains `{query}`, THE Variable_Resolver SHALL replace it with the user's query string
3. WHEN a template contains `{language}`, THE Variable_Resolver SHALL replace it with the language name (e.g., "Chinese", "English")
4. WHEN a template contains `{placeName}`, THE Variable_Resolver SHALL replace it with the specific place name
5. IF a required variable is missing, THEN THE Variable_Resolver SHALL throw an error with the missing variable name
6. THE Variable_Resolver SHALL preserve any unrecognized `{...}` patterns that are part of JSON output format

### Requirement 3: Prompt Registry Service

**User Story:** As a developer, I want a service to load and retrieve prompts, so that I can easily access the right prompt for each intent.

#### Acceptance Criteria

1. THE Prompt_Registry SHALL load prompts from the configuration file on startup
2. WHEN `getPrompt(intentType, promptId)` is called, THE Prompt_Registry SHALL return the matching prompt template
3. WHEN `getPromptForIntent(intentType)` is called, THE Prompt_Registry SHALL return all prompts for that intent
4. IF the requested prompt does not exist, THEN THE Prompt_Registry SHALL throw an error with the intent type and prompt ID
5. THE Prompt_Registry SHALL cache loaded prompts in memory for performance
6. THE Prompt_Registry SHALL support hot-reload of prompts without server restart (optional)

### Requirement 4: Intent-Prompt Mapping

**User Story:** As a developer, I want clear mapping between intents and their prompts, so that I know which prompt to use for each scenario.

#### Acceptance Criteria

1. THE `general_search` intent SHALL have a `classification` prompt for intent detection
2. THE `specific_place` intent SHALL have a `description` prompt for generating place descriptions
3. THE `travel_consultation` intent SHALL have a `response` prompt for generating travel advice
4. THE `non_travel` intent SHALL have a `response` prompt for generating non-travel responses
5. EACH prompt SHALL have a unique `id` within its intent scope
6. THE Prompt_Config SHALL document the purpose of each prompt in the `purpose` field

### Requirement 5: Integration with Existing Services

**User Story:** As a developer, I want the new prompt system to integrate with existing services, so that I can migrate without breaking functionality.

#### Acceptance Criteria

1. THE IntentClassifierService SHALL use Prompt_Registry to get classification prompts
2. THE IntentClassifierService SHALL use Variable_Resolver to inject query and language into prompts
3. WHEN migrating, THE system SHALL maintain backward compatibility with existing response formats
4. THE migration SHALL not change any API response structures
5. THE existing hardcoded prompts SHALL be moved to the configuration file

### Requirement 6: Prompt Validation

**User Story:** As a developer, I want prompts to be validated on load, so that I catch configuration errors early.

#### Acceptance Criteria

1. WHEN loading prompts, THE Prompt_Registry SHALL validate that all required fields are present
2. WHEN loading prompts, THE Prompt_Registry SHALL validate that all declared variables exist in the template
3. IF validation fails, THEN THE Prompt_Registry SHALL log detailed error messages
4. IF validation fails on startup, THEN THE system SHALL fall back to hardcoded default prompts
5. THE Prompt_Registry SHALL warn if a template contains undeclared variables

