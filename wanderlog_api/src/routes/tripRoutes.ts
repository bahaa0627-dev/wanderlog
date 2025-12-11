import { Router } from 'express';
import { createTrip, getMyTrips, getTripById, manageTripSpot } from '../controllers/tripController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

router.post('/', createTrip);
router.get('/', getMyTrips);
router.get('/:id', getTripById);
router.put('/:id/spots', manageTripSpot); // Add or update spot in trip

export default router;



