import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getVideoUsageToday, findPartner, endSession, getOnlineCount, getSessionPartner, sendFriendRequest } from '../controllers/videoController.js';

const router = Router();

router.use(authMiddleware);

router.get('/usage/today', getVideoUsageToday);
router.get('/online-count', getOnlineCount);
router.post('/find-partner', findPartner);
router.delete('/end-session', endSession);
router.get('/session/:sessionId/partner', getSessionPartner);
router.post('/add-friend', sendFriendRequest);

export default router;
