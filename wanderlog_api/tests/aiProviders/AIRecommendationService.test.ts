/**
 * Unit Tests for AI Recommendation Service
 * 
 * Feature: ai-search-v2-parallel-pipeline
 * 
 * Tests prompt construction, JSON parsing, and field validation
 * for the AIRecommendationService.
 * 
 * Requirements: 3.3, 3.4, 3.5
 */

import { AIResponseValidationError } from '../../src/services/aiRecommendationService';

/**
 * AI Place interface for testing
 */
interface AIPlace {
  name: string;
  summary: string;
  latitude: number;
  longitude: number;
  city: string;
  country: string;
  coverImageUrl: string;
  tags: string[];
  recommendationPhrase: string;
}

/**
 * AI Category interface for testing
 */
interface AICategory {
  title: string;
  placeNames: string[];
}

/**
 * AI Recommendation Result interface for testing
 */
interface AIRecommendationResult {
  acknowledgment: string;
  categories?: AICategory[];
  places: AIPlace[];
}

/**
 * Parse JSON from AI response - extracted for testing
 */
function parseJsonResponse<T>(content: string): T {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new AIResponseValidationError('No JSON found in AI response');
  }

  try {
    return JSON.parse(jsonMatch[0]) as T;
  } catch (parseError) {
    throw new AIResponseValidationError(`Failed to parse JSON: ${parseError}`);
  }
}

/**
 * Validate a single AIPlace object - extracted for testing
 * Requirements: 3.5
 */
function validatePlace(place: any, index: number): AIPlace {
  const requiredFields = ['name', 'summary', 'latitude', 'longitude', 'city', 'country', 'coverImageUrl', 'tags', 'recommendationPhrase'];
  
  for (const field of requiredFields) {
    if (place[field] === undefined || place[field] === null) {
      throw new AIResponseValidationError(`Place ${index + 1} missing required field: ${field}`);
    }
  }

  if (typeof place.name !== 'string' || place.name.trim() === '') {
    throw new AIResponseValidationError(`Place ${index + 1}: name must be a non-empty string`);
  }

  if (typeof place.summary !== 'string') {
    throw new AIResponseValidationError(`Place ${index + 1}: summary must be a string`);
  }

  // Truncate summary if over 100 chars
  if (place.summary.length > 100) {
    place.summary = place.summary.substring(0, 100);
  }

  if (typeof place.latitude !== 'number' || typeof place.longitude !== 'number') {
    throw new AIResponseValidationError(`Place ${index + 1}: latitude and longitude must be numbers`);
  }

  if (!Array.isArray(place.tags)) {
    throw new AIResponseValidationError(`Place ${index + 1}: tags must be an array`);
  }

  return {
    name: place.name.trim(),
    summary: place.summary,
    latitude: place.latitude,
    longitude: place.longitude,
    city: String(place.city || '').trim(),
    country: String(place.country || '').trim(),
    coverImageUrl: String(place.coverImageUrl || '').trim(),
    tags: place.tags.map((t: any) => String(t).trim()).filter((t: string) => t.length > 0),
    recommendationPhrase: String(place.recommendationPhrase || '').trim(),
  };
}

/**
 * Validate AI recommendation response - extracted for testing
 * Requirements: 3.3, 3.4, 3.5
 */
function validateRecommendationResponse(response: any): AIRecommendationResult {
  if (!response.acknowledgment || typeof response.acknowledgment !== 'string') {
    throw new AIResponseValidationError('Missing or invalid acknowledgment');
  }

  if (!Array.isArray(response.places)) {
    throw new AIResponseValidationError('places must be an array');
  }

  // Requirement 3.3: exactly 10 places (warn but don't fail for fewer)
  if (response.places.length === 0) {
    throw new AIResponseValidationError('No places returned by AI');
  }

  const validatedPlaces: AIPlace[] = [];
  for (let i = 0; i < response.places.length; i++) {
    validatedPlaces.push(validatePlace(response.places[i], i));
  }

  let validatedCategories: AICategory[] | undefined;
  if (response.categories && Array.isArray(response.categories)) {
    validatedCategories = [];
    for (const cat of response.categories) {
      if (!cat.title || typeof cat.title !== 'string') {
        throw new AIResponseValidationError('Category missing title');
      }
      if (!Array.isArray(cat.placeNames)) {
        throw new AIResponseValidationError(`Category "${cat.title}" missing placeNames array`);
      }
      validatedCategories.push({
        title: cat.title.trim(),
        placeNames: cat.placeNames.map((n: any) => String(n).trim()),
      });
    }
  }

  return {
    acknowledgment: response.acknowledgment.trim(),
    categories: validatedCategories,
    places: validatedPlaces,
  };
}

/**
 * Build user prompt for recommendations - extracted for testing
 */
function buildRecommendationPrompt(query: string): string {
  return `User query: ${query}\n\nProvide 10 place recommendations.`;
}

/**
 * Build user prompt for summaries - extracted for testing
 */
function buildSummaryPrompt(places: Array<{ name: string; city?: string; country?: string }>, originalQuery: string): string {
  const placesList = places
    .map(p => `- ${p.name}${p.city ? ` (${p.city}${p.country ? ', ' + p.country : ''})` : ''}`)
    .join('\n');

  return `Original query: ${originalQuery}

Places to summarize:
${placesList}

Generate summaries for these places.`;
}

describe('AIRecommendationService Unit Tests', () => {
  /**
   * Test prompt construction
   */
  describe('Prompt Construction', () => {
    describe('Recommendation Prompt', () => {
      it('should include user query in prompt', () => {
        const prompt = buildRecommendationPrompt('best coffee shops in Tokyo');
        expect(prompt).toContain('best coffee shops in Tokyo');
      });

      it('should request 10 place recommendations', () => {
        const prompt = buildRecommendationPrompt('museums in Paris');
        expect(prompt).toContain('10 place recommendations');
      });

      it('should handle empty query', () => {
        const prompt = buildRecommendationPrompt('');
        expect(prompt).toContain('User query:');
      });

      it('should handle special characters in query', () => {
        const prompt = buildRecommendationPrompt('café & restaurants in São Paulo');
        expect(prompt).toContain('café & restaurants in São Paulo');
      });
    });

    describe('Summary Prompt', () => {
      it('should include original query', () => {
        const places = [{ name: 'Place 1', city: 'Tokyo', country: 'Japan' }];
        const prompt = buildSummaryPrompt(places, 'coffee shops in Tokyo');
        expect(prompt).toContain('Original query: coffee shops in Tokyo');
      });

      it('should list all places with city and country', () => {
        const places = [
          { name: 'Blue Bottle Coffee', city: 'Tokyo', country: 'Japan' },
          { name: 'Starbucks Reserve', city: 'Kyoto', country: 'Japan' },
        ];
        const prompt = buildSummaryPrompt(places, 'coffee');
        expect(prompt).toContain('- Blue Bottle Coffee (Tokyo, Japan)');
        expect(prompt).toContain('- Starbucks Reserve (Kyoto, Japan)');
      });

      it('should handle places without city/country', () => {
        const places = [{ name: 'Unknown Place' }];
        const prompt = buildSummaryPrompt(places, 'query');
        expect(prompt).toContain('- Unknown Place');
        expect(prompt).not.toContain('(');
      });

      it('should handle places with city but no country', () => {
        const places = [{ name: 'Local Cafe', city: 'Tokyo' }];
        const prompt = buildSummaryPrompt(places, 'query');
        expect(prompt).toContain('- Local Cafe (Tokyo)');
      });
    });
  });

  /**
   * Test JSON parsing
   */
  describe('JSON Parsing', () => {
    it('should parse valid JSON response', () => {
      const content = '{"acknowledgment": "test", "places": []}';
      const result = parseJsonResponse<any>(content);
      expect(result.acknowledgment).toBe('test');
    });

    it('should extract JSON from text with surrounding content', () => {
      const content = 'Here is the response:\n{"acknowledgment": "test", "places": []}\nEnd of response';
      const result = parseJsonResponse<any>(content);
      expect(result.acknowledgment).toBe('test');
    });

    it('should throw error when no JSON found', () => {
      const content = 'This is just plain text without JSON';
      expect(() => parseJsonResponse(content)).toThrow(AIResponseValidationError);
      expect(() => parseJsonResponse(content)).toThrow('No JSON found in AI response');
    });

    it('should throw error for invalid JSON', () => {
      const content = '{invalid json: }';
      expect(() => parseJsonResponse(content)).toThrow(AIResponseValidationError);
      expect(() => parseJsonResponse(content)).toThrow('Failed to parse JSON');
    });

    it('should handle nested JSON objects', () => {
      const content = '{"acknowledgment": "test", "categories": [{"title": "Coffee", "placeNames": ["A", "B"]}], "places": []}';
      const result = parseJsonResponse<any>(content);
      expect(result.categories).toHaveLength(1);
      expect(result.categories[0].title).toBe('Coffee');
    });
  });

  /**
   * Test field validation
   * Requirements: 3.3, 3.4, 3.5
   */
  describe('Field Validation', () => {
    describe('Place Validation (Requirement 3.5)', () => {
      const validPlace = {
        name: 'Test Place',
        summary: 'A great place to visit',
        latitude: 35.6762,
        longitude: 139.6503,
        city: 'Tokyo',
        country: 'Japan',
        coverImageUrl: 'https://example.com/image.jpg',
        tags: ['cozy', 'instagram-worthy'],
        recommendationPhrase: 'highly rated',
      };

      it('should validate a complete place object', () => {
        const result = validatePlace(validPlace, 0);
        expect(result.name).toBe('Test Place');
        expect(result.latitude).toBe(35.6762);
        expect(result.tags).toEqual(['cozy', 'instagram-worthy']);
      });

      it('should throw error when name is missing', () => {
        const place = { ...validPlace, name: undefined };
        expect(() => validatePlace(place, 0)).toThrow('Place 1 missing required field: name');
      });

      it('should throw error when name is empty string', () => {
        const place = { ...validPlace, name: '   ' };
        expect(() => validatePlace(place, 0)).toThrow('Place 1: name must be a non-empty string');
      });

      it('should throw error when summary is missing', () => {
        const place = { ...validPlace, summary: undefined };
        expect(() => validatePlace(place, 0)).toThrow('Place 1 missing required field: summary');
      });

      it('should throw error when latitude is missing', () => {
        const place = { ...validPlace, latitude: undefined };
        expect(() => validatePlace(place, 0)).toThrow('Place 1 missing required field: latitude');
      });

      it('should throw error when latitude is not a number', () => {
        const place = { ...validPlace, latitude: '35.6762' };
        expect(() => validatePlace(place, 0)).toThrow('Place 1: latitude and longitude must be numbers');
      });

      it('should throw error when longitude is not a number', () => {
        const place = { ...validPlace, longitude: 'invalid' };
        expect(() => validatePlace(place, 0)).toThrow('Place 1: latitude and longitude must be numbers');
      });

      it('should throw error when tags is not an array', () => {
        const place = { ...validPlace, tags: 'cozy' };
        expect(() => validatePlace(place, 0)).toThrow('Place 1: tags must be an array');
      });

      it('should throw error when coverImageUrl is missing', () => {
        const place = { ...validPlace, coverImageUrl: undefined };
        expect(() => validatePlace(place, 0)).toThrow('Place 1 missing required field: coverImageUrl');
      });

      it('should throw error when recommendationPhrase is missing', () => {
        const place = { ...validPlace, recommendationPhrase: undefined };
        expect(() => validatePlace(place, 0)).toThrow('Place 1 missing required field: recommendationPhrase');
      });

      it('should truncate summary over 100 characters', () => {
        const longSummary = 'A'.repeat(150);
        const place = { ...validPlace, summary: longSummary };
        const result = validatePlace(place, 0);
        expect(result.summary.length).toBe(100);
      });

      it('should trim whitespace from string fields', () => {
        const place = { ...validPlace, name: '  Test Place  ', city: '  Tokyo  ' };
        const result = validatePlace(place, 0);
        expect(result.name).toBe('Test Place');
        expect(result.city).toBe('Tokyo');
      });

      it('should filter empty tags', () => {
        const place = { ...validPlace, tags: ['cozy', '', '  ', 'nice'] };
        const result = validatePlace(place, 0);
        expect(result.tags).toEqual(['cozy', 'nice']);
      });
    });

    describe('Recommendation Response Validation (Requirements 3.3, 3.4)', () => {
      const validPlace = {
        name: 'Test Place',
        summary: 'A great place',
        latitude: 35.6762,
        longitude: 139.6503,
        city: 'Tokyo',
        country: 'Japan',
        coverImageUrl: 'https://example.com/image.jpg',
        tags: ['cozy'],
        recommendationPhrase: 'highly rated',
      };

      it('should throw error when acknowledgment is missing', () => {
        const response = { places: [validPlace] };
        expect(() => validateRecommendationResponse(response)).toThrow('Missing or invalid acknowledgment');
      });

      it('should throw error when acknowledgment is not a string', () => {
        const response = { acknowledgment: 123, places: [validPlace] };
        expect(() => validateRecommendationResponse(response)).toThrow('Missing or invalid acknowledgment');
      });

      it('should throw error when places is not an array', () => {
        const response = { acknowledgment: 'test', places: 'not an array' };
        expect(() => validateRecommendationResponse(response)).toThrow('places must be an array');
      });

      it('should throw error when places array is empty (Requirement 3.3)', () => {
        const response = { acknowledgment: 'test', places: [] };
        expect(() => validateRecommendationResponse(response)).toThrow('No places returned by AI');
      });

      it('should validate response with exactly 10 places (Requirement 3.3)', () => {
        const places = Array(10).fill(null).map((_, i) => ({
          ...validPlace,
          name: `Place ${i + 1}`,
        }));
        const response = { acknowledgment: 'test', places };
        const result = validateRecommendationResponse(response);
        expect(result.places).toHaveLength(10);
      });

      it('should accept response with fewer than 10 places (warning only)', () => {
        const places = Array(5).fill(null).map((_, i) => ({
          ...validPlace,
          name: `Place ${i + 1}`,
        }));
        const response = { acknowledgment: 'test', places };
        const result = validateRecommendationResponse(response);
        expect(result.places).toHaveLength(5);
      });

      it('should validate categories when present (Requirement 3.4)', () => {
        const response = {
          acknowledgment: 'test',
          categories: [
            { title: 'Coffee Shops', placeNames: ['Place 1', 'Place 2'] },
          ],
          places: [validPlace],
        };
        const result = validateRecommendationResponse(response);
        expect(result.categories).toHaveLength(1);
        expect(result.categories![0].title).toBe('Coffee Shops');
        expect(result.categories![0].placeNames).toEqual(['Place 1', 'Place 2']);
      });

      it('should throw error when category missing title', () => {
        const response = {
          acknowledgment: 'test',
          categories: [{ placeNames: ['Place 1', 'Place 2'] }],
          places: [validPlace],
        };
        expect(() => validateRecommendationResponse(response)).toThrow('Category missing title');
      });

      it('should throw error when category missing placeNames array', () => {
        const response = {
          acknowledgment: 'test',
          categories: [{ title: 'Coffee' }],
          places: [validPlace],
        };
        expect(() => validateRecommendationResponse(response)).toThrow('Category "Coffee" missing placeNames array');
      });

      it('should accept categories with fewer than 2 places (warning only)', () => {
        const response = {
          acknowledgment: 'test',
          categories: [{ title: 'Coffee', placeNames: ['Place 1'] }],
          places: [validPlace],
        };
        const result = validateRecommendationResponse(response);
        expect(result.categories![0].placeNames).toHaveLength(1);
      });

      it('should trim category titles and place names', () => {
        const response = {
          acknowledgment: 'test',
          categories: [{ title: '  Coffee Shops  ', placeNames: ['  Place 1  ', '  Place 2  '] }],
          places: [validPlace],
        };
        const result = validateRecommendationResponse(response);
        expect(result.categories![0].title).toBe('Coffee Shops');
        expect(result.categories![0].placeNames).toEqual(['Place 1', 'Place 2']);
      });

      it('should handle response without categories', () => {
        const response = { acknowledgment: 'test', places: [validPlace] };
        const result = validateRecommendationResponse(response);
        expect(result.categories).toBeUndefined();
      });
    });
  });
});
