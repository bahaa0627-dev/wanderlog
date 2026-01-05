/**
 * Variable Resolver Service
 * 
 * Handles variable replacement in prompt templates.
 * Supports {variableName} syntax and preserves JSON structure patterns.
 * 
 * Requirements:
 * - 2.1: Support {variableName} syntax for variable placeholders
 * - 2.5: Throw error with missing variable name if required variable is missing
 * - 2.6: Preserve unrecognized {...} patterns that are part of JSON output format
 */

import { VariableValues, ValidationResult } from '../types/prompt';
import { logger } from '../utils/logger';

/**
 * Interface for Variable Resolver
 */
export interface IVariableResolver {
  /**
   * Replace variables in template with provided values
   * @param template - Template string with {variable} placeholders
   * @param values - Key-value pairs for replacement
   * @param declaredVariables - List of declared variable names (for validation)
   * @returns Resolved string with variables replaced
   * @throws Error if required variable is missing
   */
  resolve(template: string, values: VariableValues, declaredVariables?: string[]): string;
  
  /**
   * Extract all variable names from a template
   * @param template - Template string
   * @returns Array of variable names found
   */
  extractVariables(template: string): string[];
  
  /**
   * Validate that all declared variables exist in template
   * @param template - Template string
   * @param declaredVariables - List of declared variable names
   * @returns Validation result with any warnings
   */
  validate(template: string, declaredVariables: string[]): ValidationResult;
}



/**
 * Variable Resolver Service Implementation
 */
class VariableResolverService implements IVariableResolver {
  /**
   * Replace variables in template with provided values
   * Preserves JSON structure patterns like {"key": "value"}
   * 
   * @param template - Template string with {variable} placeholders
   * @param values - Key-value pairs for replacement
   * @param declaredVariables - Optional list of declared variable names
   * @returns Resolved string with variables replaced
   * @throws Error if a declared variable is missing from values
   */
  resolve(template: string, values: VariableValues, declaredVariables?: string[]): string {
    if (!template) {
      return template;
    }

    // Get the list of variables to replace
    const variablesToReplace = declaredVariables || this.extractVariables(template);
    
    // Check for missing required variables
    for (const varName of variablesToReplace) {
      if (!(varName in values)) {
        const error = new Error(`Missing required variable: ${varName}`);
        logger.error(`[VariableResolver] ${error.message}`);
        throw error;
      }
    }

    // Replace each declared variable
    let result = template;
    for (const varName of variablesToReplace) {
      const placeholder = `{${varName}}`;
      const value = values[varName];
      
      // Replace all occurrences of this variable
      result = result.split(placeholder).join(value);
    }

    return result;
  }

  /**
   * Extract all variable names from a template
   * Excludes JSON structure patterns
   * 
   * @param template - Template string
   * @returns Array of unique variable names found
   */
  extractVariables(template: string): string[] {
    if (!template) {
      return [];
    }

    const variables: Set<string> = new Set();
    
    // Match {variableName} patterns
    // Variable names: alphanumeric and underscore, starting with letter
    const variablePattern = /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g;
    
    let match: RegExpExecArray | null;
    while ((match = variablePattern.exec(template)) !== null) {
      const varName = match[1];
      const matchIndex = match.index;
      
      // Check if this is part of a JSON structure
      // Look backwards to see if we're inside a JSON object
      if (!this.isInsideJsonStructure(template, matchIndex)) {
        variables.add(varName);
      }
    }

    return Array.from(variables);
  }

  /**
   * Check if a variable placeholder is inside a JSON structure
   * JSON structures have patterns like {"key": "value"} or {"key": [...]}
   */
  private isInsideJsonStructure(template: string, matchIndex: number): boolean {
    // Look at the context around this match
    // If the { is followed by a quote and colon pattern, it's JSON
    const afterMatch = template.slice(matchIndex);
    
    // Check if this looks like the start of a JSON object
    // JSON objects have: { followed by whitespace and quote
    if (/^\{\s*"/.test(afterMatch)) {
      return true;
    }
    
    // Check if we're inside a JSON structure by looking for enclosing JSON patterns
    // Find the nearest { before this position that starts a JSON object
    let depth = 0;
    let inJsonObject = false;
    
    for (let i = 0; i < matchIndex; i++) {
      const char = template[i];
      
      if (char === '{') {
        // Check if this { starts a JSON object
        const remaining = template.slice(i);
        if (/^\{\s*"[^"]*"\s*:/.test(remaining)) {
          inJsonObject = true;
          depth++;
        } else if (/^\{[a-zA-Z]/.test(remaining)) {
          // This is a variable placeholder, not JSON
          // Skip to the closing }
          const closeIndex = template.indexOf('}', i);
          if (closeIndex > i) {
            i = closeIndex;
          }
        }
      } else if (char === '}' && inJsonObject) {
        depth--;
        if (depth === 0) {
          inJsonObject = false;
        }
      }
    }
    
    return inJsonObject && depth > 0;
  }

  /**
   * Validate that all declared variables exist in template
   * 
   * @param template - Template string
   * @param declaredVariables - List of declared variable names
   * @returns Validation result with warnings and errors
   */
  validate(template: string, declaredVariables: string[]): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      warnings: [],
      errors: [],
    };

    if (!template) {
      return result;
    }

    // Extract variables from template
    const templateVariables = this.extractVariables(template);
    const templateVarSet = new Set(templateVariables);
    const declaredVarSet = new Set(declaredVariables);

    // Check for declared variables not in template (warnings)
    for (const declared of declaredVariables) {
      if (!templateVarSet.has(declared)) {
        result.warnings.push(`Variable "${declared}" is declared but not used in template`);
      }
    }

    // Check for template variables not declared (errors)
    for (const templateVar of templateVariables) {
      if (!declaredVarSet.has(templateVar)) {
        result.errors.push(`Variable "${templateVar}" is used in template but not declared`);
        result.valid = false;
      }
    }

    return result;
  }
}

// Export singleton instance
export const variableResolverService = new VariableResolverService();

// Export class for testing
export { VariableResolverService };
