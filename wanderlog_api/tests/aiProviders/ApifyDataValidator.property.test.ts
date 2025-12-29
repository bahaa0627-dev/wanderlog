/**
 * Property-Based Tests for Apify Data Validator Service
 * 
 * Feature: apify-data-import
 * 
 * Property 7: Required Fields Validation
 * *For any* Apify item missing required fields (placeId, city, countryCode, latitude, longitude),
 * the import should skip it and not create a Place record.
 * 
 * **Validates: Requirements 2.8**
 */

import * as fc from 'fast-check';
import {
  ApifyDataValidator,
} from '../../src/services/apifyDataValidator';
import {
  ApifyPlaceItem,
  ApifyLocation,
} from '../../src/types/apify';

// ============================================
// Test Data Generators
// ============================================

/**
 * Generator for valid latitude values (-90 to 90)
 */
const validLatitudeArbitrary = fc.double({ min: -90, max: 90, noNaN: true });

/**
 * Generator for valid longitude values (-180 to 180)
 */
const validLongitudeArbitrary = fc.double({ min: -180, max: 180, noNaN: true });

/**
 * Generator for invalid latitude values (outside -90 to 90)
 */
const invalidLatitudeArbitrary = fc.oneof(
  fc.double({ min: -1000, max: -90.001, noNaN: true }),
  fc.double({ min: 90.001, max: 1000, noNaN: true })
);

/**
 * Generator for invalid longitude values (outside -180 to 180)
 */
const invalidLongitudeArbitrary = fc.oneof(
  fc.double({ min: -1000, max: -180.001, noNaN: true }),
  fc.double({ min: 180.001, max: 1000, noNaN: true })
);

/**
 * Generator for valid ApifyLocation
 */
const validLocationArbitrary: fc.Arbitrary<ApifyLocation> = fc.record({
  lat: validLatitudeArbitrary,
  lng: validLongitudeArbitrary,
});

/**
 * Generator for non-empty strings
 */
const nonEmptyStringArbitrary = fc.string({ minLength: 1, maxLength: 100 })
  .filter(s => s.trim().length > 0);

/**
 * Generator for Google Place ID format
 */
const placeIdArbitrary = fc.stringMatching(/^ChIJ[A-Za-z0-9_-]{20,30}$/);

/**
 * Generator for ISO country codes (2 letters)
 */
const countryCodeArbitrary = fc.stringMatching(/^[A-Z]{2}$/);

/**
 * Generator for a complete valid ApifyPlaceItem (all required fields present)
 */
const validApifyPlaceItemArbitrary: fc.Arbitrary<ApifyPlaceItem> = fc.record({
  title: nonEmptyStringArbitrary,
  placeId: placeIdArbitrary,
  location: validLocationArbitrary,
  city: nonEmptyStringArbitrary,
  countryCode: countryCodeArbitrary,
});

/**
 * Generator for ApifyPlaceItem missing placeId
 */
const missingPlaceIdArbitrary: fc.Arbitrary<ApifyPlaceItem> = fc.record({
  title: nonEmptyStringArbitrary,
  placeId: fc.constant(undefined as unknown as string),
  location: validLocationArbitrary,
  city: nonEmptyStringArbitrary,
  countryCode: countryCodeArbitrary,
});

/**
 * Generator for ApifyPlaceItem missing city
 */
const missingCityArbitrary: fc.Arbitrary<ApifyPlaceItem> = fc.record({
  title: nonEmptyStringArbitrary,
  placeId: placeIdArbitrary,
  location: validLocationArbitrary,
  city: fc.constant(undefined as unknown as string),
  countryCode: countryCodeArbitrary,
});

/**
 * Generator for ApifyPlaceItem missing countryCode
 */
const missingCountryCodeArbitrary: fc.Arbitrary<ApifyPlaceItem> = fc.record({
  title: nonEmptyStringArbitrary,
  placeId: placeIdArbitrary,
  location: validLocationArbitrary,
  city: nonEmptyStringArbitrary,
  countryCode: fc.constant(undefined as unknown as string),
});

/**
 * Generator for ApifyPlaceItem missing location
 */
const missingLocationArbitrary: fc.Arbitrary<ApifyPlaceItem> = fc.record({
  title: nonEmptyStringArbitrary,
  placeId: placeIdArbitrary,
  location: fc.constant(undefined as unknown as ApifyLocation),
  city: nonEmptyStringArbitrary,
  countryCode: countryCodeArbitrary,
});

/**
 * Generator for ApifyPlaceItem with missing latitude
 */
const missingLatitudeArbitrary: fc.Arbitrary<ApifyPlaceItem> = fc.record({
  title: nonEmptyStringArbitrary,
  placeId: placeIdArbitrary,
  location: fc.record({
    lat: fc.constant(undefined as unknown as number),
    lng: validLongitudeArbitrary,
  }),
  city: nonEmptyStringArbitrary,
  countryCode: countryCodeArbitrary,
});

/**
 * Generator for ApifyPlaceItem with missing longitude
 */
const missingLongitudeArbitrary: fc.Arbitrary<ApifyPlaceItem> = fc.record({
  title: nonEmptyStringArbitrary,
  placeId: placeIdArbitrary,
  location: fc.record({
    lat: validLatitudeArbitrary,
    lng: fc.constant(undefined as unknown as number),
  }),
  city: nonEmptyStringArbitrary,
  countryCode: countryCodeArbitrary,
});

/**
 * Generator for ApifyPlaceItem with invalid latitude (out of range)
 */
const invalidLatitudeItemArbitrary: fc.Arbitrary<ApifyPlaceItem> = fc.record({
  title: nonEmptyStringArbitrary,
  placeId: placeIdArbitrary,
  location: fc.record({
    lat: invalidLatitudeArbitrary,
    lng: validLongitudeArbitrary,
  }),
  city: nonEmptyStringArbitrary,
  countryCode: countryCodeArbitrary,
});

/**
 * Generator for ApifyPlaceItem with invalid longitude (out of range)
 */
const invalidLongitudeItemArbitrary: fc.Arbitrary<ApifyPlaceItem> = fc.record({
  title: nonEmptyStringArbitrary,
  placeId: placeIdArbitrary,
  location: fc.record({
    lat: validLatitudeArbitrary,
    lng: invalidLongitudeArbitrary,
  }),
  city: nonEmptyStringArbitrary,
  countryCode: countryCodeArbitrary,
});

/**
 * Generator for any item missing at least one required field
 */
const missingRequiredFieldArbitrary = fc.oneof(
  missingPlaceIdArbitrary,
  missingCityArbitrary,
  missingCountryCodeArbitrary,
  missingLocationArbitrary,
  missingLatitudeArbitrary,
  missingLongitudeArbitrary
);

// ============================================
// Helper Functions
// ============================================

const validator = new ApifyDataValidator();

// ============================================
// Property Tests
// ============================================

describe('Apify Data Validator Property-Based Tests', () => {
  /**
   * Feature: apify-data-import, Property 7: Required Fields Validation
   * 
   * *For any* Apify item missing required fields (placeId, city, countryCode, latitude, longitude),
   * the import should skip it and not create a Place record.
   * 
   * **Validates: Requirements 2.8**
   */
  describe('Property 7: Required Fields Validation', () => {
    
    /**
     * Valid items should pass validation
     */
    it('should return valid=true for items with all required fields', () => {
      fc.assert(
        fc.property(
          validApifyPlaceItemArbitrary,
          (item: ApifyPlaceItem) => {
            const result = validator.validateRequired(item);
            return result.valid === true && result.errors.length === 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Items missing placeId should fail validation
     */
    it('should return valid=false for items missing placeId', () => {
      fc.assert(
        fc.property(
          missingPlaceIdArbitrary,
          (item: ApifyPlaceItem) => {
            const result = validator.validateRequired(item);
            return result.valid === false && 
                   result.errors.some(e => e.toLowerCase().includes('placeid'));
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Items missing city should fail validation
     */
    it('should return valid=false for items missing city', () => {
      fc.assert(
        fc.property(
          missingCityArbitrary,
          (item: ApifyPlaceItem) => {
            const result = validator.validateRequired(item);
            return result.valid === false && 
                   result.errors.some(e => e.toLowerCase().includes('city'));
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Items missing countryCode should fail validation
     */
    it('should return valid=false for items missing countryCode', () => {
      fc.assert(
        fc.property(
          missingCountryCodeArbitrary,
          (item: ApifyPlaceItem) => {
            const result = validator.validateRequired(item);
            return result.valid === false && 
                   result.errors.some(e => e.toLowerCase().includes('countrycode'));
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Items missing location should fail validation
     */
    it('should return valid=false for items missing location', () => {
      fc.assert(
        fc.property(
          missingLocationArbitrary,
          (item: ApifyPlaceItem) => {
            const result = validator.validateRequired(item);
            return result.valid === false && 
                   result.errors.some(e => e.toLowerCase().includes('location'));
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Items missing latitude should fail validation
     */
    it('should return valid=false for items missing latitude', () => {
      fc.assert(
        fc.property(
          missingLatitudeArbitrary,
          (item: ApifyPlaceItem) => {
            const result = validator.validateRequired(item);
            return result.valid === false && 
                   result.errors.some(e => e.toLowerCase().includes('lat'));
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Items missing longitude should fail validation
     */
    it('should return valid=false for items missing longitude', () => {
      fc.assert(
        fc.property(
          missingLongitudeArbitrary,
          (item: ApifyPlaceItem) => {
            const result = validator.validateRequired(item);
            return result.valid === false && 
                   result.errors.some(e => e.toLowerCase().includes('lng'));
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Any item missing a required field should be marked for skipping
     */
    it('should mark items with missing required fields for skipping', () => {
      fc.assert(
        fc.property(
          missingRequiredFieldArbitrary,
          (item: ApifyPlaceItem) => {
            return validator.shouldSkip(item) === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Valid items should not be marked for skipping
     */
    it('should not mark valid items for skipping', () => {
      fc.assert(
        fc.property(
          validApifyPlaceItemArbitrary,
          (item: ApifyPlaceItem) => {
            return validator.shouldSkip(item) === false;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Format Validation Tests
   */
  describe('Format Validation', () => {
    /**
     * Items with invalid latitude (out of range) should have format errors
     */
    it('should return format errors for latitude out of range', () => {
      fc.assert(
        fc.property(
          invalidLatitudeItemArbitrary,
          (item: ApifyPlaceItem) => {
            const result = validator.validateFormat(item);
            return result.valid === false && 
                   result.errors.some(e => e.toLowerCase().includes('latitude'));
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Items with invalid longitude (out of range) should have format errors
     */
    it('should return format errors for longitude out of range', () => {
      fc.assert(
        fc.property(
          invalidLongitudeItemArbitrary,
          (item: ApifyPlaceItem) => {
            const result = validator.validateFormat(item);
            return result.valid === false && 
                   result.errors.some(e => e.toLowerCase().includes('longitude'));
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Valid items should pass format validation
     */
    it('should return valid=true for items with valid format', () => {
      fc.assert(
        fc.property(
          validApifyPlaceItemArbitrary,
          (item: ApifyPlaceItem) => {
            const result = validator.validateFormat(item);
            return result.valid === true && result.errors.length === 0;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Combined Validation Tests
   */
  describe('Combined Validation', () => {
    /**
     * Full validation should combine required and format checks
     */
    it('should combine required and format validation', () => {
      fc.assert(
        fc.property(
          validApifyPlaceItemArbitrary,
          (item: ApifyPlaceItem) => {
            const result = validator.validate(item);
            const requiredResult = validator.validateRequired(item);
            const formatResult = validator.validateFormat(item);
            
            return result.valid === (requiredResult.valid && formatResult.valid);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Validation summary should reflect validation state
     */
    it('should provide accurate validation summary', () => {
      fc.assert(
        fc.property(
          validApifyPlaceItemArbitrary,
          (item: ApifyPlaceItem) => {
            const summary = validator.getValidationSummary(item);
            const result = validator.validate(item);
            
            if (result.valid && result.warnings.length === 0) {
              return summary === 'Valid';
            }
            return summary.length > 0;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Invariants
   */
  describe('Invariants', () => {
    /**
     * Validation should be deterministic
     */
    it('should produce consistent results for the same input', () => {
      fc.assert(
        fc.property(
          fc.oneof(validApifyPlaceItemArbitrary, missingRequiredFieldArbitrary),
          (item: ApifyPlaceItem) => {
            const result1 = validator.validate(item);
            const result2 = validator.validate(item);
            
            return result1.valid === result2.valid &&
                   result1.errors.length === result2.errors.length &&
                   result1.warnings.length === result2.warnings.length;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * shouldSkip should be consistent with validateRequired
     */
    it('should have shouldSkip consistent with validateRequired', () => {
      fc.assert(
        fc.property(
          fc.oneof(validApifyPlaceItemArbitrary, missingRequiredFieldArbitrary),
          (item: ApifyPlaceItem) => {
            const shouldSkip = validator.shouldSkip(item);
            const requiredResult = validator.validateRequired(item);
            
            return shouldSkip === !requiredResult.valid;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
