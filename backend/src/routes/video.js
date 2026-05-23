import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getVideoUsageToday, findPartner, endSession } from '../controllers/videoController.js';

const router = Router();

router.use(authMiddleware);

router.get('/usage/today', getVideoUsageToday);
router.post('/find-partner', findPartner);
router.delete('/end-session', endSession);

export default router;
