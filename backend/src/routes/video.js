import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { generateToken, findPartner, endSession, directCall, getVideoUsageToday } from '../controllers/videoController.js';

const router = Router();

router.use(authMiddleware);

router.get('/usage/today', getVideoUsageToday);
router.post('/token', generateToken);
router.post('/find-partner', findPartner);
router.post('/direct-call', directCall);
router.delete('/end-session', endSession);

export default router;
