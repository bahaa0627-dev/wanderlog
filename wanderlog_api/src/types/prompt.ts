/**
 * Prompt Management Types
 * 
 * Defines types for the Intent-Prompt management system that stores
 * all AI prompts in a configuration file with variable replacement support.
 */

import { IntentType } from './intent';

// ============ Variable Types ============

/**
 * Variable definition in a prompt template
 */
export interface PromptVariable {
  /** Variable name (e.g., "query", "language") */
  name: string;
  /** What this variable represents */
  description: string;
  /** Whether this variable must be provided */
  required: boolean;
}

// ============ Prompt Definition Types ============

/**
 * Single prompt definition
 */
export interface PromptDefinition {
  /** Unique ID within intent (e.g., "classification", "description") */
  id: string;
  /** Human-readable description of what this prompt does */
  purpose: string;
  /** The prompt template with {variable} placeholders */
  template: string;
  /** Variables used in this template */
  variables: PromptVariable[];
}

// ============ Intent Configuration Types ============

/**
 * Intent configuration with its prompts
 */
export interface IntentConfig {
  /** Intent type: "general_search" | "specific_place" | "travel_consultation" | "non_travel" */
  intentType: IntentType;
  /** Human-readable name */
  name: string;
  /** What this intent handles */
  description: string;
  /** Array of prompts for this intent */
  prompts: PromptDefinition[];
}

// ============ Root Configuration Types ============

/**
 * Root configuration structure for prompts.json
 */
export interface PromptConfig {
  /** Config version for compatibility */
  version: string;
  /** Array of intent configurations */
  intents: IntentConfig[];
}

// ============ Variable Resolver Types ============

/**
 * Key-value pairs for variable replacement
 */
export interface VariableValues {
  [key: string]: string;
}

/**
 * Result of template validation
 */
export interface ValidationResult {
  /** Whether the template is valid */
  valid: boolean;
  /** Variables declared but not found in template */
  warnings: string[];
  /** Variables in template but not declared */
  errors: string[];
}
