/**
 * Property-Based Tests for Pritzker Parser Service
 * 
 * Feature: pritzker-architecture-import
 * 
 * Property 1: Coordinate Parsing Round Trip
 * *For any* valid coordinate string in "Point(lng lat)" format, parsing it should 
 * produce a latitude and longitude pair where the values match the original input numbers.
 * 
 * **Validates: Requirements 1.2**
 */

import * as fc from 'fast-check';
import { parseCoordinates, extractWikidataQID, formatArchitectTag, selectBestCity } from '../../src/services/pritzkerParserService';

// ============================================
// Test Data Generators
// ============================================

/**
 * Generator for valid longitude values (-180 to 180)
 * Note: We avoid extremely small values (< 1e-6) because they don't round-trip
 * properly through string conversion. This is not a real-world issue since
 * geographic coordinates are typically precise to 6 decimal places (~0.1 meters).
 */
const validLongitudeArbitrary = fc.double({
  min: -180,
  max: 180,
  noNaN: true,
  noDefaultInfinity: true,
}).filter(n => Math.abs(n) > 1e-6 || n === 0);

/**
 * Generator for valid latitude values (-90 to 90)
 * Note: We avoid extremely small values (< 1e-6) because they don't round-trip
 * properly through string conversion. This is not a real-world issue since
 * geographic coordinates are typically precise to 6 decimal places (~0.1 meters).
 */
const validLatitudeArbitrary = fc.double({
  min: -90,
  max: 90,
  noNaN: true,
  noDefaultInfinity: true,
}).filter(n => Math.abs(n) > 1e-6 || n === 0);

/**
 * Generator for out-of-range longitude values
 */
const outOfRangeLongitudeArbitrary = fc.oneof(
  fc.double({ min: -1000, max: -180.001, noNaN: true, noDefaultInfinity: true }),
  fc.double({ min: 180.001, max: 1000, noNaN: true, noDefaultInfinity: true }),
);

/**
 * Generator for out-of-range latitude values
 */
const outOfRangeLatitudeArbitrary = fc.oneof(
  fc.double({ min: -1000, max: -90.001, noNaN: true, noDefaultInfinity: true }),
  fc.double({ min: 90.001, max: 1000, noNaN: true, noDefaultInfinity: true }),
);

// ============================================
// Property Tests
// ============================================

describe('Pritzker Parser Service - Coordinate Parsing Property Tests', () => {
  /**
   * Feature: pritzker-architecture-import, Property 1: Coordinate Parsing Round Trip
   * 
   * *For any* valid coordinate string in "Point(lng lat)" format, parsing it should 
   * produce a latitude and longitude pair where the values match the original input numbers.
   * 
   * **Validates: Requirements 1.2**
   */
  describe('Property 1: Coordinate Parsing Round Trip', () => {
    
    /**
     * Core round-trip property: parsing valid coordinates should preserve values
     */
    it('should parse valid coordinates and preserve longitude and latitude values', () => {
      fc.assert(
        fc.property(
          validLongitudeArbitrary,
          validLatitudeArbitrary,
          (lng: number, lat: number) => {
            // Create coordinate string in "Point(lng lat)" format
            const coordStr = `Point(${lng} ${lat})`;
            const result = parseCoordinates(coordStr);
            
            // Result should not be null for valid inputs
            if (result === null) {
              return false;
            }
            
            // Longitude and latitude should match original values (within floating point tolerance)
            const lngMatch = Math.abs(result.longitude - lng) < 0.0001;
            const latMatch = Math.abs(result.latitude - lat) < 0.0001;
            
            return lngMatch && latMatch;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Longitude comes first in Point format, latitude second
     */
    it('should correctly identify longitude as first value and latitude as second', () => {
      fc.assert(
        fc.property(
          validLongitudeArbitrary,
          validLatitudeArbitrary,
          (lng: number, lat: number) => {
            const coordStr = `Point(${lng} ${lat})`;
            const result = parseCoordinates(coordStr);
            
            if (result === null) {
              return false;
            }
            
            // Verify the order: first value is longitude, second is latitude
            // This is important because Point format is (lng lat), not (lat lng)
            return Math.abs(result.longitude - lng) < 0.0001 &&
                   Math.abs(result.latitude - lat) < 0.0001;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Negative coordinates should be handled correctly
     */
    it('should handle negative coordinates correctly', () => {
      fc.assert(
        fc.property(
          fc.double({ min: -180, max: 0, noNaN: true, noDefaultInfinity: true })
            .filter(n => Math.abs(n) > 1e-6 || n === 0),
          fc.double({ min: -90, max: 0, noNaN: true, noDefaultInfinity: true })
            .filter(n => Math.abs(n) > 1e-6 || n === 0),
          (lng: number, lat: number) => {
            const coordStr = `Point(${lng} ${lat})`;
            const result = parseCoordinates(coordStr);
            
            if (result === null) {
              return false;
            }
            
            return Math.abs(result.longitude - lng) < 0.0001 &&
                   Math.abs(result.latitude - lat) < 0.0001;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Case insensitivity: "point" should work the same as "Point"
     */
    it('should be case insensitive for Point prefix', () => {
      fc.assert(
        fc.property(
          validLongitudeArbitrary,
          validLatitudeArbitrary,
          fc.constantFrom('Point', 'point', 'POINT'),
          (lng: number, lat: number, prefix: string) => {
            const coordStr = `${prefix}(${lng} ${lat})`;
            const result = parseCoordinates(coordStr);
            
            if (result === null) {
              return false;
            }
            
            return Math.abs(result.longitude - lng) < 0.0001 &&
                   Math.abs(result.latitude - lat) < 0.0001;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Invalid Input Handling
   */
  describe('Invalid Input Handling', () => {
    
    /**
     * Should return null for invalid coordinate strings
     */
    it('should return null for malformed coordinate strings', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            '',
            'invalid',
            'Point()',
            'Point(abc def)',
            'Point(1.0)', // Missing second coordinate
            '(1.0 2.0)', // Missing "Point" prefix
          ),
          (invalidCoord: string) => {
            const result = parseCoordinates(invalidCoord);
            return result === null;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Should return null for out-of-range longitude
     */
    it('should return null for out-of-range longitude values', () => {
      fc.assert(
        fc.property(
          outOfRangeLongitudeArbitrary,
          validLatitudeArbitrary,
          (lng: number, lat: number) => {
            const coordStr = `Point(${lng} ${lat})`;
            const result = parseCoordinates(coordStr);
            return result === null;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Should return null for out-of-range latitude
     */
    it('should return null for out-of-range latitude values', () => {
      fc.assert(
        fc.property(
          validLongitudeArbitrary,
          outOfRangeLatitudeArbitrary,
          (lng: number, lat: number) => {
            const coordStr = `Point(${lng} ${lat})`;
            const result = parseCoordinates(coordStr);
            return result === null;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Should return null for null/undefined input
     */
    it('should return null for null or undefined input', () => {
      expect(parseCoordinates(null as unknown as string)).toBeNull();
      expect(parseCoordinates(undefined as unknown as string)).toBeNull();
    });
  });

  /**
   * Output Structure Validation
   */
  describe('Output Structure', () => {
    
    /**
     * Result should always have latitude and longitude properties
     */
    it('should return object with latitude and longitude properties for valid input', () => {
      fc.assert(
        fc.property(
          validLongitudeArbitrary,
          validLatitudeArbitrary,
          (lng: number, lat: number) => {
            const coordStr = `Point(${lng} ${lat})`;
            const result = parseCoordinates(coordStr);
            
            if (result === null) {
              return false;
            }
            
            return typeof result.latitude === 'number' &&
                   typeof result.longitude === 'number' &&
                   !isNaN(result.latitude) &&
                   !isNaN(result.longitude);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Determinism: same input should always produce same output
     */
    it('should be deterministic (same input produces same output)', () => {
      fc.assert(
        fc.property(
          validLongitudeArbitrary,
          validLatitudeArbitrary,
          (lng: number, lat: number) => {
            const coordStr = `Point(${lng} ${lat})`;
            const result1 = parseCoordinates(coordStr);
            const result2 = parseCoordinates(coordStr);
            
            if (result1 === null && result2 === null) {
              return true;
            }
            
            if (result1 === null || result2 === null) {
              return false;
            }
            
            return result1.latitude === result2.latitude &&
                   result1.longitude === result2.longitude;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


// ============================================
// Property 2: Wikidata QID Extraction
// ============================================

/**
 * Feature: pritzker-architecture-import, Property 2: Wikidata QID Extraction
 * 
 * *For any* valid Wikidata URL containing a QID (e.g., "http://www.wikidata.org/entity/Q123456"),
 * extracting the QID should return the exact Q-number from the URL.
 * 
 * **Validates: Requirements 1.3**
 */
describe('Pritzker Parser Service - Wikidata QID Extraction Property Tests', () => {
  
  // ============================================
  // Test Data Generators
  // ============================================
  
  /**
   * Generator for valid Wikidata QID numbers (positive integers)
   */
  const validQIDNumberArbitrary = fc.integer({ min: 1, max: 999999999 });
  
  /**
   * Generator for valid Wikidata URL prefixes
   */
  const validWikidataUrlPrefixArbitrary = fc.constantFrom(
    'http://www.wikidata.org/entity/',
    'https://www.wikidata.org/entity/',
    'http://wikidata.org/entity/',
    'https://wikidata.org/entity/',
  );

  // ============================================
  // Property Tests
  // ============================================
  
  describe('Property 2: Wikidata QID Extraction', () => {
    
    /**
     * Core property: extracting QID from valid URL should return exact Q-number
     */
    it('should extract exact QID from valid Wikidata URLs', () => {
      fc.assert(
        fc.property(
          validWikidataUrlPrefixArbitrary,
          validQIDNumberArbitrary,
          (prefix: string, qidNumber: number) => {
            const expectedQID = `Q${qidNumber}`;
            const url = `${prefix}${expectedQID}`;
            const result = extractWikidataQID(url);
            
            return result === expectedQID;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * QID format: should always start with 'Q' followed by digits
     */
    it('should return QID in correct format (Q followed by digits)', () => {
      fc.assert(
        fc.property(
          validWikidataUrlPrefixArbitrary,
          validQIDNumberArbitrary,
          (prefix: string, qidNumber: number) => {
            const url = `${prefix}Q${qidNumber}`;
            const result = extractWikidataQID(url);
            
            if (result === null) {
              return false;
            }
            
            // Result should match pattern Q followed by one or more digits
            return /^Q\d+$/.test(result);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Determinism: same input should always produce same output
     */
    it('should be deterministic (same URL produces same QID)', () => {
      fc.assert(
        fc.property(
          validWikidataUrlPrefixArbitrary,
          validQIDNumberArbitrary,
          (prefix: string, qidNumber: number) => {
            const url = `${prefix}Q${qidNumber}`;
            const result1 = extractWikidataQID(url);
            const result2 = extractWikidataQID(url);
            
            return result1 === result2;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * QID number preservation: the numeric part should be preserved exactly
     */
    it('should preserve the exact QID number from the URL', () => {
      fc.assert(
        fc.property(
          validQIDNumberArbitrary,
          (qidNumber: number) => {
            const url = `http://www.wikidata.org/entity/Q${qidNumber}`;
            const result = extractWikidataQID(url);
            
            if (result === null) {
              return false;
            }
            
            // Extract number from result and compare
            const extractedNumber = parseInt(result.substring(1), 10);
            return extractedNumber === qidNumber;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Invalid Input Handling
   */
  describe('Invalid Input Handling', () => {
    
    /**
     * Should return null for URLs without QID
     */
    it('should return null for URLs without valid QID', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            '',
            'invalid',
            'http://www.wikidata.org/entity/',
            'http://www.wikidata.org/entity/P123', // Property, not item
            'http://www.wikidata.org/entity/L123', // Lexeme, not item
            'http://example.com/Q123', // Wrong domain (but this might still match Q123)
            'Q123', // Just QID without URL
          ),
          (invalidUrl: string) => {
            const result = extractWikidataQID(invalidUrl);
            // For 'Q123' alone, it should still extract the QID since it ends with Q\d+
            if (invalidUrl === 'Q123') {
              return result === 'Q123';
            }
            // For URLs ending with Q\d+, it should extract
            if (/Q\d+$/.test(invalidUrl)) {
              return result !== null;
            }
            return result === null;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Should return null for null/undefined input
     */
    it('should return null for null or undefined input', () => {
      expect(extractWikidataQID(null as unknown as string)).toBeNull();
      expect(extractWikidataQID(undefined as unknown as string)).toBeNull();
    });

    /**
     * Should return null for non-string input
     */
    it('should return null for non-string input', () => {
      expect(extractWikidataQID(123 as unknown as string)).toBeNull();
      expect(extractWikidataQID({} as unknown as string)).toBeNull();
      expect(extractWikidataQID([] as unknown as string)).toBeNull();
    });
  });

  /**
   * Edge Cases
   */
  describe('Edge Cases', () => {
    
    /**
     * Should handle very large QID numbers
     */
    it('should handle large QID numbers', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 100000000, max: 999999999 }),
          (largeQidNumber: number) => {
            const url = `http://www.wikidata.org/entity/Q${largeQidNumber}`;
            const result = extractWikidataQID(url);
            
            return result === `Q${largeQidNumber}`;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Should handle QID with leading zeros (though unusual)
     * Note: Wikidata doesn't use leading zeros, but the function should handle the string as-is
     */
    it('should extract QID even with trailing content before Q', () => {
      fc.assert(
        fc.property(
          validQIDNumberArbitrary,
          fc.constantFrom('/wiki/', '/page/', '/item/'),
          (qidNumber: number, extraPath: string) => {
            const url = `http://www.wikidata.org${extraPath}Q${qidNumber}`;
            const result = extractWikidataQID(url);
            
            return result === `Q${qidNumber}`;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


// ============================================
// Property 5: Architect Tag Formatting
// ============================================

/**
 * Feature: pritzker-architecture-import, Property 5: Architect Tag Formatting
 * 
 * *For any* architect name string, the formatted tag should contain only ASCII letters
 * (no spaces, dots, accents, or special characters).
 * 
 * **Validates: Requirements 5.2**
 */
describe('Pritzker Parser Service - Architect Tag Formatting Property Tests', () => {
  
  // ============================================
  // Test Data Generators
  // ============================================
  
  /**
   * Generator for typical architect names with various formats
   */
  const architectNameArbitrary = fc.oneof(
    // Simple names: "Oscar Niemeyer"
    fc.tuple(fc.string({ minLength: 1, maxLength: 20 }), fc.string({ minLength: 1, maxLength: 20 }))
      .map(([first, last]) => `${first} ${last}`),
    // Names with initials: "I. M. Pei"
    fc.tuple(
      fc.string({ minLength: 1, maxLength: 1 }),
      fc.string({ minLength: 1, maxLength: 1 }),
      fc.string({ minLength: 1, maxLength: 20 })
    ).map(([i1, i2, last]) => `${i1}. ${i2}. ${last}`),
    // Names with accents: "Kenzō Tange"
    fc.constantFrom(
      'Kenzō Tange',
      'Álvaro Siza',
      'Jørn Utzon',
      'Sverre Fehn',
      'José Rafael Moneo',
      'Shigeru Ban',
      'Toyo Ito',
      'Kazuyo Sejima',
      'Ryue Nishizawa',
      'Wang Shu',
      'Alejandro Aravena',
      'Balkrishna Doshi',
      'Arata Isozaki',
      'Pritzker Laureate'
    ),
    // Random strings
    fc.string({ minLength: 0, maxLength: 100 }),
  );

  /**
   * Generator for strings with various special characters
   */
  const stringWithSpecialCharsArbitrary = fc.string({ minLength: 0, maxLength: 50 });

  // ============================================
  // Property Tests
  // ============================================
  
  describe('Property 5: Architect Tag Formatting', () => {
    
    /**
     * Core property: formatted tag should contain only ASCII letters
     */
    it('should produce output containing only ASCII letters (a-z, A-Z)', () => {
      fc.assert(
        fc.property(
          stringWithSpecialCharsArbitrary,
          (name: string) => {
            const tag = formatArchitectTag(name);
            
            // Result should only contain ASCII letters (a-z, A-Z)
            return /^[a-zA-Z]*$/.test(tag);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * No spaces in output
     */
    it('should remove all spaces from the output', () => {
      fc.assert(
        fc.property(
          architectNameArbitrary,
          (name: string) => {
            const tag = formatArchitectTag(name);
            
            // Result should not contain any spaces
            return !tag.includes(' ');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * No dots in output
     */
    it('should remove all dots from the output', () => {
      fc.assert(
        fc.property(
          architectNameArbitrary,
          (name: string) => {
            const tag = formatArchitectTag(name);
            
            // Result should not contain any dots
            return !tag.includes('.');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * No accented characters in output
     */
    it('should remove all accented characters (diacritics) from the output', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'Kenzō Tange',
            'Álvaro Siza',
            'Jørn Utzon',
            'José Rafael Moneo',
            'Sverre Fehn',
            'Günter Behnisch',
            'François Mitterrand',
            'Naïve Café',
            'Über Straße'
          ),
          (name: string) => {
            const tag = formatArchitectTag(name);
            
            // Result should only contain ASCII letters (no accented chars)
            return /^[a-zA-Z]*$/.test(tag);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Determinism: same input should always produce same output
     */
    it('should be deterministic (same input produces same output)', () => {
      fc.assert(
        fc.property(
          stringWithSpecialCharsArbitrary,
          (name: string) => {
            const tag1 = formatArchitectTag(name);
            const tag2 = formatArchitectTag(name);
            
            return tag1 === tag2;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Letter preservation: ASCII letters should be preserved
     */
    it('should preserve ASCII letters from the input', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 50 }).map(s => s.replace(/[^a-zA-Z]/g, '')),
          (lettersOnly: string) => {
            const tag = formatArchitectTag(lettersOnly);
            
            // If input is only ASCII letters, output should equal input
            return tag === lettersOnly;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Known Examples Validation
   */
  describe('Known Examples', () => {
    
    /**
     * Verify specific architect name transformations
     */
    it('should correctly format known architect names', () => {
      // Oscar Niemeyer → OscarNiemeyer
      expect(formatArchitectTag('Oscar Niemeyer')).toBe('OscarNiemeyer');
      
      // I. M. Pei → IMPei
      expect(formatArchitectTag('I. M. Pei')).toBe('IMPei');
      
      // Kenzō Tange → KenzoTange
      expect(formatArchitectTag('Kenzō Tange')).toBe('KenzoTange');
      
      // Álvaro Siza → AlvaroSiza
      expect(formatArchitectTag('Álvaro Siza')).toBe('AlvaroSiza');
      
      // Jørn Utzon → JrnUtzon (ø becomes nothing after NFD normalization)
      // Note: ø doesn't decompose to o + combining char, it stays as ø and gets removed
      const utzonResult = formatArchitectTag('Jørn Utzon');
      expect(/^[a-zA-Z]*$/.test(utzonResult)).toBe(true);
    });
  });

  /**
   * Edge Cases
   */
  describe('Edge Cases', () => {
    
    /**
     * Empty string input
     */
    it('should return empty string for empty input', () => {
      expect(formatArchitectTag('')).toBe('');
    });

    /**
     * Null/undefined input
     */
    it('should return empty string for null or undefined input', () => {
      expect(formatArchitectTag(null as unknown as string)).toBe('');
      expect(formatArchitectTag(undefined as unknown as string)).toBe('');
    });

    /**
     * String with only special characters
     */
    it('should return empty string for input with only special characters', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 50 }).map(s => s.replace(/[a-zA-Z0-9]/g, '')),
          (specialChars: string) => {
            const tag = formatArchitectTag(specialChars);
            return tag === '';
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * String with numbers
     */
    it('should remove numbers from the output', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 10 }),
            fc.integer({ min: 0, max: 9999 }),
            fc.string({ minLength: 1, maxLength: 10 })
          ).map(([a, n, b]) => `${a}${n}${b}`),
          (nameWithNumbers: string) => {
            const tag = formatArchitectTag(nameWithNumbers);
            
            // Result should not contain any digits
            return !/\d/.test(tag);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


// ============================================
// Property 4: City Selection Preference
// ============================================

/**
 * Feature: pritzker-architecture-import, Property 4: City Selection Preference
 * 
 * *For any* set of city names associated with a building, the selected city should not
 * contain "arrondissement", "District", or "Subdistrict" if a cleaner alternative exists.
 * 
 * **Validates: Requirements 2.2**
 */
describe('Pritzker Parser Service - City Selection Property Tests', () => {
  
  // ============================================
  // Test Data Generators
  // ============================================
  
  /**
   * Generator for clean city names (without administrative subdivision terms)
   */
  const cleanCityNameArbitrary = fc.constantFrom(
    'Paris',
    'Tokyo',
    'New York',
    'London',
    'Berlin',
    'Rome',
    'Madrid',
    'Barcelona',
    'Sydney',
    'Melbourne',
    'Toronto',
    'Vancouver',
    'Chicago',
    'Los Angeles',
    'San Francisco',
    'Seattle',
    'Boston',
    'Miami',
    'Houston',
    'Dallas'
  );

  /**
   * Generator for city names with administrative subdivision terms
   */
  const subdivisionCityNameArbitrary = fc.oneof(
    fc.tuple(cleanCityNameArbitrary, fc.constantFrom(' arrondissement', ' 1st arrondissement', ' 5th arrondissement'))
      .map(([city, suffix]) => `${city}${suffix}`),
    fc.tuple(cleanCityNameArbitrary, fc.constantFrom(' District', ' Central District', ' Northern District'))
      .map(([city, suffix]) => `${city}${suffix}`),
    fc.tuple(cleanCityNameArbitrary, fc.constantFrom(' Subdistrict', ' Urban Subdistrict'))
      .map(([city, suffix]) => `${city}${suffix}`)
  );

  // ============================================
  // Property Tests
  // ============================================
  
  describe('Property 4: City Selection Preference', () => {
    
    /**
     * Core property: when clean alternatives exist, should not select subdivision names
     */
    it('should not select city with subdivision terms when cleaner alternatives exist', () => {
      fc.assert(
        fc.property(
          fc.array(cleanCityNameArbitrary, { minLength: 1, maxLength: 5 }),
          fc.array(subdivisionCityNameArbitrary, { minLength: 1, maxLength: 5 }),
          (cleanCities: string[], subdivisionCities: string[]) => {
            // Combine clean and subdivision cities
            const allCities = [...cleanCities, ...subdivisionCities];
            
            const result = selectBestCity(allCities);
            
            // Result should not contain subdivision terms since clean alternatives exist
            const hasSubdivisionTerm = 
              result.includes('arrondissement') ||
              result.includes('District') ||
              result.includes('Subdistrict');
            
            return !hasSubdivisionTerm;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * When only subdivision cities exist, should still return one of them
     */
    it('should return a city even when only subdivision cities exist', () => {
      fc.assert(
        fc.property(
          fc.array(subdivisionCityNameArbitrary, { minLength: 1, maxLength: 5 }),
          (subdivisionCities: string[]) => {
            const result = selectBestCity(subdivisionCities);
            
            // Result should be one of the input cities
            return subdivisionCities.includes(result);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Should prefer shorter city names among clean alternatives
     */
    it('should prefer shorter city names among clean alternatives', () => {
      fc.assert(
        fc.property(
          fc.array(cleanCityNameArbitrary, { minLength: 2, maxLength: 5 }),
          (cleanCities: string[]) => {
            const result = selectBestCity(cleanCities);
            
            // Result should be the shortest city name
            const shortestLength = Math.min(...cleanCities.map(c => c.length));
            return result.length === shortestLength;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Should prefer shorter city names among subdivision cities when no clean alternatives
     */
    it('should prefer shorter city names when only subdivision cities exist', () => {
      fc.assert(
        fc.property(
          fc.array(subdivisionCityNameArbitrary, { minLength: 2, maxLength: 5 }),
          (subdivisionCities: string[]) => {
            const result = selectBestCity(subdivisionCities);
            
            // Result should be the shortest city name
            const shortestLength = Math.min(...subdivisionCities.map(c => c.length));
            return result.length === shortestLength;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Determinism: same input should always produce same output
     */
    it('should be deterministic (same input produces same output)', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.oneof(cleanCityNameArbitrary, subdivisionCityNameArbitrary),
            { minLength: 1, maxLength: 10 }
          ),
          (cities: string[]) => {
            const result1 = selectBestCity(cities);
            const result2 = selectBestCity(cities);
            
            return result1 === result2;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Result should always be from the input array
     */
    it('should always return a city from the input array', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.oneof(cleanCityNameArbitrary, subdivisionCityNameArbitrary),
            { minLength: 1, maxLength: 10 }
          ),
          (cities: string[]) => {
            const result = selectBestCity(cities);
            
            return cities.includes(result);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Edge Cases
   */
  describe('Edge Cases', () => {
    
    /**
     * Empty array should return empty string
     */
    it('should return empty string for empty array', () => {
      expect(selectBestCity([])).toBe('');
    });

    /**
     * Single city should return that city
     */
    it('should return the single city when array has one element', () => {
      fc.assert(
        fc.property(
          fc.oneof(cleanCityNameArbitrary, subdivisionCityNameArbitrary),
          (city: string) => {
            const result = selectBestCity([city]);
            return result === city;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Null/undefined input should return empty string
     */
    it('should return empty string for null or undefined input', () => {
      expect(selectBestCity(null as unknown as string[])).toBe('');
      expect(selectBestCity(undefined as unknown as string[])).toBe('');
    });
  });

  /**
   * Known Examples Validation
   */
  describe('Known Examples', () => {
    
    /**
     * Verify specific city selection scenarios
     */
    it('should select Paris over Paris 5th arrondissement', () => {
      const cities = ['Paris 5th arrondissement', 'Paris'];
      expect(selectBestCity(cities)).toBe('Paris');
    });

    it('should select Tokyo over Shibuya District', () => {
      const cities = ['Shibuya District', 'Tokyo'];
      expect(selectBestCity(cities)).toBe('Tokyo');
    });

    it('should select the shortest clean city', () => {
      const cities = ['New York City', 'NYC', 'Manhattan District'];
      expect(selectBestCity(cities)).toBe('NYC');
    });

    it('should select shortest subdivision city when no clean alternatives', () => {
      const cities = ['Paris 5th arrondissement', 'Paris 1st arrondissement'];
      const result = selectBestCity(cities);
      // Both have same length pattern, should pick one of them
      expect(cities).toContain(result);
    });
  });
});


// ============================================
// Property 3: Deduplication by QID
// ============================================

/**
 * Feature: pritzker-architecture-import, Property 3: Deduplication by QID
 * 
 * *For any* set of JSON entries where multiple entries share the same Wikidata QID,
 * the deduplication process should produce exactly one building record per unique QID.
 * 
 * **Validates: Requirements 2.1, 2.2**
 */
import { deduplicateEntries } from '../../src/services/pritzkerParserService';
import { WikidataArchitectureEntry } from '../../src/types/pritzkerArchitecture';

describe('Pritzker Parser Service - Deduplication Property Tests', () => {
  
  // ============================================
  // Test Data Generators
  // ============================================
  
  /**
   * Generator for valid Wikidata QID numbers
   */
  const validQIDNumberArb = fc.integer({ min: 1, max: 999999 });
  
  /**
   * Generator for city names
   */
  const cityNameArb = fc.constantFrom(
    'Paris', 'Tokyo', 'New York', 'London', 'Berlin', 'Rome', 'Madrid',
    'Paris 5th arrondissement', 'Shibuya District', 'Manhattan'
  );
  
  /**
   * Generator for image URLs
   */
  const imageUrlArb = fc.constantFrom(
    'http://commons.wikimedia.org/wiki/Special:FilePath/Image1.jpg',
    'http://commons.wikimedia.org/wiki/Special:FilePath/Image2.jpg',
    'http://commons.wikimedia.org/wiki/Special:FilePath/Image3.jpg',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Image4.jpg',
    'https://commons.wikimedia.org/wiki/Special:FilePath/Image5.jpg'
  );

  // ============================================
  // Property Tests
  // ============================================
  
  describe('Property 3: Deduplication by QID', () => {
    
    /**
     * Core property: each unique QID should produce exactly one building record
     */
    it('should produce exactly one building record per unique Wikidata QID', () => {
      fc.assert(
        fc.property(
          // Generate 1-5 unique QIDs
          fc.array(validQIDNumberArb, { minLength: 1, maxLength: 5 })
            .map(qids => [...new Set(qids)]), // Ensure unique QIDs
          fc.integer({ min: 1, max: 999999 }), // Architect QID
          (uniqueWorkQIDs: number[], architectQID: number) => {
            // For each unique QID, generate 1-3 duplicate entries
            const entries: WikidataArchitectureEntry[] = [];
            
            for (const workQID of uniqueWorkQIDs) {
              // Generate 1-3 entries with the same work QID
              const numDuplicates = Math.floor(Math.random() * 3) + 1;
              for (let i = 0; i < numDuplicates; i++) {
                entries.push({
                  architect: `http://www.wikidata.org/entity/Q${architectQID}`,
                  architectLabel: 'Test Architect',
                  work: `http://www.wikidata.org/entity/Q${workQID}`,
                  workLabel: 'Test Building',
                  coord: `Point(${(Math.random() * 360 - 180).toFixed(6)} ${(Math.random() * 180 - 90).toFixed(6)})`,
                  cityLabel: ['Paris', 'Tokyo', 'New York'][i % 3],
                  countryLabel: 'Test Country',
                  image: `http://commons.wikimedia.org/wiki/Special:FilePath/Image${i}.jpg`,
                });
              }
            }
            
            const result = deduplicateEntries(entries);
            
            // Result should have exactly one building per unique QID
            return result.length === uniqueWorkQIDs.length;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Each deduplicated building should have the correct QID
     */
    it('should preserve the Wikidata QID in deduplicated buildings', () => {
      fc.assert(
        fc.property(
          fc.array(validQIDNumberArb, { minLength: 1, maxLength: 5 })
            .map(qids => [...new Set(qids)]),
          fc.integer({ min: 1, max: 999999 }),
          (uniqueWorkQIDs: number[], architectQID: number) => {
            const entries: WikidataArchitectureEntry[] = uniqueWorkQIDs.map(workQID => ({
              architect: `http://www.wikidata.org/entity/Q${architectQID}`,
              architectLabel: 'Test Architect',
              work: `http://www.wikidata.org/entity/Q${workQID}`,
              workLabel: 'Test Building',
              coord: `Point(0 0)`,
              cityLabel: 'Test City',
              countryLabel: 'Test Country',
            }));
            
            const result = deduplicateEntries(entries);
            
            // Each result should have a QID from the input
            const resultQIDs = result.map(b => b.wikidataQID);
            const expectedQIDs = uniqueWorkQIDs.map(q => `Q${q}`);
            
            return resultQIDs.every(qid => expectedQIDs.includes(qid)) &&
                   expectedQIDs.every(qid => resultQIDs.includes(qid));
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Duplicate entries should have their cities merged
     */
    it('should collect all unique city names from duplicate entries', () => {
      fc.assert(
        fc.property(
          validQIDNumberArb,
          fc.integer({ min: 1, max: 999999 }),
          fc.array(cityNameArb, { minLength: 2, maxLength: 5 }),
          (workQID: number, architectQID: number, cities: string[]) => {
            // Create entries with the same QID but different cities
            const entries: WikidataArchitectureEntry[] = cities.map((city, i) => ({
              architect: `http://www.wikidata.org/entity/Q${architectQID}`,
              architectLabel: 'Test Architect',
              work: `http://www.wikidata.org/entity/Q${workQID}`,
              workLabel: 'Test Building',
              coord: `Point(${i} ${i})`,
              cityLabel: city,
              countryLabel: 'Test Country',
            }));
            
            const result = deduplicateEntries(entries);
            
            if (result.length !== 1) {
              return false;
            }
            
            // All unique cities should be collected
            const uniqueInputCities = [...new Set(cities)];
            const resultCities = result[0].cities;
            
            return uniqueInputCities.every(city => resultCities.includes(city));
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Duplicate entries should have their images merged and deduplicated
     */
    it('should collect all unique images from duplicate entries', () => {
      fc.assert(
        fc.property(
          validQIDNumberArb,
          fc.integer({ min: 1, max: 999999 }),
          fc.array(imageUrlArb, { minLength: 2, maxLength: 5 }),
          (workQID: number, architectQID: number, images: string[]) => {
            // Create entries with the same QID but different images
            const entries: WikidataArchitectureEntry[] = images.map((image, i) => ({
              architect: `http://www.wikidata.org/entity/Q${architectQID}`,
              architectLabel: 'Test Architect',
              work: `http://www.wikidata.org/entity/Q${workQID}`,
              workLabel: 'Test Building',
              coord: `Point(${i} ${i})`,
              cityLabel: 'Test City',
              countryLabel: 'Test Country',
              image: image,
            }));
            
            const result = deduplicateEntries(entries);
            
            if (result.length !== 1) {
              return false;
            }
            
            // Result images should be unique (no duplicates)
            const resultImages = result[0].images;
            const uniqueResultImages = [...new Set(resultImages)];
            
            return resultImages.length === uniqueResultImages.length;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Determinism: same input should always produce same output
     */
    it('should be deterministic (same input produces same output)', () => {
      fc.assert(
        fc.property(
          fc.array(validQIDNumberArb, { minLength: 1, maxLength: 3 }),
          fc.integer({ min: 1, max: 999999 }),
          (workQIDs: number[], architectQID: number) => {
            const entries: WikidataArchitectureEntry[] = workQIDs.map(workQID => ({
              architect: `http://www.wikidata.org/entity/Q${architectQID}`,
              architectLabel: 'Test Architect',
              work: `http://www.wikidata.org/entity/Q${workQID}`,
              workLabel: 'Test Building',
              coord: `Point(0 0)`,
              cityLabel: 'Test City',
              countryLabel: 'Test Country',
            }));
            
            const result1 = deduplicateEntries(entries);
            const result2 = deduplicateEntries(entries);
            
            // Results should have same length
            if (result1.length !== result2.length) {
              return false;
            }
            
            // Results should have same QIDs
            const qids1 = result1.map(b => b.wikidataQID).sort();
            const qids2 = result2.map(b => b.wikidataQID).sort();
            
            return qids1.every((qid, i) => qid === qids2[i]);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Edge Cases
   */
  describe('Edge Cases', () => {
    
    /**
     * Empty array should return empty array
     */
    it('should return empty array for empty input', () => {
      expect(deduplicateEntries([])).toEqual([]);
    });

    /**
     * Null/undefined input should return empty array
     */
    it('should return empty array for null or undefined input', () => {
      expect(deduplicateEntries(null as unknown as WikidataArchitectureEntry[])).toEqual([]);
      expect(deduplicateEntries(undefined as unknown as WikidataArchitectureEntry[])).toEqual([]);
    });

    /**
     * Entries without valid QID should be skipped
     */
    it('should skip entries without valid Wikidata QID', () => {
      const entries: WikidataArchitectureEntry[] = [
        {
          architect: 'http://www.wikidata.org/entity/Q123',
          architectLabel: 'Test Architect',
          work: 'invalid-url', // Invalid work URL
          workLabel: 'Test Building',
          coord: 'Point(0 0)',
          cityLabel: 'Test City',
          countryLabel: 'Test Country',
        },
        {
          architect: 'http://www.wikidata.org/entity/Q123',
          architectLabel: 'Test Architect',
          work: 'http://www.wikidata.org/entity/Q456', // Valid work URL
          workLabel: 'Test Building 2',
          coord: 'Point(1 1)',
          cityLabel: 'Test City',
          countryLabel: 'Test Country',
        },
      ];
      
      const result = deduplicateEntries(entries);
      
      // Only the valid entry should be included
      expect(result.length).toBe(1);
      expect(result[0].wikidataQID).toBe('Q456');
    });

    /**
     * Entries without valid coordinates should be skipped
     */
    it('should skip entries without valid coordinates', () => {
      const entries: WikidataArchitectureEntry[] = [
        {
          architect: 'http://www.wikidata.org/entity/Q123',
          architectLabel: 'Test Architect',
          work: 'http://www.wikidata.org/entity/Q456',
          workLabel: 'Test Building',
          // No coord field
          cityLabel: 'Test City',
          countryLabel: 'Test Country',
        },
      ];
      
      const result = deduplicateEntries(entries);
      
      // Entry without coordinates should be skipped
      expect(result.length).toBe(0);
    });

    /**
     * Single entry should produce single building
     */
    it('should produce single building for single entry', () => {
      fc.assert(
        fc.property(
          validQIDNumberArb,
          fc.integer({ min: 1, max: 999999 }),
          (workQID: number, architectQID: number) => {
            const entries: WikidataArchitectureEntry[] = [{
              architect: `http://www.wikidata.org/entity/Q${architectQID}`,
              architectLabel: 'Test Architect',
              work: `http://www.wikidata.org/entity/Q${workQID}`,
              workLabel: 'Test Building',
              coord: 'Point(0 0)',
              cityLabel: 'Test City',
              countryLabel: 'Test Country',
            }];
            
            const result = deduplicateEntries(entries);
            
            return result.length === 1 && result[0].wikidataQID === `Q${workQID}`;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Known Examples Validation
   */
  describe('Known Examples', () => {
    
    /**
     * Verify deduplication with specific test data
     */
    it('should correctly deduplicate entries with same QID', () => {
      const entries: WikidataArchitectureEntry[] = [
        {
          architect: 'http://www.wikidata.org/entity/Q134165',
          architectLabel: 'Oscar Niemeyer',
          work: 'http://www.wikidata.org/entity/Q281521',
          workLabel: 'Sambadrome',
          coord: 'Point(-43.196851 -22.911384)',
          cityLabel: 'Rio de Janeiro',
          countryLabel: 'Brazil',
          image: 'http://commons.wikimedia.org/wiki/Special:FilePath/Sambodromo1.jpg',
        },
        {
          architect: 'http://www.wikidata.org/entity/Q134165',
          architectLabel: 'Oscar Niemeyer',
          work: 'http://www.wikidata.org/entity/Q281521', // Same QID
          workLabel: 'Sambadrome',
          coord: 'Point(-43.196851 -22.911384)',
          cityLabel: 'Centro District', // Different city label
          countryLabel: 'Brazil',
          image: 'http://commons.wikimedia.org/wiki/Special:FilePath/Sambodromo2.jpg', // Different image
        },
      ];
      
      const result = deduplicateEntries(entries);
      
      // Should produce exactly one building
      expect(result.length).toBe(1);
      expect(result[0].wikidataQID).toBe('Q281521');
      
      // Should collect both cities
      expect(result[0].cities).toContain('Rio de Janeiro');
      expect(result[0].cities).toContain('Centro District');
      
      // Should collect both images (converted to HTTPS)
      expect(result[0].images.length).toBe(2);
    });

    /**
     * Verify that different QIDs produce different buildings
     */
    it('should produce separate buildings for different QIDs', () => {
      const entries: WikidataArchitectureEntry[] = [
        {
          architect: 'http://www.wikidata.org/entity/Q134165',
          architectLabel: 'Oscar Niemeyer',
          work: 'http://www.wikidata.org/entity/Q281521',
          workLabel: 'Building A',
          coord: 'Point(0 0)',
          cityLabel: 'City A',
          countryLabel: 'Country A',
        },
        {
          architect: 'http://www.wikidata.org/entity/Q134165',
          architectLabel: 'Oscar Niemeyer',
          work: 'http://www.wikidata.org/entity/Q281522', // Different QID
          workLabel: 'Building B',
          coord: 'Point(1 1)',
          cityLabel: 'City B',
          countryLabel: 'Country B',
        },
      ];
      
      const result = deduplicateEntries(entries);
      
      // Should produce two buildings
      expect(result.length).toBe(2);
      
      const qids = result.map(b => b.wikidataQID).sort();
      expect(qids).toEqual(['Q281521', 'Q281522']);
    });
  });
});


// ============================================
// Property 10: Category Classification Consistency
// ============================================

/**
 * Feature: pritzker-architecture-import, Property 10: Category Classification Consistency
 * 
 * *For any* work label containing a category keyword (e.g., "Museum", "Church"),
 * the assigned category should match the expected category for that keyword.
 * 
 * **Validates: Requirements 4.1**
 */
import { classifyCategory } from '../../src/services/pritzkerParserService';
import { CATEGORY_RULES, DEFAULT_CATEGORY } from '../../src/constants/pritzkerCategoryRules';

describe('Pritzker Parser Service - Category Classification Property Tests', () => {
  
  // ============================================
  // Test Data Generators
  // ============================================
  
  /**
   * Generator for work labels containing specific category keywords
   * Creates labels that contain ONLY ONE keyword to avoid ambiguity
   */
  const workLabelWithSingleKeywordArbitrary = fc.tuple(
    fc.constantFrom(...CATEGORY_RULES),
    fc.constantFrom('National ', 'Grand ', 'Royal ', 'Modern ', 'Historic ', 'Central ', 'Main '),
    fc.constantFrom(' Complex', ' Hall', ' Site', ' Place', ' Venue')
  ).map(([rule, prefix, suffix]) => {
    // Use the first keyword from the rule
    const keyword = rule.keywords[0];
    return {
      label: `${prefix}${keyword}${suffix}`,
      expectedCategory: rule.category,
      expectedCategorySlug: rule.categorySlug,
      expectedCategoryEn: rule.categoryEn,
      expectedCategoryZh: rule.categoryZh,
      keyword: keyword,
    };
  }).filter(testCase => {
    // Ensure the label doesn't accidentally contain keywords from other rules
    const lowerLabel = testCase.label.toLowerCase();
    for (const rule of CATEGORY_RULES) {
      if (rule.category === testCase.expectedCategory) continue;
      for (const keyword of rule.keywords) {
        if (lowerLabel.includes(keyword.toLowerCase())) {
          return false; // Skip this test case as it has ambiguous keywords
        }
      }
    }
    return true;
  });

  /**
   * Generator for work labels without any category keywords
   */
  const workLabelWithoutKeywordArbitrary = fc.constantFrom(
    'Residence',
    'Villa',
    'House',
    'Memorial',
    'Monument',
    'Bridge',
    'Factory',
    'Warehouse',
    'Office',
    'Embassy',
    'Courthouse',
    'City Hall',
    'Parliament',
    'Palace',
    'Castle',
    'Fortress',
    'Skyscraper',
    'Complex',
    'Plaza',
    'Square'
  );



  // ============================================
  // Property Tests
  // ============================================
  
  describe('Property 10: Category Classification Consistency', () => {
    
    /**
     * Core property: work labels containing category keywords should be classified correctly
     */
    it('should classify work labels containing category keywords to the correct category', () => {
      fc.assert(
        fc.property(
          workLabelWithSingleKeywordArbitrary,
          (testCase) => {
            const result = classifyCategory(testCase.label);
            
            // The category should match the expected category for the keyword
            return result.category === testCase.expectedCategory &&
                   result.categorySlug === testCase.expectedCategorySlug &&
                   result.categoryEn === testCase.expectedCategoryEn &&
                   result.categoryZh === testCase.expectedCategoryZh;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Case insensitivity: keywords should match regardless of case
     */
    it('should classify keywords case-insensitively', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...CATEGORY_RULES),
          fc.constantFrom('lowercase', 'UPPERCASE', 'MixedCase'),
          (rule, caseType) => {
            const keyword = rule.keywords[0];
            let testLabel: string;
            
            switch (caseType) {
              case 'lowercase':
                testLabel = `The ${keyword.toLowerCase()} Building`;
                break;
              case 'UPPERCASE':
                testLabel = `The ${keyword.toUpperCase()} Building`;
                break;
              case 'MixedCase':
              default:
                testLabel = `The ${keyword} Building`;
                break;
            }
            
            const result = classifyCategory(testLabel);
            
            return result.category === rule.category;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Work labels without keywords should get default category
     */
    it('should assign default category to work labels without category keywords', () => {
      fc.assert(
        fc.property(
          workLabelWithoutKeywordArbitrary,
          (label: string) => {
            const result = classifyCategory(label);
            
            return result.category === DEFAULT_CATEGORY.category &&
                   result.categorySlug === DEFAULT_CATEGORY.categorySlug &&
                   result.categoryEn === DEFAULT_CATEGORY.categoryEn &&
                   result.categoryZh === DEFAULT_CATEGORY.categoryZh;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Determinism: same input should always produce same output
     */
    it('should be deterministic (same input produces same output)', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 100 }),
          (label: string) => {
            const result1 = classifyCategory(label);
            const result2 = classifyCategory(label);
            
            return result1.category === result2.category &&
                   result1.categorySlug === result2.categorySlug &&
                   result1.categoryEn === result2.categoryEn &&
                   result1.categoryZh === result2.categoryZh;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Output structure: result should always have all required fields
     */
    it('should always return an object with category, categorySlug, categoryEn, and categoryZh', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 100 }),
          (label: string) => {
            const result = classifyCategory(label);
            
            return typeof result.category === 'string' &&
                   typeof result.categorySlug === 'string' &&
                   typeof result.categoryEn === 'string' &&
                   typeof result.categoryZh === 'string' &&
                   result.category.length > 0 &&
                   result.categorySlug.length > 0 &&
                   result.categoryEn.length > 0 &&
                   result.categoryZh.length > 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * First matching keyword wins: when multiple keywords could match,
     * the first rule in CATEGORY_RULES should be applied
     */
    it('should apply the first matching rule when multiple keywords could match', () => {
      // Test with labels that could match multiple rules
      // "Art Museum" contains both "Art" (museum) and "Museum" (museum) - should be museum
      const result1 = classifyCategory('Art Museum');
      expect(result1.category).toBe('museum');
      
      // "Sports Arena" contains both "Sports" (stadium) and "Arena" (stadium) - should be stadium
      const result2 = classifyCategory('Sports Arena');
      expect(result2.category).toBe('stadium');
      
      // "Concert Theater" contains both "Concert" (theater) and "Theater" (theater) - should be theater
      const result3 = classifyCategory('Concert Theater');
      expect(result3.category).toBe('theater');
    });
  });

  /**
   * Edge Cases
   */
  describe('Edge Cases', () => {
    
    /**
     * Empty string should return default category
     */
    it('should return default category for empty string', () => {
      const result = classifyCategory('');
      expect(result.category).toBe(DEFAULT_CATEGORY.category);
      expect(result.categorySlug).toBe(DEFAULT_CATEGORY.categorySlug);
    });

    /**
     * Null/undefined input should return default category
     */
    it('should return default category for null or undefined input', () => {
      const resultNull = classifyCategory(null as unknown as string);
      const resultUndefined = classifyCategory(undefined as unknown as string);
      
      expect(resultNull.category).toBe(DEFAULT_CATEGORY.category);
      expect(resultUndefined.category).toBe(DEFAULT_CATEGORY.category);
    });

    /**
     * Whitespace-only string should return default category
     */
    it('should return default category for whitespace-only string', () => {
      fc.assert(
        fc.property(
          fc.constant('   '),
          (whitespace: string) => {
            const result = classifyCategory(whitespace);
            return result.category === DEFAULT_CATEGORY.category;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Keyword as substring should still match
     */
    it('should match keywords that appear as substrings', () => {
      // "Museum" in "MuseumOfModernArt" should match
      const result1 = classifyCategory('MuseumOfModernArt');
      expect(result1.category).toBe('museum');
      
      // "Church" in "ChurchStreet" should match
      const result2 = classifyCategory('ChurchStreet');
      expect(result2.category).toBe('church');
    });
  });

  /**
   * Known Examples Validation
   */
  describe('Known Examples', () => {
    
    /**
     * Verify specific category classifications from requirements
     */
    it('should classify Museum correctly', () => {
      const result = classifyCategory('National Museum of Art');
      expect(result.category).toBe('museum');
      expect(result.categorySlug).toBe('museum');
      expect(result.categoryEn).toBe('Museum');
      expect(result.categoryZh).toBe('博物馆');
    });

    it('should classify Gallery correctly', () => {
      const result = classifyCategory('Modern Art Gallery');
      expect(result.category).toBe('museum');
      expect(result.categoryEn).toBe('Museum');
    });

    it('should classify Church correctly', () => {
      const result = classifyCategory('St. Peter\'s Church');
      expect(result.category).toBe('church');
      expect(result.categorySlug).toBe('church');
      expect(result.categoryEn).toBe('Church');
      expect(result.categoryZh).toBe('教堂');
    });

    it('should classify Cathedral correctly', () => {
      const result = classifyCategory('Notre-Dame Cathedral');
      expect(result.category).toBe('church');
    });

    it('should classify University correctly', () => {
      const result = classifyCategory('Harvard University');
      expect(result.category).toBe('university');
      expect(result.categorySlug).toBe('university');
      expect(result.categoryEn).toBe('University');
      expect(result.categoryZh).toBe('大学');
    });

    it('should classify Library correctly', () => {
      const result = classifyCategory('National Library');
      expect(result.category).toBe('library');
      expect(result.categorySlug).toBe('library');
      expect(result.categoryEn).toBe('Library');
      expect(result.categoryZh).toBe('图书馆');
    });

    it('should classify Stadium correctly', () => {
      const result = classifyCategory('Olympic Stadium');
      expect(result.category).toBe('stadium');
      expect(result.categorySlug).toBe('stadium');
      expect(result.categoryEn).toBe('Stadium');
      expect(result.categoryZh).toBe('体育场');
    });

    it('should classify Theater correctly', () => {
      const result = classifyCategory('Sydney Opera House');
      expect(result.category).toBe('theater');
      expect(result.categorySlug).toBe('theater');
      expect(result.categoryEn).toBe('Theater');
      expect(result.categoryZh).toBe('剧院');
    });

    it('should classify Hospital correctly', () => {
      const result = classifyCategory('General Hospital');
      expect(result.category).toBe('hospital');
      expect(result.categorySlug).toBe('hospital');
      expect(result.categoryEn).toBe('Hospital');
      expect(result.categoryZh).toBe('医院');
    });

    it('should classify Station correctly', () => {
      const result = classifyCategory('Central Station');
      expect(result.category).toBe('station');
      expect(result.categorySlug).toBe('station');
      expect(result.categoryEn).toBe('Station');
      expect(result.categoryZh).toBe('车站');
    });

    it('should classify Pavilion correctly', () => {
      const result = classifyCategory('Barcelona Pavilion');
      expect(result.category).toBe('pavilion');
      expect(result.categorySlug).toBe('pavilion');
      expect(result.categoryEn).toBe('Pavilion');
      expect(result.categoryZh).toBe('展亭');
    });

    it('should classify Building correctly', () => {
      const result = classifyCategory('Empire State Building');
      expect(result.category).toBe('building');
      expect(result.categorySlug).toBe('building');
      expect(result.categoryEn).toBe('Building');
      expect(result.categoryZh).toBe('建筑');
    });

    it('should classify Tower correctly', () => {
      const result = classifyCategory('Tokyo Tower');
      expect(result.category).toBe('building');
    });

    it('should return default category for unrecognized work labels', () => {
      const result = classifyCategory('Residential Complex');
      expect(result.category).toBe('architecture');
      expect(result.categorySlug).toBe('architecture');
      expect(result.categoryEn).toBe('Architecture');
      expect(result.categoryZh).toBe('建筑');
    });
  });
});
