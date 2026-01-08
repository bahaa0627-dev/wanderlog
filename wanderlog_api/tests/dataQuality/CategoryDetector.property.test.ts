/**
 * Property-based tests for Category Detection from Name Keywords
 * 
 * Feature: wikidata-data-quality
 * Property 2: Category Detection from Name Keywords
 * Validates: Requirements 2.2-2.8
 */

import * as fc from 'fast-check';
import { detectCategoryFromName, assignCategory } from '../../src/services/wikidataImportUtils';

describe('Category Detection - Property Tests', () => {
  /**
   * Property 2: Category Detection from Name Keywords
   * 
   * For any place name containing category-specific keywords, the category
   * detector should return the corresponding category slug. The detection
   * should be case-insensitive and support multiple languages.
   */
  describe('Property 2: Category Detection from Name Keywords', () => {
    // Museum keywords in multiple languages
    const museumKeywords = ['Museum', 'Musée', 'Museo', 'Muzeum', '博物館', '美術館'];
    
    it('should detect museum category from museum keywords', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...museumKeywords),
          fc.string({ maxLength: 20 }),
          (keyword, prefix) => {
            const name = `${prefix} ${keyword}`;
            return detectCategoryFromName(name) === 'museum';
          }
        ),
        { numRuns: 100 }
      );
    });

    // Hotel keywords
    const hotelKeywords = ['Hotel', 'Hôtel', 'Hostel', 'Resort', 'Inn', 'Ryokan', 'ホテル', '酒店'];
    
    it('should detect hotel category from hotel keywords', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...hotelKeywords),
          fc.string({ maxLength: 20 }),
          (keyword, prefix) => {
            const name = `${prefix} ${keyword}`;
            return detectCategoryFromName(name) === 'hotel';
          }
        ),
        { numRuns: 100 }
      );
    });

    // Church keywords
    const churchKeywords = ['Church', 'Cathedral', 'Basilica', 'Chapel', 'Abbey', 'Église', 'Kirche', 'Dom'];
    
    it('should detect church category from church keywords', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...churchKeywords),
          fc.string({ maxLength: 20 }),
          (keyword, prefix) => {
            const name = `${prefix} ${keyword}`;
            return detectCategoryFromName(name) === 'church';
          }
        ),
        { numRuns: 100 }
      );
    });

    // Temple keywords
    const templeKeywords = ['Temple', 'Shrine', 'Mosque', 'Synagogue', 'Pagoda', '神社', '寺'];
    
    it('should detect temple category from temple keywords', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...templeKeywords),
          fc.string({ maxLength: 20 }),
          (keyword, prefix) => {
            const name = `${prefix} ${keyword}`;
            return detectCategoryFromName(name) === 'temple';
          }
        ),
        { numRuns: 100 }
      );
    });

    // Castle keywords
    const castleKeywords = ['Castle', 'Palace', 'Château', 'Schloss', 'Palazzo', 'Fortress', '城'];
    
    it('should detect castle category from castle keywords', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...castleKeywords),
          fc.string({ maxLength: 20 }),
          (keyword, prefix) => {
            const name = `${prefix} ${keyword}`;
            return detectCategoryFromName(name) === 'castle';
          }
        ),
        { numRuns: 100 }
      );
    });

    // Library keywords
    const libraryKeywords = ['Library', 'Bibliothèque', 'Biblioteca', 'Bibliothek', '図書館'];
    
    it('should detect library category from library keywords', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...libraryKeywords),
          fc.string({ maxLength: 20 }),
          (keyword, prefix) => {
            const name = `${prefix} ${keyword}`;
            return detectCategoryFromName(name) === 'library';
          }
        ),
        { numRuns: 100 }
      );
    });

    // University keywords
    const universityKeywords = ['University', 'Université', 'Universidad', 'Universität', '大学'];
    
    it('should detect university category from university keywords', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...universityKeywords),
          fc.string({ maxLength: 20 }),
          (keyword, prefix) => {
            const name = `${prefix} ${keyword}`;
            return detectCategoryFromName(name) === 'university';
          }
        ),
        { numRuns: 100 }
      );
    });

    // Cafe keywords
    const cafeKeywords = ['Cafe', 'Café', 'Coffee', 'Coffeehouse', 'カフェ'];
    
    it('should detect cafe category from cafe keywords', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...cafeKeywords),
          fc.string({ maxLength: 20 }),
          (keyword, prefix) => {
            const name = `${prefix} ${keyword}`;
            return detectCategoryFromName(name) === 'cafe';
          }
        ),
        { numRuns: 100 }
      );
    });

    // Restaurant keywords
    const restaurantKeywords = ['Restaurant', 'Ristorante', 'Bistro', 'Brasserie', 'レストラン'];
    
    it('should detect restaurant category from restaurant keywords', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...restaurantKeywords),
          fc.string({ maxLength: 20 }),
          (keyword, prefix) => {
            const name = `${prefix} ${keyword}`;
            return detectCategoryFromName(name) === 'restaurant';
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should be case-insensitive', () => {
      expect(detectCategoryFromName('MUSEUM')).toBe('museum');
      expect(detectCategoryFromName('museum')).toBe('museum');
      expect(detectCategoryFromName('Museum')).toBe('museum');
      expect(detectCategoryFromName('HOTEL')).toBe('hotel');
      expect(detectCategoryFromName('hotel')).toBe('hotel');
    });

    it('should return landmark for names without keywords', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => 
            !/(museum|hotel|church|temple|castle|library|university|cafe|restaurant|bar|park|zoo)/i.test(s)
          ),
          (name) => {
            return detectCategoryFromName(name) === 'landmark';
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle real place names correctly', () => {
      // Museums
      expect(detectCategoryFromName('Harvard Art Museums')).toBe('museum');
      expect(detectCategoryFromName('Musée du Louvre')).toBe('museum');
      expect(detectCategoryFromName('東京国立博物館')).toBe('museum');
      
      // Hotels
      expect(detectCategoryFromName('Grand Hotel')).toBe('hotel');
      expect(detectCategoryFromName('Ryokan Kurashiki')).toBe('hotel');
      
      // Churches
      expect(detectCategoryFromName('Notre-Dame Cathedral')).toBe('church');
      expect(detectCategoryFromName('Kölner Dom')).toBe('church');
      
      // Castles
      expect(detectCategoryFromName('Château de Versailles')).toBe('castle');
      expect(detectCategoryFromName('Neuschwanstein Castle')).toBe('castle');
      
      // Cafes
      expect(detectCategoryFromName('Starbucks Coffee')).toBe('cafe');
      expect(detectCategoryFromName('Café de Flore')).toBe('cafe');
      
      // Landmarks (no keyword match)
      expect(detectCategoryFromName('Eiffel Tower')).toBe('landmark');
      expect(detectCategoryFromName('Big Ben')).toBe('landmark');
    });

    it('should handle empty and null inputs', () => {
      expect(detectCategoryFromName('')).toBe('landmark');
      expect(detectCategoryFromName(null as unknown as string)).toBe('landmark');
      expect(detectCategoryFromName(undefined as unknown as string)).toBe('landmark');
    });
  });

  /**
   * Property 7: Category Fields Consistency
   * 
   * For any category update, all three category fields must be updated
   * together and be consistent.
   */
  describe('Property 7: Category Fields Consistency', () => {
    it('should return consistent category fields for architecture', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('Museum', 'Hotel', 'Church', 'Castle', 'Library', 'University', 'Landmark'),
          (name) => {
            const result = assignCategory('architecture', name);
            // All three fields should be present
            return (
              typeof result.categorySlug === 'string' &&
              typeof result.categoryEn === 'string' &&
              (result.categoryZh === undefined || typeof result.categoryZh === 'string')
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always return cemetery for cemetery data type', () => {
      fc.assert(
        fc.property(
          fc.string({ maxLength: 50 }),
          (name) => {
            const result = assignCategory('cemetery', name);
            return (
              result.categorySlug === 'cemetery' &&
              result.categoryEn === 'Cemetery'
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have matching slug and English name', () => {
      const testCases = [
        { name: 'Museum', expectedSlug: 'museum', expectedEn: 'Museum' },
        { name: 'Hotel', expectedSlug: 'hotel', expectedEn: 'Hotel' },
        { name: 'Church', expectedSlug: 'church', expectedEn: 'Church' },
        { name: 'Castle', expectedSlug: 'castle', expectedEn: 'Castle' },
        { name: 'Library', expectedSlug: 'library', expectedEn: 'Library' },
        { name: 'University', expectedSlug: 'university', expectedEn: 'University' },
        { name: 'Temple', expectedSlug: 'temple', expectedEn: 'Temple' },
        { name: 'Cafe', expectedSlug: 'cafe', expectedEn: 'Cafe' },
        { name: 'Restaurant', expectedSlug: 'restaurant', expectedEn: 'Restaurant' },
      ];

      for (const { name, expectedSlug, expectedEn } of testCases) {
        const result = assignCategory('architecture', name);
        expect(result.categorySlug).toBe(expectedSlug);
        expect(result.categoryEn).toBe(expectedEn);
      }
    });
  });
});
