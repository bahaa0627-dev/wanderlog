/**
 * AI Call Counter - Global per-request AI call limit enforcement
 * 
 * This module provides a centralized way to track and limit AI API calls
 * across all services (aiService, aiRecommendationService, intentClassifierService).
 * 
 * IMPORTANT: resetCounter() must be called at the start of each HTTP request
 * to ensure proper per-request tracking.
 */

import { logger } from '../utils/logger';

// Configuration
// 限制为 4 次：1. AI 推荐 2. 摘要生成 3. 开场白+总结 4. 补充推荐
const MAX_AI_CALLS_PER_REQUEST = 4;

// Counter state
let aiCallCount = 0;
let aiCallLimitExceeded = false;

/**
 * Reset the AI call counter - MUST be called at the start of each request
 */
export function resetAICallCounter(): void {
  aiCallCount = 0;
  aiCallLimitExceeded = false;
  logger.info(`[AICallCounter] Counter reset (limit: ${MAX_AI_CALLS_PER_REQUEST})`);
}

/**
 * Get current AI call count
 */
export function getAICallCount(): number {
  return aiCallCount;
}

/**
 * Get the max AI calls allowed per request
 */
export function getMaxAICallsPerRequest(): number {
  return MAX_AI_CALLS_PER_REQUEST;
}

/**
 * Check if we can make another AI call
 * @returns true if call is allowed, false if limit exceeded
 */
export function canMakeAICall(): boolean {
  if (aiCallCount >= MAX_AI_CALLS_PER_REQUEST) {
    if (!aiCallLimitExceeded) {
      aiCallLimitExceeded = true;
      logger.warn(`[AICallCounter] ⚠️ AI CALL LIMIT REACHED (${aiCallCount}/${MAX_AI_CALLS_PER_REQUEST}). Blocking further calls!`);
    }
    return false;
  }
  return true;
}

/**
 * Increment the AI call counter and log
 * @param operationName Name of the operation for logging
 * @returns The new call count
 */
export function incrementAICallCount(operationName: string): number {
  aiCallCount++;
  logger.info(`[AICallCounter] AI call #${aiCallCount}/${MAX_AI_CALLS_PER_REQUEST} - ${operationName}`);
  return aiCallCount;
}

/**
 * Check if limit was exceeded (for logging/debugging)
 */
export function wasLimitExceeded(): boolean {
  return aiCallLimitExceeded;
}

export default {
  resetAICallCounter,
  getAICallCount,
  getMaxAICallsPerRequest,
  canMakeAICall,
  incrementAICallCount,
  wasLimitExceeded,
};
