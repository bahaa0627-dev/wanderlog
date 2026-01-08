/**
 * Property-based tests for Label Selection Priority
 * 
 * Feature: wikidata-data-quality
 * Property 4: Label Selection Priority
 * Validates: Requirements 1.4, 3.6
 */

import * as fc from 'fast-check';
import { WikidataLabelFetcher, WikidataLabels } from '../../src/services/wikidataImportUtils';

describe('Label Selection Priority - Property Tests', () => {
  const fetcher = new WikidataLabelFetcher();

  /**
   * Property 4: Label Selection Priority
   * 
   * For any set of Wikidata labels, the label selector should return the English
   * label if available. If no English label exists, it should return a label in
   * a Latin-script language. If no Latin-script label exists, it should return
   * the first available label.
   */
  describe('Property 4: Label Selection Priority', () => {
    it('should always return English label when available', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.dictionary(
            fc.constantFrom('de', 'fr', 'es', 'it', 'ja', 'zh', 'ru', 'ar'),
            fc.string({ minLength: 1, maxLength: 50 })
          ),
          (englishLabel, otherLabels) => {
            const labels: WikidataLabels = {
              en: englishLabel,
              ...otherLabels,
            };
            const result = fetcher.selectBestLabel(labels);
            return result === englishLabel;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return Latin-script language when English not available', () => {
      const latinLanguages = ['de', 'fr', 'es', 'it', 'pt', 'nl'];
      
      fc.assert(
        fc.property(
          fc.constantFrom(...latinLanguages),
          fc.string({ minLength: 1, maxLength: 50 }),
          (lang, label) => {
            const labels: WikidataLabels = {
              [lang]: label,
              ja: 'Japanese label',
              zh: 'Chinese label',
              ru: 'Russian label',
            };
            const result = fetcher.selectBestLabel(labels);
            // Should return the Latin-script label, not Japanese/Chinese/Russian
            return result === label;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return null for empty labels object', () => {
      expect(fetcher.selectBestLabel({})).toBeNull();
    });

    it('should return null for null/undefined input', () => {
      expect(fetcher.selectBestLabel(null as unknown as WikidataLabels)).toBeNull();
      expect(fetcher.selectBestLabel(undefined as unknown as WikidataLabels)).toBeNull();
    });

    it('should return first available label when no Latin-script available', () => {
      const labels: WikidataLabels = {
        ja: '東京タワー',
        zh: '东京塔',
        ar: 'برج طوكيو',
      };
      const result = fetcher.selectBestLabel(labels);
      // Should return one of the available labels
      expect(['東京タワー', '东京塔', 'برج طوكيو']).toContain(result);
    });

    it('should prefer German over French when English not available', () => {
      const labels: WikidataLabels = {
        de: 'German Label',
        fr: 'French Label',
      };
      const result = fetcher.selectBestLabel(labels);
      expect(result).toBe('German Label');
    });

    it('should handle real Wikidata label scenarios', () => {
      // Scenario 1: Full labels with English
      const fullLabels: WikidataLabels = {
        en: 'Eiffel Tower',
        fr: 'Tour Eiffel',
        de: 'Eiffelturm',
        ja: 'エッフェル塔',
      };
      expect(fetcher.selectBestLabel(fullLabels)).toBe('Eiffel Tower');

      // Scenario 2: No English, has French
      const noEnglish: WikidataLabels = {
        fr: 'Château de Versailles',
        de: 'Schloss Versailles',
      };
      expect(fetcher.selectBestLabel(noEnglish)).toBe('Schloss Versailles'); // German comes before French in priority

      // Scenario 3: Only Japanese
      const onlyJapanese: WikidataLabels = {
        ja: '東京スカイツリー',
      };
      expect(fetcher.selectBestLabel(onlyJapanese)).toBe('東京スカイツリー');
    });

    it('should handle labels with empty strings', () => {
      const labels: WikidataLabels = {
        en: '',
        de: 'German Label',
      };
      // Empty string is falsy, should skip to German
      const result = fetcher.selectBestLabel(labels);
      expect(result).toBe('German Label');
    });
  });
});
