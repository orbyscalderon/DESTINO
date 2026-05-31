import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { perUserRateLimit } from '../middleware/userRateLimit.js';
import { getVideoUsageToday, findPartner, endSession, getOnlineCount, getSessionPartner, sendFriendRequest } from '../controllers/videoController.js';

const router = Router();

router.use(authMiddleware);

// Skip flooding: máx 10 skips/min sostenido, burst 12.
// Esto evita que un usuario malicioso vacíe la cola de matchmaking.
const findLimit = perUserRateLimit({ max: 12, perSec: 10 / 60, name: 'video-find' });
// add-friend: máx 30/hora (los usuarios reales no agregan 30 amigos en una hora)
const friendLimit = perUserRateLimit({ max: 5, perSec: 30 / 3600, name: 'video-friend' });

router.get('/usage/today', getVideoUsageToday);
router.get('/online-count', getOnlineCount);
router.post('/find-partner', findLimit, findPartner);
router.delete('/end-session', endSession);
router.get('/session/:sessionId/partner', getSessionPartner);
router.post('/add-friend', friendLimit, sendFriendRequest);

export default router;
