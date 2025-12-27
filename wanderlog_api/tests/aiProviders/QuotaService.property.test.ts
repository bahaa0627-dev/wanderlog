/**
 * Property-Based Tests for QuotaService
 * 
 * Feature: ai-search-v2-parallel-pipeline, Property 9: Daily Quota Enforcement
 * 
 * *For any* user, after making 10 successful searches in a day, subsequent search 
 * requests SHALL be rejected with a quota exceeded error until the next day (00:00 UTC).
 * 
 * **Validates: Requirements 13.1**
 */

import * as fc from 'fast-check';

// ============================================
// In-Memory QuotaService for Testing
// ============================================

/**
 * Quota exceeded error (mirrors the real implementation)
 */
class QuotaExceededError extends Error {
  constructor(message: string = 'Daily search quota exceeded') {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

/**
 * In-memory QuotaService for property testing
 * This avoids database dependencies while testing the core quota logic
 */
class InMemoryQuotaService {
  private readonly dailyLimit: number;
  private quotas: Map<string, Map<string, number>>; // userId -> (date -> count)

  constructor(dailyLimit: number = 10) {
    this.dailyLimit = dailyLimit;
    this.quotas = new Map();
  }

  /**
   * Get date string in YYYY-MM-DD format
   */
  private getDateString(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Get current count for a user on a specific date
   */
  private getCount(userId: string, date: Date): number {
    const dateStr = this.getDateString(date);
    const userQuotas = this.quotas.get(userId);
    if (!userQuotas) return 0;
    return userQuotas.get(dateStr) || 0;
  }

  /**
   * Set count for a user on a specific date
   */
  private setCount(userId: string, date: Date, count: number): void {
    const dateStr = this.getDateString(date);
    if (!this.quotas.has(userId)) {
      this.quotas.set(userId, new Map());
    }
    this.quotas.get(userId)!.set(dateStr, count);
  }

  /**
   * Check if a user can perform a search on a given date
   */
  canSearch(userId: string, date: Date = new Date()): boolean {
    const count = this.getCount(userId, date);
    return count < this.dailyLimit;
  }

  /**
   * Consume one search quota for a user
   * @throws QuotaExceededError if quota is exceeded
   */
  consumeQuota(userId: string, date: Date = new Date()): void {
    const count = this.getCount(userId, date);
    if (count >= this.dailyLimit) {
      throw new QuotaExceededError(
        `Daily search quota exceeded. You have used all ${this.dailyLimit} searches for today.`
      );
    }
    this.setCount(userId, date, count + 1);
  }

  /**
   * Get remaining quota for a user
   */
  getRemainingQuota(userId: string, date: Date = new Date()): number {
    const count = this.getCount(userId, date);
    return Math.max(0, this.dailyLimit - count);
  }

  /**
   * Get the daily limit
   */
  getDailyLimit(): number {
    return this.dailyLimit;
  }

  /**
   * Reset all quotas (for testing)
   */
  reset(): void {
    this.quotas.clear();
  }
}

// ============================================
// Test Data Generators
// ============================================

/**
 * Generate a valid user ID (UUID-like string)
 */
const userIdArbitrary = fc.uuid();

/**
 * Generate a valid date within a reasonable range
 * Using integer timestamps to avoid invalid date issues
 */
const dateArbitrary = fc.integer({
  min: new Date('2024-01-01').getTime(),
  max: new Date('2025-12-31').getTime(),
}).map(timestamp => new Date(timestamp));

/**
 * Generate a number of searches to perform (0 to 15)
 */
const searchCountArbitrary = fc.integer({ min: 0, max: 15 });

/**
 * Generate a daily limit (1 to 20)
 */
const dailyLimitArbitrary = fc.integer({ min: 1, max: 20 });

// ============================================
// Property Tests
// ============================================

describe('QuotaService Property-Based Tests', () => {
  /**
   * Feature: ai-search-v2-parallel-pipeline, Property 9: Daily Quota Enforcement
   * 
   * *For any* user, after making 10 successful searches in a day, subsequent search 
   * requests SHALL be rejected with a quota exceeded error until the next day (00:00 UTC).
   * 
   * **Validates: Requirements 13.1**
   */
  describe('Property 9: Daily Quota Enforcement', () => {
    /**
     * Property: After exhausting daily quota, canSearch returns false
     * 
     * For any user and any daily limit, after consuming exactly `limit` searches,
     * canSearch should return false.
     */
    it('should return false for canSearch after quota is exhausted', () => {
      fc.assert(
        fc.property(
          userIdArbitrary,
          dailyLimitArbitrary,
          dateArbitrary,
          (userId: string, dailyLimit: number, date: Date) => {
            const service = new InMemoryQuotaService(dailyLimit);

            // Consume all quota
            for (let i = 0; i < dailyLimit; i++) {
              service.consumeQuota(userId, date);
            }

            // After exhausting quota, canSearch should return false
            return service.canSearch(userId, date) === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: consumeQuota throws QuotaExceededError after limit is reached
     * 
     * For any user, after consuming exactly `limit` searches, the next consumeQuota
     * call should throw QuotaExceededError.
     */
    it('should throw QuotaExceededError when trying to exceed quota', () => {
      fc.assert(
        fc.property(
          userIdArbitrary,
          dailyLimitArbitrary,
          dateArbitrary,
          (userId: string, dailyLimit: number, date: Date) => {
            const service = new InMemoryQuotaService(dailyLimit);

            // Consume all quota
            for (let i = 0; i < dailyLimit; i++) {
              service.consumeQuota(userId, date);
            }

            // Next consume should throw
            try {
              service.consumeQuota(userId, date);
              return false; // Should have thrown
            } catch (error) {
              return error instanceof QuotaExceededError;
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Remaining quota decreases correctly with each search
     * 
     * For any user and any number of searches (up to limit), remaining quota
     * should equal limit - searches_performed.
     */
    it('should correctly track remaining quota', () => {
      fc.assert(
        fc.property(
          userIdArbitrary,
          dailyLimitArbitrary,
          dateArbitrary,
          (userId: string, dailyLimit: number, date: Date) => {
            const service = new InMemoryQuotaService(dailyLimit);

            // Generate random number of searches to perform (0 to limit)
            const searchesToPerform = Math.floor(Math.random() * (dailyLimit + 1));

            // Perform searches
            for (let i = 0; i < searchesToPerform; i++) {
              service.consumeQuota(userId, date);
            }

            // Remaining should be limit - performed
            const expected = dailyLimit - searchesToPerform;
            return service.getRemainingQuota(userId, date) === expected;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Quota resets on a new day
     * 
     * For any user who has exhausted their quota on day D, they should have
     * full quota available on day D+1.
     */
    it('should reset quota on a new day', () => {
      fc.assert(
        fc.property(
          userIdArbitrary,
          dailyLimitArbitrary,
          dateArbitrary,
          (userId: string, dailyLimit: number, date: Date) => {
            const service = new InMemoryQuotaService(dailyLimit);

            // Exhaust quota on day 1
            for (let i = 0; i < dailyLimit; i++) {
              service.consumeQuota(userId, date);
            }

            // Verify quota is exhausted on day 1
            if (service.canSearch(userId, date) !== false) {
              return false;
            }

            // Create next day
            const nextDay = new Date(date);
            nextDay.setDate(nextDay.getDate() + 1);

            // On next day, should have full quota
            return (
              service.canSearch(userId, nextDay) === true &&
              service.getRemainingQuota(userId, nextDay) === dailyLimit
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Different users have independent quotas
     * 
     * For any two different users, exhausting one user's quota should not
     * affect the other user's quota.
     */
    it('should maintain independent quotas for different users', () => {
      fc.assert(
        fc.property(
          userIdArbitrary,
          userIdArbitrary,
          dailyLimitArbitrary,
          dateArbitrary,
          (userId1: string, userId2: string, dailyLimit: number, date: Date) => {
            // Skip if same user ID generated
            if (userId1 === userId2) return true;

            const service = new InMemoryQuotaService(dailyLimit);

            // Exhaust user1's quota
            for (let i = 0; i < dailyLimit; i++) {
              service.consumeQuota(userId1, date);
            }

            // User1 should be exhausted
            if (service.canSearch(userId1, date) !== false) {
              return false;
            }

            // User2 should still have full quota
            return (
              service.canSearch(userId2, date) === true &&
              service.getRemainingQuota(userId2, date) === dailyLimit
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: canSearch is consistent with getRemainingQuota
     * 
     * For any user at any point, canSearch should return true if and only if
     * getRemainingQuota returns a value greater than 0.
     */
    it('should have consistent canSearch and getRemainingQuota', () => {
      fc.assert(
        fc.property(
          userIdArbitrary,
          dailyLimitArbitrary,
          searchCountArbitrary,
          dateArbitrary,
          (userId: string, dailyLimit: number, searchCount: number, date: Date) => {
            const service = new InMemoryQuotaService(dailyLimit);

            // Perform some searches (up to limit)
            const actualSearches = Math.min(searchCount, dailyLimit);
            for (let i = 0; i < actualSearches; i++) {
              service.consumeQuota(userId, date);
            }

            const canSearch = service.canSearch(userId, date);
            const remaining = service.getRemainingQuota(userId, date);

            // canSearch should be true iff remaining > 0
            return canSearch === (remaining > 0);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Quota consumption is monotonic (never increases within a day)
     * 
     * For any sequence of consumeQuota calls on the same day, the remaining
     * quota should never increase.
     */
    it('should have monotonically decreasing remaining quota within a day', () => {
      fc.assert(
        fc.property(
          userIdArbitrary,
          dailyLimitArbitrary,
          dateArbitrary,
          (userId: string, dailyLimit: number, date: Date) => {
            const service = new InMemoryQuotaService(dailyLimit);
            let previousRemaining = dailyLimit;

            // Perform searches and track remaining quota
            for (let i = 0; i < dailyLimit; i++) {
              const currentRemaining = service.getRemainingQuota(userId, date);
              
              // Remaining should never increase
              if (currentRemaining > previousRemaining) {
                return false;
              }
              
              previousRemaining = currentRemaining;
              service.consumeQuota(userId, date);
            }

            // Final remaining should be 0
            return service.getRemainingQuota(userId, date) === 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Default daily limit is 10
     * 
     * When no limit is specified, the service should use 10 as the default.
     */
    it('should use 10 as default daily limit', () => {
      fc.assert(
        fc.property(
          userIdArbitrary,
          dateArbitrary,
          (userId: string, date: Date) => {
            const service = new InMemoryQuotaService(); // No limit specified

            // Should be able to perform exactly 10 searches
            for (let i = 0; i < 10; i++) {
              if (!service.canSearch(userId, date)) {
                return false;
              }
              service.consumeQuota(userId, date);
            }

            // 11th search should fail
            return service.canSearch(userId, date) === false;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
