import { Router } from 'express';
import { 
  importSpots, 
  importSpot, 
  getSpots, 
  getSpotById,
  getCityCenterSpots,
  syncSpotData,
  getOrCreateSpotFromPublicPlace,
  getOrCreateSpotsFromPublicPlaces
} from '../controllers/spotController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Public routes (读取地点信息不需要登录)
router.get('/', getSpots);
router.get('/city-center/:city', getCityCenterSpots);
router.get('/:id', getSpotById);

// PublicPlace to Spot conversion (不需要登录，因为只是数据转换)
router.post('/from-public-place', getOrCreateSpotFromPublicPlace);
router.post('/from-public-places', getOrCreateSpotsFromPublicPlaces);

// Protected routes (导入和同步需要登录)
router.post('/import', authenticateToken, importSpots);
router.post('/import-one', authenticateToken, importSpot);
router.post('/sync', authenticateToken, syncSpotData);

export default router;






