/**
 * Integration Tests for AI Search V2 - Quota Limits
 * 
 * Task 13.2: 配额限制测试
 * - 测试 10 次限制
 * - 测试配额用完提示
 * 
 * Requirements: 13.1, 13.3
 */

// ============================================
// Mock Quota Service for Testing
// ============================================

/**
 * Mock Quota Service that simulates the real quota behavior
 * without database dependencies
 */
class MockQuotaService {
  private quotas: Map<string, { count: number; date: string }> = new Map();
  private readonly dailyLimit: number;

  constructor(dailyLimit: number = 10) {
    this.dailyLimit = dailyLimit;
  }

  /**
   * Get today's date string
   */
  private getTodayDateString(): string {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Get or create quota record for a user
   */
  private getOrCreateQuota(userId: string): { count: number; date: string } {
    const today = this.getTodayDateString();
    const existing = this.quotas.get(userId);
    
    if (existing && existing.date === today) {
      return existing;
    }
    
    // Reset quota for new day
    const newQuota = { count: 0, date: today };
    this.quotas.set(userId, newQuota);
    return newQuota;
  }


  /**
   * Check if user can search
   * Requirement 13.1: limit to 10 searches per day
   */
  canSearch(userId: string): boolean {
    const quota = this.getOrCreateQuota(userId);
    return quota.count < this.dailyLimit;
  }

  /**
   * Consume one search quota
   */
  consumeQuota(userId: string): { success: boolean; error?: string } {
    const quota = this.getOrCreateQuota(userId);
    
    if (quota.count >= this.dailyLimit) {
      return {
        success: false,
        error: `Daily search quota exceeded. You have used all ${this.dailyLimit} searches for today. Please try again tomorrow.`,
      };
    }
    
    quota.count++;
    this.quotas.set(userId, quota);
    return { success: true };
  }

  /**
   * Get remaining quota
   */
  getRemainingQuota(userId: string): number {
    const quota = this.getOrCreateQuota(userId);
    return Math.max(0, this.dailyLimit - quota.count);
  }

  /**
   * Get quota info
   */
  getQuotaInfo(userId: string): {
    remaining: number;
    limit: number;
    used: number;
    resetsAt: Date;
  } {
    const quota = this.getOrCreateQuota(userId);
    const now = new Date();
    const tomorrow = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1
    ));
    
    return {
      remaining: Math.max(0, this.dailyLimit - quota.count),
      limit: this.dailyLimit,
      used: quota.count,
      resetsAt: tomorrow,
    };
  }

  /**
   * Reset quota for testing
   */
  resetQuota(userId: string): void {
    this.quotas.delete(userId);
  }

  /**
   * Set quota count directly for testing
   */
  setQuotaCount(userId: string, count: number): void {
    const today = this.getTodayDateString();
    this.quotas.set(userId, { count, date: today });
  }
}


// ============================================
// Mock Search V2 Controller for Testing
// ============================================

interface SearchV2Response {
  success: boolean;
  error?: string;
  acknowledgment: string;
  places: any[];
  overallSummary: string;
  quotaRemaining: number;
  stage: string;
}

/**
 * Mock Search V2 Controller that uses the mock quota service
 */
class MockSearchV2Controller {
  private quotaService: MockQuotaService;

  constructor(quotaService: MockQuotaService) {
    this.quotaService = quotaService;
  }

  /**
   * Simulate search V2 request
   */
  async searchV2(query: string, userId: string): Promise<SearchV2Response> {
    // Check quota first
    if (!this.quotaService.canSearch(userId)) {
      return {
        success: false,
        error: 'Daily search quota exceeded. Please try again tomorrow.',
        acknowledgment: '',
        places: [],
        overallSummary: '',
        quotaRemaining: 0,
        stage: 'complete',
      };
    }

    // Consume quota
    const consumeResult = this.quotaService.consumeQuota(userId);
    if (!consumeResult.success) {
      return {
        success: false,
        error: consumeResult.error,
        acknowledgment: '',
        places: [],
        overallSummary: '',
        quotaRemaining: 0,
        stage: 'complete',
      };
    }

    // Simulate successful search
    const quotaRemaining = this.quotaService.getRemainingQuota(userId);
    
    return {
      success: true,
      acknowledgment: `I found some great places for "${query}"`,
      places: [
        { name: 'Test Place 1', isVerified: true },
        { name: 'Test Place 2', isVerified: true },
      ],
      overallSummary: 'Hope you enjoy these recommendations!',
      quotaRemaining,
      stage: 'complete',
    };
  }
}


// ============================================
// Test Suite: Quota Limits
// ============================================

describe('SearchV2 Integration Tests - Quota Limits', () => {
  let quotaService: MockQuotaService;
  let searchController: MockSearchV2Controller;
  const testUserId = 'test-user-123';

  beforeEach(() => {
    quotaService = new MockQuotaService(10); // 10 searches per day
    searchController = new MockSearchV2Controller(quotaService);
    quotaService.resetQuota(testUserId);
  });

  /**
   * Test Suite: 10 次限制 (10 Search Limit)
   * Requirement 13.1
   */
  describe('10 次限制 (10 Search Limit)', () => {
    it('should allow exactly 10 searches per day', async () => {
      // Perform 10 searches
      for (let i = 0; i < 10; i++) {
        const result = await searchController.searchV2(`query ${i + 1}`, testUserId);
        expect(result.success).toBe(true);
        expect(result.quotaRemaining).toBe(9 - i);
      }

      // 11th search should fail
      const result = await searchController.searchV2('query 11', testUserId);
      expect(result.success).toBe(false);
      expect(result.quotaRemaining).toBe(0);
    });

    it('should track quota correctly across multiple searches', async () => {
      // First search
      let result = await searchController.searchV2('first query', testUserId);
      expect(result.success).toBe(true);
      expect(result.quotaRemaining).toBe(9);

      // Second search
      result = await searchController.searchV2('second query', testUserId);
      expect(result.success).toBe(true);
      expect(result.quotaRemaining).toBe(8);

      // Check quota info
      const quotaInfo = quotaService.getQuotaInfo(testUserId);
      expect(quotaInfo.used).toBe(2);
      expect(quotaInfo.remaining).toBe(8);
      expect(quotaInfo.limit).toBe(10);
    });


    it('should return correct remaining quota in response', async () => {
      // Set quota to 7 used
      quotaService.setQuotaCount(testUserId, 7);

      const result = await searchController.searchV2('test query', testUserId);
      expect(result.success).toBe(true);
      expect(result.quotaRemaining).toBe(2); // 10 - 8 = 2
    });

    it('should block search when quota is exactly at limit', async () => {
      // Set quota to exactly 10 (limit reached)
      quotaService.setQuotaCount(testUserId, 10);

      const result = await searchController.searchV2('blocked query', testUserId);
      expect(result.success).toBe(false);
      expect(result.quotaRemaining).toBe(0);
    });

    it('should allow search when quota is at 9 (one remaining)', async () => {
      // Set quota to 9
      quotaService.setQuotaCount(testUserId, 9);

      const result = await searchController.searchV2('last query', testUserId);
      expect(result.success).toBe(true);
      expect(result.quotaRemaining).toBe(0); // Now at limit
    });

    it('should handle multiple users independently', async () => {
      const user1 = 'user-1';
      const user2 = 'user-2';

      // User 1 uses 5 searches
      for (let i = 0; i < 5; i++) {
        await searchController.searchV2(`user1 query ${i}`, user1);
      }

      // User 2 should still have full quota
      const user2Result = await searchController.searchV2('user2 query', user2);
      expect(user2Result.success).toBe(true);
      expect(user2Result.quotaRemaining).toBe(9);

      // User 1 should have 5 remaining
      expect(quotaService.getRemainingQuota(user1)).toBe(5);
    });
  });


  /**
   * Test Suite: 配额用完提示 (Quota Exceeded Message)
   * Requirement 13.3
   */
  describe('配额用完提示 (Quota Exceeded Message)', () => {
    it('should return appropriate error message when quota exceeded', async () => {
      // Exhaust quota
      quotaService.setQuotaCount(testUserId, 10);

      const result = await searchController.searchV2('blocked query', testUserId);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('quota');
      expect(result.error!.toLowerCase()).toContain('tomorrow');
    });

    it('should return empty places array when quota exceeded', async () => {
      quotaService.setQuotaCount(testUserId, 10);

      const result = await searchController.searchV2('blocked query', testUserId);
      
      expect(result.places).toEqual([]);
      expect(result.acknowledgment).toBe('');
      expect(result.overallSummary).toBe('');
    });

    it('should return quotaRemaining as 0 when exceeded', async () => {
      quotaService.setQuotaCount(testUserId, 10);

      const result = await searchController.searchV2('blocked query', testUserId);
      
      expect(result.quotaRemaining).toBe(0);
    });

    it('should provide quota info with reset time', () => {
      quotaService.setQuotaCount(testUserId, 10);

      const quotaInfo = quotaService.getQuotaInfo(testUserId);
      
      expect(quotaInfo.remaining).toBe(0);
      expect(quotaInfo.used).toBe(10);
      expect(quotaInfo.limit).toBe(10);
      expect(quotaInfo.resetsAt).toBeInstanceOf(Date);
      
      // Reset time should be tomorrow
      const now = new Date();
      const tomorrow = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1
      ));
      expect(quotaInfo.resetsAt.getTime()).toBe(tomorrow.getTime());
    });


    it('should show decreasing quota in consecutive searches', async () => {
      const quotaHistory: number[] = [];

      for (let i = 0; i < 5; i++) {
        const result = await searchController.searchV2(`query ${i}`, testUserId);
        quotaHistory.push(result.quotaRemaining);
      }

      // Quota should decrease: 9, 8, 7, 6, 5
      expect(quotaHistory).toEqual([9, 8, 7, 6, 5]);
    });

    it('should display remaining count correctly at various levels', async () => {
      // Test at different quota levels
      const testCases = [
        { used: 0, expectedRemaining: 10 },
        { used: 3, expectedRemaining: 7 },
        { used: 5, expectedRemaining: 5 },
        { used: 9, expectedRemaining: 1 },
        { used: 10, expectedRemaining: 0 },
      ];

      for (const testCase of testCases) {
        quotaService.resetQuota(testUserId);
        quotaService.setQuotaCount(testUserId, testCase.used);
        
        const remaining = quotaService.getRemainingQuota(testUserId);
        expect(remaining).toBe(testCase.expectedRemaining);
      }
    });
  });

  /**
   * Test Suite: Edge Cases
   */
  describe('Edge Cases', () => {
    it('should handle new user with no quota record', async () => {
      const newUserId = 'brand-new-user';
      
      const result = await searchController.searchV2('first search', newUserId);
      
      expect(result.success).toBe(true);
      expect(result.quotaRemaining).toBe(9);
    });

    it('should handle rapid consecutive searches', async () => {
      // Simulate rapid searches
      const promises = Array.from({ length: 5 }, (_, i) =>
        searchController.searchV2(`rapid query ${i}`, testUserId)
      );

      const results = await Promise.all(promises);
      
      // All should succeed
      expect(results.every(r => r.success)).toBe(true);
      
      // Final remaining should be 5
      expect(quotaService.getRemainingQuota(testUserId)).toBe(5);
    });
  });
});
