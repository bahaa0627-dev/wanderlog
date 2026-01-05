/**
 * Property-Based Tests for Intent Classifier Service
 * 
 * Feature: ai-intent-recognition
 * 
 * Property 1: Intent Classification Validity
 * *For any* user query, the Intent_Classifier SHALL return an intent that is one of 
 * the four valid types: `general_search`, `specific_place`, `travel_consultation`, or `non_travel`.
 * 
 * **Validates: Requirements 1.1**
 */

import * as fc from 'fast-check';
import { intentClassifierService } from '../../src/services/intentClassifierService';
import { IntentType, IntentResult } from '../../src/types/intent';

// ============================================
// Valid Intent Types
// ============================================

const VALID_INTENT_TYPES: IntentType[] = [
  'general_search',
  'specific_place',
  'travel_consultation',
  'non_travel',
];

// ============================================
// Test Data Generators
// ============================================

/**
 * Generator for random query strings (any text a user might type)
 */
const randomQueryArbitrary = fc.string({ minLength: 1, maxLength: 200 });

/**
 * Generator for English queries
 */
const englishQueryArbitrary = fc.oneof(
  // Specific place queries
  fc.constantFrom(
    'Eiffel Tower',
    'tell me about Louvre Museum',
    'Central Park',
    'Denmark Design Museum',
    'show me the Colosseum'
  ),
  // General search queries
  fc.constantFrom(
    '8 restaurants in Tokyo',
    'cafes in Paris',
    'best museums in Rome',
    'recommend places in Barcelona',
    '5 coffee shops near me'
  ),
  // Travel consultation queries
  fc.constantFrom(
    'Plan a 3-day trip to Rome',
    'Louvre vs Orsay which is better',
    'best time to visit Japan',
    'how many days in Paris',
    'Europe travel tips'
  ),
  // Non-travel queries
  fc.constantFrom(
    'weather today',
    'how to learn Python',
    'exercise routine',
    'feeling sad',
    'job interview tips'
  )
);

/**
 * Generator for Chinese queries
 */
const chineseQueryArbitrary = fc.oneof(
  // Specific place queries
  fc.constantFrom(
    '介绍一下埃菲尔铁塔',
    '卢浮宫博物馆',
    '告诉我关于故宫',
    '参观丹麦设计博物馆'
  ),
  // General search queries
  fc.constantFrom(
    '东京8家餐厅',
    '巴黎咖啡馆',
    '罗马最好的博物馆',
    '推荐巴塞罗那的地方'
  ),
  // Travel consultation queries
  fc.constantFrom(
    '欧洲哪里好玩',
    '东京和京都哪个更值得去',
    '巴黎三日游计划',
    '日本旅行建议'
  ),
  // Non-travel queries
  fc.constantFrom(
    '北京天气',
    '推荐运动方案',
    '心情不好怎么办',
    'Python怎么学',
    '工作面试技巧'
  )
);

/**
 * Generator for mixed language queries
 */
const mixedQueryArbitrary = fc.oneof(
  englishQueryArbitrary,
  chineseQueryArbitrary,
  randomQueryArbitrary
);

/**
 * Generator for language codes
 */
const languageArbitrary = fc.constantFrom('en', 'zh');

// ============================================
// Helper Functions
// ============================================

/**
 * Check if an intent is one of the four valid types
 */
function isValidIntentType(intent: string): intent is IntentType {
  return VALID_INTENT_TYPES.includes(intent as IntentType);
}

/**
 * Validate the structure of an IntentResult
 */
function isValidIntentResult(result: IntentResult): boolean {
  // Must have intent field
  if (!result || typeof result.intent !== 'string') {
    return false;
  }
  
  // Intent must be one of the four valid types
  if (!isValidIntentType(result.intent)) {
    return false;
  }
  
  // Optional fields should have correct types if present
  if (result.placeName !== undefined && typeof result.placeName !== 'string') {
    return false;
  }
  
  if (result.placeNames !== undefined && !Array.isArray(result.placeNames)) {
    return false;
  }
  
  if (result.city !== undefined && typeof result.city !== 'string') {
    return false;
  }
  
  if (result.category !== undefined && typeof result.category !== 'string') {
    return false;
  }
  
  if (result.count !== undefined && typeof result.count !== 'number') {
    return false;
  }
  
  if (result.confidence !== undefined && typeof result.confidence !== 'number') {
    return false;
  }
  
  return true;
}

// ============================================
// Property Tests
// ============================================

describe('Intent Classifier Property-Based Tests', () => {
  /**
   * Feature: ai-intent-recognition, Property 1: Intent Classification Validity
   * 
   * *For any* user query, the Intent_Classifier SHALL return an intent that is one of 
   * the four valid types: `general_search`, `specific_place`, `travel_consultation`, or `non_travel`.
   * 
   * **Validates: Requirements 1.1**
   */
  describe('Property 1: Intent Classification Validity', () => {
    
    /**
     * Fallback classification should always return a valid intent type
     * for any English query
     */
    it('should return valid intent type for any English query (fallback)', () => {
      fc.assert(
        fc.property(
          englishQueryArbitrary,
          (query: string) => {
            const result = intentClassifierService.fallbackClassify(query, 'en');
            return isValidIntentType(result.intent);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Fallback classification should always return a valid intent type
     * for any Chinese query
     */
    it('should return valid intent type for any Chinese query (fallback)', () => {
      fc.assert(
        fc.property(
          chineseQueryArbitrary,
          (query: string) => {
            const result = intentClassifierService.fallbackClassify(query, 'zh');
            return isValidIntentType(result.intent);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Fallback classification should always return a valid intent type
     * for any random query string
     */
    it('should return valid intent type for any random query (fallback)', () => {
      fc.assert(
        fc.property(
          randomQueryArbitrary,
          languageArbitrary,
          (query: string, language: string) => {
            const result = intentClassifierService.fallbackClassify(query, language);
            return isValidIntentType(result.intent);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Fallback classification should return a valid IntentResult structure
     */
    it('should return valid IntentResult structure for any query (fallback)', () => {
      fc.assert(
        fc.property(
          mixedQueryArbitrary,
          languageArbitrary,
          (query: string, language: string) => {
            const result = intentClassifierService.fallbackClassify(query, language);
            return isValidIntentResult(result);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Intent should be one of exactly four types - no other values allowed
     */
    it('should only return one of the four defined intent types', () => {
      fc.assert(
        fc.property(
          mixedQueryArbitrary,
          languageArbitrary,
          (query: string, language: string) => {
            const result = intentClassifierService.fallbackClassify(query, language);
            return VALID_INTENT_TYPES.includes(result.intent);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Invariants for Intent Classification
   */
  describe('Intent Classification Invariants', () => {
    
    /**
     * Classification should be deterministic for the same input
     */
    it('should produce consistent results for the same input (fallback)', () => {
      fc.assert(
        fc.property(
          mixedQueryArbitrary,
          languageArbitrary,
          (query: string, language: string) => {
            const result1 = intentClassifierService.fallbackClassify(query, language);
            const result2 = intentClassifierService.fallbackClassify(query, language);
            
            return result1.intent === result2.intent;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Confidence should be between 0 and 1 when present
     */
    it('should have confidence between 0 and 1 when present', () => {
      fc.assert(
        fc.property(
          mixedQueryArbitrary,
          languageArbitrary,
          (query: string, language: string) => {
            const result = intentClassifierService.fallbackClassify(query, language);
            
            if (result.confidence !== undefined) {
              return result.confidence >= 0 && result.confidence <= 1;
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Count should be positive when present
     */
    it('should have positive count when present', () => {
      fc.assert(
        fc.property(
          mixedQueryArbitrary,
          languageArbitrary,
          (query: string, language: string) => {
            const result = intentClassifierService.fallbackClassify(query, language);
            
            if (result.count !== undefined) {
              return result.count > 0;
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Specific Intent Type Detection Tests
   */
  describe('Intent Type Detection', () => {
    
    /**
     * Non-travel keywords should trigger non_travel intent
     * Note: These queries must contain keywords from NON_TRAVEL_KEYWORDS in the service
     */
    it('should classify non-travel keywords as non_travel', () => {
      const nonTravelQueries = fc.constantFrom(
        '天气怎么样',
        'weather forecast',
        '运动计划',
        'exercise routine',
        'Python教程',
        'coding tips',
        '心情不好',
        'feeling sad'  // 'sad' is in NON_TRAVEL_KEYWORDS, 'anxious' is not
      );

      fc.assert(
        fc.property(
          nonTravelQueries,
          (query: string) => {
            const result = intentClassifierService.fallbackClassify(query, 'en');
            return result.intent === 'non_travel';
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Queries with city and category should trigger general_search
     */
    it('should classify city+category queries as general_search', () => {
      const generalSearchQueries = fc.constantFrom(
        'restaurants in paris',
        'cafes in tokyo',
        'museums in rome',
        'bars in london',
        'hotels in barcelona'
      );

      fc.assert(
        fc.property(
          generalSearchQueries,
          (query: string) => {
            const result = intentClassifierService.fallbackClassify(query, 'en');
            return result.intent === 'general_search';
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Travel consultation keywords should trigger travel_consultation
     */
    it('should classify travel advice queries as travel_consultation', () => {
      const consultationQueries = fc.constantFrom(
        '哪里好玩',
        'which is better',
        'plan a trip',
        '行程推荐',
        'travel itinerary'
      );

      fc.assert(
        fc.property(
          consultationQueries,
          (query: string) => {
            const result = intentClassifierService.fallbackClassify(query, 'en');
            return result.intent === 'travel_consultation';
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
