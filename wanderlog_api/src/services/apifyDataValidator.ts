/**
 * Apify Data Validator Service
 * 
 * Validates Apify Google Places data before import.
 * Ensures required fields are present and data formats are correct.
 * 
 * Requirements: 2.8
 */

import {
  ApifyPlaceItem,
  ValidationResult,
} from '../types/apify';

// ============================================
// Constants
// ============================================

/**
 * Valid latitude range
 */
const LATITUDE_MIN = -90;
const LATITUDE_MAX = 90;

/**
 * Valid longitude range
 */
const LONGITUDE_MIN = -180;
const LONGITUDE_MAX = 180;

/**
 * Valid rating range
 */
const RATING_MIN = 0;
const RATING_MAX = 5;

/**
 * ISO2 country code pattern
 */
const ISO2_COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

/**
 * Google Place ID pattern (starts with ChIJ)
 */
const GOOGLE_PLACE_ID_PATTERN = /^ChIJ[A-Za-z0-9_-]+$/;

// ============================================
// ApifyDataValidator Class
// ============================================

class ApifyDataValidator {
  /**
   * Validates that all required fields are present
   * 
   * Requirement 2.8: IF 缺少必填字段（placeId、city、countryCode、latitude、longitude）
   * THEN THE Import_Service SHALL 跳过该记录并记录警告
   * 
   * Required fields:
   * - placeId: Google Place ID
   * - city: City name
   * - countryCode: ISO2 country code
   * - location.lat: Latitude
   * - location.lng: Longitude
   */
  validateRequired(item: ApifyPlaceItem): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check placeId
    if (!item.placeId) {
      errors.push('Missing required field: placeId');
    } else if (typeof item.placeId !== 'string' || item.placeId.trim() === '') {
      errors.push('Invalid placeId: must be a non-empty string');
    }

    // Check city
    if (!item.city) {
      errors.push('Missing required field: city');
    } else if (typeof item.city !== 'string' || item.city.trim() === '') {
      errors.push('Invalid city: must be a non-empty string');
    }

    // Check countryCode
    if (!item.countryCode) {
      errors.push('Missing required field: countryCode');
    } else if (typeof item.countryCode !== 'string' || item.countryCode.trim() === '') {
      errors.push('Invalid countryCode: must be a non-empty string');
    }

    // Check location
    if (!item.location) {
      errors.push('Missing required field: location');
    } else {
      // Check latitude
      if (item.location.lat === undefined || item.location.lat === null) {
        errors.push('Missing required field: location.lat');
      } else if (typeof item.location.lat !== 'number' || isNaN(item.location.lat)) {
        errors.push('Invalid location.lat: must be a valid number');
      }

      // Check longitude
      if (item.location.lng === undefined || item.location.lng === null) {
        errors.push('Missing required field: location.lng');
      } else if (typeof item.location.lng !== 'number' || isNaN(item.location.lng)) {
        errors.push('Invalid location.lng: must be a valid number');
      }
    }

    // Add warnings for optional but recommended fields
    if (!item.title) {
      warnings.push('Missing recommended field: title');
    }

    if (!item.address) {
      warnings.push('Missing recommended field: address');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validates data format correctness
   * 
   * Checks:
   * - Latitude is within valid range (-90 to 90)
   * - Longitude is within valid range (-180 to 180)
   * - Country code is valid ISO2 format
   * - Rating is within valid range (0 to 5)
   * - Place ID matches expected format
   */
  validateFormat(item: ApifyPlaceItem): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate latitude range
    if (item.location && typeof item.location.lat === 'number' && !isNaN(item.location.lat)) {
      if (item.location.lat < LATITUDE_MIN || item.location.lat > LATITUDE_MAX) {
        errors.push(`Invalid latitude: ${item.location.lat} is out of range [${LATITUDE_MIN}, ${LATITUDE_MAX}]`);
      }
    }

    // Validate longitude range
    if (item.location && typeof item.location.lng === 'number' && !isNaN(item.location.lng)) {
      if (item.location.lng < LONGITUDE_MIN || item.location.lng > LONGITUDE_MAX) {
        errors.push(`Invalid longitude: ${item.location.lng} is out of range [${LONGITUDE_MIN}, ${LONGITUDE_MAX}]`);
      }
    }

    // Validate country code format (ISO2)
    if (item.countryCode && typeof item.countryCode === 'string') {
      if (!ISO2_COUNTRY_CODE_PATTERN.test(item.countryCode)) {
        warnings.push(`Country code '${item.countryCode}' does not match ISO2 format (e.g., 'FR', 'US')`);
      }
    }

    // Validate rating range
    if (item.totalScore !== null && item.totalScore !== undefined) {
      if (typeof item.totalScore !== 'number' || isNaN(item.totalScore)) {
        warnings.push('Invalid totalScore: must be a valid number');
      } else if (item.totalScore < RATING_MIN || item.totalScore > RATING_MAX) {
        warnings.push(`Rating ${item.totalScore} is out of expected range [${RATING_MIN}, ${RATING_MAX}]`);
      }
    }

    // Validate reviews count
    if (item.reviewsCount !== null && item.reviewsCount !== undefined) {
      if (typeof item.reviewsCount !== 'number' || isNaN(item.reviewsCount)) {
        warnings.push('Invalid reviewsCount: must be a valid number');
      } else if (item.reviewsCount < 0) {
        warnings.push(`Reviews count ${item.reviewsCount} cannot be negative`);
      }
    }

    // Validate place ID format
    if (item.placeId && typeof item.placeId === 'string') {
      if (!GOOGLE_PLACE_ID_PATTERN.test(item.placeId)) {
        warnings.push(`Place ID '${item.placeId}' does not match expected Google Place ID format`);
      }
    }

    // Validate opening hours structure
    if (item.openingHours && Array.isArray(item.openingHours)) {
      for (let i = 0; i < item.openingHours.length; i++) {
        const entry = item.openingHours[i];
        if (!entry.day || typeof entry.day !== 'string') {
          warnings.push(`Opening hours entry ${i}: missing or invalid 'day' field`);
        }
        if (!entry.hours || typeof entry.hours !== 'string') {
          warnings.push(`Opening hours entry ${i}: missing or invalid 'hours' field`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Performs full validation (required fields + format)
   * 
   * Combines validateRequired and validateFormat for comprehensive validation.
   */
  validate(item: ApifyPlaceItem): ValidationResult {
    const requiredResult = this.validateRequired(item);
    const formatResult = this.validateFormat(item);

    return {
      valid: requiredResult.valid && formatResult.valid,
      errors: [...requiredResult.errors, ...formatResult.errors],
      warnings: [...requiredResult.warnings, ...formatResult.warnings],
    };
  }

  /**
   * Checks if an item should be skipped based on validation
   * 
   * Returns true if the item is missing required fields and should be skipped.
   */
  shouldSkip(item: ApifyPlaceItem): boolean {
    const result = this.validateRequired(item);
    return !result.valid;
  }

  /**
   * Gets a summary of validation issues for logging
   */
  getValidationSummary(item: ApifyPlaceItem): string {
    const result = this.validate(item);
    
    if (result.valid && result.warnings.length === 0) {
      return 'Valid';
    }

    const parts: string[] = [];
    
    if (!result.valid) {
      parts.push(`Errors: ${result.errors.join('; ')}`);
    }
    
    if (result.warnings.length > 0) {
      parts.push(`Warnings: ${result.warnings.join('; ')}`);
    }

    return parts.join(' | ');
  }
}

// Export singleton instance
export const apifyDataValidator = new ApifyDataValidator();

// Export class for testing
export { ApifyDataValidator };

// Export constants for testing
export {
  LATITUDE_MIN,
  LATITUDE_MAX,
  LONGITUDE_MIN,
  LONGITUDE_MAX,
  RATING_MIN,
  RATING_MAX,
  ISO2_COUNTRY_CODE_PATTERN,
  GOOGLE_PLACE_ID_PATTERN,
};
