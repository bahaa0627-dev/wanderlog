import { Router } from 'express';
import { importSpot, getSpots, getSpotById } from '../controllers/spotController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.use(authenticateToken); // Protect all spot routes for now (or make read public later)

router.post('/import', importSpot);
router.get('/', getSpots);
router.get('/:id', getSpotById);

export default router;


