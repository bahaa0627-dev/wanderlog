/**
 * Property-based tests for Non-ASCII Name Detection
 * 
 * Feature: wikidata-data-quality
 * Property 3: Non-ASCII Name Detection
 * Validates: Requirements 3.1
 */

import * as fc from 'fast-check';
import { hasNonAsciiCharacters } from '../../src/services/wikidataImportUtils';

describe('Non-ASCII Name Detection - Property Tests', () => {
  /**
   * Property 3: Non-ASCII Name Detection
   * 
   * For any string, the non-ASCII detector should return true if and only if
   * the string contains at least one character outside the ASCII range (0x00-0x7F).
   */
  describe('Property 3: Non-ASCII Name Detection', () => {
    it('should return false for pure ASCII strings', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }).filter(s => /^[\x00-\x7F]*$/.test(s)),
          (str) => {
            return hasNonAsciiCharacters(str) === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return true for strings with non-ASCII characters', () => {
      // Generate strings with guaranteed non-ASCII characters
      const nonAsciiChars = ['é', 'ñ', 'ü', 'ö', 'ä', '中', '日', '東', 'カ', 'タ', 'ナ', 'Ω', 'α', 'β'];
      fc.assert(
        fc.property(
          fc.string(),
          fc.constantFrom(...nonAsciiChars),
          fc.nat({ max: 10 }),
          (prefix, nonAscii, insertPos) => {
            // Insert non-ASCII character at some position
            const pos = Math.min(insertPos, prefix.length);
            const str = prefix.slice(0, pos) + nonAscii + prefix.slice(pos);
            return hasNonAsciiCharacters(str) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return true for mixed ASCII and non-ASCII', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          fc.constantFrom('é', 'ñ', 'ü', '中', '日', '東', 'カ', 'タ'),
          (ascii, nonAscii) => {
            const mixed = ascii + nonAscii;
            return hasNonAsciiCharacters(mixed) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return false for empty strings', () => {
      expect(hasNonAsciiCharacters('')).toBe(false);
    });

    it('should handle real non-English place names', () => {
      const nonEnglishNames = [
        '東京タワー',           // Japanese
        'Musée du Louvre',     // French with accent
        'Château de Versailles', // French
        'Kölner Dom',          // German
        '北京故宫',             // Chinese
        'Москва',              // Russian
        'القاهرة',              // Arabic
        'Αθήνα',               // Greek
      ];
      
      for (const name of nonEnglishNames) {
        expect(hasNonAsciiCharacters(name)).toBe(true);
      }
    });

    it('should return false for English place names', () => {
      const englishNames = [
        'Eiffel Tower',
        'Harvard Art Museums',
        'Big Ben',
        'Statue of Liberty',
        'Golden Gate Bridge',
        'Empire State Building',
      ];
      
      for (const name of englishNames) {
        expect(hasNonAsciiCharacters(name)).toBe(false);
      }
    });

    it('should handle special ASCII characters correctly', () => {
      const specialAscii = [
        'Test!@#$%^&*()',
        'Name with spaces',
        'Name-with-dashes',
        "Name's apostrophe",
        'Name "quotes"',
        'Name\ttab',
        'Name\nnewline',
      ];
      
      for (const name of specialAscii) {
        expect(hasNonAsciiCharacters(name)).toBe(false);
      }
    });
  });
});
