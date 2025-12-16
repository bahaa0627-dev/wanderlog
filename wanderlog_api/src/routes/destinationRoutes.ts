import { Router } from 'express';
import { createTrip, getMyTrips, getTripById, manageTripSpot } from '../controllers/tripController';
import { authenticateToken } from '../middleware/auth';

// Destination routes are aliases of trip routes to reflect the "city destination" domain wording.
const router = Router();

router.use(authenticateToken);

router.post('/', createTrip);
router.get('/', getMyTrips);
router.get('/:id', getTripById);
router.put('/:id/spots', manageTripSpot);

export default router;

