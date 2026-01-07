/**
 * Property-Based Tests for Wikidata CoordParser
 *
 * Feature: wikidata-import
 * Property 1: Coordinate Parsing Round-Trip
 * Validates: Requirements 1.3, 7.4, 7.5
 *
 * Tests the parseCoord function that parses Wikidata "Point(longitude latitude)" format
 */

import * as fc from 'fast-check';
import { parseCoord, formatCoord } from '../../src/services/wikidataImportUtils';

// Custom arbitrary for realistic coordinate values (no scientific notation)
const realisticLongitude = fc.double({ min: -180, max: 180, noNaN: true })
  .map(n => Math.round(n * 1000000) / 1000000); // 6 decimal places max

const realisticLatitude = fc.double({ min: -90, max: 90, noNaN: true })
  .map(n => Math.round(n * 1000000) / 1000000); // 6 decimal places max

describe('Wikidata CoordParser - Property Tests', () => {
  describe('Property 1: Coordinate Parsing Round-Trip', () => {
    /**
     * Property 1.1: Valid coordinates should parse successfully
     * For any valid longitude (-180 to 180) and latitude (-90 to 90),
     * parsing "Point(lng lat)" should return the correct coordinates
     *
     * **Validates: Requirements 1.3, 7.4, 7.5**
     */
    it('should parse valid coordinates correctly', () => {
      fc.assert(
        fc.property(
          realisticLongitude,
          realisticLatitude,
          (lng: number, lat: number) => {
            const coordStr = `Point(${lng} ${lat})`;
            const result = parseCoord(coordStr);

            // Result should not be null for valid inputs
            if (result === null) {
              return false;
            }

            // Parsed values should match input (within floating point tolerance)
            const lngMatch = Math.abs(result.longitude - lng) < 1e-10;
            const latMatch = Math.abs(result.latitude - lat) < 1e-10;

            return lngMatch && latMatch;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 1.2: Round-trip consistency
     * For any valid coordinate, parsing and then formatting back should produce
     * an equivalent coordinate string that parses to the same values
     *
     * **Validates: Requirements 1.3, 7.4, 7.5**
     */
    it('should maintain round-trip consistency', () => {
      fc.assert(
        fc.property(
          realisticLongitude,
          realisticLatitude,
          (lng: number, lat: number) => {
            const coordStr = `Point(${lng} ${lat})`;
            const parsed = parseCoord(coordStr);

            if (parsed === null) {
              return false;
            }

            // Format back to string
            const formatted = formatCoord(parsed);
            const reparsed = parseCoord(formatted);

            if (reparsed === null) {
              return false;
            }

            // Values should be equivalent
            const lngMatch = Math.abs(reparsed.longitude - parsed.longitude) < 1e-10;
            const latMatch = Math.abs(reparsed.latitude - parsed.latitude) < 1e-10;

            return lngMatch && latMatch;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 1.3: Longitude extraction correctness
     * The extracted longitude should match the first number in the Point format
     *
     * **Validates: Requirements 7.5**
     */
    it('should extract longitude as the first number', () => {
      fc.assert(
        fc.property(
          realisticLongitude,
          realisticLatitude,
          (lng: number, lat: number) => {
            const coordStr = `Point(${lng} ${lat})`;
            const result = parseCoord(coordStr);

            if (result === null) {
              return false;
            }

            // Longitude should be the first number
            return Math.abs(result.longitude - lng) < 1e-10;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 1.4: Latitude extraction correctness
     * The extracted latitude should match the second number in the Point format
     *
     * **Validates: Requirements 7.4**
     */
    it('should extract latitude as the second number', () => {
      fc.assert(
        fc.property(
          realisticLongitude,
          realisticLatitude,
          (lng: number, lat: number) => {
            const coordStr = `Point(${lng} ${lat})`;
            const result = parseCoord(coordStr);

            if (result === null) {
              return false;
            }

            // Latitude should be the second number
            return Math.abs(result.latitude - lat) < 1e-10;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 1.5: Out-of-range longitude should return null
     * Longitude values outside -180 to 180 should be rejected
     *
     * **Validates: Requirements 1.3**
     */
    it('should reject out-of-range longitude', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.integer({ min: -1000, max: -181 }),
            fc.integer({ min: 181, max: 1000 })
          ),
          realisticLatitude,
          (lng: number, lat: number) => {
            const coordStr = `Point(${lng} ${lat})`;
            const result = parseCoord(coordStr);
            return result === null;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 1.6: Out-of-range latitude should return null
     * Latitude values outside -90 to 90 should be rejected
     *
     * **Validates: Requirements 1.3**
     */
    it('should reject out-of-range latitude', () => {
      fc.assert(
        fc.property(
          realisticLongitude,
          fc.oneof(
            fc.integer({ min: -1000, max: -91 }),
            fc.integer({ min: 91, max: 1000 })
          ),
          (lng: number, lat: number) => {
            const coordStr = `Point(${lng} ${lat})`;
            const result = parseCoord(coordStr);
            return result === null;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 1.7: Invalid format should return null
     * Strings not matching "Point(lng lat)" format should return null
     *
     * **Validates: Requirements 1.3**
     */
    it('should return null for invalid formats', () => {
      const invalidFormats = [
        '',
        'invalid',
        'Point()',
        'Point(1)',
        'Point(abc def)',
        '(1 2)',
        'Point 1 2',
      ];

      for (const invalidCoord of invalidFormats) {
        const result = parseCoord(invalidCoord);
        expect(result).toBeNull();
      }
    });

    /**
     * Property 1.8: Case insensitivity
     * "POINT" and "point" should both work
     *
     * **Validates: Requirements 1.3**
     */
    it('should handle case insensitivity', () => {
      fc.assert(
        fc.property(
          realisticLongitude,
          realisticLatitude,
          fc.constantFrom('Point', 'POINT', 'point', 'PoInT'),
          (lng: number, lat: number, prefix: string) => {
            const coordStr = `${prefix}(${lng} ${lat})`;
            const result = parseCoord(coordStr);

            if (result === null) {
              return false;
            }

            return Math.abs(result.longitude - lng) < 1e-10 &&
                   Math.abs(result.latitude - lat) < 1e-10;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 1.9: Null and undefined input should return null
     *
     * **Validates: Requirements 1.3**
     */
    it('should return null for null or undefined input', () => {
      expect(parseCoord(null as unknown as string)).toBeNull();
      expect(parseCoord(undefined as unknown as string)).toBeNull();
      expect(parseCoord('')).toBeNull();
    });

    /**
     * Property 1.10: Whitespace handling
     * Extra whitespace should be handled gracefully
     *
     * **Validates: Requirements 1.3**
     */
    it('should handle whitespace in coordinates', () => {
      fc.assert(
        fc.property(
          realisticLongitude,
          realisticLatitude,
          (lng: number, lat: number) => {
            // Test with extra spaces
            const coordStr = `Point(  ${lng}   ${lat}  )`;
            const result = parseCoord(coordStr);

            if (result === null) {
              return false;
            }

            return Math.abs(result.longitude - lng) < 1e-10 &&
                   Math.abs(result.latitude - lat) < 1e-10;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
