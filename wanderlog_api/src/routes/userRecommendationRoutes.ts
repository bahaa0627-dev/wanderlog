/**
 * User Recommendation Routes
 * 
 * Routes for user-submitted place recommendations
 */

import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import { logger } from '../utils/logger';

const router = Router();

interface UserRecommendation {
  id: string;
  country: string;
  city: string;
  place_name: string;
  image_url: string | null;
  user_nickname: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * POST /api/user-recommendations
 * Submit a new place recommendation
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { country, city, placeName, imageUrl, userNickname } = req.body;

    // Validate required fields
    if (!country || !city || !placeName) {
      return res.status(400).json({
        success: false,
        message: 'Country, city, and placeName are required',
      });
    }

    // Create recommendation using raw SQL
    const result = await prisma.$queryRaw<UserRecommendation[]>`
      INSERT INTO user_recommendations (country, city, place_name, image_url, user_nickname, status, created_at, updated_at)
      VALUES (${country.trim()}, ${city.trim()}, ${placeName.trim()}, ${imageUrl || null}, ${userNickname?.trim() || 'Anonymous'}, 'pending', now(), now())
      RETURNING *
    `;

    const recommendation = result[0];
    logger.info(`New user recommendation created: ${recommendation.id}`);

    return res.status(201).json({
      success: true,
      data: recommendation,
    });
  } catch (error) {
    logger.error('Error creating user recommendation:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit recommendation',
    });
  }
});

/**
 * GET /api/user-recommendations
 * Get all recommendations (admin only)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, page = '1', limit = '50' } = req.query;
    
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;

    let recommendations: UserRecommendation[];
    let total: number;

    if (status) {
      recommendations = await prisma.$queryRaw<UserRecommendation[]>`
        SELECT * FROM user_recommendations 
        WHERE status = ${status as string}
        ORDER BY created_at DESC
        LIMIT ${limitNum} OFFSET ${offset}
      `;
      const countResult = await prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM user_recommendations WHERE status = ${status as string}
      `;
      total = Number(countResult[0].count);
    } else {
      recommendations = await prisma.$queryRaw<UserRecommendation[]>`
        SELECT * FROM user_recommendations 
        ORDER BY created_at DESC
        LIMIT ${limitNum} OFFSET ${offset}
      `;
      const countResult = await prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM user_recommendations
      `;
      total = Number(countResult[0].count);
    }

    return res.json({
      success: true,
      data: recommendations,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    logger.error('Error fetching user recommendations:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch recommendations',
    });
  }
});

/**
 * PATCH /api/user-recommendations/:id/status
 * Update recommendation status
 */
router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'processed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be "pending" or "processed"',
      });
    }

    const result = await prisma.$queryRaw<UserRecommendation[]>`
      UPDATE user_recommendations 
      SET status = ${status}, updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING *
    `;

    if (result.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Recommendation not found',
      });
    }

    const recommendation = result[0];
    logger.info(`User recommendation ${id} status updated to ${status}`);

    return res.json({
      success: true,
      data: recommendation,
    });
  } catch (error) {
    logger.error('Error updating user recommendation status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update status',
    });
  }
});

/**
 * GET /api/user-recommendations/stats
 * Get recommendation statistics
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const statsResult = await prisma.$queryRaw<[{ total: bigint; pending: bigint; processed: bigint }]>`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'processed') as processed
      FROM user_recommendations
    `;

    const stats = statsResult[0];

    return res.json({
      success: true,
      data: {
        total: Number(stats.total),
        pending: Number(stats.pending),
        processed: Number(stats.processed),
      },
    });
  } catch (error) {
    logger.error('Error fetching user recommendation stats:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch stats',
    });
  }
});

export default router;
