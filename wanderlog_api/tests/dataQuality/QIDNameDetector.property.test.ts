/**
 * Property-based tests for QID Name Detection
 * 
 * Feature: wikidata-data-quality
 * Property 1: QID Name Detection
 * Validates: Requirements 1.1
 */

import * as fc from 'fast-check';
import { isQIDName } from '../../src/services/wikidataImportUtils';

describe('QID Name Detection - Property Tests', () => {
  /**
   * Property 1: QID Name Detection
   * 
   * For any string, the QID name detector should return true if and only if
   * the string matches the pattern "Q" followed by one or more digits with
   * no other characters.
   */
  describe('Property 1: QID Name Detection', () => {
    it('should return true for valid QID format (Q followed by digits)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 999999999 }),
          (num) => {
            const qid = `Q${num}`;
            return isQIDName(qid) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return false for strings not starting with Q', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }).filter(s => !s.startsWith('Q') && !s.startsWith('q')),
          (str) => {
            return isQIDName(str) === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return false for Q followed by non-digits', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }).filter(s => !/^\d+$/.test(s)),
          (suffix) => {
            const str = `Q${suffix}`;
            // Only return false if suffix contains non-digits
            if (/[^0-9]/.test(suffix)) {
              return isQIDName(str) === false;
            }
            return true; // Skip if suffix is all digits
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return false for Q with mixed content', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 9999 }),
          fc.string({ minLength: 1 }).filter(s => /[a-zA-Z]/.test(s)),
          (num, letters) => {
            const mixed = `Q${num}${letters}`;
            return isQIDName(mixed) === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return false for empty or whitespace strings', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('', ' ', '  ', '\t', '\n', '   '),
          (str) => {
            return isQIDName(str) === false;
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should handle Q0 as valid (edge case)', () => {
      expect(isQIDName('Q0')).toBe(true);
    });

    it('should return false for lowercase q', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 999999 }),
          (num) => {
            const qid = `q${num}`;
            return isQIDName(qid) === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return false for real place names', () => {
      const realNames = [
        'Eiffel Tower',
        'Harvard Art Museums',
        'Notre-Dame de Paris',
        '東京タワー',
        'Musée du Louvre',
        'Q12345 Building', // Contains QID but not only QID
        'Building Q12345',
      ];
      
      for (const name of realNames) {
        expect(isQIDName(name)).toBe(false);
      }
    });

    it('should return true for actual Wikidata QIDs', () => {
      const realQIDs = [
        'Q243',      // Eiffel Tower
        'Q12345',
        'Q85832251', // Harvard Art Museums
        'Q1',
        'Q999999999',
      ];
      
      for (const qid of realQIDs) {
        expect(isQIDName(qid)).toBe(true);
      }
    });
  });
});
