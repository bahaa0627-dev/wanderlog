/**
 * Search V2 Routes
 * 
 * Routes for AI Search V2 parallel pipeline
 * 
 * Requirements: 2.1
 */

import { Router } from 'express';
import { searchV2, getQuotaInfo } from '../controllers/searchV2Controller';
import { authenticateToken, authenticateTokenIfPresent } from '../middleware/auth';

const router = Router();

/**
 * POST /api/places/ai/search-v2
 * 
 * AI Search V2 - Parallel Pipeline
 * Combines GPT-4o-mini recommendations with Google Text Search Enterprise
 * 
 * Body:
 * - query: string (required) - Search query
 * - userId: string (optional) - User ID for quota tracking
 * - userLat: number (optional) - User latitude
 * - userLng: number (optional) - User longitude
 * 
 * Response:
 * - success: boolean
 * - acknowledgment: string - AI greeting/acknowledgment
 * - categories: CategoryGroup[] (optional) - Categorized results
 * - places: PlaceResult[] - Place results
 * - overallSummary: string - Summary of recommendations
 * - quotaRemaining: number - Remaining daily searches
 * - stage: string - Current processing stage
 */
router.post('/search-v2', authenticateTokenIfPresent, searchV2);

/**
 * GET /api/places/ai/quota
 * 
 * Get quota information for user
 * Accepts userId from auth token or query parameter
 * 
 * Response:
 * - success: boolean
 * - remaining: number
 * - limit: number
 * - used: number
 * - resetsAt: Date
 */
router.get('/quota', authenticateTokenIfPresent, getQuotaInfo);

export default router;
