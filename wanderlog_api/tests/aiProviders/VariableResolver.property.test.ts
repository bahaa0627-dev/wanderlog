/**
 * Property-Based Tests for Variable Resolver Service
 * 
 * Feature: intent-prompt-management
 * 
 * Property 3: Variable Replacement Correctness
 * *For any* template string and complete set of variable values, the Variable_Resolver 
 * SHALL replace all declared `{variableName}` patterns with their corresponding values, 
 * and the result SHALL not contain any of the original placeholders.
 * 
 * **Validates: Requirements 2.1**
 */

import * as fc from 'fast-check';
import { VariableResolverService } from '../../src/services/variableResolverService';
import { VariableValues } from '../../src/types/prompt';

// ============================================
// Test Setup
// ============================================

const variableResolver = new VariableResolverService();

// ============================================
// Test Data Generators
// ============================================

/**
 * Generate a valid variable name (alphanumeric starting with letter)
 */
const validVariableNameArbitrary: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 20 })
  .filter((s: string) => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s));

/**
 * Generate a variable value (non-empty string without curly braces to avoid confusion)
 */
const variableValueArbitrary: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 50 })
  .filter((s: string) => !s.includes('{') && !s.includes('}') && s.trim().length > 0);

/**
 * Generate a text segment (no curly braces)
 */
const textSegmentArbitrary: fc.Arbitrary<string> = fc.string({ minLength: 0, maxLength: 30 })
  .filter((s: string) => !s.includes('{') && !s.includes('}'));

/**
 * Interface for template with variables test data
 */
interface TemplateWithVariables {
  template: string;
  values: VariableValues;
  declaredVariables: string[];
}

/**
 * Interface for single variable template test data
 */
interface SingleVariableTemplate {
  template: string;
  values: VariableValues;
  declaredVariables: string[];
  varName: string;
  value: string;
  prefix: string;
  suffix: string;
}

/**
 * Interface for repeated variable template test data
 */
interface RepeatedVariableTemplate {
  template: string;
  values: VariableValues;
  declaredVariables: string[];
  varName: string;
  value: string;
  count: number;
}

/**
 * Generate a template with variables and their values
 * Returns { template, values, declaredVariables }
 */
const templateWithVariablesArbitrary: fc.Arbitrary<TemplateWithVariables> = fc.tuple(
  fc.array(validVariableNameArbitrary, { minLength: 1, maxLength: 5 }),
  fc.array(textSegmentArbitrary, { minLength: 2, maxLength: 6 }),
  fc.array(variableValueArbitrary, { minLength: 1, maxLength: 5 })
).map(([varNames, textSegments, values]: [string[], string[], string[]]) => {
  // Make variable names unique
  const uniqueVarNames = [...new Set(varNames)];
  if (uniqueVarNames.length === 0) {
    uniqueVarNames.push('defaultVar');
  }
  
  // Ensure we have enough values
  const valuesCopy = [...values];
  while (valuesCopy.length < uniqueVarNames.length) {
    valuesCopy.push(`value_${valuesCopy.length}`);
  }
  
  // Build template by interleaving text and variables
  let template = textSegments[0] || '';
  for (let i = 0; i < uniqueVarNames.length; i++) {
    template += `{${uniqueVarNames[i]}}`;
    template += textSegments[i + 1] || '';
  }
  
  // Build values object
  const valuesObj: VariableValues = {};
  for (let i = 0; i < uniqueVarNames.length; i++) {
    valuesObj[uniqueVarNames[i]] = valuesCopy[i];
  }
  
  return {
    template,
    values: valuesObj,
    declaredVariables: uniqueVarNames,
  };
});

/**
 * Generate a simple template with a single variable
 */
const singleVariableTemplateArbitrary: fc.Arbitrary<SingleVariableTemplate> = fc.tuple(
  validVariableNameArbitrary,
  variableValueArbitrary,
  textSegmentArbitrary,
  textSegmentArbitrary
).map(([varName, value, prefix, suffix]: [string, string, string, string]) => ({
  template: `${prefix}{${varName}}${suffix}`,
  values: { [varName]: value } as VariableValues,
  declaredVariables: [varName],
  varName,
  value,
  prefix,
  suffix,
}));

/**
 * Generate a template with multiple occurrences of the same variable
 */
const repeatedVariableTemplateArbitrary: fc.Arbitrary<RepeatedVariableTemplate> = fc.tuple(
  validVariableNameArbitrary,
  variableValueArbitrary,
  fc.integer({ min: 2, max: 5 }),
  textSegmentArbitrary
).map(([varName, value, count, separator]: [string, string, number, string]) => {
  const placeholders = Array(count).fill(`{${varName}}`);
  const template = placeholders.join(separator);
  return {
    template,
    values: { [varName]: value } as VariableValues,
    declaredVariables: [varName],
    varName,
    value,
    count,
  };
});

// ============================================
// Property Tests
// ============================================

describe('Variable Resolver Service Property-Based Tests', () => {
  /**
   * Feature: intent-prompt-management, Property 3: Variable Replacement Correctness
   * 
   * *For any* template string and complete set of variable values, the Variable_Resolver 
   * SHALL replace all declared `{variableName}` patterns with their corresponding values, 
   * and the result SHALL not contain any of the original placeholders.
   * 
   * **Validates: Requirements 2.1**
   */
  describe('Property 3: Variable Replacement Correctness', () => {
    /**
     * Property 3.1: All declared variables are replaced
     * 
     * For any template with declared variables and complete values,
     * the result should not contain any of the original {variableName} placeholders.
     */
    it('should replace all declared variable placeholders', () => {
      fc.assert(
        fc.property(
          templateWithVariablesArbitrary,
          ({ template, values, declaredVariables }: TemplateWithVariables) => {
            const result = variableResolver.resolve(template, values, declaredVariables);
            
            // Result should not contain any of the original placeholders
            for (const varName of declaredVariables) {
              const placeholder = `{${varName}}`;
              if (result.includes(placeholder)) {
                return false;
              }
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 3.2: Variables are replaced with correct values
     * 
     * For any single variable template, the result should contain
     * the value in place of the placeholder.
     */
    it('should replace variable with its corresponding value', () => {
      fc.assert(
        fc.property(
          singleVariableTemplateArbitrary,
          ({ template, values, declaredVariables, value, prefix, suffix }: SingleVariableTemplate) => {
            const result = variableResolver.resolve(template, values, declaredVariables);
            
            // Result should be prefix + value + suffix
            const expected = `${prefix}${value}${suffix}`;
            return result === expected;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 3.3: Multiple occurrences of same variable are all replaced
     * 
     * For any template with repeated variable placeholders,
     * all occurrences should be replaced with the same value.
     */
    it('should replace all occurrences of the same variable', () => {
      fc.assert(
        fc.property(
          repeatedVariableTemplateArbitrary,
          ({ template, values, declaredVariables, varName, value, count }: RepeatedVariableTemplate) => {
            const result = variableResolver.resolve(template, values, declaredVariables);
            
            // Count occurrences of the value in result
            const valueOccurrences = result.split(value).length - 1;
            
            // Should have at least 'count' occurrences (could be more if value appears in separator)
            // But definitely should not have any placeholders left
            const placeholderOccurrences = result.split(`{${varName}}`).length - 1;
            
            return placeholderOccurrences === 0 && valueOccurrences >= count;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 3.4: Empty template returns empty string
     * 
     * For any empty template, the result should be empty.
     */
    it('should return empty string for empty template', () => {
      fc.assert(
        fc.property(
          fc.dictionary(validVariableNameArbitrary, variableValueArbitrary),
          (values: VariableValues) => {
            const result = variableResolver.resolve('', values, []);
            return result === '';
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 3.5: Template without variables returns unchanged
     * 
     * For any template without variable placeholders,
     * the result should be identical to the input.
     */
    it('should return unchanged template when no variables present', () => {
      fc.assert(
        fc.property(
          textSegmentArbitrary.filter((s: string) => s.length > 0),
          (template: string) => {
            const result = variableResolver.resolve(template, {}, []);
            return result === template;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 3.6: Result length is predictable
     * 
     * For any template with variables, the result length should equal
     * the template length minus placeholder lengths plus value lengths.
     */
    it('should produce result with predictable length', () => {
      fc.assert(
        fc.property(
          singleVariableTemplateArbitrary,
          ({ template, values, declaredVariables, varName, value }: SingleVariableTemplate) => {
            const result = variableResolver.resolve(template, values, declaredVariables);
            
            const placeholderLength = `{${varName}}`.length;
            const expectedLength = template.length - placeholderLength + value.length;
            
            return result.length === expectedLength;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 3.7: Idempotence - resolving twice with same values gives same result
     * 
     * For any template and values, resolving the result again
     * (with no variables to replace) should return the same result.
     */
    it('should be idempotent when no variables remain', () => {
      fc.assert(
        fc.property(
          templateWithVariablesArbitrary,
          ({ template, values, declaredVariables }: TemplateWithVariables) => {
            const result1 = variableResolver.resolve(template, values, declaredVariables);
            // Second resolve with empty declared variables (nothing to replace)
            const result2 = variableResolver.resolve(result1, {}, []);
            
            return result1 === result2;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 3.8: Order of variables in declaredVariables doesn't matter
     * 
     * For any template with multiple variables, the order in which
     * variables are declared should not affect the result.
     */
    it('should produce same result regardless of declared variable order', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            validVariableNameArbitrary,
            validVariableNameArbitrary,
            variableValueArbitrary,
            variableValueArbitrary,
            textSegmentArbitrary
          ).filter(([v1, v2]: [string, string, string, string, string]) => v1 !== v2),
          ([var1, var2, val1, val2, text]: [string, string, string, string, string]) => {
            const template = `${text}{${var1}}${text}{${var2}}${text}`;
            const values: VariableValues = { [var1]: val1, [var2]: val2 };
            
            const result1 = variableResolver.resolve(template, values, [var1, var2]);
            const result2 = variableResolver.resolve(template, values, [var2, var1]);
            
            return result1 === result2;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
