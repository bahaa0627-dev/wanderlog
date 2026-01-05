# Implementation Plan: Intent-Prompt Management

## Overview

将 AI prompt 从硬编码迁移到配置文件管理，实现 VariableResolver 和 PromptRegistry 服务，并集成到现有的 IntentClassifierService。

## Tasks

- [x] 1. Create type definitions and configuration file
  - [x] 1.1 Create prompt type definitions
    - Create `src/types/prompt.ts` with PromptVariable, PromptDefinition, IntentConfig, PromptConfig interfaces
    - _Requirements: 1.2, 1.3, 1.4_

  - [x] 1.2 Create prompts.json configuration file
    - Create `src/config/prompts.json` with all 4 intent types
    - Migrate existing hardcoded prompts from intentClassifierService.ts
    - Include: classification prompt, specific_place description, travel_consultation response, non_travel response
    - _Requirements: 1.1, 1.6, 4.1, 4.2, 4.3, 4.4_

- [-] 2. Implement Variable Resolver Service
  - [x] 2.1 Create VariableResolverService
    - Create `src/services/variableResolverService.ts`
    - Implement `resolve()` method for variable replacement
    - Implement `extractVariables()` method to find all variables in template
    - Implement `validate()` method for template validation
    - Handle JSON pattern preservation (don't replace `{"key": "value"}` patterns)
    - _Requirements: 2.1, 2.5, 2.6_

  - [x] 2.2 Write property test for variable replacement
    - **Property 3: Variable Replacement Correctness**
    - **Validates: Requirements 2.1**

  - [ ]* 2.3 Write property test for missing variable error
    - **Property 4: Missing Variable Error Handling**
    - **Validates: Requirements 2.5**

  - [ ]* 2.4 Write property test for JSON pattern preservation
    - **Property 5: JSON Pattern Preservation**
    - **Validates: Requirements 2.6**

- [ ] 3. Implement Prompt Registry Service
  - [ ] 3.1 Create PromptRegistryService
    - Create `src/services/promptRegistryService.ts`
    - Implement `load()` method to read and parse prompts.json
    - Implement `getPrompt(intentType, promptId)` method
    - Implement `getPromptsForIntent(intentType)` method
    - Implement `getResolvedPrompt()` method using VariableResolver
    - Implement in-memory caching
    - _Requirements: 3.1, 3.2, 3.3, 3.5_

  - [ ] 3.2 Implement config validation
    - Validate required fields on load
    - Validate declared variables exist in template
    - Warn on undeclared variables in template
    - Implement fallback to hardcoded defaults on validation failure
    - _Requirements: 6.1, 6.2, 6.4, 6.5_

  - [ ]* 3.3 Write property test for config structure validation
    - **Property 1: Config Structure Validation**
    - **Validates: Requirements 1.3, 1.4**

  - [ ]* 3.4 Write property test for prompt retrieval
    - **Property 6: Prompt Retrieval Correctness**
    - **Validates: Requirements 3.2**

  - [ ]* 3.5 Write property test for invalid prompt error
    - **Property 8: Invalid Prompt Error Handling**
    - **Validates: Requirements 3.4**

  - [ ]* 3.6 Write property test for prompt ID uniqueness
    - **Property 9: Prompt ID Uniqueness**
    - **Validates: Requirements 4.5**

- [ ] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Integrate with IntentClassifierService
  - [ ] 5.1 Update IntentClassifierService to use PromptRegistry
    - Import PromptRegistry and VariableResolver
    - Replace hardcoded INTENT_CLASSIFICATION_PROMPT with registry call
    - Replace hardcoded SPECIFIC_PLACE_DESCRIPTION_PROMPT with registry call
    - Replace hardcoded TRAVEL_CONSULTATION_PROMPT with registry call
    - Replace hardcoded NON_TRAVEL_PROMPT with registry call
    - _Requirements: 5.1, 5.2_

  - [ ] 5.2 Remove hardcoded prompts
    - Remove INTENT_CLASSIFICATION_PROMPT constant
    - Remove SPECIFIC_PLACE_DESCRIPTION_PROMPT constant
    - Remove TRAVEL_CONSULTATION_PROMPT constant
    - Remove NON_TRAVEL_PROMPT constant
    - Keep as fallback defaults in PromptRegistry
    - _Requirements: 5.5_

  - [ ]* 5.3 Write property test for backward compatibility
    - **Property 10: Backward Compatibility**
    - **Validates: Requirements 5.3**

- [ ] 6. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The fallback mechanism ensures the system works even if config is invalid

