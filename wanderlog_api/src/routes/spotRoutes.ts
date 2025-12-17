import { Router } from 'express';
import { 
  importSpots, 
  importSpot, 
  getPlaces, 
  getPlaceById,
  getCityCenterPlaces,
  syncPlaceData,
  getOrCreatePlaceFromPublicPlace,
  getOrCreatePlacesFromPublicPlaces
} from '../controllers/placeController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Public routes (读取地点信息不需要登录)
router.get('/', getPlaces);
router.get('/city-center/:city', getCityCenterPlaces);
router.get('/:id', getPlaceById);

// PublicPlace to Place conversion (不需要登录，因为只是数据转换)
router.post('/from-public-place', getOrCreatePlaceFromPublicPlace);
router.post('/from-public-places', getOrCreatePlacesFromPublicPlaces);

// Protected routes (导入和同步需要登录)
router.post('/import', authenticateToken, importSpots);
router.post('/import-one', authenticateToken, importSpot);
router.post('/sync', authenticateToken, syncPlaceData);

export default router;






