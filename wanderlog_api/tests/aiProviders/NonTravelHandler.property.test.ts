/**
 * Property-Based Tests for Non-Travel Handler
 * 
 * Feature: ai-intent-recognition
 * 
 * Property 5: Non-Travel Has No Places
 * *For any* `non_travel` response, the response SHALL NOT contain `place`, `places`, 
 * or `relatedPlaces` fields.
 * 
 * **Validates: Requirements 4.1, 4.3**
 */

import * as fc from 'fast-check';
import { 
  NonTravelHandlerResult,
  NonTravelResponse,
} from '../../src/types/intent';

// ============================================
// Test Data Generators
// ============================================

/**
 * Generator for Markdown text content (simulating AI-generated responses)
 */
const markdownTextArbitrary = fc.oneof(
  // Simple text
  fc.string({ minLength: 10, maxLength: 500 }),
  // Text with headings
  fc.tuple(
    fc.constantFrom('## ', '### ', '#### '),
    fc.string({ minLength: 5, maxLength: 50 }),
    fc.constant('\n\n'),
    fc.string({ minLength: 20, maxLength: 300 })
  ).map(([heading, title, newline, content]) => `${heading}${title}${newline}${content}`),
  // Text with emoji
  fc.tuple(
    fc.constantFrom('🌟 ', '💡 ', '✨ ', '📝 ', '🎯 '),
    fc.string({ minLength: 20, maxLength: 400 })
  ).map(([emoji, text]) => `${emoji}${text}`),
  // Text with bullet points
  fc.array(fc.string({ minLength: 5, maxLength: 100 }), { minLength: 2, maxLength: 5 })
    .map(items => items.map(item => `- ${item}`).join('\n'))
);

/**
 * Generator for valid NonTravelHandlerResult
 * This should ONLY contain textContent field
 */
const nonTravelHandlerResultArbitrary: fc.Arbitrary<NonTravelHandlerResult> = fc.record({
  textContent: markdownTextArbitrary,
});

/**
 * Generator for valid NonTravelResponse (full API response)
 * This should ONLY contain intent, success, and textContent fields
 */
const nonTravelResponseArbitrary: fc.Arbitrary<NonTravelResponse> = fc.record({
  intent: fc.constant('non_travel' as const),
  success: fc.boolean(),
  textContent: markdownTextArbitrary,
  error: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
});



// ============================================
// Helper Functions
// ============================================

/**
 * Check if an object has any place-related fields
 * These fields should NOT exist in non_travel responses
 */
function hasPlaceFields(obj: any): boolean {
  if (!obj || typeof obj !== 'object') {
    return false;
  }
  
  // Check for forbidden fields
  const forbiddenFields = ['place', 'places', 'relatedPlaces', 'cityPlaces', 'categories'];
  
  for (const field of forbiddenFields) {
    if (field in obj && obj[field] !== undefined) {
      return true;
    }
  }
  
  return false;
}

/**
 * Validate that a NonTravelHandlerResult has the correct structure
 */
function isValidNonTravelHandlerResult(result: NonTravelHandlerResult): boolean {
  // Must have textContent field
  if (typeof result.textContent !== 'string') {
    return false;
  }
  
  // Should NOT have any place-related fields
  if (hasPlaceFields(result)) {
    return false;
  }
  
  return true;
}

/**
 * Validate that a NonTravelResponse has the correct structure
 */
function isValidNonTravelResponse(response: NonTravelResponse): boolean {
  // Must have intent field set to 'non_travel'
  if (response.intent !== 'non_travel') {
    return false;
  }
  
  // Must have success field (boolean)
  if (typeof response.success !== 'boolean') {
    return false;
  }
  
  // Must have textContent field
  if (typeof response.textContent !== 'string') {
    return false;
  }
  
  // Should NOT have any place-related fields
  if (hasPlaceFields(response)) {
    return false;
  }
  
  return true;
}

/**
 * Get all keys from an object
 */
function getObjectKeys(obj: any): string[] {
  if (!obj || typeof obj !== 'object') {
    return [];
  }
  return Object.keys(obj);
}

// ============================================
// Property Tests
// ============================================

describe('Non-Travel Handler Property-Based Tests', () => {
  
  /**
   * Feature: ai-intent-recognition, Property 5: Non-Travel Has No Places
   * 
   * *For any* `non_travel` response, the response SHALL NOT contain `place`, `places`, 
   * or `relatedPlaces` fields.
   * 
   * **Validates: Requirements 4.1, 4.3**
   */
  describe('Property 5: Non-Travel Has No Places', () => {
    
    /**
     * NonTravelHandlerResult should not contain place field
     */
    it('should not contain place field in handler result', () => {
      fc.assert(
        fc.property(
          nonTravelHandlerResultArbitrary,
          (result: NonTravelHandlerResult) => {
            return !('place' in result);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * NonTravelHandlerResult should not contain places field
     */
    it('should not contain places field in handler result', () => {
      fc.assert(
        fc.property(
          nonTravelHandlerResultArbitrary,
          (result: NonTravelHandlerResult) => {
            return !('places' in result);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * NonTravelHandlerResult should not contain relatedPlaces field
     */
    it('should not contain relatedPlaces field in handler result', () => {
      fc.assert(
        fc.property(
          nonTravelHandlerResultArbitrary,
          (result: NonTravelHandlerResult) => {
            return !('relatedPlaces' in result);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * NonTravelResponse should not contain any place-related fields
     */
    it('should not contain any place-related fields in API response', () => {
      fc.assert(
        fc.property(
          nonTravelResponseArbitrary,
          (response: NonTravelResponse) => {
            return !hasPlaceFields(response);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * NonTravelHandlerResult should only have textContent field
     */
    it('should only have textContent field in handler result', () => {
      fc.assert(
        fc.property(
          nonTravelHandlerResultArbitrary,
          (result: NonTravelHandlerResult) => {
            const keys = getObjectKeys(result);
            // Should only have textContent
            return keys.length === 1 && keys[0] === 'textContent';
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * NonTravelResponse should have correct fields only
     */
    it('should have only allowed fields in API response', () => {
      fc.assert(
        fc.property(
          nonTravelResponseArbitrary,
          (response: NonTravelResponse) => {
            const keys = getObjectKeys(response);
            const allowedFields = ['intent', 'success', 'textContent', 'error'];
            
            // All keys should be in allowed fields
            return keys.every(key => allowedFields.includes(key));
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * NonTravelHandlerResult Structure Invariants
   */
  describe('NonTravelHandlerResult Structure Invariants', () => {
    
    /**
     * Handler result should always have textContent field
     */
    it('should always have textContent field', () => {
      fc.assert(
        fc.property(
          nonTravelHandlerResultArbitrary,
          (result: NonTravelHandlerResult) => {
            return 'textContent' in result && typeof result.textContent === 'string';
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Handler result should be valid structure
     */
    it('should have valid structure', () => {
      fc.assert(
        fc.property(
          nonTravelHandlerResultArbitrary,
          (result: NonTravelHandlerResult) => {
            return isValidNonTravelHandlerResult(result);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * NonTravelResponse Structure Invariants
   */
  describe('NonTravelResponse Structure Invariants', () => {
    
    /**
     * API response should always have intent set to 'non_travel'
     */
    it('should always have intent set to non_travel', () => {
      fc.assert(
        fc.property(
          nonTravelResponseArbitrary,
          (response: NonTravelResponse) => {
            return response.intent === 'non_travel';
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * API response should always have success field
     */
    it('should always have success field', () => {
      fc.assert(
        fc.property(
          nonTravelResponseArbitrary,
          (response: NonTravelResponse) => {
            return 'success' in response && typeof response.success === 'boolean';
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * API response should always have textContent field
     */
    it('should always have textContent field', () => {
      fc.assert(
        fc.property(
          nonTravelResponseArbitrary,
          (response: NonTravelResponse) => {
            return 'textContent' in response && typeof response.textContent === 'string';
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * API response should be valid structure
     */
    it('should have valid structure', () => {
      fc.assert(
        fc.property(
          nonTravelResponseArbitrary,
          (response: NonTravelResponse) => {
            return isValidNonTravelResponse(response);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Markdown Content Support Tests
   * Validates Requirements 4.2: Response SHALL support headings, emoji, line breaks, and basic Markdown formatting
   */
  describe('Markdown Content Support', () => {
    
    /**
     * textContent should support headings
     */
    it('should support headings in textContent', () => {
      const headingTextArbitrary = fc.tuple(
        fc.constantFrom('## ', '### ', '#### '),
        fc.string({ minLength: 5, maxLength: 50 }),
        fc.constant('\n\n'),
        fc.string({ minLength: 20, maxLength: 200 })
      ).map(([heading, title, newline, content]) => `${heading}${title}${newline}${content}`);

      fc.assert(
        fc.property(
          headingTextArbitrary,
          (textContent: string) => {
            const result: NonTravelHandlerResult = { textContent };
            // Should be valid and contain heading markers
            return isValidNonTravelHandlerResult(result) && 
                   (textContent.includes('## ') || textContent.includes('### ') || textContent.includes('#### '));
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * textContent should support emoji
     */
    it('should support emoji in textContent', () => {
      const emojis = ['🌟', '💡', '✨', '📝', '🎯', '🏃', '💪', '🧘'];
      const emojiTextArbitrary = fc.tuple(
        fc.constantFrom(...emojis),
        fc.constant(' '),
        fc.string({ minLength: 20, maxLength: 200 })
      ).map(([emoji, space, text]) => `${emoji}${space}${text}`);

      fc.assert(
        fc.property(
          emojiTextArbitrary,
          (textContent: string) => {
            const result: NonTravelHandlerResult = { textContent };
            // Should be valid and contain one of the emojis
            return isValidNonTravelHandlerResult(result) && 
                   emojis.some(emoji => textContent.includes(emoji));
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * textContent should support line breaks
     */
    it('should support line breaks in textContent', () => {
      const lineBreakTextArbitrary = fc.array(
        fc.string({ minLength: 10, maxLength: 100 }),
        { minLength: 2, maxLength: 5 }
      ).map(lines => lines.join('\n\n'));

      fc.assert(
        fc.property(
          lineBreakTextArbitrary,
          (textContent: string) => {
            const result: NonTravelHandlerResult = { textContent };
            // Should be valid and contain line breaks
            return isValidNonTravelHandlerResult(result) && textContent.includes('\n');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * textContent should support bullet points
     */
    it('should support bullet points in textContent', () => {
      const bulletTextArbitrary = fc.array(
        fc.string({ minLength: 5, maxLength: 80 }),
        { minLength: 2, maxLength: 6 }
      ).map(items => items.map(item => `- ${item}`).join('\n'));

      fc.assert(
        fc.property(
          bulletTextArbitrary,
          (textContent: string) => {
            const result: NonTravelHandlerResult = { textContent };
            // Should be valid and contain bullet points
            return isValidNonTravelHandlerResult(result) && textContent.includes('- ');
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
