/**
 * Quota Service
 * 
 * Manages user search quotas for AI Search V2.
 * Each user is limited to 10 AI searches per day.
 * VIP users get 100 searches per day.
 * Uses the existing user_quotas table in Supabase.
 * 
 * Requirements: 13.1, 13.2
 */

import prisma from '../config/database';

/**
 * Daily quota limit for AI searches
 * Requirement 13.1: limit logged-in users to 10 AI searches per day
 */
const DAILY_QUOTA = 10;

/**
 * VIP quota limit - 100 searches per day
 */
const VIP_DAILY_QUOTA = 100;

/**
 * VIP user IDs - these users get higher quota
 * Can be configured via environment variable VIP_USER_IDS (comma-separated)
 * Or add user IDs directly here
 */
const VIP_USER_IDS: Set<string> = new Set([
  // VIP users with 100 searches per day
  'dc4d5f8f-8b52-4853-a180-9f7f5e869005', // blcubahaa0627@gmail.com
  ...(process.env.VIP_USER_IDS?.split(',').map(id => id.trim()).filter(id => id) || []),
]);

/**
 * User quota record from database
 */
interface UserQuotaRecord {
  id: string;
  user_id: string;
  quota_date: Date;
  deep_search_count: number;
  detail_view_count: number;
  created_at: Date;
  updated_at: Date;
}

/**
 * Quota exceeded error
 */
export class QuotaExceededError extends Error {
  constructor(message: string = 'Daily search quota exceeded') {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

/**
 * Quota Service class
 * Manages user search quotas with daily reset
 * Uses raw SQL to interact with the existing user_quotas table
 */
class QuotaService {
  private readonly dailyLimit: number;
  private readonly vipDailyLimit: number;

  constructor(dailyLimit: number = DAILY_QUOTA, vipDailyLimit: number = VIP_DAILY_QUOTA) {
    this.dailyLimit = dailyLimit;
    this.vipDailyLimit = vipDailyLimit;
  }

  /**
   * Check if a user is VIP
   */
  private isVipUser(userId: string): boolean {
    return VIP_USER_IDS.has(userId);
  }

  /**
   * Get the daily limit for a specific user
   */
  private getUserDailyLimit(userId: string): number {
    return this.isVipUser(userId) ? this.vipDailyLimit : this.dailyLimit;
  }

  /**
   * Get today's date string in YYYY-MM-DD format (UTC)
   */
  private getTodayDateString(): string {
    const now = new Date();
    return now.toISOString().split('T')[0];
  }

  /**
   * Get or create quota record for a user using raw SQL
   * Uses the existing user_quotas table with deep_search_count column
   */
  private async getOrCreateQuotaRecord(userId: string): Promise<UserQuotaRecord> {
    const today = this.getTodayDateString();

    // Try to find existing quota record for today
    const existingQuota = await prisma.$queryRaw<UserQuotaRecord[]>`
      SELECT id, user_id, quota_date, deep_search_count, detail_view_count, created_at, updated_at
      FROM public.user_quotas
      WHERE user_id = ${userId}::uuid AND quota_date = ${today}::date
      LIMIT 1
    `;

    if (existingQuota && existingQuota.length > 0) {
      return existingQuota[0];
    }

    // Create new quota record for today
    const newQuota = await prisma.$queryRaw<UserQuotaRecord[]>`
      INSERT INTO public.user_quotas (user_id, quota_date, deep_search_count, detail_view_count)
      VALUES (${userId}::uuid, ${today}::date, 0, 0)
      ON CONFLICT (user_id, quota_date) DO UPDATE SET updated_at = NOW()
      RETURNING id, user_id, quota_date, deep_search_count, detail_view_count, created_at, updated_at
    `;

    if (newQuota && newQuota.length > 0) {
      return newQuota[0];
    }

    // If insert failed, try to fetch again (race condition handling)
    const retryQuota = await prisma.$queryRaw<UserQuotaRecord[]>`
      SELECT id, user_id, quota_date, deep_search_count, detail_view_count, created_at, updated_at
      FROM public.user_quotas
      WHERE user_id = ${userId}::uuid AND quota_date = ${today}::date
      LIMIT 1
    `;

    if (retryQuota && retryQuota.length > 0) {
      return retryQuota[0];
    }

    throw new Error('Failed to get or create quota record');
  }

  /**
   * Check if a user can perform a search
   * Requirement 13.1: limit logged-in users to 10 AI searches per day
   * VIP users get 100 searches per day
   * 
   * @param userId User's UUID
   * @returns true if user has remaining quota, false otherwise
   */
  async canSearch(userId: string): Promise<boolean> {
    try {
      const quota = await this.getOrCreateQuotaRecord(userId);
      const userLimit = this.getUserDailyLimit(userId);
      return quota.deep_search_count < userLimit;
    } catch (error) {
      console.error('[QuotaService] Error checking quota:', error);
      // On error, allow the search (fail open for better UX)
      return true;
    }
  }

  /**
   * Consume one search quota for a user
   * Requirement 13.2: each search invokes Google Maps API
   * 
   * @param userId User's UUID
   * @throws QuotaExceededError if quota is exceeded
   */
  async consumeQuota(userId: string): Promise<void> {
    const quota = await this.getOrCreateQuotaRecord(userId);
    const userLimit = this.getUserDailyLimit(userId);

    if (quota.deep_search_count >= userLimit) {
      throw new QuotaExceededError(
        `Daily search quota exceeded. You have used all ${userLimit} searches for today. Please try again tomorrow.`
      );
    }

    // Increment the search count
    await prisma.$executeRaw`
      UPDATE public.user_quotas
      SET deep_search_count = deep_search_count + 1, updated_at = NOW()
      WHERE id = ${quota.id}::uuid
    `;
  }

  /**
   * Get remaining quota for a user
   * 
   * @param userId User's UUID
   * @returns Number of remaining searches for today
   */
  async getRemainingQuota(userId: string): Promise<number> {
    try {
      const quota = await this.getOrCreateQuotaRecord(userId);
      const userLimit = this.getUserDailyLimit(userId);
      return Math.max(0, userLimit - quota.deep_search_count);
    } catch (error) {
      console.error('[QuotaService] Error getting remaining quota:', error);
      // On error, return full quota (fail open for better UX)
      return this.getUserDailyLimit(userId);
    }
  }

  /**
   * Get the daily limit
   * 
   * @returns The daily search limit
   */
  getDailyLimit(): number {
    return this.dailyLimit;
  }

  /**
   * Get quota info for a user (for API responses)
   * 
   * @param userId User's UUID
   * @returns Quota information object
   */
  async getQuotaInfo(userId: string): Promise<{
    remaining: number;
    limit: number;
    used: number;
    resetsAt: Date;
  }> {
    try {
      const quota = await this.getOrCreateQuotaRecord(userId);
      const userLimit = this.getUserDailyLimit(userId);
      const remaining = Math.max(0, userLimit - quota.deep_search_count);
      
      // Calculate reset time (next midnight UTC)
      const now = new Date();
      const tomorrow = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1
      ));

      return {
        remaining,
        limit: userLimit,
        used: quota.deep_search_count,
        resetsAt: tomorrow,
      };
    } catch (error) {
      console.error('[QuotaService] Error getting quota info:', error);
      // On error, return default values
      const userLimit = this.getUserDailyLimit(userId);
      const now = new Date();
      const tomorrow = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1
      ));
      return {
        remaining: userLimit,
        limit: userLimit,
        used: 0,
        resetsAt: tomorrow,
      };
    }
  }
}

// Export singleton instance
export const quotaService = new QuotaService();
export default quotaService;
